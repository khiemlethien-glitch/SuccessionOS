import { Component, OnInit, computed, signal, inject } from '@angular/core';
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
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { KeyPositionService } from '../../core/services/data/key-position.service';
import { SuccessionService } from '../../core/services/data/succession.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/auth/auth.service';
import { KeyPosition, SuccessionPlan, CriticalLevel } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

interface Competency {
  key: string;
  label: string;
  icon: string;
}

interface NewPositionDraft {
  title: string;
  department: string | null;   // department_id
  current_holder: string;      // employee name (text)
  current_holder_id: string | null;
  critical_level: CriticalLevel;
}

interface DeptOpt { id: string; name: string; }
interface EmpOpt  { id: string; full_name: string; position: string; department_id: string; }

@Component({
  selector: 'app-positions',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, DragDropModule,
    NzTagModule, NzButtonModule, NzIconModule, NzDrawerModule,
    NzInputModule, NzSelectModule, NzRadioModule, NzFormModule,
    NzPopconfirmModule, NzTooltipModule,
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
  readonly criticalCount  = computed(() => this.positions().filter(p => p.critical_level === 'Critical').length);
  readonly noSuccessor    = computed(() => this.positions().filter(p => p.successor_count === 0).length);
  readonly highRiskCount  = computed(() => this.positions().filter(p => p.risk_level === 'High').length);

  // ─── Modal state ───────────────────────────────────────────
  showAddModal = signal(false);
  /** null = create mode; ID string = edit mode (đang sửa position này). */
  editingId    = signal<string | null>(null);
  deleting     = signal(false);

  readonly isEditMode = computed(() => this.editingId() !== null);
  readonly modalTitle = computed(() =>
    this.isEditMode() ? 'Chỉnh sửa vị trí then chốt' : 'Thêm vị trí then chốt'
  );
  readonly submitLabel = computed(() =>
    this.isEditMode() ? 'Lưu thay đổi' : 'Tạo vị trí'
  );

  draft = signal<NewPositionDraft>({
    title: '',
    department: null,
    current_holder: '',
    current_holder_id: null,
    critical_level: 'Medium',
  });

  // ─── Dropdown data sources (load từ Supabase trong ngOnInit) ─────
  allDepts     = signal<DeptOpt[]>([]);
  allEmployees = signal<EmpOpt[]>([]);

  /** Distinct position titles từ v_employees — nguồn cho dropdown "Tên vị trí". */
  titleOptions = computed<string[]>(() => {
    const set = new Set<string>();
    for (const e of this.allEmployees()) if (e.position) set.add(e.position);
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  });

  /** Employees thuộc dept đã chọn — nguồn cho dropdown "Đương nhiệm". */
  empOptionsForDept = computed<EmpOpt[]>(() => {
    const deptId = this.draft().department;
    if (!deptId) return this.allEmployees();
    return this.allEmployees().filter(e => e.department_id === deptId);
  });

  /** Auto-suggest holder khi chọn dept + title: tìm employee khớp cả 2. */
  private autoHolder = computed<EmpOpt | null>(() => {
    const d = this.draft();
    if (!d.department || !d.title) return null;
    return this.allEmployees().find(e =>
      e.department_id === d.department && e.position === d.title
    ) ?? null;
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

  private positionSvc = inject(KeyPositionService);
  private successionSvc = inject(SuccessionService);
  private sbSvc = inject(SupabaseService);
  private auth = inject(AuthService);

  isAdmin = computed(() => this.auth.isAdmin());

  constructor(private msg: NzMessageService) {}

  async ngOnInit(): Promise<void> {
    this.loading.set(true);

    // Isolate each call so one failure doesn't block the others
    const [positions, plans, depts, emps] = await Promise.all([
      this.positionSvc.getAll().catch(() => [] as any[]),
      this.successionSvc.getPlans().catch(() => [] as any[]),
      this.sbSvc.client.from('departments').select('id, name').order('name'),
      this.sbSvc.client.from('v_employees').select('id, full_name, position, department_id').eq('is_active', true),
    ]);

    this.positions.set(positions as any);
    this.plans.set(plans as any);

    // Departments: prefer departments table → positions fallback → v_employees fallback
    if (!depts.error && depts.data?.length) {
      this.allDepts.set(depts.data as DeptOpt[]);
    } else {
      // Fallback 1: derive from positions already loaded
      const seen = new Map<string, string>();
      for (const p of positions as any[]) {
        if (p.department_id && p.department && p.department !== '—') {
          seen.set(p.department_id, p.department);
        }
      }

      if (seen.size === 0) {
        // Fallback 2: derive from v_employees (luôn có 500 rows từ VnR)
        try {
          const { data: empDepts } = await this.sbSvc.client
            .from('v_employees')
            .select('department_id, department_name, department_short')
            .eq('is_active', true);
          for (const e of empDepts ?? []) {
            const id   = e.department_id;
            const name = e.department_name ?? e.department_short ?? '';
            if (id && name && name !== '—') seen.set(id, name);
          }
        } catch { /* bỏ qua */ }
      }

      this.allDepts.set(
        [...seen.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      );
    }

    if (!emps.error) this.allEmployees.set((emps.data ?? []) as EmpOpt[]);

    this.loading.set(false);
  }

  getPlan(posId: string): SuccessionPlan | undefined {
    return this.plans().find(p => p.position_id === posId);
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
    this.editingId.set(null);
    this.resetDraft();
    this.showAddModal.set(true);
  }

  openEditModal(p: KeyPosition, ev?: Event): void {
    ev?.stopPropagation();
    if (!this.isAdmin()) {
      this.msg.warning('Chỉ Admin được phép chỉnh sửa vị trí then chốt');
      return;
    }
    this.editingId.set(p.id);
    // Map KeyPosition → draft shape. Tìm department_id từ tên.
    const deptId = this.allDepts().find(d => d.name === p.department)?.id ?? null;
    const holderEmp = this.allEmployees().find(e => e.full_name === p.current_holder) ?? null;
    this.draft.set({
      title: p.title,
      department: deptId,
      current_holder: p.current_holder,
      current_holder_id: holderEmp?.id ?? null,
      critical_level: p.critical_level as CriticalLevel,
    });
    // Populate competencies drag-drop: những key đã chọn vào "selected", còn lại "available".
    const selectedKeys = new Set(p.required_competencies ?? []);
    this.selectedCompetencies.set(
      this.allCompetencies.filter(c => selectedKeys.has(c.key))
    );
    this.availableCompetencies.set(
      this.allCompetencies.filter(c => !selectedKeys.has(c.key))
    );
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editingId.set(null);
  }

  async deletePosition(): Promise<void> {
    const id = this.editingId();
    if (!id || !this.isAdmin()) return;
    this.deleting.set(true);
    await this.positionSvc.delete(id);
    this.deleting.set(false);
    this.positions.update(list => list.filter(p => p.id !== id));
    this.msg.success('Đã xóa vị trí then chốt');
    this.closeAddModal();
  }

  resetDraft(): void {
    this.draft.set({ title: '', department: null, current_holder: '', current_holder_id: null, critical_level: 'Medium' });
    this.availableCompetencies.set([...this.allCompetencies]);
    this.selectedCompetencies.set([]);
  }

  updateDraft<K extends keyof NewPositionDraft>(key: K, value: NewPositionDraft[K]): void {
    this.draft.update(d => ({ ...d, [key]: value }));
    // Auto-fill đương nhiệm khi chọn title hoặc dept thay đổi và người dùng chưa gán manual
    if (key === 'title' || key === 'department') {
      const suggested = this.autoHolder();
      if (suggested) {
        this.draft.update(d => ({ ...d, current_holder: suggested.full_name, current_holder_id: suggested.id }));
      }
    }
  }

  /** Khi user chọn employee từ dropdown "Đương nhiệm" — lưu cả id + name. */
  selectHolder(empId: string | null): void {
    if (!empId) {
      this.draft.update(d => ({ ...d, current_holder: '', current_holder_id: null }));
      return;
    }
    const e = this.allEmployees().find(x => x.id === empId);
    if (e) this.draft.update(d => ({ ...d, current_holder: e.full_name, current_holder_id: e.id }));
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
    return !!(d.title.trim() && d.department && d.current_holder.trim() && this.selectedCompetencies().length > 0);
  });

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      this.msg.warning('Vui lòng điền đầy đủ và chọn ít nhất 1 năng lực');
      return;
    }
    const d = this.draft();
    const deptName = this.allDepts().find(x => x.id === d.department)?.name ?? '—';
    const competencyKeys = this.selectedCompetencies().map(c => c.key);
    const editId = this.editingId();

    if (editId) {
      // ── EDIT mode ──────────────────────────────────────
      const dbPayload = {
        title: d.title.trim(),
        department_id: d.department,
        current_holder_id: d.current_holder_id,
        critical_level: d.critical_level,
        required_competencies: competencyKeys,
      };
      const saved = await this.positionSvc.update(editId, dbPayload);
      if (saved) {
        // Update signal trong list — preserve successor_count/ready_now_count/risk_level từ DB
        this.positions.update(list => list.map(p => p.id === editId ? {
          ...p,
          title: d.title.trim(),
          department: deptName,
          current_holder: d.current_holder.trim(),
          critical_level: d.critical_level,
          required_competencies: competencyKeys,
        } : p));
        this.msg.success('Đã cập nhật vị trí');
      } else {
        this.msg.error('Cập nhật thất bại');
      }
      this.closeAddModal();
      return;
    }

    // ── CREATE mode ──────────────────────────────────────
    const idx = this.positions().length + 1;
    const tempId = `P${String(idx).padStart(3, '0')}`;
    const newPos: KeyPosition = {
      id: tempId,
      title: d.title.trim(),
      department: deptName,
      current_holder: d.current_holder.trim(),
      successor_count: 0,
      ready_now_count: 0,
      risk_level: 'Low',
      critical_level: d.critical_level,
      successors: [],
      required_competencies: competencyKeys,
    };
    this.positions.update(list => [newPos, ...list]);
    this.msg.success(`Đã thêm vị trí "${newPos.title}"`);
    this.closeAddModal();

    const dbPayload = {
      id: tempId,
      title: newPos.title,
      department_id: d.department,
      current_holder_id: d.current_holder_id,
      critical_level: d.critical_level,
      required_competencies: competencyKeys,
      successor_count: 0,
      ready_now_count: 0,
      risk_level: 'Low',
      is_active: true,
    };
    const saved = await this.positionSvc.create(dbPayload);
    if (saved?.id && saved.id !== tempId) {
      this.positions.update(list => list.map(p => p.id === tempId ? { ...p, id: saved.id } : p));
    }
  }
}
