import {
  Component, Input, OnChanges, SimpleChanges,
  signal, computed, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  CareerRoadmapService,
  CareerRoadmap,
  SkillGap,
  CourseItem,
} from '../../../core/services/data/career-roadmap.service';
import { ApprovalService } from '../../../core/services/data/approval.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Talent } from '../../../core/models/models';

@Component({
  selector: 'app-career-roadmap',
  standalone: true,
  imports: [CommonModule, FormsModule, NzIconModule, NzSpinModule, NzButtonModule, NzModalModule, NzTagModule],
  providers: [NzMessageService],
  templateUrl: './career-roadmap.component.html',
  styleUrl: './career-roadmap.component.scss',
})
export class CareerRoadmapComponent implements OnChanges {
  @Input() talent: Talent | null = null;

  private svc         = inject(CareerRoadmapService);
  private approvalSvc = inject(ApprovalService);
  private authSvc     = inject(AuthService);
  private msg         = inject(NzMessageService);

  // ── Role ─────────────────────────────────────────────────────────────────
  readonly isViewer = computed(() => this.authSvc.isViewer());

  // ── Approval submit ───────────────────────────────────────────────────────
  submitting    = signal(false);
  submitTrack   = signal<'expert' | 'manager' | null>(null);
  submitNote    = signal('');
  /** submitted track+status per-track: null=not submitted, 'pending'|'submitted' */
  submittedExpert  = signal(false);
  submittedManager = signal(false);
  isSubmitted(track: 'expert' | 'manager') {
    return track === 'expert' ? this.submittedExpert() : this.submittedManager();
  }

  // ── DB state (confirmed, from Supabase) ──────────────────────────────────
  expertConfirmed  = signal<CareerRoadmap | null>(null);
  managerConfirmed = signal<CareerRoadmap | null>(null);

  // ── In-memory draft (generated, not yet saved) ───────────────────────────
  expertDraft  = signal<CareerRoadmap | null>(null);
  managerDraft = signal<CareerRoadmap | null>(null);

  // ── Loading flags ────────────────────────────────────────────────────────
  loadingData       = signal(false);
  expertGenerating  = signal(false);
  managerGenerating = signal(false);
  expertSaving      = signal(false);
  managerSaving     = signal(false);

  // ── UI ───────────────────────────────────────────────────────────────────
  activeTab = signal<'expert' | 'manager'>('expert');

  // ── Derived ──────────────────────────────────────────────────────────────
  expertDisplay  = computed(() => this.expertDraft()  ?? this.expertConfirmed());
  managerDisplay = computed(() => this.managerDraft() ?? this.managerConfirmed());

