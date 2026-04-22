import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { Talent } from '../../models/models';

/**
 * Reshape Supabase v_employees row → frontend Talent model.
 * v_employees has flat `comp_technical`, `comp_target_technical`, etc.
 * Frontend expects nested `competencies{}` và `competency_targets{}`.
 */
function mapVEmployee(row: any): Talent {
  return {
    id: row.id,
    full_name: row.full_name,
    position: row.position ?? '',
    department: row.department_name ?? row.department_short ?? '',
    department_id: row.department_id,
    talent_tier: row.talent_tier,
    potential_level: row.potential_level ?? 'Medium',
    performance_score: row.performance_score,
    potential_score: row.potential_score,
    risk_score: row.risk_score,
    years_of_experience: row.years_of_experience ?? 0,
    readiness_level: row.readiness_level,
    email: row.email ?? '',
    hire_date: row.hire_date ?? undefined,
    tenure_years: row.tenure_years ?? undefined,
    ktp_progress: row.ktp_progress ?? undefined,
    overall_score: row.overall_score ?? undefined,
    mentor: row.mentor_name ?? null,
    target_position: row.target_position ?? null,
    risk_reasons: row.risk_reasons ?? [],
    departure_reasons: row.departure_reasons ?? [],
    competencies: {
      technical:       row.comp_technical       ?? 0,
      leadership:      row.comp_leadership      ?? 0,
      communication:   row.comp_communication   ?? 0,
      problem_solving: row.comp_problem_solving ?? 0,
      adaptability:    row.comp_adaptability    ?? 0,
    },
    competency_targets: {
      technical:   row.comp_target_technical       ?? 85,
      performance: row.comp_target_problem_solving ?? 85,
      behavior:    row.comp_target_communication   ?? 80,
      potential:   row.comp_target_adaptability    ?? 80,
      leadership:  row.comp_target_leadership      ?? 85,
    },
  } as Talent;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private sb = inject(SupabaseService).client;

  async getAll(filter: { department?: string; talent_tier?: string; limit?: number } = {}) {
    let q = this.sb.from('v_employees').select('*', { count: 'exact' }).eq('is_active', true);
    if (filter.department)  q = q.eq('department_id', filter.department);
    if (filter.talent_tier) q = q.eq('talent_tier', filter.talent_tier);
    if (filter.limit)       q = q.limit(filter.limit);
    const { data, count, error } = await q;
    if (error) { console.error('[EmployeeService.getAll]', error); return { data: [], total: 0 }; }
    return { data: (data ?? []).map(mapVEmployee), total: count ?? 0 };
  }

  async getById(id: string): Promise<Talent | null> {
    const { data, error } = await this.sb.from('v_employees').select('*').eq('id', id).maybeSingle();
    if (error) { console.error('[EmployeeService.getById]', error); return null; }
    return data ? mapVEmployee(data) : null;
  }

  async getNetwork(_id: string) {
    // TODO: Implement via mentor_id chain + department peers. v_employees có mentor_id, reports_to_id.
    return { nodes: [], edges: [] };
  }

  async getRiskFactors(_id: string) {
    // TODO: Implement via risk_factors table (chưa có trong schema hiện tại).
    return [];
  }

  async update(id: string, payload: Partial<Talent>) {
    // Write qua table `employees` (không phải view). Chờ fix RLS user_profiles.
    const { data, error } = await this.sb.from('employees').update(payload).eq('id', id).select().maybeSingle();
    if (error) { console.error('[EmployeeService.update]', error); return null; }
    return data;
  }
}
