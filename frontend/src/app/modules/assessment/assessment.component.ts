import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../core/services/api.service';
import { Assessment, AssessmentListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

interface ScoreInput { technical: number; leadership: number; communication: number; strategicThinking: number; }

@Component({
  selector: 'app-assessment',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTabsModule, NzTableModule, NzTagModule,
    NzButtonModule, NzIconModule, NzFormModule, NzSelectModule, NzInputNumberModule,
    NzProgressModule, NzSpinModule, AvatarComponent],
  templateUrl: './assessment.component.html',
  styleUrl: './assessment.component.scss',
})
export class AssessmentComponent implements OnInit {
  assessments = signal<Assessment[]>([]);
  loading     = signal(true);

  // ── Form signals ──────────────────────────────────────────────────────────
  selectedTalentId = signal<string>('');
  scores = signal<ScoreInput>({ technical: 0, leadership: 0, communication: 0, strategicThinking: 0 });

  readonly dimensions: Array<{ key: keyof ScoreInput; label: string }> = [
    { key: 'technical',        label: 'Kỹ thuật' },
    { key: 'leadership',       label: 'Lãnh đạo' },
    { key: 'communication',    label: 'Giao tiếp' },
    { key: 'strategicThinking',label: 'Tư duy chiến lược' },
  ];

  // Only pending assessments available for entry
  pendingAssessments = computed(() => this.assessments().filter(a => a.status !== 'Completed'));

  constructor(private api: ApiService, private msg: NzMessageService) {}

  ngOnInit(): void {
    this.api.get<AssessmentListResponse>('assessments', 'assessments').subscribe({
      next:  r => { this.assessments.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  statusColor(s: string): string  { return ({ Completed: 'green', Pending: 'orange', 'In Progress': 'blue' } as any)[s] ?? 'default'; }
  scoreColor(v: number): string   { return v >= 90 ? '#059669' : v >= 75 ? '#4f46e5' : v >= 60 ? '#d97706' : '#dc2626'; }
  getScore(a: Assessment, dim: string): number { return (a.scores as unknown as Record<string, number>)[dim] ?? 0; }
  updateScore(key: keyof ScoreInput, val: number): void {
    this.scores.update(s => ({ ...s, [key]: val }));
  }

  saveAssessment(): void {
    const talentId = this.selectedTalentId();
    if (!talentId) { this.msg.warning('Vui lòng chọn nhân viên'); return; }
    const s = this.scores();
    const totalScores = [s.technical, s.leadership, s.communication, s.strategicThinking];
    if (totalScores.every(v => v === 0)) { this.msg.warning('Vui lòng nhập ít nhất một điểm số'); return; }

    const overall = Math.round(totalScores.reduce((a, b) => a + b, 0) / totalScores.length);
    const target = this.assessments().find(a => a.talentId === talentId);

    this.assessments.update(list => list.map(a =>
      a.talentId === talentId
        ? { ...a, scores: { ...s }, overallScore: overall, status: 'Completed', assessorCount: (a.assessorCount || 0) + 1 }
        : a
    ));

    // TODO: api.post('assessments', payload).subscribe(...)
    this.msg.success(`Đã lưu đánh giá cho ${target?.talentName ?? talentId}  — Overall: ${overall}`);
    this.selectedTalentId.set('');
    this.scores.set({ technical: 0, leadership: 0, communication: 0, strategicThinking: 0 });
  }
}
