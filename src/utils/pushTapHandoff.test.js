/**
 * Übergabe eines Push-Tipps vom Service-Worker an die App (pushTapHandoff.js).
 */
import {
  takePendingReviewImport,
  appendPushLog,
  readPushLog,
  clearPushLog,
  PUSH_HANDOFF_MAX_AGE_MS,
} from './pushTapHandoff';

const PENDING_KEY = '/__push-handoff/pending-review-import';

class FakeResponse {
  constructor(body) {
    this.body = body;
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
}

let store;

beforeEach(() => {
  store = new Map();
  const cache = {
    match: (key) => Promise.resolve(store.has(key) ? new FakeResponse(store.get(key)) : undefined),
    put: (key, response) => {
      store.set(key, response.body);
      return Promise.resolve();
    },
    delete: (key) => Promise.resolve(store.delete(key)),
  };
  global.caches = { open: () => Promise.resolve(cache) };
  global.Response = FakeResponse;
});

afterEach(() => {
  delete global.caches;
  delete global.Response;
});

describe('takePendingReviewImport', () => {
  test('liefert die abgelegte Rezept-ID genau einmal', async () => {
    store.set(PENDING_KEY, JSON.stringify({ recipeId: 'abc123', at: Date.now() }));

    await expect(takePendingReviewImport()).resolves.toBe('abc123');
    await expect(takePendingReviewImport()).resolves.toBeNull();
  });

  test('ein alter Tipp wirkt nicht mehr', async () => {
    store.set(PENDING_KEY, JSON.stringify({ recipeId: 'abc123', at: Date.now() - PUSH_HANDOFF_MAX_AGE_MS - 1 }));

    await expect(takePendingReviewImport()).resolves.toBeNull();
    expect(store.has(PENDING_KEY)).toBe(false);
  });

  test('ohne Cache Storage: null, kein Fehler', async () => {
    delete global.caches;

    await expect(takePendingReviewImport()).resolves.toBeNull();
  });
});

describe('Protokoll', () => {
  test('schreibt, liest und leert', async () => {
    await appendPushLog('App erhält Tipp (Nachricht)', 'abc123');
    await appendPushLog('Prüf-Rezept geöffnet', 'abc123');

    const log = await readPushLog();
    expect(log.map((e) => [e.by, e.step, e.detail])).toEqual([
      ['app', 'App erhält Tipp (Nachricht)', 'abc123'],
      ['app', 'Prüf-Rezept geöffnet', 'abc123'],
    ]);

    await clearPushLog();
    await expect(readPushLog()).resolves.toEqual([]);
  });

  test('behält nur die letzten 40 Einträge', async () => {
    for (let i = 0; i < 45; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await appendPushLog(`Schritt ${i}`);
    }
    const log = await readPushLog();
    expect(log).toHaveLength(40);
    expect(log[0].step).toBe('Schritt 5');
  });
});
