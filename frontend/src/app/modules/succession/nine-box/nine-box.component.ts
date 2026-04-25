import { Component, Input, OnChanges, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzPopoverModule } from 'ng-zorro-antd/popover';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';

// ── Config types ──────────────────────────────────────────────────────────────
export interface NbCellConfig {
  name:        string;
  sub:         string;
  description: string;
  actions:     string;
}

export interface NineBoxConfig {
  xAxisTitle:    string;
  yAxisTitle:    string;
  xField:        'potential_score' | 'performance_score';
  yField:        'performance_score' | 'potential_score';
  placementRule: 'auto' | 'db_box';
  xThresholds:   [number, number];
  yThresholds:   [number, number];
  cells:         Record<number, NbCellConfig>;
}

// ── Employee / Cell types ─────────────────────────────────────────────────────
export interface NbEmployee {
  id:          string;
  name:        string;
  initials:    string;
  perf:        number;   // Y-axis value
  pot:         number;   // X-axis value
  role:        string;
  tags:        string[];
  stability:   number;
  competency:  number;
  department:  string;
  riskBand:    string;
}

export interface CellDef {
  id:        number;     // 1–9
  row:       0 | 1 | 2; // 0 = top (high perf)
  col:       0 | 1 | 2; // 0 = left (low pot)
  name:      string;
  sub:       string;
  perfLevel: 'thap' | 'tb' | 'cao';
  potLevel:  'thap' | 'tb' | 'cao';
  employees: NbEmployee[];
}

// ── Static cell structure ────────────────────────────────────────────────────
const CELL_META: Omit<CellDef, 'employees'>[] = [
  { id: 7, row: 0, col: 0, name: 'Hiệu suất cao',     sub: 'H.suất cao · T.năng thấp', perfLevel: 'cao',  potLevel: 'thap' },
  { id: 8, row: 0, col: 1, name: 'Nhân sự then chốt', sub: 'H.suất cao · T.năng TB',   perfLevel: 'cao',  potLevel: 'tb'   },
  { id: 9, row: 0, col: 2, name: 'Ngôi sao',          sub: 'H.suất cao · T.năng cao',  perfLevel: 'cao',  potLevel: 'cao'  },
  { id: 4, row: 1, col: 0, name: 'Đáng tin cậy',      sub: 'H.suất TB · T.năng thấp',  perfLevel: 'tb',   potLevel: 'thap' },
  { id: 5, row: 1, col: 1, name: 'Nhân viên cốt lõi', sub: 'H.suất TB · T.năng TB',    perfLevel: 'tb',   potLevel: 'tb'   },
  { id: 6, row: 1, col: 2, name: 'Ngôi sao nổi',      sub: 'H.suất TB · T.năng cao',   perfLevel: 'tb',   potLevel: 'cao'  },
  { id: 1, row: 2, col: 0, name: 'Cần cải thiện',     sub: 'H.suất thấp · T.năng thấp',perfLevel: 'thap', potLevel: 'thap' },
  { id: 2, row: 2, col: 1, name: 'Không nhất quán',   sub: 'H.suất thấp · T.năng TB',  perfLevel: 'thap', potLevel: 'tb'   },
  { id: 3, row: 2, col: 2, name: 'Kim cương thô',     sub: 'H.suất thấp · T.năng cao', perfLevel: 'thap', potLevel: 'cao'  },
];

const RISK_STABILITY:  Record<string, number> = { Low: 82, Med: 52, High: 22 };
const TIER_COMPETENCY: Record<string, number> = { A1: 90, A2: 75, B: 55, C: 35 };

