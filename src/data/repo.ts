import { readCache, writeCache } from './cache';
import { initialState, resolveFetch, type CollectionState, type FetchResult } from './store';

export interface EntityClient<T> {
  fetchAll(): Promise<T[]>;
  upsert(row: T): Promise<T>;
  softDelete(id: string): Promise<void>;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class Repository<T extends { id?: string }> {
  state: CollectionState<T>;

  constructor(private name: string, private client: EntityClient<T>) {
    this.state = initialState<T>();
  }

  get rows(): T[] {
    return this.state.rows;
  }

  async load(sessionValid: boolean): Promise<void> {
    const cached = readCache<T>(this.name);
    let result: FetchResult<T>;
    try {
      result = { ok: true, rows: await this.client.fetchAll() };
    } catch (e) {
      result = { ok: false, error: messageOf(e) };
    }
    this.state = resolveFetch<T>({ result, cached, sessionValid, now: Date.now() });
    if (this.state.status === 'ready') {
      writeCache(this.name, this.state.rows, this.state.fetchedAt!);
    }
  }

  /** Postgres first. Local state changes only after the server accepts. */
  async save(row: T): Promise<{ ok: boolean; error?: string }> {
    let saved: T;
    try {
      saved = await this.client.upsert(row);
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    }
    const rows = this.state.rows.slice();
    const idx = rows.findIndex(r => r.id !== undefined && r.id === saved.id);
    if (idx === -1) rows.push(saved); else rows[idx] = saved;
    this.commit(rows);
    return { ok: true };
  }

  async remove(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.softDelete(id);
    } catch (e) {
      return { ok: false, error: messageOf(e) };
    }
    this.commit(this.state.rows.filter(r => r.id !== id));
    return { ok: true };
  }

  private commit(rows: T[]): void {
    this.state = { ...this.state, rows };
    if (this.state.fetchedAt !== null) {
      writeCache(this.name, rows, this.state.fetchedAt);
    }
  }
}
