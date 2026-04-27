import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, signal, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import { EmployeeService } from '../../core/services/data/employee.service';
import { IdpService } from '../../core/services/data/idp.service';
import { AssessmentService, Cycle, AssessmentView, AssessmentBlock, AssessmentBlocksView, RadarProfile } from '../../core/services/data/assessment.service';
import { SuccessionService } from '../../core/services/data/succession.service';
import { ScoreConfigService, ComputedScore } from '../../core/services/data/score-config.service';
import { EmployeeExtrasService, EmployeeExtras, extrasToProject, extrasToKt, extrasTo360 } from '../../core/services/data/employee-extras.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CareerRoadmapComponent } from './career-roadmap/career-roadmap.component';
import { AuthService } from '../../core/auth/auth.service';
import { ApprovalService } from '../../core/services/data/approval.service';
import {
  Talent,
  Assessment,
  IdpPlan,
  RiskFactor,
  CareerReview,
  CurrentProject,
  KnowledgeTransfer,
  Assessment360,
} from '../../core/models/models';

// ─── Personal aspiration types ────────────────────────────────────────────────
interface CompGapRow {
  key:      string;
  label:    string;
  current:  number;   // employee's actual score (0–100)
  required: number;   // position requires (0–100)
  gap:      number;   // required − current (positive = needs improvement)
}
interface PersonalAspiration {
  target_position:    string;
  target_department?: string;
  notes?:             string;
  source:             'self' | 'hr';
  updated_by?:        string;
  updated_at?:        string;
  gap_rows:           CompGapRow[];
}

@Component({
  selector: 'app-talent-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NzTabsModule, NzSelectModule, NzProgressModule, NzButtonModule, NzIconModule,
    NzTagModule, NzTimelineModule, NzSpinModule, NzSkeletonModule, NzModalModule, NzInputModule, CareerRoadmapComponent],
  providers: [NzMessageService],
  templateUrl: './talent-profile.component.html',
  styleUrl: './talent-profile.component.scss',
  // Mentor picker modal + dynamic SVG charts don't hydrate cleanly;
  // skip hydration to avoid Cannot-read-null errors during client boot.
  host: { ngSkipHydration: 'true' },
})
export class TalentProfileComponent implements OnInit, OnChanges {
  /** Embed mode: pass the talent id directly instead of reading the route. */
  @Input() embeddedTalentId: string | null = null;
  /** Hides breadcrumb + re-routes internal navigation via embeddedNavigate event. */
  @Input() embedded = false;
  /** Emitted when user clicks a mentor/mentee/etc. inside the embedded view. */
  @Output() embeddedNavigate = new EventEmitter<string>();

  // ─── Core signals ─────────────────────────────────────────────────────────
  talent     = signal<Talent | null>(null);
  assessment = signal<Assessment | null>(null);   // dùng trong tab "Đánh giá 360°"
  idp        = signal<IdpPlan | null>(null);
  loading      = signal(true);   // true until talent() is set (hero skeleton)
  cyclesLoading = signal(true);  // true until cycles + assessment data ready

  // ─── External scores (from score-config service) ─────────────────────────
  externalScore       = signal<ComputedScore | null>(null);
  externalScoreLoaded = signal<boolean | null>(null);

  // ─── Profile section signals (mỗi section fetch riêng) ───────────────────
  extrasRaw            = signal<EmployeeExtras | null>(null);
  assessment360Data    = signal<Assessment360 | null>(null);
  careerReviewData     = signal<CareerReview | null>(null);
  currentProjectData   = signal<CurrentProject | null>(null);
  knowledgeTransferData = signal<KnowledgeTransfer | null>(null);

  // Trạng thái load từng section: null=loading, true=có data, false=không có data (404/error)
  assessment360Loaded    = signal<boolean | null>(null);
  careerReviewLoaded     = signal<boolean | null>(null);
  currentProjectLoaded   = signal<boolean | null>(null);
  knowledgeTransferLoaded = signal<boolean | null>(null);
  idpLoaded              = signal<boolean | null>(null);

  // ─── Personal aspiration (mock — future: sync from HRM field) ───────────────
  aspiration = signal<PersonalAspiration | null>(null);

  /** Top 2 gaps with highest shortfall — used for the suggestion footer. */
  aspirationTopGaps = computed<CompGapRow[]>(() =>
    (this.aspiration()?.gap_rows ?? []).filter(r => r.gap > 0).slice(0, 2)
  );

  // ─── Mentor picker ────────────────────────────────────────────────────────
  allTalents      = signal<Talent[]>([]);
  showMentorModal = signal(false);
  mentorSearch    = signal('');

  // ─── Collapse states ──────────────────────────────────────────────────────
  riskExpanded       = signal(true);

  /** Active tab index for the profile main tabs (0=Năng lực 1=Đánh giá 2=Phát triển 3=Rủi ro). */
  activeProfileTab = signal(0);

  // ─── Timeline (dynamic — fetch từ nhiều nguồn theo employee_id) ───────────
  historyLogs     = signal<{ date: string; text: string; color: string }[]>([]);
  historyLoading  = signal(false);

  assessmentLabels: Record<string, string> = {
    technical: 'Kỹ thuật chuyên môn', leadership: 'Lãnh đạo',
    communication: 'Giao tiếp', strategicThinking: 'Tư duy chiến lược'
  };