// ── Default config ────────────────────────────────────────────────────────────
const DEFAULT_NB_CONFIG: NineBoxConfig = {
  xAxisTitle:    'Tiềm năng',
  yAxisTitle:    'Hiệu suất',
  xField:        'potential_score',
  yField:        'performance_score',
  placementRule: 'auto',
  xThresholds:   [34, 67],
  yThresholds:   [34, 67],
  cells: {
    9: { name: 'Ngôi sao',          sub: 'H.suất cao · T.năng cao',  description: 'Nhân tài xuất sắc, dẫn đầu tổ chức về cả hiệu suất lẫn tiềm năng.', actions: 'Ưu tiên phát triển lãnh đạo, đưa vào pool kế thừa chiến lược.' },
    8: { name: 'Nhân sự then chốt', sub: 'H.suất cao · T.năng TB',   description: 'Đóng góp ổn định, có tiềm năng phát triển thêm.', actions: 'Bổ nhiệm vào vai trò cấp cao, tạo lộ trình thăng tiến.' },
    7: { name: 'Hiệu suất cao',     sub: 'H.suất cao · T.năng thấp', description: 'Hiệu suất xuất sắc nhưng tiềm năng phát triển bị hạn chế.', actions: 'Giữ chân qua phúc lợi, giao nhiệm vụ chuyên sâu.' },
    6: { name: 'Ngôi sao nổi',      sub: 'H.suất TB · T.năng cao',   description: 'Tiềm năng lớn, hiệu suất đang trong giai đoạn xây dựng.', actions: 'Mentor trực tiếp, đẩy nhanh lộ trình phát triển.' },
    5: { name: 'Nhân viên cốt lõi', sub: 'H.suất TB · T.năng TB',    description: 'Xương sống của tổ chức, cần được nuôi dưỡng và phát triển đúng hướng.', actions: 'Coaching định kỳ, giao thêm thách thức để kích thích phát triển.' },
    4: { name: 'Đáng tin cậy',      sub: 'H.suất TB · T.năng thấp',  description: 'Ổn định và đáng tin cậy nhưng ít khả năng phát triển thêm.', actions: 'Duy trì hiệu suất, cung cấp môi trường làm việc ổn định.' },
    3: { name: 'Kim cương thô',     sub: 'H.suất thấp · T.năng cao', description: 'Tiềm năng ẩn lớn, chưa phát huy được trong vai trò hiện tại.', actions: 'Xem xét chuyển vai trò phù hợp hơn, coaching chuyên sâu.' },
    2: { name: 'Không nhất quán',   sub: 'H.suất thấp · T.năng TB',  description: 'Có tiềm năng nhưng hiệu suất chưa ổn định.', actions: 'Tìm hiểu nguyên nhân, hỗ trợ kịp thời, theo dõi chặt.' },
    1: { name: 'Cần cải thiện',     sub: 'H.suất thấp · T.năng thấp',description: 'Cần can thiệp ngay về hiệu suất và định hướng phát triển.', actions: 'PIP (Performance Improvement Plan), đánh giá lại phù hợp vai trò.' },
  },
};

const LS_KEY = 'nb_config_default';

function loadConfig(): NineBoxConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NineBoxConfig>;
      return {
        ...DEFAULT_NB_CONFIG,
        ...p,
        cells: { ...DEFAULT_NB_CONFIG.cells, ...(p.cells ?? {}) },
      };
    }
  } catch { /* ignore parse errors */ }
  return structuredClone(DEFAULT_NB_CONFIG);
}

function persistConfig(cfg: NineBoxConfig): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

function getInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Place employee into box 1–9 based on dynamic thresholds. */
function computeBox(
  xScore: number, yScore: number,
  xThresh: [number, number], yThresh: [number, number],
): number {
  const xTier = xScore >= xThresh[1] ? 3 : xScore >= xThresh[0] ? 2 : 1;
  const yTier = yScore >= yThresh[1] ? 3 : yScore >= yThresh[0] ? 2 : 1;
  return (yTier - 1) * 3 + xTier;
}

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-nine-box',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    NzIconModule, NzTagModule, NzTooltipModule, NzPopoverModule,
    NzDrawerModule, NzInputModule, NzInputNumberModule,
    NzButtonModule, NzDividerModule, NzRadioModule, NzSelectModule,
    AvatarComponent,
  ],
  templateUrl: './nine-box.component.html',
  styleUrl: './nine-box.component.scss',
  host: { ngSkipHydration: 'true' },
})
export class NineBoxComponent implements OnChanges {
  @Input() rawTalents: any[] = [];

  // ── Config ────────────────────────────────────────────────────────────────
  config = signal<NineBoxConfig>(loadConfig());

  // Config drawer open/close
  configOpen = signal(false);

  // Draft — plain mutable object for ngModel bindings
  draft = {
    xAxisTitle:    DEFAULT_NB_CONFIG.xAxisTitle,
    yAxisTitle:    DEFAULT_NB_CONFIG.yAxisTitle,
    xField:        DEFAULT_NB_CONFIG.xField    as 'potential_score' | 'performance_score',
    yField:        DEFAULT_NB_CONFIG.yField    as 'performance_score' | 'potential_score',
    placementRule: DEFAULT_NB_CONFIG.placementRule as 'auto' | 'db_box',
    xLo: DEFAULT_NB_CONFIG.xThresholds[0],
    xHi: DEFAULT_NB_CONFIG.xThresholds[1],
    yLo: DEFAULT_NB_CONFIG.yThresholds[0],
    yHi: DEFAULT_NB_CONFIG.yThresholds[1],
    cells: structuredClone(DEFAULT_NB_CONFIG.cells) as Record<number, NbCellConfig>,
  };

  readonly fieldOptions = [
    { label: 'Điểm tiềm năng (potential_score)',   value: 'potential_score' },
    { label: 'Điểm hiệu suất (performance_score)', value: 'performance_score' },
  ];

