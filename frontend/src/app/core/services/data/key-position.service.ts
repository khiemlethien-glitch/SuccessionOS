import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class KeyPositionService {
  private sb = inject(SupabaseService).client;
  async getAll(filter: any = {}) { return []; }
  async getById(id: string) { return null; }
  async getSuccessors(positionId: string) { return []; }
  async getSummary() { return {}; }
  async create(payload: any) { return null; }
  async update(id: string, payload: any) { return null; }
  async delete(id: string) { return; }
}
