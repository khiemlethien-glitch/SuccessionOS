import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';

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

@Injectable({ providedIn: 'root' })
export class AssessmentService {
  private sb = inject(SupabaseService).client;

  async getCycles(): Promise<Cycle[]> {
    const { data, error } = await this.sb
      .from('assessment_cycles')
      .select('*')
      .order('sort_order', { ascending: false });
    if (error) { console.error('[AssessmentService.getCycles]', error); return []; }
    return (data ?? []) as Cycle[];
  }

  /** Master list TẤT CẢ tiêu chí — dùng trong admin drag-drop. */
  async getAllCriteria(): Promise<Criterion[]> {
    const { data, error } = await this.sb
      .from('assessment_criteria')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) { console.error('[AssessmentService.getAllCriteria]', error); return []; }
    return (data ?? []) as Criterion[];
  }

  /** 4 criterion IDs đã chọn hiển thị trong talent profile. */
  async getDisplayConfig(): Promise<string[]> {
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
    return true;
  }

  /**
   * Fetch assessment cho 1 employee × cycle — bao gồm:
   *  - 4 tiêu chí được chọn hiển thị (từ display config)
   *  - Điểm từng tiêu chí (join assessment_scores)
   *  - Overall + manager_note + strengths + needs_dev (từ assessment_summary)
   */
  async getAssessment(employeeId: string, cycleId: string): Promise<AssessmentView | null> {
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