  /** Cell IDs in top-left → bottom-right order for config drawer */
  readonly cellOrder = [7, 8, 9, 4, 5, 6, 1, 2, 3];

  openConfig(): void {
    const cfg = this.config();
    this.draft = {
      xAxisTitle:    cfg.xAxisTitle,
      yAxisTitle:    cfg.yAxisTitle,
      xField:        cfg.xField,
      yField:        cfg.yField,
      placementRule: cfg.placementRule,
      xLo: cfg.xThresholds[0],
      xHi: cfg.xThresholds[1],
      yLo: cfg.yThresholds[0],
      yHi: cfg.yThresholds[1],
      cells: structuredClone(cfg.cells),
    };
    this.configOpen.set(true);
  }

  closeConfig(): void { this.configOpen.set(false); }

  applyConfig(): void {
    const xLo = clamp(this.draft.xLo, 1, 98);
    const xHi = clamp(this.draft.xHi, xLo + 1, 99);
    const yLo = clamp(this.draft.yLo, 1, 98);
    const yHi = clamp(this.draft.yHi, yLo + 1, 99);
    const cfg: NineBoxConfig = {
      xAxisTitle:    this.draft.xAxisTitle || DEFAULT_NB_CONFIG.xAxisTitle,
      yAxisTitle:    this.draft.yAxisTitle || DEFAULT_NB_CONFIG.yAxisTitle,
      xField:        this.draft.xField,
      yField:        this.draft.yField,
      placementRule: this.draft.placementRule,
      xThresholds:   [xLo, xHi],
      yThresholds:   [yLo, yHi],
      cells:         structuredClone(this.draft.cells),
    };
    this.config.set(cfg);
    persistConfig(cfg);
    this.configOpen.set(false);
    this.ngOnChanges();
  }

  resetConfig(): void {
    const def = DEFAULT_NB_CONFIG;
    this.draft = {
      xAxisTitle:    def.xAxisTitle,
      yAxisTitle:    def.yAxisTitle,
      xField:        def.xField,
      yField:        def.yField,
      placementRule: def.placementRule,
      xLo: def.xThresholds[0],
      xHi: def.xThresholds[1],
      yLo: def.yThresholds[0],
      yHi: def.yThresholds[1],
      cells: structuredClone(def.cells),
    };
  }

  // ── Build cells from raw talent rows ─────────────────────────────────────
  cells = signal<CellDef[]>([]);

  ngOnChanges(): void {
    const cfg = this.config();
    const empMap = new Map<number, NbEmployee[]>();

    for (const t of this.rawTalents) {
      const xScore = Math.round((t[cfg.xField] as number) ?? 0);
      const yScore = Math.round((t[cfg.yField] as number) ?? 0);

      let box: number;
      if (cfg.placementRule === 'db_box') {
        const dbBox = t.box as number;
        box = (dbBox >= 1 && dbBox <= 9)
          ? dbBox
          : computeBox(xScore, yScore, cfg.xThresholds, cfg.yThresholds);
      } else {
        box = computeBox(xScore, yScore, cfg.xThresholds, cfg.yThresholds);
      }
      if (box < 1 || box > 9) continue;

      const emp: NbEmployee = {
        id:         t.id,
        name:       t.full_name ?? '—',
        initials:   getInitials(t.full_name ?? ''),
        perf:       yScore,
        pot:        xScore,
        role:       t.position ?? t.talent_tier ?? '—',
        tags:       [t.talent_tier, t.risk_band].filter(Boolean),
        stability:  RISK_STABILITY[t.risk_band]    ?? 50,
        competency: TIER_COMPETENCY[t.talent_tier] ?? 50,
        department: t.department_name ?? '—',
        riskBand:   t.risk_band       ?? '—',
      };
      const list = empMap.get(box) ?? [];
      list.push(emp);
      empMap.set(box, list);
    }

    this.cells.set(CELL_META.map(m => ({
      ...m,
      employees: (empMap.get(m.id) ?? []).sort((a, b) => (b.perf + b.pot) - (a.perf + a.pot)),
    })));
  }

  // ── Y/X axis labels ────────────────────────────────────────────────────────
  readonly yLabels = ['Cao', 'TB', 'Thấp'];

  // ── Panel state ────────────────────────────────────────────────────────────
  activeCell     = signal<CellDef | null>(null);
  scatterCell    = signal<CellDef | null>(null);
  activeEmployee = signal<NbEmployee | null>(null);

  hasOverlay = computed(() =>
    !!this.scatterCell() || !!this.activeCell() || !!this.activeEmployee()
  );

  top3 = computed<NbEmployee[]>(() =>
    (this.activeCell()?.employees ?? []).slice(0, 3)
  );

  podiumOrder = computed<(NbEmployee | null)[]>(() => {
    const h = this.top3();
    return [h[1] ?? null, h[0] ?? null, h[2] ?? null];
  });

