import { Component, OnInit, computed, signal } from '@angular/core';
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
import { ApiService } from '../../core/services/api.service';
import { Talent, TalentListResponse, TalentTier } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TierBadgeComponent } from '../../shared/components/tier-badge/tier-badge.component';

type SortField = 'overall' | 'performance' | 'potential' | 'risk' | 'name';
type SortDir = 'desc' | 'asc';
type RiskBand = 'High' | 'Med' | 'Low';
type ReadinessUi = 'Sẵn sàng ngay' | '1-2 năm' | '3-5 năm';

@Component({
  selector: 'app-talent-list',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTableModule, NzInputModule, NzSelectModule,
    NzButtonModule, NzProgressModule, NzIconModule, NzSpinModule, NzTooltipModule,
    AvatarComponent, TierBadgeComponent],
  templateUrl: './talent-list.component.html',
  styleUrl: './talent-list.component.scss',
})
export class TalentListComponent implements OnInit {
  all = signal<Talent[]>([]);
  loading = signal(true);
  search = signal('');

  showFilters = signal(false);

  tier = signal<TalentTier | null>(null);
  dept = signal<string | null>(null);
  readiness = signal<ReadinessUi | null>(null);
  riskBand = signal<RiskBand | null>(null);

  sortField = signal<SortField>('overall');
  sortDir = signal<SortDir>('desc');

  tierOptions: TalentTier[] = ['Nòng cốt', 'Tiềm năng', 'Kế thừa'];
  readinessOptions: ReadinessUi[] = ['Sẵn sàng ngay', '1-2 năm', '3-5 năm'];
  riskOptions: RiskBand[] = ['High', 'Med', 'Low'];
  sortOptions: { label: string; value: SortField }[] = [
    { label: 'Overall Score', value: 'overall' },
    { label: 'Performance', value: 'performance' },
    { label: 'Potential', value: 'potential' },
    { label: 'Risk Score', value: 'risk' },
    { label: 'Tên', value: 'name' },
  ];

  deptOptions = computed(() =>
    [...new Set(this.all().map(t => t.department))].sort()
  );

  readonly totalCount = computed(() => this.all().length);
  readonly filteredCount = computed(() => this.filtered().length);

  filtered = computed(() => {
    let list = this.all();
    const q = this.search().trim().toLowerCase();
    if (q) list = list.filter(t => t.fullName.toLowerCase().includes(q) || t.position.toLowerCase().includes(q) || t.department.toLowerCase().includes(q));
    if (this.tier()) list = list.filter(t => t.talentTier === this.tier());
    if (this.dept()) list = list.filter(t => t.department === this.dept());
    if (this.readiness()) list = list.filter(t => this.readinessLabel(t.readinessLevel) === this.readiness());
    if (this.riskBand()) list = list.filter(t => this.riskLabel(t.riskScore).band === this.riskBand());
    list = this.sort(list);
    return list;
  });

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.api.get<TalentListResponse>('talents', 'talents').subscribe({
      next: r => { this.all.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  navigate(t: Talent): void { this.router.navigate(['/talent', t.id]); }
  reset(): void {
    this.search.set('');
    this.tier.set(null);
    this.dept.set(null);
    this.readiness.set(null);
    this.riskBand.set(null);
    this.sortField.set('overall');
    this.sortDir.set('desc');
  }

  toggleFilters(): void { this.showFilters.set(!this.showFilters()); }
  closeFilters(): void { this.showFilters.set(false); }

  toggleSortDir(): void {
    this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
  }

  perfStatus(s: number): 'success' | 'normal' | 'exception' {
    return s >= 85 ? 'success' : s < 60 ? 'exception' : 'normal';
  }

  overallScore(t: Talent): number {
    return Math.round(((t.performanceScore ?? 0) + (t.potentialScore ?? 0)) / 2);
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

  readonly avgOverall = computed(() => {
    const list = this.filtered();
    if (!list.length) return 0;
    return Math.round(list.reduce((s, t) => s + this.overallScore(t), 0) / list.length);
  });

  readonly highRiskCount = computed(() => this.filtered().filter(t => t.riskScore >= 60).length);

  private sort(list: Talent[]): Talent[] {
    const field = this.sortField();
    const dir = this.sortDir() === 'desc' ? -1 : 1;
    const clone = [...list];
    clone.sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (field === 'overall') { av = this.overallScore(a); bv = this.overallScore(b); }
      else if (field === 'performance') { av = a.performanceScore ?? 0; bv = b.performanceScore ?? 0; }
      else if (field === 'potential') { av = a.potentialScore ?? 0; bv = b.potentialScore ?? 0; }
      else if (field === 'risk') { av = a.riskScore ?? 0; bv = b.riskScore ?? 0; }
      else { return dir * (a.fullName.localeCompare(b.fullName, 'vi')); }
      return dir * (av - bv);
    });
    return clone;
  }
}
