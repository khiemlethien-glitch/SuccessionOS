import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { ApiService } from '../../core/services/api.service';
import { AppModule, ModuleListResponse } from '../../core/models/models';

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [CommonModule, NzTagModule, NzButtonModule, NzIconModule],
  templateUrl: './marketplace.component.html',
  styleUrl: './marketplace.component.scss',
})
export class MarketplaceComponent implements OnInit {
  modules = signal<AppModule[]>([]);
  filter  = signal<string>('all');
  filtered = computed(() => {
    const f = this.filter();
    if (f === 'all') return this.modules();
    if (f === 'active') return this.modules().filter(m => m.status === 'active');
    return this.modules().filter(m => m.status !== 'active');
  });
  constructor(private api: ApiService) {}
  ngOnInit(): void { this.api.get<ModuleListResponse>('modules','modules').subscribe(r => this.modules.set(r.data)); }
  statusColor(s: string): string { return { active:'green', available:'blue', coming:'orange' }[s] ?? 'default'; }
  statusLabel(s: string): string { return { active:'Đang dùng', available:'Có thể thêm', coming:'Sắp ra mắt' }[s] ?? s; }
}
