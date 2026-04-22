import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { ApiService } from '../../core/services/api.service';
import { Talent, TalentListResponse, IdpPlan, IdpListResponse, KeyPosition, PositionListResponse, DashboardKpi } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    NzIconModule,
    NzCardModule,
    NzAvatarModule,
    AvatarComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  talents = signal<Talent[]>([]);
  idps    = signal<IdpPlan[]>([]);
  positions = signal<KeyPosition[]>([]);

  readonly totalTalents = computed(() => this.talents().length);
  readonly totalPositions = computed(() => this.positions().length);

  readonly tierCounts = computed(() => {
    const acc = { core: 0, potential: 0, successor: 0 };
    for (const t of this.talents()) {
      if (t.talentTier === 'Nòng cốt') acc.core++;
      else if (t.talentTier === 'Tiềm năng') acc.potential++;
      else acc.successor++;
    }
    return acc;
  });

  readonly positionsWithSuccessors = computed(() => this.positions().filter(p => p.successorCount > 0).length);
  readonly positionsNoSuccessor = computed(() => this.positions().filter(p => p.successorCount === 0).length);

  // High risk threshold aligned with RiskBadge: >=60.
  readonly highRiskTalents = computed(() =>
    [...this.talents()].filter(t => t.riskScore >= 60).sort((a, b) => b.riskScore - a.riskScore)
  );
  readonly highRiskCount = computed(() => this.highRiskTalents().length);
  readonly topRiskNow = computed(() => this.highRiskTalents().slice(0, 3));
  readonly highRiskPct = computed(() => {
    const total = this.totalTalents();
    if (!total) return 0;
    return Math.round((this.highRiskCount() / total) * 1000) / 10; // 1 decimal
  });

  readonly activeIdps = computed(() => this.idps().filter(i => i.status === 'Active'));
  readonly activeIdpGoalsCount = computed(() => this.activeIdps().reduce((s, p) => s + (p.goals?.length ?? 0), 0));
  readonly avgIdpProgress = computed(() => {
    const list = this.activeIdps();
    if (!list.length) return 0;
    return Math.round(list.reduce((s, p) => s + (p.overallProgress ?? 0), 0) / list.length);
  });

  today = new Date().toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    // Khi useMock=false → dùng /dashboard/kpi aggregated endpoint (1 call thay 3).
    // Khi useMock=true  → giữ 3 calls riêng để dùng mock data phong phú hơn.
    if (!environment.useMock) {
      this.api.get<DashboardKpi>('dashboard/kpi').subscribe(kpi => {
        // Reconstruct minimal signal shapes từ KPI response
        const fakeTalents: Talent[] = kpi.topRisk.map(r => ({
          id: r.id, fullName: '', position: '', department: '',
          talentTier: 'Kế thừa' as const, potentialLevel: 'Medium' as const,
          performanceScore: 0, potentialScore: 0,
          riskScore: r.riskScore ?? 0,
          yearsOfExperience: 0, readinessLevel: 'Ready in 2 Years' as const,
          email: '', riskReasons: r.riskReasons,
        }));
        // Note: full talents list vẫn cần riêng cho detail views
        this.api.get<TalentListResponse>('employees').subscribe(r => this.talents.set(r.data));
        this.api.get<PositionListResponse>('key-positions').subscribe(r => this.positions.set(r.data));
      });
      this.api.get<IdpListResponse>('idp').subscribe(r => this.idps.set(r.data));
    } else {
      this.api.get<TalentListResponse>('employees', 'talents').subscribe(r => this.talents.set(r.data));
      this.api.get<IdpListResponse>('idp', 'idp-plans').subscribe(r => this.idps.set(r.data));
      this.api.get<PositionListResponse>('key-positions', 'positions').subscribe(r => this.positions.set(r.data));
    }
  }

  positionBadge(p: KeyPosition): { label: 'Manager' | 'Lead' | 'Chuyên gia' | 'Nhân viên'; cls: string } {
    const t = (p.title ?? '').toLowerCase();
    if (t.includes('trưởng') || t.includes('lead')) return { label: 'Lead', cls: 'b-lead' };
    if (t.includes('điều phối') || t.includes('chuyên gia')) return { label: 'Chuyên gia', cls: 'b-expert' };
    if (t.includes('kế toán') || t.includes('nhân viên')) return { label: 'Nhân viên', cls: 'b-staff' };
    return { label: 'Manager', cls: 'b-manager' };
  }

  readinessLabel(p: KeyPosition): 'Sẵn sàng ngay' | '1-2 năm' | '3-5 năm' | 'Đang tuyển dụng' {
    if ((p.readyNowCount ?? 0) > 0) return 'Sẵn sàng ngay';
    if ((p.successorCount ?? 0) > 0) return '1-2 năm';
    return 'Đang tuyển dụng';
  }

  readinessTone(p: KeyPosition): 'good' | 'warn' | 'bad' {
    const r = this.readinessLabel(p);
    if (r === 'Sẵn sàng ngay') return 'good';
    if (r === '1-2 năm') return 'warn';
    return 'bad';
  }

  riskReason(t: Talent): string {
    // Intent: show a short "reason" like the screenshot without needing extra backend fields.
    if (t.riskScore >= 80) return 'Sắp nghỉ hưu, thiếu người kế nhiệm';
    if (t.riskScore >= 70) return 'Hiệu suất giảm sút';
    return 'Cần theo dõi nguy cơ nghỉ việc';
  }

  riskPill(t: Talent): { text: string; cls: string } {
    if (t.riskScore >= 60) return { text: 'Rủi ro cao', cls: 'pill-risk-high' };
    if (t.riskScore >= 30) return { text: 'Rủi ro trung bình', cls: 'pill-risk-med' };
    return { text: 'Rủi ro thấp', cls: 'pill-risk-low' };
  }

  getInitials(name: string): string {
    return (name ?? '')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  avatarColor(name: string): string {
    const palette = ['#14B8A6', '#6366F1', '#F97316', '#22C55E', '#0EA5E9', '#A855F7'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  // TODO: field `unassignedCount` sẽ do API cung cấp. Tạm derive ~12% cho mockup.
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

  pct(n: number, total: number): number {
    if (!total) return 0;
    return Math.round((n / total) * 100);
  }

  // Deterministic "tenure" text to match prototype without backend field.
  holderTenure(p: KeyPosition): string {
    const id = (p.id ?? '').replace(/\D/g, '');
    const n = Number(id || 0);
    const years = (n % 4) + 2; // 2-5
    return `Giữ vị trí ${years} năm`;
  }
}
