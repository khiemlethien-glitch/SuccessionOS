import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TalentTier } from '../../../core/models/models';

@Component({
  selector: 'app-tier-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="tier-badge" [ngClass]="cssClass">{{ tier }}</span>`,
  styles: [`
    .tier-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; white-space:nowrap; }
    .tier-core      { background:#eef2ff; color:#4f46e5; }
    .tier-potential { background:#fff7ed; color:#c2410c; }
    .tier-successor { background:#f0fdf4; color:#15803d; }
  `],
})
export class TierBadgeComponent {
  @Input() tier!: TalentTier;
  get cssClass() {
    return { 'tier-core': this.tier === 'Nòng cốt', 'tier-potential': this.tier === 'Tiềm năng', 'tier-successor': this.tier === 'Kế thừa' };
  }
}
