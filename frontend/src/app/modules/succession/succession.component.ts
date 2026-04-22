import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Talent, TalentListResponse, SuccessionPlan, SuccessionPlanListResponse,
  KeyPosition, PositionListResponse, Successor } from '../../core/models/models';
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
  currentHolder: string;
  criticalLevel: string;
  successors: Successor[];  // from matching SuccessionPlan, or []
  children: TreeNode[];
  depth: number;
}

@Component({
  selector: 'app-succession',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzTabsModule, NzTagModule, NzIconModule, NzCollapseModule,
    NzDrawerModule, NzSliderModule, NzButtonModule,
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
  closePositionDrawer(): void { this.positionDrawerOpen.set(false); }

  /** Match currentHolder string (plain name) against talents list if possible. */
  drawerHolderTalent = computed<Talent | null>(() => {
    const node = this.drawerNode();
    if (!node?.currentHolder) return null;
    return this.talents().find(t => t.fullName === node.currentHolder) ?? null;
  });

  /** Full talent records for successors of drawer node. */
  drawerSuccessorTalents = computed<Array<Successor & { talent: Talent | null }>>(() => {
    const node = this.drawerNode();
    if (!node) return [];
    return node.successors.map(s => ({
      ...s,
      talent: this.talents().find(t => t.id === s.talentId) ?? null,
    }));
  });

  currentUser = signal<{ role?: string; department?: string; talentId?: string; fullName?: string; name?: string } | null>(null);

  isRestrictedView = computed(() => this.currentUser()?.role === 'Line Manager');

  /** Build tree from flat positions[] via parentId + attach successors from matching plan */
  private buildTree(positions: KeyPosition[], plans: SuccessionPlan[]): TreeNode[] {
    const planByPos = new Map(plans.map(p => [p.positionId, p]));
    const nodeById  = new Map<string, TreeNode>();
    positions.forEach(p => {
      nodeById.set(p.id, {
        positionId:    p.id,
        title:         p.title,
        department:    p.department,
        currentHolder: p.currentHolder,
        criticalLevel: p.criticalLevel,
        successors:    planByPos.get(p.id)?.successors ?? [],
        children:      [],
        depth:         0,
      });
    });
    const roots: TreeNode[] = [];
    positions.forEach(p => {
      const node = nodeById.get(p.id)!;
      if (p.parentId && nodeById.has(p.parentId)) {
        nodeById.get(p.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    // Propagate depth
    const setDepth = (n: TreeNode, d: number) => {
      n.depth = d;
      n.children.forEach(c => setDepth(c, d + 1));
    };
    roots.forEach(r => setDepth(r, 0));
    return roots;
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
      (user.talentId   ? n.successors.some(s => s.talentId === user.talentId) : false);
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

  constructor(
    private api: ApiService,
    private msg: NzMessageService,
    private auth: AuthService,
    private router: Router,
    private location: Location,
  ) {}

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

  ngOnInit(): void {
    this.currentUser.set(this.auth.getCurrentUser());
    this.api.get<TalentListResponse>('employees','talents').subscribe(r => this.talents.set(r.data));
    this.api.get<SuccessionPlanListResponse>('succession/plans','succession-plans').subscribe(r => this.plans.set(r.data));
    this.api.get<PositionListResponse>('key-positions','positions').subscribe(r => this.positions.set(r.data));
  }

  // ─── Scoring ───────────────────────────────────────
  private tier(score: number, thresholds: [number, number]): 1 | 2 | 3 {
    if (score >= thresholds[1]) return 3;
    if (score >= thresholds[0]) return 2;
    return 1;
  }

  talentsInBox(b: BoxDef): Talent[] {
    const perf = this.perfThresholds();
    const pot  = this.potThresholds();
    return this.talents().filter(t =>
      this.tier(t.performanceScore, perf) === b.row &&
      this.tier(t.potentialScore,  pot)  === b.col
    );
  }

  readonly totalInGrid = computed(() => this.talents().length);
  readonly starCount = computed(() => this.talents().filter(t =>
    this.tier(t.performanceScore, this.perfThresholds()) === 3 &&
    this.tier(t.potentialScore,  this.potThresholds())  === 3
  ).length);
  readonly needsActionCount = computed(() => this.talents().filter(t =>
    this.tier(t.performanceScore, this.perfThresholds()) === 1
  ).length);

  // ─── Preview counts for each tier while editing thresholds ────
  readonly previewPerf = computed(() => {
    const [lo, hi] = this.perfDraft();
    const list = this.talents();
    return {
      low:  list.filter(t => t.performanceScore < lo).length,
      mid:  list.filter(t => t.performanceScore >= lo && t.performanceScore < hi).length,
      high: list.filter(t => t.performanceScore >= hi).length,
    };
  });
  readonly previewPot = computed(() => {
    const [lo, hi] = this.potDraft();
    const list = this.talents();
    return {
      low:  list.filter(t => t.potentialScore < lo).length,
      mid:  list.filter(t => t.potentialScore >= lo && t.potentialScore < hi).length,
      high: list.filter(t => t.potentialScore >= hi).length,
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
