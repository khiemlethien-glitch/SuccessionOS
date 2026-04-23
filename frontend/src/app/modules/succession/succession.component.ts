import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EmployeeService } from '../../core/services/data/employee.service';
import { KeyPositionService } from '../../core/services/data/key-position.service';
import { SuccessionService } from '../../core/services/data/succession.service';
import { AuthService } from '../../core/auth/auth.service';
import { Talent, SuccessionPlan, KeyPosition, Successor, ReadinessLevel } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TalentPreviewDrawerComponent } from '../../shared/components/talent-preview-drawer/talent-preview-drawer.component';

interface BoxDef {
  row: number;      // 1=low perf, 3=high perf
  col: number;      // 1=low pot,  3=high pot
  label: string;
  sublabel: string;
  tone: 'star' | 'great' | 'core' | 'risk' | 'watch' | 'low';
  num: number;
}

const DEFAULT_PERF: [number, number] = [70, 85];
const DEFAULT_POT:  [number, number] = [70, 85];

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
}

interface PositionDensity {
  positionId:    string;
  positionTitle: string;
  department:    string;
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
    CommonModule, FormsModule,
    NzTabsModule, NzTagModule, NzIconModule, NzCollapseModule,
    NzDrawerModule, NzSliderModule, NzButtonModule, NzSelectModule,
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

  // ─── Scale thresholds ──────────────────────────────
  // [lowMidCutoff, midHighCutoff]  e.g. [70, 85] means:
  // score < 70 → tier 1, 70-84 → tier 2, ≥85 → tier 3
  perfThresholds = signal<[number, number]>([...DEFAULT_PERF]);
  potThresholds  = signal<[number, number]>([...DEFAULT_POT]);

  // Draft values used inside modal (committed on Apply)
  perfDraft = signal<[number, number]>([...DEFAULT_PERF]);
  potDraft  = signal<[number, number]>([...DEFAULT_POT]);

  showScaleModal = signal(false);

