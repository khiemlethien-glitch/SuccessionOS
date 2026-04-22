import { Component, OnInit, signal } from '@angular/core';
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
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../core/services/api.service';
import { MentoringPair, MentoringListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

interface MentoringSession { date: string; summary: string; nextAction: string; }

@Component({
  selector: 'app-mentoring',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTagModule, NzButtonModule, NzIconModule,
    NzProgressModule, NzDrawerModule, NzInputModule, NzInputNumberModule,
    NzDividerModule, NzSpinModule, NzToolTipModule, AvatarComponent],
  templateUrl: './mentoring.component.html',
  styleUrl: './mentoring.component.scss',
})
export class MentoringComponent implements OnInit {
  pairs   = signal<MentoringPair[]>([]);
  loading = signal(true);

  // ── Create pair drawer ────────────────────────────────────────────────────
  showCreateDrawer = signal(false);
  draftMentorName  = signal('');
  draftMenteeName  = signal('');
  draftFocus       = signal('');
  draftStartDate   = signal('');
  draftEndDate     = signal('');
  draftSessions    = signal(8);

  // ── Logbook drawer ────────────────────────────────────────────────────────
  showLogbook     = signal(false);
  logbookPair     = signal<MentoringPair | null>(null);
  logbookSessions = signal<MentoringSession[]>([]);
  showLogForm     = signal(false);
  logDate         = signal('');
  logSummary      = signal('');
  logNextAction   = signal('');

  readonly PAIR_SESSIONS: Record<string, MentoringSession[]> = {
    'M001': [
      { date: '2026-04-10', summary: 'Thảo luận định hướng lãnh đạo chiến lược 3 năm tới', nextAction: 'Đọc "The Leadership Pipeline"' },
      { date: '2026-03-27', summary: 'Review kỹ năng trình bày và ra quyết định', nextAction: 'Chuẩn bị case study thực tế' },
      { date: '2026-03-13', summary: 'Phân tích năng lực lãnh đạo hiện tại qua 360°', nextAction: 'Self-assessment 360°' },
      { date: '2026-02-28', summary: 'Xây dựng IDP và mục tiêu kèm cặp', nextAction: 'Gửi IDP đã chỉnh sửa cho mentor' },
      { date: '2026-02-14', summary: 'Giới thiệu chương trình và thiết lập kỳ vọng', nextAction: 'Lên lịch gặp định kỳ 2 tuần/lần' },
    ],
    'M002': [
      { date: '2026-04-15', summary: 'Review scope & timeline quản lý dự án kỹ thuật', nextAction: 'Thực hành WBS trên dự án thực' },
      { date: '2026-03-31', summary: 'Kỹ năng quản lý rủi ro kỹ thuật', nextAction: 'Lập risk register mẫu' },
      { date: '2026-03-17', summary: 'Giới thiệu framework quản lý dự án kỹ thuật', nextAction: 'Đọc tài liệu PMBoK cơ bản' },
    ],
    'M003': [
      { date: '2026-04-02', summary: 'Phân tích báo cáo tài chính thực tế Q4/2025', nextAction: 'Luyện tập phân tích DCF model' },
      { date: '2026-03-18', summary: 'Giới thiệu financial modeling và phân tích tỷ số tài chính', nextAction: 'Xây dựng mô hình Excel cơ bản' },
    ],
    'M004': [
      { date: '2026-03-15', summary: 'Tổng kết chương trình — đánh giá thành quả 6 tháng', nextAction: 'Hoàn thành báo cáo cuối khóa' },
      { date: '2026-02-14', summary: 'Simulation: xử lý sự cố HSE trong tình huống khẩn cấp', nextAction: 'Soạn thảo SOP mới' },
      { date: '2026-01-30', summary: 'Leadership trong tình huống khủng hoảng an toàn', nextAction: 'Trình bày phương án với ban giám đốc' },
      { date: '2026-01-15', summary: 'Phân tích case study HSE từ các dự án lớn quốc tế', nextAction: 'Nghiên cứu quy trình HSE tiêu chuẩn ISO' },
      { date: '2025-12-20', summary: 'Kỹ năng audit an toàn nội bộ và lập báo cáo', nextAction: 'Thực hiện audit thử trên 1 công trình' },
      { date: '2025-11-22', summary: 'Review quy định pháp lý HSE Việt Nam 2024', nextAction: 'Tổng hợp các thay đổi pháp lý quan trọng' },
      { date: '2025-10-28', summary: 'Nâng cao kỹ năng quản lý đội nhóm HSE', nextAction: 'Thiết kế chương trình đào tạo HSE nội bộ' },
      { date: '2025-10-01', summary: 'Buổi khởi động: Mục tiêu chương trình kèm cặp 6 tháng', nextAction: 'Lên lịch và cam kết mục tiêu' },
    ],
  };

