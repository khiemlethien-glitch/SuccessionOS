import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzSpinModule } from 'ng-zorro-antd/spin';
// TODO: SupabaseService sẽ do CLI tạo trong core/services/supabase.service.ts
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule, NzSpinModule],
  template: `
    <div class="cb-wrap">
      <nz-spin nzSimple nzSize="large"></nz-spin>
    </div>
  `,
  styles: [`
    .cb-wrap {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
    }
  `],
})
export class CallbackComponent implements OnInit {
  private sb = inject(SupabaseService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    const { data } = await this.sb.client.auth.getSession();
    if (data.session) {
      this.router.navigateByUrl('/dashboard');
    } else {
      this.router.navigateByUrl('/login');
    }
  }
}
