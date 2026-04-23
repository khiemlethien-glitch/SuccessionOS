import {
  Directive, Input, OnInit, TemplateRef, ViewContainerRef, inject,
} from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * Structural directive — giống *ngIf nhưng dựa trên role.
 *
 * Dùng:
 *   <div *appHasRole="'Admin'">Chỉ Admin thấy</div>
 *   <div *appHasRole="['HR Manager', 'Admin']">HR Manager trở lên</div>
 *
 * "Trở lên" theo hierarchy: Viewer < Line Manager < HR Manager < Admin.
 * Khi đang ở bypass mode (auth chưa có user) → luôn hiện (mặc định Admin).
 */
@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective implements OnInit {
  @Input() set appHasRole(role: string | string[]) {
    this._roles = Array.isArray(role) ? role : [role];
    this._update();
  }

  private _roles: string[] = [];
  private _rendered = false;

  private tpl = inject(TemplateRef<any>);
  private vcr = inject(ViewContainerRef);
  private auth = inject(AuthService);

  ngOnInit(): void {
    this._update();
  }

  private _update(): void {
    const allowed = this._roles.some(r => this.auth.hasRole(r));
    if (allowed && !this._rendered) {
      this.vcr.createEmbeddedView(this.tpl);
      this._rendered = true;
    } else if (!allowed && this._rendered) {
      this.vcr.clear();
      this._rendered = false;
    }
  }
}
