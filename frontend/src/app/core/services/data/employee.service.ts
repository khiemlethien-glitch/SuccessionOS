import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name?: string;
  job_title_id: string;
  job_title_name?: string;
  talent_tier: string | null;
  performance_score: number | null;
  potential_score: number | null;
  risk_score: number | null;
  readiness_level: string | null;
  years_of_experience: number;
  hire_date: string | null;
  avatar_url: string | null;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private get sb() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll(filters?: { department_id?: string; talent_tier?: string }) {
    let query = this.sb.from('v_employees').select('*');
    if (filters?.department_id) query = query.eq('department_id', filters.department_id);
    if (filters?.talent_tier)   query = query.eq('talent_tier', filters.talent_tier);
    const { data, error } = await query.order('full_name');
    if (error) throw error;
    return data as Employee[];
  }

  async getById(id: string) {
    const { data, error } = await this.sb
      .from('v_employees')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Employee;
  }

  async search(term: string) {
    const { data, error } = await this.sb
      .from('v_employees')
      .select('*')
      .ilike('full_name', `%${term}%`);
    if (error) throw error;
    return data as Employee[];
  }
}
