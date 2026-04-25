import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, Location } from '@angular/common';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';
import { NzMessageService } from 'ng-zorro-antd/message';
import { EmployeeService, DeptTreeNode } from '../../core/services/data/employee.service';
import { SuccessionService } from '../../core/services/data/succession.service';
import { Talent, TalentTier, KeyPosition } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TierBadgeComponent } from '../../shared/components/tier-badge/tier-badge.component';
import { TalentPreviewDrawerComponent } from '../../shared/components/talent-preview-drawer/talent-preview-drawer.component';
import { NineBoxComponent } from '../succession/nine-box/nine-box.component';

type SortCol  = 'overall_score' | 'performance_score' | 'potential_score' | 'risk_score' | 'full_name';
type SortDir  = 'desc' | 'asc';
type RiskBand = 'High' | 'Med' | 'Low';
type ReadinessUi = 'Sẵn sàng ngay' | '1-2 năm' | '3-5 năm';

interface BoxDef {
  row: number;
  col: number;
  label: string;
  sublabel: string;
  tone: 'star' | 'great' | 'core' | 'risk' | 'watch' | 'low';
  num: number;
}

const DEFAULT_PERF: [number, number] = [70, 85];
const DEFAULT_POT:  [number, number] = [70, 85];

@Component({
  selector: 'app-talent-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzTableModule, NzInputModule, NzSelectModule, NzButtonModule,
    NzProgressModule, NzIconModule, NzSpinModule, NzTooltipModule,
    NzPaginationModule, NzTabsModule, NzDrawerModule, NzSliderModule,
    NzTreeSelectModule,
    AvatarComponent, TierBadgeComponent, TalentPreviewDrawerComponent, NineBoxComponent,
  ],
  templateUrl: './talent-list.component.html',
  styleUrl: './talent-list.component.scss',
  host: { ngSkipHydration: 'true' },
})
export class TalentListComponent implements OnInit {

  // ─── Active tab (0 = 9-Box, 1 = List) ────────────────────────────────────
  activeTabIdx = signal(0);

  // ─── List tab: page data ───────────────────────────────────────────────────
  rows     = signal<Talent[]>([]);
  total    = signal(0);
  loading  = signal(true);
  fetching = signal(false);

  // ─── 9-Box tab: data ──────────────────────────────────────────────────────
  nineboxTalents  = signal<Talent[]>([]);
  nineboxLoading  = signal(true);

  // ─── Pagination ────────────────────────────────────────────────────────────
  readonly PAGE_SIZE = 50;
  page = signal(1);

  // ─── Filters ───────────────────────────────────────────────────────────────
  search    = signal('');
  tier      = signal<TalentTier | null>(null);
  depts     = signal<string[]>([]);    // multi-select dept keys
  readiness = signal<ReadinessUi | null>(null);
  riskBand  = signal<RiskBand | null>(null);
  showFilters = signal(false);

  // ─── Sort ──────────────────────────────────────────────────────────────────
  sortCol = signal<SortCol>('overall_score');
  sortDir = signal<SortDir>('desc');

  // ─── Filter options ────────────────────────────────────────────────────────
  deptTreeNodes = signal<DeptTreeNode[]>([]);
  tierOptions: TalentTier[]       = ['Nòng cốt', 'Tiềm năng', 'Kế thừa'];
  readinessOptions: ReadinessUi[] = ['Sẵn sàng ngay', '1-2 năm', '3-5 năm'];
  riskOptions: RiskBand[]         = ['High', 'Med', 'Low'];
  sortOptions: { label: string; value: SortCol }[] = [
    { label: 'Overall Score',  value: 'overall_score'     },
    { label: 'Performance',    value: 'performance_score' },
    { label: 'Potential',      value: 'potential_score'   },
    { label: 'Risk Score',     value: 'risk_score'        },
    { label: 'Tên',            value: 'full_name'         },
  ];

