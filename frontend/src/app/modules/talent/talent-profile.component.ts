import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Talent, TalentListResponse, Assessment, AssessmentListResponse, IdpPlan, IdpListResponse, RiskFactor } from '../../core/models/models';

@Component({
  selector: 'app-talent-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NzTabsModule, NzProgressModule, NzButtonModule, NzIconModule,
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

  talent     = signal<Talent | null>(null);
  assessment = signal<Assessment | null>(null);
  idp        = signal<IdpPlan | null>(null);
  loading    = signal(true);

  // Mentor picker modal
  allTalents      = signal<Talent[]>([]);
  showMentorModal = signal(false);
  mentorSearch    = signal('');

  // Risk panel collapse
  riskExpanded = signal(true);

  // 360° assessment card collapse
  assessment360Expanded = signal(true);

  // Hardcoded 360° data (sẽ fetch từ backend sau)
  readonly assessment360 = {
    overall: 4.55,
    benchmark: 4.5,
    period: '2024-Annual',
    sources: [
      { label: 'QL', pct: 50 },
      { label: 'ĐN', pct: 30 },
      { label: 'CĐ', pct: 20 },
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
    strengths: [
      'FEA analysis ở đẳng cấp quốc tế',
      'Đầu ra thiết kế không có lỗi major',
      'Mentor hiệu quả',
    ],
    needsDev: [
      'Chưa thăng chức 4 năm',
      'Chưa có mentor',
      'KTP tiến độ thấp 40%',
    ],
    managerNote: 'Cần quyết định nhanh về career track. Rủi ro mất người cao nếu không có lộ trình rõ. Principal Engineer là con đường phù hợp nhất.',
  };

  // ── Đánh giá năng lực (Chu kỳ 2024) — TODO: fetch từ backend /api/v1/talents/:id/review
  readonly careerReview = {
    period: 'Chu kỳ 2024',
    categories: [
      { label: 'Chuyên môn kỹ thuật',  weight: 40, score: 96 },
      { label: 'Kết quả & Hiệu suất',  weight: 30, score: 88 },
      { label: 'Hành vi & Thái độ',    weight: 20, score: 82 },
      { label: 'Tiềm năng phát triển', weight: 10, score: 85 },
    ],
    overall: 91,
    strengths: [
      'FEA analysis ở đẳng cấp quốc tế',
      'Đầu ra thiết kế không có lỗi major',
      'Mentor hiệu quả',
    ],
    needsDev: [
      'Chưa thăng chức 4 năm',
      'Chưa có mentor',
      'KTP tiến độ thấp 40%',
    ],
    managerNote: 'Nhận xét quản lý: Cần quyết định nhanh về career track. Rủi ro mất người cao nếu không có lộ trình rõ. Principal Engineer là con đường phù hợp nhất.',
  };

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

  // ── Dự án hiện tại — TODO: fetch từ /api/v1/talents/:id/current-project
  readonly currentProject = {
    name: 'Sao Vang Dai Nguyet – Jacket Fabrication',
    type: 'EPC',
    role: 'Lead Structural Engineer',
    client: 'Eni Vietnam',
    value: '180M USD',
    status: 'active',
  };

  // ── Thống kê nhanh — TODO: fetch từ /api/v1/talents/:id/stats
  quickStats = computed(() => {
    const t = this.talent();
    return {
      trainingHours: 60,
      lastPromotion: 2020,
      idpProgress: this.idpProgress(),
      riskScore: t?.riskScore ?? 0,
    };
  });

  // ── Kế hoạch Phát triển Cá nhân — TODO: fetch từ /api/v1/talents/:id/idp
  readonly idpPlan = {
    targetPosition: 'Trưởng phòng Kỹ thuật',
    approvedBy: 'Trần Minh Tuấn',
    approvedDate: '2024-06-01',
    status: 'Cần review',
    goals12m: [
      'Quyết định rõ định hướng: Technical Expert track hay Leadership track',
      'Mentoring 2 junior structural engineers',
    ],
    goals2to3y: [
      'Nếu Technical track: đạt Principal Structural Engineer',
      'Nếu Leadership track: chuẩn bị Engineering Manager trong 3 năm',
    ],
  };

  // ── Chuyển giao Tri thức — TODO: fetch từ /api/v1/talents/:id/knowledge-transfer
  readonly knowledgeTransfer = {
    successor: 'Phạm Văn Việt',
    successorRole: 'Commissioning Engineer',
    startDate: '2024-03-01',
    targetDate: '2025-06-30',
    overallProgress: 40,
    items: [
      { title: 'FEA methodology cho Jacket analysis',  category: 'Technical',   status: 'Completed',   progress: 100 },
      { title: 'API RP 2A-WSD design standards',       category: 'Standards',   status: 'In Progress', progress: 60  },
      { title: 'Fatigue analysis workflow',            category: 'Technical',   status: 'In Progress', progress: 30  },
      { title: 'Client communication — Eni Vietnam',   category: 'Soft skills', status: 'Not Started', progress: 0   },
      { title: 'Project handover documentation',       category: 'Process',     status: 'In Progress', progress: 45  },
    ],
  };

  ktStatusColor(status: string): string {
    if (status === 'Completed')   return 'kt-done';
    if (status === 'In Progress') return 'kt-progress';
    return 'kt-pending';
  }

  componentScores = computed(() => {
    const t = this.talent();
    if (!t) return [] as { label: string; value: number }[];
    return [
      { label: 'Kỹ thuật',  value: t.competencies?.technical ?? 0 },
      { label: 'Hiệu suất', value: t.performanceScore },
      { label: 'Hành vi',   value: t.competencies?.communication ?? 0 },
      { label: 'Tiềm năng', value: t.potentialScore },
      { label: 'Tổng hợp',  value: this.overallScore() },
    ];
  });

  assessmentLabels: Record<string, string> = {
    technical: 'Kỹ thuật chuyên môn', leadership: 'Lãnh đạo',
    communication: 'Giao tiếp', strategicThinking: 'Tư duy chiến lược'
  };

  timeline = [
    { date: '04/2026', text: 'Cập nhật hồ sơ nhân tài', color: '#4f46e5' },
    { date: '03/2026', text: 'Hoàn thành đánh giá 360°', color: '#059669' },
    { date: '01/2026', text: 'Bắt đầu IDP 2026', color: '#0891b2' },
    { date: '12/2025', text: 'Được xác nhận vào Talent Pool', color: '#d97706' },
  ];

  // ---- Derived values ----
  initials = computed(() => {
    const name = this.talent()?.fullName ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  roleLevel = computed(() => {
    const pos = (this.talent()?.position ?? '').toLowerCase();
    if (pos.includes('lead')) return 'Lead';
    if (pos.includes('director')) return 'Director';
    if (pos.includes('manager')) return 'Manager';
    if (pos.includes('senior')) return 'Senior';
    if (pos.includes('specialist')) return 'Specialist';
    if (pos.includes('officer')) return 'Officer';
    if (pos.includes('analyst')) return 'Analyst';
    if (pos.includes('engineer')) return 'Engineer';
    return '';
  });

  hireDateFmt = computed(() => {
    const d = this.talent()?.hireDate;
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  });

  tenureYears = computed(() => this.talent()?.tenureYears ?? this.talent()?.yearsOfExperience ?? 0);

  overallScore = computed(() => {
    const t = this.talent();
    if (!t) return 0;
    if (t.overallScore != null) return t.overallScore;
    return Math.round((t.performanceScore + t.potentialScore) / 2);
  });

  overallRank = computed(() => {
    const s = this.overallScore();
    if (s >= 90) return 'Top 5% toàn công ty';
    if (s >= 80) return 'Top 20% toàn công ty';
    if (s >= 70) return 'Trung bình trên';
    return 'Trung bình';
  });

  idpProgress = computed(() => this.idp()?.overallProgress ?? 0);
  ktpProgress = computed(() => this.talent()?.ktpProgress ?? 0);

  isHighRisk = computed(() => (this.talent()?.riskScore ?? 0) >= 60);

  riskLabel = computed(() => {
    const r = this.talent()?.riskScore ?? 0;
    if (r >= 60) return 'Cao — cần chú ý';
    if (r >= 30) return 'Trung bình';
    return 'Thấp';
  });

  riskFactorsList = computed<RiskFactor[]>(() => {
    const t = this.talent();
    if (!t) return [];
    if (t.riskFactors && t.riskFactors.length) return t.riskFactors;

    const out: RiskFactor[] = [];
    if (t.riskScore >= 60) {
      out.push({ title: `Risk score cao (${t.riskScore})`, detail: 'Tổng hợp từ nhiều yếu tố, cần can thiệp sớm', severity: 'high', source: 'Tự động', date: 'Q1/2025' });
    }
    if (!t.mentor) {
      out.push({ title: 'Chưa có mentor', detail: 'Chưa gán mentor trong hệ thống PTNT', severity: 'medium', source: 'HR', date: 'Q1/2025' });
    }
    const ktp = t.ktpProgress ?? 0;
    if (ktp > 0 && ktp < 50) {
      out.push({ title: `KTP tiến độ thấp ${ktp}%`, detail: 'Theo KTP holder progress / kế hoạch chuyển giao', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }
    const idpP = this.idpProgress();
    if (idpP > 0 && idpP < 30) {
      out.push({ title: `IDP tiến độ thấp ${idpP}%`, detail: 'Kế hoạch phát triển cá nhân chưa tiến triển', severity: 'medium', source: 'Tự động', date: 'Q1/2025' });
    }
    if (t.readinessLevel === 'Ready in 2 Years' && t.talentTier === 'Nòng cốt') {
      out.push({ title: 'Thời gian sẵn sàng dài', detail: 'Ready in 2 Years — cần tăng tốc IDP', severity: 'low', source: 'Tự động', date: 'Q1/2025' });
    }
    if (out.length === 0) {
      out.push({ title: 'Không phát hiện yếu tố rủi ro', detail: 'Các chỉ số trong ngưỡng an toàn', severity: 'low', source: 'Tự động', date: 'Q1/2025' });
    }
    return out;
  });

  riskTone = computed<'high' | 'medium' | 'low'>(() => {
    const r = this.talent()?.riskScore ?? 0;
    if (r >= 60) return 'high';
    if (r >= 30) return 'medium';
    return 'low';
  });

  riskVsDeptAvg = computed(() => {
    const t = this.talent();
    if (!t) return 0;
    const peers = this.allTalents().filter(x => x.department === t.department);
    if (peers.length === 0) return 0;
    const avg = peers.reduce((s, x) => s + x.riskScore, 0) / peers.length;
    if (avg <= 0) return 0;
    return Math.round(((t.riskScore - avg) / avg) * 100);
  });

  riskReasons = computed<string[]>(() => {
    const t = this.talent();
    if (!t) return [];
    if (t.riskReasons && t.riskReasons.length) return t.riskReasons;
    const out: string[] = [];
    if (!t.mentor) out.push('Chưa có mentor');
    if ((t.ktpProgress ?? 100) < 50) out.push(`KTP tiến độ thấp ${t.ktpProgress ?? 0}%`);
    if (this.idpProgress() < 50) out.push(`IDP tiến độ thấp ${this.idpProgress()}%`);
    return out;
  });

  tierPillClass = computed(() => {
    const tier = this.talent()?.talentTier;
    if (tier === 'Nòng cốt') return 'pill pill-core';
    if (tier === 'Tiềm năng') return 'pill pill-potential';
    return 'pill pill-successor';
  });

  constructor(private route: ActivatedRoute, private router: Router, private api: ApiService) {}

  ngOnInit(): void {
    const id = this.embedded
      ? (this.embeddedTalentId ?? '')
      : (this.route.snapshot.paramMap.get('id') ?? '');
    this.loadTalentData(id);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.embedded) return;
    if (changes['embeddedTalentId'] && !changes['embeddedTalentId'].firstChange) {
      const id = this.embeddedTalentId ?? '';
      this.loadTalentData(id);
    }
  }

  private loadTalentData(id: string): void {
    this.loading.set(true);
    if (!id) { this.loading.set(false); return; }
    this.api.get<TalentListResponse>('employees', 'talents').subscribe(r => {
      this.allTalents.set(r.data);
      this.talent.set(r.data.find(t => t.id === id) ?? null);
      this.loading.set(false);
    });
    this.api.get<AssessmentListResponse>('assessments', 'assessments').subscribe(r =>
      this.assessment.set(r.data.find(a => a.talentId === id) ?? null));
    this.api.get<IdpListResponse>('idp', 'idp-plans').subscribe(r =>
      this.idp.set(r.data.find(i => i.talentId === id) ?? null));
  }

  goBack(): void {
    if (this.embedded) return;
    this.router.navigate(['/talent']);
  }

  // ---- Mentor picker ----
  openMentorModal(): void { this.mentorSearch.set(''); this.showMentorModal.set(true); }
  closeMentorModal(): void { this.showMentorModal.set(false); }

  mentorCandidates = computed<Talent[]>(() => {
    const me = this.talent();
    if (!me) return [];
    const q = this.mentorSearch().trim().toLowerCase();
    return this.allTalents()
      .filter(t =>
        t.id !== me.id &&
        t.yearsOfExperience >= 8 &&
        (t.talentTier === 'Nòng cốt' || t.talentTier === 'Kế thừa')
      )
      .filter(t => !q || t.fullName.toLowerCase().includes(q) || t.position.toLowerCase().includes(q) || t.department.toLowerCase().includes(q))
      .sort((a, b) => b.yearsOfExperience - a.yearsOfExperience);
  });

  mentorInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  assignMentor(m: Talent): void {
    const current = this.talent();
    if (!current) return;
    this.talent.set({ ...current, mentor: m.fullName });
    this.showMentorModal.set(false);
  }

  clearMentor(): void {
    const current = this.talent();
    if (!current) return;
    this.talent.set({ ...current, mentor: null });
  }

  readinessLabel(r: string): string {
    return r === 'Ready Now' ? 'Sẵn sàng ngay' : r === 'Ready in 1 Year' ? '1 năm' : '2 năm';
  }

  get assessmentEntries(): { key: string; label: string; value: number }[] {
    const s = this.assessment()?.scores;
    if (!s) return [];
    return Object.entries(s).map(([key, value]) => ({ key, label: this.assessmentLabels[key] ?? key, value: value as number }));
  }

  // ---- Radar chart (Hồ sơ năng lực) ----
  private radarLabels = ['Kỹ thuật', 'Hiệu suất', 'Hành vi', 'Tiềm năng', 'Lãnh đạo'];
  private RADAR_CX = 100;
  private RADAR_CY = 100;
  private RADAR_R  = 72;
  private RADAR_LBL_PAD = 14;

  radarEntries = computed(() => {
    const t = this.talent();
    if (!t) return [];
    const c = t.competencies;
    const tgt = t.competencyTargets ?? { technical: 85, performance: 85, behavior: 80, potential: 80, leadership: 85 };
    const values = [
      { label: 'Kỹ thuật',  actual: c?.technical ?? 0,      target: tgt.technical },
      { label: 'Hiệu suất', actual: t.performanceScore,     target: tgt.performance },
      { label: 'Hành vi',   actual: c?.communication ?? 0,  target: tgt.behavior },
      { label: 'Tiềm năng', actual: t.potentialScore,       target: tgt.potential },
      { label: 'Lãnh đạo',  actual: c?.leadership ?? 0,     target: tgt.leadership },
    ];
    return values.map(v => ({ ...v, delta: v.actual - v.target }));
  });

  radarAbove = computed(() => this.radarEntries().filter(e => e.delta >= 0).length);
  radarBelow = computed(() => this.radarEntries().filter(e => e.delta < 0).length);

  private radarPoint(index: number, value: number): { x: number; y: number } {
    const n = this.radarLabels.length;
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = this.RADAR_R * (value / 100);
    return {
      x: this.RADAR_CX + r * Math.cos(angle),
      y: this.RADAR_CY + r * Math.sin(angle),
    };
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
      const lblR = this.RADAR_R + this.RADAR_LBL_PAD;
      const a = (Math.PI * 2 * i) / this.radarLabels.length - Math.PI / 2;
      return {
        label: e.label,
        x2: outer.x,
        y2: outer.y,
        lx: this.RADAR_CX + lblR * Math.cos(a),
        ly: this.RADAR_CY + lblR * Math.sin(a),
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

  // ---- Network (Mạng lưới phát triển) ----
  mentees = computed<Talent[]>(() => {
    const me = this.talent();
    if (!me) return [];
    return this.allTalents().filter(t => t.mentor === me.fullName);
  });

  mentorTalent = computed<Talent | null>(() => {
    const me = this.talent();
    if (!me || !me.mentor) return null;
    return this.allTalents().find(t => t.fullName === me.mentor) ?? null;
  });

  targetInitials = computed(() => {
    const tp = this.talent()?.targetPosition;
    if (!tp) return '—';
    const parts = tp.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return parts.map(p => p[0]).slice(0, 3).join('').toUpperCase();
  });

  centerInitials = computed(() => {
    const name = this.talent()?.fullName ?? '';
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

  switchCenter(id: string): void {
    if (!id || id === this.talent()?.id) return;
    if (this.embedded) {
      this.embeddedNavigate.emit(id);
      return;
    }
    this.router.navigate(['/talent', id]).then(() => {
      this.talent.set(this.allTalents().find(t => t.id === id) ?? null);
      this.api.get<AssessmentListResponse>('assessments', 'assessments').subscribe(r =>
        this.assessment.set(r.data.find(a => a.talentId === id) ?? null));
      this.api.get<IdpListResponse>('idp', 'idp-plans').subscribe(r =>
        this.idp.set(r.data.find(i => i.talentId === id) ?? null));
    });
  }
}
