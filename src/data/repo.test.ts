import { describe, it, expect, beforeEach } from 'vitest';
import { Repository, type EntityClient } from './repo';

type Row = { id?: string; name: string };

function clientThat(overrides: Partial<EntityClient<Row>>): EntityClient<Row> {
  return {
    fetchAll: async () => [],
    upsert: async (r) => r,
    softDelete: async () => {},
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe('Repository', () => {
  it('loads rows and caches them', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
    }));
    await repo.load(true);
    expect(repo.rows).toEqual([{ id: 'a', name: 'Alex' }]);
    expect(repo.state.status).toBe('ready');
    expect(localStorage.getItem('bhs.cache.v1.players')).not.toBeNull();
  });

  it('serves cache as stale when the fetch throws', async () => {
    const seeded = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
    }));
    await seeded.load(true);

    const failing = new Repository<Row>('players', clientThat({
      fetchAll: async () => { throw new Error('offline'); },
    }));
    await failing.load(true);
    expect(failing.state.status).toBe('stale');
    expect(failing.rows).toEqual([{ id: 'a', name: 'Alex' }]);
  });

  it('applies a successful save to local rows', async () => {
    const repo = new Repository<Row>('players', clientThat({
      upsert: async (r) => ({ ...r, id: 'server-id' }),
    }));
    await repo.load(true);
    const res = await repo.save({ name: 'New' });
    expect(res.ok).toBe(true);
    expect(repo.rows).toEqual([{ id: 'server-id', name: 'New' }]);
  });

  // Postgres first, local second: a rejected write must not mutate local state.
  it('leaves local rows untouched when a save fails', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
      upsert: async () => { throw new Error('permission denied'); },
    }));
    await repo.load(true);
    const res = await repo.save({ name: 'New' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/permission denied/);
    expect(repo.rows).toEqual([{ id: 'a', name: 'Alex' }]);
  });

  it('leaves local rows untouched when a delete fails', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
      softDelete: async () => { throw new Error('denied'); },
    }));
    await repo.load(true);
    const res = await repo.remove('a');
    expect(res.ok).toBe(false);
    expect(repo.rows).toEqual([{ id: 'a', name: 'Alex' }]);
  });

  it('removes the row locally when the delete succeeds', async () => {
    const repo = new Repository<Row>('players', clientThat({
      fetchAll: async () => [{ id: 'a', name: 'Alex' }],
    }));
    await repo.load(true);
    const res = await repo.remove('a');
    expect(res.ok).toBe(true);
    expect(repo.rows).toEqual([]);
  });
});
