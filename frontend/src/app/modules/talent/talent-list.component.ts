import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { EmployeeService } from '../../core/services/data/employee.service';
import { Talent, TalentTier, KeyPosition } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TierBadgeComponent } from '../../shared/components/tier-badge/tier-badge.component';

type SortCol  = 'overall_score' | 'performance_score' | 'potential_score' | 'risk_score' | 'full_name';
type SortDir  = 'desc' | 'asc';
type RiskBand = 'High' | 'Med' | 'Low';
type ReadinessUi = 'Sẵn sàng ngay' | '1-2 năm' | '3-5 năm';

@Component({
  selector: 'app-talent-list',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTableModule, NzInputModule, NzSelectModule,
    NzButtonModule, NzProgressModule, NzIconModule, NzSpinModule, NzTooltipModule,
    NzPaginationModule, AvatarComponent, TierBadgeComponent],
  templateUrl: './talent-list.component.html',
  styleUrl: './talent-list.component.scss',
})
export class TalentListComponent implements OnInit {
  // ─── Page data ────────────────────────────────────────────────────────────
  rows       = signal<Talent[]>([]);
  total      = signal(0);
  loading    = signal(true);
  fetching   = signal(false);   // spinner nhỏ khi chuyển trang / filter

  // ─── Pagination ────────────────────────────────────────────────────────────
  readonly PAGE_SIZE = 50;
  page = signal(1);

  // ─── Filters ───────────────────────────────────────────────────────────────
  search    = signal('');
  tier      = signal<TalentTier | null>(null);
  dept      = signal<string | null>(null);        // department_id
  readiness = signal<ReadinessUi | null>(null);
  riskBand  = signal<RiskBand | null>(null);

  showFilters = signal(false);

  // ─── Sort ──────────────────────────────────────────────────────────────────
  sortCol = signal<SortCol>('overall_score');
  sortDir = signal<SortDir>('desc');

  // ─── Filter options ────────────────────────────────────────────────────────
  deptOptions   = signal<{ id: string; name: string }[]>([]);
  tierOptions: TalentTier[]     = ['Nòng cốt', 'Tiềm năng', 'Kế thừa'];
  readinessOptions: ReadinessUi[] = ['Sẵn sàng ngay', '1-2 năm', '3-5 năm'];
  riskOptions: RiskBand[]       = ['High', 'Med', 'Low'];
  sortOptions: { label: string; value: SortCol }[] = [
    { label: 'Overall Score',  value: 'overall_score'     },
    { label: 'Performance',    value: 'performance_score' },
    { label: 'Potential',      value: 'potential_score'   },
    { label: 'Risk Score',     value: 'risk_score'        },
    { label: 'Tên',            value: 'full_name'         },
  ];

  // ─── Stats (từ current page) ───────────────────────────────────────────────
  readonly totalCount    = computed(() => this.total());
  readonly avgOverall    = computed(() => {
    const list = this.rows();
    if (!list.length) return 0;
    return Math.round(list.reduce((s, t) => s + this.overallScore(t), 0) / list.length);
  });
  readonly highRiskCount = computed(() => this.rows().filter(t => (t.risk_score ?? 0) >= 60).length);

  // ─── Positions (kept for backward compat, load riêng nếu cần) ─────────────
  positions = signal<KeyPosition[]>([]);

  private employeeSvc = inject(EmployeeService);
  private _searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private router: Router) {}

  async ngOnInit(): Promise<void> {
    // Load dept options + first page in parallel
    const [depts] = await Promise.all([
      this.employeeSvc.getDeptOptions(),
      this.fetchPage(),
    ]);
    this.deptOptions.set(depts);
    this.loading.set(false);
  }

  // ─── Fetch một page từ server ──────────────────────────────────────────────
  private async fetchPage(): Promise<void> {
    this.fetching.set(true);
    const res = await this.employeeSvc.getPaginated({
      page:         this.page(),
      pageSize:     this.PAGE_SIZE,
      search:       this.search() || undefined,
      departmentId: this.dept()   || undefined,
      talentTier:   this.tier()   || undefined,
      readiness:    this.readinessToDb(this.readiness()),
      riskBand:     this.riskBand() || undefined,
      sortCol:      this.sortCol(),
      sortDir:      this.sortDir(),
    });
    this.rows.set(res.data);
    this.total.set(res.total);
    this.fetching.set(false);
    this.loading.set(false);
  }

  // ─── Filter / sort triggers → reset về page 1 ─────────────────────────────
  onSearchChange(val: string): void {
    this.search.set(val);
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => { this.page.set(1); this.fetchPage(); }, 350);
  }

  onFilterChange(): void { this.page.set(1); this.fetchPage(); }
  onSortChange(): void   { this.page.set(1); this.fetchPage(); }

  onPageChange(p: number): void { this.page.set(p); this.fetchPage(); }

  toggleSortDir(): void {
    this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    this.onSortChange();
  }

  reset(): void {
    this.search.set('');
    this.tier.set(null);
    this.dept.set(null);
    this.readiness.set(null);
    this.riskBand.set(null);
    this.sortCol.set('overall_score');
    this.sortDir.set('desc');
    this.page.set(1);
    this.fetchPage();
  }

  toggleFilters(): void { this.showFilters.set(!this.showFilters()); }
  closeFilters(): void  { this.showFilters.set(false); }

  // ─── Readiness label ↔ DB value ───────────────────────────────────────────
  private readinessToDb(ui: ReadinessUi | null): string | undefined {
    if (ui === 'Sẵn sàng ngay') return 'Ready Now';
    if (ui === '1-2 năm')       return 'Ready in 1 Year';
    if (ui === '3-5 năm')       return 'Ready in 2 Years';
    return undefined;
  }

  // ── Departure reasons ──────────────────────────────────────────────────────
  departureReasons(t: Talent): string[] {
    if (t.departure_reasons && t.departure_reasons.length) return t.departure_reasons;
    if ((t.risk_score ?? 0) >= 60 && t.years_of_experience >= 20) return ['Sắp nghỉ hưu'];
    if ((t.risk_score ?? 0) >= 60) return ['Cần làm rõ nguyên nhân'];
    return [];
  }

  // ── Competency gap vs target (avg shortfall; 0 = meets target)
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
    if (gap <= 5) return { gap, tone: 'mid', label: `Thiếu ${gap}` };
    return { gap, tone: 'bad', label: `Thiếu ${gap}` };
  }

  navigate(t: Talent): void { this.router.navigate(['/talent', t.id]); }

  perfStatus(s: number): 'success' | 'normal' | 'exception' {
    return s >= 85 ? 'success' : s < 60 ? 'exception' : 'normal';
  }

  overallScore(t: Talent): number {
    return Math.round(((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2);
  }

  readinessLabel(r: string): ReadinessUi {
    if (r === 'Ready Now') return 'Sẵn sàng ngay';
    if (r === 'Ready in 1 Year') return '1-2 năm';
    return '3-5 năm';
  }

  readinessClass(r: string): 'ready-now' | 'ready-1y' | 'ready-2y' {
    if (r === 'Ready Now') return 'ready-now';
    if (r === 'Ready in 1 Year') return 'ready-1y';
    return 'ready-2y';
  }

  riskLabel(score: number): { band: RiskBand; text: string; cls: string } {
    if (score >= 60) return { band: 'High', text: `High • ${score}`, cls: 'risk-high' };
    if (score >= 30) return { band: 'Med', text: `Med • ${score}`, cls: 'risk-med' };
    return { band: 'Low', text: `Low • ${score}`, cls: 'risk-low' };
  }

}
