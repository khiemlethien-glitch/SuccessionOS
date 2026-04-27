import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EmployeeService, DeptTreeNode } from '../../core/services/data/employee.service';
import { KeyPositionService } from '../../core/services/data/key-position.service';
import { SuccessionService } from '../../core/services/data/succession.service';
import { AuthService } from '../../core/auth/auth.service';
import { Talent, SuccessionPlan, KeyPosition, Successor, ReadinessLevel } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TalentPreviewDrawerComponent } from '../../shared/components/talent-preview-drawer/talent-preview-drawer.component';

interface TreeNode {
  positionId: string;
  title: string;
  department: string;
  current_holder: string;
  current_holder_id: string | null;
  critical_level: string;
  successors: Successor[];  // from matching SuccessionPlan, or []
  children: TreeNode[];
  depth: number;
  isDeptGroup?: boolean;
}

interface PositionDensity {
  positionId:    string;
  positionTitle: string;
  department:    string;
  department_id: string;
  criticalLevel: string;
  currentHolder: string;
  readyNow:      number;
  ready1Year:    number;
  ready2Years:   number;
  total:         number;
  successors:    { talent_id: string; talent_name: string; readiness: string; priority: number; gap_score?: number }[];
  tone: 'ok' | 'warn' | 'low' | 'empty';
}

interface DeptDensity {
  department:    string;
  positions:     PositionDensity[];
  avgReadyNow:   number;
  avgTotal:      number;
  positionCount: number;
  emptyCount:    number;
}

@Component({
  selector: 'app-succession',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    NzTabsModule, NzTagModule, NzIconModule, NzCollapseModule,
    NzDrawerModule, NzButtonModule, NzSelectModule, NzTreeSelectModule,
    NzModalModule, NzTooltipModule,
    AvatarComponent, TalentPreviewDrawerComponent,
  ],
  templateUrl: './succession.component.html',
  styleUrl: './succession.component.scss',
  // nz-drawer moves its content to body's cdk-overlay-container on the
  // client, so the SSR DOM doesn't line up with the hydrated DOM (NG0500).
  // Skip hydration for this component — the client re-renders from scratch.
  host: { ngSkipHydration: 'true' },
})
export class SuccessionComponent implements OnInit {
  talents   = signal<Talent[]>([]);
  plans     = signal<SuccessionPlan[]>([]);
  positions = signal<KeyPosition[]>([]);

  // ─── Active tab: 0 = Succession Map ─────────────────────────
  activeTabIndex = signal(0);

  // ─── Succession Map view mode ─────────────────────────────────
  smvViewMode = signal<'tree' | 'org'>('org');

  // ─── Collapse state for both SMV views (collapsed = children hidden) ──
  collapsedNodes = signal<Set<string>>(new Set());

  toggleCollapse(positionId: string, ev?: Event): void {
    ev?.stopPropagation();
    const next = new Set(this.collapsedNodes());
    if (next.has(positionId)) next.delete(positionId);
    else next.add(positionId);
    this.collapsedNodes.set(next);
  }

  isCollapsed(positionId: string): boolean {
    return this.collapsedNodes().has(positionId);
  }

