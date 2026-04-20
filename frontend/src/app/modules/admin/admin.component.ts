import { Component, OnInit, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { ApiService } from '../../core/services/api.service';
import {
  AuditLog, AuditLogListResponse,
  Talent, TalentListResponse,
  KeyPosition, PositionListResponse,
  IdpPlan, IdpListResponse,
  Assessment, AssessmentListResponse,
  SuccessionPlan, SuccessionPlanListResponse,
  MentoringPair, MentoringListResponse,
  CalibrationSession, CalibrationListResponse,
} from '../../core/models/models';

type TabKey = 'overview' | 'data' | 'users' | 'settings' | 'audit';

interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'Admin' | 'HR Manager' | 'Line Manager' | 'Viewer';
  status: 'Active' | 'Disabled';
  lastLogin: string;
}

interface EntityColumn {
  key: string;
  label: string;
  width?: string;
  type?: 'text' | 'tag' | 'number' | 'progress';
  editable?: boolean;
}

interface EntityDef {
  key: string;
  label: string;
  icon: string;
  data: WritableSignal<any[]>;
  columns: EntityColumn[];
  idKey: string;
  titleKey: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTableModule, NzTagModule, NzButtonModule, NzIconModule,
    NzModalModule, NzInputModule, NzSelectModule, NzSwitchModule, NzPopconfirmModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  activeTab = signal<TabKey>('overview');
  loading   = signal(true);

  // ── Entities
  logs        = signal<AuditLog[]>([]);
  talents     = signal<Talent[]>([]);
  positions   = signal<KeyPosition[]>([]);
  idpPlans    = signal<IdpPlan[]>([]);
  assessments = signal<Assessment[]>([]);
  successions = signal<SuccessionPlan[]>([]);
  mentorings  = signal<MentoringPair[]>([]);
  calibrations = signal<CalibrationSession[]>([]);

  users = signal<AdminUser[]>([
    { id: 'U001', username: 'admin',       fullName: 'HR Admin',          email: 'admin@ptscmc.vn',    role: 'Admin',        status: 'Active',   lastLogin: '2026-04-20 14:30' },
    { id: 'U002', username: 'hr.manager',  fullName: 'Nguyễn Thị Hoa',    email: 'hoa.nt@ptscmc.vn',   role: 'HR Manager',   status: 'Active',   lastLogin: '2026-04-19 09:15' },
    { id: 'U003', username: 'lm.kythuat',  fullName: 'Trần Minh Tuấn',    email: 'tuan.tm@ptscmc.vn',  role: 'Line Manager', status: 'Active',   lastLogin: '2026-04-18 16:42' },
    { id: 'U004', username: 'lm.duan',     fullName: 'Lê Hoàng Sơn',      email: 'son.lh@ptscmc.vn',   role: 'Line Manager', status: 'Active',   lastLogin: '2026-04-20 08:20' },
    { id: 'U005', username: 'viewer.ceo',  fullName: 'Phạm Quốc Việt',    email: 'viet.pq@ptscmc.vn',  role: 'Viewer',       status: 'Active',   lastLogin: '2026-04-17 11:05' },
    { id: 'U006', username: 'hr.backup',   fullName: 'Vũ Thị Lan',        email: 'lan.vt@ptscmc.vn',   role: 'HR Manager',   status: 'Disabled', lastLogin: '2026-03-15 10:00' },
  ]);

  modules = signal([
    { key: 'talent',      name: 'Quản lý Nhân tài',         desc: 'Talent Pool + Tier + Readiness', enabled: true,  tier: 'core' },
    { key: 'positions',   name: 'Vị trí Then chốt',          desc: 'Key Position + Criticality',    enabled: true,  tier: 'core' },
    { key: 'succession',  name: 'Kế hoạch Kế thừa',          desc: '9-Box + Succession Map',         enabled: true,  tier: 'core' },
    { key: 'idp',         name: 'Kế hoạch Phát triển (IDP)', desc: 'Goals + Approval workflow',      enabled: true,  tier: 'core' },
    { key: 'assessment',  name: 'Đánh giá Năng lực',          desc: '360° + Competency framework',    enabled: true,  tier: 'core' },
    { key: 'mentoring',   name: 'Mentoring',                 desc: 'Mentor pairs + Logbook',         enabled: true,  tier: 'pro' },
    { key: 'calibration', name: 'Calibration',               desc: '9-Box calibration sessions',     enabled: true,  tier: 'pro' },
    { key: 'reports',     name: 'Báo cáo & Xuất dữ liệu',     desc: 'Charts + Excel/PDF export',      enabled: false, tier: 'pro' },
    { key: 'api',         name: 'API & Webhook',             desc: 'HRMS integration',               enabled: false, tier: 'enterprise' },
  ]);

  // ── Data tab: entity selector
  selectedEntity = signal<string>('talents');
  entitySearch   = signal('');

