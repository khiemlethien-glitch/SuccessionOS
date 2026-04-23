import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';

@Injectable({ providedIn: 'root' })
export class KeyPositionService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getAll(filter: { department?: string; critical_level?: string } = {}) {
    const key = `kpos:all:${JSON.stringify(filter)}`;
    return this.cache.get(key, () => this._fetchAll(filter));
  }

  private async _fetchAll(filter: { department?: string; critical_level?: string }) {
    const [posRes, deptRes, empRes] = await Promise.all([
      this.sb.from('key_positions').select('*').eq('is_active', true),
      this.sb.from('departments').select('id, name'),
      this.sb.from('v_employees').select('id, full_name'),
    ]);
    if (posRes.error) { console.error('[KeyPositionService.getAll]', posRes.error); return []; }

    const deptMap = new Map((deptRes.data ?? []).map(d => [d.id, d.name]));
    const empMap  = new Map((empRes.data  ?? []).map(e => [e.id, e.full_name]));

    let rows = (posRes.data ?? []).map(p => ({
      ...p,
      department:     deptMap.get(p.department_id)    ?? '—',
      current_holder: empMap.get(p.current_holder_id) ?? '—',
      parent_id:      p.parent_position_id,
      successors:     [],
    }));
    if (filter.department)     rows = rows.filter(p => p.department === filter.department);
    if (filter.critical_level) rows = rows.filter(p => p.critical_level === filter.critical_level);
    return rows;
  }

  async getById(id: string) {
    return this.cache.get(`kpos:${id}`, () => this._fetchById(id));
  }

  private async _fetchById(id: string) {
    const { data, error } = await this.sb.from('key_positions').select('*').eq('id', id).maybeSingle();
    if (error) { console.error('[KeyPositionService.getById]', error); return null; }
    return data;
  }

  async getSuccessors(positionId: string) {
    return this.cache.get(`kpos:successors:${positionId}`, () => this._fetchSuccessors(positionId));
  }

  private async _fetchSuccessors(positionId: string) {
    const { data, error } = await this.sb
      .from('succession_plans')
      .select('*')
      .eq('position_id', positionId)
      .order('priority');
    if (error) { console.error('[KeyPositionService.getSuccessors]', error); return []; }
    return data ?? [];
  }

  async getSummary() {
    return this.cache.get('kpos:summary', () => this._fetchSummary());
  }

  private async _fetchSummary() {
    const [total, critical, noSuccessor] = await Promise.all([
      this.sb.from('key_positions').select('id', { count: 'exact', head: true }),
      this.sb.from('key_positions').select('id', { count: 'exact', head: true }).eq('critical_level', 'Critical'),
      this.sb.from('key_positions').select('id', { count: 'exact', head: true }).eq('successor_count', 0),
    ]);
    return {
      totalPositions:       total.count      ?? 0,
      criticalCount:        critical.count   ?? 0,
      positionsNoSuccessor: noSuccessor.count ?? 0,
    };
  }

  async create(payload: any) {
    const { data, error } = await this.sb.from('key_positions').insert(payload).select().maybeSingle();
    if (error) { console.error('[KeyPositionService.create]', error); return null; }
    this.cache.invalidatePrefix('kpos:');
    this.cache.invalidate('dash:pos-stats');
    return data;
  }

  async update(id: string, payload: any) {
    const { data, error } = await this.sb.from('key_positions').update(payload).eq('id', id).select().maybeSingle();
    if (error) { console.error('[KeyPositionService.update]', error); return null; }
    this.cache.invalidate(`kpos:${id}`);
    this.cache.invalidatePrefix('kpos:all:');
    this.cache.invalidate('kpos:summary');
    this.cache.invalidate('dash:pos-stats');
    return data;
  }

  async delete(id: string) {
    const { error } = await this.sb.from('key_positions').delete().eq('id', id);
    if (error) { console.error('[KeyPositionService.delete]', error); return; }
    this.cache.invalidatePrefix('kpos:');
    this.cache.invalidate('dash:pos-stats');
  }
}
