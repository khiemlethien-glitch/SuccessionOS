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
import { ApiService } from '../../core/services/api.service';
import { IdpPlan, IdpGoal, IdpListResponse } from '../../core/models/models';
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

  constructor(private api: ApiService, private msg: NzMessageService) {}

  ngOnInit(): void {
    this.api.get<IdpListResponse>('idp', 'idp-plans').subscribe({
      next:  r => { this.idps.set(r.data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
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
    this.draftName.set(idp.talentName);
    this.draftYear.set(idp.year);
    this.draftTargetPos.set(idp.targetPosition ?? '');
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

  submitIdp(): void {
    if (!this.draftName().trim()) { this.msg.warning('Vui lòng nhập tên nhân viên'); return; }
    const editing = this.editingIdp();

    if (editing) {
      // Update existing
      const updated: IdpPlan = {
        ...editing,
        year: this.draftYear(),
        targetPosition: this.draftTargetPos(),
        goals: this.draftGoals().map((g, i) => ({
          id: editing.goals[i]?.id ?? `G_${Date.now()}_${i}`,
          title: g.title, type: g.type, deadline: g.deadline,
          category: g.type, status: editing.goals[i]?.status ?? 'Not Started',
          progress: editing.goals[i]?.progress ?? 0, mentor: null,
        })),
      };
      this.idps.update(list => list.map(p => p.id === editing.id ? updated : p));
      this.msg.success('Đã cập nhật IDP');
    } else {
      // Create new
      const newIdp: IdpPlan = {
        id: `IDP_${Date.now()}`,
        talentId: `T_${Date.now()}`,
        talentName: this.draftName(),
        year: this.draftYear(),
        status: 'Pending',
        overallProgress: 0,
        targetPosition: this.draftTargetPos(),
        approvedBy: '—',
        approvedDate: '—',
        goals12m: [],
        goals2to3y: [],
        goals: this.draftGoals().map((g, i) => ({
          id: `G_${Date.now()}_${i}`,
          title: g.title, type: g.type, deadline: g.deadline,
          category: g.type, status: 'Not Started', progress: 0, mentor: null,
        })),
      };
      this.idps.update(list => [newIdp, ...list]);
      this.msg.success('Đã tạo IDP mới — trạng thái: Chờ duyệt');
      // TODO: api.post('idp', newIdp).subscribe(...)
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

  approveStep(): void {
    const step = this.approvalStep();
    this.approvalSteps.update(steps => steps.map((s, i) => i === step ? { ...s, status: 'approved' } : s));
    if (step < 2) {
      this.approvalStep.set(step + 1);
    } else {
      // All approved → activate IDP
      const idp = this.approvalIdp();
      if (idp) {
        this.idps.update(list => list.map(p => p.id === idp.id ? { ...p, status: 'Active' } : p));
      }
      this.showApprovalModal.set(false);
      this.msg.success('IDP đã được phê duyệt và kích hoạt!');
      // TODO: api.patch('idp/${idp.id}/approve', { step: 3 }).subscribe(...)
    }
  }

  rejectStep(note: string): void {
    const step = this.approvalStep();
    this.approvalSteps.update(steps => steps.map((s, i) => i === step ? { ...s, status: 'rejected', note } : s));
    const idp = this.approvalIdp();
    if (idp) {
      this.idps.update(list => list.map(p => p.id === idp.id ? { ...p, status: 'Pending' } : p));
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
