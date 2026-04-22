import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface KeyPosition {
  id: string;
  title: string;
  department_id: string;
  department_name?: string;
  current_holder_id: string | null;
  current_holder_name?: string | null;
  risk_level: 'High' | 'Medium' | 'Low';
  critical_level: 'Critical' | 'High' | 'Medium' | 'Low';
  successor_count: number;
  ready_now_count: number;
  required_competencies: string[];
  parent_id: string | null;
  is_active: boolean;
}

export interface SuccessionPlan {
  id: string;
  position_id: string;
  position_title?: string;
  employee_id: string;
  employee_name?: string;
  readiness: string;
  priority: number;
  gap_score: number;
  notes: string | null;
}

export interface NineBoxEntry {
  employee_id: string;
  full_name: string;
  performance_score: number;
  potential_score: number;
  box_number: number;
  talent_tier: string | null;
  department_name?: string;
}

@Injectable({ providedIn: 'root' })
export class KeyPositionService {
  private get sb() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll() {
    const { data, error } = await this.sb
      .from('key_positions')
      .select('*')
      .eq('is_active', true)
      .order('title');
    if (error) throw error;
    return data as KeyPosition[];
  }

  async getById(id: string) {
    const { data, error } = await this.sb
      .from('key_positions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as KeyPosition;
  }

  async getSuccessionPlans(positionId?: string) {
    let query = this.sb
      .from('succession_plans')
      .select('*, key_positions(title), v_employees(full_name)')
      .order('priority');
    if (positionId) query = query.eq('position_id', positionId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getNineBox() {
    const { data, error } = await this.sb
      .from('v_nine_box')
      .select('*');
    if (error) throw error;
    return data as NineBoxEntry[];
  }

  async create(pos: Partial<KeyPosition>) {
    const { data, error } = await this.sb
      .from('key_positions')
      .insert(pos)
      .select()
      .single();
    if (error) throw error;
    return data as KeyPosition;
  }

  async update(id: string, changes: Partial<KeyPosition>) {
    const { data, error } = await this.sb
      .from('key_positions')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as KeyPosition;
  }
}
