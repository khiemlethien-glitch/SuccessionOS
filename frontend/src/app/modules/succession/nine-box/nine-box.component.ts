import { Component, Input, OnChanges, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NbEmployee {
  id:          string;
  name:        string;
  initials:    string;
  perf:        number;   // 0–100
  pot:         number;   // 0–100
  role:        string;
  tags:        string[];
  stability:   number;   // derived from risk_band (0–100)
  competency:  number;   // derived from talent_tier (0–100)
}

export interface CellDef {
  id:        number;     // 1–9
  row:       0 | 1 | 2; // 0 = Cao perf (top)
  col:       0 | 1 | 2; // 0 = Thấp pot (left)
  name:      string;
  sub:       string;
  perfLevel: 'thap' | 'tb' | 'cao';
  potLevel:  'thap' | 'tb' | 'cao';
  employees: NbEmployee[];
}

// ── Static data ───────────────────────────────────────────────────────────────
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

const SCORE_RANGES: Record<string, [number, number]> = {
  thap: [0, 33], tb: [34, 66], cao: [67, 100],
};

const RISK_STABILITY:  Record<string, number> = { Low: 82, Med: 52, High: 22 };
const TIER_COMPETENCY: Record<string, number> = { A1: 90, A2: 75, B: 55, C: 35 };

function getInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Component ─────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-nine-box',
  standalone: true,
  imports: [CommonModule, RouterLink, NzIconModule, NzTagModule, NzTooltipModule],
  templateUrl: './nine-box.component.html',
  styleUrl: './nine-box.component.scss',
  host: { ngSkipHydration: 'true' },
})
export class NineBoxComponent implements OnChanges {
  @Input() rawTalents: any[] = [];

  // ── Build cells from raw talent rows ──────────────────────────
  cells = signal<CellDef[]>([]);

  ngOnChanges(): void {
    const empMap = new Map<number, NbEmployee[]>();
    for (const t of this.rawTalents) {
      const box = t.box as number;
      if (!box || box < 1 || box > 9) continue;
      const emp: NbEmployee = {
        id:         t.id,
        name:       t.full_name ?? '—',
        initials:   getInitials(t.full_name ?? ''),
        perf:       Math.round(t.performance_score ?? 0),
        pot:        Math.round(t.potential_score ?? 0),
        role:       t.position ?? t.talent_tier ?? '—',
        tags:       [t.talent_tier, t.risk_band].filter(Boolean),
        stability:  RISK_STABILITY[t.risk_band]   ?? 50,
        competency: TIER_COMPETENCY[t.talent_tier] ?? 50,
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

  // ── Y/X axis labels ───────────────────────────────────────────
  readonly yLabels = ['Cao', 'TB', 'Thấp'];

  // ── Panel state ───────────────────────────────────────────────
  /** Cell shown in drawer */
  activeCell      = signal<CellDef | null>(null);
  /** Cell driving the scatter panel (stays after cell drawer closes) */
  scatterCell     = signal<CellDef | null>(null);
  activeEmployee  = signal<NbEmployee | null>(null);

  hasOverlay = computed(() => !!this.activeCell() || !!this.activeEmployee());

  // Top-3 by total score for the active cell drawer
  top3 = computed<NbEmployee[]>(() =>
    (this.activeCell()?.employees ?? []).slice(0, 3)
  );

  // ── Actions ───────────────────────────────────────────────────
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

  /** Clicked employee row inside cell drawer */
  openEmpFromCell(emp: NbEmployee): void {
    this.activeEmployee.set(emp);
    this.activeCell.set(null);   // close cell drawer; scatter stays
  }

  /** Clicked avatar directly on the grid */
  openEmpFromAvatar(emp: NbEmployee, ev: Event): void {
    ev.stopPropagation();
    this.activeEmployee.set(emp);
    this.activeCell.set(null);
    this.scatterCell.set(null);  // no scatter when opened from avatar
  }

  closeEmployee(): void {
    this.activeEmployee.set(null);
  }

  closeScatter(): void {
    this.scatterCell.set(null);
  }

  onOverlayClick(): void {
    if (this.activeEmployee()) {
      this.closeEmployee();
    } else {
      this.closeCell();
    }
  }

  // ── Scatter dot positions (clamped 8%–88%) ────────────────────
  dotX(emp: NbEmployee, cell: CellDef): number {
    const [min, max] = SCORE_RANGES[cell.potLevel];
    return max === min ? 48 : 8 + (clamp(emp.pot, min, max) - min) / (max - min) * 80;
  }

  dotY(emp: NbEmployee, cell: CellDef): number {
    const [min, max] = SCORE_RANGES[cell.perfLevel];
    // Inverted: high perf = top = small Y%
    return max === min ? 48 : 88 - (clamp(emp.perf, min, max) - min) / (max - min) * 80;
  }

  // ── Radar chart ───────────────────────────────────────────────
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
      [CX, CY, CX, CY-R],  // top
      [CX, CY, CX+R, CY],  // right
      [CX, CY, CX, CY+R],  // bottom
      [CX, CY, CX-R, CY],  // left
    ];
  })();

  radarPoints(emp: NbEmployee): string {
    const { R, CX, CY } = this;
    const top    = `${CX},${CY - emp.pot        / 100 * R}`;
    const right  = `${CX + emp.perf      / 100 * R},${CY}`;
    const bottom = `${CX},${CY + emp.stability   / 100 * R}`;
    const left   = `${CX - emp.competency/ 100 * R},${CY}`;
    return `${top} ${right} ${bottom} ${left}`;
  }

  // ── Helpers ───────────────────────────────────────────────────
  totalScore(emp: NbEmployee): number {
    return Math.round((emp.perf + emp.pot) / 2);
  }

  empCellRef(emp: NbEmployee): string {
    const cell = this.cells().find(c => c.employees.some(e => e.id === emp.id));
    return cell ? `Box ${cell.id} · ${cell.name}` : '—';
  }

  riskColor(tag: string): string {
    const m: Record<string, string> = { High: 'red', Med: 'orange', Low: 'green' };
    return m[tag] ?? 'default';
  }
}
