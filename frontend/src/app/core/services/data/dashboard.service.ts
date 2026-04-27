import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getKpi(deptId?: string) {
    return this.cache.get(`dash:kpi:${deptId ?? 'all'}`, () => this._fetchKpi(deptId));
  }

  private async _fetchKpi(deptId?: string) {
    const base = () => {
      let q = this.sb.from('v_employees').select('id', { count: 'exact', head: true }).eq('is_active', true);
      if (deptId) q = q.eq('department_id', deptId);
      return q;
    };
    const [total, core, potential, successor, highRisk] = await Promise.all([
      base(),
      base().eq('talent_tier', 'Nòng cốt'),
      base().eq('talent_tier', 'Tiềm năng'),
      base().eq('talent_tier', 'Kế thừa'),
      base().gte('risk_score', 60),
    ]);
    return {
      totalTalents:   total.count     ?? 0,
      coreCount:      core.count      ?? 0,
      potentialCount: potential.count ?? 0,
      successorCount: successor.count ?? 0,
      highRiskCount:  highRisk.count  ?? 0,
    };
  }

  async getRiskAlerts(limit = 5, deptId?: string) {
    return this.cache.get(`dash:risk:${limit}:${deptId ?? 'all'}`, () => this._fetchRiskAlerts(limit, deptId));
  }

  private async _fetchRiskAlerts(limit: number, deptId?: string) {
    let q = this.sb
      .from('v_employees')
      .select('id, full_name, position, department_name, risk_score, risk_reasons')
      .eq('is_active', true)
      .gte('risk_score', 60)
      .order('risk_score', { ascending: false })
      .limit(limit);
    if (deptId) q = q.eq('department_id', deptId);
    const { data, error } = await q;
    if (error) { console.error('[DashboardService.getRiskAlerts]', error); return []; }
    return data ?? [];
  }

  async getPositionStats(deptId?: string) {
    return this.cache.get(`dash:pos-stats:${deptId ?? 'all'}`, () => this._fetchPositionStats(deptId));
  }

  private async _fetchPositionStats(deptId?: string) {
    const base = () => {
      let q = this.sb.from('key_positions').select('id', { count: 'exact', head: true }).eq('is_active', true);
      if (deptId) q = q.eq('department_id', deptId);
      return q;
    };
    const [total, critical, highRisk, noSuccessor, hasSuccessor] = await Promise.all([
      base(),
      base().eq('critical_level', 'Critical'),
      base().eq('risk_level', 'High'),
      base().eq('successor_count', 0),
      base().gt('successor_count', 0),
    ]);
    return {
      total:        total.count        ?? 0,
      critical:     critical.count     ?? 0,
      highRisk:     highRisk.count     ?? 0,
      noSuccessor:  noSuccessor.count  ?? 0,
      hasSuccessor: hasSuccessor.count ?? 0,
    };
  }

  async getDepartments() {
    return this.cache.get('dash:depts', () => this._fetchDepartments());
  }

  private async _fetchDepartments() {
    const { data, error } = await this.sb
      .from('departments')
      .select('id, name, parent_id, head_id')
      .order('name');
    if (error) { console.error('[DashboardService.getDepartments]', error); return []; }
    return data ?? [];
  }
}
