import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class SuccessionService {
  private sb = inject(SupabaseService).client;
  async getPlans(filter: any = {}) { return []; }
  async getNineBox() { return []; }
  async upsertPlan(payload: any) { return null; }
  async deletePlan(id: string) { return; }
}
