import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { ApiService } from '../../core/services/api.service';
import { CalibrationSession, CalibrationListResponse } from '../../core/models/models';

@Component({
  selector: 'app-calibration',
  standalone: true,
  imports: [CommonModule, NzTagModule, NzButtonModule, NzIconModule, NzTableModule],
  templateUrl: './calibration.component.html',
  styleUrl: './calibration.component.scss',
})
export class CalibrationComponent implements OnInit {
  sessions = signal<CalibrationSession[]>([]);
  loading  = signal(true);
  constructor(private api: ApiService) {}
  ngOnInit(): void {
    this.api.get<CalibrationListResponse>('calibration-sessions','calibration-sessions').subscribe({ next: r => { this.sessions.set(r.data); this.loading.set(false); }, error: () => this.loading.set(false) });
  }
  statusColor(s: string): string { return { Completed:'green', Draft:'orange' }[s] ?? 'default'; }
}
