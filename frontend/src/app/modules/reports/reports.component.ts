import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzProgressModule } from 'ng-zorro-antd/progress';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { ApiService } from '../../core/services/api.service';
import { Talent, TalentListResponse, IdpPlan, IdpListResponse } from '../../core/models/models';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, NzTabsModule, NzProgressModule, NzButtonModule, NzIconModule, NzStatisticModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit {
  talents = signal<Talent[]>([]);
  idps    = signal<IdpPlan[]>([]);

  get nongCot() { return this.talents().filter(t => t.talentTier === 'Nòng cốt').length; }
  get tiemNang(){ return this.talents().filter(t => t.talentTier === 'Tiềm năng').length; }
  get keaThua() { return this.talents().filter(t => t.talentTier === 'Kế thừa').length; }
  get total()   { return this.talents().length; }
  get avgRisk()  { return this.total ? Math.round(this.talents().reduce((s,t)=>s+t.riskScore,0)/this.total) : 0; }
  get avgPerf()  { return this.total ? Math.round(this.talents().reduce((s,t)=>s+t.performanceScore,0)/this.total) : 0; }

  constructor(private api: ApiService) {}
  ngOnInit(): void {
    this.api.get<TalentListResponse>('talents','talents').subscribe(r => this.talents.set(r.data));
    this.api.get<IdpListResponse>('idp-plans','idp-plans').subscribe(r => this.idps.set(r.data));
  }
}