  // ─── List stats ────────────────────────────────────────────────────────────
  readonly totalCount    = computed(() => this.total());
  readonly avgOverall    = computed(() => {
    const list = this.rows();
    if (!list.length) return 0;
    return Math.round(list.reduce((s, t) => s + this.overallScore(t), 0) / list.length);
  });
  readonly highRiskCount = computed(() =>
    this.rows().filter(t => (t.risk_score ?? 0) >= 60).length);

  // ─── 9-Box: thang đo signals ──────────────────────────────────────────────
  perfThresholds = signal<[number, number]>([...DEFAULT_PERF]);
  potThresholds  = signal<[number, number]>([...DEFAULT_POT]);
  perfDraft      = signal<[number, number]>([...DEFAULT_PERF]);
  potDraft       = signal<[number, number]>([...DEFAULT_POT]);
  showScaleModal = signal(false);

  // ─── 9-Box: modal signals ─────────────────────────────────────────────────
  activeBox         = signal<BoxDef | null>(null);
  boxModalOpen      = signal(false);
  scatterOpen       = signal(false);         // scatter panel beside drawer
  drawerEmpSelected = signal<Talent | null>(null); // employee detail in drawer

  private TOP_BOXES    = new Set([5, 6, 7]);
  private BOTTOM_BOXES = new Set([1, 2, 4]);
  private STAR_BOX     = 9;

  // ─── Talent preview drawer ────────────────────────────────────────────────
  talentPreviewId   = signal<string | null>(null);
  talentPreviewOpen = signal(false);
  private savedUrl  = '';

  // ─── 9-Box definitions ────────────────────────────────────────────────────
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

  // ─── 9-Box computeds ──────────────────────────────────────────────────────
  readonly totalInGrid = computed(() => this.nineboxTalents().length);
  readonly starCount   = computed(() => this.nineboxTalents().filter(t =>
    this.scoreTier(t.performance_score ?? 0, this.perfThresholds()) === 3 &&
    this.scoreTier(t.potential_score   ?? 0, this.potThresholds())  === 3
  ).length);
  readonly needsActionCount = computed(() => this.nineboxTalents().filter(t =>
    this.scoreTier(t.performance_score ?? 0, this.perfThresholds()) === 1
  ).length);

  readonly previewPerf = computed(() => {
    const [lo, hi] = this.perfDraft();
    const list = this.nineboxTalents();
    return {
      low:  list.filter(t => (t.performance_score ?? 0) < lo).length,
      mid:  list.filter(t => (t.performance_score ?? 0) >= lo && (t.performance_score ?? 0) < hi).length,
      high: list.filter(t => (t.performance_score ?? 0) >= hi).length,
    };
  });
  readonly previewPot = computed(() => {
    const [lo, hi] = this.potDraft();
    const list = this.nineboxTalents();
    return {
      low:  list.filter(t => (t.potential_score ?? 0) < lo).length,
      mid:  list.filter(t => (t.potential_score ?? 0) >= lo && (t.potential_score ?? 0) < hi).length,
      high: list.filter(t => (t.potential_score ?? 0) >= hi).length,
    };
  });

  readonly boxTalentsSorted = computed<Talent[]>(() => {
    const box = this.activeBox();
    if (!box) return [];
    const list = this.nineboxTalents().filter(t => this._boxNum(t) === box.num);
    if (this.isBottomBox(box.num))
      return [...list].sort((a, b) => this.combined(a) - this.combined(b));
    return [...list].sort((a, b) => this.combined(b) - this.combined(a));
  });
  readonly boxHighlighted = computed<Talent[]>(() => this.boxTalentsSorted().slice(0, 3));
  readonly podiumOrder    = computed<(Talent | null)[]>(() => {
    const h = this.boxHighlighted();
    return [h[1] ?? null, h[0] ?? null, h[2] ?? null];
  });
  readonly isDefault = computed(() => {
    const p = this.perfThresholds(), q = this.potThresholds();
    return p[0] === DEFAULT_PERF[0] && p[1] === DEFAULT_PERF[1]
        && q[0] === DEFAULT_POT[0]  && q[1] === DEFAULT_POT[1];
  });

