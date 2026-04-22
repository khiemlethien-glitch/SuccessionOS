import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../core/services/api.service';
import { KeyPosition, PositionListResponse, SuccessionPlan, SuccessionPlanListResponse, CriticalLevel } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

interface Competency {
  key: string;
  label: string;
  icon: string;
}

interface NewPositionDraft {
  title: string;
  department: string | null;
  currentHolder: string;
  criticalLevel: CriticalLevel;
}

@Component({
  selector: 'app-positions',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, DragDropModule,
    NzTagModule, NzButtonModule, NzIconModule, NzDrawerModule,
    NzInputModule, NzSelectModule, NzRadioModule, NzFormModule,
    AvatarComponent,
  ],
  templateUrl: './positions.component.html',
  styleUrl: './positions.component.scss',
  // Add-position nz-drawer portals content outside the component tree;
  // skip hydration to avoid Cannot-read-null errors on the hydrated page.
  host: { ngSkipHydration: 'true' },
})
export class PositionsComponent implements OnInit {
  positions = signal<KeyPosition[]>([]);
  plans     = signal<SuccessionPlan[]>([]);
  loading   = signal(true);

  readonly totalCount     = computed(() => this.positions().length);
  readonly criticalCount  = computed(() => this.positions().filter(p => p.criticalLevel === 'Critical').length);
  readonly noSuccessor    = computed(() => this.positions().filter(p => p.successorCount === 0).length);
  readonly highRiskCount  = computed(() => this.positions().filter(p => p.riskLevel === 'High').length);

  // ─── Modal state ───────────────────────────────────────────
  showAddModal = signal(false);

  draft = signal<NewPositionDraft>({
    title: '',
    department: null,
    currentHolder: '',
    criticalLevel: 'Medium',
  });

  readonly allCompetencies: Competency[] = [
    { key: 'technical',       label: 'Chuyên môn kỹ thuật',  icon: 'tool' },
    { key: 'leadership',      label: 'Lãnh đạo',             icon: 'crown' },
    { key: 'communication',   label: 'Giao tiếp',            icon: 'message' },
    { key: 'problemSolving',  label: 'Giải quyết vấn đề',    icon: 'bulb' },
    { key: 'adaptability',    label: 'Thích nghi',           icon: 'sync' },
    { key: 'strategic',       label: 'Tư duy chiến lược',    icon: 'aim' },
    { key: 'financial',       label: 'Tài chính',            icon: 'dollar' },
    { key: 'negotiation',     label: 'Đàm phán',             icon: 'team' },
    { key: 'riskManagement',  label: 'Quản lý rủi ro',       icon: 'safety' },
    { key: 'innovation',      label: 'Đổi mới sáng tạo',     icon: 'rocket' },
  ];

  availableCompetencies = signal<Competency[]>([...this.allCompetencies]);
  selectedCompetencies  = signal<Competency[]>([]);

  criticalOptions: { value: CriticalLevel; label: string; tone: string }[] = [
    { value: 'Critical', label: 'Critical', tone: 'red' },
    { value: 'High',     label: 'High',     tone: 'amber' },
    { value: 'Medium',   label: 'Medium',   tone: 'blue' },
    { value: 'Low',      label: 'Low',      tone: 'green' },
  ];

  constructor(private api: ApiService, private msg: NzMessageService) {}

  ngOnInit(): void {
    this.api.get<PositionListResponse>('key-positions','positions').subscribe(r => { this.positions.set(r.data); this.loading.set(false); });
    this.api.get<SuccessionPlanListResponse>('succession/plans','succession-plans').subscribe(r => this.plans.set(r.data));
  }

  getPlan(posId: string): SuccessionPlan | undefined {
    return this.plans().find(p => p.positionId === posId);
  }

  // ─── Tone helpers — map criticalLevel to card tone ───────
  toneOf(level: string): 'red' | 'amber' | 'blue' | 'green' {
    if (level === 'Critical') return 'red';
    if (level === 'High') return 'amber';
    if (level === 'Medium') return 'blue';
    return 'green';
  }

