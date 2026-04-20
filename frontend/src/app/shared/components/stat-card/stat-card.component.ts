import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule, NzIconModule],
  template: `
    <div class="stat-card" [class.danger]="variant==='danger'" [class.success]="variant==='success'">
      <div class="stat-icon">
        <span nz-icon [nzType]="icon" nzTheme="outline"></span>
      </div>
      <div class="stat-body">
        <div class="stat-value">{{ value }}</div>
        <div class="stat-label">{{ label }}</div>
        @if (sub) { <div class="stat-sub">{{ sub }}</div> }
      </div>
    </div>`,
  styles: [`
    .stat-card { display:flex; align-items:center; gap:16px; background:#fff; border-radius:10px; border:1px solid #f3f4f6; padding:20px; box-shadow:0 1px 3px rgba(0,0,0,.05); }
    .stat-icon { width:48px; height:48px; border-radius:10px; background:#eef2ff; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:22px; color:#4f46e5; }
    .danger .stat-icon { background:#fee2e2; color:#dc2626; }
    .success .stat-icon { background:#dcfce7; color:#16a34a; }
    .stat-body { min-width:0; }
    .stat-value { font-size:28px; font-weight:700; color:#111827; line-height:1.1; }
    .stat-label { font-size:13px; color:#6b7280; margin-top:2px; }
    .stat-sub   { font-size:12px; color:#9ca3af; margin-top:2px; }
  `],
})
export class StatCardComponent {
  @Input() icon = 'team';
  @Input() value: string | number = 0;
  @Input() label = '';
  @Input() sub = '';
  @Input() variant: 'default' | 'danger' | 'success' = 'default';
}
