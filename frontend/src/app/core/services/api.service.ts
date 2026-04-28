import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

type PgResult = { data: any; error: any; count?: number | null };

/**
 * Minimal PostgREST query builder — mirrors Supabase client API.
 * All methods return `any` so existing data services compile without changes.
 */
class QueryBuilder {
  private _table: string;
  private _method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET';
  private _filters: string[] = [];
  private _select = '*';
  private _order: string | null = null;
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _body: any = null;
  private _baseUrl: string;
  private _countMode: string | null = null;   // 'exact' | 'planned' | 'estimated'
  private _headOnly = false;                   // HEAD request (count only, no body)

  constructor(baseUrl: string, table: string) {
    this._baseUrl = baseUrl;
    this._table = table;
  }

  /** Mirrors Supabase's .select(columns, { count, head }) signature. */
  select(columns: any = '*', options?: { count?: string; head?: boolean }): this {
    if (typeof columns === 'string') this._select = columns;
    if (options?.count) this._countMode = options.count;
    if (options?.head)  this._headOnly  = true;
    return this;
  }

  insert(body: any): this {
    this._method = 'POST';
    this._body = Array.isArray(body) ? body : [body];
    return this;
  }

  update(body: any): this {
    this._method = 'PATCH';
    this._body = body;
    return this;
  }

  delete(): this {
    this._method = 'DELETE';
    return this;
  }

  eq(col: string, val: any): this {
    this._filters.push(`${col}=eq.${val}`);
    return this;
  }

  neq(col: string, val: any): this {
    this._filters.push(`${col}=neq.${val}`);
    return this;
  }

  gt(col: string, val: any): this {
    this._filters.push(`${col}=gt.${val}`);
    return this;
  }

  gte(col: string, val: any): this {
    this._filters.push(`${col}=gte.${val}`);
    return this;
  }

  lt(col: string, val: any): this {
    this._filters.push(`${col}=lt.${val}`);
    return this;
  }

  lte(col: string, val: any): this {
    this._filters.push(`${col}=lte.${val}`);
    return this;
  }

  in(col: string, vals: any[]): this {
    this._filters.push(`${col}=in.(${vals.map(v => encodeURIComponent(v)).join(',')})`);
    return this;
  }

  or(orFilter: string): this {
    // orFilter format: "col.eq.val,col2.eq.val2"
    this._filters.push(`or=(${orFilter})`);
    return this;
  }

  is(col: string, val: null | boolean): this {
    this._filters.push(`${col}=is.${val}`);
    return this;
  }

  ilike(col: string, pattern: string): this {
    this._filters.push(`${col}=ilike.${encodeURIComponent(pattern)}`);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const dir = opts?.ascending === false ? 'desc' : 'asc';
    // PostgreSQL defaults to NULLS FIRST for DESC, NULLS LAST for ASC.
    // Override: always nullslast so rows with NULL scores never float to top.
    const nulls = opts?.nullsFirst ? 'nullsfirst' : 'nullslast';
    this._order = `${col}.${dir}.${nulls}`;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  range(from: number, to: number): this {
    this._offset = from;
    this._limit = to - from + 1;
    return this;
  }

  single(): this { this._single = true; return this; }
  maybeSingle(): this { this._maybeSingle = true; return this; }

  // Make the builder thenable (awaitable)
  then(resolve: (v: PgResult) => any, reject?: (e: any) => any): Promise<any> {
    return this._execute().then(resolve, reject);
  }

  private async _execute(): Promise<PgResult> {
    // new URL() requires an absolute URL. When baseUrl is a relative path
    // (e.g. '/postgrest' for Vercel proxy), supply window.location.origin as base.
    const raw = `${this._baseUrl}/${this._table}`;
    const url = /^https?:\/\//.test(raw)
      ? new URL(raw)
      : new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

    if (this._method === 'GET' || this._method === 'DELETE') {
      if (this._select && this._select !== '*') url.searchParams.set('select', this._select);
      for (const f of this._filters) {
        const [key, ...rest] = f.split('=');
        url.searchParams.append(key, rest.join('='));
      }
      if (this._order)  url.searchParams.set('order', this._order);
      if (this._limit !== null)  url.searchParams.set('limit',  String(this._limit));
      if (this._offset !== null) url.searchParams.set('offset', String(this._offset));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this._single || this._maybeSingle) {
      headers['Accept'] = 'application/vnd.pgrst.object+json';
    }

    // count=exact → ask PostgREST to include total count in Content-Range header
    if (this._countMode) {
      headers['Prefer'] = `count=${this._countMode}`;
    }

    // For write ops, apply filters as query params
    if (this._method === 'PATCH' || this._method === 'DELETE') {
      for (const f of this._filters) {
        const [key, ...rest] = f.split('=');
        url.searchParams.append(key, rest.join('='));
      }
      const prefer = headers['Prefer'] ? `${headers['Prefer']},` : '';
      headers['Prefer'] = `${prefer}return=representation`;
    }

    if (this._method === 'POST') {
      const prefer = headers['Prefer'] ? `${headers['Prefer']},` : '';
      headers['Prefer'] = `${prefer}return=representation`;
    }

    // HEAD request — count only, no body
    const fetchMethod = this._headOnly ? 'HEAD' : this._method;

    try {
      const res = await fetch(url.toString(), {
        method: fetchMethod,
        headers,
        body: this._body != null ? JSON.stringify(this._body) : undefined,
      });

      // Parse count from Content-Range: "0-49/250" → 250
      let count: number | null = null;
      const cr = res.headers.get('content-range');
      if (cr) {
        const m = cr.match(/\/(\d+)$/);
        if (m) count = parseInt(m[1], 10);
      }

      if (res.status === 406 && this._maybeSingle) {
        return { data: null, error: null, count };
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        return { data: null, error: err, count };
      }

      // HEAD returns no body
      if (this._headOnly) {
        return { data: null, error: null, count };
      }

      const text = await res.text();
      if (!text) return { data: null, error: null, count };

      const json = JSON.parse(text);

      if (this._single || this._maybeSingle) {
        return { data: json ?? null, error: null, count };
      }

      // POST returns array when Prefer:return=representation
      if (this._method === 'POST' && Array.isArray(json)) {
        return { data: json[0] ?? null, error: null, count };
      }

      return { data: json, error: null, count };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? String(e) }, count: null };
    }
  }
}

/**
 * ApiService — thin PostgREST client using fetch.
 * `.db.from('table')` → QueryBuilder with same API as Supabase.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly db = {
    from: (table: string) => new QueryBuilder(environment.api.url, table),
  };

  // ── Legacy stubs (kept for compatibility) ─────────────────────────────────
  get<T>(_endpoint: string, _mockFile?: string): Observable<T> {
    return of({ data: [], total: 0 } as unknown as T);
  }
  post<T>(_endpoint: string, _body: unknown): Observable<T> {
    return of({ data: null } as unknown as T);
  }
  put<T>(_endpoint: string, _body: unknown): Observable<T> {
    return of({} as T);
  }
  patch<T>(_endpoint: string, _body: unknown): Observable<T> {
    return of({} as T);
  }
  delete<T>(_endpoint: string): Observable<T> {
    return of({} as T);
  }
}