  entities = computed<EntityDef[]>(() => [
    { key: 'talents', label: 'Nhân tài', icon: 'team', data: this.talents, idKey: 'id', titleKey: 'fullName',
      columns: [
        { key: 'id',         label: 'ID',        width: '80px' },
        { key: 'fullName',   label: 'Họ tên',    editable: true },
        { key: 'position',   label: 'Vị trí',    editable: true },
        { key: 'department', label: 'Phòng ban', editable: true, width: '130px' },
        { key: 'talentTier', label: 'Tier',      type: 'tag', editable: true, width: '110px' },
        { key: 'riskScore',  label: 'Risk',      type: 'number', editable: true, width: '80px' },
      ] },
    { key: 'positions', label: 'Vị trí then chốt', icon: 'apartment', data: this.positions, idKey: 'id', titleKey: 'title',
      columns: [
        { key: 'id',            label: 'ID',        width: '80px' },
        { key: 'title',         label: 'Tên vị trí', editable: true },
        { key: 'department',    label: 'Phòng ban', editable: true, width: '140px' },
        { key: 'currentHolder', label: 'Đang giữ',  editable: true },
        { key: 'criticalLevel', label: 'Mức độ',    type: 'tag', editable: true, width: '110px' },
        { key: 'successorCount',label: 'Kế thừa',   type: 'number', width: '90px' },
      ] },
    { key: 'idpPlans', label: 'Kế hoạch IDP', icon: 'solution', data: this.idpPlans, idKey: 'id', titleKey: 'talentName',
      columns: [
        { key: 'id',              label: 'ID',        width: '80px' },
        { key: 'talentName',      label: 'Nhân viên', editable: true },
        { key: 'year',            label: 'Năm',       type: 'number', editable: true, width: '80px' },
        { key: 'status',          label: 'Trạng thái',type: 'tag', editable: true, width: '120px' },
        { key: 'overallProgress', label: 'Tiến độ',   type: 'progress', editable: true, width: '140px' },
      ] },
    { key: 'assessments', label: 'Đánh giá 360°', icon: 'star', data: this.assessments, idKey: 'id', titleKey: 'talentName',
      columns: [
        { key: 'id',            label: 'ID',        width: '80px' },
        { key: 'talentName',    label: 'Nhân viên', editable: true },
        { key: 'period',        label: 'Kỳ',        editable: true, width: '140px' },
        { key: 'overallScore',  label: 'Overall',   type: 'number', editable: true, width: '90px' },
        { key: 'assessorCount', label: 'Đánh giá',  type: 'number', width: '100px' },
        { key: 'status',        label: 'Trạng thái', type: 'tag', editable: true, width: '130px' },
      ] },
    { key: 'successions', label: 'Kế hoạch Kế thừa', icon: 'cluster', data: this.successions, idKey: 'id', titleKey: 'positionTitle',
      columns: [
        { key: 'id',            label: 'ID',        width: '80px' },
        { key: 'positionTitle', label: 'Vị trí',    editable: true },
        { key: 'department',    label: 'Phòng ban', editable: true, width: '160px' },
        { key: 'successorCount',label: 'Số kế thừa', type: 'number', width: '120px' },
      ] },
    { key: 'mentorings', label: 'Mentoring', icon: 'user-add', data: this.mentorings, idKey: 'id', titleKey: 'mentorName',
      columns: [
        { key: 'id',         label: 'ID',       width: '80px' },
        { key: 'mentorName', label: 'Mentor',   editable: true },
        { key: 'menteeName', label: 'Mentee',   editable: true },
        { key: 'focus',      label: 'Trọng tâm', editable: true },
        { key: 'status',     label: 'Trạng thái', type: 'tag', editable: true, width: '110px' },
      ] },
    { key: 'calibrations', label: 'Calibration', icon: 'audit', data: this.calibrations, idKey: 'id', titleKey: 'title',
      columns: [
        { key: 'id',          label: 'ID',       width: '80px' },
        { key: 'title',       label: 'Tên phiên', editable: true },
        { key: 'facilitator', label: 'Chủ trì',  editable: true, width: '140px' },
        { key: 'date',        label: 'Ngày',     editable: true, width: '120px' },
        { key: 'status',      label: 'Trạng thái', type: 'tag', editable: true, width: '120px' },
      ] },
    { key: 'users', label: 'Người dùng', icon: 'user', data: this.users as WritableSignal<any[]>, idKey: 'id', titleKey: 'fullName',
      columns: [
        { key: 'username',  label: 'Username',  editable: true, width: '130px' },
        { key: 'fullName',  label: 'Họ tên',    editable: true },
        { key: 'email',     label: 'Email',     editable: true },
        { key: 'role',      label: 'Vai trò',   type: 'tag', editable: true, width: '130px' },
        { key: 'status',    label: 'Trạng thái', type: 'tag', editable: true, width: '110px' },
        { key: 'lastLogin', label: 'Login gần nhất', width: '160px' },
      ] },
  ]);

  currentEntity = computed<EntityDef>(() => {
    const key = this.selectedEntity();
    return this.entities().find(e => e.key === key) ?? this.entities()[0];
  });

  filteredRows = computed<any[]>(() => {
    const q = this.entitySearch().trim().toLowerCase();
    const rows = this.currentEntity().data();
    if (!q) return rows;
    return rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
  });

