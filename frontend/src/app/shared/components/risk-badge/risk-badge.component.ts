import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-risk-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="risk-badge" [ngClass]="cssClass">{{ label }}</span>`,
  styles: [`
    .risk-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; }
    .risk-high { background:#fee2e2; color:#991b1b; }
    .risk-med  { background:#fef3c7; color:#92400e; }
    .risk-low  { background:#dcfce7; color:#166534; }
  `],
})
export class RiskBadgeComponent {
  @Input() score = 0;
  @Input() showScore = false;
  get label() {
    const l = this.score >= 60 ? 'Cao' : this.score >= 30 ? 'Trung bình' : 'Thấp';
    return this.showScore ? `${l} · ${this.score}` : l;
  }
  get cssClass() {
    return { 'risk-high': this.score >= 60, 'risk-med': this.score >= 30 && this.score < 60, 'risk-low': this.score < 30 };
  }
}