  riskToneOf(level: string): 'red' | 'amber' | 'green' {
    if (level === 'High') return 'red';
    if (level === 'Medium') return 'amber';
    return 'green';
  }

  readinessLabel(r: string): string {
    return r === 'Ready Now' ? 'Sẵn sàng' : r === 'Ready in 1 Year' ? '1–2 năm' : '3–5 năm';
  }

  readinessTone(r: string): 'green' | 'amber' | 'orange' {
    return r === 'Ready Now' ? 'green' : r === 'Ready in 1 Year' ? 'amber' : 'orange';
  }

  deptOptions = computed(() => {
    return [...new Set(this.positions().map(p => p.department))].sort();
  });

  // ─── Modal actions ───────────────────────────────────────
  openAddModal(): void {
    this.resetDraft();
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  resetDraft(): void {
    this.draft.set({ title: '', department: null, currentHolder: '', criticalLevel: 'Medium' });
    this.availableCompetencies.set([...this.allCompetencies]);
    this.selectedCompetencies.set([]);
  }

  updateDraft<K extends keyof NewPositionDraft>(key: K, value: NewPositionDraft[K]): void {
    this.draft.update(d => ({ ...d, [key]: value }));
  }

  onDropCompetency(event: CdkDragDrop<Competency[]>): void {
    if (event.previousContainer === event.container) {
      const list = [...event.container.data];
      moveItemInArray(list, event.previousIndex, event.currentIndex);
      if (event.container.id === 'available') this.availableCompetencies.set(list);
      else this.selectedCompetencies.set(list);
    } else {
      const prev = [...event.previousContainer.data];
      const curr = [...event.container.data];
      transferArrayItem(prev, curr, event.previousIndex, event.currentIndex);
      if (event.previousContainer.id === 'available') {
        this.availableCompetencies.set(prev);
        this.selectedCompetencies.set(curr);
      } else {
        this.selectedCompetencies.set(prev);
        this.availableCompetencies.set(curr);
      }
    }
  }

  // Click-to-toggle as fallback for non-drag users
  addCompetency(c: Competency): void {
    this.availableCompetencies.update(list => list.filter(x => x.key !== c.key));
    this.selectedCompetencies.update(list => [...list, c]);
  }
  removeCompetency(c: Competency): void {
    this.selectedCompetencies.update(list => list.filter(x => x.key !== c.key));
    this.availableCompetencies.update(list => [...list, c]);
  }

  canSubmit = computed(() => {
    const d = this.draft();
    return !!(d.title.trim() && d.department && d.currentHolder.trim() && this.selectedCompetencies().length > 0);
  });

  submit(): void {
    if (!this.canSubmit()) {
      this.msg.warning('Vui lòng điền đầy đủ và chọn ít nhất 1 năng lực');
      return;
    }
    const d = this.draft();
    const idx = this.positions().length + 1;
    const newPos: KeyPosition = {
      id: `P${String(idx).padStart(3, '0')}`,
      title: d.title.trim(),
      department: d.department!,
      currentHolder: d.currentHolder.trim(),
      successorCount: 0,
      readyNowCount: 0,
      riskLevel: 'Low',
      criticalLevel: d.criticalLevel,
      successors: [],
      requiredCompetencies: this.selectedCompetencies().map(c => c.key),
    };
    // Optimistic update — add locally immediately
    this.positions.update(list => [newPos, ...list]);
    this.msg.success(`Đã thêm vị trí "${newPos.title}"`);
    this.closeAddModal();

    // Persist to backend (graceful degrade on mock)
    this.api.post<{ data: KeyPosition }>('key-positions', newPos).subscribe({
      next:  r => {
        // Replace temp ID with server-assigned ID if backend returns one
        if (r?.data?.id && r.data.id !== newPos.id) {
          this.positions.update(list => list.map(p => p.id === newPos.id ? { ...p, id: r.data.id } : p));
        }
      },
      error: () => { /* mock mode — local state is source of truth */ },
    });
  }
}