  // ─────────────────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges) {
    if (changes['talent'] && this.talent?.id) this.load();
  }

  async load() {
    if (!this.talent?.id) return;
    this.loadingData.set(true);
    const { expert, manager } = await this.svc.fetchConfirmed(this.talent.id);
    this.expertConfirmed.set(expert);
    this.managerConfirmed.set(manager);
    this.loadingData.set(false);
  }

  // ── Helpers called from template ─────────────────────────────────────────

  isGenerating(track: 'expert' | 'manager') {
    return track === 'expert' ? this.expertGenerating() : this.managerGenerating();
  }
  isSaving(track: 'expert' | 'manager') {
    return track === 'expert' ? this.expertSaving() : this.managerSaving();
  }
  hasDraft(track: 'expert' | 'manager') {
    return track === 'expert' ? !!this.expertDraft() : !!this.managerDraft();
  }
  isConfirmedOnly(track: 'expert' | 'manager') {
    const has = track === 'expert' ? !!this.expertConfirmed() : !!this.managerConfirmed();
    return has && !this.hasDraft(track);
  }
  getDisplay(track: 'expert' | 'manager'): CareerRoadmap | null {
    return track === 'expert' ? this.expertDisplay() : this.managerDisplay();
  }
  private getDraft(track: 'expert' | 'manager'): CareerRoadmap | null {
    return track === 'expert' ? this.expertDraft() : this.managerDraft();
  }
  private setDraft(track: 'expert' | 'manager', val: CareerRoadmap | null) {
    if (track === 'expert') this.expertDraft.set(val);
    else this.managerDraft.set(val);
  }

  fmtDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }

  levelDots(n: number): number[] { return Array.from({ length: n }, (_, i) => i + 1); }

  courseIcon(type: string): string {
    return ({ monitor: 'desktop', certificate: 'safety-certificate', book: 'read', video: 'video-camera' } as Record<string, string>)[type] ?? 'file-text';
  }

  priorityLabel(p: string) {
    return ({ core: 'Cốt lõi', important: 'Quan trọng', 'nice-to-have': 'Tham khảo' } as Record<string, string>)[p] ?? p;
  }

  // ── Generate ─────────────────────────────────────────────────────────────

  async generate(track: 'expert' | 'manager') {
    if (!this.talent) return;
    track === 'expert' ? this.expertGenerating.set(true) : this.managerGenerating.set(true);
    try {
      const roadmap = await this.svc.callOpenAI(this.talent, track);
      this.setDraft(track, roadmap);
    } catch (err: any) {
      this.msg.error(`Lỗi AI: ${err.message}`);
    } finally {
      track === 'expert' ? this.expertGenerating.set(false) : this.managerGenerating.set(false);
    }
  }

  // ── Confirm → save to DB ─────────────────────────────────────────────────

  async confirm(track: 'expert' | 'manager') {
    const draft = this.getDraft(track);
    if (!draft) return;
    track === 'expert' ? this.expertSaving.set(true) : this.managerSaving.set(true);
    try {
      const saved = await this.svc.save(draft);
      if (track === 'expert') this.expertConfirmed.set(saved);
      else this.managerConfirmed.set(saved);
      this.setDraft(track, null);
      this.msg.success('✓ Đã lưu lộ trình thành công!');
    } catch (err: any) {
      this.msg.error(`Lỗi lưu: ${err.message}`);
    } finally {
      track === 'expert' ? this.expertSaving.set(false) : this.managerSaving.set(false);
    }
  }

  cancelDraft(track: 'expert' | 'manager') { this.setDraft(track, null); }

  // ── Submit for approval (Viewer only) ────────────────────────────────────

  openSubmitModal(track: 'expert' | 'manager') {
    this.submitTrack.set(track);
    this.submitNote.set('');
  }

  closeSubmitModal() { this.submitTrack.set(null); }

  async confirmSubmit() {
    const track = this.submitTrack();
    if (!track || !this.talent) return;

    const user = this.authSvc.currentUser();
    if (!user) return;

    const draft = this.getDraft(track);
    this.submitting.set(true);
    try {
      // 1. Save roadmap to DB first (as confirmed record)
      const roadmapToSave = draft;
      let savedRef: string | undefined;
      if (roadmapToSave) {
        const saved = await this.svc.save(roadmapToSave);
        savedRef = saved.id;
        if (track === 'expert') this.expertConfirmed.set(saved);
        else this.managerConfirmed.set(saved);
        this.setDraft(track, null);
      } else {
        // Already confirmed — just submit existing
        savedRef = this.getDisplay(track)?.id;
      }

      // 2. Create approval request
      const trackLabel = track === 'expert' ? 'Chuyên gia Kỹ thuật' : 'Nhà Quản Lý';
      await this.approvalSvc.submit({
        type:               'career_roadmap',
        title:              `Lộ trình ${trackLabel} — ${this.talent.full_name}`,
        description:        this.submitNote().trim() || `Đề xuất phê duyệt lộ trình phát triển theo hướng ${trackLabel}`,
        ref_id:             savedRef,
        requested_by_id:   user.id,
        requested_by_name: user.full_name,
        requested_by_role: user.role,
        department:        this.talent.department,
      });

      if (track === 'expert') this.submittedExpert.set(true);
      else this.submittedManager.set(true);
      this.msg.success('✓ Đã gửi phê duyệt thành công!');
    } catch (err: any) {
      this.msg.error(`Lỗi gửi phê duyệt: ${err.message}`);
    } finally {
      this.submitting.set(false);
      this.submitTrack.set(null);
    }
  }

  // ── Inline edit — remove ──────────────────────────────────────────────────

  removeStrength(track: 'expert' | 'manager', i: number) {
    const d = this.getDraft(track); if (!d) return;
    this.setDraft(track, { ...d, strengths: d.strengths.filter((_, j) => j !== i) });
  }
  removeChallenge(track: 'expert' | 'manager', i: number) {
    const d = this.getDraft(track); if (!d) return;
    this.setDraft(track, { ...d, challenges: d.challenges.filter((_, j) => j !== i) });
  }
  removeSkillGap(track: 'expert' | 'manager', gi: number) {
    const d = this.getDraft(track); if (!d) return;
    this.setDraft(track, { ...d, skill_gaps: d.skill_gaps.filter((_, j) => j !== gi) });
  }
  removeCourse(track: 'expert' | 'manager', gi: number, ci: number) {
    const d = this.getDraft(track); if (!d) return;
    const gaps = d.skill_gaps.map((g, j) =>
      j !== gi ? g : { ...g, courses: g.courses.filter((_, k) => k !== ci) }
    );
    this.setDraft(track, { ...d, skill_gaps: gaps });
  }
  removeTask(track: 'expert' | 'manager', pi: number, ti: number) {
    const d = this.getDraft(track); if (!d) return;
    const phases = d.phases.map((p, j) =>
      j !== pi ? p : { ...p, tasks: p.tasks.filter((_, k) => k !== ti) }
    );
    this.setDraft(track, { ...d, phases });
  }

  // ── Inline edit — add ─────────────────────────────────────────────────────

  addStrength(track: 'expert' | 'manager') {
    const text = window.prompt('Nhập điểm mạnh:');
    if (!text?.trim()) return;
    const d = this.getDraft(track); if (!d) return;
    this.setDraft(track, { ...d, strengths: [...d.strengths, text.trim()] });
  }
  addChallenge(track: 'expert' | 'manager') {
    const text = window.prompt('Nhập thách thức:');
    if (!text?.trim()) return;
    const d = this.getDraft(track); if (!d) return;
    this.setDraft(track, { ...d, challenges: [...d.challenges, text.trim()] });
  }
  addTask(track: 'expert' | 'manager', pi: number) {
    const text = window.prompt('Nhập nhiệm vụ mới:');
    if (!text?.trim()) return;
    const d = this.getDraft(track); if (!d) return;
    const phases = d.phases.map((p, j) =>
      j !== pi ? p : { ...p, tasks: [...p.tasks, text.trim()] }
    );
    this.setDraft(track, { ...d, phases });
  }
  addCourse(track: 'expert' | 'manager', gi: number) {
    const name = window.prompt('Tên khóa học:');
    if (!name?.trim()) return;
    const provider = window.prompt('Nhà cung cấp:') ?? '';
    const d = this.getDraft(track); if (!d) return;
    const course: CourseItem = {
      id: Date.now().toString(), name: name.trim(), provider: provider.trim(),
      duration: '', price: 'Liên hệ', language: 'Vietnamese', icon_type: 'book', features: [],
    };
    const gaps = d.skill_gaps.map((g, j) =>
      j !== gi ? g : { ...g, courses: [...g.courses, course] }
    );
    this.setDraft(track, { ...d, skill_gaps: gaps });
  }
}
