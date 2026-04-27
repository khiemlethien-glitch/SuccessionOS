import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * /me — Viewer shortcut that redirects to own talent profile.
 * If employee_id is not yet resolved, wait for currentUser signal to settle.
 */
@Component({
  standalone: true,
  selector: 'app-me',
  template: `<div style="padding:48px;text-align:center;color:#888">Đang chuyển hướng...</div>`,
})
export class MeComponent implements OnInit {
  private auth   = inject(AuthService);
  private router = inject(Router);

  ngOnInit(): void {
    this.redirect();
  }

  private redirect(): void {
    const user = this.auth.currentUser();
    if (user?.employee_id) {
      this.router.navigate(['/talent', user.employee_id], { replaceUrl: true });
    } else if (user) {
      // employee_id not found — fallback to talent list
      this.router.navigate(['/talent'], { replaceUrl: true });
    } else {
      // Auth still loading — retry after microtask
      setTimeout(() => this.redirect(), 200);
    }
  }
}
