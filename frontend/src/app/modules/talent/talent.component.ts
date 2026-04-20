import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { TalentService } from '../../core/services/talent.service';
import { Talent, TalentTier } from '../../core/models/talent.model';

@Component({
  selector: 'app-talent-detail',
  standalone: true,
  imports: [CommonModule, NzButtonModule, NzIconModule, NzSpinModule, NzTagModule],
  template: `
    <div style="padding: 0">
      <button nz-button nzType="link" (click)="goBack()" style="padding: 0; margin-bottom: 16px; color: #1e1b4b;">
        <span nz-icon nzType="arrow-left"></span> Quay lại
      </button>

      @if (loading()) {
        <nz-spin nzSimple></nz-spin>
      } @else if (talent()) {
        <div style="background:#fff; border-radius:12px; padding:32px; box-shadow: 0 1px 4px rgba(0,0,0,0.06)">
          <h2 style="color:#1e1b4b; margin:0 0 4px">{{ talent()!.fullName }}</h2>
          <p style="color:#6b7280; margin:0 0 16px">{{ talent()!.position }} · {{ talent()!.department }}</p>
          <nz-tag [nzColor]="getTierColor(talent()!.talentTier)">{{ talent()!.talentTier }}</nz-tag>
          <p style="margin-top:24px; color:#9ca3af; font-style:italic">
            Chi tiết nhân tài — coming soon
          </p>
        </div>
      } @else {
        <p>Không tìm thấy nhân viên.</p>
      }
    </div>
  `,
})
export class TalentComponent implements OnInit {
  talent = signal<Talent | undefined>(undefined);
  loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private talentService: TalentService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.talentService.getById(id).subscribe({
      next: (t) => {
        this.talent.set(t);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goBack(): void {
    this.router.navigate(['/talent']);
  }

  getTierColor(tier: TalentTier): string {
    const map: Record<TalentTier, string> = {
      'Nòng cốt': 'purple',
      'Tiềm năng': 'blue',
      'Kế thừa': 'green',
    };
    return map[tier];
  }
}
