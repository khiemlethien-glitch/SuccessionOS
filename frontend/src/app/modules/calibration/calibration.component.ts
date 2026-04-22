import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { ApiService } from '../../core/services/api.service';
import { CalibrationSession, CalibrationListResponse } from '../../core/models/models';

@Component({
  selector: 'app-calibration',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTagModule, NzButtonModule, NzIconModule,
    NzTableModule, NzModalModule, NzInputModule, NzSpinModule, NzPopconfirmModule],
  templateUrl: './calibration.component.html',
  styleUrl: './calibration.component.scss',
  host: { ngSkipHydration: 'true' },
})
export class CalibrationComponent implements OnInit {
  sessions = signal<CalibrationSession[]>([]);
  loading  = signal(true);

  // ── Create session modal ──────────────────────────────────────────────────
  showCreate    = signal(false);
  draftTitle    = signal('');
  draftFacilitt = signal('');
  draftDate     = signal('');

  constructor(private api: ApiService, private msg: NzMessageService) {}

  ngOnInit(): void {
    this.api.get<CalibrationListResponse>('calibration-sessions', 'calibration-sessions').subscribe({
      next:  r => { this.sessions.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  statusColor(s: string): string { return ({ Completed: 'green', Draft: 'orange' } as any)[s] ?? 'default'; }

  // ── Create session ────────────────────────────────────────────────────────
  openCreate(): void {
    this.draftTitle.set('');
    this.draftFacilitt.set('');
    this.draftDate.set(new Date().toISOString().slice(0, 10));
    this.showCreate.set(true);
  }

  submitSession(): void {
    if (!this.draftTitle().trim()) { this.msg.warning('Vui lòng nhập tiêu đề phiên họp'); return; }
    const newSession: CalibrationSession = {
      id: `CAL_${Date.now()}`,
      title: this.draftTitle().trim(),
      facilitator: this.draftFacilitt().trim() || 'HR Team',
      date: this.draftDate(),
      status: 'Draft',
      locked: false,
      participants: [],
      calibrations: [],
    };
    this.sessions.update(list => [newSession, ...list]);
    this.showCreate.set(false);
    this.msg.success(`Đã tạo phiên họp "${newSession.title}"`);
    // TODO: api.post('calibration-sessions', newSession).subscribe(...)
  }

  // ── Lock session ──────────────────────────────────────────────────────────
  lockSession(id: string): void {
    this.sessions.update(list => list.map(s =>
      s.id === id ? { ...s, locked: true, status: 'Completed' } : s
    ));
    this.msg.success('Phiên họp đã được lock — không thể chỉnh sửa thêm');
    // TODO: api.patch(`calibration-sessions/${id}/lock`, {}).subscribe(...)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  exportSession(s: CalibrationSession): void {
    this.msg.info(`Đang xuất kết quả "${s.title}" — tính năng sẽ tạo file Excel`);
    // TODO: api.get(`calibration-sessions/${s.id}/export`) → download
  }
}
