import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { AuthService } from '../../core/auth/auth.service';
import {
  MentoringService,
  MentoringPairFull,
  MentoringSessionFull,
  SkillScore,
  MentorSuggestion,
} from '../../core/services/data/mentoring.service';

@Component({
  selector: 'app-mentoring',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzTagModule, NzButtonModule, NzIconModule,
    NzProgressModule, NzDrawerModule, NzInputModule, NzInputNumberModule,
    NzDividerModule, NzSpinModule, NzTooltipModule,
    NzSelectModule, NzStepsModule, NzBadgeModule, NzAlertModule,
    NzModalModule, NzPopconfirmModule,
    AvatarComponent,
  ],
  templateUrl: './mentoring.component.html',
  styleUrl: './mentoring.component.scss',
  // nz-drawer teleports to cdk-overlay → SSR DOM mismatch (NG0500)
  host: { ngSkipHydration: 'true' },
})
export class MentoringComponent implements OnInit {
  private mentoringService = inject(MentoringService);
  private authService      = inject(AuthService);
  private msg              = inject(NzMessageService);

  // ── Data signals ──────────────────────────────────────────────────────────────
  pairs         = signal<MentoringPairFull[]>([]);
  pendingPairs  = signal<MentoringPairFull[]>([]);
  sessions      = signal<MentoringSessionFull[]>([]);
  selectedPairId = signal<string | null>(null);
  selectedPair   = computed(() => this.pairs().find(p => p.id === this.selectedPairId()) ?? null);
  loading         = signal(true);
  loadingSessions = signal(false);

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  activeTab = signal<'active' | 'pending' | 'completed'>('active');

  // ── Computed filtered lists ───────────────────────────────────────────────────
  activePairs    = computed(() => this.pairs().filter(p => p.status === 'Active'));
  completedPairs = computed(() => this.pairs().filter(p => p.status === 'Completed' || p.status === 'Rejected' || p.status === 'Cancelled'));

  // ── Create flow (multi-step drawer) ──────────────────────────────────────────
  createOpen    = signal(false);
  createStep    = signal<1 | 2 | 3 | 4>(1);
  draftMenteeId = signal<string>('');
  draftInitiatedBy = signal<'mentee' | 'lm' | 'hr'>('mentee');
  menteeSkills     = signal<SkillScore[]>([]);
  selectedSkillKeys = signal<string[]>([]);
  mentorSuggestions = signal<MentorSuggestion[]>([]);
  draftMentorId    = signal<string>('');
  draftDurationMonths = signal(6);
  draftMonthlyHours   = signal(8);
  draftGoals          = signal('');
  draftJustification  = signal('');
  creating         = signal(false);
  loadingSkills    = signal(false);
  loadingSuggestions = signal(false);
  noAssessmentData = signal(false);

  // ── Employee list for selects ─────────────────────────────────────────────────
  allEmployees = signal<{ id: string; full_name: string; position: string; department_name: string }[]>([]);

  // ── Log session drawer ────────────────────────────────────────────────────────
  logOpen       = signal(false);
  logDate       = signal('');
  logDuration   = signal(60);
  logTitle      = signal('');
  logNotes      = signal('');
  logSubmitting = signal(false);

  // ── Confirm session (mentor) ──────────────────────────────────────────────────
  confirmingSessionId = signal<string | null>(null);
  confirmFeedback     = signal('');
  confirmOpen         = signal(false);

  // ── Reject mentor (decline) ───────────────────────────────────────────────────
  rejectReason  = signal('');
  rejectingPairId = signal<string | null>(null);
  rejectOpen    = signal(false);

  // ── Mentor suggestion selected ────────────────────────────────────────────────
  selectedSuggestion = computed(() =>
    this.mentorSuggestions().find(s => s.employee_id === this.draftMentorId()) ?? null
  );

  // ── Current user helpers ──────────────────────────────────────────────────────
  get currentUser()       { return this.authService.currentUser(); }
  get currentEmployeeId() { return this.currentUser?.employee_id ?? ''; }
  get userRole()          { return this.currentUser?.role ?? 'Viewer'; }
  get isViewer()          { return this.userRole === 'Viewer'; }
  get isLineManager()     { return this.authService.hasRole('Line Manager'); }
  get isHrOrAbove()       { return this.authService.hasRole('HR Manager'); }

