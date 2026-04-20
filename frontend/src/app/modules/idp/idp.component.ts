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
import { ApiService } from '../../core/services/api.service';
import { IdpPlan, IdpListResponse } from '../../core/models/models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

@Component({
  selector: 'app-idp',
  standalone: true,
  imports: [CommonModule, FormsModule, NzTableModule, NzTagModule, NzProgressModule,
    NzButtonModule, NzIconModule, NzSelectModule, NzCollapseModule, AvatarComponent],
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

  constructor(private api: ApiService) {}
  ngOnInit(): void {
    this.api.get<IdpListResponse>('idp-plans','idp-plans').subscribe({ next: r => { this.idps.set(r.data); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  statusColor(s: string): string { return { Active:'blue', Completed:'green', Pending:'orange' }[s] ?? 'default'; }
  typeColor(t: string): string   { return { Training:'blue', Stretch:'purple', Rotation:'cyan' }[t] ?? 'default'; }
  goalStatusColor(s: string): string { return { Completed:'green', 'In Progress':'processing', 'Not Started':'default' }[s] ?? 'default'; }
}
