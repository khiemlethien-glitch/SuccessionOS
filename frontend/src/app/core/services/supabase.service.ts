/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

/**
 * SupabaseService — compatibility shim.
 * All data services inject this and call .client.from(...)
 * Typed as `any` so downstream strict-TS checks don't break
 * when PostgREST returns untyped rows (no schema codegen yet).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private api = inject(ApiService);

  get client(): any { return this.api.db; }
}
