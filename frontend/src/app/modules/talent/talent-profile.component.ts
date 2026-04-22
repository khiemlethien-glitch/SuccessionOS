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
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../core/services/data/employee.service';
import { IdpService } from '../../core/services/data/idp.service';
import { AssessmentService, Cycle, AssessmentView } from '../../core/services/data/assessment.service';
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

// ─── Default fallback values (dùng trong mock mode / khi backend chưa có data) ─
const DEFAULT_360: Assessment360 = {
  overall: 4.55, benchmark: 4.5, period: '2024-Annual',
  sources: [
    { label: 'QL', pct: 50 }, { label: 'ĐN', pct: 30 }, { label: 'CĐ', pct: 20 },
  ],
  criteria: [
    { label: 'Tầm nhìn chiến lược & định hướng',  score: 4.27 },
    { label: 'Ra quyết định & giải quyết vấn đề', score: 4.27 },
    { label: 'Giao tiếp & ảnh hưởng',             score: 4.27 },
    { label: 'Làm việc nhóm & hợp tác',           score: 4.27 },
    { label: 'Tính chuyên nghiệp kỹ thuật',       score: 4.64 },
    { label: 'Chất lượng & an toàn công việc',    score: 4.64 },
    { label: 'Tuân thủ quy trình & tiêu chuẩn',   score: 4.64 },
    { label: 'Hiệu suất & kết quả đầu ra',        score: 4.64 },
    { label: 'Quản lý thời gian & ưu tiên',       score: 4.64 },
    { label: 'Đổi mới & cải tiến',                score: 4.64 },
    { label: 'Phát triển & coaching nhân sự',     score: 4.56 },
    { label: 'Tuân thủ văn hóa & hành vi',        score: 4.26 },
    { label: 'Tiềm năng phát triển',              score: 4.41 },
  ],
  strengths: ['FEA analysis ở đẳng cấp quốc tế', 'Đầu ra thiết kế không có lỗi major', 'Mentor hiệu quả'],
  needs_dev:  ['Chưa thăng chức 4 năm', 'Chưa có mentor', 'KTP tiến độ thấp 40%'],
  manager_note: 'Cần quyết định nhanh về career track. Rủi ro mất người cao nếu không có lộ trình rõ.',
};

const DEFAULT_CAREER_REVIEW: CareerReview = {
  period: 'Chu kỳ 2024',
  categories: [
    { label: 'Chuyên môn kỹ thuật',  weight: 40, score: 96 },
    { label: 'Kết quả & Hiệu suất',  weight: 30, score: 88 },
    { label: 'Hành vi & Thái độ',    weight: 20, score: 82 },
    { label: 'Tiềm năng phát triển', weight: 10, score: 85 },
  ],
  overall: 91,
  strengths: ['FEA analysis ở đẳng cấp quốc tế', 'Đầu ra thiết kế không có lỗi major', 'Mentor hiệu quả'],
  needs_dev:  ['Chưa thăng chức 4 năm', 'Chưa có mentor', 'KTP tiến độ thấp 40%'],
  manager_note: 'Nhận xét quản lý: Cần quyết định nhanh về career track. Rủi ro mất người cao nếu không có lộ trình rõ. Principal Engineer là con đường phù hợp nhất.',
};

const DEFAULT_PROJECT: CurrentProject = {
  name: 'Sao Vang Dai Nguyet – Jacket Fabrication',
  type: 'EPC', role: 'Lead Structural Engineer',
  client: 'Eni Vietnam', value: '180M USD', status: 'active',
};

const DEFAULT_KT: KnowledgeTransfer = {
  successor: 'Phạm Văn Việt', successor_role: 'Commissioning Engineer',
  start_date: '2024-03-01', target_date: '2025-06-30', overall_progress: 40,
  items: [
    { title: 'FEA methodology cho Jacket analysis',  category: 'Technical',   status: 'Completed',   progress: 100 },
    { title: 'API RP 2A-WSD design standards',       category: 'Standards',   status: 'In Progress', progress: 60  },
    { title: 'Fatigue analysis workflow',            category: 'Technical',   status: 'In Progress', progress: 30  },
    { title: 'Client communication — Eni Vietnam',   category: 'Soft skills', status: 'Not Started', progress: 0   },
    { title: 'Project handover documentation',       category: 'Process',     status: 'In Progress', progress: 45  },
  ],
};

