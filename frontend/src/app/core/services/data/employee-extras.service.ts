import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../supabase.service';
import { CacheService } from '../cache.service';
import {
  CurrentProject, KnowledgeTransfer, KnowledgeTransferItem,
  Assessment360, Assessment360Source, Assessment360Criteria,
} from '../../models/models';

export interface EmployeeExtras {
  employee_id: string;
  // Current project
  project_name:   string | null;
  project_type:   string | null;
  project_role:   string | null;
  project_client: string | null;
  project_value:  string | null;
  project_status: string | null;
  // Knowledge transfer
  kt_successor:         string | null;
  kt_successor_role:    string | null;
  kt_start_date:        string | null;
  kt_target_date:       string | null;
  kt_overall_progress:  number | null;
  kt_items:             KnowledgeTransferItem[] | null;
  // Assessment 360°
  a360_overall:       number | null;
  a360_benchmark:     number | null;
  a360_period:        string | null;
  a360_sources:       Assessment360Source[]   | null;
  a360_criteria:      Assessment360Criteria[] | null;
  a360_strengths:     string[] | null;
  a360_needs_dev:     string[] | null;
  a360_manager_note:  string | null;
  // Quick stats
  training_hours:      number | null;
  last_promotion_year: number | null;
  updated_at?: string;
}

/** Maps raw DB row → typed EmployeeExtras. */
function fromRow(row: any): EmployeeExtras {
  return {
    employee_id:          row.employee_id,
    project_name:         row.project_name         ?? null,
    project_type:         row.project_type         ?? null,
    project_role:         row.project_role         ?? null,
    project_client:       row.project_client       ?? null,
    project_value:        row.project_value        ?? null,
    project_status:       row.project_status       ?? null,
    kt_successor:         row.kt_successor         ?? null,
    kt_successor_role:    row.kt_successor_role    ?? null,
    kt_start_date:        row.kt_start_date        ?? null,
    kt_target_date:       row.kt_target_date       ?? null,
    kt_overall_progress:  row.kt_overall_progress  ?? null,
    kt_items:             row.kt_items             ?? null,
    a360_overall:         row.a360_overall         ?? null,
    a360_benchmark:       row.a360_benchmark       ?? null,
    a360_period:          row.a360_period          ?? null,
    a360_sources:         row.a360_sources         ?? null,
    a360_criteria:        row.a360_criteria        ?? null,
    a360_strengths:       row.a360_strengths       ?? null,
    a360_needs_dev:       row.a360_needs_dev       ?? null,
    a360_manager_note:    row.a360_manager_note    ?? null,
    training_hours:       row.training_hours       ?? null,
    last_promotion_year:  row.last_promotion_year  ?? null,
    updated_at:           row.updated_at,
  };
}

/** Convert EmployeeExtras → CurrentProject (null if no project data). */
export function extrasToProject(e: EmployeeExtras): CurrentProject | null {
  if (!e.project_name) return null;
  return {
    name:   e.project_name,
    type:   e.project_type   ?? '',
    role:   e.project_role   ?? '',
    client: e.project_client ?? '',
    value:  e.project_value  ?? '',
    status: e.project_status ?? 'active',
  };
}

/** Convert EmployeeExtras → KnowledgeTransfer (null if no KT data). */
export function extrasToKt(e: EmployeeExtras): KnowledgeTransfer | null {
  if (!e.kt_successor) return null;
  return {
    successor:        e.kt_successor        ?? '',
    successor_role:   e.kt_successor_role   ?? '',
    start_date:       e.kt_start_date       ?? '',
    target_date:      e.kt_target_date      ?? '',
    overall_progress: e.kt_overall_progress ?? 0,
    items:            e.kt_items            ?? [],
  };
}

/** Convert EmployeeExtras → Assessment360 (null if no 360 data). */
export function extrasTo360(e: EmployeeExtras): Assessment360 | null {
  if (e.a360_overall == null) return null;
  return {
    overall:      e.a360_overall      ?? 0,
    benchmark:    e.a360_benchmark    ?? 5,
    period:       e.a360_period       ?? '',
    sources:      e.a360_sources      ?? [],
    criteria:     e.a360_criteria     ?? [],
    strengths:    e.a360_strengths    ?? [],
    needs_dev:    e.a360_needs_dev    ?? [],
    manager_note: e.a360_manager_note ?? '',
  };
}

@Injectable({ providedIn: 'root' })
export class EmployeeExtrasService {
  private sb    = inject(SupabaseService).client;
  private cache = inject(CacheService);

  async getByEmployee(employeeId: string): Promise<EmployeeExtras | null> {
    return this.cache.get(`extras:${employeeId}`, () => this._fetch(employeeId));
  }

  private async _fetch(employeeId: string): Promise<EmployeeExtras | null> {
    const { data, error } = await this.sb
      .from('employee_extras')
      .select('*')
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (error) { console.error('[EmployeeExtrasService.fetch]', error); return null; }
    return data ? fromRow(data) : null;
  }

  async save(employeeId: string, patch: Partial<Omit<EmployeeExtras, 'employee_id' | 'updated_at'>>): Promise<boolean> {
    const payload = { employee_id: employeeId, updated_at: new Date().toISOString(), ...patch };
    const { error } = await this.sb
      .from('employee_extras')
      .upsert(payload, { onConflict: 'employee_id' });
    if (error) { console.error('[EmployeeExtrasService.save]', error); return false; }
    this.cache.invalidate(`extras:${employeeId}`);
    return true;
  }
}
