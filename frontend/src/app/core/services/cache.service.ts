import { Injectable } from '@angular/core';

interface CacheEntry<T> {
  data: T;
  ts: number;
  fetcher: () => Promise<T>;
}

const TTL   = 15 * 60 * 1000;   // 15 min → hard expiry
const STALE =  7 * 60 * 1000;   // 7 min  → trigger background refresh

/**
 * Stale-While-Revalidate (SWR) cache:
 * - Cache hit (age < 7 min)  → return immediately
 * - Stale (7–15 min)         → return immediately + refresh in background
 * - Expired / miss (>15 min) → fetch synchronously, store, return
 * - Background sweep every 15 min refreshes all registered entries
 * - In-flight deduplication: concurrent calls for the same key share one request
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private store    = new Map<string, CacheEntry<any>>();
  private inflight = new Map<string, Promise<any>>();

  constructor() {
    setInterval(() => this.sweepAll(), TTL);
  }

  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      const age = Date.now() - entry.ts;
      if (age < TTL) {
        if (age >= STALE) this.bgRefresh(key, fetcher);
        return entry.data;
      }
    }
    return this.fetchAndStore(key, fetcher);
  }

  invalidate(key: string) { this.store.delete(key); }

  invalidatePrefix(prefix: string) {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  invalidateAll() { this.store.clear(); }

  private async fetchAndStore<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.inflight.has(key)) return this.inflight.get(key)!;
    const p = fetcher()
      .then(data => { this.store.set(key, { data, ts: Date.now(), fetcher }); return data; })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private bgRefresh<T>(key: string, fetcher: () => Promise<T>) {
    if (this.inflight.has(key)) return;
    fetcher()
      .then(data => this.store.set(key, { data, ts: Date.now(), fetcher }))
      .catch(() => {});
  }

  private sweepAll() {
    for (const [key, entry] of this.store) {
      this.bgRefresh(key, entry.fetcher);
    }
  }
}
