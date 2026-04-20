import { Component, OnInit, signal } from '@angular/core';
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
import { ApiService } from '../../core/services/api.service';
import { Assessment, AssessmentListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

@Component({
  selector: 'app-assessment',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTabsModule, NzTableModule, NzTagModule,
    NzButtonModule, NzIconModule, NzFormModule, NzSelectModule, NzInputNumberModule,
    NzProgressModule, AvatarComponent],
  templateUrl: './assessment.component.html',
  styleUrl: './assessment.component.scss',
})
export class AssessmentComponent implements OnInit {
  assessments = signal<Assessment[]>([]);
  loading     = signal(true);

  constructor(private api: ApiService) {}
  ngOnInit(): void {
    this.api.get<AssessmentListResponse>('assessments','assessments').subscribe({ next: r => { this.assessments.set(r.data); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  statusColor(s: string): string { return { Completed:'green', Pending:'orange', 'In Progress':'blue' }[s] ?? 'default'; }
  scoreColor(v: number): string  { return v >= 90 ? '#059669' : v >= 75 ? '#4f46e5' : v >= 60 ? '#d97706' : '#dc2626'; }
  getScore(a: Assessment, dim: string): number { return (a.scores as unknown as Record<string,number>)[dim] ?? 0; }
}
