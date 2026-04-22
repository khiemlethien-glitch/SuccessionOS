import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private sb = inject(SupabaseService).client;
  async getAll(filter: any = {}) { return { data: [], total: 0 }; }
  async getById(id: string) { return null; }
  async getNetwork(id: string) { return { nodes: [], edges: [] }; }
  async getRiskFactors(id: string) { return []; }
  async update(id: string, payload: any) { return null; }
}
