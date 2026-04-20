import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../core/services/api.service';
import { Talent, TalentListResponse, SuccessionPlan, SuccessionPlanListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

interface BoxDef {
  row: number;      // 1=low perf, 3=high perf
  col: number;      // 1=low pot,  3=high pot
  label: string;
  sublabel: string;
  tone: 'star' | 'great' | 'core' | 'risk' | 'watch' | 'low';
  num: number;
}

const DEFAULT_PERF: [number, number] = [70, 85];
const DEFAULT_POT:  [number, number] = [70, 85];

@Component({
  selector: 'app-succession',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzTabsModule, NzTagModule, NzIconModule, NzCollapseModule,
    NzModalModule, NzSliderModule, NzButtonModule,
    AvatarComponent,
  ],
  templateUrl: './succession.component.html',
  styleUrl: './succession.component.scss',
})
export class SuccessionComponent implements OnInit {
  talents = signal<Talent[]>([]);
  plans   = signal<SuccessionPlan[]>([]);

  // ─── Scale thresholds ──────────────────────────────
  // [lowMidCutoff, midHighCutoff]  e.g. [70, 85] means:
  // score < 70 → tier 1, 70-84 → tier 2, ≥85 → tier 3
  perfThresholds = signal<[number, number]>([...DEFAULT_PERF]);
  potThresholds  = signal<[number, number]>([...DEFAULT_POT]);

  // Draft values used inside modal (committed on Apply)
  perfDraft = signal<[number, number]>([...DEFAULT_PERF]);
  potDraft  = signal<[number, number]>([...DEFAULT_POT]);

  showScaleModal = signal(false);

  // 9-box definitions — row=performance, col=potential
  boxes: BoxDef[] = [
    { row:3, col:1, num:7, label:'Ngôi sao tiềm ẩn',   sublabel:'Hiệu suất cao · Tiềm năng thấp', tone:'risk'  },
    { row:3, col:2, num:8, label:'Nhân tài nổi bật',   sublabel:'Hiệu suất cao · Tiềm năng TB',   tone:'great' },
    { row:3, col:3, num:9, label:'Ngôi sao tương lai', sublabel:'Hiệu suất cao · Tiềm năng cao',   tone:'star'  },
    { row:2, col:1, num:4, label:'Nhân viên vững',     sublabel:'Hiệu suất TB · Tiềm năng thấp',  tone:'watch' },
    { row:2, col:2, num:5, label:'Nhân tài cốt lõi',   sublabel:'Hiệu suất TB · Tiềm năng TB',    tone:'core'  },
    { row:2, col:3, num:6, label:'Lãnh đạo tiềm năng', sublabel:'Hiệu suất TB · Tiềm năng cao',   tone:'great' },
    { row:1, col:1, num:1, label:'Cần cải thiện',      sublabel:'Hiệu suất thấp · Tiềm năng thấp',tone:'low'   },
    { row:1, col:2, num:2, label:'Tiềm năng ẩn',       sublabel:'Hiệu suất thấp · Tiềm năng TB',  tone:'watch' },
    { row:1, col:3, num:3, label:'Enigma',             sublabel:'Hiệu suất thấp · Tiềm năng cao', tone:'risk'  },
  ];

  constructor(private api: ApiService, private msg: NzMessageService) {}

  ngOnInit(): void {
    this.api.get<TalentListResponse>('talents','talents').subscribe(r => this.talents.set(r.data));
    this.api.get<SuccessionPlanListResponse>('succession-plans','succession-plans').subscribe(r => this.plans.set(r.data));
  }

  // ─── Scoring ───────────────────────────────────────
  private tier(score: number, thresholds: [number, number]): 1 | 2 | 3 {
    if (score >= thresholds[1]) return 3;
    if (score >= thresholds[0]) return 2;
    return 1;
  }

  talentsInBox(b: BoxDef): Talent[] {
    const perf = this.perfThresholds();
    const pot  = this.potThresholds();
    return this.talents().filter(t =>
      this.tier(t.performanceScore, perf) === b.row &&
      this.tier(t.potentialScore,  pot)  === b.col
    );
  }

  readonly totalInGrid = computed(() => this.talents().length);
  readonly starCount = computed(() => this.talents().filter(t =>
    this.tier(t.performanceScore, this.perfThresholds()) === 3 &&
    this.tier(t.potentialScore,  this.potThresholds())  === 3
  ).length);
  readonly needsActionCount = computed(() => this.talents().filter(t =>
    this.tier(t.performanceScore, this.perfThresholds()) === 1
  ).length);

  // ─── Preview counts for each tier while editing thresholds ────
  readonly previewPerf = computed(() => {
    const [lo, hi] = this.perfDraft();
    const list = this.talents();
    return {
      low:  list.filter(t => t.performanceScore < lo).length,
      mid:  list.filter(t => t.performanceScore >= lo && t.performanceScore < hi).length,
      high: list.filter(t => t.performanceScore >= hi).length,
    };
  });
  readonly previewPot = computed(() => {
    const [lo, hi] = this.potDraft();
    const list = this.talents();
    return {
      low:  list.filter(t => t.potentialScore < lo).length,
      mid:  list.filter(t => t.potentialScore >= lo && t.potentialScore < hi).length,
      high: list.filter(t => t.potentialScore >= hi).length,
    };
  });

  // ─── Modal actions ─────────────────────────────────
  openScaleModal(): void {
    this.perfDraft.set([...this.perfThresholds()]);
    this.potDraft.set([...this.potThresholds()]);
    this.showScaleModal.set(true);
  }

  closeScaleModal(): void {
    this.showScaleModal.set(false);
  }

  applyScale(): void {
    this.perfThresholds.set([...this.perfDraft()]);
    this.potThresholds.set([...this.potDraft()]);
    this.closeScaleModal();
    this.msg.success('Đã cập nhật thang đo 9-Box');
  }

  resetScale(): void {
    this.perfDraft.set([...DEFAULT_PERF]);
    this.potDraft.set([...DEFAULT_POT]);
  }

  setPerfDraft(value: number[] | null): void {
    if (value && value.length === 2) this.perfDraft.set([value[0], value[1]]);
  }
  setPotDraft(value: number[] | null): void {
    if (value && value.length === 2) this.potDraft.set([value[0], value[1]]);
  }

  isDefault = computed(() => {
    const p = this.perfThresholds();
    const q = this.potThresholds();
    return p[0] === DEFAULT_PERF[0] && p[1] === DEFAULT_PERF[1]
        && q[0] === DEFAULT_POT[0]  && q[1] === DEFAULT_POT[1];
  });

  // ─── Misc ──────────────────────────────────────────
  readinessLabel(r: string): string {
    return r === 'Ready Now' ? 'Sẵn sàng ngay' : r === 'Ready in 1 Year' ? '1–2 năm' : '3–5 năm';
  }
  readinessColor(r: string): string {
    return r === 'Ready Now' ? 'green' : r === 'Ready in 1 Year' ? 'blue' : 'orange';
  }
  readinessTone(r: string): 'green' | 'amber' | 'orange' {
    return r === 'Ready Now' ? 'green' : r === 'Ready in 1 Year' ? 'amber' : 'orange';
  }
  lastName(fullName: string): string {
    return fullName.trim().split(/\s+/).pop() ?? fullName;
  }
}
