import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { ApprovalRequest, ApprovalStep, ApprovalType, ApprovalStatus } from '../../models/models';

// ─── Mock data ────────────────────────────────────────────────────────────────
const now  = new Date();
const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

const MOCK: ApprovalRequest[] = [
  {
    // HR Manager submits → chỉ cần Admin approve
    id: 'apr-001',
    type: 'idp',
    title: 'IDP 2025 — Nguyễn Thị Lan',
    description: 'Kế hoạch phát triển cá nhân năm 2025 hướng đến vị trí Senior Engineer',
    ref_id: 'idp-lan-2025',
    requested_by_id: 'u-hr-01',
    requested_by_name: 'Lê Thị Hà',
    requested_by_role: 'HR Manager',
    department: 'Nhân sự',
    status: 'pending',
    created_at: d(3),
    updated_at: d(3),
    steps: [
      { id: 'stp-001-1', request_id: 'apr-001', step_order: 1, approver_role: 'Admin',
        status: 'pending', created_at: d(3) },
    ],
  },
  {
    // Line Manager submits → HR Manager approve trước → Admin approve sau
    id: 'apr-002',
    type: 'succession',
    title: 'Người kế thừa — Giám đốc Kỹ thuật',
    description: 'Đề xuất bổ sung Phạm Văn Đức vào danh sách kế thừa vị trí Giám đốc Kỹ thuật',
    ref_id: 'pos-cto',
    requested_by_id: 'u-lm-01',
    requested_by_name: 'Trần Minh Tuấn',
    requested_by_role: 'Line Manager',
    department: 'Kỹ thuật',
    status: 'pending',
    created_at: d(1),
    updated_at: d(1),
    steps: [
      { id: 'stp-002-1', request_id: 'apr-002', step_order: 1, approver_role: 'HR Manager',
        status: 'pending', created_at: d(1) },
      { id: 'stp-002-2', request_id: 'apr-002', step_order: 2, approver_role: 'Admin',
        status: 'pending', created_at: d(1) },
    ],
  },
  {
    // HR Manager submits, đã approved → Admin đã approve
    id: 'apr-003',
    type: 'position',
    title: 'Vị trí chủ chốt mới — Trưởng phòng An toàn HSE',
    description: 'Đề xuất thêm vị trí Trưởng phòng An toàn HSE vào danh sách vị trí chủ chốt',
    requested_by_id: 'u-hr-01',
    requested_by_name: 'Lê Thị Hà',
    requested_by_role: 'HR Manager',
    department: 'An toàn',
    status: 'approved',
    created_at: d(10),
    updated_at: d(7),
    resolved_at: d(7),
    steps: [
      { id: 'stp-003-1', request_id: 'apr-003', step_order: 1, approver_role: 'Admin',
        status: 'approved', approver_name: 'Admin System', note: 'Phê duyệt.',
        acted_at: d(7), created_at: d(10) },
    ],
  },
  {
    // Line Manager submits → HRM approved → Admin rejected
    id: 'apr-004',
    type: 'career_roadmap',
    title: 'Lộ trình phát triển — Phạm Quốc Bảo',
    description: 'Lộ trình AI đề xuất theo hướng Chuyên gia Kỹ thuật, cần phê duyệt để chính thức hóa',
    ref_id: 'cr-bao-expert',
    requested_by_id: 'u-lm-02',
    requested_by_name: 'Hoàng Minh Châu',
    requested_by_role: 'Line Manager',
    department: 'Vận hành',
    status: 'rejected',
    created_at: d(14),
    updated_at: d(12),
    resolved_at: d(12),
    steps: [
      { id: 'stp-004-1', request_id: 'apr-004', step_order: 1, approver_role: 'HR Manager',
        status: 'approved', approver_name: 'Lê Thị Hà', note: 'Đã xem xét, chuyển Admin.',
        acted_at: d(13), created_at: d(14) },
      { id: 'stp-004-2', request_id: 'apr-004', step_order: 2, approver_role: 'Admin',
        status: 'rejected', approver_name: 'Admin System',
        note: 'Cần bổ sung thêm kế hoạch đào tạo cụ thể trước khi phê duyệt.',
        acted_at: d(12), created_at: d(14) },
    ],
  },
  {
    // Line Manager submits → chờ HRM approve
    id: 'apr-005',
    type: 'idp',
    title: 'IDP 2025 — Trần Văn Minh',
    description: 'Kế hoạch phát triển hướng đến vị trí Project Manager',
    ref_id: 'idp-minh-2025',
    requested_by_id: 'u-lm-01',
    requested_by_name: 'Trần Minh Tuấn',
    requested_by_role: 'Line Manager',
    department: 'Kỹ thuật',
    status: 'pending',
    created_at: d(0),
    updated_at: d(0),
    steps: [
      { id: 'stp-005-1', request_id: 'apr-005', step_order: 1, approver_role: 'HR Manager',
        status: 'pending', created_at: d(0) },
      { id: 'stp-005-2', request_id: 'apr-005', step_order: 2, approver_role: 'Admin',
        status: 'pending', created_at: d(0) },
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class ApprovalService {
  private sb = inject(SupabaseService);
  useMock    = false;  // Supabase tables đã tạo

  // ── Read ─────────────────────────────────────────────────────────────────────
  async getAll(): Promise<ApprovalRequest[]> {
    if (this.useMock) return structuredClone(MOCK);

    const { data, error } = await this.sb.client
      .from('approval_requests')
      .select('*, approval_steps(*)')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map((r: any) => ({
      ...r,
      steps: (r.approval_steps ?? []).sort((a: any, b: any) => a.step_order - b.step_order),
    }));
  }

  async getByRole(role: string, userId?: string): Promise<ApprovalRequest[]> {
    const all = await this.getAll();
    // Admin + HR Manager: thấy toàn bộ request của cty — HRM có quyền approve bước của mình
    if (role === 'Admin' || role === 'HR Manager') return all;
    // Line Manager: chỉ thấy requests được giao cho họ (approver_id match) hoặc chưa gán
    if (role === 'Line Manager' && userId) {
      return all.filter(r =>
        r.steps.some(s =>
          s.approver_role === 'Line Manager' &&
          (s.approver_id === userId || !s.approver_id)
        )
      );
    }
    return all.filter(r => r.steps.some(s => s.approver_role === role));
  }

  // ── Approve step ──────────────────────────────────────────────────────────────
  async approveStep(
    request: ApprovalRequest,
    step: ApprovalStep,
    approverName: string,
    approverId: string,
    note: string,
  ): Promise<ApprovalRequest> {
    if (this.useMock) return this._mockAct(request, step, 'approved', approverName, note);

    await this.sb.client
      .from('approval_steps')
      .update({ status: 'approved', approver_name: approverName, approver_id: approverId,
                note, acted_at: new Date().toISOString() })
      .eq('id', step.id);

    await this._logAudit(approverId, approverName, 'approval_approved', request);
    return this._recalcStatus(request);
  }

  // ── Reject step ───────────────────────────────────────────────────────────────
  async rejectStep(
    request: ApprovalRequest,
    step: ApprovalStep,
    approverName: string,
    approverId: string,
    note: string,
  ): Promise<ApprovalRequest> {
    if (this.useMock) return this._mockAct(request, step, 'rejected', approverName, note);

    await this.sb.client
      .from('approval_steps')
      .update({ status: 'rejected', approver_name: approverName, approver_id: approverId,
                note, acted_at: new Date().toISOString() })
      .eq('id', step.id);

    await this.sb.client
      .from('approval_requests')
      .update({ status: 'rejected', resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString() })
      .eq('id', request.id);

    await this._logAudit(approverId, approverName, 'approval_rejected', request);
    return { ...request, status: 'rejected', resolved_at: new Date().toISOString() };
  }

  // ── Submit new request ────────────────────────────────────────────────────────
  async submit(payload: Omit<ApprovalRequest, 'id' | 'status' | 'steps' | 'created_at' | 'updated_at'>): Promise<ApprovalRequest> {
    // Resolve specific Line Manager for this employee via parent_id chain
    let managerId: string | null = null;
    if (!this.useMock && payload.requested_by_id) {
      managerId = await this.resolveManagerUserId(payload.requested_by_id);
    }
    const steps = this._buildSteps(payload.requested_by_role, payload.type, managerId);

    if (this.useMock) {
      const req: ApprovalRequest = {
        ...payload, id: `apr-${Date.now()}`,
        status: steps.length === 0 ? 'approved' : 'pending',
        steps: steps.map((s, i) => ({
          id:            `stp-${Date.now()}-${i}`,
          request_id:    `apr-${Date.now()}`,
          step_order:    s.step_order ?? (i + 1),
          approver_role: s.approver_role ?? 'Admin',
          status:        s.status ?? 'pending',
          created_at:    new Date().toISOString(),
        } as import('../../models/models').ApprovalStep)),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      MOCK.unshift(req);
      return req;
    }

    const { data: reqRow } = await this.sb.client
      .from('approval_requests')
      .insert({ ...payload, status: steps.length === 0 ? 'approved' : 'pending' })
      .select().single();

    if (steps.length > 0) {
      await this.sb.client.from('approval_steps')
        .insert(steps.map((s, i) => ({ ...s, request_id: reqRow.id, step_order: i + 1 })));
    }

    await this._logAudit(payload.requested_by_id, payload.requested_by_name, 'approval_submitted', reqRow);
    return { ...reqRow, steps };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Xác định approval steps dựa trên role người tạo và loại request.
   *  managerId: user_profiles.id của Line Manager trực tiếp (từ reports_to_id chain).
   *  Nếu resolve được, gán vào approver_id của LM step để chỉ LM đó thấy request.
   *
   *  ── Quy trình phê duyệt — HR Manager là bước BẮT BUỘC của mọi request ──
   *
   *  Mentor request (bất kể role):
   *    → Line Manager (direct) → HR Manager
   *
   *  Các loại khác:
   *    Admin        → auto-approved (no steps)
   *    HR Manager   → Admin
   *    Line Manager → HR Manager → Admin
   *    Viewer       → Line Manager (direct) → HR Manager → Admin
   */
  private _buildSteps(requestorRole: string, type?: string, managerId?: string | null): Partial<ApprovalStep>[] {
    const lmStep:    Partial<ApprovalStep> = { approver_role: 'Line Manager', approver_id: managerId ?? undefined, status: 'pending' };
    const hrmStep:   Partial<ApprovalStep> = { approver_role: 'HR Manager',   status: 'pending' };
    const adminStep: Partial<ApprovalStep> = { approver_role: 'Admin',        status: 'pending' };

    // Mentor: LM → HRM (không qua Admin)
    if (type === 'mentor') return [lmStep, hrmStep];

    if (requestorRole === 'Admin')        return [];               // Admin tự auto-approve
    if (requestorRole === 'HR Manager')   return [adminStep];      // HRM gửi → chỉ Admin duyệt
    if (requestorRole === 'Line Manager') return [hrmStep, adminStep]; // LM gửi → HRM → Admin
    // Viewer: LM trực tiếp → HRM → Admin
    return [lmStep, hrmStep, adminStep];
  }

  /**
   * Tìm user_profiles.id của Line Manager trực tiếp của một user.
   *
   * ╔══════════════════════════════════════════════════════════════════════╗
   * ║  ⚠️  BACKEND INTEGRATION — CRITICAL DATA REQUIREMENTS               ║
   * ║                                                                      ║
   * ║  Approval routing (ai nhận request phê duyệt) hoàn toàn phụ thuộc  ║
   * ║  vào 2 cột sau. Khi import data thực từ client, BẮT BUỘC phải có:  ║
   * ║                                                                      ║
   * ║  1. employees.reports_to_id (text, FK → employees.id)               ║
   * ║     → Cột này xác định ai là Line Manager trực tiếp của nhân viên.  ║
   * ║     → Phải được điền đầy đủ từ org chart của client (HRM export).   ║
   * ║     → Nếu NULL: request sẽ hiện cho TẤT CẢ Line Manager (fallback). ║
   * ║                                                                      ║
   * ║  2. user_profiles.employee_id (text, FK → employees.id)             ║
   * ║     → Link tài khoản đăng nhập với hồ sơ nhân viên trong DB.        ║
   * ║     → Mỗi user có role Line Manager PHẢI được gán employee_id.      ║
   * ║     → Nếu NULL: LM đó sẽ không nhận được request nào.              ║
   * ║                                                                      ║
   * ║  Luồng resolve:                                                      ║
   * ║  user_profiles.id (auth UUID)                                        ║
   * ║    → user_profiles.employee_id                                       ║
   * ║    → employees.reports_to_id  (manager's employee id)               ║
   * ║    → user_profiles WHERE employee_id = manager's employee id         ║
   * ║         AND role = 'Line Manager'                                    ║
   * ║    → trả về user_profiles.id của LM đó (dùng làm approver_id)      ║
   * ╚══════════════════════════════════════════════════════════════════════╝
   */
  private async resolveManagerUserId(requestorUserId: string): Promise<string | null> {
    try {
      // 1. Lấy employee_id của người gửi
      const { data: profile } = await this.sb.client
        .from('user_profiles')
        .select('employee_id')
        .eq('id', requestorUserId)
        .single();
      if (!profile?.employee_id) return null;

      // 2. Lấy reports_to_id (LM trực tiếp) trong org chart
      const { data: emp } = await this.sb.client
        .from('employees')
        .select('reports_to_id')
        .eq('id', profile.employee_id)
        .single();
      if (!emp?.reports_to_id) return null;

      // 3. Tìm user_profiles của người LM đó (role = Line Manager)
      const { data: mgr } = await this.sb.client
        .from('user_profiles')
        .select('id')
        .eq('employee_id', emp.reports_to_id)
        .eq('role', 'Line Manager')
        .maybeSingle();

      // Nếu không tìm được (LM chưa có tài khoản) → trả null
      // → _buildSteps sẽ không gán approver_id → mọi LM đều thấy (safe fallback)
      return mgr?.id ?? null;
    } catch {
      return null;
    }
  }

  /** Mock: update step + recalc request status in memory */
  private _mockAct(
    request: ApprovalRequest,
    step: ApprovalStep,
    action: 'approved' | 'rejected',
    approverName: string,
    note: string,
  ): ApprovalRequest {
    const idx = MOCK.findIndex(r => r.id === request.id);
    if (idx === -1) return request;

    const updatedSteps = MOCK[idx].steps.map(s =>
      s.id === step.id
        ? { ...s, status: action as ApprovalStatus, approver_name: approverName,
            note, acted_at: new Date().toISOString() }
        : s,
    );

    let newStatus: ApprovalStatus = 'pending';
    if (action === 'rejected') {
      newStatus = 'rejected';
    } else if (updatedSteps.every(s => s.status === 'approved')) {
      newStatus = 'approved';
    }

    const updated: ApprovalRequest = {
      ...MOCK[idx],
      steps: updatedSteps,
      status: newStatus,
      updated_at: new Date().toISOString(),
      resolved_at: newStatus !== 'pending' ? new Date().toISOString() : undefined,
    };
    MOCK[idx] = updated;
    return updated;
  }

  /** Sau khi approve step, kiểm tra tất cả steps xem request có approved chưa */
  private async _recalcStatus(request: ApprovalRequest): Promise<ApprovalRequest> {
    const { data: steps } = await this.sb.client
      .from('approval_steps').select('*').eq('request_id', request.id);

    const allApproved = (steps ?? []).every((s: any) => s.status === 'approved');
    if (allApproved) {
      await this.sb.client
        .from('approval_requests')
        .update({ status: 'approved', resolved_at: new Date().toISOString(),
                  updated_at: new Date().toISOString() })
        .eq('id', request.id);
    }
    return { ...request, steps: steps ?? [], status: allApproved ? 'approved' : 'pending' };
  }

  private async _logAudit(actorId: string, actorName: string, action: string, request: any): Promise<void> {
    try {
      await this.sb.client.from('audit_logs').insert({
        user_id:    actorId,
        action,
        timestamp:  new Date().toISOString(),
        details:    { type: request.type, title: request.title, request_id: request.id },
      });
    } catch { /* non-critical */ }
  }
}
