import { Injectable, signal, computed, inject } from '@angular/core';
import { ApiService } from '../services/api.service';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department_id?: string | null;
  department_name?: string | null;
  avatar_url?: string | null;
  employee_id?: string | null;
}

// Minimal session shape (replaces Supabase Session)
export interface AppSession {
  user: { id: string; email: string };
}

const SESSION_KEY = 'sos_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);

  // ── Signals ───────────────────────────────────────────────────────────────
  readonly session     = signal<AppSession | null>(null);
  readonly currentUser = signal<UserProfile | null>(null);
  readonly isLoading   = signal<boolean>(true);

  readonly isAuthenticated = computed(() => this.session() !== null);

  // ── RBAC ──────────────────────────────────────────────────────────────────
  readonly isAdmin       = computed(() => this.currentUser()?.role === 'Admin');
  readonly isLineManager = computed(() => this.currentUser()?.role === 'Line Manager');
  readonly isViewer      = computed(() => this.currentUser()?.role === 'Viewer');

  readonly hasRole = (role: string): boolean => {
    const user = this.currentUser();
    if (!user) return false;
    const hierarchy   = ['Viewer', 'Line Manager', 'HR Manager', 'Admin'];
    const userLevel   = hierarchy.indexOf(user.role);
    const neededLevel = hierarchy.indexOf(role);
    if (userLevel === -1 || neededLevel === -1) return false;
    return userLevel >= neededLevel;
  };

  constructor() {
    this._restoreSession();
  }

  // ── Restore session from localStorage ────────────────────────────────────
  private async _restoreSession(): Promise<void> {
    this.isLoading.set(true);
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const profile: UserProfile = JSON.parse(raw);
        this.session.set({ user: { id: profile.id, email: profile.email } });
        this.currentUser.set(profile);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
    this.isLoading.set(false);
  }

  // ── Login — lookup user_profiles by email (auth bypassed) ─────────────────
  async loginWithEmail(email: string, _password: string): Promise<void> {
    this.isLoading.set(true);

    const { data: profile, error } = await this.api.db
      .from('user_profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !profile) {
      this.isLoading.set(false);
      throw new Error('Email không tồn tại trong hệ thống');
    }

    const userProfile = await this._enrichProfile(profile as UserProfile);
    this._persistSession(userProfile);
    this.isLoading.set(false);
  }

  // ── Enrich profile with dept info from v_employees ───────────────────────
  private async _enrichProfile(profile: UserProfile): Promise<UserProfile> {
    // Lookup employee_id by email if not set
    if (!profile.employee_id) {
      const { data: emp } = await this.api.db
        .from('employees')
        .select('id')
        .eq('email', profile.email)
        .maybeSingle();
      if (emp?.id) profile.employee_id = emp.id;
    }

    // Load department info
    if (profile.employee_id) {
      const { data: empData } = await this.api.db
        .from('v_employees')
        .select('department_id, department_name')
        .eq('id', profile.employee_id)
        .maybeSingle();
      if (empData) {
        if (!profile.department_id) profile.department_id = empData.department_id;
        profile.department_name = empData.department_name ?? null;
      }
    }

    return profile;
  }

  private _persistSession(profile: UserProfile): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    this.session.set({ user: { id: profile.id, email: profile.email } });
    this.currentUser.set(profile);
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    this.session.set(null);
    this.currentUser.set(null);
  }

  // ── Google / Azure OAuth — placeholder (chưa implement với PostgREST) ────
  async loginWithGoogle(): Promise<void> {
    throw new Error('Google OAuth chưa được cấu hình với backend mới');
  }

  async loginWithAzure(): Promise<void> {
    throw new Error('Azure OAuth chưa được cấu hình với backend mới');
  }

  isAuthenticatedSnapshot(): boolean { return this.isAuthenticated(); }
}
