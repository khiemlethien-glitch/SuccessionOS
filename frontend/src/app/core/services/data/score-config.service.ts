import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';

export interface ExternalScore {
  employee_id: string;
  cycle_id: string;
  assessment_score: number | null;
  score_360: number | null;
}

export interface ScoreWeightConfig {
  assessment_weight: number;
  weight_360: number;
}

export interface ComputedScore {
  assessment_score: number | null;
  score_360: number | null;
  total_score: number | null;
}

@Injectable({ providedIn: 'root' })
export class ScoreConfigService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getWeightConfig(): Promise<ScoreWeightConfig> {
    return this.cache.get('score:weights', () => this._fetchWeightConfig());
  }

  private async _fetchWeightConfig(): Promise<ScoreWeightConfig> {
    const { data, error } = await this.sb
      .from('score_weight_config')
      .select('assessment_weight, weight_360')
      .eq('id', 1)
      .maybeSingle();
    if (error) console.error('[ScoreConfigService.getWeightConfig]', error);
    return {
      assessment_weight: data?.assessment_weight ?? 60,
      weight_360:        data?.weight_360        ?? 40,
    };
  }

  async updateWeightConfig(config: ScoreWeightConfig): Promise<boolean> {
    if (config.assessment_weight + config.weight_360 !== 100) {
      throw new Error('Tổng trọng số phải bằng 100%');
    }
    const { error } = await this.sb
      .from('score_weight_config')
      .upsert({ id: 1, ...config, updated_at: new Date().toISOString() });
    if (error) { console.error('[ScoreConfigService.updateWeightConfig]', error); return false; }
    this.cache.invalidate('score:weights');
    this.cache.invalidatePrefix('score:emp:');
    return true;
  }

  async getScoreForEmployee(employeeId: string, cycleId: string): Promise<ComputedScore> {
    return this.cache.get(`score:emp:${employeeId}:${cycleId}`, () =>
      this._fetchComputedScore(employeeId, cycleId));
  }

  private async _fetchComputedScore(employeeId: string, cycleId: string): Promise<ComputedScore> {
    const [weights, scoreRes] = await Promise.all([
      this.getWeightConfig(),
      this.sb.from('external_scores')
        .select('assessment_score, score_360')
        .eq('employee_id', employeeId)
        .eq('cycle_id', cycleId)
        .maybeSingle(),
    ]);

    if (scoreRes.error) console.error('[ScoreConfigService.getScoreForEmployee]', scoreRes.error);

    const assessment_score = scoreRes.data?.assessment_score ?? null;
    const score_360        = scoreRes.data?.score_360        ?? null;

    const total_score = (assessment_score != null && score_360 != null)
      ? Math.round((assessment_score * weights.assessment_weight / 100
          + score_360 * weights.weight_360 / 100) * 10) / 10
      : null;

    return { assessment_score, score_360, total_score };
  }

  async getLatestScoreForEmployee(employeeId: string): Promise<ComputedScore | null> {
    return this.cache.get(`score:latest:${employeeId}`, () => this._fetchLatestScore(employeeId));
  }

  private async _fetchLatestScore(employeeId: string): Promise<ComputedScore | null> {
    const cycleRes = await this.sb
      .from('assessment_cycles')
      .select('id')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cycleRes.data) return null;
    return this._fetchComputedScore(employeeId, cycleRes.data.id);
  }

  async getScoresForCycle(cycleId: string): Promise<ExternalScore[]> {
    return this.cache.get(`score:cycle:${cycleId}`, () => this._fetchCycleScores(cycleId));
  }

  private async _fetchCycleScores(cycleId: string): Promise<ExternalScore[]> {
    const { data, error } = await this.sb
      .from('external_scores')
      .select('*')
      .eq('cycle_id', cycleId);
    if (error) { console.error('[ScoreConfigService.getScoresForCycle]', error); return []; }
    return (data ?? []) as ExternalScore[];
  }
}
