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
  assessment_type?: 'kpi' | '360';
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

export interface AssessmentItem {
  id: string;
  label: string;
  description: string | null;
  weight: number;
  score: number | null;
  item_max: number;  // 100 for kpi, 5 for 360° criteria
}

export interface AssessmentBlock {
  type: 'kpi' | '360';
  overall_score: number | null;
  rating_label: string | null;
  manager_note: string | null;
  strengths: string[];
  needs_dev: string[];
  items: AssessmentItem[];
}

export interface AssessmentBlocksView {
  employee_id: string;
  cycle_id: string;
  blocks: AssessmentBlock[];
  weights: { assessment_weight: number; weight_360: number };
  combined_total: number | null;
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

  async getAllCriteria(departmentId?: string | null): Promise<Criterion[]> {
    const key = departmentId ? `asmnt:criteria:${departmentId}` : 'asmnt:criteria:all';
    return this.cache.get(key, () => this._fetchAllCriteria(departmentId));
  }

  private async _fetchAllCriteria(departmentId?: string | null): Promise<Criterion[]> {
    let q = this.sb
      .from('assessment_criteria')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    // Filter by department if provided; fall back to criteria with no dept assigned (global)
    if (departmentId) {
      q = (q as any).or(`department_id.eq.${departmentId},department_id.is.null`);
    }
    const { data, error } = await q;
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

  async getAssessmentBlocks(employeeId: string, cycleId: string): Promise<AssessmentBlocksView> {
    return this.cache.get(`asmnt:blocks:${employeeId}:${cycleId}`, () =>
      this._fetchAssessmentBlocks(employeeId, cycleId));
  }

  private async _fetchAssessmentBlocks(employeeId: string, cycleId: string): Promise<AssessmentBlocksView> {
    // Step 1: fetch scores + meta in parallel — scores tell us WHICH criteria to look up
    const [scoresRes, summaryRes, extScoreRes, weightRes] = await Promise.all([
      this.sb.from('assessment_scores').select('criterion_id, score')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId),
      this.sb.from('assessment_summary').select('*')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId).maybeSingle(),
      this.sb.from('external_scores').select('score_360, assessment_score, criteria_json')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId).maybeSingle(),
      this.sb.from('score_weight_config').select('assessment_weight, weight_360')
        .eq('id', 1).maybeSingle(),
    ]);

    const scores   = scoresRes.data ?? [];
    const scoreMap = new Map(scores.map(s => [s.criterion_id, Number(s.score)]));
    const summary  = summaryRes.data;
    const ext      = extScoreRes.data;
    const weights  = {
      assessment_weight: weightRes.data?.assessment_weight ?? 60,
      weight_360:        weightRes.data?.weight_360        ?? 40,
    };

    // Step 2: fetch ONLY the criteria that have actual scores for this employee+cycle
    // (avoids loading all 1,786 company-wide KPIs when only ~5-20 are relevant per employee)
    let criterionMap = new Map<string, Criterion>();
    const scoredIds = scores.map(s => s.criterion_id);
    if (scoredIds.length > 0) {
      const criteriaRes = await this.sb
        .from('assessment_criteria')
        .select('id, key, label, description, weight, category, sort_order, is_active, assessment_type')
        .in('id', scoredIds);
      const criteriaData = (criteriaRes.data ?? []) as Criterion[];
      criterionMap = new Map(criteriaData.map(c => [c.id, c]));
    }

    const blocks: AssessmentBlock[] = [];

    // KPI block — only scored KPI criteria (assessment_type != '360')
    const kpiOverall  = ext?.assessment_score ?? summary?.overall_score ?? null;
    const kpiItems: AssessmentItem[] = scores
      .filter(s => {
        const c = criterionMap.get(s.criterion_id);
        return c && (!c.assessment_type || c.assessment_type === 'kpi');
      })
      .map(s => {
        const c = criterionMap.get(s.criterion_id)!;
        return { id: c.id, label: c.label, description: c.description, weight: c.weight, item_max: 100, score: Number(s.score) };
      })
      .sort((a, b) => {
        const ca = criterionMap.get(a.id)?.sort_order ?? 0;
        const cb = criterionMap.get(b.id)?.sort_order ?? 0;
        return ca - cb;
      });

    if (kpiItems.length > 0 || kpiOverall != null) {
      blocks.push({
        type: 'kpi',
        overall_score: kpiOverall,
        rating_label: summary?.rating_label  ?? null,
        manager_note: summary?.manager_note  ?? null,
        strengths:    summary?.strengths     ?? [],
        needs_dev:    summary?.needs_dev     ?? [],
        items:        kpiItems,
      });
    }

    // 360° block — criteria from external_scores.criteria_json, score from score_360
    const criteria360 = (ext?.criteria_json ?? []) as Array<{ label: string; score: number }>;
    if (ext?.score_360 != null || criteria360.length > 0) {
      blocks.push({
        type: '360',
        overall_score: ext?.score_360 ?? null,
        rating_label: null,
        manager_note: null,
        strengths:    [],
        needs_dev:    [],
        items: criteria360.map((c, i) => ({
          id: `360_${i}`, label: c.label, description: null,
          weight: 0, item_max: 5,
          score: c.score ?? null,
        })),
      });
    }

    // Combined total
    const kpi  = blocks.find(b => b.type === 'kpi')?.overall_score;
    const a360 = blocks.find(b => b.type === '360')?.overall_score;
    const combined_total = (kpi != null && a360 != null)
      ? Math.round((kpi * weights.assessment_weight / 100 + a360 * weights.weight_360 / 100) * 10) / 10
      : null;

    return { employee_id: employeeId, cycle_id: cycleId, blocks, weights, combined_total };
  }

  async getAssessment(employeeId: string, cycleId: string, departmentId?: string | null): Promise<AssessmentView | null> {
    const cacheKey = departmentId
      ? `asmnt:score:${employeeId}:${cycleId}:${departmentId}`
      : `asmnt:score:${employeeId}:${cycleId}`;
    return this.cache.get(cacheKey, () => this._fetchAssessment(employeeId, cycleId, departmentId));
  }

  private async _fetchAssessment(employeeId: string, cycleId: string, departmentId?: string | null): Promise<AssessmentView | null> {
    const [displayIds, allCriteria, scoresRes, summaryRes] = await Promise.all([
      this.getDisplayConfig(),
      this.getAllCriteria(departmentId),
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