  // ── Edit modal
  editOpen = signal(false);
  editMode = signal<'add' | 'edit'>('edit');
  editForm = signal<Record<string, any>>({});
  editEntityKey = signal('');

  // ── Stats
  stats = computed(() => ({
    users:       this.users().length,
    talents:     this.talents().length,
    positions:   this.positions().length,
    idps:        this.idpPlans().length,
    assessments: this.assessments().length,
    events30d:   this.logs().length,
  }));

  recentLogs = computed(() => this.logs().slice(0, 5));

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    let pending = 8;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    this.api.get<AuditLogListResponse>('audit-logs','audit-logs').subscribe({ next: r => { this.logs.set(r.data); done(); }, error: done });
    this.api.get<TalentListResponse>('talents','talents').subscribe({ next: r => { this.talents.set(r.data); done(); }, error: done });
    this.api.get<PositionListResponse>('positions','positions').subscribe({ next: r => { this.positions.set(r.data); done(); }, error: done });
    this.api.get<IdpListResponse>('idp-plans','idp-plans').subscribe({ next: r => { this.idpPlans.set(r.data); done(); }, error: done });
    this.api.get<AssessmentListResponse>('assessments','assessments').subscribe({ next: r => { this.assessments.set(r.data); done(); }, error: done });
    this.api.get<SuccessionPlanListResponse>('succession-plans','succession-plans').subscribe({ next: r => { this.successions.set(r.data); done(); }, error: done });
    this.api.get<MentoringListResponse>('mentoring-pairs','mentoring-pairs').subscribe({ next: r => { this.mentorings.set(r.data); done(); }, error: done });
    this.api.get<CalibrationListResponse>('calibration-sessions','calibration-sessions').subscribe({ next: r => { this.calibrations.set(r.data); done(); }, error: done });
  }

  // ── Tab control
  setTab(t: TabKey): void { this.activeTab.set(t); }

  // ── Data tab helpers
  selectEntity(key: string): void {
    this.selectedEntity.set(key);
    this.entitySearch.set('');
  }

  // ── CRUD
  openAdd(): void {
    const ent = this.currentEntity();
    const draft: Record<string, any> = { [ent.idKey]: this.generateId(ent.key) };
    ent.columns.forEach(c => { if (c.editable) draft[c.key] = (c.type === 'number' || c.type === 'progress') ? 0 : ''; });
    this.editForm.set(draft);
    this.editMode.set('add');
    this.editEntityKey.set(ent.key);
    this.editOpen.set(true);
  }

  openEdit(row: any): void {
    this.editForm.set({ ...row });
    this.editMode.set('edit');
    this.editEntityKey.set(this.currentEntity().key);
    this.editOpen.set(true);
  }

  saveEdit(): void {
    const ent = this.entities().find(e => e.key === this.editEntityKey());
    if (!ent) return;
    const form = this.editForm();
    const idVal = form[ent.idKey];
    const list = ent.data();
    if (this.editMode() === 'add') {
      ent.data.set([{ ...form }, ...list]);
    } else {
      ent.data.set(list.map(r => r[ent.idKey] === idVal ? { ...r, ...form } : r));
    }
    this.editOpen.set(false);
  }

  closeEdit(): void { this.editOpen.set(false); }

  deleteRow(row: any): void {
    const ent = this.currentEntity();
    ent.data.set(ent.data().filter(r => r[ent.idKey] !== row[ent.idKey]));
  }

  updateFormField(key: string, value: any): void {
    this.editForm.set({ ...this.editForm(), [key]: value });
  }

  private generateId(entityKey: string): string {
    const prefix = { talents:'T', positions:'P', idpPlans:'IDP', assessments:'A', successions:'S', mentorings:'M', calibrations:'C', users:'U' }[entityKey] ?? 'X';
    return `${prefix}${Math.floor(Math.random() * 900 + 100)}`;
  }

  // ── Users
  addUser(): void {
    this.selectEntity('users');
    this.setTab('data');
    setTimeout(() => this.openAdd(), 0);
  }

  // ── Modules
  toggleModule(key: string, enabled: boolean): void {
    this.modules.set(this.modules().map(m => m.key === key ? { ...m, enabled } : m));
  }

  // ── Audit log helpers
  actionColor(a: string): string { return { UPDATE:'blue', CREATE:'green', DELETE:'red', LOCK:'orange', IMPORT:'purple' }[a] ?? 'default'; }
  formatDate(ts: string): string { return new Date(ts).toLocaleString('vi-VN'); }

  // ── Table cell helpers
  cellValue(row: any, key: string): any { return row[key]; }

  tagColor(value: string): string {
    const map: Record<string, string> = {
      'Nòng cốt':'purple', 'Tiềm năng':'orange', 'Kế thừa':'green',
      'Critical':'red', 'High':'orange', 'Medium':'blue', 'Low':'default',
      'Active':'blue', 'Completed':'green', 'Pending':'orange', 'Draft':'default', 'Disabled':'red',
      'Admin':'red', 'HR Manager':'purple', 'Line Manager':'blue', 'Viewer':'default',
    };
    return map[value] ?? 'default';
  }

  editableColumns = computed(() => this.currentEntity().columns.filter(c => c.editable));
}