  /** Collapse all tree nodes at depth >= 2 on initial load.
   *  depth 0 = roots, depth 1 = direct reports → always visible.
   *  depth 2+ = collapsed by default; user clicks (+) to expand. */
  private initCollapseState(): void {
    const toCollapse = new Set<string>();
    const traverse = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.depth >= 2) toCollapse.add(n.positionId);
        if (n.children.length) traverse(n.children);
      }
    };
    traverse(this.treeRoots());
    if (toCollapse.size > 0) this.collapsedNodes.set(toCollapse);
  }

  // ─── Succession Map: role-based filter + collapse state ──────
  // Tree-level: which org-tree nodes are expanded (click to drill down)
  expandedNodes = signal<Set<string>>(new Set());
  // Successor-list-level: which position has its >3 successors expanded
  expandedPositions = signal<Set<string>>(new Set());
  private readonly COLLAPSE_THRESHOLD = 3;

  toggleNode(positionId: string): void {
    const next = new Set(this.expandedNodes());
    if (next.has(positionId)) next.delete(positionId);
    else next.add(positionId);
    this.expandedNodes.set(next);
  }

  isNodeExpanded(positionId: string): boolean {
    return this.expandedNodes().has(positionId);
  }

  criticalTone(level: string): string {
    const m: Record<string, string> = {
      'Critical': 'critical',
      'High':     'high',
      'Medium':   'medium',
      'Low':      'low',
    };
    return m[level] ?? 'medium';
  }

  // ── Position details drawer (opened via info button on tree-row)
  positionDrawerOpen = signal(false);
  drawerNode         = signal<TreeNode | null>(null);

  openPositionDrawer(node: TreeNode, ev?: Event): void {
    ev?.stopPropagation();
    this.drawerNode.set(node);
    this.positionDrawerOpen.set(true);
  }
  closePositionDrawer(): void {
    this.positionDrawerOpen.set(false);
    this.addSuccessorOpen.set(false);
    this.gapPanelSuccessor.set(null);
  }

  // ── Add successor inline form ───────────────────────────────────────────────
  addSuccessorOpen = signal(false);
  addDraft: { talent_id: string | null; readiness: ReadinessLevel } = {
    talent_id: null,
    readiness: 'Ready in 1 Year',
  };

  readonly readinessOptions: { value: ReadinessLevel; label: string }[] = [
    { value: 'Ready Now',        label: 'Sẵn sàng ngay' },
    { value: 'Ready in 1 Year',  label: '1–2 năm' },
    { value: 'Ready in 2 Years', label: '3–5 năm' },
  ];

  /** Talents not yet in the current drawer's successor list. */
  readonly availableTalents = computed(() => {
    const node = this.drawerNode();
    if (!node) return this.talents();
    const taken = new Set(node.successors.map(s => s.talent_id));
    return this.talents().filter(t => !taken.has(t.id));
  });

  openAddSuccessor(ev: Event): void {
    ev.stopPropagation();
    this.addDraft = { talent_id: null, readiness: 'Ready in 1 Year' };
    this.addSuccessorOpen.set(true);
  }

  /** Mở Pipeline Builder modal — thay thế navigate sang /positions */
  openPipelineBuilder(node: TreeNode, ev: Event): void {
    ev.stopPropagation();
    this.pbPositionId.set(node.positionId);
    this.pbPositionTitle.set(node.title);
    this.pbSearch.set(''); this.pbDeptFilter.set(null);
    this.pbTierFilter.set(null); this.pbAdded.set(new Map());
    this.pbOpen.set(true);
  }

  closePipelineBuilder(): void { this.pbOpen.set(false); this.pbSaving.set(false); }

  pbToggleAdd(talentId: string, name: string, readiness: ReadinessLevel): void {
    const next = new Map(this.pbAdded());
    const existing = next.get(talentId);
    if (existing?.readiness === readiness) { next.delete(talentId); }
    else { next.set(talentId, { name, readiness }); }
    this.pbAdded.set(next);
  }

  pbRemove(talentId: string): void {
    const next = new Map(this.pbAdded()); next.delete(talentId); this.pbAdded.set(next);
  }

  pbClearAll(): void { this.pbAdded.set(new Map()); }

  get pbAddedCount(): number { return this.pbAdded().size; }

  pbColCount(readiness: ReadinessLevel): number {
    let c = 0;
    for (const v of this.pbAdded().values()) if (v.readiness === readiness) c++;
    return c;
  }

  pbColEntries(readiness: ReadinessLevel): { talentId: string; name: string }[] {
    const out: { talentId: string; name: string }[] = [];
    for (const [id, v] of this.pbAdded()) if (v.readiness === readiness) out.push({ talentId: id, name: v.name });
    return out;
  }

  pbIsAdded(talentId: string, readiness: ReadinessLevel): boolean {
    return this.pbAdded().get(talentId)?.readiness === readiness;
  }

  async pbConfirm(): Promise<void> {
    const node = this.drawerNode();
    if (!node) return;
    this.pbSaving.set(true);
    const added = this.pbAdded();
    let priority = node.successors.length + 1;
    const newSuccessors: Successor[] = [];
    for (const [talentId, { name, readiness }] of added) {
      try {
        await this.successionSvc.upsertPlan({
          position_id: node.positionId, talent_id: talentId,
          readiness, priority, gap_score: 0,
        });
        newSuccessors.push({ talent_id: talentId, talent_name: name, readiness, priority, gap_score: 0 });
        priority++;
      } catch {}
    }
    if (newSuccessors.length) {
      this.drawerNode.set({ ...node, successors: [...node.successors, ...newSuccessors] });
      this.msg.success(`Đã thêm ${newSuccessors.length} người vào pipeline`);
    }
    this.pbSaving.set(false);
    this.closePipelineBuilder();
  }

  cancelAddSuccessor(): void { this.addSuccessorOpen.set(false); }

  async submitAddSuccessor(): Promise<void> {
    const node = this.drawerNode();
    if (!node || !this.addDraft.talent_id) {
      this.msg.warning('Vui lòng chọn nhân viên');
      return;
    }
    const talent = this.talents().find(t => t.id === this.addDraft.talent_id);
    const nextPriority = node.successors.length + 1;

    const result = await this.successionSvc.upsertPlan({
      position_id: node.positionId,
      talent_id:   this.addDraft.talent_id,
      readiness:   this.addDraft.readiness,
      priority:    nextPriority,
      gap_score:   0,
    });
    if (!result) { this.msg.error('Không thể thêm ứng viên kế thừa'); return; }

    const newSuccessor: Successor = {
      talent_id:   this.addDraft.talent_id,
      talent_name: talent?.full_name ?? '—',
      readiness:   this.addDraft.readiness,
      priority:    nextPriority,
      gap_score:   0,
    };
    this.drawerNode.set({ ...node, successors: [...node.successors, newSuccessor] });
    this.cancelAddSuccessor();
    this.msg.success(`Đã thêm ${talent?.full_name ?? ''} vào danh sách kế thừa`);
  }

  readonly isAdmin = computed(() => !this.isRestrictedView());

  /** Match current_holder_id against talents list. */
  drawerHolderTalent = computed<Talent | null>(() => {
    const node = this.drawerNode();
    if (!node?.current_holder_id) return null;
    return this.talents().find(t => t.id === node.current_holder_id) ?? null;
  });

  /** Full talent records for successors of drawer node. */
  drawerSuccessorTalents = computed<Array<Successor & { talent: Talent | null }>>(() => {
    const node = this.drawerNode();
    if (!node) return [];
    return node.successors.map(s => ({
      ...s,
      talent: this.talents().find(t => t.id === s.talent_id) ?? null,
    }));
  });

  currentUser = signal<{ role?: string; department?: string; talentId?: string; fullName?: string; name?: string } | null>(null);

  isRestrictedView = computed(() => this.currentUser()?.role === 'Line Manager');

  // ─── Density tab: configurable thresholds ─────────────────────────────────
  densityTargetReadyNow = signal(2);   // ngưỡng minimum Ready Now
  densityTargetTotal    = signal(7);   // ngưỡng minimum tổng ứng viên
  densityDeptFilter     = signal<string[]>([]);     // [] = all depts
  densityDeptNodes      = signal<DeptTreeNode[]>([]); // tree nodes for tree-select

  // Drill-down drawer
  densityDrawerOpen = signal(false);
  densityDrawerPos  = signal<PositionDensity | null>(null);

  openDensityDrawer(pos: PositionDensity, ev?: Event): void {
    ev?.stopPropagation();
    this.densityDrawerPos.set(pos);
    this.densityDrawerOpen.set(true);
  }
  closeDensityDrawer(): void { this.densityDrawerOpen.set(false); }

  // Computed: flat list with tone classification
  positionDensity = computed<PositionDensity[]>(() => {
    const positions = this.positions() as any[];
    const plans     = this.plans() as any[];
    const targetRN  = this.densityTargetReadyNow();
    const targetT   = this.densityTargetTotal();
    const planMap   = new Map(plans.map((p: any) => [p.position_id, p]));

    return positions.map((pos: any) => {
      const plan       = planMap.get(pos.id);
      const successors = (plan?.successors ?? []) as any[];
      const readyNow   = successors.filter((s: any) => s.readiness === 'Ready Now').length;
      const ready1Year = successors.filter((s: any) => s.readiness === 'Ready in 1 Year').length;
      const ready2Years = successors.filter((s: any) => s.readiness === 'Ready in 2 Years').length;
      const total      = successors.length;

      let tone: PositionDensity['tone'];
      if (total === 0)                                      tone = 'empty';
      else if (readyNow >= targetRN && total >= targetT)    tone = 'ok';
      else if (readyNow >= targetRN)                        tone = 'warn';
      else                                                  tone = 'low';

      return {
        positionId:    pos.id,
        positionTitle: pos.title,
        department:    pos.department ?? '—',
        department_id: pos.department_id ?? '',
        criticalLevel: pos.critical_level ?? '—',
        currentHolder: pos.current_holder ?? '—',
        readyNow, ready1Year, ready2Years, total, successors, tone,
      };
    });
  });

  // Grouped + sorted by dept
  deptDensity = computed<DeptDensity[]>(() => {
    const rows   = this.positionDensity();
    const filter = this.densityDeptFilter();
    const toneOrder: Record<string, number> = { empty: 0, low: 1, warn: 2, ok: 3 };
    const map = new Map<string, PositionDensity[]>();

    for (const row of rows) {
      const dept = row.department || 'Khác';
      if (filter.length > 0 && !filter.includes(row.department_id)) continue;
      const list = map.get(dept) ?? [];
      list.push(row);
      map.set(dept, list);
    }

    return [...map.entries()].map(([department, positions]) => {
      positions.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
      return {
        department,
        positions,
        avgReadyNow:   +(positions.reduce((s, p) => s + p.readyNow, 0) / positions.length).toFixed(1),
        avgTotal:      +(positions.reduce((s, p) => s + p.total, 0)   / positions.length).toFixed(1),
        positionCount: positions.length,
        emptyCount:    positions.filter(p => p.total === 0).length,
      };
    }).sort((a, b) => b.emptyCount - a.emptyCount || b.positionCount - a.positionCount);
  });

  // KPI summary
  densitySummary = computed(() => {
    const rows     = this.positionDensity();
    const targetT  = this.densityTargetTotal();
    const ok       = rows.filter(r => r.tone === 'ok').length;
    const empty    = rows.filter(r => r.total === 0).length;
    const lowWarn  = rows.filter(r => r.tone === 'low' || r.tone === 'warn').length;
    const totalPos = rows.length;
    const benchStrength = totalPos > 0
      ? Math.round(rows.reduce((s, r) => s + Math.min(r.total / Math.max(targetT, 1), 1), 0) / totalPos * 100)
      : 0;
    return { totalPos, ok, lowWarn, empty, benchStrength };
  });

  // Readiness label helper for density drawer
  densityReadinessLabel(r: string): string {
    if (r === 'Ready Now')       return 'Sẵn sàng ngay';
    if (r === 'Ready in 1 Year') return '1–2 năm';
    return '3–5 năm';
  }

  densityReadinessClass(r: string): string {
    if (r === 'Ready Now')       return 'dr-rn';
    if (r === 'Ready in 1 Year') return 'dr-1y';
    return 'dr-2y';
  }

  // Helper: cap a percentage value at 100
  capAt100(val: number): number { return Math.min(val, 100); }

  /** Build tree from flat positions[] via parentId + attach successors from matching plan.
   *
   *  Fallback khi parent_position_id chưa được điền (tất cả NULL):
   *  tự động nhóm theo department — mỗi dept trở thành virtual root node
   *  để succession map không bị flat hoàn toàn.
   */
  private buildTree(positions: KeyPosition[], plans: SuccessionPlan[]): TreeNode[] {
    const planByPos = new Map(plans.map(p => [p.position_id, p]));
    const nodeById  = new Map<string, TreeNode>();
    positions.forEach(p => {
      nodeById.set(p.id, {
        positionId:        p.id,
        title:             p.title,
        department:        p.department,
        current_holder:    p.current_holder,
        current_holder_id: (p as any).current_holder_id ?? null,
        critical_level:    p.critical_level,
        successors:        planByPos.get(p.id)?.successors ?? [],
        children:          [],
        depth:             0,
      });
    });

    // ── Thử build cây thật từ parent_position_id ──────────────────────
    const roots: TreeNode[] = [];
    let linkedCount = 0;
    positions.forEach(p => {
      const node = nodeById.get(p.id)!;
      if (p.parent_id && nodeById.has(p.parent_id)) {
        nodeById.get(p.parent_id)!.children.push(node);
        linkedCount++;
      } else {
        roots.push(node);
      }
    });

    // ── Fallback: nếu không có link nào → nhóm theo department ───────
    // (xảy ra khi tất cả parent_position_id = NULL)
    if (linkedCount === 0 && positions.length > 1) {
      return this.buildDeptGroupTree(positions, nodeById, planByPos);
    }

    // Propagate depth
    const setDepth = (n: TreeNode, d: number) => {
      n.depth = d;
      n.children.forEach(c => setDepth(c, d + 1));
    };
    roots.forEach(r => setDepth(r, 0));
    return roots;
  }

  /** Fallback: tạo virtual root node cho mỗi department, position là children.
   *  Đây là layout tạm dùng đến khi migration SQL điền parent_position_id xong. */
  private buildDeptGroupTree(
    positions: KeyPosition[],
    nodeById: Map<string, TreeNode>,
    planByPos: Map<string, SuccessionPlan>,
  ): TreeNode[] {
    const deptMap = new Map<string, TreeNode>();

    positions.forEach(p => {
      const deptKey = p.department || 'Khác';

      // Tạo virtual root node cho dept nếu chưa có
      if (!deptMap.has(deptKey)) {
        deptMap.set(deptKey, {
          positionId:        `__dept__${deptKey}`,
          title:             deptKey,
          department:        deptKey,
          current_holder:    '',
          current_holder_id: null,
          critical_level:    'Medium',
          successors:        [],
          children:          [],
          depth:             0,
          isDeptGroup:       true,
        });
      }

      const child = nodeById.get(p.id)!;
      child.depth = 1;
      deptMap.get(deptKey)!.children.push(child);
    });

    // Sort dept nodes by number of positions desc (busiest dept first)
    return [...deptMap.values()].sort((a, b) => b.children.length - a.children.length);
  }

  /**
   * LM view: chỉ hiện đúng 2 node:
   *  1. Vị trí của LM (current_holder_id === talentId)
   *  2. Vị trí trực tiếp trên (parent) — để LM biết mình báo cáo cho ai
   * Không hiện thêm nhánh nào khác, không hiện children của own position.
   */
  private buildLMView(roots: TreeNode[], talentId?: string): TreeNode[] {
    if (!talentId) return [];

    // Tìm node theo predicate (đệ quy toàn cây)
    const findNode = (nodes: TreeNode[], pred: (n: TreeNode) => boolean): TreeNode | null => {
      for (const n of nodes) {
        if (pred(n)) return n;
        const f = findNode(n.children, pred);
        if (f) return f;
      }
      return null;
    };

    // Tìm node cha trực tiếp của childId
    const findParent = (nodes: TreeNode[], childId: string): TreeNode | null => {
      for (const n of nodes) {
        if (n.children.some(c => c.positionId === childId)) return n;
        const f = findParent(n.children, childId);
        if (f) return f;
      }
      return null;
    };

    // Own node: vị trí LM đang giữ (current_holder)
    const own = findNode(roots, n => n.current_holder_id === talentId);
    if (!own) return [];

    // Own leaf: không hiện children của vị trí LM (đang giữ vị trí này, không cần xem bên dưới)
    const ownLeaf: TreeNode = { ...own, children: [], depth: 1 };

    // Parent: vị trí trực tiếp trên LM
    const parent = findParent(roots, own.positionId);
    if (!parent) {
      // LM đang là root (không có cha) → chỉ hiện vị trí của mình
      return [{ ...ownLeaf, depth: 0 }];
    }

    // Trả về: [parent → [ownLeaf]] — bỏ hết siblings, bỏ grandparent trở lên
    return [{ ...parent, children: [ownLeaf], depth: 0 }];
  }

  treeRoots = computed<TreeNode[]>(() => {
    const positions = this.positions();
    const plans     = this.plans();
    if (!positions.length) return [];
    const full = this.buildTree(positions, plans);

    const user = this.currentUser();
    if (!user || user.role !== 'Line Manager') return full;

    return this.buildLMView(full, user.talentId);
  });

  /** Flat count of all visible positions for banner display */
  private countNodes(nodes: TreeNode[]): number {
    return nodes.reduce((s, n) => s + 1 + this.countNodes(n.children), 0);
  }

  viewModeBanner = computed(() => {
    const user = this.currentUser();
    const count = this.countNodes(this.treeRoots());
    if (!user) return null;
    if (this.isRestrictedView()) {
      return {
        icon: 'team',
        title: `Team của bạn · ${user.department ?? '—'}`,
        sub: `${count} vị trí then chốt thuộc phạm vi của bạn`,
        tone: 'restricted',
      };
    }
    return {
      icon: 'cluster',
      title: `Toàn bộ tổ chức`,
      sub: `${count} vị trí then chốt đã định nghĩa`,
      tone: 'full',
    };
  });

  toggleExpand(positionId: string): void {
    const next = new Set(this.expandedPositions());
    if (next.has(positionId)) next.delete(positionId);
    else next.add(positionId);
    this.expandedPositions.set(next);
  }

  isExpanded(positionId: string): boolean {
    return this.expandedPositions().has(positionId);
  }

  successorsToShow(node: TreeNode): Successor[] {
    if (node.successors.length <= this.COLLAPSE_THRESHOLD) return node.successors;
    if (this.isExpanded(node.positionId)) return node.successors;
    return node.successors.slice(0, this.COLLAPSE_THRESHOLD);
  }

  hiddenCount(node: TreeNode): number {
    if (node.successors.length <= this.COLLAPSE_THRESHOLD) return 0;
    if (this.isExpanded(node.positionId)) return 0;
    return node.successors.length - this.COLLAPSE_THRESHOLD;
  }

  /** Count how many positions have zero successors (for dept-group header warning). */
  countEmpty(positions: TreeNode[]): number {
    return positions.filter(c => c.successors.length === 0).length;
  }

  /** Flatten the tree into dept → positions groups for the SMV card-grid view.
   *  Works for both real-hierarchy trees and the dept-group fallback.
   *  isDeptGroup virtual nodes are skipped; their children are collected.
   */
  smvDeptGroups = computed<{ dept: string; positions: TreeNode[] }[]>(() => {
    const roots = this.treeRoots();
    if (!roots.length) return [];

    const flat: TreeNode[] = [];
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (!n.isDeptGroup) flat.push(n);
        if (n.children.length) collect(n.children);
      }
    };
    collect(roots);

    const map = new Map<string, TreeNode[]>();
    for (const pos of flat) {
      const dept = pos.department || 'Khác';
      const list = map.get(dept) ?? [];
      list.push(pos);
      map.set(dept, list);
    }

    return [...map.entries()]
      .map(([dept, positions]) => ({ dept, positions }))
      .sort((a, b) => b.positions.length - a.positions.length);
  });

  private employeeSvc = inject(EmployeeService);
  private positionSvc = inject(KeyPositionService);
  private successionSvc = inject(SuccessionService);

  constructor(
    private msg: NzMessageService,
    private auth: AuthService,
    private router: Router,
    private location: Location,
    private route: ActivatedRoute,
  ) {}

  /** Tìm TreeNode theo positionId trong cây (đệ quy). */
  private findNode(nodes: TreeNode[], id: string): TreeNode | null {
    for (const n of nodes) {
      if (n.positionId === id) return n;
      const found = this.findNode(n.children, id);
      if (found) return found;
    }
    return null;
  }

  // ── Talent preview drawer (chạm sidebar, URL sync)
  talentPreviewId  = signal<string | null>(null);
  talentPreviewOpen = signal(false);
  private savedUrl = '';

  openTalentPreview(id: string, ev?: Event): void {
    ev?.stopPropagation();
    if (!id) return;
    // Remember URL once (first open); for sibling switches, keep the original
    if (!this.talentPreviewOpen()) this.savedUrl = this.location.path() || this.router.url;
    this.location.go(`/talent/${id}`);
    this.talentPreviewId.set(id);
    this.talentPreviewOpen.set(true);
  }

  closeTalentPreview(): void {
    if (this.savedUrl) this.location.go(this.savedUrl);
    this.savedUrl = '';
    this.talentPreviewOpen.set(false);
    this.talentPreviewId.set(null);
  }

  /** Switch which talent the preview drawer shows (e.g. click a mentor/mentee inside). */
  switchPreview(id: string): void {
    if (!id) return;
    this.location.go(`/talent/${id}`);
    this.talentPreviewId.set(id);
  }

  /** User wants the real full profile: close preview, real navigation. */
  openFullTalent(id: string): void {
    this.savedUrl = '';
    this.talentPreviewOpen.set(false);
    this.talentPreviewId.set(null);
    this.router.navigate(['/talent', id]);
  }

  /** Legacy entry point — opens preview while keeping position drawer open. */
  goToTalent(id: string): void {
    this.openTalentPreview(id);
  }

  async ngOnInit(): Promise<void> {
    const authUser = this.auth.currentUser();
    // Map auth profile → local currentUser (succession component uses name-based dept match)
    this.currentUser.set({
      role:       authUser?.role,
      department: authUser?.department_name ?? undefined,
      talentId:   authUser?.employee_id     ?? undefined,
      fullName:   authUser?.full_name,
      name:       authUser?.full_name,
    });

    // Line Manager: pre-filter Density tab to own department
    if (authUser?.role === 'Line Manager' && authUser.department_id) {
      this.densityDeptFilter.set([authUser.department_id]);
    }

    // Nine-box dùng v_nine_box view (có cột `box` 1-9 compute sẵn) — wire vào talents.
    const nineBox = await this.successionSvc.getNineBox();
    this.talents.set(nineBox as any);
    // Plans + positions: RLS chưa mở, tolerate lỗi
    try {
      const plans = await this.successionSvc.getPlans();
      this.plans.set(plans as any);
    } catch {}
    try {
      const positions = await this.positionSvc.getAll();
      this.positions.set(positions as any);
      // Default-collapse all nodes at depth >= 2 (user clicks + to drill down)
      this.initCollapseState();
    } catch {}
    // Dept tree for density filter tree-select
    try {
      const nodes = await this.employeeSvc.getDeptTree();
      this.densityDeptNodes.set(nodes);
    } catch {}

    // ── Deep-link: ?tab=map&positionId=xxx (từ trang Positions) ──
    const params = this.route.snapshot.queryParamMap;
    const tab        = params.get('tab');
    const positionId = params.get('positionId');

    if (tab === 'map') {
      this.activeTabIndex.set(0);   // chuyển sang tab Succession Map

      if (positionId) {
        // Tìm node trong cây đã build và mở drawer
        const node = this.findNode(this.treeRoots(), positionId);
        if (node) {
          // Expand tất cả ancestor để node hiển thị trên màn hình
          this.expandedNodes.update(s => {
            const next = new Set(s);
            next.add(positionId);
            return next;
          });
          this.openPositionDrawer(node);

          // Scroll đến node sau khi Angular render xong
          setTimeout(() => {
            const el = document.getElementById(`tree-node-${positionId}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    }
  }

  // ─── Hero stats ───────────────────────────────────────────────
  readonly totalPositions = computed(() => this.positions().length);
  readonly positionsWithSuccessors = computed(() => this.positionDensity().filter(p => p.total > 0).length);
  readonly positionsEmpty = computed(() => this.positionDensity().filter(p => p.total === 0).length);

  // ─── Misc ──────────────────────────────────────────
  readinessLabel(r: string): string {
    return r === 'Ready Now' ? 'Sẵn sàng ngay' : r === 'Ready in 1 Year' ? '1–2 năm' : '3–5 năm';
  }
  readinessColor(r: string): string {
    return r === 'Ready Now' ? 'green' : r === 'Ready in 1 Year' ? 'blue' : 'orange';
  }
  readinessTone(r: string): 'green' | 'amber' | 'orange' {
    return r === 'Ready Now' ? 'green' : r === 'Ready in 1 Year' ? 'amber' : 'orange';
  }
  lastName(fullName: string): string {
    return fullName.trim().split(/\s+/).pop() ?? fullName;
  }

  // ── Gap Panel (inline trong drawer) ────────────────────────────────────
  gapPanelSuccessor = signal<(Successor & { talent: Talent | null }) | null>(null);

  openGapPanel(s: Successor & { talent: Talent | null }, ev: Event): void {
    ev.stopPropagation();
    this.gapPanelSuccessor.set(s);
  }

  closeGapPanel(): void { this.gapPanelSuccessor.set(null); }

  gapFitScore(gapScore: number | undefined | null): number {
    if (gapScore == null) return 50;
    return Math.max(0, Math.min(100, 100 - gapScore));
  }

  // ── Pipeline Health stats (from drawerNode successors) ─────────────────
  private readonly BENCH_TARGET = 2;

  drawerReadyNow = computed(() =>
    this.drawerSuccessorTalents().filter(s => s.readiness === 'Ready Now').length);
  drawerReady1Y = computed(() =>
    this.drawerSuccessorTalents().filter(s => s.readiness === 'Ready in 1 Year').length);
  drawerReady2Y = computed(() =>
    this.drawerSuccessorTalents().filter(s => s.readiness === 'Ready in 2 Years').length);

  drawerReadyNowPct = computed(() =>
    Math.min(100, this.drawerReadyNow() / Math.max(this.BENCH_TARGET, 1) * 100));
  drawerReady1YPct  = computed(() =>
    Math.min(100, this.drawerReady1Y()  / Math.max(this.BENCH_TARGET, 1) * 100));
  drawerReady2YPct  = computed(() =>
    Math.min(100, this.drawerReady2Y()  / Math.max(this.BENCH_TARGET, 1) * 100));

  drawerAvgGap = computed<string>(() => {
    const succs = this.drawerSuccessorTalents();
    if (!succs.length) return '—';
    const with$ = succs.filter(s => s.gap_score != null);
    if (!with$.length) return '—';
    return (with$.reduce((s, c) => s + (c.gap_score ?? 0), 0) / with$.length).toFixed(0);
  });

  drawerCoverageLabel = computed<string>(() => {
    const rn    = this.drawerReadyNow();
    const total = this.drawerSuccessorTalents().length;
    if (total === 0) return 'Trống';
    if (rn >= 2)     return 'Tốt';
    if (rn === 1)    return 'Trung bình';
    return 'Yếu';
  });

  drawerCoverageTone = computed<string>(() => {
    const l = this.drawerCoverageLabel();
    if (l === 'Tốt')        return 'cov-ok';
    if (l === 'Trung bình') return 'cov-warn';
    if (l === 'Trống')      return 'cov-empty';
    return 'cov-low';
  });

  // ── Pipeline Builder signals ────────────────────────────────────────────
  pbOpen          = signal(false);
  pbPositionId    = signal<string | null>(null);
  pbPositionTitle = signal('');
  pbSearch        = signal('');
  pbDeptFilter    = signal<string | null>(null);
  pbTierFilter    = signal<string | null>(null);
  pbAdded         = signal<Map<string, { name: string; readiness: ReadinessLevel }>>(new Map());
  pbSaving        = signal(false);

  readonly pbColumns = [
    { key: 'rn', readiness: 'Ready Now'        as ReadinessLevel, label: 'Sẵn sàng ngay', tone: 'green'  },
    { key: 'r1', readiness: 'Ready in 1 Year'  as ReadinessLevel, label: '1–2 năm',        tone: 'amber'  },
    { key: 'r2', readiness: 'Ready in 2 Years' as ReadinessLevel, label: '3–5 năm',        tone: 'orange' },
  ];

  pbAvailableTalents = computed<Talent[]>(() => {
    const node   = this.drawerNode();
    const taken  = new Set(node?.successors.map(s => s.talent_id) ?? []);
    const added  = this.pbAdded();
    const search = this.pbSearch().toLowerCase().trim();
    const dept   = this.pbDeptFilter();
    const tier   = this.pbTierFilter();
    return this.talents().filter(t => {
      if (taken.has(t.id) || added.has(t.id)) return false;
      if (search && !t.full_name.toLowerCase().includes(search)) return false;
      if (dept && t.department !== dept) return false;
      if (tier && (t as any).talent_tier !== tier) return false;
      return true;
    });
  });

  pbDeptOptions = computed<string[]>(() => {
    const depts = new Set(this.talents().map(t => t.department).filter(Boolean) as string[]);
    return [...depts].sort((a, b) => a.localeCompare(b, 'vi'));
  });

  tierLabel(t: Talent): string { return (t as any).talent_tier ?? '—'; }
  tierTone(t: Talent): string {
    const tier = (t as any).talent_tier;
    if (tier === 'Core')      return 'core';
    if (tier === 'Potential') return 'potential';
    if (tier === 'Successor') return 'successor';
    return 'none';
  }

  // ── Bench Strength ─────────────────────────────────────────────────────────
  benchScore = computed(() => {
    const t = this.BENCH_TARGET;
    return Math.round(
      Math.min(this.drawerReadyNow() / t, 1) * 40 +
      Math.min(this.drawerReady1Y()  / t, 1) * 35 +
      Math.min(this.drawerReady2Y()  / t, 1) * 25
    );
  });

  benchDonutGradient = computed(() => {
    const total = this.drawerSuccessorTalents().length;
    if (total === 0) return 'conic-gradient(#e5e7eb 0% 100%)';
    const pRN = this.drawerReadyNow() / total * 100;
    const pR1 = pRN + this.drawerReady1Y() / total * 100;
    const pR2 = pR1 + this.drawerReady2Y() / total * 100;
    return `conic-gradient(#10b981 0% ${pRN}%, #f59e0b ${pRN}% ${pR1}%, #f97316 ${pR1}% ${pR2}%, #e5e7eb ${pR2}% 100%)`;
  });

  // Candidate aggregate stats
  drawerCandidateDepts = computed(() => {
    const depts = new Set(
      this.drawerSuccessorTalents()
        .map(s => s.talent?.department)
        .filter((d): d is string => !!d)
    );
    return depts.size;
  });

  drawerHPCount = computed(() =>
    this.drawerSuccessorTalents().filter(s => (s.talent?.performance_score ?? 0) >= 7).length
  );
  drawerHNCount = computed(() =>
    this.drawerSuccessorTalents().filter(s => (s.talent?.potential_score ?? 0) >= 7).length
  );

  // ── Risk Dashboard ──────────────────────────────────────────────────────────
  drawerHolderRisk = computed<'high' | 'medium' | 'low'>(() => {
    const t  = this.drawerHolderTalent();
    const rn = this.drawerReadyNow();
    if (!t) return rn === 0 ? 'medium' : 'low';
    const rs = t.risk_score ?? 0;
    if (rs >= 70 || (rn === 0 && rs >= 40)) return 'high';
    if (rs >= 40 || rn === 0)               return 'medium';
    return 'low';
  });

  drawerHolderRiskLabel = computed(() => {
    const r = this.drawerHolderRisk();
    return r === 'high' ? 'CAO' : r === 'medium' ? 'TRUNG BÌNH' : 'THẤP';
  });

  drawerTransferReadiness = computed<{ label: string; tone: string }>(() => {
    const rn = this.drawerReadyNow();
    if (rn >= 2) return { label: 'Có thể chuyển giao ngay', tone: 'ok' };
    if (rn === 1) return { label: 'Có thể chuyển giao, có rủi ro', tone: 'warn' };
    return { label: 'Chưa thể chuyển giao', tone: 'danger' };
  });
}