  // ─── Active tab: 0 = 9-Box, 1 = Succession Map ───────────────
  activeTabIndex = signal(0);

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
  densityDeptFilter     = signal('');  // '' = all depts
  densityDeptOptions    = signal<string[]>([]);   // full dept list from API

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
        positionId: pos.id,
        positionTitle: pos.title,
        department:    pos.department ?? '—',
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
      if (filter && dept !== filter) continue;
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
        } as any);
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

  // 9-box definitions — row=performance, col=potential
  boxes: BoxDef[] = [
    { row:3, col:1, num:7, label:'Ngôi sao tiềm ẩn',   sublabel:'Hiệu suất cao · Tiềm năng thấp', tone:'risk'  },
    { row:3, col:2, num:8, label:'Nhân tài nổi bật',   sublabel:'Hiệu suất cao · Tiềm năng TB',   tone:'great' },
    { row:3, col:3, num:9, label:'Ngôi sao tương lai', sublabel:'Hiệu suất cao · Tiềm năng cao',   tone:'star'  },
    { row:2, col:1, num:4, label:'Nhân viên vững',     sublabel:'Hiệu suất TB · Tiềm năng thấp',  tone:'watch' },
    { row:2, col:2, num:5, label:'Nhân tài cốt lõi',   sublabel:'Hiệu suất TB · Tiềm năng TB',    tone:'core'  },
    { row:2, col:3, num:6, label:'Lãnh đạo tiềm năng', sublabel:'Hiệu suất TB · Tiềm năng cao',   tone:'great' },
    { row:1, col:1, num:1, label:'Cần cải thiện',      sublabel:'Hiệu suất thấp · Tiềm năng thấp',tone:'low'   },
    { row:1, col:2, num:2, label:'Tiềm năng ẩn',       sublabel:'Hiệu suất thấp · Tiềm năng TB',  tone:'watch' },
    { row:1, col:3, num:3, label:'Enigma',             sublabel:'Hiệu suất thấp · Tiềm năng cao', tone:'risk'  },
  ];

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
    // Dept list for density filter dropdown
    try {
      const depts = await this.employeeSvc.getDeptOptions();
      this.densityDeptOptions.set(depts.map(d => d.name).sort((a, b) => a.localeCompare(b, 'vi')));
    } catch {}

    // ── Deep-link: ?tab=map&positionId=xxx (từ trang Positions) ──
    const params = this.route.snapshot.queryParamMap;
    const tab        = params.get('tab');
    const positionId = params.get('positionId');

    if (tab === 'map') {
      this.activeTabIndex.set(1);   // chuyển sang tab Succession Map

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

  // ─── Scoring ───────────────────────────────────────
  private tier(score: number, thresholds: [number, number]): 1 | 2 | 3 {
    if (score >= thresholds[1]) return 3;
    if (score >= thresholds[0]) return 2;
    return 1;
  }

  talentsInBox(b: BoxDef): Talent[] {
    // Nine-box dùng field `box` (1-9) từ view v_nine_box thay vì compute từ thresholds
    return this.talents().filter(t => (t as any).box === b.num);
  }

  readonly totalInGrid = computed(() => this.talents().length);
  readonly starCount = computed(() => this.talents().filter(t =>
    this.tier(t.performance_score ?? 0, this.perfThresholds()) === 3 &&
    this.tier(t.potential_score ?? 0,  this.potThresholds())  === 3
  ).length);
  readonly needsActionCount = computed(() => this.talents().filter(t =>
    this.tier(t.performance_score ?? 0, this.perfThresholds()) === 1
  ).length);

  // ─── Preview counts for each tier while editing thresholds ────
  readonly previewPerf = computed(() => {
    const [lo, hi] = this.perfDraft();
    const list = this.talents();
    return {
      low:  list.filter(t => (t.performance_score ?? 0) < lo).length,
      mid:  list.filter(t => (t.performance_score ?? 0) >= lo && (t.performance_score ?? 0) < hi).length,
      high: list.filter(t => (t.performance_score ?? 0) >= hi).length,
    };
  });
  readonly previewPot = computed(() => {
    const [lo, hi] = this.potDraft();
    const list = this.talents();
    return {
      low:  list.filter(t => (t.potential_score ?? 0) < lo).length,
      mid:  list.filter(t => (t.potential_score ?? 0) >= lo && (t.potential_score ?? 0) < hi).length,
      high: list.filter(t => (t.potential_score ?? 0) >= hi).length,
    };
  });

  // ─── Modal actions ─────────────────────────────────
  openScaleModal(): void {
    this.perfDraft.set([...this.perfThresholds()]);
    this.potDraft.set([...this.potThresholds()]);
    this.showScaleModal.set(true);
  }

  closeScaleModal(): void {
    this.showScaleModal.set(false);
  }

  applyScale(): void {
    this.perfThresholds.set([...this.perfDraft()]);
    this.potThresholds.set([...this.potDraft()]);
    this.closeScaleModal();
    this.msg.success('Đã cập nhật thang đo 9-Box');
  }

  resetScale(): void {
    this.perfDraft.set([...DEFAULT_PERF]);
    this.potDraft.set([...DEFAULT_POT]);
  }

  setPerfDraft(value: number[] | null): void {
    if (value && value.length === 2) this.perfDraft.set([value[0], value[1]]);
  }
  setPotDraft(value: number[] | null): void {
    if (value && value.length === 2) this.potDraft.set([value[0], value[1]]);
  }

  isDefault = computed(() => {
    const p = this.perfThresholds();
    const q = this.potThresholds();
    return p[0] === DEFAULT_PERF[0] && p[1] === DEFAULT_PERF[1]
        && q[0] === DEFAULT_POT[0]  && q[1] === DEFAULT_POT[1];
  });

  // ─── Box detail modal ──────────────────────────────
  activeBox     = signal<BoxDef | null>(null);
  boxModalOpen  = signal(false);

  /** Boxes where we highlight TOP performers */
  private TOP_BOXES    = new Set([5, 6, 7]);
  /** Boxes where we highlight BOTTOM performers (needs attention) */
  private BOTTOM_BOXES = new Set([1, 2, 4]);
  /** Special hall-of-fame box */
  private STAR_BOX     = 9;

  isStarBox(num: number)   { return num === this.STAR_BOX; }
  isTopBox(num: number)    { return this.TOP_BOXES.has(num); }
  isBottomBox(num: number) { return this.BOTTOM_BOXES.has(num); }

  private combined(t: Talent) {
    return ((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2;
  }

  /** Sorted talents for the active box modal */
  readonly boxTalentsSorted = computed<Talent[]>(() => {
    const box = this.activeBox();
    if (!box) return [];
    const list = this.talents().filter(t => (t as any).box === box.num);
    if (this.isBottomBox(box.num)) {
      return [...list].sort((a, b) => this.combined(a) - this.combined(b));
    }
    return [...list].sort((a, b) => this.combined(b) - this.combined(a));
  });

  /** Top 3 (or bottom 3 for low boxes) */
  readonly boxHighlighted = computed<Talent[]>(() => this.boxTalentsSorted().slice(0, 3));

  /** Podium order: [2nd, 1st, 3rd] for the star box visual */
  readonly podiumOrder = computed<(Talent | null)[]>(() => {
    const h = this.boxHighlighted();
    return [h[1] ?? null, h[0] ?? null, h[2] ?? null];
  });

  openBoxModal(box: BoxDef, ev?: Event): void {
    ev?.stopPropagation();
    this.activeBox.set(box);
    this.boxModalOpen.set(true);
  }

  closeBoxModal(): void {
    this.boxModalOpen.set(false);
    this.activeBox.set(null);
  }

  openTalentFromModal(id: string): void {
    this.closeBoxModal();
    this.openTalentPreview(id);
  }

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
