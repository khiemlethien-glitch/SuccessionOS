import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';

function mapIdp(row: any, empMap: Map<string, string>): any {
  return {
    id: row.id,
    talent_id:        row.employee_id,
    talent_name:      empMap.get(row.employee_id) ?? '—',
    year:             row.year,
    status:           row.status,
    overall_progress: row.overall_progress ?? 0,
    target_position:  row.target_position ?? null,
    approved_by:      row.approved_by_l3_id ?? row.approved_by_l2_id ?? row.approved_by_l1_id ?? '—',
    approved_date:    row.approved_by_l3_at ?? row.approved_by_l2_at ?? row.approved_by_l1_at ?? '—',
    goals_12m:   [],
    goals_2to3y: [],
    goals: (row.goals ?? []).map((g: any) => ({
      id: g.id, title: g.title, type: g.type ?? g.category ?? 'Training',
      deadline: g.deadline, category: g.category ?? g.type ?? 'Training',
      status: g.status ?? 'Not Started', progress: g.progress ?? 0, mentor: g.mentor ?? null,
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class IdpService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getAll(filter: { status?: string; employee_id?: string } = {}) {
    const key = `idp:all:${JSON.stringify(filter)}`;
    return this.cache.get(key, () => this._fetchAll(filter));
  }

  private async _fetchAll(filter: { status?: string; employee_id?: string }) {
    let q = this.sb.from('idp_plans').select('*, goals:idp_goals(*)');
    if (filter.status)      q = q.eq('status', filter.status);
    if (filter.employee_id) q = q.eq('employee_id', filter.employee_id);
    const { data, error } = await q;
    if (error) { console.error('[IdpService.getAll]', error); return []; }

    const rows   = data ?? [];
    const empIds = [...new Set(rows.map(r => r.employee_id))];
    const empRes = empIds.length
      ? await this.sb.from('v_employees').select('id, full_name').in('id', empIds)
      : { data: [] };
    const empMap = new Map((empRes.data ?? []).map(e => [e.id, e.full_name]));
    return rows.map(r => mapIdp(r, empMap));
  }

  async getByEmployee(employeeId: string) {
    return this.cache.get(`idp:emp:${employeeId}`, () => this._fetchByEmployee(employeeId));
  }

  private async _fetchByEmployee(employeeId: string) {
    const { data, error } = await this.sb
      .from('idp_plans')
      .select('*, goals:idp_goals(*)')
      .eq('employee_id', employeeId)
      .order('year', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { console.error('[IdpService.getByEmployee]', error); return null; }
    if (!data) return null;

    const emp = await this.sb.from('v_employees').select('id, full_name').eq('id', employeeId).maybeSingle();
    const empMap = new Map<string, string>();
    if (emp.data) empMap.set(emp.data.id, emp.data.full_name);
    return mapIdp(data, empMap);
  }

  async create(payload: any) {
    const { data, error } = await this.sb.from('idp_plans').insert(payload).select().maybeSingle();
    if (error) { console.error('[IdpService.create]', error); return null; }
    this.cache.invalidatePrefix('idp:');
    return data;
  }

  async updatePlan(id: string, payload: any) {
    const { data, error } = await this.sb.from('idp_plans').update(payload).eq('id', id).select().maybeSingle();
    if (error) { console.error('[IdpService.updatePlan]', error); return null; }
    this.cache.invalidatePrefix('idp:');
    return data;
  }

  async addGoal(idpId: string, goal: any) {
    const { data, error } = await this.sb
      .from('idp_goals')
      .insert({ ...goal, idp_plan_id: idpId })
      .select()
      .maybeSingle();
    if (error) { console.error('[IdpService.addGoal]', error); return null; }
    this.cache.invalidatePrefix('idp:');
    return data;
  }

  async updateGoal(goalId: string, payload: any) {
    const { data, error } = await this.sb.from('idp_goals').update(payload).eq('id', goalId).select().maybeSingle();
    if (error) { console.error('[IdpService.updateGoal]', error); return null; }
    this.cache.invalidatePrefix('idp:');
    return data;
  }
}
