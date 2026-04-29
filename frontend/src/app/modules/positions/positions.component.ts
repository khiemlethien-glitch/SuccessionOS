import { Component, HostListener, OnInit, computed, signal, inject } from '@angular/core';
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
interface EmpOpt  {
  id: string;
  full_name: string;
  position: string;
  department_id: string;
  /** Target competency scores — từ v_employees.comp_target_* (0-100) */
  comp_target_technical:       number | null;
  comp_target_leadership:      number | null;
  comp_target_communication:   number | null;
  comp_target_problem_solving: number | null;
  comp_target_adaptability:    number | null;
}

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

  isMobile = signal(typeof window !== 'undefined' && window.innerWidth <= 768);

  @HostListener('window:resize')
  onResize(): void {
    if (typeof window !== 'undefined') this.isMobile.set(window.innerWidth <= 768);
  }

  readonly totalCount     = computed(() => this.positions().length);
  readonly criticalCount  = computed(() => this.positions().filter(p => p.critical_level === 'Critical').length);
  readonly noSuccessor    = computed(() => this.positions().filter(p => p.successor_count === 0).length);
  readonly highRiskCount  = computed(() => this.positions().filter(p => this.derivedRiskLevel(p) === 'High').length);

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

  /** Prototype: mọi user đã xác thực đều được chỉnh sửa. Backend sẽ enforce real RBAC. */
  readonly canEdit = computed(() => this.auth.isAuthenticated());

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

  /**
   * Khi chọn title từ dropdown → tìm nhân viên duy nhất đang giữ chức danh đó.
   * Dùng để auto-fill dept + holder và lock 2 field này.
   */
  readonly titleMatchedEmployee = computed<EmpOpt | null>(() => {
    const title = this.draft().title;
    if (!title) return null;
    const matches = this.allEmployees().filter(e => e.position === title);
    return matches.length >= 1 ? matches[0] : null;
  });

  /**
   * Fields phòng ban + đương nhiệm bị lock khi:
   *   - đang ở CREATE mode VÀ title khớp với nhân viên trong hệ thống
   * Trong EDIT mode vẫn có thể chỉnh sửa (e.g., đương nhiệm mới thay thế).
   */
  readonly isFieldLocked = computed<boolean>(() =>
    !this.isEditMode() && this.titleMatchedEmployee() !== null
  );

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
    // Map position competency key → employee competency field in currentComps.
    // Non-standard position keys (sales, strategy, etc.) are mapped to the closest
    // standard competency so the gap column always has a meaningful value to display.
    const empKeyMap: Record<string, string> = {
      // ── Standard keys (direct match) ────────────────────────────────────
      technical:            'technical',
      leadership:           'leadership',
      communication:        'communication',
      problemSolving:       'problem_solving',
      problem_solving:      'problem_solving',
      adaptability:         'adaptability',
      // ── Leadership / strategic family ────────────────────────────────────
      strategic_thinking:   'leadership',
      strategy:             'leadership',
      talent_management:    'leadership',
      hrm:                  'leadership',
      operations:           'leadership',
      logistics:            'leadership',
      process_improvement:  'adaptability',
      agile:                'adaptability',
      // ── Technical / functional family ────────────────────────────────────
      technology:           'technical',
      architecture:         'technical',
      software_development: 'technical',
      warehouse:            'technical',
      wms:                  'technical',
      finance:              'technical',
      accounting:           'technical',
      tax:                  'technical',
      compliance:           'technical',
      // ── Communication / sales family ─────────────────────────────────────
      sales:                'communication',
      negotiation:          'communication',
      crm:                  'communication',
      international_sales:  'communication',
      english:              'communication',
      recruitment:          'communication',
      employer_branding:    'communication',
      // ── Analysis / problem-solving family ───────────────────────────────
      analysis:             'problem_solving',
      financial_acumen:     'problem_solving',
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
      this.sbSvc.client.from('v_employees')
        .select('id, full_name, position, department_id, comp_target_technical, comp_target_leadership, comp_target_communication, comp_target_problem_solving, comp_target_adaptability')
        .eq('is_active', true),
    ]);

    // Line Manager: scope to own department only
    const authUser = this.auth.currentUser();
    const lmDeptId = authUser?.role === 'Line Manager' ? (authUser.department_id ?? null) : null;
    const filteredPositions = lmDeptId
      ? (positions as any[]).filter((p: any) => p.department_id === lmDeptId)
      : (positions as any[]);

    this.positions.set(filteredPositions as any);
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

    // Deep-link từ Succession module: ?posId=<id>&openFinder=true
    // → mở drawer position rồi mở modal tìm kế thừa
    const deepPosId    = this.route.snapshot.queryParamMap.get('posId');
    const deepFinder   = this.route.snapshot.queryParamMap.get('openFinder');
    if (deepPosId && deepFinder === 'true') {
      const targetPos = (positions as any[]).find(p => p.id === deepPosId);
      if (targetPos) {
        this.openPositionView(targetPos as any);
        await this.openFindSuccessor();
      }
    }

    // Deep-link từ Succession drawer: ?drawer=<positionId>
    // → mở đúng drawer vị trí đó ở view mode
    const drawerParam = this.route.snapshot.queryParamMap.get('drawer');
    if (drawerParam && !gapPosId && !deepPosId) {
      const targetPos = (positions as any[]).find(p => p.id === drawerParam);
      if (targetPos) this.openPositionView(targetPos as any);
    }

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

  /** Tính risk_level động dựa vào successor_count + ready_now_count + critical_level */
  derivedRiskLevel(p: { successor_count?: number; ready_now_count?: number; critical_level?: string }): 'High' | 'Medium' | 'Low' {
    const s = p.successor_count ?? 0;
    const r = p.ready_now_count ?? 0;
    const c = p.critical_level ?? '';
    if (s === 0) return c === 'Critical' || c === 'High' ? 'High' : 'Medium';
    if (r === 0 && (c === 'Critical' || c === 'High')) return 'Medium';
    return 'Low';
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

  /** Trả về inline style cho slider để filled track phản ánh đúng giá trị */
  getSliderStyle(val: number): string {
    const pct = Math.min(100, Math.max(0, val));
    return `background: linear-gradient(to right, #4f46e5 ${pct}%, #e0e7ff ${pct}%)`;
  }

  setCompScore(key: string, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const raw = input.value.trim();
    const num = raw === '' ? null : Math.min(100, Math.max(0, Number(raw)));
    this.competencyScores.update(s => {
      const copy = { ...s };
      if (num === null) { delete copy[key]; } else { copy[key] = num; }
      return copy;
    });
    // Update slider fill gradient live while dragging
    if (input.type === 'range' && num !== null) {
      input.style.background = `linear-gradient(to right, #4f46e5 ${num}%, #e0e7ff ${num}%)`;
    }
  }

  /**
   * Bảng alias: DB key → UI component key.
   * Dùng khi tên key trong DB khác với key trong allCompetencies
   * (ví dụ: DB "strategy" → UI "strategic", "problem_solving" → "problemSolving").
   */
  private readonly _keyAlias: Record<string, string> = {
    strategic_thinking: 'strategic',
    strategy:           'strategic',
    financial_acumen:   'financial',
    finance:            'financial',
    problem_solving:    'problemSolving',
    data_analysis:      'dataAnalysis',
    project_management: 'projectMgmt',
    risk_management:    'riskManagement',
    risk:               'riskManagement',
    customer_focus:     'customerFocus',
    customer:           'customerFocus',
    adapt:              'adaptability',
    analysis:           'dataAnalysis',
  };

  /**
   * Resolve một raw key (từ DB hoặc tên đầy đủ) → Competency trong allCompetencies.
   * Thứ tự ưu tiên:
   *   1. Exact key match
   *   2. Alias lookup (_keyAlias)
   *   3. Normalized key (bỏ dấu gạch dưới, lowercase)
   *   4. Vietnamese label exact
   *   5. Key substring (c.key ⊂ rawKey hoặc ngược lại)
   *   6. Label keyword
   */
  private resolveCompMeta(rawKey: string): Competency | undefined {
    const lower = rawKey.toLowerCase();
    const normalized = lower.replace(/_/g, '');

    // 1. Exact key
    const direct = this.allCompetencies.find(c => c.key === rawKey);
    if (direct) return direct;

    // 2. Alias
    const aliasKey = this._keyAlias[lower];
    if (aliasKey) return this.allCompetencies.find(c => c.key === aliasKey);

    // 3. Normalized key (removes underscores + case — "problemSolving" vs "problem_solving")
    const normMatch = this.allCompetencies.find(c =>
      c.key.toLowerCase().replace(/_/g, '') === normalized
    );
    if (normMatch) return normMatch;

    // 4. Exact Vietnamese label
    const labelMatch = this.allCompetencies.find(c => c.label.toLowerCase() === lower);
    if (labelMatch) return labelMatch;

    // 5. Key substring (handles "strategic_thinking" ⊃ "strategic", "financial_acumen" ⊃ "financial")
    const subMatch = this.allCompetencies.find(c => {
      const ck = c.key.toLowerCase();
      return lower.includes(ck) || ck.includes(lower);
    });
    if (subMatch) return subMatch;

    // 6. Vietnamese label keyword
    return this.allCompetencies.find(c =>
      lower.includes(c.label.toLowerCase()) || c.label.toLowerCase().includes(lower)
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
    if (key === 'title') {
      this._applyTitleAutoFill(value as string);
    }
  }

  /** Khi chọn title: auto-fill + lock dept/holder; load comps từ vị trí đã có nếu match. */
  private _applyTitleAutoFill(title: string): void {
    if (!title) {
      // Title bị xóa → reset dept + holder
      this.draft.update(d => ({ ...d, department: null, current_holder: '', current_holder_id: null }));
      return;
    }
    // titleMatchedEmployee computed đã cập nhật vì draft.title đã được set
    const emp = this.titleMatchedEmployee();
    if (emp) {
      this.draft.update(d => ({
        ...d,
        department:        emp.department_id ?? null,
        current_holder:    emp.full_name,
        current_holder_id: emp.id,
      }));
    }
    // Nếu đã có key_position với title này → load comps + scores từ DB
    const existingPos = this.positions().find(p => p.title === title);
    if (existingPos) {
      this._loadCompetenciesFromPosition(existingPos);
    } else if (emp) {
      // Chưa có key_position → fallback: dùng comp_target_* của nhân viên đương nhiệm
      this._loadCompetenciesFromEmployee(emp);
    }
  }

  /**
   * Load competencies + target scores từ một KeyPosition đã có vào form state.
   * Keys trong DB mà không map được sang UI competency sẽ được tạo ad-hoc
   * (hiện trong "Đã chọn" với label tiếng Việt và icon phù hợp).
   */
  private _loadCompetenciesFromPosition(pos: KeyPosition): void {
    const rawKeys = pos.required_competencies ?? [];
    const selected: Competency[] = [];
    const usedUiKeys = new Set<string>();

    for (const raw of rawKeys) {
      const meta = this.resolveCompMeta(raw);
      if (meta) {
        if (!usedUiKeys.has(meta.key)) {
          selected.push(meta);
          usedUiKeys.add(meta.key);
        }
      } else {
        // Key không có trong danh sách chuẩn → tạo competency ad-hoc
        if (!usedUiKeys.has(raw)) {
          selected.push({ key: raw, label: this._humanizeKey(raw), icon: this.resolveCompIcon(raw) });
          usedUiKeys.add(raw);
        }
      }
    }

    this.selectedCompetencies.set(selected);
    this.availableCompetencies.set(this.allCompetencies.filter(c => !usedUiKeys.has(c.key)));

    // Load + canonicalize scores (DB raw key → UI canonical key)
    const rawScores = pos.competency_scores ?? {};
    const canon: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores)) {
      if (v == null) continue;
      const meta = this.resolveCompMeta(k);
      canon[meta?.key ?? k] = v as number;
    }
    this.competencyScores.set(canon);
  }

  /**
   * Khi title mới chưa có key_position trong DB → fallback: auto-select 5 năng lực
   * chuẩn và điền target scores từ comp_target_* của nhân viên đương nhiệm.
   */
  private _loadCompetenciesFromEmployee(emp: EmpOpt): void {
    const STD = ['technical', 'leadership', 'communication', 'problemSolving', 'adaptability'];
    this.selectedCompetencies.set(this.allCompetencies.filter(c => STD.includes(c.key)));
    this.availableCompetencies.set(this.allCompetencies.filter(c => !STD.includes(c.key)));

    const scores: Record<string, number> = {};
    if (emp.comp_target_technical       != null) scores['technical']       = emp.comp_target_technical;
    if (emp.comp_target_leadership      != null) scores['leadership']      = emp.comp_target_leadership;
    if (emp.comp_target_communication   != null) scores['communication']   = emp.comp_target_communication;
    if (emp.comp_target_problem_solving != null) scores['problemSolving']  = emp.comp_target_problem_solving;
    if (emp.comp_target_adaptability    != null) scores['adaptability']    = emp.comp_target_adaptability;
    this.competencyScores.set(scores);
  }

  /** Chuyển DB raw key sang label tiếng Việt (cho ad-hoc competencies). */
  private _humanizeKey(key: string): string {
    const LABELS: Record<string, string> = {
      hrm:                  'Quản lý nhân sự',
      talent_management:    'Quản lý nhân tài',
      sales:                'Kinh doanh',
      negotiation:          'Đàm phán',
      operations:           'Vận hành',
      logistics:            'Logistics',
      compliance:           'Tuân thủ',
      crm:                  'Quản lý khách hàng (CRM)',
      technology:           'Công nghệ',
      architecture:         'Kiến trúc hệ thống',
      process_improvement:  'Cải tiến quy trình',
      international_sales:  'Kinh doanh quốc tế',
      english:              'Tiếng Anh',
      accounting:           'Kế toán',
      tax:                  'Thuế',
      recruitment:          'Tuyển dụng',
      employer_branding:    'Thương hiệu tuyển dụng',
      software_development: 'Phát triển phần mềm',
      agile:                'Agile / Scrum',
      warehouse:            'Quản lý kho bãi',
      wms:                  'Hệ thống kho (WMS)',
    };
    return LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
    // Default score = 70 khi thêm mới (slider sẽ hiện 70, không cần user kéo mới có giá trị)
    if (this.getCompScore(c.key) === null) {
      this.competencyScores.update(s => ({ ...s, [c.key]: 70 }));
    }
  }
  removeCompetency(c: Competency): void {
    this.selectedCompetencies.update(list => list.filter(x => x.key !== c.key));
    this.availableCompetencies.update(list => [...list, c]);
  }

  canSubmit = computed(() => {
    const d = this.draft();
    return !!(d.title.trim() && d.department && d.current_holder.trim() && this.selectedCompetencies().length > 0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND SUCCESSOR MODAL
  // ═══════════════════════════════════════════════════════════════════════════

  readonly fsReadinessOpts = [
    { value: 'Ready Now',        label: 'Sẵn sàng ngay',    color: '#52c41a' },
    { value: 'Ready in 1 Year',  label: 'Ngắn hạn 1 năm',   color: '#1890ff' },
    { value: 'Ready in 2 Years', label: 'Trung hạn 1–2 năm', color: '#faad14' },
  ];

  showFindSuccessor   = signal(false);
  fsLoading           = signal(false);
  fsSaving            = signal(false);
  fsAllCandidates     = signal<Talent[]>([]);
  fsSelectedIds       = signal<Set<string>>(new Set());
  fsPage              = signal(1);
  readonly fsPageSize = 10;
  fsNameQuery         = signal('');
  fsMinPerf           = signal<number | null>(null);
  fsMinPotential      = signal<number | null>(null);
  fsMinMatch          = signal<number | null>(null);
  fsMaxMatch          = signal<number | null>(null);   // gap range upper bound
  fsReadiness         = signal<string[]>([]);
  fsExcludeRisk       = signal(false);

  /** All employees scored + excluding existing successors, sorted by match desc */
  readonly fsScoredAll = computed(() => {
    const pos = this.viewingPosition();
    if (!pos) return [] as (Talent & { matchScore: number })[];
    const existingIds = new Set(
      (this.getPlan(pos.id)?.successors ?? []).map((s: any) => s.talent_id)
    );
    return this.fsAllCandidates()
      .filter(e => !existingIds.has(e.id))
      .map(e => ({ ...e, matchScore: this.calcMatchScore(e) }))
      .sort((a, b) => b.matchScore - a.matchScore);
  });

  /** Candidates after applying filter controls */
  readonly fsFiltered = computed(() => {
    let list = this.fsScoredAll() as (Talent & { matchScore: number })[];
    const q        = this.fsNameQuery().trim().toLowerCase();
    const minPerf  = this.fsMinPerf();
    const minPot   = this.fsMinPotential();
    const minMatch = this.fsMinMatch();
    const maxMatch = this.fsMaxMatch();
    const readiness = this.fsReadiness();
    const excRisk  = this.fsExcludeRisk();
    if (q)                 list = list.filter(e => e.full_name.toLowerCase().includes(q));
    if (minPerf  !== null) list = list.filter(e => (e.performance_score ?? 0) >= minPerf);
    if (minPot   !== null) list = list.filter(e => (e.potential_score   ?? 0) >= minPot);
    if (minMatch !== null) list = list.filter(e => e.matchScore >= minMatch);
    if (maxMatch !== null) list = list.filter(e => e.matchScore <= maxMatch);
    if (readiness.length)  list = list.filter(e => readiness.includes(e.readiness_level));
    if (excRisk)           list = list.filter(e => (e.risk_score ?? 0) < 60);
    return list;
  });

  readonly fsTotal     = computed(() => this.fsFiltered().length);
  readonly fsPagedList = computed(() => {
    const s = (this.fsPage() - 1) * this.fsPageSize;
    return this.fsFiltered().slice(s, s + this.fsPageSize);
  });

  get fsSelectedCount(): number { return this.fsSelectedIds().size; }
  get fsPageAllSelected(): boolean {
    const ids = this.fsPagedList().map(e => e.id);
    return ids.length > 0 && ids.every(id => this.fsSelectedIds().has(id));
  }

  /**
   * Match score = mean(empScore / targetScore × 100) per required competency.
   * Falls back to (performance + potential) / 2 if no comp requirements defined.
   */
  calcMatchScore(emp: Talent): number {
    const pos = this.viewingPosition();
    if (!pos) return 0;
    const comps   = pos.required_competencies ?? [];
    const targets = (pos.competency_scores ?? {}) as Record<string, number>;
    const empKeyMap: Record<string, string> = {
      technical: 'technical', leadership: 'leadership',
      communication: 'communication', problemSolving: 'problem_solving',
      problem_solving: 'problem_solving', adaptability: 'adaptability',
    };
    if (!comps.length) {
      return Math.round(((emp.performance_score ?? 0) + (emp.potential_score ?? 0)) / 2);
    }
    let total = 0, count = 0;
    for (const rawKey of comps) {
      const meta     = this.resolveCompMeta(rawKey);
      const canonKey = meta?.key ?? rawKey;
      const target   = targets[canonKey] ?? targets[rawKey] ?? null;
      if (!target) continue;
      const empField = empKeyMap[canonKey] ?? canonKey;
      const current  = (emp.competencies as any)?.[empField] ?? null;
      if (current === null) continue;
      total += Math.min(100, (current / target) * 100);
      count++;
    }
    return count === 0
      ? Math.round(((emp.performance_score ?? 0) + (emp.potential_score ?? 0)) / 2)
      : Math.round(total / count);
  }

  async openFindSuccessor(): Promise<void> {
    // Ẩn drawer để tránh layered UI (viewingPosition vẫn giữ để modal dùng)
    this.showAddModal.set(false);
    this.showFindSuccessor.set(true);
    if (this.fsAllCandidates().length === 0) {
      this.fsLoading.set(true);
      try {
        const res = await this.employeeSvc.getAll();
        this.fsAllCandidates.set(res.data);
      } catch { /* keep empty */ }
      this.fsLoading.set(false);
    }
  }

  closeFindSuccessor(): void {
    this.showFindSuccessor.set(false);
    this.fsSelectedIds.set(new Set());
    this.fsPage.set(1);
    // Mở lại drawer nếu đang xem một vị trí
    if (this.viewingPosition()) {
      this.showAddModal.set(true);
    }
  }

  toggleFsSelect(id: string, ev?: MouseEvent): void {
    ev?.stopPropagation();
    this.fsSelectedIds.update(s => {
      const copy = new Set(s);
      copy.has(id) ? copy.delete(id) : copy.add(id);
      return copy;
    });
  }

  isFsSelected(id: string): boolean { return this.fsSelectedIds().has(id); }
  clearFsSelection(): void { this.fsSelectedIds.set(new Set()); }

  toggleFsPageSelect(): void {
    const ids   = this.fsPagedList().map(e => e.id);
    const allSel = ids.every(id => this.fsSelectedIds().has(id));
    this.fsSelectedIds.update(s => {
      const copy = new Set(s);
      if (allSel) ids.forEach(id => copy.delete(id));
      else        ids.forEach(id => copy.add(id));
      return copy;
    });
  }

  async fsConfirmAdd(): Promise<void> {
    const pos = this.viewingPosition();
    if (!pos || this.fsSelectedIds().size === 0) return;
    this.fsSaving.set(true);
    const existingCount = (this.getPlan(pos.id)?.successors ?? []).length;
    const ids = [...this.fsSelectedIds()];
    try {
      for (let i = 0; i < ids.length; i++) {
        const emp = this.fsAllCandidates().find(e => e.id === ids[i]);
        await this.successionSvc.upsertPlan({
          position_id: pos.id,
          talent_id:   ids[i],
          readiness:   emp?.readiness_level ?? 'Ready in 2 Years',
          priority:    existingCount + i + 1,
          gap_score:   emp ? this.calcMatchScore(emp) : null,
        });
      }
      this.msg.success(`Đã thêm ${ids.length} người kế thừa cho "${pos.title}"`);
      const plans = await this.successionSvc.getPlans().catch(() => [] as any[]);
      this.plans.set(plans as any);
      const updatedPlan = (plans as any[]).find((p: any) => p.position_id === pos.id);
      if (updatedPlan) {
        const newSuccCount   = updatedPlan.successors.length;
        const newReadyCount  = updatedPlan.successors.filter((s: any) => s.readiness === 'Ready Now').length;
        // Update viewing position (right-side panel)
        this.viewingPosition.update(vp => vp ? {
          ...vp, successor_count: newSuccCount, ready_now_count: newReadyCount,
        } : null);
        // Update the card in the grid (successor_count + ready_now_count badges)
        this.positions.update(list => list.map(p => p.id === pos.id
          ? { ...p, successor_count: newSuccCount, ready_now_count: newReadyCount }
          : p
        ));
        // Sync successor_count back to DB so PostgREST reflects correct count
        this.sbSvc.client
          .from('key_positions')
          .update({ successor_count: newSuccCount, ready_now_count: newReadyCount })
          .eq('id', pos.id);
      }
      this.closeFindSuccessor();
    } catch (e) {
      console.error('[positions] fsConfirmAdd failed:', e);
      this.msg.error('Lỗi khi lưu người kế thừa — vui lòng thử lại');
    } finally {
      this.fsSaving.set(false);
    }
  }

  fsSetMinPerf(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this.fsMinPerf.set(v === '' ? null : Number(v));
    this.fsPage.set(1);
  }
  fsSetMinPotential(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this.fsMinPotential.set(v === '' ? null : Number(v));
    this.fsPage.set(1);
  }
  fsSetMinMatch(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this.fsMinMatch.set(v === '' ? null : Number(v));
    this.fsPage.set(1);
  }
  fsSetMaxMatch(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value.trim();
    this.fsMaxMatch.set(v === '' ? null : Number(v));
    this.fsPage.set(1);
  }
  fsToggleReadiness(r: string, checked: boolean): void {
    this.fsReadiness.update(l => checked ? [...l, r] : l.filter(x => x !== r));
    this.fsPage.set(1);
  }

  // ─── Display helpers ──────────────────────────────────────────────────────
  fsMatchTone(score: number): string {
    if (score >= 85) return '#52c41a';
    if (score >= 70) return '#1890ff';
    if (score >= 50) return '#faad14';
    return '#f5222d';
  }
  fsRiskLabel(risk: number | null): string {
    if (risk === null) return '—';
    if (risk >= 60) return 'Cao';
    if (risk >= 30) return 'TB';
    return 'Thấp';
  }
  fsRiskClass(risk: number | null): string {
    if (risk === null) return 'fs-risk-na';
    if (risk >= 60) return 'fs-risk-hi';
    if (risk >= 30) return 'fs-risk-md';
    return 'fs-risk-lo';
  }
  fsReadinessLabel(r: string): string {
    if (r === 'Ready Now') return 'Sẵn sàng ngay';
    if (r === 'Ready in 1 Year') return 'Ngắn hạn 1 năm';
    return 'Trung hạn 1–2 năm';
  }
  fsReadinessColor(r: string): string {
    if (r === 'Ready Now') return '#52c41a';
    if (r === 'Ready in 1 Year') return '#1890ff';
    return '#faad14';
  }

  /**
   * Tạo vị trí mới rồi mở ngay Find Successor modal.
   * Chỉ dùng ở CREATE mode.
   */
  async submitAndFindSuccessor(): Promise<void> {
    if (!this.canSubmit()) return;
    const titleToFind = this.draft().title.trim();
    await this.submit(); // tạo vị trí + thêm vào positions() + đóng form
    // Tìm vị trí vừa tạo theo title để set viewingPosition cho Find Successor
    const newPos = this.positions().find(p => p.title === titleToFind);
    if (newPos) {
      this.viewingPosition.set(newPos);
      await this.openFindSuccessor();
    }
  }

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
        this.msg.warning('Hiển thị đã cập nhật — lưu DB chưa thành công, vui lòng thử lại');
      }
      return;
    }

    // ── CREATE mode ──────────────────────────────────────

    // Bug fix: block duplicate title (case-insensitive)
    const titleTrimmed = d.title.trim();
    const duplicate = this.positions().find(
      p => p.title.trim().toLowerCase() === titleTrimmed.toLowerCase()
    );
    if (duplicate) {
      this.msg.error(`Vị trí "${titleTrimmed}" đã tồn tại trong hệ thống`);
      return;
    }

    // Use a temp UUID-like key for local state only; DB generates real UUID
    const tempId = `temp-${Date.now()}`;
    const newPos: KeyPosition = {
      id: tempId,
      title: titleTrimmed,
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
    this.closeAddModal();

    // Bug fix: do NOT send id — let DB generate UUID via DEFAULT gen_random_uuid()
    const dbPayload = {
      title: titleTrimmed,
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
    if (saved?.id) {
      // Replace tempId with real DB UUID
      this.positions.update(list => list.map(p => p.id === tempId ? { ...p, id: saved.id } : p));
      this.msg.success(`Đã thêm vị trí "${titleTrimmed}"`);
    } else {
      // Rollback: remove optimistic row if DB save failed
      this.positions.update(list => list.filter(p => p.id !== tempId));
      this.msg.error(`Không thể lưu vị trí "${titleTrimmed}" — vui lòng thử lại`);
    }
  }
}
