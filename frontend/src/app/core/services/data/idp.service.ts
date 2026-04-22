import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class IdpService {
  private sb = inject(SupabaseService).client;
  async getAll(filter: any = {}) { return []; }
  async getByEmployee(employeeId: string) { return null; }
  async create(payload: any) { return null; }
  async addGoal(idpId: string, goal: any) { return null; }
  async updateGoal(goalId: string, payload: any) { return null; }
}
