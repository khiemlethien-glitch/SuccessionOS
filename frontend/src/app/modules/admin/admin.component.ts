import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { AuthService } from '../../core/auth/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { ApprovalService } from '../../core/services/data/approval.service';
import { ApprovalRequest, ApprovalStep, ApprovalType } from '../../core/models/models';

type TabKey = 'approvals' | 'users' | 'audit' | 'settings';

interface AdminUser {
  id: string; username: string; fullName: string;
  email: string; role: 'Admin' | 'HR Manager' | 'Line Manager' | 'Viewer';
  status: 'Active' | 'Disabled'; lastLogin?: string;
}

interface AuditLog {
  id: string; timestamp: string; actor: string;
  action: string; description: string; module: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzTableModule, NzTagModule, NzButtonModule, NzIconModule, NzSelectModule,
    NzDrawerModule, NzFormModule, NzInputModule,
    NzBadgeModule, NzStepsModule, NzSpinModule,
    NzTooltipModule, NzSwitchModule, NzDividerModule, NzAlertModule,
  ],
  providers: [NzMessageService],
  templateUrl: './admin.component.html',
  styleUrl:    './admin.component.scss',
})
export class AdminComponent implements OnInit {
  private msg         = inject(NzMessageService);
  private auth        = inject(AuthService);
  private sbSvc       = inject(SupabaseService);
  private approvalSvc = inject(ApprovalService);

  // ── State ─────────────────────────────────────────────────────────────────────
  activeTab   = signal<TabKey>('approvals');
  loading     = signal(true);
  currentUser  = computed(() => this.auth.currentUser());
  isAdmin      = computed(() => this.auth.isAdmin());
  isHRManager  = computed(() => this.currentUser()?.role === 'HR Manager');
  isLineManager = computed(() => this.currentUser()?.role === 'Line Manager');

  /** Tabs hiển thị theo role:
   *  Admin:        approvals + users + audit + settings
   *  HR Manager:   approvals (approve bước HRM, xem tất cả) + audit
   *  Line Manager: approvals (chỉ requests được giao cho LM)
   */
  canSeeUsersTab    = computed(() => this.isAdmin());
  canSeeAuditTab    = computed(() => this.isAdmin() || this.isHRManager());
  canSeeSettingsTab = computed(() => this.isAdmin());

  // ── Approvals ─────────────────────────────────────────────────────────────────
  allApprovals  = signal<ApprovalRequest[]>([]);
  typeFilter    = signal<ApprovalType | 'all'>('all');
  statusFilter  = signal<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  filteredApprovals = computed(() => {
    // Exclude 'mentor' type — managed in Mentoring page (mentoring_pairs.status)
    let list = this.allApprovals().filter(r => r.type !== 'mentor');
    if (this.typeFilter()   !== 'all') list = list.filter(r => r.type   === this.typeFilter());
    if (this.statusFilter() !== 'all') list = list.filter(r => r.status === this.statusFilter());
    return list;
  });

  pendingCount = computed(() => this.allApprovals().filter(r => r.status === 'pending').length);

  // Action drawer
  actionDrawer  = signal(false);
  actionRequest = signal<ApprovalRequest | null>(null);
  actionStep    = signal<ApprovalStep | null>(null);
  actionMode    = signal<'approve' | 'reject'>('approve');
  actionNote    = signal('');
  actionSaving  = signal(false);

  // ── Users ─────────────────────────────────────────────────────────────────────
  users          = signal<AdminUser[]>([]);
  editUserDrawer = signal(false);
  editingUser    = signal<AdminUser | null>(null);
  readonly userRoles = ['Admin', 'HR Manager', 'Line Manager', 'Viewer'];

  // ── Audit ─────────────────────────────────────────────────────────────────────
  logs         = signal<AuditLog[]>([]);
  auditSearch  = signal('');
  filteredLogs = computed(() => {
    const q = this.auditSearch().toLowerCase();
    if (!q) return this.logs();
    return this.logs().filter(l =>
      l.actor.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      (l.description ?? '').toLowerCase().includes(q)
    );
  });

