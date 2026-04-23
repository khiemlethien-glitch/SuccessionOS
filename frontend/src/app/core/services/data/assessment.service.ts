import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';

export interface Cycle {
  id: string;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export interface Criterion {
  id: string;
  key: string;
  label: string;
  description: string | null;
  weight: number;
  category: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface AssessmentView {
  employee_id: string;
  cycle_id: string;
  overall_score: number | null;
  rating_label: string | null;
  manager_note: string | null;
  strengths: string[];
  needs_dev: string[];
  /** Chỉ 4 (max) criteria đã chọn bởi admin display config, kèm score. */
  items: Array<Criterion & { score: number | null }>;
}

/**
 * GAP năng lực per trục radar — tính từ điểm đánh giá thực tế vs target.
 *   delta = actual - target
 *   >= 0 → vượt chuẩn; < 0 → cần cải thiện
 */
export interface RadarEntry {
  key:    string;                    // technical | performance | behavior | potential | leadership
  label:  string;                    // Kỹ thuật / Hiệu suất / ...
  actual: number | null;             // từ assessment_scores (cycle đã chọn)
  target: number;                    // từ v_employees.comp_target_*
  delta:  number | null;             // actual - target (null nếu actual null)
}

export interface RadarProfile {
  entries:        RadarEntry[];
  above_count:    number;            // số trục vượt chuẩn (delta >= 0)
  below_count:    number;            // số trục cần cải thiện (delta < 0)
  total_gap_abs:  number;            // Σ |delta| — độ lệch tổng
  avg_gap:        number;            // Σ delta / count — trung bình có dấu
}

@Injectable({ providedIn: 'root' })
export class AssessmentService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getCycles(): Promise<Cycle[]> {
    return this.cache.get('asmnt:cycles', () => this._fetchCycles());
  }

  private async _fetchCycles(): Promise<Cycle[]> {
    const { data, error } = await this.sb
      .from('assessment_cycles')
      .select('*')
      .order('sort_order', { ascending: false });
    if (error) { console.error('[AssessmentService.getCycles]', error); return []; }
    return (data ?? []) as Cycle[];
  }

  async getAllCriteria(): Promise<Criterion[]> {
    return this.cache.get('asmnt:criteria', () => this._fetchAllCriteria());
  }

  private async _fetchAllCriteria(): Promise<Criterion[]> {
    const { data, error } = await this.sb
      .from('assessment_criteria')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) { console.error('[AssessmentService.getAllCriteria]', error); return []; }
    return (data ?? []) as Criterion[];
  }

  async getDisplayConfig(): Promise<string[]> {
    return this.cache.get('asmnt:display-cfg', () => this._fetchDisplayConfig());
  }

  private async _fetchDisplayConfig(): Promise<string[]> {
    const { data, error } = await this.sb
      .from('assessment_display_config')
      .select('criterion_ids')
      .eq('id', 1)
      .maybeSingle();
    if (error) { console.error('[AssessmentService.getDisplayConfig]', error); return []; }
    return data?.criterion_ids ?? [];
  }

  async updateDisplayConfig(criterionIds: string[]): Promise<boolean> {
    if (criterionIds.length > 4) throw new Error('Chỉ được chọn tối đa 4 tiêu chí');
    const { error } = await this.sb
      .from('assessment_display_config')
      .upsert({ id: 1, criterion_ids: criterionIds, updated_at: new Date().toISOString() });
    if (error) { console.error('[AssessmentService.updateDisplayConfig]', error); return false; }
    this.cache.invalidate('asmnt:display-cfg');
    this.cache.invalidatePrefix('asmnt:score:');
    return true;
  }

  /**
   * GAP năng lực 5 trục — actual từ assessment_scores của cycle, target từ v_employees.comp_target_*.
   * Formula: delta = actual - target. Trả kèm aggregate (above/below/total_gap_abs/avg_gap).
   */
  async getRadarProfile(employeeId: string, cycleId: string): Promise<RadarProfile> {
    return this.cache.get(`asmnt:radar:${employeeId}:${cycleId}`, () => this._fetchRadarProfile(employeeId, cycleId));
  }

