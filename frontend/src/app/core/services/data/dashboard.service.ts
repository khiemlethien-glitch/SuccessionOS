import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private sb = inject(SupabaseService).client;

  async getKpi() {
    const active = { is_active: true };
    const [total, core, potential, successor, highRisk] = await Promise.all([
      this.sb.from('v_employees').select('id', { count: 'exact', head: true }).match(active),
      this.sb.from('v_employees').select('id', { count: 'exact', head: true }).match({ ...active, talent_tier: 'Nòng cốt' }),
      this.sb.from('v_employees').select('id', { count: 'exact', head: true }).match({ ...active, talent_tier: 'Tiềm năng' }),
      this.sb.from('v_employees').select('id', { count: 'exact', head: true }).match({ ...active, talent_tier: 'Kế thừa' }),
      this.sb.from('v_employees').select('id', { count: 'exact', head: true }).match(active).gte('risk_score', 60),
    ]);
    return {
      totalTalents:   total.count     ?? 0,
      coreCount:      core.count      ?? 0,
      potentialCount: potential.count ?? 0,
      successorCount: successor.count ?? 0,
      highRiskCount:  highRisk.count  ?? 0,
    };
  }

  async getRiskAlerts(limit = 5) {
    const { data, error } = await this.sb
      .from('v_employees')
      .select('id, full_name, position, department_name, risk_score, risk_reasons')
      .eq('is_active', true)
      .gte('risk_score', 60)
      .order('risk_score', { ascending: false })
      .limit(limit);
    if (error) { console.error('[DashboardService.getRiskAlerts]', error); return []; }
    return data ?? [];
  }

  async getPositionStats() {
    const base = () => this.sb.from('key_positions').select('id', { count: 'exact', head: true }).eq('is_active', true);
    const [total, critical, highRisk, noSuccessor, hasSuccessor] = await Promise.all([
      base(),
      base().eq('critical_level', 'Critical'),
      base().eq('risk_level', 'High'),
      base().eq('successor_count', 0),
      base().gt('successor_count', 0),
    ]);
    return {
      total:          total.count       ?? 0,
      critical:       critical.count    ?? 0,
      highRisk:       highRisk.count    ?? 0,
      noSuccessor:    noSuccessor.count ?? 0,
      hasSuccessor:   hasSuccessor.count ?? 0,
    };
  }

  async getDepartments() {
    const { data, error } = await this.sb
      .from('departments')
      .select('id, name, parent_id, head_id')
      .order('name');
    if (error) { console.error('[DashboardService.getDepartments]', error); return []; }
    return data ?? [];
  }
}