@Component({
  selector: 'app-talent-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NzTabsModule, NzSelectModule, NzProgressModule, NzButtonModule, NzIconModule,
    NzTagModule, NzTimelineModule, NzSpinModule, NzModalModule, NzInputModule],
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
  loading    = signal(true);

  // ─── Profile section signals (mỗi section fetch riêng) ───────────────────
  assessment360Data    = signal<Assessment360>(DEFAULT_360);
  careerReviewData     = signal<CareerReview>(DEFAULT_CAREER_REVIEW);
  currentProjectData   = signal<CurrentProject>(DEFAULT_PROJECT);
  knowledgeTransferData = signal<KnowledgeTransfer>(DEFAULT_KT);

  // Trạng thái load từng section: null=loading, true=có data, false=không có data (404/error)
  assessment360Loaded    = signal<boolean | null>(null);
  careerReviewLoaded     = signal<boolean | null>(null);
  currentProjectLoaded   = signal<boolean | null>(null);
  knowledgeTransferLoaded = signal<boolean | null>(null);
  idpLoaded              = signal<boolean | null>(null);

  // ─── Mentor picker ────────────────────────────────────────────────────────
  allTalents      = signal<Talent[]>([]);
  showMentorModal = signal(false);
  mentorSearch    = signal('');

  // ─── Collapse states ──────────────────────────────────────────────────────
  riskExpanded       = signal(true);
  assessment360Expanded = signal(true);

  // ─── Timeline (tĩnh — sẽ fetch từ backend sau) ────────────────────────────
  timeline = [
    { date: '04/2026', text: 'Cập nhật hồ sơ nhân tài', color: '#4f46e5' },
    { date: '03/2026', text: 'Hoàn thành đánh giá 360°', color: '#059669' },
    { date: '01/2026', text: 'Bắt đầu IDP 2026',         color: '#0891b2' },
    { date: '12/2025', text: 'Được xác nhận vào Talent Pool', color: '#d97706' },
  ];

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
    if (t.overall_score != null) return t.overall_score;
    return Math.round(((t.performance_score ?? 0) + (t.potential_score ?? 0)) / 2);
  });

  overallRank = computed(() => {
    const s = this.overallScore();
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

    const out: RiskFactor[] = [];
    const risk = t.risk_score ?? 0;
    if (risk >= 60) {
      out.push({ title: `Risk score cao (${risk})`, detail: 'Tổng hợp từ nhiều yếu tố, cần can thiệp sớm', severity: 'high', source: 'Tự động', date: 'Q1/2025' });
    }
    if (!t.mentor) {
      out.push({ title: 'Chưa có mentor', detail: 'Chưa gán mentor trong hệ thống PTNT', severity: 'medium', source: 'HR', date: 'Q1/2025' });
    }
    const ktp = t.ktp_progress ?? 0;
    if (ktp > 0 && ktp < 50) {
      out.push({ title: `KTP tiến độ thấp ${ktp}%`, detail: 'Theo KTP holder progress / kế hoạch chuyển giao', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }
    const idpP = this.idpProgress();
    if (idpP > 0 && idpP < 30) {
      out.push({ title: `IDP tiến độ thấp ${idpP}%`, detail: 'Kế hoạch phát triển cá nhân chưa tiến triển', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }
    if (t.readiness_level === 'Ready in 2 Years' && t.talent_tier === 'Nòng cốt') {
      out.push({ title: 'Thời gian sẵn sàng dài', detail: 'Ready in 2 Years — cần tăng tốc IDP', severity: 'low', source: 'Tự động', date: 'Q1/2025' });
    }
    if (out.length === 0) {
      out.push({ title: 'Không phát hiện yếu tố rủi ro', detail: 'Các chỉ số trong ngưỡng an toàn', severity: 'low', source: 'Tự động', date: 'Q1/2025' });
    }
    return out;
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
    trainingHours:  60,                         // TODO: từ /employees/{id}/stats
    lastPromotion:  2020,                       // TODO: từ /employees/{id}/stats
    idpProgress:    this.idpProgress(),
    riskScore:      this.talent()?.risk_score ?? 0,
  }));

  // ─── IDP Plan (narrative view cho review card) ─────────────────────────────
  idpTargetPosition = computed(() =>
    this.idp()?.target_position ?? this.talent()?.target_position ?? '—');
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

  radarEntries = computed(() => {
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
    return values.map(v => ({ ...v, delta: v.actual - v.target }));
  });

  radarAbove = computed(() => this.radarEntries().filter(e => e.delta >= 0).length);
  radarBelow = computed(() => this.radarEntries().filter(e => e.delta < 0).length);

  private radarPoint(index: number, value: number): { x: number; y: number } {
    const n = this.radarLabels.length;
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = this.RADAR_R * (value / 100);
    return { x: this.RADAR_CX + r * Math.cos(angle), y: this.RADAR_CY + r * Math.sin(angle) };
  }

  radarActualPath = computed(() =>
    this.radarEntries().map((e, i) => {
      const p = this.radarPoint(i, e.actual);
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
  mentees = computed<Talent[]>(() => {
    const me = this.talent();
    if (!me) return [];
    return this.allTalents().filter(t => t.mentor === me.full_name);
  });

  mentorTalent = computed<Talent | null>(() => {
    const me = this.talent();
    if (!me || !me.mentor) return null;
    return this.allTalents().find(t => t.full_name === me.mentor) ?? null;
  });

  targetInitials = computed(() => {
    const tp = this.talent()?.target_position;
    if (!tp) return '—';
    const parts = tp.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return parts.map((p: string) => p[0]).slice(0, 3).join('').toUpperCase();
  });

  centerInitials = computed(() => {
    const name  = this.talent()?.full_name ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  menteeInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // ─── Assessment (backend-driven với dropdown cycle) ──────────────────────
  cycles           = signal<Cycle[]>([]);
  selectedCycleId  = signal<string | null>(null);
  assessmentView   = signal<AssessmentView | null>(null);

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  private employeeSvc = inject(EmployeeService);
  private idpSvc = inject(IdpService);
  private assessmentSvc = inject(AssessmentService);

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
    if (!id) { this.loading.set(false); return; }

    const [talent, all, cycles] = await Promise.all([
      this.employeeSvc.getById(id),
      this.employeeSvc.getAll(),
      this.assessmentSvc.getCycles(),
    ]);
    this.talent.set(talent);
    this.allTalents.set(all.data);
    this.cycles.set(cycles);

    // Pick cycle: ưu tiên cycle 'closed' gần nhất (có data), fallback cycle đầu.
    const firstClosed = cycles.find(c => c.status === 'closed') ?? cycles[0];
    if (firstClosed) {
      this.selectedCycleId.set(firstClosed.id);
      await this.loadAssessmentForCycle(id, firstClosed.id);
    }

    // IDP
    try {
      const idp = await this.idpSvc.getByEmployee(id);
      if (idp) { this.idp.set(idp as any); this.idpLoaded.set(true); }
      else this.idpLoaded.set(false);
    } catch { this.idpLoaded.set(false); }

    this.loading.set(false);
  }

  /** Load scores + summary cho 1 cycle cụ thể — gọi khi user đổi dropdown. */
  async onCycleChange(cycleId: string | null): Promise<void> {
    this.selectedCycleId.set(cycleId);
    const t = this.talent();
    if (!t || !cycleId) { this.assessmentView.set(null); return; }
    await this.loadAssessmentForCycle(t.id, cycleId);
  }

  private async loadAssessmentForCycle(employeeId: string, cycleId: string): Promise<void> {
    const view = await this.assessmentSvc.getAssessment(employeeId, cycleId);
    this.assessmentView.set(view);
    if (view) this.careerReviewLoaded.set(true);
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

  assignMentor(m: Talent): void {
    const current = this.talent();
    if (!current) return;
    this.talent.set({ ...current, mentor: m.full_name });
    this.showMentorModal.set(false);
    // TODO: PATCH /employees/{id}/mentor khi backend sẵn sàng
  }

  clearMentor(): void {
    const current = this.talent();
    if (!current) return;
    this.talent.set({ ...current, mentor: null });
    // TODO: DELETE /employees/{id}/mentor khi backend sẵn sàng
  }

  readinessLabel(r: string): string {
    return r === 'Ready Now' ? 'Sẵn sàng ngay' : r === 'Ready in 1 Year' ? '1 năm' : '2 năm';
  }

  switchCenter(id: string): void {
    if (!id || id === this.talent()?.id) return;
    if (this.embedded) {
      this.embeddedNavigate.emit(id);
      return;
    }
    this.router.navigate(['/talent', id]).then(() => this.loadTalentData(id));
  }
}
