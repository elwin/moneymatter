import { QueryClient, type QueryFunction, type QueryKey } from '@tanstack/vue-query';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// idb-keyval backed by an in-memory Map so the persister's reads/writes are
// observable without a real IndexedDB. `vi.hoisted` makes the Map reachable from
// the hoisted mock factory.
const { memory, idbState, idbCall } = vi.hoisted(() => {
  const state = { failing: false, failingClear: false };
  return {
    memory: new Map<string, string>(),
    idbState: state,
    // Mirrors the error Chrome throws from every call when its IndexedDB backing store is corrupt.
    idbCall: async <T>(run: () => T): Promise<T> => {
      if (state.failing) throw new DOMException('Internal error.', 'UnknownError');
      return run();
    },
  };
});

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: (key: string) => idbCall(() => memory.get(key)),
  set: (key: string, value: string) => idbCall(() => void memory.set(key, value)),
  del: (key: string) => idbCall(() => void memory.delete(key)),
  clear: () =>
    idbCall(() => {
      if (idbState.failingClear) throw new DOMException('Transaction aborted.', 'AbortError');
      memory.clear();
    }),
  entries: () => idbCall(() => [...memory.entries()]),
}));

// The persister persists on a scheduled macrotask, so let the queue drain before
// asserting on storage / simulating a reload.
const flushScheduler = () => new Promise((resolve) => setTimeout(resolve, 0));

// The confirming refetch is queued behind requestIdleCallback (stubbed onto the
// macrotask queue below) and is itself async, so drain twice.
const flushIdle = async () => {
  await flushScheduler();
  await flushScheduler();
};

let persisterModule: Awaited<ReturnType<typeof loadModule>>;
let persistedQueryFn: NonNullable<Awaited<ReturnType<typeof loadModule>>['persistedQueryFn']>;
let persistedImmutableQueryFn: NonNullable<Awaited<ReturnType<typeof loadModule>>['persistedImmutableQueryFn']>;

const loadModule = () => import('@/lib/query-persister');

// A fresh QueryClient shares the in-memory `memory` store but starts with an empty
// in-memory cache – i.e. what a full page reload gives you.
const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

// staleTime: Infinity throughout – the worst case for restore staleness, and what
// several whitelisted call sites really declare.
const fetchThrough = <T>(client: QueryClient, queryKey: QueryKey, queryFn: QueryFunction<T>) =>
  client.fetchQuery({ queryKey, queryFn, persister: persistedQueryFn, staleTime: Infinity });

const fetchThroughImmutable = <T>(client: QueryClient, queryKey: QueryKey, queryFn: QueryFunction<T>) =>
  client.fetchQuery({ queryKey, queryFn, persister: persistedImmutableQueryFn, staleTime: Infinity });

beforeAll(async () => {
  // jsdom ships no IndexedDB; presence is all the availability guard checks.
  vi.stubGlobal('indexedDB', {});
  // jsdom ships no requestIdleCallback either. Put the callback on the macrotask
  // queue so `flushIdle` can drive it deterministically, instead of leaving the
  // module on its 2s setTimeout fallback.
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0));
  const mod = await loadModule();
  if (!mod.persistedQueryFn) throw new Error('persister should be enabled when indexedDB is present');
  if (!mod.persistedImmutableQueryFn)
    throw new Error('immutable persister should be enabled when indexedDB is present');
  persistedQueryFn = mod.persistedQueryFn;
  persistedImmutableQueryFn = mod.persistedImmutableQueryFn;
  persisterModule = mod;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  idbState.failing = false;
  idbState.failingClear = false;
  // A successful wipe also lifts the module's unreadable-store flag left by a failed one.
  await persisterModule.clearPersistedQueries();
});

describe('query persister – empty snapshots are not persisted', () => {
  it('does not persist an empty list result', async () => {
    await fetchThrough(freshClient(), ['accounts'], async () => []);
    await flushScheduler();

    expect(memory.size).toBe(0);
  });

  it('does not persist a null singleton result', async () => {
    await fetchThrough(freshClient(), ['base-currency'], async () => null);
    await flushScheduler();

    expect(memory.size).toBe(0);
  });

  it('persists a non-empty list result', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    expect(memory.size).toBe(1);
  });

  it('drops a previously-persisted entry once its list becomes empty in-session', async () => {
    // Same client throughout: the query already holds data, so a refetch runs the
    // queryFn (rather than restoring from disk) – the path a user hits by deleting
    // their last account. The now-empty result must prune the stale disk entry.
    const client = freshClient();
    let result: { id: number }[] = [{ id: 1 }];

    await fetchThrough(client, ['accounts'], async () => result);
    await flushScheduler();
    expect(memory.size).toBe(1);

    result = [];
    await client.refetchQueries({ queryKey: ['accounts'] });
    await flushScheduler();
    expect(memory.size).toBe(0);
  });
});