  // ── Settings ──────────────────────────────────────────────────────────────────
  modules = signal([
    { key: 'idp',         name: 'Kế hoạch IDP',            enabled: true,  tier: 'core' },
    { key: 'succession',  name: 'Kế hoạch Kế thừa',         enabled: true,  tier: 'core' },
    { key: 'assessment',  name: 'Đánh giá Năng lực 360°',   enabled: true,  tier: 'core' },
    { key: 'mentoring',   name: 'Chương trình Mentoring',    enabled: true,  tier: 'pro' },
    { key: 'calibration', name: 'Calibration Sessions',      enabled: true,  tier: 'pro' },
    { key: 'ai_roadmap',  name: 'AI Lộ Trình Phát Triển',   enabled: true,  tier: 'pro' },
    { key: 'marketplace', name: 'Marketplace',               enabled: false, tier: 'enterprise' },
  ]);

  // ── Label helpers ─────────────────────────────────────────────────────────────
  readonly typeLabel: Record<string, string> = {
    idp: 'IDP', succession: 'Kế thừa', position: 'Vị trí', career_roadmap: 'Lộ trình', mentor: 'Mentor',
  };
  readonly typeIcon: Record<string, string> = {
    idp: 'file-text', succession: 'team', position: 'bank', career_roadmap: 'compass', mentor: 'user-add',
  };
  readonly typeColor: Record<string, string> = {
    idp: 'blue', succession: 'purple', position: 'orange', career_roadmap: 'cyan', mentor: 'green',
  };
  readonly statusColor: Record<string, string> = {
    pending: 'warning', approved: 'success', rejected: 'error',
  };
  readonly statusLabel: Record<string, string> = {
    pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  async ngOnInit() {
    this.loading.set(true);
    const tasks: Promise<any>[] = [this.loadApprovals()];
    // loadUsers: chỉ Admin mới có quyền đọc toàn bộ user_profiles
    if (this.isAdmin()) tasks.push(this.loadUsers());
    // loadAuditLogs: Admin + HR Manager
    if (this.isAdmin() || this.isHRManager()) tasks.push(this.loadAuditLogs());
    await Promise.all(tasks);
    this.loading.set(false);
  }

  setTab(t: TabKey) { this.activeTab.set(t); }

  // ── Approvals ─────────────────────────────────────────────────────────────────
  async loadApprovals() {
    const user = this.currentUser();
    const list = await this.approvalSvc.getByRole(user?.role ?? 'Viewer', user?.id);
    this.allApprovals.set(list);
  }

  currentUserStep(req: ApprovalRequest): ApprovalStep | null {
    const user   = this.currentUser();
    const myRole = user?.role ?? '';
    const myId   = user?.id;

    // Tìm step pending thuộc role + user hiện tại
    const myStep = req.steps.find(s =>
      s.status === 'pending' &&
      s.approver_role === myRole &&
      (!s.approver_id || s.approver_id === myId)
    );
    if (!myStep) return null;

    // Sequential check: chỉ được act nếu TẤT CẢ step trước (step_order nhỏ hơn) đã approved
    // → Đảm bảo đúng thứ tự: LM approve xong thì HRM mới thấy nút, HRM approve xong thì Admin mới thấy
    const allPrevApproved = req.steps
      .filter(s => s.step_order < myStep.step_order)
      .every(s => s.status === 'approved');

    return allPrevApproved ? myStep : null;
  }

  canActOn(req: ApprovalRequest): boolean {
    return req.status === 'pending' && this.currentUserStep(req) !== null;
  }

  openAction(req: ApprovalRequest, mode: 'approve' | 'reject') {
    const step = this.currentUserStep(req);
    if (!step) return;
    this.actionRequest.set(req);
    this.actionStep.set(step);
    this.actionMode.set(mode);
    this.actionNote.set('');
    this.actionDrawer.set(true);
  }

  async confirmAction() {
    const req  = this.actionRequest();
    const step = this.actionStep();
    const user = this.currentUser();
    if (!req || !step || !user) return;

    if (this.actionMode() === 'reject' && !this.actionNote().trim()) {
      this.msg.warning('Vui lòng nhập lý do từ chối');
      return;
    }
    this.actionSaving.set(true);
    try {
      let updated: ApprovalRequest;
      if (this.actionMode() === 'approve') {
        updated = await this.approvalSvc.approveStep(req, step, user.full_name, user.id, this.actionNote());
        this.msg.success('✓ Đã phê duyệt thành công');
      } else {
        updated = await this.approvalSvc.rejectStep(req, step, user.full_name, user.id, this.actionNote());
        this.msg.warning('Đã từ chối yêu cầu');
      }
      this.allApprovals.update(list => list.map(r => r.id === updated.id ? updated : r));
      this.actionDrawer.set(false);
    } catch (e: any) {
      this.msg.error('Lỗi: ' + e.message);
    } finally {
      this.actionSaving.set(false);
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────────────
  async loadUsers() {
    try {
      const { data } = await this.sbSvc.client
        .from('user_profiles')
        .select('id, email, full_name, role, status, last_sign_in_at')
        .order('full_name', { ascending: true });
      this.users.set((data ?? []).map((p: any) => ({
        id: p.id, username: (p.email ?? '').split('@')[0],
        fullName: p.full_name ?? p.email ?? p.id,
        email: p.email ?? '', role: p.role ?? 'Viewer',
        status: p.status === 'disabled' ? 'Disabled' : 'Active',
        lastLogin: p.last_sign_in_at,
      })));
    } catch { /* silent */ }
  }

  openEditUser(u: AdminUser) { this.editingUser.set({ ...u }); this.editUserDrawer.set(true); }

  async saveUser() {
    const u = this.editingUser();
    if (!u) return;
    try {
      await this.sbSvc.client.from('user_profiles')
        .update({ role: u.role, status: u.status === 'Active' ? 'active' : 'disabled' })
        .eq('id', u.id);
      this.users.update(list => list.map(x => x.id === u.id ? u : x));
      this.editUserDrawer.set(false);
      this.msg.success('Đã cập nhật người dùng');
    } catch (e: any) { this.msg.error('Lỗi: ' + e.message); }
  }

  roleColor(role: string): string {
    return ({ Admin: 'red', 'HR Manager': 'purple', 'Line Manager': 'blue', Viewer: 'default' } as any)[role] ?? 'default';
  }

  // ── Audit ─────────────────────────────────────────────────────────────────────
  async loadAuditLogs() {
    try {
      const { data } = await this.sbSvc.client
        .from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200);
      this.logs.set((data ?? []).map((l: any) => ({
        id: l.id ?? l.timestamp, timestamp: l.timestamp, actor: l.user_id ?? '—',
        action: l.action,
        description: l.details ? JSON.stringify(l.details) : '',
        module: l.action?.split('_')[0] ?? '—',
      })));
    } catch { /* silent */ }
  }

  auditActionColor(action: string): string {
    if (action?.includes('approved'))  return 'success';
    if (action?.includes('rejected'))  return 'error';
    if (action?.includes('submitted')) return 'processing';
    if (action?.includes('generate'))  return 'warning';
    return 'default';
  }

  // ── Settings ──────────────────────────────────────────────────────────────────
  toggleModule(key: string, enabled: boolean) {
    this.modules.update(list => list.map(m => m.key === key ? { ...m, enabled } : m));
    this.msg.success(`${enabled ? 'Bật' : 'Tắt'} module thành công`);
  }

  tierColor(tier: string): string {
    return ({ core: 'blue', pro: 'purple', enterprise: 'gold' } as any)[tier] ?? 'default';
  }
}