  // ── Box category helpers ───────────────────────────────────────────────────
  isStarCell  = (id: number) => id === 9;
  isTopCell   = (id: number) => [6, 7, 8].includes(id);
  isBottomCell= (id: number) => [1, 2, 4].includes(id);

  private readonly TONE_MAP: Record<number, string> = {
    9: 'star', 8: 'great', 6: 'great', 5: 'core',
    7: 'risk', 4: 'watch', 3: 'risk', 2: 'watch', 1: 'low',
  };
  cellTone(id: number): string { return this.TONE_MAP[id] ?? 'core'; }

  // ── Config cell helpers ────────────────────────────────────────────────────
  cellCfg(id: number): NbCellConfig {
    return this.config().cells[id] ??
      { name: `Box ${id}`, sub: '', description: '', actions: '' };
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  openCell(cell: CellDef): void {
    this.activeCell.set(cell);
    this.scatterCell.set(cell);
    this.activeEmployee.set(null);
  }

  closeCell(): void {
    this.activeCell.set(null);
    this.scatterCell.set(null);
    this.activeEmployee.set(null);
  }

  openEmpFromCell(emp: NbEmployee): void {
    this.activeEmployee.set(emp);
    this.scatterCell.set(null);
    setTimeout(() => this.activeCell.set(null), 50);
  }

  openEmpFromAvatar(emp: NbEmployee, ev: Event): void {
    ev.stopPropagation();
    this.activeEmployee.set(emp);
    this.activeCell.set(null);
    this.scatterCell.set(null);
  }

  closeEmployee(): void { this.activeEmployee.set(null); }
  closeScatter():  void { this.scatterCell.set(null); }

  onOverlayClick(): void {
    if (this.activeEmployee()) {
      this.closeEmployee();
    } else if (this.activeCell()) {
      this.closeCell();
    } else {
      this.closeScatter();
    }
  }

  // ── Scatter dot positions (clamped 8%–88% within cell's sub-range) ─────────
  dotX(emp: NbEmployee, cell: CellDef): number {
    const [lo, hi] = this.config().xThresholds;
    const ranges: Record<string, [number, number]> = {
      thap: [0, lo - 1], tb: [lo, hi - 1], cao: [hi, 100],
    };
    const [min, max] = ranges[cell.potLevel];
    return max <= min ? 48 : 8 + (clamp(emp.pot, min, max) - min) / (max - min) * 80;
  }

  dotY(emp: NbEmployee, cell: CellDef): number {
    const [lo, hi] = this.config().yThresholds;
    const ranges: Record<string, [number, number]> = {
      thap: [0, lo - 1], tb: [lo, hi - 1], cao: [hi, 100],
    };
    const [min, max] = ranges[cell.perfLevel];
    return max <= min ? 48 : 88 - (clamp(emp.perf, min, max) - min) / (max - min) * 80;
  }

  // ── Radar chart ────────────────────────────────────────────────────────────
  private readonly R  = 58;
  private readonly CX = 75;
  private readonly CY = 75;

  readonly radarBgPts = (() => {
    const { R, CX, CY } = this;
    return `${CX},${CY-R} ${CX+R},${CY} ${CX},${CY+R} ${CX-R},${CY}`;
  })();

  readonly radarRingPts = [0.75, 0.5, 0.25].map(f => {
    const r = this.R * f; const { CX, CY } = this;
    return `${CX},${CY-r} ${CX+r},${CY} ${CX},${CY+r} ${CX-r},${CY}`;
  });

  readonly radarAxes: [number, number, number, number][] = (() => {
    const { R, CX, CY } = this;
    return [
      [CX, CY, CX, CY-R],
      [CX, CY, CX+R, CY],
      [CX, CY, CX, CY+R],
      [CX, CY, CX-R, CY],
    ];
  })();

  radarPoints(emp: NbEmployee): string {
    const { R, CX, CY } = this;
    const top    = `${CX},${CY - emp.pot        / 100 * R}`;
    const right  = `${CX + emp.perf      / 100 * R},${CY}`;
    const bottom = `${CX},${CY + emp.stability   / 100 * R}`;
    const left   = `${CX - emp.competency / 100 * R},${CY}`;
    return `${top} ${right} ${bottom} ${left}`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  totalScore(emp: NbEmployee): number {
    return Math.round((emp.perf + emp.pot) / 2);
  }

  empCellRef(emp: NbEmployee): string {
    const cell = this.cells().find(c => c.employees.some(e => e.id === emp.id));
    if (!cell) return '—';
    return `Box ${cell.id} · ${this.cellCfg(cell.id).name}`;
  }

  riskColor(tag: string): string {
    const m: Record<string, string> = { High: 'red', Med: 'orange', Low: 'green' };
    return m[tag] ?? 'default';
  }
}