describe('query persister – restore behaviour across a reload', () => {
  it('refetches after an empty snapshot so data seeded out-of-band appears', async () => {
    // First load: user has no accounts yet -> empty result, nothing persisted.
    await fetchThrough(freshClient(), ['accounts'], async () => []);
    await flushScheduler();

    // Accounts get created out-of-band (another device / an import / API seeding),
    // then the app reloads. With nothing restorable, the query must refetch.
    let calls = 0;
    const data = await fetchThrough(freshClient(), ['accounts'], async () => {
      calls += 1;
      return [{ id: 'seeded' }];
    });

    expect(calls).toBe(1);
    expect(data).toEqual([{ id: 'seeded' }]);
  });

  it('paints a non-empty snapshot from disk without a request on the critical path', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    let calls = 0;
    const data = await fetchThrough(freshClient(), ['portfolios'], async () => {
      calls += 1;
      return [{ id: 1 }, { id: 2 }];
    });

    expect(data).toEqual([{ id: 1 }]);
    expect(calls).toBe(0);
  });

  it('confirms a restored snapshot with a background refetch once idle', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    let calls = 0;
    const client = freshClient();
    await fetchThrough(client, ['portfolios'], async () => {
      calls += 1;
      return [{ id: 1 }, { id: 2 }];
    });

    await flushIdle();

    // Confirm fires unconditionally, independent of staleTime/maxAge – this is how
    // out-of-band writes (another device, an import) surface after restore.
    expect(calls).toBe(1);
    expect(client.getQueryData(['portfolios'])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('writes the confirmed data back to disk so the next reload restores it', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }, { id: 2 }]);
    await flushIdle();
    await flushScheduler();

    const persisted = JSON.parse([...memory.values()][0]!) as { state: { data: unknown } };
    expect(persisted.state.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('confirms exactly once – the background refetch does not re-defer', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    let calls = 0;
    await fetchThrough(freshClient(), ['portfolios'], async () => {
      calls += 1;
      return [{ id: 1 }, { id: 2 }];
    });

    await flushIdle();
    await flushIdle();

    // Re-entering with data already cached fails the restore gate (see
    // `persistedQueryFn`), so this run hits queryFn directly – nothing left to confirm.
    expect(calls).toBe(1);
  });

  it('does not schedule a second request when there was no snapshot to confirm', async () => {
    let calls = 0;
    await fetchThrough(freshClient(), ['portfolios'], async () => {
      calls += 1;
      return [{ id: 1 }];
    });

    await flushIdle();

    // A cold fetch already went to the network; confirming it would be a duplicate.
    expect(calls).toBe(1);
  });
});

describe('query persister – immutable reference data', () => {
  it('restores without any confirming request', async () => {
    await fetchThroughImmutable(freshClient(), ['currencies', 'all'], async () => [{ code: 'USD' }]);
    await flushScheduler();

    let calls = 0;
    const data = await fetchThroughImmutable(freshClient(), ['currencies', 'all'], async () => {
      calls += 1;
      return [{ code: 'USD' }, { code: 'EUR' }];
    });

    await flushIdle();

    // Only key that's genuinely zero-request – see `persistedImmutableQueryFn`.
    expect(data).toEqual([{ code: 'USD' }]);
    expect(calls).toBe(0);
  });
});

describe('query persister – broken IndexedDB degrades to unpersisted', () => {
  beforeEach(() => {
    idbState.failing = true;
  });

  it('resolves a persisted fetch with the queryFn result', async () => {
    const data = await fetchThrough(freshClient(), ['base-currency'], async () => ({ code: 'USD' }));
    await flushScheduler();

    expect(data).toEqual({ code: 'USD' });
  });

  it('resolves garbage collection', async () => {
    await expect(persisterModule.collectPersistedQueryGarbage()).resolves.toBeUndefined();
  });

  it('resolves persisted-store removal and teardown', async () => {
    await expect(persisterModule.removePersistedQuery({ queryKey: ['base-currency'] })).resolves.toBeUndefined();
    await expect(persisterModule.clearPersistedQueries()).resolves.toBe(false);
    await expect(persisterModule.resetQueryCaches(freshClient())).resolves.toBe(false);
  });
});

describe('query persister – failed wipe with readable IndexedDB', () => {
  it('reports the failure and stops restoring the unwiped store', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 'previous-user' }]);
    await flushScheduler();

    idbState.failingClear = true;
    await expect(persisterModule.clearPersistedQueries()).resolves.toBe(false);

    const data = await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 'current-user' }]);

    expect(data).toEqual([{ id: 'current-user' }]);
  });
});
