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
  async getRadarProfile(employeeId: string, cycleId: string): Promise<RadarProfile | null> {
    return this.cache.get(`asmnt:radar:${employeeId}:${cycleId}`, () => this._fetchRadarProfile(employeeId, cycleId));
  }

  private async _fetchRadarProfile(employeeId: string, cycleId: string): Promise<RadarProfile | null> {
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
      const critId  = idByKey.get(a.key);
      const rawActual = critId ? (scoreByCrit.get(critId) ?? null) : null;
      // Normalize 0-5 scores to 0-100 so they compare correctly with comp_target_* fields
      const actual  = rawActual != null && rawActual <= 5 ? Math.round(rawActual * 20 * 10) / 10 : rawActual;
      const target  = targets[a.targetField] ?? 85;
      return {
        key:    a.key,
        label:  a.label,
        actual,
        target,
        delta:  actual != null ? actual - target : null,
      };
    });

    // If no axis has an actual score (criteria key mismatch or no assessment data),
    // return null so the component falls back to talent.competencies (already 0-100).
    const hasAnyActual = entries.some(e => e.actual !== null);
    if (!hasAnyActual) return null;

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
    // Step 1: fetch scores + meta in parallel
    const [scoresRes, summaryRes, extScoreRes, weightRes] = await Promise.all([
      this.sb.from('assessment_scores').select('criterion_id, score')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId),
      this.sb.from('assessment_summary').select('*')
        .eq('employee_id', employeeId).eq('cycle_id', cycleId).maybeSingle(),
      // external_scores may only exist for the latest cycle — fetch broadly (no cycle filter)
      // so we can get score_360 / assessment_score as fallback aggregate
      // criteria_json cột không tồn tại trong DB — chỉ select các cột có thật
      this.sb.from('external_scores').select('score_360, assessment_score')
        .eq('employee_id', employeeId)
        .order('cycle_id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.sb.from('score_weight_config').select('assessment_weight, weight_360')
        .eq('id', 1).maybeSingle(),
    ]);

    const scores   = scoresRes.data ?? [];
    const summary  = summaryRes.data;
    const ext      = extScoreRes.data;
    const weights  = {
      assessment_weight: weightRes.data?.assessment_weight ?? 60,
      weight_360:        weightRes.data?.weight_360        ?? 40,
    };

    // Step 2: fetch criteria for all scored IDs
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

    // Normalize helper: seed stores scores on a 0-5 scale; UI expects 0-100.
    const norm = (v: number | null | undefined): number | null => {
      if (v == null) return null;
      return v <= 5 ? Math.round(v * 20 * 10) / 10 : Math.round(v * 10) / 10;
    };

    const toItem = (s: { criterion_id: string; score: any }): AssessmentItem => {
      const c = criterionMap.get(s.criterion_id)!;
      return {
        id: c.id, label: c.label, description: c.description,
        weight: c.weight, item_max: 100, score: norm(Number(s.score)),
      };
    };
    const bySortOrder = (a: AssessmentItem, b: AssessmentItem) =>
      (criterionMap.get(a.id)?.sort_order ?? 0) - (criterionMap.get(b.id)?.sort_order ?? 0);

    // Split scored rows into KPI vs 360° by criterion's assessment_type.
    // Criteria with assessment_type=null default to KPI bucket.
    const kpiScores  = scores.filter(s => {
      const c = criterionMap.get(s.criterion_id);
      return c && (c.assessment_type == null || c.assessment_type === 'kpi');
    });
    const a360Scores = scores.filter(s => {
      const c = criterionMap.get(s.criterion_id);
      return c && c.assessment_type === '360';
    });

    // If ALL scored criteria are 360-type (common seed pattern), reclassify half as KPI
    // so users see actual item bars instead of an empty KPI block + a single 360° list.
    // Fallback: use assessment_scores items for KPI when no kpi-typed criteria exist.
    const useAllAsKpi = kpiScores.length === 0 && a360Scores.length > 0;

    const blocks: AssessmentBlock[] = [];

    // ── KPI block ──────────────────────────────────────────────────────────────
    const kpiOverall = norm(ext?.assessment_score ?? summary?.overall_score ?? null);
    const kpiItems   = (useAllAsKpi ? a360Scores : kpiScores).map(toItem).sort(bySortOrder);

    if (kpiItems.length > 0 || kpiOverall != null) {
      blocks.push({
        type: 'kpi',
        overall_score: kpiOverall,
        rating_label:  summary?.rating_label ?? null,
        manager_note:  summary?.manager_note ?? null,
        strengths:     summary?.strengths    ?? [],
        needs_dev:     summary?.needs_dev    ?? [],
        items:         kpiItems,
      });
    }

    // ── 360° block ─────────────────────────────────────────────────────────────
    // Primary: assessment_scores rows with assessment_type='360'.
    // criteria_json (legacy) đã bỏ — không còn dùng.
    if (!useAllAsKpi) {
      const a360Items: AssessmentItem[] = a360Scores.length > 0
        ? a360Scores.map(toItem).sort(bySortOrder)
        : [];

      // Overall 360°: use external_scores.score_360 if available, else average item scores.
      const extA360 = norm(ext?.score_360 ?? null);
      const computedA360 = (() => {
        const valid = a360Items.map(i => i.score).filter((v): v is number => v != null);
        if (valid.length === 0) return null;
        return Math.round((valid.reduce((s, v) => s + v, 0) / valid.length) * 10) / 10;
      })();
      const a360Overall = extA360 ?? computedA360;

      if (a360Overall != null || a360Items.length > 0) {
        blocks.push({
          type: '360',
          overall_score: a360Overall,
          rating_label: null,
          manager_note: null,
          strengths:    [],
          needs_dev:    [],
          items:        a360Items,
        });
      }
    }

    // Combined total (only when both blocks are present with scores)
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
