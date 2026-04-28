import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { AuthService } from '../../../core/auth/auth.service';

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
  private auth   = inject(AuthService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    if (this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/dashboard');
    } else {
      this.router.navigateByUrl('/login');
    }
  }
}
