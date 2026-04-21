import {
  Component, ChangeDetectionStrategy, EventEmitter, Input,
  Output, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { TalentProfileComponent } from '../../../modules/talent/talent-profile.component';

@Component({
  selector: 'app-talent-preview',
  standalone: true,
  imports: [CommonModule, NzIconModule, TalentProfileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './talent-preview-drawer.component.html',
  styleUrl: './talent-preview-drawer.component.scss',
})
export class TalentPreviewDrawerComponent {
  @Input({ required: true }) talentId!: string | null;
  @Output() closed   = new EventEmitter<void>();
  @Output() openFull = new EventEmitter<string>();
  @Output() navigate = new EventEmitter<string>();

  onClose(): void { this.closed.emit(); }
  onOpenFull(): void {
    if (this.talentId) this.openFull.emit(this.talentId);
  }
  onInnerNavigate(id: string): void { this.navigate.emit(id); }
}
