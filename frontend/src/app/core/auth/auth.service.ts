import { Injectable, signal, computed } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabase.service';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department_id?: string | null;
  avatar_url?: string | null;
  employee_id?: string | null;   // linked talent/employee record ID
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // ── Signals ──────────────────────────────────────────────
  readonly session     = signal<Session | null>(null);
  readonly currentUser = signal<UserProfile | null>(null);
  readonly isLoading   = signal<boolean>(true);

  readonly isAuthenticated = computed(() => this.session() !== null);

  /**
   * RBAC — phân quyền theo role. Hierarchy: Admin > HR Manager > Line Manager > Viewer.
   */
  readonly isAdmin = computed(() => this.currentUser()?.role === 'Admin');

  readonly isViewer = computed(() => this.currentUser()?.role === 'Viewer');

  readonly hasRole = (role: string): boolean => {
    const user = this.currentUser();
    if (!user) return false;
    const hierarchy   = ['Viewer', 'Line Manager', 'HR Manager', 'Admin'];
    const userLevel   = hierarchy.indexOf(user.role);
    const neededLevel = hierarchy.indexOf(role);
    if (userLevel === -1 || neededLevel === -1) return false;
    return userLevel >= neededLevel;
  };

  private get sb() { return this.supabaseService.client; }

  constructor(private supabaseService: SupabaseService) {
    this.sb.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      if (data.session?.user) this.loadProfile(data.session.user);
      this.isLoading.set(false);
    });

    this.sb.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      if (session?.user) this.loadProfile(session.user);
      else this.currentUser.set(null);
    });
  }

  // ── Load profile ──────────────────────────────────────────
  async loadProfile(user: User): Promise<void> {
    const { data, error } = await this.sb
      .from('user_profiles').select('*').eq('id', user.id).maybeSingle();

    const baseProfile: UserProfile = error || !data
      ? {
          id:        user.id,
          email:     user.email ?? '',
          full_name: user.user_metadata?.['full_name'] ?? user.email ?? '',
          role:      user.user_metadata?.['role'] ?? 'Viewer',
        }
      : (data as UserProfile);

    // Lookup linked employee record by email → needed for Viewer "My Profile" link
    const email = user.email ?? baseProfile.email;
    if (email && !baseProfile.employee_id) {
      const { data: emp } = await this.sb
        .from('employees').select('id').eq('email', email).maybeSingle();
      if (emp?.id) baseProfile.employee_id = emp.id;
    }

    this.currentUser.set(baseProfile);
  }

  // ── Email / Password ──────────────────────────────────────
  async loginWithEmail(email: string, password: string): Promise<void> {
    this.isLoading.set(true);
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    this.isLoading.set(false);
    if (error) throw error;
  }

  async loginWithGoogle(): Promise<void> {
    const { error } = await this.sb.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }

  async loginWithAzure(): Promise<void> {
    const { error } = await this.sb.auth.signInWithOAuth({
      provider: 'azure', options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }

  async logout(): Promise<void> {
    await this.sb.auth.signOut();
    this.session.set(null);
    this.currentUser.set(null);
  }

  isAuthenticatedSnapshot(): boolean { return this.isAuthenticated(); }
}
