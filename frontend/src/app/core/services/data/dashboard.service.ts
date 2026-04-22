import { Injectable } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface DashboardKpi {
  total_employees: number;
  total_key_positions: number;
  positions_with_successors: number;
  positions_no_successor: number;
  high_risk_employees: number;
  active_idps: number;
  avg_idp_progress: number;
  tier_counts: {
    core: number;
    potential: number;
    successor: number;
    unassigned: number;
  };
  top_risk: Array<{
    employee_id: string;
    full_name: string;
    risk_score: number;
    department_name: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private get sb() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getKpi(): Promise<DashboardKpi> {
    const [empResult, posResult, idpResult] = await Promise.all([
      this.sb.from('v_employees').select('talent_tier, risk_score'),
      this.sb.from('key_positions').select('id, successor_count').eq('is_active', true),
      this.sb.from('idp_plans').select('status, overall_progress'),
    ]);

    const employees = (empResult.data ?? []) as Array<{ talent_tier: string | null; risk_score: number | null }>;
    const positions = (posResult.data ?? []) as Array<{ id: string; successor_count: number }>;
    const idps      = (idpResult.data ?? []) as Array<{ status: string; overall_progress: number }>;

    const tierCounts = { core: 0, potential: 0, successor: 0, unassigned: 0 };
    let highRisk = 0;
    employees.forEach(e => {
      if (e.talent_tier === 'Nòng cốt')   tierCounts.core++;
      else if (e.talent_tier === 'Tiềm năng') tierCounts.potential++;
      else if (e.talent_tier === 'Kế thừa')  tierCounts.successor++;
      else tierCounts.unassigned++;
      if ((e.risk_score ?? 0) >= 60) highRisk++;
    });

    const activeIdps = idps.filter(i => i.status === 'Active');
    const avgProgress = activeIdps.length
      ? Math.round(activeIdps.reduce((s, i) => s + i.overall_progress, 0) / activeIdps.length)
      : 0;

    const posWithSuc = positions.filter(p => p.successor_count > 0).length;

    // Top risk — fetch riêng để lấy tên
    const { data: topRiskData } = await this.sb
      .from('v_employees')
      .select('id, full_name, risk_score, department_name')
      .gte('risk_score', 60)
      .order('risk_score', { ascending: false })
      .limit(5);

    return {
      total_employees:           employees.length,
      total_key_positions:       positions.length,
      positions_with_successors: posWithSuc,
      positions_no_successor:    positions.length - posWithSuc,
      high_risk_employees:       highRisk,
      active_idps:               activeIdps.length,
      avg_idp_progress:          avgProgress,
      tier_counts:               tierCounts,
      top_risk: (topRiskData ?? []).map((r: any) => ({
        employee_id:     r.id,
        full_name:       r.full_name,
        risk_score:      r.risk_score ?? 0,
        department_name: r.department_name ?? '',
      })),
    };
  }

  async getEmployeeSummary() {
    const { data, error } = await this.sb
      .from('v_employees')
      .select('id, full_name, talent_tier, performance_score, potential_score, risk_score, department_name, job_title_name, readiness_level');
    if (error) throw error;
    return data;
  }
}
