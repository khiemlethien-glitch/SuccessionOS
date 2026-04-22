import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private sb = inject(SupabaseService).client;
  async getKpi() { return {}; }
  async getRiskAlerts(limit = 5) { return []; }
  async getDepartments() { return []; }
}
