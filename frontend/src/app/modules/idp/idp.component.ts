import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IdpPlan } from '../../core/models/models';
import { IdpService } from '../../core/services/data/idp.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

interface DraftGoal { title: string; type: string; deadline: string; }
interface ApprovalStep { role: string; approver: string; status: 'pending' | 'approved' | 'rejected'; note: string; }

@Component({
  selector: 'app-idp',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTableModule, NzTagModule, NzProgressModule,
    NzButtonModule, NzIconModule, NzSelectModule, NzCollapseModule,
    NzDrawerModule, NzModalModule, NzFormModule, NzInputModule,
    NzInputNumberModule, NzStepsModule, NzDividerModule, NzSpinModule,
    AvatarComponent],
  templateUrl: './idp.component.html',
  styleUrl: './idp.component.scss',
})
export class IdpComponent implements OnInit {
  idps    = signal<IdpPlan[]>([]);
  loading = signal(true);
  filter  = signal<string>('all');

  filtered = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.idps() : this.idps().filter(i => i.status === f);
  });

  // ── Create / Edit drawer ──────────────────────────────────────────────────
  showCreateDrawer = signal(false);
  editingIdp       = signal<IdpPlan | null>(null);

  draftName       = signal('');
  draftYear       = signal(new Date().getFullYear());
  draftTargetPos  = signal('');
  draftGoals      = signal<DraftGoal[]>([
    { title: '', type: 'Training', deadline: '' }
  ]);

  goalTypes = ['Training', 'Stretch', 'Rotation', 'Mentoring'];

  // ── Approval modal ────────────────────────────────────────────────────────
  showApprovalModal = signal(false);
  approvalIdp       = signal<IdpPlan | null>(null);
  approvalStep      = signal(0);
  approvalSteps     = signal<ApprovalStep[]>([
    { role: 'Quản lý trực tiếp', approver: 'Trần Minh Tuấn', status: 'pending', note: '' },
    { role: 'Phòng Nhân sự',     approver: 'Lê Thị Hà',      status: 'pending', note: '' },
    { role: 'Ban Giám đốc',      approver: 'Nguyễn Văn Khoa', status: 'pending', note: '' },
  ]);

  constructor(private idpSvc: IdpService, private msg: NzMessageService) {}

  async ngOnInit(): Promise<void> {
    try {
      const idps = await this.idpSvc.getAll();
      this.idps.set(idps as unknown as IdpPlan[]);
    } catch (e) {
      console.error('IDP load error:', e);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  statusColor(s: string): string  { return ({ Active:'blue', Completed:'green', Pending:'orange' } as any)[s] ?? 'default'; }
  typeColor(t: string): string    { return ({ Training:'blue', Stretch:'purple', Rotation:'cyan', Mentoring:'green' } as any)[t] ?? 'default'; }
  goalStatusColor(s: string): string { return ({ Completed:'green', 'In Progress':'processing', 'Not Started':'default' } as any)[s] ?? 'default'; }

  // ── Create / Edit ─────────────────────────────────────────────────────────
  openCreate(): void {
    this.editingIdp.set(null);
    this.draftName.set('');
    this.draftYear.set(new Date().getFullYear());
    this.draftTargetPos.set('');
    this.draftGoals.set([{ title: '', type: 'Training', deadline: '' }]);
    this.showCreateDrawer.set(true);
  }

  openEdit(idp: IdpPlan): void {
    this.editingIdp.set(idp);
    this.draftName.set(idp.talent_name);
    this.draftYear.set(idp.year);
    this.draftTargetPos.set(idp.target_position ?? '');
    this.draftGoals.set(idp.goals.map(g => ({ title: g.title, type: g.type, deadline: g.deadline })));
    this.showCreateDrawer.set(true);
  }

  addGoal(): void {
    this.draftGoals.update(gs => [...gs, { title: '', type: 'Training', deadline: '' }]);
  }

  removeGoal(i: number): void {
    this.draftGoals.update(gs => gs.filter((_, idx) => idx !== i));
  }

  updateGoalField(i: number, field: keyof DraftGoal, val: string): void {
    this.draftGoals.update(gs => gs.map((g, idx) => idx === i ? { ...g, [field]: val } : g));
  }

  async submitIdp(): Promise<void> {
    if (!this.draftName().trim()) { this.msg.warning('Vui lòng nhập tên nhân viên'); return; }
    const editing = this.editingIdp();

    if (editing) {
      // Cập nhật local state trước để UI phản hồi ngay
      const updatedGoals = this.draftGoals().map((g, i) => ({
        id: editing.goals[i]?.id ?? `G_${Date.now()}_${i}`,
        title: g.title, type: g.type, deadline: g.deadline,
        category: g.type, status: editing.goals[i]?.status ?? 'Not Started',
        progress: editing.goals[i]?.progress ?? 0, mentor: null,
      }));
      const updated: IdpPlan = { ...editing, year: this.draftYear(), target_position: this.draftTargetPos(), goals: updatedGoals };
      this.idps.update(list => list.map(p => p.id === editing.id ? updated : p));
      this.msg.success('Đã cập nhật IDP');

      // Persist lên DB — chỉ gửi các cột thực sự tồn tại trong idp_plans
      const dbPayload = {
        year: this.draftYear(),
        target_position: this.draftTargetPos() || null,
      };
      try { await this.idpSvc.updatePlan(editing.id, dbPayload); }
      catch (e) { console.error('[IDP] updatePlan error:', e); }

    } else {
      // Create: build local object ngay để hiển thị
      const tempId = `IDP_${Date.now()}`;
      const newIdp: IdpPlan = {
        id: tempId,
        talent_id: '',
        talent_name: this.draftName(),
        year: this.draftYear(),
        status: 'Pending',
        overall_progress: 0,
        target_position: this.draftTargetPos() || undefined,
        approved_by: '—',
        approved_date: '—',
        goals_12m: [],
        goals_2to3y: [],
        goals: this.draftGoals().map((g, i) => ({
          id: `G_${Date.now()}_${i}`,
          title: g.title, type: g.type, deadline: g.deadline,
          category: g.type, status: 'Not Started', progress: 0, mentor: null,
        })),
      };
      this.idps.update(list => [newIdp, ...list]);
      this.msg.success('Đã tạo IDP mới — trạng thái: Chờ duyệt');

      // Persist lên DB — chỉ gửi các cột hợp lệ của idp_plans
      // Lưu ý: employee_id cần được truyền từ employee selector (hiện UI chưa có)
      const dbPayload = {
        year: this.draftYear(),
        status: 'Pending',
        overall_progress: 0,
        target_position: this.draftTargetPos() || null,
      };
      try {
        const saved = await this.idpSvc.create(dbPayload);
        // Cập nhật ID thực từ DB nếu khác tempId
        if (saved?.id && saved.id !== tempId) {
          this.idps.update(list => list.map(p => p.id === tempId ? { ...p, id: saved.id } : p));
        }
      } catch (e) { console.error('[IDP] create error:', e); }
    }
    this.showCreateDrawer.set(false);
  }

  // ── Approval flow ─────────────────────────────────────────────────────────
  openApproval(idp: IdpPlan): void {
    this.approvalIdp.set(idp);
    this.approvalStep.set(0);
    this.approvalSteps.set([
      { role: 'Quản lý trực tiếp', approver: 'Trần Minh Tuấn', status: 'pending', note: '' },
      { role: 'Phòng Nhân sự',     approver: 'Lê Thị Hà',      status: 'pending', note: '' },
      { role: 'Ban Giám đốc',      approver: 'Nguyễn Văn Khoa', status: 'pending', note: '' },
    ]);
    this.showApprovalModal.set(true);
  }

  async approveStep(): Promise<void> {
    const step = this.approvalStep();
    this.approvalSteps.update(steps => steps.map((s, i) => i === step ? { ...s, status: 'approved' } : s));
    if (step < 2) {
      this.approvalStep.set(step + 1);
    } else {
      // Tất cả 3 bước đã duyệt → kích hoạt IDP
      const idp = this.approvalIdp();
      if (idp) {
        this.idps.update(list => list.map(p => p.id === idp.id ? { ...p, status: 'Active' } : p));
        // Persist status lên DB
        try {
          await this.idpSvc.updatePlan(idp.id, {
            status: 'Active',
            approved_by_l3_at: new Date().toISOString(),
          });
        } catch (e) { console.error('[IDP] approve persist error:', e); }
      }
      this.showApprovalModal.set(false);
      this.msg.success('IDP đã được phê duyệt và kích hoạt!');
    }
  }

  async rejectStep(note: string): Promise<void> {
    const step = this.approvalStep();
    this.approvalSteps.update(steps => steps.map((s, i) => i === step ? { ...s, status: 'rejected', note } : s));
    const idp = this.approvalIdp();
    if (idp) {
      this.idps.update(list => list.map(p => p.id === idp.id ? { ...p, status: 'Pending' } : p));
      // Persist trạng thái từ chối lên DB
      try {
        await this.idpSvc.updatePlan(idp.id, { status: 'Pending' });
      } catch (e) { console.error('[IDP] reject persist error:', e); }
    }
    this.showApprovalModal.set(false);
    this.msg.warning('IDP bị từ chối — cần chỉnh sửa lại');
  }

  approvalStepStatus(i: number): string {
    const s = this.approvalSteps()[i].status;
    if (s === 'approved') return 'finish';
    if (s === 'rejected') return 'error';
    if (i === this.approvalStep()) return 'process';
    return 'wait';
  }

  get drawerTitle(): string {
    return this.editingIdp() ? 'Chỉnh sửa IDP' : 'Tạo kế hoạch IDP mới';
  }
}
