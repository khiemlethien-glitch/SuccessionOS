import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface IdpGoal {
  id: string;
  plan_id: string;
  title: string;
  category: string;
  type: string;
  deadline: string;
  status: string;
  progress: number;
  mentor_id: string | null;
  mentor_name?: string | null;
}

export interface IdpPlan {
  id: string;
  employee_id: string;
  employee_name?: string;
  year: number;
  status: string;
  overall_progress: number;
  target_position?: string | null;
  approved_by?: string | null;
  approved_date?: string | null;
  goals?: IdpGoal[];
}

@Injectable({ providedIn: 'root' })
export class IdpService {
  private get sb() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll(employeeId?: string) {
    let query = this.sb
      .from('idp_plans')
      .select('*, idp_goals(*)')
      .order('year', { ascending: false });
    if (employeeId) query = query.eq('employee_id', employeeId);
    const { data, error } = await query;
    if (error) throw error;
    return data as IdpPlan[];
  }

  async getById(id: string) {
    const { data, error } = await this.sb
      .from('idp_plans')
      .select('*, idp_goals(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as IdpPlan;
  }

  async create(plan: Partial<IdpPlan>) {
    const { goals, ...planData } = plan;
    const { data, error } = await this.sb
      .from('idp_plans')
      .insert(planData)
      .select()
      .single();
    if (error) throw error;
    return data as IdpPlan;
  }

  async updatePlan(id: string, changes: Partial<IdpPlan>) {
    const { goals, ...planData } = changes;
    const { data, error } = await this.sb
      .from('idp_plans')
      .update(planData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as IdpPlan;
  }

  async updateGoal(goalId: string, changes: Partial<IdpGoal>) {
    const { data, error } = await this.sb
      .from('idp_goals')
      .update(changes)
      .eq('id', goalId)
      .select()
      .single();
    if (error) throw error;
    return data as IdpGoal;
  }
}
