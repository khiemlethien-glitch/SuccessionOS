import { Component, Input } from '@angular/core';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [NzAvatarModule],
  template: `
    <nz-avatar
      [nzText]="initials"
      [nzSize]="size"
      [style.background-color]="color"
      style="font-weight:700;letter-spacing:0.3px;flex-shrink:0"
    ></nz-avatar>`,
})
export class AvatarComponent {
  @Input() name = '';
  @Input() size: number | 'large' | 'small' | 'default' = 36;

  get initials(): string {
    const parts = this.name.trim().split(' ');
    if (parts.length >= 2) return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
    return this.name.substring(0, 2).toUpperCase();
  }

  get color(): string {
    const palette = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#dc2626','#0369a1','#065f46'];
    let hash = 0;
    for (const c of this.name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return palette[Math.abs(hash) % palette.length];
  }
}
