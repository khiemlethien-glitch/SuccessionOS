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
  smvViewMode = signal<'tree' | 'org'>('tree');

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

  /** Điều hướng sang /positions với modal "Tìm người kế thừa" tự mở cho vị trí đã chọn */
  navigateToFindSuccessor(positionId: string, ev: Event): void {
    ev.stopPropagation();
    this.router.navigate(['/positions'], {
      queryParams: { posId: positionId, openFinder: 'true' }
    });
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

  /** Prune tree for Line Manager: keep only nodes matching filter + ancestors of matches */
  private pruneTree(nodes: TreeNode[], match: (n: TreeNode) => boolean): TreeNode[] {
    const result: TreeNode[] = [];
    for (const n of nodes) {
      const prunedChildren = this.pruneTree(n.children, match);
      const selfMatch = match(n);
      if (selfMatch || prunedChildren.length > 0) {
        result.push({ ...n, children: prunedChildren });
      }
    }
    return result;
  }

  treeRoots = computed<TreeNode[]>(() => {
    const positions = this.positions();
    const plans     = this.plans();
    if (!positions.length) return [];
    const full = this.buildTree(positions, plans);

    const user = this.currentUser();
    if (!user || user.role !== 'Line Manager') return full;

    const match = (n: TreeNode) =>
      (user.department ? n.department === user.department : false) ||
      (user.talentId   ? n.successors.some(s => s.talent_id === user.talentId) : false);
    return this.pruneTree(full, match);
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
    this.currentUser.set(this.auth.currentUser() as any);
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
}
