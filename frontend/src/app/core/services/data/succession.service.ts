import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class SuccessionService {
  private sb = inject(SupabaseService).client;

  /**
   * DB: succession_plans chứa 1 row/successor — {position_id, talent_id, readiness, priority, gap_score}.
   * Frontend SuccessionPlan expects: {id, position_id, position_title, department, successors: [...]}.
   * → Group by position_id + join key_positions + v_employees cho tên.
   */
  async getPlans(_filter: { position_id?: string } = {}) {
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

    // Group successors by position_id
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

  /** 9-Box từ v_nine_box view — field `box` (1-9) đã compute sẵn. */
  async getNineBox() {
    const { data, error } = await this.sb
      .from('v_nine_box')
      .select('id, full_name, performance_score, potential_score, department_id, talent_tier, risk_band, box');
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
    return data;
  }

  async deletePlan(id: string) {
    const { error } = await this.sb.from('succession_plans').delete().eq('id', id);
    if (error) console.error('[SuccessionService.deletePlan]', error);
  }
}
