import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTableModule } from 'ng-zorro-antd/table';
import { ApiService } from '../../core/services/api.service';
import { Talent, TalentListResponse, IdpPlan, IdpListResponse, Assessment, AssessmentListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, NzTabsModule, NzProgressModule, NzButtonModule, NzIconModule,
    NzStatisticModule, NzTagModule, NzTableModule, AvatarComponent],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit {
  talents     = signal<Talent[]>([]);
  idps        = signal<IdpPlan[]>([]);
  assessments = signal<Assessment[]>([]);

  // ── Talent stats ──────────────────────────────────────────────────────────
  get nongCot()  { return this.talents().filter(t => t.talent_tier === 'Nòng cốt').length; }
  get tiemNang() { return this.talents().filter(t => t.talent_tier === 'Tiềm năng').length; }
  get keaThua()  { return this.talents().filter(t => t.talent_tier === 'Kế thừa').length; }
  get total()    { return this.talents().length; }
  get avgRisk()  { return this.total ? Math.round(this.talents().reduce((s, t) => s + (t.risk_score ?? 0), 0) / this.total) : 0; }
  get avgPerf()  { return this.total ? Math.round(this.talents().reduce((s, t) => s + (t.performance_score ?? 0), 0) / this.total) : 0; }

  // ── IDP stats ─────────────────────────────────────────────────────────────
  get idpTotal()       { return this.idps().length; }
  get idpActive()      { return this.idps().filter(i => i.status === 'Active').length; }
  get idpCompleted()   { return this.idps().filter(i => i.status === 'Completed').length; }
  get idpPending()     { return this.idps().filter(i => i.status === 'Pending').length; }
  get avgIdpProgress() {
    const list = this.idps();
    return list.length ? Math.round(list.reduce((s, i) => s + i.overall_progress, 0) / list.length) : 0;
  }

  // ── Assessment stats ──────────────────────────────────────────────────────
  get completedAssessments()     { return this.assessments().filter(a => a.status === 'Completed'); }
  get assessmentCompletedCount() { return this.completedAssessments.length; }
  get assessmentPendingCount()   { return this.assessments().filter(a => a.status === 'Pending').length; }

  private avg(key: keyof Assessment['scores']): number {
    const list = this.completedAssessments;
    return list.length ? Math.round(list.reduce((s, a) => s + a.scores[key], 0) / list.length) : 0;
  }
  get avgTechnical()     { return this.avg('technical'); }
  get avgLeadership()    { return this.avg('leadership'); }
  get avgCommunication() { return this.avg('communication'); }
  get avgStrategic()     { return this.avg('strategic_thinking'); }
  get avgOverall() {
    const list = this.completedAssessments;
    return list.length ? Math.round(list.reduce((s, a) => s + a.overall_score, 0) / list.length) : 0;
  }
  get topPerformers() {
    return [...this.completedAssessments].sort((a, b) => b.overall_score - a.overall_score).slice(0, 5);
  }

  idpStatusColor(s: string): string { return ({ Active: 'blue', Completed: 'green', Pending: 'orange' } as any)[s] ?? 'default'; }

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.get<TalentListResponse>('employees', 'talents').subscribe(r => this.talents.set(r.data));
    this.api.get<IdpListResponse>('idp', 'idp-plans').subscribe(r => this.idps.set(r.data));
    this.api.get<AssessmentListResponse>('assessments', 'assessments').subscribe(r => this.assessments.set(r.data));
  }
}