  constructor(private api: ApiService, private msg: NzMessageService) {}

  ngOnInit(): void {
    this.api.get<MentoringListResponse>('mentoring-pairs', 'mentoring-pairs').subscribe({
      next:  r => { this.pairs.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  statusColor(s: string): string { return ({ Active: 'blue', Completed: 'green' } as any)[s] ?? 'default'; }
  progress(p: MentoringPair): number { return Math.round((p.sessionsCompleted / p.sessionsTotal) * 100); }
  sessionCount(pairId: string): number { return this.PAIR_SESSIONS[pairId]?.length ?? 0; }

  // ── Create pair ───────────────────────────────────────────────────────────
  openCreate(): void {
    this.draftMentorName.set('');
    this.draftMenteeName.set('');
    this.draftFocus.set('');
    this.draftStartDate.set('');
    this.draftEndDate.set('');
    this.draftSessions.set(8);
    this.showCreateDrawer.set(true);
  }

  submitPair(): void {
    if (!this.draftMentorName().trim()) { this.msg.warning('Vui lòng nhập tên Mentor'); return; }
    if (!this.draftMenteeName().trim()) { this.msg.warning('Vui lòng nhập tên Mentee'); return; }
    if (!this.draftFocus().trim())      { this.msg.warning('Vui lòng nhập lĩnh vực phát triển'); return; }
    const newPair: MentoringPair = {
      id: `M${Date.now()}`,
      mentorId: `T_m${Date.now()}`, mentorName: this.draftMentorName(),
      menteeId:  `T_e${Date.now()}`, menteeName: this.draftMenteeName(),
      focus: this.draftFocus(),
      startDate: this.draftStartDate(), endDate: this.draftEndDate(),
      status: 'Active',
      sessionsCompleted: 0, sessionsTotal: this.draftSessions(),
      nextSession: null,
    };
    this.pairs.update(list => [newPair, ...list]);
    this.showCreateDrawer.set(false);
    this.msg.success('Đã tạo cặp kèm cặp mới!');
  }

  // ── Logbook ───────────────────────────────────────────────────────────────
  openLogbook(pair: MentoringPair): void {
    this.logbookPair.set(pair);
    this.logbookSessions.set([...(this.PAIR_SESSIONS[pair.id] ?? [])]);
    this.showLogForm.set(false);
    this.logDate.set('');
    this.logSummary.set('');
    this.logNextAction.set('');
    this.showLogbook.set(true);
  }

  addSessionLog(): void {
    if (!this.logDate() || !this.logSummary().trim()) {
      this.msg.warning('Vui lòng nhập ngày và nội dung buổi gặp');
      return;
    }
    const session: MentoringSession = {
      date: this.logDate(),
      summary: this.logSummary(),
      nextAction: this.logNextAction(),
    };
    this.logbookSessions.update(ss => [session, ...ss]);
    const pair = this.logbookPair();
    if (pair) {
      this.pairs.update(list => list.map(p =>
        p.id === pair.id
          ? { ...p, sessionsCompleted: Math.min(p.sessionsCompleted + 1, p.sessionsTotal) }
          : p
      ));
    }
    this.showLogForm.set(false);
    this.logDate.set('');
    this.logSummary.set('');
    this.logNextAction.set('');
    this.msg.success('Đã ghi log buổi gặp!');
  }
}
