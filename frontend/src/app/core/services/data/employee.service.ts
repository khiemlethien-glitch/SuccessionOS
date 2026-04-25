import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';
import { Talent } from '../../models/models';

/** Compatible with NzTreeNodeOptions from ng-zorro-antd */
export interface DeptTreeNode {
  title:     string;
  key:       string;
  children?: DeptTreeNode[];
  isLeaf?:   boolean;
}

function mapVEmployee(row: any): Talent {
  return {
    id: row.id,
    full_name: row.full_name,
    position: row.position ?? '',
    department: row.department_name ?? row.department_short ?? '',
    department_id: row.department_id,
    talent_tier: row.talent_tier,
    potential_level: row.potential_level ?? 'Medium',
    performance_score: row.performance_score,
    potential_score: row.potential_score,
    risk_score: row.risk_score,
    years_of_experience: row.years_of_experience ?? 0,
    readiness_level: row.readiness_level,
    email: row.email ?? '',
    hire_date: row.hire_date ?? undefined,
    tenure_years: row.tenure_years ?? undefined,
    ktp_progress: row.ktp_progress ?? undefined,
    overall_score: row.overall_score ?? undefined,
    mentor: row.mentor_name ?? null,
    target_position: row.target_position ?? null,
    risk_reasons: row.risk_reasons ?? [],
    departure_reasons: row.departure_reasons ?? [],
    competencies: {
      technical:       row.comp_technical       ?? null,
      leadership:      row.comp_leadership      ?? null,
      communication:   row.comp_communication   ?? null,
      problem_solving: row.comp_problem_solving ?? null,
      adaptability:    row.comp_adaptability    ?? null,
    },
    competency_targets: {
      technical:   row.comp_target_technical       ?? 85,
      performance: row.comp_target_problem_solving ?? 85,
      behavior:    row.comp_target_communication   ?? 80,
      potential:   row.comp_target_adaptability    ?? 80,
      leadership:  row.comp_target_leadership      ?? 85,
    },
  } as Talent;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getAll(filter: { department?: string; talent_tier?: string; limit?: number } = {}) {
    const key = `emp:all:${JSON.stringify(filter)}`;
    return this.cache.get(key, () => this._fetchAll(filter));
  }

  private async _fetchAll(filter: { department?: string; talent_tier?: string; limit?: number }) {
    let q = this.sb.from('v_employees').select('*', { count: 'exact' }).eq('is_active', true);
    if (filter.department)  q = q.eq('department_id', filter.department);
    if (filter.talent_tier) q = q.eq('talent_tier', filter.talent_tier);
    if (filter.limit)       q = q.limit(filter.limit);
    const { data, count, error } = await q;
    if (error) { console.error('[EmployeeService.getAll]', error); return { data: [], total: 0 }; }
    return { data: (data ?? []).map(mapVEmployee), total: count ?? 0 };
  }

  // ─── Server-side paginated list (dùng cho talent-list page) ─────────────────
  async getPaginated(params: {
    page:           number;
    pageSize:       number;
    search?:        string;
    departmentIds?: string[];   // multi-dept filter (replaces single departmentId)
    talentTier?:    string;
    readiness?:     string;     // 'Ready Now' | 'Ready in 1 Year' | 'Ready in 2 Years'
    riskBand?:      'High' | 'Med' | 'Low';
    sortCol?:       'overall_score' | 'performance_score' | 'potential_score' | 'risk_score' | 'full_name';
    sortDir?:       'asc' | 'desc';
  }): Promise<{ data: Talent[]; total: number }> {
    const { page, pageSize, search, departmentIds, talentTier, readiness, riskBand, sortCol = 'overall_score', sortDir = 'desc' } = params;
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    let q = this.sb.from('v_employees')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (search?.trim()) {
      const s = search.trim();
      q = q.or(`full_name.ilike.%${s}%,position.ilike.%${s}%,department_name.ilike.%${s}%`);
    }
    if (departmentIds?.length) q = q.in('department_id', departmentIds);
    if (talentTier)            q = q.eq('talent_tier', talentTier);
    if (readiness)    q = q.eq('readiness_level', readiness);
    if (riskBand === 'High') q = q.gte('risk_score', 60);
    if (riskBand === 'Med')  q = q.gte('risk_score', 30).lt('risk_score', 60);
    if (riskBand === 'Low')  q = q.lt('risk_score', 30);

    q = q.order(sortCol, { ascending: sortDir === 'asc' }).range(from, to);

    const { data, count, error } = await q;
    if (error) { console.error('[EmployeeService.getPaginated]', error); return { data: [], total: 0 }; }
    return { data: (data ?? []).map(mapVEmployee), total: count ?? 0 };
  }

  /** Department tree (id, name, parent_id) → NzTreeNodeOptions-compatible nodes.
   *  Primary: query `departments` table for a real hierarchy.
   *  Fallback: if table has RLS / missing columns / empty → use distinct departments
   *            from `v_employees` as a flat (but always-accessible) node list.
   */
  async getDeptTree(): Promise<DeptTreeNode[]> {
    return this.cache.get('emp:dept-tree', async () => {
      const { data, error } = await this.sb
        .from('departments')
        .select('id, name, parent_id')
        .order('name', { ascending: true });

      // ── Fallback ─────────────────────────────────────────────────────────────
      // `departments` table may be blocked by RLS (anon user, dev env) or empty.
      // Fall back to distinct dept list from v_employees — always readable.
      if (error || !data?.length) {
        if (error) {
          console.warn('[DeptTree] departments table unavailable (RLS?), using flat fallback. '
            + 'Run supabase/migrations/20260424_disable_rls_dev.sql to fix.', error.message);
        }
        const opts = await this.getDeptOptions();
        return opts.map(d => ({ title: d.name, key: d.id, isLeaf: true }));
      }

      // ── Build hierarchy ───────────────────────────────────────────────────────
      const rows = data as { id: string; name: string; parent_id: string | null }[];
      const nodeMap = new Map<string, DeptTreeNode>();
      for (const r of rows) {
        nodeMap.set(r.id, { title: r.name, key: r.id, children: [] });
      }
      const roots: DeptTreeNode[] = [];
      for (const r of rows) {
        const node = nodeMap.get(r.id)!;
        if (r.parent_id && nodeMap.has(r.parent_id)) {
          nodeMap.get(r.parent_id)!.children!.push(node);
        } else {
          roots.push(node);
        }
      }
      const finalize = (nodes: DeptTreeNode[]) => {
        for (const n of nodes) {
          if (!n.children?.length) { n.isLeaf = true; delete n.children; }
          else finalize(n.children!);
        }
      };
      finalize(roots);
      return roots;
    });
  }

  /** Distinct department list — dùng 1 lần cho filter dropdown */
  async getDeptOptions(): Promise<{ id: string; name: string }[]> {
    return this.cache.get('emp:dept-options', async () => {
      const { data, error } = await this.sb
        .from('v_employees')
        .select('department_id, department_name')
        .eq('is_active', true)
        .not('department_id', 'is', null);
      if (error) return [];
      const seen = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.department_id && r.department_name) seen.set(r.department_id, r.department_name);
      }
      return [...seen.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }); // cached by SWR (15 min TTL)
  }

  async getById(id: string): Promise<Talent | null> {
    return this.cache.get(`emp:${id}`, () => this._fetchById(id));
  }

  private async _fetchById(id: string): Promise<Talent | null> {
    const { data, error } = await this.sb.from('v_employees').select('*').eq('id', id).maybeSingle();
    if (error) { console.error('[EmployeeService.getById]', error); return null; }
    return data ? mapVEmployee(data) : null;
  }

  async getNetwork(_id: string) {
    return { nodes: [], edges: [] };
  }

  async getRiskFactors(_id: string) {
    return [];
  }

  async update(id: string, payload: Partial<Talent>) {
    const { data, error } = await this.sb.from('employees').update(payload).eq('id', id).select().maybeSingle();
    if (error) { console.error('[EmployeeService.update]', error); return null; }
    this.cache.invalidate(`emp:${id}`);
    this.cache.invalidatePrefix('emp:all:');
    return data;
  }
}
