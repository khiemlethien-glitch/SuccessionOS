import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
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
  constructor(private api: ApiService, private msg: NzMessageService) {}
  ngOnInit(): void { this.api.get<ModuleListResponse>('modules','modules').subscribe(r => this.modules.set(r.data)); }
  statusColor(s: string): string { return ({ active:'green', available:'blue', coming:'orange' } as any)[s] ?? 'default'; }
  statusLabel(s: string): string { return ({ active:'Đang dùng', available:'Có thể thêm', coming:'Sắp ra mắt' } as any)[s] ?? s; }

  toggleModule(m: AppModule): void {
    if (m.status === 'coming') return;
    const next = m.status === 'active' ? 'available' : 'active';
    this.modules.update(list => list.map(x => x.id === m.id ? { ...x, status: next as AppModule['status'] } : x));
    const label = next === 'active' ? 'đã được bật' : 'đã tắt';
    this.msg.success(`Module "${m.name}" ${label}`);
    // TODO: api.patch(`modules/${m.id}`, { status: next }).subscribe()
  }
}
