import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { ApiService } from '../../core/services/api.service';
import { MentoringPair, MentoringListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

@Component({
  selector: 'app-mentoring',
  standalone: true,
  imports: [CommonModule, NzTagModule, NzButtonModule, NzIconModule, NzProgressModule, AvatarComponent],
  templateUrl: './mentoring.component.html',
  styleUrl: './mentoring.component.scss',
})
export class MentoringComponent implements OnInit {
  pairs   = signal<MentoringPair[]>([]);
  loading = signal(true);
  constructor(private api: ApiService) {}
  ngOnInit(): void {
    this.api.get<MentoringListResponse>('mentoring-pairs','mentoring-pairs').subscribe({ next: r => { this.pairs.set(r.data); this.loading.set(false); }, error: () => this.loading.set(false) });
  }
  statusColor(s: string): string { return { Active:'blue', Completed:'green' }[s] ?? 'default'; }
  progress(p: MentoringPair): number { return Math.round((p.sessionsCompleted / p.sessionsTotal) * 100); }
}
