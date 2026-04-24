import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
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
import { EmployeeService } from '../../core/services/data/employee.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/auth/auth.service';
import { KeyPosition, SuccessionPlan, CriticalLevel, Talent } from '../../core/models/models';
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

  // ─── Coverage filter (từ dashboard deeplink hoặc tự chọn) ──────
  coverageFilter = signal<'all' | 'covered' | 'uncovered'>('all');

  readonly filteredPositions = computed(() => {
    const f = this.coverageFilter();
    const all = this.positions();
    if (f === 'covered')   return all.filter(p => (p.successor_count ?? 0) > 0);
    if (f === 'uncovered') return all.filter(p => (p.successor_count ?? 0) === 0);
    return all;
  });

  // ─── Drawer state ──────────────────────────────────────────
  showAddModal    = signal(false);
  /** 'view' = read-only, 'edit' = form editable */
  drawerMode      = signal<'view' | 'edit'>('view');
  /** Vị trí đang xem / đang sửa */
  viewingPosition = signal<KeyPosition | null>(null);
  /** null = create mode; ID string = edit mode */
  editingId       = signal<string | null>(null);
  deleting        = signal(false);

  /** Scores mục tiêu cho từng năng lực (key → 0‒100) */
  competencyScores = signal<Record<string, number>>({});

  readonly isEditMode = computed(() => this.editingId() !== null);
  readonly modalTitle = computed(() =>
    this.isEditMode() ? 'Chỉnh sửa vị trí then chốt' : 'Thêm vị trí then chốt'
  );
  readonly submitLabel = computed(() =>
    this.isEditMode() ? 'Lưu thay đổi' : 'Tạo vị trí'
  );

  /** Admin hoặc Line Manager được phép chỉnh sửa */
  readonly canEdit = computed(() =>
    this.auth.isAdmin() || this.auth.hasRole('Line Manager')
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
    { key: 'projectMgmt',     label: 'Quản lý dự án',        icon: 'project' },
    { key: 'coaching',        label: 'Coaching & Mentoring',  icon: 'heart' },
    { key: 'dataAnalysis',    label: 'Phân tích dữ liệu',    icon: 'bar-chart' },
    { key: 'customerFocus',   label: 'Định hướng khách hàng', icon: 'smile' },
    { key: 'planning',        label: 'Lập kế hoạch',         icon: 'schedule' },
  ];

  /** Resolve icon cho competency key/tên đầy đủ từ DB — keyword matching */
  private resolveCompIcon(key: string): string {
    const s = key.toLowerCase();
    if (s.includes('lãnh đạo') || s.includes('leadership'))       return 'crown';
    if (s.includes('kỹ thuật') || s.includes('technical'))        return 'tool';
    if (s.includes('giao tiếp') || s.includes('communicat'))      return 'message';
    if (s.includes('chiến lược') || s.includes('strateg'))        return 'aim';
    if (s.includes('tài chính') || s.includes('financ'))          return 'dollar';
    if (s.includes('rủi ro') || s.includes('risk'))               return 'safety';
    if (s.includes('dự án') || s.includes('project'))             return 'project';
    if (s.includes('đàm phán') || s.includes('negot'))            return 'team';
    if (s.includes('đổi mới') || s.includes('innovat'))           return 'rocket';
    if (s.includes('giải quyết') || s.includes('problem'))        return 'bulb';
    if (s.includes('thích nghi') || s.includes('adapt'))          return 'sync';
    if (s.includes('coaching') || s.includes('mentor'))           return 'heart';
    if (s.includes('phân tích') || s.includes('analys'))          return 'bar-chart';
    if (s.includes('khách hàng') || s.includes('customer'))       return 'smile';
    if (s.includes('kế hoạch') || s.includes('plan'))             return 'schedule';
    return 'tool';
  }

  availableCompetencies = signal<Competency[]>([...this.allCompetencies]);
  selectedCompetencies  = signal<Competency[]>([]);

  criticalOptions: { value: CriticalLevel; label: string; tone: string }[] = [
    { value: 'Critical', label: 'Critical', tone: 'red' },
    { value: 'High',     label: 'High',     tone: 'amber' },
    { value: 'Medium',   label: 'Medium',   tone: 'blue' },
    { value: 'Low',      label: 'Low',      tone: 'green' },
  ];

  // ─── Gap Analysis sub-panel ────────────────────────────────
  gapSuccessor = signal<any | null>(null);
  gapEmployee  = signal<Talent | null>(null);
  gapLoading   = signal(false);

  readonly gapRows = computed(() => {
    const pos = this.viewingPosition();
    const emp = this.gapEmployee();
    if (!pos) return [];

    const currentComps: Record<string, number | null> = (emp?.competencies as any) ?? {};
    // Map position canonical key → employee's competency field name in currentComps
    // Handles both camelCase (frontend-generated) and snake_case (DB-generated) keys
    const empKeyMap: Record<string, string> = {
      technical:       'technical',
      leadership:      'leadership',
      communication:   'communication',
      problemSolving:  'problem_solving',
      problem_solving: 'problem_solving',
      adaptability:    'adaptability',
    };

    const comps = this.viewingCompetencies();
    const baseList = comps.length > 0 ? comps : [
      { key: 'technical',      label: 'Chuyên môn kỹ thuật', icon: 'tool',    score: null as number | null },
      { key: 'leadership',     label: 'Lãnh đạo',            icon: 'crown',   score: null as number | null },
      { key: 'communication',  label: 'Giao tiếp',           icon: 'message', score: null as number | null },
      { key: 'problemSolving', label: 'Giải quyết vấn đề',   icon: 'bulb',    score: null as number | null },
      { key: 'adaptability',   label: 'Thích nghi',          icon: 'sync',    score: null as number | null },
    ];

    return baseList.map(vc => {
      const meta     = this.resolveCompMeta(vc.key);
      const canonKey = meta?.key ?? vc.key;
      const empField = empKeyMap[canonKey] ?? canonKey;
      // Use explicit undefined check so a genuine null (unrated) does NOT fall through
      const rawCurrent = currentComps[empField] !== undefined
                         ? currentComps[empField]
                         : currentComps[canonKey] !== undefined
                           ? currentComps[canonKey]
                           : null;
      const current  = rawCurrent;                       // null → N/A gap badge
      const target   = vc.score;                         // position target score from DB
      // gap = current − target (positive = exceeds target ✓, negative = below target ✗)
      const gap = (target !== null && current !== null)
                  ? Math.round(current - target) : null;
      return { ...vc, current, target, gap };
    });
  });

  private positionSvc = inject(KeyPositionService);
  private successionSvc = inject(SuccessionService);
  private employeeSvc = inject(EmployeeService);
  private sbSvc = inject(SupabaseService);
  private auth = inject(AuthService);

  isAdmin = computed(() => this.auth.isAdmin());

  /** Người kế thừa của vị trí đang mở drawer — dùng data đã load sẵn từ plans(). */
  editingSuccessors = computed(() => {
    const id = this.editingId();
    if (!id) return [];
    return this.getPlan(id)?.successors ?? [];
  });

  constructor(private msg: NzMessageService, private route: ActivatedRoute) {}

  async ngOnInit(): Promise<void> {
    this.loading.set(true);

    // Đọc queryParam từ dashboard deeplink (vd: ?filter=has-successor)
    const filterParam = this.route.snapshot.queryParamMap.get('filter');
    if (filterParam === 'has-successor') this.coverageFilter.set('covered');
    if (filterParam === 'no-successor')  this.coverageFilter.set('uncovered');

    // Isolate each call so one failure doesn't block the others
    const [positions, plans, depts, emps] = await Promise.all([
      this.positionSvc.getAll().catch(() => [] as any[]),
      this.successionSvc.getPlans().catch(() => [] as any[]),
      this.sbSvc.client.from('departments').select('id, name').order('name'),
      this.sbSvc.client.from('v_employees').select('id, full_name, position, department_id').eq('is_active', true),
    ]);

    this.positions.set(positions as any);
    this.plans.set(plans as any);

    // Deep-link từ Succession module: ?gapPos=<posId>&gapEmp=<empId>&gapName=<name>
    const gapPosId     = this.route.snapshot.queryParamMap.get('gapPos');
    const gapEmpId     = this.route.snapshot.queryParamMap.get('gapEmp');
    const gapEmpName   = this.route.snapshot.queryParamMap.get('gapName')      ?? '—';
    const gapReadiness = this.route.snapshot.queryParamMap.get('gapReadiness') ?? 'Ready Now';
    const gapScore     = this.route.snapshot.queryParamMap.get('gapScore');

    if (gapPosId && gapEmpId) {
      const targetPos = (positions as any[]).find(p => p.id === gapPosId);
      if (targetPos) {
        this.openPositionView(targetPos as any);
        await this.openGapPanel({
          talent_id:   gapEmpId,
          talent_name: gapEmpName,
          readiness:   gapReadiness,
          priority:    1,
          gap_score:   gapScore !== null ? Number(gapScore) : null,
        });
      }
    }

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

  // ─── Drawer actions ──────────────────────────────────────
  /** Nút "Thêm vị trí": mở drawer ở chế độ tạo mới */
  openAddModal(): void {
    this.editingId.set(null);
    this.viewingPosition.set(null);
    this.drawerMode.set('edit');
    this.resetDraft();
    this.showAddModal.set(true);
  }

  /** Click card: mở drawer ở chế độ xem (view) */
  openPositionView(p: KeyPosition, ev?: Event): void {
    ev?.stopPropagation();
    this.viewingPosition.set(p);
    this.editingId.set(null);
    this.drawerMode.set('view');
    this.showAddModal.set(true);
  }

  /** Nút edit trong drawer view: chuyển sang chế độ chỉnh sửa */
  enterEditMode(): void {
    const p = this.viewingPosition();
    if (!p) return;
    if (!this.canEdit()) {
      this.msg.warning('Chỉ Admin và Line Manager được phép chỉnh sửa');
      return;
    }
    this.editingId.set(p.id);
    const deptId = this.allDepts().find(d => d.name === p.department)?.id ?? null;
    const holderEmp = this.allEmployees().find(e => e.full_name === p.current_holder) ?? null;
    this.draft.set({
      title: p.title,
      department: deptId,
      current_holder: p.current_holder,
      current_holder_id: holderEmp?.id ?? null,
      critical_level: p.critical_level as CriticalLevel,
    });

    // Match competencies từ DB (key ngắn hoặc tên đầy đủ) → Competency object
    const rawKeys = p.required_competencies ?? [];
    const matched = rawKeys
      .map(raw => this.resolveCompMeta(raw))
      .filter((m): m is Competency => m !== undefined);
    // Dedup nếu 2 raw key cùng map về 1 canonical
    const seen = new Set<string>();
    const dedupMatched = matched.filter(c => seen.has(c.key) ? false : (seen.add(c.key), true));

    this.selectedCompetencies.set(dedupMatched);
    this.availableCompetencies.set(this.allCompetencies.filter(c => !seen.has(c.key)));

    // Load scores — normalize: old raw-name keys → canonical short keys
    const existingScores = p.competency_scores ?? {};
    const canonicalScores: Record<string, number> = {};
    for (const [rawKey, score] of Object.entries(existingScores)) {
      if (score === null || score === undefined) continue;
      const meta = this.resolveCompMeta(rawKey) ?? this.allCompetencies.find(c => c.key === rawKey);
      const canonKey = meta?.key ?? rawKey;
      canonicalScores[canonKey] = score as number;
    }
    this.competencyScores.set(canonicalScores);
    this.drawerMode.set('edit');
  }

  /** Từ edit → quay về view nếu đang chỉnh sửa, hoặc đóng nếu đang tạo mới */
  exitToView(): void {
    if (this.viewingPosition()) {
      this.editingId.set(null);
      this.drawerMode.set('view');
    } else {
      this.closeAddModal();
    }
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
    this.editingId.set(null);
    this.viewingPosition.set(null);
    this.gapSuccessor.set(null);
    this.gapEmployee.set(null);
  }

  // ─── Gap Analysis sub-panel ─────────────────────────────────
  async openGapPanel(s: any): Promise<void> {
    this.gapSuccessor.set(s);
    this.gapEmployee.set(null);
    this.gapLoading.set(true);
    try {
      const emp = await this.employeeSvc.getById(s.talent_id);
      this.gapEmployee.set(emp);
    } catch { /* keep null */ }
    this.gapLoading.set(false);
  }

  closeGapPanel(): void {
    this.gapSuccessor.set(null);
    this.gapEmployee.set(null);
  }

  // ─── Competency score helpers ─────────────────────────────
  /** Trả về điểm thực từ DB/user — null nếu chưa đặt (không default 70) */
  getCompScore(key: string): number | null {
    return this.competencyScores()[key] ?? null;
  }

  setCompScore(key: string, ev: Event): void {
    const raw = (ev.target as HTMLInputElement).value.trim();
    this.competencyScores.update(s => {
      const copy = { ...s };
      if (raw === '') {
        // User xóa trắng → bỏ key này, không lưu undefined
        delete copy[key];
      } else {
        copy[key] = Math.min(100, Math.max(0, Number(raw)));
      }
      return copy;
    });
  }

  /** Tìm Competency trong allCompetencies bằng key chính xác, label, hoặc keyword */
  private resolveCompMeta(rawKey: string): Competency | undefined {
    const lower = rawKey.toLowerCase();
    return this.allCompetencies.find(c => c.key === rawKey)
        ?? this.allCompetencies.find(c => c.label.toLowerCase() === lower)
        ?? this.allCompetencies.find(c =>
            lower.includes(c.label.toLowerCase()) ||
            c.label.toLowerCase().includes(lower)
          );
  }

  /** Competencies của vị trí đang xem (kết hợp key + score) */
  readonly viewingCompetencies = computed(() => {
    const p = this.viewingPosition();
    if (!p) return [];
    const scores = p.competency_scores ?? {};
    return (p.required_competencies ?? []).map(rawKey => {
      const meta  = this.resolveCompMeta(rawKey);
      const label = meta?.label ?? rawKey;               // tên đầy đủ từ DB đã human-readable
      const icon  = meta?.icon  ?? this.resolveCompIcon(rawKey);
      // Tìm score: theo canonical key (nếu resolve được) rồi theo raw key
      const canonKey = meta?.key ?? rawKey;
      const score = scores[canonKey] ?? scores[rawKey] ?? null;
      return { key: rawKey, label, icon, score };
    });
  });

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
      const scores = this.competencyScores();

      // Chỉ lưu scores đã được user đặt (loại bỏ null/undefined)
      const cleanScores = Object.fromEntries(
        Object.entries(scores).filter(([, v]) => v !== null && v !== undefined && !isNaN(v as number))
      );

      // Optimistic update: cập nhật local state ngay → quay về view mode ngay
      // để tránh màn hình bị đứng khi DB chậm hoặc lỗi
      const updated: Partial<KeyPosition> = {
        title: d.title.trim(),
        department: deptName,
        current_holder: d.current_holder.trim(),
        critical_level: d.critical_level,
        required_competencies: competencyKeys,
        competency_scores: cleanScores,
      };
      this.positions.update(list => list.map(p => p.id === editId ? { ...p, ...updated } : p));
      this.viewingPosition.update(p => p ? { ...p, ...updated } : null);
      this.exitToView(); // Return về view mode ngay — không đợi DB

      // Sync lên DB background (service tự fallback nếu cột chưa tồn tại)
      const dbPayload = {
        title: d.title.trim(),
        department_id: d.department,
        current_holder_id: d.current_holder_id,
        critical_level: d.critical_level,
        required_competencies: competencyKeys,
        competency_scores: cleanScores,
      };
      const saved = await this.positionSvc.update(editId, dbPayload);
      if (saved) {
        this.msg.success('Đã cập nhật vị trí');
      } else {
        // Thông báo nhẹ — view mode đã hiển thị đúng, chỉ DB chưa đồng bộ
        this.msg.warning('Hiển thị đã cập nhật — lưu DB chưa thành công (kiểm tra migration RLS)');
      }
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
      competency_scores: this.competencyScores(),
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
