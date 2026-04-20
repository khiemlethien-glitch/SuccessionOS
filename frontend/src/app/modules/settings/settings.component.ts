import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-card">
      <h1 style="margin:0 0 8px">Cài đặt</h1>
      <p style="margin:0;color:var(--color-text-secondary)">Coming soon</p>
    </div>
  `,
})
export class SettingsComponent {}

