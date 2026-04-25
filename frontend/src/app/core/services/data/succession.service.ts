import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';

@Injectable({ providedIn: 'root' })
export class SuccessionService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getPlans(_filter: { position_id?: string } = {}) {
    const key = `succ:plans:${JSON.stringify(_filter)}`;
    return this.cache.get(key, () => this._fetchPlans(_filter));
  }

  private async _fetchPlans(_filter: { position_id?: string }) {
    const [planRes, posRes, empRes, deptRes] = await Promise.all([
      this.sb.from('succession_plans').select('*').order('priority'),
      this.sb.from('key_positions').select('id, title, department_id'),
      this.sb.from('v_employees').select('id, full_name'),
      this.sb.from('departments').select('id, name'),
    ]);
    if (planRes.error) { console.error('[SuccessionService.getPlans]', planRes.error); return []; }

    const posMap  = new Map((posRes.data  ?? []).map(p => [p.id, p]));
    const empMap  = new Map((empRes.data  ?? []).map(e => [e.id, e.full_name]));
    const deptMap = new Map((deptRes.data ?? []).map(d => [d.id, d.name]));

    const grouped = new Map<string, any[]>();
    for (const row of planRes.data ?? []) {
      const list = grouped.get(row.position_id) ?? [];
      list.push({
        talent_id:   row.talent_id,
        talent_name: empMap.get(row.talent_id) ?? '—',
        readiness:   row.readiness,
        priority:    row.priority,
        gap_score:   row.gap_score,
      });
      grouped.set(row.position_id, list);
    }

    return Array.from(grouped.entries()).map(([positionId, successors]) => {
      const pos = posMap.get(positionId);
      return {
        id:             positionId,
        position_id:    positionId,
        position_title: pos?.title ?? '—',
        department:     pos ? (deptMap.get(pos.department_id) ?? '—') : '—',
        successors,
        successorCount: successors.length,
      };
    });
  }

  async getNineBox() {
    return this.cache.get('succ:nine-box', () => this._fetchNineBox());
  }

  private async _fetchNineBox() {
    const { data, error } = await this.sb
      .from('v_nine_box')
      .select('id, full_name, position, performance_score, potential_score, department_id, talent_tier, risk_band, box');
    if (error) { console.error('[SuccessionService.getNineBox]', error); return []; }
    return data ?? [];
  }

  async upsertPlan(payload: any) {
    const { data, error } = await this.sb
      .from('succession_plans')
      .upsert(payload, { onConflict: 'position_id,talent_id' })
      .select()
      .maybeSingle();
    if (error) { console.error('[SuccessionService.upsertPlan]', error); return null; }
    this.cache.invalidatePrefix('succ:plans:');
    this.cache.invalidatePrefix('succ:target:');
    this.cache.invalidatePrefix('succ:holders:');
    return data;
  }

  async deletePlan(id: string) {
    const { error } = await this.sb.from('succession_plans').delete().eq('id', id);
    if (error) { console.error('[SuccessionService.deletePlan]', error); return; }
    this.cache.invalidatePrefix('succ:plans:');
    this.cache.invalidatePrefix('succ:target:');
    this.cache.invalidatePrefix('succ:holders:');
  }

  async getTargetPositionForSuccessor(employeeId: string): Promise<string | null> {
    return this.cache.get(`succ:target:${employeeId}`, () => this._fetchTargetPosition(employeeId));
  }

  private async _fetchTargetPosition(employeeId: string): Promise<string | null> {
    const planRes = await this.sb.from('succession_plans')
      .select('position_id, priority')
      .eq('talent_id', employeeId)
      .order('priority')
      .limit(1)
      .maybeSingle();
    if (!planRes.data?.position_id) return null;

    const posRes = await this.sb.from('key_positions')
      .select('title')
      .eq('id', planRes.data.position_id)
      .maybeSingle();
    return posRes.data?.title ?? null;
  }

  async getSuccessorsForHolder(employeeId: string): Promise<{
    talent_id: string; talent_name: string;
    readiness: string; priority: number; idp_progress: number;
  }[]> {
    return this.cache.get(`succ:holders:${employeeId}`, () => this._fetchSuccessorsForHolder(employeeId));
  }

  private async _fetchSuccessorsForHolder(employeeId: string) {
    const posRes = await this.sb.from('key_positions')
      .select('id')
      .eq('current_holder_id', employeeId)
      .limit(1)
      .maybeSingle();
    if (!posRes.data?.id) return [];

    const planRes = await this.sb.from('succession_plans')
      .select('talent_id, readiness, priority')
      .eq('position_id', posRes.data.id)
      .order('priority');
    if (planRes.error || !planRes.data?.length) return [];

    const ids = planRes.data.map(p => p.talent_id);
    const [empRes, idpRes] = await Promise.all([
      this.sb.from('v_employees').select('id, full_name').in('id', ids),
      this.sb.from('idp_plans').select('employee_id, overall_progress').in('employee_id', ids).eq('status', 'Active'),
    ]);
    const empMap = new Map((empRes.data ?? []).map(e => [e.id, e.full_name]));
    const idpMap = new Map((idpRes.data ?? []).map(i => [i.employee_id, i.overall_progress]));

    return planRes.data.map(p => ({
      talent_id:    p.talent_id,
      talent_name:  empMap.get(p.talent_id) ?? '—',
      readiness:    p.readiness,
      priority:     p.priority,
      idp_progress: idpMap.get(p.talent_id) ?? 0,
    }));
  }
}