  // ─── Backward compat ──────────────────────────────────────────────────────
  positions = signal<KeyPosition[]>([]);

  private employeeSvc   = inject(EmployeeService);
  private successionSvc = inject(SuccessionService);
  private msg           = inject(NzMessageService);
  private _searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private router: Router,
    private route:  ActivatedRoute,
    private location: Location,
  ) {}

  async ngOnInit(): Promise<void> {
    const filterParam = this.route.snapshot.queryParamMap.get('filter');
    if (filterParam === 'high-risk') {
      this.riskBand.set('High');
      this.activeTabIdx.set(1);   // jump to List tab so the filter is visible
    }

    const [deptTree, nineBox] = await Promise.all([
      this.employeeSvc.getDeptTree(),
      this.successionSvc.getNineBox().catch(() => []),
      this.fetchPage(),
    ]);
    this.deptTreeNodes.set(deptTree);
    this.nineboxTalents.set(nineBox as any);
    this.nineboxLoading.set(false);
    this.loading.set(false);
  }

  // ─── List: fetch one page ─────────────────────────────────────────────────
  private async fetchPage(): Promise<void> {
    this.fetching.set(true);
    const res = await this.employeeSvc.getPaginated({
      page:           this.page(),
      pageSize:       this.PAGE_SIZE,
      search:         this.search()         || undefined,
      departmentIds:  this.depts().length   ? this.depts() : undefined,
      talentTier:     this.tier()           || undefined,
      readiness:      this.readinessToDb(this.readiness()),
      riskBand:       this.riskBand()       || undefined,
      sortCol:        this.sortCol(),
      sortDir:        this.sortDir(),
    });
    this.rows.set(res.data);
    this.total.set(res.total);
    this.fetching.set(false);
    this.loading.set(false);
  }

  onSearchChange(val: string): void {
    this.search.set(val);
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => { this.page.set(1); this.fetchPage(); }, 350);
  }
  onFilterChange(): void { this.page.set(1); this.fetchPage(); }
  onSortChange():   void { this.page.set(1); this.fetchPage(); }
  onPageChange(p: number): void { this.page.set(p); this.fetchPage(); }
  toggleSortDir(): void {
    this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    this.onSortChange();
  }
  reset(): void {
    this.search.set(''); this.tier.set(null); this.depts.set([]);
    this.readiness.set(null); this.riskBand.set(null);
    this.sortCol.set('overall_score'); this.sortDir.set('desc');
    this.page.set(1); this.fetchPage();
  }
  toggleFilters(): void { this.showFilters.set(!this.showFilters()); }
  closeFilters():  void { this.showFilters.set(false); }

  // ─── 9-Box: classification ────────────────────────────────────────────────
  private scoreTier(score: number, thresholds: [number, number]): 1 | 2 | 3 {
    if (score >= thresholds[1]) return 3;
    if (score >= thresholds[0]) return 2;
    return 1;
  }
  /** Compute box number (1–9) client-side from current thresholds */
  private _boxNum(t: Talent): number {
    const pTier = this.scoreTier(t.performance_score ?? 0, this.perfThresholds());
    const qTier = this.scoreTier(t.potential_score   ?? 0, this.potThresholds());
    return (pTier - 1) * 3 + qTier;
  }
  talentsInBox(b: BoxDef): Talent[] {
    return this.nineboxTalents().filter(t => this._boxNum(t) === b.num);
  }
  private combined(t: Talent): number {
    return ((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2;
  }
  isStarBox(num: number)   { return num === this.STAR_BOX; }
  isTopBox(num: number)    { return this.TOP_BOXES.has(num); }
  isBottomBox(num: number) { return this.BOTTOM_BOXES.has(num); }

  // ─── 9-Box: scale modal ───────────────────────────────────────────────────
  openScaleModal(): void {
    this.perfDraft.set([...this.perfThresholds()]);
    this.potDraft.set([...this.potThresholds()]);
    this.showScaleModal.set(true);
  }
  closeScaleModal(): void { this.showScaleModal.set(false); }
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

  // ─── 9-Box: box detail drawer ─────────────────────────────────────────────
  openBoxModal(box: BoxDef, ev?: Event): void {
    ev?.stopPropagation();
    this.activeBox.set(box);
    this.boxModalOpen.set(true);
    this.scatterOpen.set(true);
    this.drawerEmpSelected.set(null);
  }
  closeBoxModal(): void {
    this.boxModalOpen.set(false);
    this.activeBox.set(null);
    this.scatterOpen.set(false);
    this.drawerEmpSelected.set(null);
  }
  closeScatterPanel(): void { this.scatterOpen.set(false); }
  openTalentFromModal(id: string): void { this.closeBoxModal(); this.openTalentPreview(id); }

  /** Select an employee inside the drawer → show detail + radar */
  selectEmpInDrawer(t: Talent, ev?: Event): void {
    ev?.stopPropagation();
    this.drawerEmpSelected.set(t);
  }
  backToDrawerList(): void { this.drawerEmpSelected.set(null); }

  // ─── Scatter dot positions (clamped 8%–88% within the cell's sub-range) ──
  private _scatterRange(level: number, thresholds: [number, number]): [number, number] {
    if (level === 1) return [0, thresholds[0]];
    if (level === 2) return [thresholds[0], thresholds[1]];
    return [thresholds[1], 100];
  }
  scatterDotX(t: Talent): number {
    const box = this.activeBox();
    if (!box) return 48;
    const [min, max] = this._scatterRange(box.col, this.potThresholds());
    const v = Math.max(min, Math.min(max, t.potential_score ?? 0));
    return max === min ? 48 : 8 + (v - min) / (max - min) * 80;
  }
  scatterDotY(t: Talent): number {
    const box = this.activeBox();
    if (!box) return 48;
    const [min, max] = this._scatterRange(box.row, this.perfThresholds());
    const v = Math.max(min, Math.min(max, t.performance_score ?? 0));
    return max === min ? 48 : 88 - (v - min) / (max - min) * 80;
  }

  // ─── Radar chart helpers ──────────────────────────────────────────────────
  readonly radarBgPts   = '75,19 131,75 75,131 19,75';
  readonly radarRingPts = [0.75, 0.5, 0.25].map(f => {
    const r = 56 * f;
    return `${75},${75-r} ${75+r},${75} ${75},${75+r} ${75-r},${75}`;
  });
  readonly radarAxes: [number,number,number,number][] = [
    [75,75,75,19],[75,75,131,75],[75,75,75,131],[75,75,19,75],
  ];
  private _riskStab(t: Talent): number {
    const rb = (t as any).risk_band;
    return rb === 'Low' ? 82 : rb === 'High' ? 22 : 52;
  }
  private _tierComp(t: Talent): number {
    return t.talent_tier === 'Nòng cốt' ? 88 : t.talent_tier === 'Tiềm năng' ? 70 : 50;
  }
  radarPts(t: Talent): string {
    const r = 56; const cx = 75; const cy = 75;
    const pot  = (t.potential_score   ?? 0) / 100 * r;
    const perf = (t.performance_score ?? 0) / 100 * r;
    const stab = this._riskStab(t)  / 100 * r;
    const comp = this._tierComp(t)  / 100 * r;
    return `${cx},${cy-pot} ${cx+perf},${cy} ${cx},${cy+stab} ${cx-comp},${cy}`;
  }
  getInitials(name: string): string {
    const p = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase();
  }

  // ─── Talent preview drawer ────────────────────────────────────────────────
  openTalentPreview(id: string, ev?: Event): void {
    ev?.stopPropagation();
    if (!id) return;
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
  switchPreview(id: string): void {
    if (!id) return;
    this.location.go(`/talent/${id}`);
    this.talentPreviewId.set(id);
  }
  openFullTalent(id: string): void {
    this.savedUrl = '';
    this.talentPreviewOpen.set(false);
    this.talentPreviewId.set(null);
    this.router.navigate(['/talent', id]);
  }
  lastName(fullName: string): string {
    return fullName.trim().split(/\s+/).pop() ?? fullName;
  }

  // ─── List helpers ─────────────────────────────────────────────────────────
  navigate(t: Talent): void { this.router.navigate(['/talent', t.id]); }

  perfStatus(s: number): 'success' | 'normal' | 'exception' {
    return s >= 85 ? 'success' : s < 60 ? 'exception' : 'normal';
  }
  overallScore(t: Talent): number {
    return Math.round(((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2);
  }
  readinessLabel(r: string): ReadinessUi {
    if (r === 'Ready Now')       return 'Sẵn sàng ngay';
    if (r === 'Ready in 1 Year') return '1-2 năm';
    return '3-5 năm';
  }
  readinessClass(r: string): 'ready-now' | 'ready-1y' | 'ready-2y' {
    if (r === 'Ready Now')       return 'ready-now';
    if (r === 'Ready in 1 Year') return 'ready-1y';
    return 'ready-2y';
  }
  riskLabel(score: number): { band: RiskBand; text: string; cls: string } {
    if (score >= 60) return { band: 'High', text: `High • ${score}`, cls: 'risk-high' };
    if (score >= 30) return { band: 'Med',  text: `Med • ${score}`,  cls: 'risk-med'  };
    return             { band: 'Low',  text: `Low • ${score}`,  cls: 'risk-low'  };
  }
  departureReasons(t: Talent): string[] {
    if (t.departure_reasons && t.departure_reasons.length) return t.departure_reasons;
    if ((t.risk_score ?? 0) >= 60 && t.years_of_experience >= 20) return ['Sắp nghỉ hưu'];
    if ((t.risk_score ?? 0) >= 60) return ['Cần làm rõ nguyên nhân'];
    return [];
  }
  competencyGap(t: Talent): { gap: number; tone: 'good' | 'mid' | 'bad'; label: string } {
    const actual = {
      technical:   t.competencies?.technical    ?? 0,
      performance: t.performance_score ?? 0,
      behavior:    t.competencies?.communication ?? 0,
      potential:   t.potential_score ?? 0,
      leadership:  t.competencies?.leadership   ?? 0,
    };
    const target = t.competency_targets ?? (
      t.talent_tier === 'Nòng cốt'
        ? { technical: 90, performance: 90, behavior: 85, potential: 85, leadership: 90 }
        : { technical: 85, performance: 85, behavior: 80, potential: 80, leadership: 85 }
    );
    const keys: (keyof typeof actual)[] = ['technical','performance','behavior','potential','leadership'];
    const shortfall = keys.reduce((s, k) => s + Math.max(0, (target[k] ?? 0) - actual[k]), 0);
    const gap = Math.round(shortfall / keys.length);
    if (gap <= 0) return { gap: 0, tone: 'good', label: 'Đạt' };
    if (gap <= 5) return { gap, tone: 'mid',  label: `Thiếu ${gap}` };
    return           { gap, tone: 'bad',  label: `Thiếu ${gap}` };
  }
  private readinessToDb(ui: ReadinessUi | null): string | undefined {
    if (ui === 'Sẵn sàng ngay') return 'Ready Now';
    if (ui === '1-2 năm')       return 'Ready in 1 Year';
    if (ui === '3-5 năm')       return 'Ready in 2 Years';
    return undefined;
  }
}