  // ─────────────────────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const empId = this.currentEmployeeId;

    const [pairs, pending] = await Promise.all([
      empId ? this.mentoringService.loadMyPairs(empId) : this.mentoringService.loadAllPairs(),
      this.mentoringService.loadPendingForMe(empId, this.userRole),
    ]);

    this.pairs.set(pairs);
    this.pendingPairs.set(pending);
    this.loading.set(false);

    // Auto-select first active pair
    const active = pairs.find(p => p.status === 'Active');
    if (active) this.selectPair(active.id);
  }

  async selectPair(id: string): Promise<void> {
    this.selectedPairId.set(id);
    this.loadingSessions.set(true);
    const sess = await this.mentoringService.loadSessions(id);
    this.sessions.set(sess);
    this.loadingSessions.set(false);
  }

  setTab(tab: 'active' | 'pending' | 'completed'): void {
    this.activeTab.set(tab);
    // Auto-select first of new tab
    let list: MentoringPairFull[];
    if (tab === 'active') list = this.activePairs();
    else if (tab === 'pending') list = this.pendingPairs();
    else list = this.completedPairs();

    if (list.length > 0) this.selectPair(list[0].id);
    else { this.selectedPairId.set(null); this.sessions.set([]); }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Create flow
  // ─────────────────────────────────────────────────────────────────────────────
  async openCreate(): Promise<void> {
    this.createStep.set(1);
    this.draftMenteeId.set(this.isViewer ? (this.currentEmployeeId ?? '') : '');
    this.draftInitiatedBy.set(this.isHrOrAbove ? 'hr' : this.isLineManager ? 'lm' : 'mentee');
    this.draftMentorId.set('');
    this.selectedSkillKeys.set([]);
    this.menteeSkills.set([]);
    this.mentorSuggestions.set([]);
    this.draftDurationMonths.set(6);
    this.draftMonthlyHours.set(8);
    this.draftGoals.set('');
    this.draftJustification.set('');
    this.noAssessmentData.set(false);

    // Load employee list for selects
    if (this.allEmployees().length === 0) {
      const emps = await this.mentoringService.loadEmployees();
      this.allEmployees.set(emps);
    }

    this.createOpen.set(true);
  }

  async goToStep2(): Promise<void> {
    if (!this.draftMenteeId()) {
      this.msg.warning('Vui lòng chọn mentee');
      return;
    }
    this.loadingSkills.set(true);
    const skills = await this.mentoringService.loadMenteeSkills(this.draftMenteeId());
    this.loadingSkills.set(false);

    if (skills.length === 0) {
      this.noAssessmentData.set(true);
    } else {
      this.noAssessmentData.set(false);
      this.menteeSkills.set(skills);
    }
    this.createStep.set(2);
  }

  async goToStep3(): Promise<void> {
    if (this.selectedSkillKeys().length === 0) {
      this.msg.warning('Vui lòng chọn ít nhất 1 kỹ năng cần phát triển');
      return;
    }
    this.createStep.set(3);
    this.loadingSuggestions.set(true);
    const suggestions = await this.mentoringService.suggestMentors(
      this.draftMenteeId(),
      this.selectedSkillKeys(),
      this.menteeSkills(),
    );
    this.mentorSuggestions.set(suggestions);
    this.loadingSuggestions.set(false);
  }

  goToStep4(): void {
    if (!this.draftMentorId()) {
      this.msg.warning('Vui lòng chọn mentor');
      return;
    }
    this.createStep.set(4);
  }

  prevStep(): void {
    if (this.createStep() > 1) this.createStep.set((this.createStep() - 1) as 1 | 2 | 3 | 4);
  }

  toggleSkill(key: string): void {
    const current = this.selectedSkillKeys();
    if (current.includes(key)) {
      this.selectedSkillKeys.set(current.filter(k => k !== key));
    } else {
      this.selectedSkillKeys.set([...current, key]);
    }
  }

  isSkillSelected(key: string): boolean {
    return this.selectedSkillKeys().includes(key);
  }

  selectMentor(empId: string): void {
    this.draftMentorId.set(empId === this.draftMentorId() ? '' : empId);
  }

  async submitCreate(): Promise<void> {
    if (!this.draftGoals().trim()) {
      this.msg.warning('Vui lòng nhập mục tiêu kèm cặp');
      return;
    }
    this.creating.set(true);

    const selectedCriteria = this.menteeSkills().filter(s => this.selectedSkillKeys().includes(s.key));
    const { data, error } = await this.mentoringService.createPair({
      mentor_id:       this.draftMentorId(),
      mentee_id:       this.draftMenteeId(),
      skills:          selectedCriteria.map(s => s.key),
      skill_labels:    selectedCriteria.map(s => s.label),
      initiated_by:    this.draftInitiatedBy(),
      initiator_id:    this.authService.session()?.user?.id ?? '',
      duration_months: this.draftDurationMonths(),
      monthly_hours:   this.draftMonthlyHours(),
      goals:           this.draftGoals(),
      justification:   this.draftJustification(),
    });

    this.creating.set(false);

    if (error) {
      this.msg.error('Không thể tạo cặp kèm cặp: ' + (error.message ?? 'Lỗi không xác định'));
      return;
    }

    this.msg.success('Đã gửi yêu cầu kèm cặp thành công!');
    this.createOpen.set(false);
    await this.loadData();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mentor / Approver respond
  // ─────────────────────────────────────────────────────────────────────────────
  async acceptAsMentor(pairId: string): Promise<void> {
    await this.mentoringService.respondAsMentor(pairId, true);
    this.msg.success('Đã chấp nhận yêu cầu kèm cặp');
    await this.loadData();
  }

  openRejectMentor(pairId: string): void {
    this.rejectingPairId.set(pairId);
    this.rejectReason.set('');
    this.rejectOpen.set(true);
  }

  async submitRejectMentor(): Promise<void> {
    const pairId = this.rejectingPairId();
    if (!pairId) return;
    await this.mentoringService.respondAsMentor(pairId, false, this.rejectReason());
    this.msg.warning('Đã từ chối yêu cầu kèm cặp');
    this.rejectOpen.set(false);
    await this.loadData();
  }

  async respondAsApprover(pairId: string, accept: boolean, role: 'lm' | 'hr'): Promise<void> {
    await this.mentoringService.respondAsApprover(pairId, accept, role);
    this.msg.success(accept ? 'Đã phê duyệt' : 'Đã từ chối');
    await this.loadData();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Session log
  // ─────────────────────────────────────────────────────────────────────────────
  openLogSession(): void {
    this.logDate.set(new Date().toISOString().split('T')[0]);
    this.logDuration.set(60);
    this.logTitle.set('');
    this.logNotes.set('');
    this.logOpen.set(true);
  }

  async submitLog(): Promise<void> {
    if (!this.logDate() || !this.logTitle().trim()) {
      this.msg.warning('Vui lòng nhập ngày và tiêu đề buổi gặp');
      return;
    }
    const pairId = this.selectedPairId();
    if (!pairId) return;

    this.logSubmitting.set(true);
    await this.mentoringService.logSession({
      pair_id:          pairId,
      session_date:     this.logDate(),
      duration_minutes: this.logDuration(),
      title:            this.logTitle(),
      mentee_notes:     this.logNotes(),
      logged_by:        this.currentEmployeeId,
    });
    this.logSubmitting.set(false);
    this.msg.success('Đã ghi nhận buổi kèm cặp');
    this.logOpen.set(false);

    // Reload sessions
    const sess = await this.mentoringService.loadSessions(pairId);
    this.sessions.set(sess);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Confirm session
  // ─────────────────────────────────────────────────────────────────────────────
  openConfirmSession(sessionId: string): void {
    this.confirmingSessionId.set(sessionId);
    this.confirmFeedback.set('');
    this.confirmOpen.set(true);
  }

  async submitConfirm(): Promise<void> {
    const sessionId = this.confirmingSessionId();
    if (!sessionId) return;
    await this.mentoringService.confirmSession(sessionId, this.confirmFeedback());
    this.msg.success('Đã xác nhận buổi kèm cặp');
    this.confirmOpen.set(false);

    // Reload sessions
    const pairId = this.selectedPairId();
    if (pairId) {
      const sess = await this.mentoringService.loadSessions(pairId);
      this.sessions.set(sess);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  statusColor(s: string): string {
    const map: Record<string, string> = {
      Active:         'blue',
      Completed:      'green',
      PendingMentor:  'gold',
      PendingLM:      'orange',
      PendingHR:      'purple',
      Rejected:       'red',
      Cancelled:      'default',
      Paused:         'cyan',
    };
    return map[s] ?? 'default';
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      Active:         'Đang kèm cặp',
      Completed:      'Hoàn thành',
      PendingMentor:  'Chờ Mentor',
      PendingLM:      'Chờ LM duyệt',
      PendingHR:      'Chờ HR duyệt',
      Rejected:       'Đã từ chối',
      Cancelled:      'Đã hủy',
      Paused:         'Tạm dừng',
    };
    return map[s] ?? s;
  }

  sessionStatusColor(s: string): string {
    return s === 'confirmed' || s === 'auto_confirmed' ? '#059669' : '#d97706';
  }

  sessionStatusLabel(s: string): string {
    if (s === 'confirmed') return 'Đã xác nhận';
    if (s === 'auto_confirmed') return 'Tự xác nhận';
    return 'Chờ xác nhận';
  }

  progressPct(pair: MentoringPairFull): number {
    const totalHours = pair.duration_months * pair.monthly_hours;
    if (!totalHours) return 0;
    return Math.min(100, Math.round((pair.confirmed_hours / totalHours) * 100));
  }

  totalHours(pair: MentoringPairFull): number {
    return pair.duration_months * pair.monthly_hours;
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('vi-VN');
    } catch { return d; }
  }

  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h} giờ ${m} phút`;
    if (h > 0) return `${h} giờ`;
    return `${m} phút`;
  }

  // Can the current user log a session for this pair (must be mentee)
  canLogSession(pair: MentoringPairFull | null): boolean {
    if (!pair || pair.status !== 'Active') return false;
    return pair.mentee_id === this.currentEmployeeId || this.isHrOrAbove;
  }

  // Can the current user confirm a session (must be mentor)
  canConfirmSession(pair: MentoringPairFull | null, session: MentoringSessionFull): boolean {
    if (!pair || session.status !== 'pending_confirm') return false;
    return pair.mentor_id === this.currentEmployeeId || this.isHrOrAbove;
  }

  // Is this pair pending mentor action from current user
  isPendingMentorAction(pair: MentoringPairFull): boolean {
    return pair.status === 'PendingMentor' && pair.mentor_id === this.currentEmployeeId;
  }

  // Is this pair pending LM action
  isPendingLmAction(pair: MentoringPairFull): boolean {
    return pair.status === 'PendingLM' && this.isLineManager;
  }

  // Is this pair pending HR action
  isPendingHrAction(pair: MentoringPairFull): boolean {
    return pair.status === 'PendingHR' && this.isHrOrAbove;
  }

  // Get score color (green = high, yellow = medium, red = low)
  scoreColor(score: number, maxScore: number): string {
    const pct = score / maxScore;
    if (pct >= 0.7) return '#059669';
    if (pct >= 0.4) return '#d97706';
    return '#dc2626';
  }

  gapBadgeColor(gap: number): string {
    if (gap >= 40) return '#059669';
    if (gap >= 25) return '#4f46e5';
    return '#d97706';
  }

  // Skill score bar width
  scoreBarWidth(score: number, maxScore: number): number {
    return Math.min(100, (score / maxScore) * 100);
  }

  // Current tab's displayed pairs
  get currentTabPairs(): MentoringPairFull[] {
    if (this.activeTab() === 'active')    return this.activePairs();
    if (this.activeTab() === 'pending')   return this.pendingPairs();
    return this.completedPairs();
  }

  get pendingCount(): number { return this.pendingPairs().length; }

  // Step indicator current index (0-based for nz-steps)
  get stepIndex(): number { return this.createStep() - 1; }
}