  // ─── Derived values ────────────────────────────────────────────────────────
  initials = computed(() => {
    const name = this.talent()?.full_name ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  roleLevel = computed(() => {
    const pos = (this.talent()?.position ?? '').toLowerCase();
    if (pos.includes('lead'))       return 'Lead';
    if (pos.includes('director'))   return 'Director';
    if (pos.includes('manager'))    return 'Manager';
    if (pos.includes('senior'))     return 'Senior';
    if (pos.includes('specialist')) return 'Specialist';
    if (pos.includes('officer'))    return 'Officer';
    if (pos.includes('analyst'))    return 'Analyst';
    if (pos.includes('engineer'))   return 'Engineer';
    return '';
  });

  hireDateFmt = computed(() => {
    const d = this.talent()?.hire_date;
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  });

  tenureYears = computed(() => this.talent()?.tenure_years ?? this.talent()?.years_of_experience ?? 0);

  overallScore = computed(() => {
    const t = this.talent();
    if (!t) return 0;
    const ext = this.externalScore();
    if (ext?.total_score != null) return ext.total_score;
    if (t.overall_score != null) return t.overall_score;
    return Math.round(((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2);
  });

  overallRank = computed(() => {
    const s = this.overallScore();
    const all = this.allTalents();
    if (all.length >= 2) {
      const scoreOf = (t: Talent) =>
        t.overall_score ?? Math.round(((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2);
      const countBelow = all.filter(t => scoreOf(t) < s).length;
      const pct = (countBelow / all.length) * 100;
      if (pct >= 95) return 'Top 5% toàn công ty';
      if (pct >= 80) return 'Top 20% toàn công ty';
      if (pct >= 50) return 'Trung bình trên';
      return 'Trung bình';
    }
    // fallback khi chưa load đủ dữ liệu
    if (s >= 90) return 'Top 5% toàn công ty';
    if (s >= 80) return 'Top 20% toàn công ty';
    if (s >= 70) return 'Trung bình trên';
    return 'Trung bình';
  });

  idpProgress = computed(() => this.idp()?.overall_progress ?? 0);
  ktpProgress = computed(() => this.talent()?.ktp_progress ?? 0);

  isHighRisk = computed(() => (this.talent()?.risk_score ?? 0) >= 60);

  riskLabel = computed(() => {
    const r = this.talent()?.risk_score ?? 0;
    if (r >= 60) return 'Cao — cần chú ý';
    if (r >= 30) return 'Trung bình';
    return 'Thấp';
  });

  riskFactorsList = computed<RiskFactor[]>(() => {
    const t = this.talent();
    if (!t) return [];
    if (t.risk_factors && t.risk_factors.length) return t.risk_factors;

    const negative: RiskFactor[] = [];
    const positive: RiskFactor[] = [];
    const risk = t.risk_score ?? 0;
    const ktp  = t.ktp_progress ?? 0;
    const idpP = this.idpProgress();
    const perf = t.performance_score ?? 0;
    const pot  = t.potential_score  ?? 0;
    const avg  = perf > 0 || pot > 0 ? (perf + pot) / 2 : -1;

    // ── Cảnh báo rủi ro ──────────────────────────────────────────────
    if (risk >= 60) {
      negative.push({ title: `Risk score cao (${risk}) — cần can thiệp ngay`, detail: 'Tổng hợp từ nhiều chỉ số bất lợi, cần can thiệp sớm', severity: 'high', source: 'Tự động', date: 'Q1/2025' });
    } else if (risk >= 30) {
      negative.push({ title: `Risk score trung bình (${risk}) — cần theo dõi`, detail: 'Một số chỉ số cần chú ý, theo dõi định kỳ', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }

    if (!t.mentor) {
      negative.push({ title: 'Chưa có mentor', detail: 'Chưa gán mentor trong hệ thống PTNT', severity: 'medium', source: 'HR', date: 'Q1/2025' });
    }

    if (ktp > 0 && ktp < 50) {
      negative.push({ title: `KTP chậm tiến độ — ${ktp}% hoàn thành`, detail: 'Chuyển giao kiến thức chưa đạt ngưỡng 50%, cần đẩy nhanh', severity: 'high', source: 'Tự động', date: 'Q1/2025' });
    } else if (ktp >= 50 && ktp < 70) {
      negative.push({ title: `KTP cần đẩy nhanh — ${ktp}%`, detail: 'Tiến độ chuyển giao kiến thức trung bình, chưa đạt mục tiêu', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }

    if (idpP > 0 && idpP < 30) {
      negative.push({ title: `IDP tiến độ thấp — ${idpP}%`, detail: 'Kế hoạch phát triển cá nhân chưa tiến triển, cần review', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }

    // Gap năng lực — dùng avg HP/TN (thang 0-10)
    if (avg >= 0 && avg < 5) {
      const gapPct = Math.round((10 - avg) / 10 * 100);
      negative.push({ title: `Gap năng lực lớn — còn ${gapPct}% khoảng cách`, detail: `HP ${perf} · TN ${pot} — cần tăng tốc lộ trình phát triển`, severity: 'high', source: 'Tự động', date: 'Q1/2025' });
    } else if (avg >= 5 && avg < 7) {
      const gapPct = Math.round((10 - avg) / 10 * 100);
      negative.push({ title: `Gap năng lực — còn ${gapPct}% cần bổ sung`, detail: `HP ${perf} · TN ${pot} — tiếp tục phát triển theo IDP`, severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }

    // Key person dependency
    const onlyPos = this.positionsWhereOnlySuccessor();
    if (onlyPos.length > 0) {
      const posText = onlyPos.slice(0, 2).join(', ') + (onlyPos.length > 2 ? ` +${onlyPos.length - 2} vị trí` : '');
      negative.push({ title: `Key Person — người kế thừa duy nhất`, detail: `Là ứng viên duy nhất cho: ${posText}. Tổ chức phụ thuộc cao vào cá nhân này.`, severity: 'high', source: 'Tự động', date: 'Q1/2025' });
    }

    if (t.readiness_level === 'Ready in 2 Years' && t.talent_tier === 'Nòng cốt') {
      negative.push({ title: 'Thời gian sẵn sàng dài — Ready in 2 Years', detail: 'Tier Nòng cốt nhưng cần 2+ năm mới sẵn sàng kế thừa', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }

    // ── Tín hiệu tích cực (severity: 'ok') ───────────────────────────
    if (risk < 30 && risk > 0) {
      positive.push({ title: `Risk score thấp (${risk}) — trong ngưỡng an toàn`, detail: `Score dưới ngưỡng cảnh báo (30) — chỉ số ổn định`, severity: 'ok', source: 'Tự động', date: 'Q1/2025' });
    }
    if (t.mentor) {
      positive.push({ title: `Có mentor đang hỗ trợ`, detail: `Mentor: ${t.mentor}`, severity: 'ok', source: 'HR', date: 'Q1/2025' });
    }
    if (ktp >= 80) {
      positive.push({ title: `Chuyển giao kiến thức tốt — ${ktp}%`, detail: 'KTP hoàn thành trên 80%, tiến độ đúng kế hoạch', severity: 'ok', source: 'Tự động', date: 'Q1/2025' });
    }
    if (avg >= 8) {
      positive.push({ title: `Hiệu suất & tiềm năng xuất sắc`, detail: `HP ${perf} · TN ${pot} — top performer của tổ chức`, severity: 'ok', source: 'Tự động', date: 'Q1/2025' });
    }

    // Negative trước, positive sau
    return [...negative, ...positive];
  });

  riskTone = computed<'high' | 'medium' | 'low'>(() => {
    const r = this.talent()?.risk_score ?? 0;
    if (r >= 60) return 'high';
    if (r >= 30) return 'medium';
    return 'low';
  });

  riskVsDeptAvg = computed(() => {
    const t = this.talent();
    if (!t) return 0;
    const peers = this.allTalents().filter(x => x.department === t.department);
    if (peers.length === 0) return 0;
    const avg = peers.reduce((s, x) => s + (x.risk_score ?? 0), 0) / peers.length;
    if (avg <= 0) return 0;
    return Math.round((((t.risk_score ?? 0) - avg) / avg) * 100);
  });

  riskReasons = computed<string[]>(() => {
    const t = this.talent();
    if (!t) return [];
    if (t.risk_reasons && t.risk_reasons.length) return t.risk_reasons;
    const out: string[] = [];
    if (!t.mentor) out.push('Chưa có mentor');
    if ((t.ktp_progress ?? 100) < 50) out.push(`KTP tiến độ thấp ${t.ktp_progress ?? 0}%`);
    if (this.idpProgress() < 50) out.push(`IDP tiến độ thấp ${this.idpProgress()}%`);
    return out;
  });

  tierPillClass = computed(() => {
    const tier = this.talent()?.talent_tier;
    if (tier === 'Nòng cốt')  return 'pill pill-core';
    if (tier === 'Tiềm năng') return 'pill pill-potential';
    return 'pill pill-successor';
  });

  componentScores = computed(() => {
    const t = this.talent();
    if (!t) return [] as { label: string; value: number }[];
    return [
      { label: 'Kỹ thuật',  value: t.competencies?.technical ?? 0 },
      { label: 'Hiệu suất', value: t.performance_score },
      { label: 'Hành vi',   value: t.competencies?.communication ?? 0 },
      { label: 'Tiềm năng', value: t.potential_score },
      { label: 'Tổng hợp',  value: this.overallScore() },
    ];
  });

  quickStats = computed(() => ({
    trainingHours: this.extrasRaw()?.training_hours      ?? null,
    lastPromotion: this.extrasRaw()?.last_promotion_year ?? null,
    idpProgress:   this.idpProgress(),
    riskScore:     this.talent()?.risk_score ?? 0,
  }));

  // ─── IDP Plan (narrative view cho review card) ─────────────────────────────
  idpTargetPosition = computed(() =>
    this.successionTargetPosition()
    ?? this.idp()?.target_position
    ?? this.talent()?.target_position
    ?? '—');
  idpApprovedBy   = computed(() => this.idp()?.approved_by   ?? '—');
  idpApprovedDate = computed(() => this.idp()?.approved_date ?? '—');
  idpStatus       = computed(() => this.idp()?.status ?? '—');
  idpGoals12m     = computed(() => this.idp()?.goals_12m  ?? []);
  idpGoals2to3y   = computed(() => this.idp()?.goals_2to3y ?? []);

  // ─── Review helpers ────────────────────────────────────────────────────────
  reviewLabel(score: number): string {
    if (score >= 90) return 'Xuất sắc';
    if (score >= 75) return 'Tốt';
    if (score >= 60) return 'Trung bình';
    return 'Cần cải thiện';
  }

  reviewBarClass(score: number): string {
    if (score >= 85) return 'bar-good';
    if (score >= 70) return 'bar-mid';
    return 'bar-low';
  }

  ktStatusColor(status: string): string {
    if (status === 'Completed')   return 'kt-done';
    if (status === 'In Progress') return 'kt-progress';
    return 'kt-pending';
  }

  // ─── Assessment tab entries ────────────────────────────────────────────────
  get assessmentEntries(): { key: string; label: string; value: number }[] {
    const s = this.assessment()?.scores;
    if (!s) return [];
    return Object.entries(s).map(([key, value]) => ({ key, label: this.assessmentLabels[key] ?? key, value: value as number }));
  }

  // ─── Radar chart (Hồ sơ năng lực) ─────────────────────────────────────────
  private radarLabels = ['Kỹ thuật', 'Hiệu suất', 'Hành vi', 'Tiềm năng', 'Lãnh đạo'];
  private RADAR_CX = 100;
  private RADAR_CY = 100;
  private RADAR_R  = 72;
  private RADAR_LBL_PAD = 14;

  /**
   * Radar 5 trục — ưu tiên data từ `radarProfile` (assessment_scores của cycle đã chọn).
   * Fallback về `t.competencies` nếu chưa load được assessment (cycle mới/chưa có phiếu).
   */
  radarEntries = computed(() => {
    const profile = this.radarProfile();
    if (profile) {
      return profile.entries.map(e => ({
        label:  e.label,
        actual: e.actual,   // keep null — use ?? 0 only in SVG path
        target: e.target,
        delta:  e.delta,    // keep null — guards in template
      }));
    }
    const t = this.talent();
    if (!t) return [];
    const c   = t.competencies;
    const tgt = t.competency_targets ?? { technical: 85, performance: 85, behavior: 80, potential: 80, leadership: 85 };
    const values = [
      { label: 'Kỹ thuật',  actual: c?.technical ?? 0,         target: tgt.technical },
      { label: 'Hiệu suất', actual: t.performance_score ?? 0,  target: tgt.performance },
      { label: 'Hành vi',   actual: c?.communication ?? 0,     target: tgt.behavior },
      { label: 'Tiềm năng', actual: t.potential_score ?? 0,    target: tgt.potential },
      { label: 'Lãnh đạo',  actual: c?.leadership ?? 0,        target: tgt.leadership },
    ];
    return values.map(v => ({
      ...v,
      delta: v.actual != null ? Math.round((v.actual - v.target) * 10) / 10 : null,
    }));
  });

  radarAbove = computed(() =>
    this.radarProfile()?.above_count ??
    this.radarEntries().filter(e => e.delta != null && e.delta >= 0).length
  );
  radarBelow = computed(() =>
    this.radarProfile()?.below_count ??
    this.radarEntries().filter(e => e.delta != null && e.delta < 0).length
  );
  /** Tổng độ lệch tuyệt đối (Σ|delta|) — chỉ số GAP chung để so giữa các talent. */
  radarTotalGap = computed(() => {
    const p = this.radarProfile();
    if (p) return p.total_gap_abs;
    const entries = this.radarEntries();
    return Math.round(entries.reduce((s, e) => s + Math.abs(e.delta ?? 0), 0) * 10) / 10;
  });
  /** Trung bình gap có dấu (Σdelta / 5). Âm = tổng thể dưới chuẩn, dương = vượt chuẩn. */
  radarAvgGap = computed(() => {
    const p = this.radarProfile();
    if (p) return p.avg_gap;
    const entries = this.radarEntries().filter(e => e.delta != null);
    if (!entries.length) return 0;
    return Math.round((entries.reduce((s, e) => s + (e.delta ?? 0), 0) / entries.length) * 10) / 10;
  });
  /** Tên nguồn dữ liệu radar — tên chu kỳ nếu có dữ liệu thật, fallback nếu dùng competencies mặc định. */
  radarSourceLabel = computed(() => {
    if (this.radarProfile()) {
      const cycle = this.cycles().find(c => c.id === this.selectedCycleId());
      return cycle ? cycle.name : 'Chu kỳ hiện tại';
    }
    return 'Năng lực mặc định';
  });
  /** true nếu radar đang dùng dữ liệu thật từ assessment_scores (không phải fallback). */
  radarSourceIsReal = computed(() => this.radarProfile() != null);

  private radarPoint(index: number, value: number): { x: number; y: number } {
    const n = this.radarLabels.length;
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = this.RADAR_R * (value / 100);
    return { x: this.RADAR_CX + r * Math.cos(angle), y: this.RADAR_CY + r * Math.sin(angle) };
  }

  radarActualPath = computed(() =>
    this.radarEntries().map((e, i) => {
      const p = this.radarPoint(i, e.actual ?? 0);
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(' ') + ' Z'
  );

  radarTargetPath = computed(() =>
    this.radarEntries().map((e, i) => {
      const p = this.radarPoint(i, e.target);
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(' ') + ' Z'
  );

  radarAxes = computed(() =>
    this.radarEntries().map((e, i) => {
      const outer = this.radarPoint(i, 100);
      const lblR  = this.RADAR_R + this.RADAR_LBL_PAD;
      const a     = (Math.PI * 2 * i) / this.radarLabels.length - Math.PI / 2;
      return {
        label:  e.label,
        x2:     outer.x,
        y2:     outer.y,
        lx:     this.RADAR_CX + lblR * Math.cos(a),
        ly:     this.RADAR_CY + lblR * Math.sin(a),
        anchor: Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end'),
      };
    })
  );

  radarGrid = [20, 40, 60, 80, 100].map(pct => {
    const n = 5;
    return Array.from({ length: n }, (_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = 72 * (pct / 100);
      return `${(100 + r * Math.cos(angle)).toFixed(2)},${(100 + r * Math.sin(angle)).toFixed(2)}`;
    }).join(' ');
  });

  // ─── Network (Mạng lưới phát triển) ───────────────────────────────────────
  mentorTalent = computed<Talent | null>(() => {
    const me = this.talent();
    if (!me || !me.mentor) return null;
    return this.allTalents().find(t => t.full_name === me.mentor) ?? null;
  });

  centerInitials = computed(() => {
    const name  = this.talent()?.full_name ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  nameInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Alias kept for template compatibility */
  menteeInitials(name: string): string { return this.nameInitials(name); }

  lastName(name: string): string { return (name ?? '').trim().split(/\s+/).pop() ?? name; }

  /** Vị trí chức vụ của người kế thừa — dùng trong CSS tooltip */
  succNodePosition(node: { talent_id: string }): string {
    return this.allTalents().find(x => x.id === node.talent_id)?.position ?? '';
  }

  // Target position: prioritise succession relationship over IDP data
  successionTargetPosition = signal<string | null>(null);
  successionTargetDetails  = signal<{ title: string; holderName: string; priority: number } | null>(null);

  // Successors (people who will inherit current person's position)
  successorNodes = signal<{ talent_id: string; talent_name: string; readiness: string; priority: number; idp_progress: number }[]>([]);
  /** Vị trí mà nhân viên này là người kế thừa DUY NHẤT (key-person dependency) */
  positionsWhereOnlySuccessor = signal<string[]>([]);
  showAllSuccessors = signal(false);

  readonly visibleSuccessors = computed(() =>
    this.showAllSuccessors() ? this.successorNodes() : this.successorNodes().slice(0, 3)
  );
  readonly hiddenSuccessorCount = computed(() => Math.max(0, this.successorNodes().length - 3));

  readonly netLayout = computed(() => {
    const succs = this.visibleSuccessors();
    const n = succs.length;
    const showMore = this.hiddenSuccessorCount() > 0 && !this.showAllSuccessors();
    const totalSlots = Math.max(n + (showMore ? 1 : 0), 1);
    const yPct = 82;

    const positions = succs.map((s, i) => {
      const xPct = totalSlots <= 1 ? 50 : 20 + (60 / (totalSlots - 1)) * i;
      return { ...s, xPct, yPct, midX: (50 + xPct) / 2, midY: (50 + yPct) / 2 };
    });

    const moreXPct = showMore
      ? (totalSlots <= 1 ? 80 : 20 + (60 / (totalSlots - 1)) * n)
      : 80;

    return { positions, moreXPct, showMore };
  });

  // ─── Assessment (backend-driven với dropdown cycle) ──────────────────────
  cycles             = signal<Cycle[]>([]);
  selectedCycleId    = signal<string | null>(null);
  assessmentView     = signal<AssessmentView | null>(null);
  assessmentBlocks   = signal<AssessmentBlocksView | null>(null);
  radarProfile       = signal<RadarProfile | null>(null);
  expandedBlocks     = signal(new Set<string>());

  blockVisibleItems(block: AssessmentBlock): AssessmentBlock['items'] {
    return this.expandedBlocks().has(block.type) ? block.items : block.items.slice(0, 5);
  }

  isBlockExpanded(type: string): boolean { return this.expandedBlocks().has(type); }

  toggleBlockExpanded(type: string): void {
    this.expandedBlocks.update(s => {
      const next = new Set(s);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  blockWeightLabel(type: string): string {
    const w = this.assessmentBlocks()?.weights;
    if (!w) return '';
    return type === 'kpi' ? `${w.assessment_weight}%` : `${w.weight_360}%`;
  }

  // ─── Auth / role ──────────────────────────────────────────────────────────
  private authSvc     = inject(AuthService);
  private approvalSvc = inject(ApprovalService);
  /** True when logged-in user is a Viewer — used to hide sensitive sections */
  readonly isViewer = computed(() => this.authSvc.isViewer());

  // ─── Pending mentor request (Viewer flow) ─────────────────────────────────
  /** Tên mentor đang chờ phê duyệt (chỉ dùng cho Viewer) */
  pendingMentorName = signal<string | null>(null);
  mentorSubmitting  = signal(false);

  // ─── Career Roadmap summary (hiển thị trong IDP card) ──────────────────────
  roadmapSummary = signal<{
    hasPending:      boolean;
    hasConfirmed:    boolean;
    pendingTrack?:   'expert' | 'manager';
    confirmedTarget?: string;
    confirmedTrack?:  'expert' | 'manager';
  }>({ hasPending: false, hasConfirmed: false });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  private sbSvc        = inject(SupabaseService);
  private employeeSvc  = inject(EmployeeService);
  private idpSvc       = inject(IdpService);
  private assessmentSvc = inject(AssessmentService);
  private successionSvc = inject(SuccessionService);
  private scoreSvc     = inject(ScoreConfigService);
  private extrasSvc    = inject(EmployeeExtrasService);
  private msg          = inject(NzMessageService);

  // ─── Edit modes ───────────────────────────────────────────────────────────
  // Project edit
  projectEditMode = signal(false);
  projectSaving   = signal(false);
  projectDraft    = signal({ name:'', type:'', role:'', client:'', value:'', status:'active' });

  // KT edit
  ktEditMode = signal(false);
  ktSaving   = signal(false);
  ktDraft    = signal({ successor:'', successor_role:'', start_date:'', target_date:'', overall_progress:0 });

  // Quick stats edit
  qsEditMode  = signal(false);
  qsSaving    = signal(false);
  qsDraft     = signal<{ training_hours: number | null; last_promotion_year: number | null }>({ training_hours: null, last_promotion_year: null });

  // 360° edit
  a360EditMode = signal(false);
  a360Saving   = signal(false);
  a360Draft    = signal({ overall:0, benchmark:5, period:'', manager_note:'',
                          strengths_raw:'', needs_dev_raw:'' });

  // Score edit
  scoreEditMode = signal(false);
  scoreSaving   = signal(false);
  scoreDraft    = signal<{ assessment_score: number|null; score_360: number|null }>(
    { assessment_score: null, score_360: null }
  );

  // ─── Project edit helpers ─────────────────────────────────────────────────
  openProjectEdit(): void {
    const p = this.currentProjectData();
    this.projectDraft.set(p
      ? { name: p.name, type: p.type, role: p.role, client: p.client, value: p.value, status: p.status }
      : { name:'', type:'', role:'', client:'', value:'', status:'active' }
    );
    this.projectEditMode.set(true);
  }

  async saveProject(): Promise<void> {
    const id = this.talent()?.id;
    if (!id) return;
    this.projectSaving.set(true);
    const d = this.projectDraft();
    const ok = await this.extrasSvc.save(id, {
      project_name: d.name, project_type: d.type, project_role: d.role,
      project_client: d.client, project_value: d.value, project_status: d.status,
    });
    this.projectSaving.set(false);
    if (ok) {
      this.currentProjectData.set({ name:d.name, type:d.type, role:d.role, client:d.client, value:d.value, status:d.status });
      this.projectEditMode.set(false);
      this.msg.success('Đã lưu dự án hiện tại');
    } else {
      this.msg.error('Lưu thất bại — xem console');
    }
  }

  // ─── KT edit helpers ──────────────────────────────────────────────────────
  openKtEdit(): void {
    const kt = this.knowledgeTransferData();
    this.ktDraft.set(kt
      ? { successor: kt.successor, successor_role: kt.successor_role,
          start_date: kt.start_date, target_date: kt.target_date,
          overall_progress: kt.overall_progress }
      : { successor:'', successor_role:'', start_date:'', target_date:'', overall_progress:0 }
    );
    this.ktEditMode.set(true);
  }

  async saveKt(): Promise<void> {
    const id = this.talent()?.id;
    if (!id) return;
    this.ktSaving.set(true);
    const d = this.ktDraft();
    const ok = await this.extrasSvc.save(id, {
      kt_successor: d.successor, kt_successor_role: d.successor_role,
      kt_start_date: d.start_date, kt_target_date: d.target_date,
      kt_overall_progress: d.overall_progress,
    });
    this.ktSaving.set(false);
    if (ok) {
      const prev = this.knowledgeTransferData();
      this.knowledgeTransferData.set({
        successor: d.successor, successor_role: d.successor_role,
        start_date: d.start_date, target_date: d.target_date,
        overall_progress: d.overall_progress,
        items: prev?.items ?? [],
      });
      this.ktEditMode.set(false);
      this.msg.success('Đã lưu thông tin chuyển giao tri thức');
    } else {
      this.msg.error('Lưu thất bại — xem console');
    }
  }

  // ─── Quick stats edit helpers ─────────────────────────────────────────────
  openQsEdit(): void {
    const e = this.extrasRaw();
    this.qsDraft.set({ training_hours: e?.training_hours ?? null, last_promotion_year: e?.last_promotion_year ?? null });
    this.qsEditMode.set(true);
  }

  async saveQs(): Promise<void> {
    const id = this.talent()?.id;
    if (!id) return;
    this.qsSaving.set(true);
    const d = this.qsDraft();
    const ok = await this.extrasSvc.save(id, {
      training_hours:      d.training_hours,
      last_promotion_year: d.last_promotion_year,
    });
    this.qsSaving.set(false);
    if (ok) {
      this.extrasRaw.update(e => e ? { ...e, training_hours: d.training_hours, last_promotion_year: d.last_promotion_year } : e);
      this.qsEditMode.set(false);
      this.msg.success('Đã lưu thống kê nhanh');
    } else {
      this.msg.error('Lưu thất bại — xem console');
    }
  }

  // ─── 360° edit helpers ────────────────────────────────────────────────────
  open360Edit(): void {
    const d = this.assessment360Data();
    this.a360Draft.set(d
      ? { overall: d.overall, benchmark: d.benchmark, period: d.period,
          manager_note: d.manager_note,
          strengths_raw: (d.strengths ?? []).join('\n'),
          needs_dev_raw: (d.needs_dev ?? []).join('\n') }
      : { overall: 0, benchmark: 5, period: '', manager_note:'', strengths_raw:'', needs_dev_raw:'' }
    );
    this.a360EditMode.set(true);
  }

  async save360(): Promise<void> {
    const id = this.talent()?.id;
    if (!id) return;
    this.a360Saving.set(true);
    const d = this.a360Draft();
    const strengths = d.strengths_raw.split('\n').map(s => s.trim()).filter(Boolean);
    const needs_dev  = d.needs_dev_raw.split('\n').map(s => s.trim()).filter(Boolean);
    const ok = await this.extrasSvc.save(id, {
      a360_overall: d.overall, a360_benchmark: d.benchmark, a360_period: d.period,
      a360_manager_note: d.manager_note,
      a360_strengths: strengths, a360_needs_dev: needs_dev,
    });
    this.a360Saving.set(false);
    if (ok) {
      this.assessment360Data.set({
        overall: d.overall, benchmark: d.benchmark, period: d.period,
        sources: this.assessment360Data()?.sources ?? [],
        criteria: this.assessment360Data()?.criteria ?? [],
        strengths, needs_dev, manager_note: d.manager_note,
      });
      this.a360EditMode.set(false);
      this.msg.success('Đã lưu đánh giá 360°');
    } else {
      this.msg.error('Lưu thất bại — xem console');
    }
  }

  // ─── Score edit helpers ───────────────────────────────────────────────────
  openScoreEdit(): void {
    const s = this.externalScore();
    this.scoreDraft.set({ assessment_score: s?.assessment_score ?? null, score_360: s?.score_360 ?? null });
    this.scoreEditMode.set(true);
  }

  async saveScore(): Promise<void> {
    const id = this.talent()?.id;
    const cycleId = this.selectedCycleId();
    if (!id || !cycleId) { this.msg.warning('Chưa chọn chu kỳ đánh giá'); return; }
    this.scoreSaving.set(true);
    const d = this.scoreDraft();
    const ok = await this.scoreSvc.upsertScore(id, cycleId, d.assessment_score, d.score_360);
    this.scoreSaving.set(false);
    if (ok) {
      const s = await this.scoreSvc.getScoreForEmployee(id, cycleId);
      this.externalScore.set(s);
      this.externalScoreLoaded.set(true);
      this.scoreEditMode.set(false);
      this.msg.success('Đã lưu điểm số');
    } else {
      this.msg.error('Lưu thất bại — xem console');
    }
  }

  setProjectStatus(event: Event): void {
    const v = (event.target as HTMLSelectElement).value;
    this.projectDraft.update(d => ({ ...d, status: v }));
  }

  setKtProgress(event: Event): void {
    const v = +(event.target as HTMLInputElement).value;
    this.ktDraft.update(d => ({ ...d, overall_progress: v }));
  }

  // ─── Mock aspiration generator (deterministic by employee ID) ───────────────
  private buildMockAspiration(t: Talent): PersonalAspiration | null {
    const idNum = parseInt(t.id.replace(/\D/g, ''), 10) || 0;
    // ~25% of employees have no aspiration data yet
    if (idNum % 4 === 0) return null;

    const positions: { pos: string; dept: string; reqs: Record<string,number> }[] = [
      { pos: 'Project Manager',            dept: 'Quản lý dự án',
        reqs: { technical:75, leadership:82, communication:85, problem_solving:90, adaptability:85 } },
      { pos: 'Trưởng phòng Nhân sự',      dept: 'Nhân sự',
        reqs: { technical:68, leadership:85, communication:90, problem_solving:80, adaptability:78 } },
      { pos: 'Giám đốc Tài chính (CFO)',  dept: 'Tài chính',
        reqs: { technical:90, leadership:82, communication:78, problem_solving:88, adaptability:72 } },
      { pos: 'Trưởng nhóm Kỹ thuật',     dept: 'Kỹ thuật',
        reqs: { technical:92, leadership:75, communication:72, problem_solving:87, adaptability:75 } },
      { pos: 'Giám đốc Vận hành',         dept: 'Vận hành',
        reqs: { technical:74, leadership:88, communication:82, problem_solving:86, adaptability:90 } },
      { pos: 'Head of Marketing',          dept: 'Marketing',
        reqs: { technical:65, leadership:80, communication:92, problem_solving:85, adaptability:90 } },
      { pos: 'Business Development Manager', dept: 'Kinh doanh',
        reqs: { technical:66, leadership:78, communication:91, problem_solving:82, adaptability:87 } },
      { pos: 'Trưởng ban Kiểm soát nội bộ', dept: 'Kiểm soát',
        reqs: { technical:86, leadership:76, communication:78, problem_solving:91, adaptability:70 } },
    ];
    const notes = [
      'Muốn phát triển theo hướng quản lý và lãnh đạo đội nhóm',
      'Có nguyện vọng chuyển sang lĩnh vực này trong 2 năm tới',
      'Đang tự học thêm kỹ năng cần thiết để đạt mục tiêu nghề nghiệp',
      'HR ghi nhận qua buổi career conversation tháng 3/2025',
      'Nhân viên chia sẻ trong buổi đánh giá cuối năm 2024',
      'Được khuyến nghị bởi quản lý trực tiếp sau kết quả xuất sắc Q4/2024',
    ];
    const hrNames = ['Nguyễn Thị Lan (HRBP)', 'Trần Minh Tuấn (HR)', 'Phạm Thị Hoa (HRBP)'];

    const choice = positions[idNum % positions.length];
    const source: 'self' | 'hr' = idNum % 3 === 2 ? 'self' : 'hr';

    const c = t.competencies;
    const current: Record<string, number> = {
      technical:       Math.round(c?.technical       ?? t.performance_score ?? 70),
      leadership:      Math.round(c?.leadership      ?? ((t.performance_score ?? 70) * 0.95)),
      communication:   Math.round(c?.communication   ?? ((t.potential_score ?? 70) * 0.9)),
      problem_solving: Math.round(c?.problem_solving ?? ((t.performance_score ?? 70) * 0.92)),
      adaptability:    Math.round(c?.adaptability    ?? ((t.potential_score ?? 70) * 0.88)),
    };

    const labels: Record<string, string> = {
      technical:       'Kỹ thuật chuyên môn',
      leadership:      'Lãnh đạo & Quản lý',
      communication:   'Giao tiếp',
      problem_solving: 'Giải quyết vấn đề',
      adaptability:    'Thích nghi & Đổi mới',
    };

    const gap_rows: CompGapRow[] = Object.entries(choice.reqs)
      .map(([key, required]) => ({
        key,
        label:    labels[key] ?? key,
        current:  current[key] ?? 70,
        required,
        gap:      required - (current[key] ?? 70),
      }))
      .sort((a, b) => b.gap - a.gap);  // biggest shortfall first

    return {
      target_position:    choice.pos,
      target_department:  choice.dept,
      notes:              notes[idNum % notes.length],
      source,
      updated_by:         source === 'hr' ? hrNames[idNum % hrNames.length] : undefined,
      updated_at:         '2025-03-15',
      gap_rows,
    };
  }

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const id = this.embedded
      ? (this.embeddedTalentId ?? '')
      : (this.route.snapshot.paramMap.get('id') ?? '');
    this.loadTalentData(id);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.embedded) return;
    if (changes['embeddedTalentId'] && !changes['embeddedTalentId'].firstChange) {
      this.loadTalentData(this.embeddedTalentId ?? '');
    }
  }

  /**
   * Fetch toàn bộ dữ liệu cho một employee.
   *
   * Khi useMock=true  : mỗi api.get() đọc file mock tương ứng
   * Khi useMock=false : gọi đúng endpoint backend, fetch by ID
   *
   * Endpoint → Mock file mapping:
   *   employees/{id}                 → talent-profile.json
   *   assessments/{id}/latest        → assessment-latest.json
   *   idp/{id}/employee              → idp-employee.json
   *   employees/{id}/review          → career-review.json
   *   employees/{id}/current-project → current-project.json
   *   employees/{id}/knowledge-transfer → knowledge-transfer.json
   *   employees (full list)          → talents.json  (mentor picker)
   */
  private async loadTalentData(id: string): Promise<void> {
    this.loading.set(true);
    this.cyclesLoading.set(true);
    if (!id) { this.loading.set(false); this.cyclesLoading.set(false); return; }

    this.successorNodes.set([]);
    this.showAllSuccessors.set(false);
    this.successionTargetPosition.set(null);
    this.successionTargetDetails.set(null);
    this.pendingMentorName.set(null);
    this.roadmapSummary.set({ hasPending: false, hasConfirmed: false });
    this.talent.set(null);
    this.idp.set(null);
    this.aspiration.set(null);
    this.cycles.set([]);
    this.assessmentView.set(null);
    this.assessmentBlocks.set(null);
    this.radarProfile.set(null);

    // ① Load talent profile first — hero renders immediately after
    const talent = await this.employeeSvc.getById(id);
    this.talent.set(talent);
    if (talent) this.aspiration.set(this.buildMockAspiration(talent));
    this.loading.set(false);   // hero skeleton → real hero

    if (!talent) { this.cyclesLoading.set(false); return; }

    // ② Secondary data in parallel (sections show skeletons until ready)
    const [all, cycles, successors, succTargetInfo, summaries, allPlans] = await Promise.all([
      this.employeeSvc.getAll(),
      this.assessmentSvc.getCycles(),
      this.successionSvc.getSuccessorsForHolder(id).catch(() => []),
      this.successionSvc.getTargetPositionInfo(id).catch(() => null),
      // Lấy danh sách cycle_id có assessment_summary cho employee này
      this.sbSvc.client
        .from('assessment_summary')
        .select('cycle_id')
        .eq('employee_id', id)
        .then(r => new Set((r.data ?? []).map((s: any) => s.cycle_id))),
      // Key-person dependency: vị trí mà nhân viên này là kế thừa DUY NHẤT
      this.successionSvc.getPlans().catch(() => []),
    ]);
    this.allTalents.set(all.data);
    // Show only cycles that have actual assessment data for this employee;
    // fall back to all cycles if none match (e.g., newly created employee).
    const relevantCycles = cycles.filter(c => summaries.has(c.id));
    this.cycles.set(relevantCycles.length > 0 ? relevantCycles : cycles);
    this.successorNodes.set(successors);
    this.successionTargetDetails.set(succTargetInfo);
    this.successionTargetPosition.set(succTargetInfo?.title ?? null);

    // Key-person dependency: tìm vị trí mà talent này là ứng viên DUY NHẤT
    const keyPersonPositions = (allPlans as any[])
      .filter(plan => plan.successors?.length === 1 && plan.successors[0].talent_id === id)
      .map(plan => plan.position_title as string);
    this.positionsWhereOnlySuccessor.set(keyPersonPositions);

    // Pick cycle: ưu tiên cycle có data thật (assessment_summary), sau đó mới fallback.
    // cycles đã sort_order DESC (mới nhất trước) — lấy cycle mới nhất có data.
    const cycleWithData = cycles.find(c => summaries.has(c.id));
    const defaultCycle  = cycleWithData ?? cycles.find(c => c.status === 'closed') ?? cycles[0];
    if (defaultCycle) {
      this.selectedCycleId.set(defaultCycle.id);
      await this.loadAssessmentForCycle(id, defaultCycle.id);
    }
    this.cyclesLoading.set(false);  // assessment skeleton → real assessment

    // IDP
    try {
      const idp = await this.idpSvc.getByEmployee(id);
      if (idp) {
        this.idp.set(idp as any);
        this.idpLoaded.set(true);
        // Nếu IDP đang pending → đảm bảo có approval_request để LM thấy
        if (idp.status === 'pending') {
          this.ensureIdpApprovalRequest(idp).catch(() => {});
        }
      } else {
        this.idpLoaded.set(false);
      }
    } catch { this.idpLoaded.set(false); }

    // Restore pending mentor request từ DB (tránh mất state khi refresh)
    this.restorePendingMentor(id).catch(() => {});

    // Load career roadmap summary cho IDP card
    this.loadRoadmapSummary(id).catch(() => {});

    // Employee extras (project, KT, 360°, quick stats) — fire-and-forget
    this.extrasSvc.getByEmployee(id).then(extras => {
      this.extrasRaw.set(extras);
      if (extras) {
        const p    = extrasToProject(extras);
        const kt   = extrasToKt(extras);
        const a360 = extrasTo360(extras);
        if (p)    this.currentProjectData.set(p);
        if (kt)   this.knowledgeTransferData.set(kt);
        if (a360) this.assessment360Data.set(a360);
      }
    });

    // External scores (assessment_score + score_360 → total)
    this.scoreSvc.getLatestScoreForEmployee(id)
      .then(s => { this.externalScore.set(s); this.externalScoreLoaded.set(true); })
      .catch(() => this.externalScoreLoaded.set(false));

    // History timeline — fire-and-forget (không block loading chính)
    this.loadHistory(id);
  }

  /** Fetch lịch sử hoạt động từ audit_logs + assessment_scores + idp_plans. */
  private async loadHistory(employeeId: string): Promise<void> {
    this.historyLoading.set(true);
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };
    const events: { date: string; text: string; color: string; _ts: number }[] = [];

    // 1. audit_logs — lọc theo employee_id trong details jsonb
    try {
      const { data: logs } = await this.sbSvc.client
        .from('audit_logs')
        .select('timestamp, action, details')
        .order('timestamp', { ascending: false })
        .limit(100);
      // Filter client-side: chỉ giữ log có details.employee_id hoặc details liên quan
      (logs ?? [])
        .filter((l: any) => {
          const d = l.details;
          return d && (d.employee_id === employeeId || d.requestor_id === employeeId);
        })
        .slice(0, 10)
        .forEach((l: any) => events.push({
          date: fmt(l.timestamp),
          text: l.details?.title ?? l.action,
          color: '#4f46e5',
          _ts: new Date(l.timestamp).getTime(),
        }));
    } catch { /* bỏ qua */ }

    // 2. assessment_scores — lấy cycle đã đánh giá (1 event/cycle)
    try {
      const { data: scores } = await this.sbSvc.client
        .from('assessment_scores')
        .select('cycle_id, created_at, assessment_cycles(name)')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });
      const seen = new Set<string>();
      (scores ?? []).forEach((s: any) => {
        if (seen.has(s.cycle_id)) return;
        seen.add(s.cycle_id);
        const cycleName = s.assessment_cycles?.name ?? s.cycle_id;
        events.push({
          date: fmt(s.created_at), text: `Đánh giá KPI — ${cycleName}`,
          color: '#059669', _ts: new Date(s.created_at).getTime(),
        });
      });
    } catch { /* bỏ qua */ }

    // 3. idp_plans
    try {
      const { data: idps } = await this.sbSvc.client
        .from('idp_plans')
        .select('created_at, status')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(5);
      (idps ?? []).forEach((p: any) => events.push({
        date: fmt(p.created_at),
        text: `IDP ${p.status === 'active' ? 'đang thực hiện' : p.status === 'completed' ? 'hoàn thành' : 'tạo mới'}`,
        color: '#0891b2', _ts: new Date(p.created_at).getTime(),
      }));
    } catch { /* bỏ qua */ }

    // Sort mới nhất lên đầu
    events.sort((a, b) => b._ts - a._ts);
    this.historyLogs.set(events.map(({ date, text, color }) => ({ date, text, color })));
    this.historyLoading.set(false);
  }

  /** Load scores + summary cho 1 cycle cụ thể — gọi khi user đổi dropdown. */
  async onCycleChange(cycleId: string | null): Promise<void> {
    this.selectedCycleId.set(cycleId);
    const t = this.talent();
    if (!t || !cycleId) { this.assessmentView.set(null); return; }
    await this.loadAssessmentForCycle(t.id, cycleId);
  }

  private async loadAssessmentForCycle(employeeId: string, cycleId: string): Promise<void> {
    const [view, radar, blocks] = await Promise.all([
      this.assessmentSvc.getAssessment(employeeId, cycleId),
      this.assessmentSvc.getRadarProfile(employeeId, cycleId),
      this.assessmentSvc.getAssessmentBlocks(employeeId, cycleId),
    ]);
    this.assessmentView.set(view);
    this.radarProfile.set(radar);
    this.assessmentBlocks.set(blocks);
    this.expandedBlocks.set(new Set<string>());
    if (view || blocks.blocks.length > 0) this.careerReviewLoaded.set(true);
  }

  goBack(): void {
    if (this.embedded) return;
    this.router.navigate(['/talent']);
  }

  // ─── Mentor picker ────────────────────────────────────────────────────────
  openMentorModal():  void { this.mentorSearch.set(''); this.showMentorModal.set(true); }
  closeMentorModal(): void { this.showMentorModal.set(false); }

  mentorCandidates = computed<Talent[]>(() => {
    const me = this.talent();
    if (!me) return [];
    const q = this.mentorSearch().trim().toLowerCase();
    return this.allTalents()
      .filter(t =>
        t.id !== me.id &&
        t.years_of_experience >= 8 &&
        (t.talent_tier === 'Nòng cốt' || t.talent_tier === 'Kế thừa')
      )
      .filter(t => !q || t.full_name.toLowerCase().includes(q) || t.position.toLowerCase().includes(q) || t.department.toLowerCase().includes(q))
      .sort((a, b) => b.years_of_experience - a.years_of_experience);
  });

  mentorInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  async assignMentor(m: Talent): Promise<void> {
    const current = this.talent();
    if (!current) return;
    this.showMentorModal.set(false);

    if (this.isViewer()) {
      // Viewer: tạo approval request thay vì gán trực tiếp
      this.mentorSubmitting.set(true);
      this.pendingMentorName.set(m.full_name);
      try {
        const user = this.authSvc.currentUser();
        if (!user) return;
        await this.approvalSvc.submit({
          type:               'mentor',
          title:              `Yêu cầu Mentor — ${current.full_name}`,
          description:        `${current.full_name} đề xuất ${m.full_name} làm mentor`,
          ref_id:             current.id,
          requested_by_id:   user.id,
          requested_by_name: user.full_name,
          requested_by_role: user.role,
          department:        current.department,
        });
        this.msg.success('Đã gửi yêu cầu mentor — chờ Line Manager & HR phê duyệt');
      } catch (err: any) {
        this.pendingMentorName.set(null);
        this.msg.error(`Lỗi gửi yêu cầu: ${err.message}`);
      } finally {
        this.mentorSubmitting.set(false);
      }
    } else {
      // Admin / LM / HR: gán mentor trực tiếp
      this.talent.set({ ...current, mentor: m.full_name });
      // TODO: PATCH /employees/{id}/mentor khi backend sẵn sàng
    }
  }

  clearMentor(): void {
    const current = this.talent();
    if (!current) return;
    this.talent.set({ ...current, mentor: null });
    // TODO: DELETE /employees/{id}/mentor khi backend sẵn sàng
  }

  priorityLabel(p: number): string {
    if (p === 1) return 'ưu tiên #1';
    if (p === 2) return 'ưu tiên #2';
    return `#${p}`;
  }

  readinessLabel(r: string): string {
    return r === 'Ready Now' ? 'Sẵn sàng ngay' : r === 'Ready in 1 Year' ? '1 năm' : '2 năm';
  }

  switchCenter(id: string): void {
    if (!id || id === this.talent()?.id) return;
    // Viewer không được xem hồ sơ người khác
    if (this.isViewer()) return;
    if (this.embedded) {
      this.embeddedNavigate.emit(id);
      return;
    }
    this.router.navigate(['/talent', id]).then(() => this.loadTalentData(id));
  }

  /** Khôi phục trạng thái pending mentor từ DB sau khi refresh trang.
   *  Tránh mất state vì pendingMentorName là in-memory signal. */
  private async restorePendingMentor(employeeId: string): Promise<void> {
    const { data } = await this.sbSvc.client
      .from('approval_requests')
      .select('description')
      .eq('type', 'mentor')
      .eq('ref_id', employeeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    // Format description: "X đề xuất Y làm mentor" — extract Y
    const match = (data.description ?? '').match(/đề xuất (.+) làm mentor/);
    this.pendingMentorName.set(match?.[1]?.trim() ?? 'Chờ duyệt');
  }

  /** Fetch trạng thái career roadmap (confirmed / pending) để hiển thị trong IDP card. */
  private async loadRoadmapSummary(employeeId: string): Promise<void> {
    // 1. Lấy danh sách career_roadmaps của employee này
    const { data: roadmaps } = await this.sbSvc.client
      .from('career_roadmaps')
      .select('id, track, target_position')
      .eq('employee_id', employeeId);

    const hasConfirmed = !!roadmaps?.length;
    const confirmedExpert  = roadmaps?.find(r => r.track === 'expert');
    const confirmedManager = roadmaps?.find(r => r.track === 'manager');
    const confirmedRoadmap = confirmedExpert ?? confirmedManager;

    // 2. Kiểm tra có approval_request pending nào cho các roadmap này không
    let hasPending    = false;
    let pendingTrack: 'expert' | 'manager' | undefined;

    if (roadmaps?.length) {
      const ids = roadmaps.map(r => r.id);
      const { data: pending } = await this.sbSvc.client
        .from('approval_requests')
        .select('ref_id')
        .eq('type', 'career_roadmap')
        .eq('status', 'pending')
        .in('ref_id', ids)
        .limit(1)
        .maybeSingle();

      if (pending) {
        hasPending = true;
        pendingTrack = roadmaps.find(r => r.id === pending.ref_id)?.track as 'expert' | 'manager';
      }
    }

    this.roadmapSummary.set({
      hasPending,
      hasConfirmed,
      pendingTrack,
      confirmedTarget: confirmedRoadmap?.target_position ?? undefined,
      confirmedTrack: confirmedExpert ? 'expert' : confirmedManager ? 'manager' : undefined,
    });
  }

  /** Đảm bảo mỗi IDP pending đều có approval_request tương ứng để LM thấy.
   *  Idempotent: kiểm tra trước, chỉ tạo nếu chưa có. */
  private async ensureIdpApprovalRequest(idp: any): Promise<void> {
    // Kiểm tra đã có approval_request cho IDP này chưa
    const { data: existing } = await this.sbSvc.client
      .from('approval_requests')
      .select('id')
      .eq('ref_id', idp.id)
      .eq('type', 'idp')
      .maybeSingle();
    if (existing) return; // Đã có → không tạo thêm

    // Chưa có → tạo mới
    const user    = this.authSvc.currentUser();
    const talent  = this.talent();
    if (!user || !talent) return;

    await this.approvalSvc.submit({
      type:               'idp',
      title:              `IDP ${idp.year} — ${talent.full_name}`,
      description:        `Kế hoạch phát triển cá nhân năm ${idp.year}`,
      ref_id:             idp.id,
      requested_by_id:    user.id,
      requested_by_name:  user.full_name,
      requested_by_role:  user.role,
      department:         talent.department,
    });
  }
}
