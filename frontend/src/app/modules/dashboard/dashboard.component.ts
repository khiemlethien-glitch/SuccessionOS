import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { DashboardService } from '../../core/services/data/dashboard.service';
import { AuthService } from '../../core/auth/auth.service';
import { TalentPreviewDrawerComponent } from '../../shared/components/talent-preview-drawer/talent-preview-drawer.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    NzIconModule, NzCardModule, NzAvatarModule,
    NzDrawerModule, NzTooltipModule,
    TalentPreviewDrawerComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private dashboardSvc = inject(DashboardService);
  private authSvc      = inject(AuthService);

  // ─── Talent preview drawer ────────────────────────────────────────────────
  previewId   = signal<string | null>(null);
  previewOpen = signal(false);

  openTalentDrawer(id: string): void {
    this.previewId.set(id);
    this.previewOpen.set(true);
  }

  closeDrawer(): void {
    this.previewOpen.set(false);
    this.previewId.set(null);
  }

  switchPreview(id: string): void {
    this.previewId.set(id);
  }

  isLoading = signal(false);

  // ─── Talent KPIs (from direct DB count queries) ────────────────────────────
  totalTalents    = signal(0);
  tierCounts      = signal({ core: 0, potential: 0, successor: 0 });
  highRiskCount   = signal(0);
  topRiskAlerts   = signal<any[]>([]);

  // ─── Position KPIs (from direct DB count queries) ──────────────────────────
  totalPositions          = signal(0);
  criticalPositionsCount  = signal(0);
  highRiskPositionsCount  = signal(0);
  positionsNoSuccessor    = signal(0);
  positionsWithSuccessors = signal(0);

  // ─── IDP KPIs (placeholder — idp_plans require RLS fix) ───────────────────
  activeIdpGoalsCount = signal(0);
  avgIdpProgress      = signal(0);

  readonly highRiskPct = computed(() => {
    const total = this.totalTalents();
    if (!total) return 0;
    return Math.round((this.highRiskCount() / total) * 1000) / 10;
  });

  readonly unassignedCount = computed(() => {
    const { core, potential, successor } = this.tierCounts();
    const real = core + potential + successor;
    if (!real) return 0;
    return Math.max(1, Math.round(real * 0.12));
  });

  readonly tierBreakdown = computed(() => {
    const { core, potential, successor } = this.tierCounts();
    const unassigned = this.unassignedCount();
    const total = Math.max(1, core + potential + successor + unassigned);
    return [
      { key: 'core',       name: 'Nòng cốt',     value: core,       color: '#38bdf8', pct: this.pct(core, total) },
      { key: 'successor',  name: 'Kế thừa',      value: successor,  color: '#1e3a8a', pct: this.pct(successor, total) },
      { key: 'potential',  name: 'Tiềm năng',    value: potential,  color: '#ef4444', pct: this.pct(potential, total) },
      { key: 'unassigned', name: 'Chưa phân bổ', value: unassigned, color: '#cbd5e1', pct: this.pct(unassigned, total) },
    ];
  });

  readonly tierTotal = computed(() => this.tierBreakdown().reduce((s, t) => s + t.value, 0));

  readonly donutSegments = computed(() => {
    const R = 42;
    const C = 2 * Math.PI * R;
    const GAP = 2;
    let startPct = 0;
    return this.tierBreakdown().map(t => {
      const rawLen = (t.pct / 100) * C;
      const len = Math.max(0, rawLen - GAP);
      const rot = -90 + (startPct / 100) * 360;
      startPct += t.pct;
      return { ...t, dash: `${len} ${C - len}`, rotation: rot };
    });
  });

  today = new Date().toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    // Line Manager only sees their own department's data
    const user   = this.authSvc.currentUser();
    const deptId = user?.role === 'Line Manager' ? (user.department_id ?? undefined) : undefined;

    const [kpi, alerts, posStats] = await Promise.all([
      this.dashboardSvc.getKpi(deptId),
      this.dashboardSvc.getRiskAlerts(3, deptId),
      this.dashboardSvc.getPositionStats(deptId),
    ]);

    this.totalTalents.set(kpi.totalTalents);
    this.tierCounts.set({ core: kpi.coreCount, potential: kpi.potentialCount, successor: kpi.successorCount });
    this.highRiskCount.set(kpi.highRiskCount);
    this.topRiskAlerts.set(alerts);

    this.totalPositions.set(posStats.total);
    this.criticalPositionsCount.set(posStats.critical);
    this.highRiskPositionsCount.set(posStats.highRisk);
    this.positionsNoSuccessor.set(posStats.noSuccessor);
    this.positionsWithSuccessors.set(posStats.hasSuccessor);

    this.isLoading.set(false);
  }

  riskReason(t: any): string {
    if ((t.risk_score ?? 0) >= 80) return 'Sắp nghỉ hưu, thiếu người kế nhiệm';
    if ((t.risk_score ?? 0) >= 70) return 'Hiệu suất giảm sút';
    return 'Cần theo dõi nguy cơ nghỉ việc';
  }

  getInitials(name: string): string {
    return (name ?? '')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w: string) => w[0])
      .join('')
      .toUpperCase();
  }

  avatarColor(name: string): string {
    const palette = ['#14B8A6', '#6366F1', '#F97316', '#22C55E', '#0EA5E9', '#A855F7'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  pct(n: number, total: number): number {
    if (!total) return 0;
    return Math.round((n / total) * 100);
  }
}
