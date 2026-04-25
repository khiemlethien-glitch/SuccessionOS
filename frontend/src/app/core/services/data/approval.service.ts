import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { ApprovalRequest, ApprovalStep, ApprovalType, ApprovalStatus } from '../../models/models';

// ─── Mock data ────────────────────────────────────────────────────────────────
const now  = new Date();
const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

const MOCK: ApprovalRequest[] = [
  {
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
      { id: 'stp-001-1', request_id: 'apr-001', step_order: 1, approver_role: 'Line Manager',
        status: 'approved', approver_name: 'Trần Minh Tuấn', note: 'Phù hợp với kế hoạch phòng ban.',
        acted_at: d(2), created_at: d(3) },
      { id: 'stp-001-2', request_id: 'apr-001', step_order: 2, approver_role: 'Admin',
        status: 'pending', created_at: d(3) },
    ],
  },
  {
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
      { id: 'stp-002-1', request_id: 'apr-002', step_order: 1, approver_role: 'Admin',
        status: 'pending', created_at: d(1) },
    ],
  },
  {
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
      { id: 'stp-003-1', request_id: 'apr-003', step_order: 1, approver_role: 'Line Manager',
        status: 'approved', approver_name: 'Nguyễn Văn Khoa', note: 'Đồng ý, cần bổ sung gấp.',
        acted_at: d(8), created_at: d(10) },
      { id: 'stp-003-2', request_id: 'apr-003', step_order: 2, approver_role: 'Admin',
        status: 'approved', approver_name: 'Admin System', note: 'Phê duyệt.',
        acted_at: d(7), created_at: d(10) },
    ],
  },
  {
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
      { id: 'stp-004-1', request_id: 'apr-004', step_order: 1, approver_role: 'Admin',
        status: 'rejected', approver_name: 'Admin System',
        note: 'Cần bổ sung thêm kế hoạch đào tạo cụ thể trước khi phê duyệt.',
        acted_at: d(12), created_at: d(14) },
    ],
  },
  {
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
      { id: 'stp-005-1', request_id: 'apr-005', step_order: 1, approver_role: 'Admin',
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

  async getByRole(role: string): Promise<ApprovalRequest[]> {
    const all = await this.getAll();
    if (role === 'Admin') return all;
    // LM thấy requests có step của mình
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
    const steps = this._buildSteps(payload.requested_by_role);

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

  /** Xác định approval steps dựa trên role người tạo */
  private _buildSteps(requestorRole: string): Partial<ApprovalStep>[] {
    if (requestorRole === 'Admin')       return [];                              // auto-approved
    if (requestorRole === 'Line Manager') return [{ step_order: 1, approver_role: 'Admin',        status: 'pending' }];
    if (requestorRole === 'HR Manager')   return [
      { step_order: 1, approver_role: 'Line Manager', status: 'pending' },
      { step_order: 2, approver_role: 'Admin',        status: 'pending' },
    ];
    return [{ step_order: 1, approver_role: 'Admin', status: 'pending' }];
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