  private async _fetchRadarProfile(employeeId: string, cycleId: string): Promise<RadarProfile> {
    const RADAR_AXES = [
      { key: 'technical',   label: 'Kỹ thuật',  targetField: 'comp_target_technical'       },
      { key: 'performance', label: 'Hiệu suất', targetField: 'comp_target_problem_solving' },
      { key: 'behavior',    label: 'Hành vi',   targetField: 'comp_target_communication'   },
      { key: 'potential',   label: 'Tiềm năng', targetField: 'comp_target_adaptability'    },
      { key: 'leadership',  label: 'Lãnh đạo',  targetField: 'comp_target_leadership'      },
    ];

    const [criteriaRes, scoresRes, empRes] = await Promise.all([
      this.sb.from('assessment_criteria').select('id, key').in('key', RADAR_AXES.map(a => a.key)),
      this.sb.from('assessment_scores').select('criterion_id, score')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId),
      this.sb.from('v_employees')
        .select('comp_target_technical, comp_target_leadership, comp_target_communication, comp_target_problem_solving, comp_target_adaptability')
        .eq('id', employeeId).maybeSingle(),
    ]);

    const idByKey      = new Map((criteriaRes.data ?? []).map(c => [c.key, c.id]));
    const scoreByCrit  = new Map((scoresRes.data   ?? []).map(s => [s.criterion_id, Number(s.score)]));
    const targets: any = empRes.data ?? {};

    const entries: RadarEntry[] = RADAR_AXES.map(a => {
      const critId = idByKey.get(a.key);
      const actual = critId ? (scoreByCrit.get(critId) ?? null) : null;
      const target = targets[a.targetField] ?? 85;
      return {
        key:    a.key,
        label:  a.label,
        actual,
        target,
        delta:  actual != null ? actual - target : null,
      };
    });

    const withDelta = entries.filter(e => e.delta !== null);
    const above    = withDelta.filter(e => (e.delta ?? 0) >= 0).length;
    const below    = withDelta.filter(e => (e.delta ?? 0) < 0).length;
    const absSum   = withDelta.reduce((s, e) => s + Math.abs(e.delta ?? 0), 0);
    const signedSum = withDelta.reduce((s, e) => s + (e.delta ?? 0), 0);

    return {
      entries,
      above_count:   above,
      below_count:   below,
      total_gap_abs: Math.round(absSum * 10) / 10,
      avg_gap:       withDelta.length ? Math.round((signedSum / withDelta.length) * 10) / 10 : 0,
    };
  }

  async getAssessment(employeeId: string, cycleId: string): Promise<AssessmentView | null> {
    return this.cache.get(`asmnt:score:${employeeId}:${cycleId}`, () => this._fetchAssessment(employeeId, cycleId));
  }

  private async _fetchAssessment(employeeId: string, cycleId: string): Promise<AssessmentView | null> {
    const [displayIds, allCriteria, scoresRes, summaryRes] = await Promise.all([
      this.getDisplayConfig(),
      this.getAllCriteria(),
      this.sb.from('assessment_scores').select('*')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId),
      this.sb.from('assessment_summary').select('*')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId).maybeSingle(),
    ]);

    if (scoresRes.error) console.error('[assessment_scores]', scoresRes.error);
    if (summaryRes.error) console.error('[assessment_summary]', summaryRes.error);

    const criterionMap = new Map(allCriteria.map(c => [c.id, c]));
    const scoreMap     = new Map((scoresRes.data ?? []).map(s => [s.criterion_id, s.score]));

    const items = displayIds
      .map(id => criterionMap.get(id))
      .filter((c): c is Criterion => !!c)
      .map(c => ({ ...c, score: scoreMap.get(c.id) ?? null }));

    const summary = summaryRes.data;
    return {
      employee_id:   employeeId,
      cycle_id:      cycleId,
      overall_score: summary?.overall_score ?? null,
      rating_label:  summary?.rating_label  ?? null,
      manager_note:  summary?.manager_note  ?? null,
      strengths:     summary?.strengths     ?? [],
      needs_dev:     summary?.needs_dev     ?? [],
      items,
    };
  }
}
