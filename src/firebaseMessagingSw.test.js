/**
 * Klick auf eine Push-Benachrichtigung (public/firebase-messaging-sw.js).
 * Der Service-Worker ist ein reines Skript ohne Exporte, daher wird er hier
 * mit nachgebauten Browser-Globals ausgeführt.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SW_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'firebase-messaging-sw.js'),
  'utf8'
);

// Minimal Cache Storage (one shared store for all cache names is enough here)
// and Response, as the service worker uses them for the handoff to the page.
class FakeResponse {
  constructor(body) {
    this.body = body;
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
}

function makeCaches() {
  const store = new Map();
  const cache = {
    match: (key) => {
      const path = typeof key === 'string' ? key : new URL(key.url).pathname;
      return Promise.resolve(store.has(path) ? new FakeResponse(store.get(path)) : undefined);
    },
    put: (key, response) => {
      store.set(key, response.body);
      return Promise.resolve();
    },
    delete: (key) => Promise.resolve(store.delete(typeof key === 'string' ? key : new URL(key.url).pathname)),
    keys: () => Promise.resolve([...store.keys()].map((key) => ({ url: `https://example.test${key}` }))),
  };
  return { store, caches: { open: () => Promise.resolve(cache) } };
}

function loadServiceWorker(windowClients, { caches } = {}) {
  const listeners = {};
  const clients = {
    matchAll: jest.fn(() => Promise.resolve(windowClients)),
    openWindow: jest.fn(() => Promise.resolve(null)),
  };
  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    registration: { showNotification: jest.fn() },
    skipWaiting: jest.fn(),
  };
  vm.runInNewContext(SW_SOURCE, {
    self,
    clients,
    importScripts: () => {},
    console: { warn: () => {}, error: () => {} },
    setTimeout,
    ...(caches ? { caches, Response: FakeResponse } : {}),
  });
  return { listeners, clients, self };
}

function makeClient(overrides = {}) {
  return {
    url: 'https://example.test/',
    focus: jest.fn(() => Promise.resolve()),
    navigate: jest.fn(function navigate() {
      return Promise.resolve(this);
    }),
    postMessage: jest.fn(),
    ...overrides,
  };
}

async function click(listeners, data) {
  let pending;
  listeners.notificationclick({
    notification: { close: jest.fn(), data },
    waitUntil: (promise) => {
      pending = promise;
    },
  });
  await pending;
}

describe('notificationclick', () => {
  test('Import fertig, App läuft: Rezept-ID an die Seite, kein Neuladen', async () => {
    const client = makeClient();
    const { listeners, clients } = loadServiceWorker([client]);

    await click(listeners, { type: 'import_ready', recipeId: 'abc123' });

    expect(client.postMessage).toHaveBeenCalledWith({ type: 'REVIEW_IMPORT', recipeId: 'abc123' });
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).not.toHaveBeenCalled();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  test('Import fehlgeschlagen verhält sich wie Import fertig', async () => {
    const client = makeClient();
    const { listeners } = loadServiceWorker([client]);

    await click(listeners, { type: 'import_failed', recipeId: 'abc123' });

    expect(client.postMessage).toHaveBeenCalledWith({ type: 'REVIEW_IMPORT', recipeId: 'abc123' });
  });

  test('Import fertig, App geschlossen: Fenster mit Rezept-ID öffnen', async () => {
    const { listeners, clients } = loadServiceWorker([]);

    await click(listeners, { type: 'import_ready', recipeId: 'abc 123' });

    expect(clients.openWindow).toHaveBeenCalledWith('/?reviewImport=abc%20123');
  });

  test('Import ohne Rezept-ID: Flag 1 wie bisher', async () => {
    const { listeners, clients } = loadServiceWorker([]);

    await click(listeners, { type: 'import_ready' });

    expect(clients.openWindow).toHaveBeenCalledWith('/?reviewImport=1');
  });

  test('Import-Tipp legt die Rezept-ID für die App ab, bevor er sie nach vorn holt', async () => {
    const { store, caches } = makeCaches();
    let storedAtFocus;
    const client = makeClient({
      focus: jest.fn(() => {
        storedAtFocus = store.get('/__push-handoff/pending-review-import');
        return Promise.resolve();
      }),
    });
    const { listeners } = loadServiceWorker([client], { caches });

    await click(listeners, { type: 'import_ready', recipeId: 'abc123' });

    expect(JSON.parse(storedAtFocus)).toEqual({ recipeId: 'abc123', at: expect.any(Number) });
    const steps = [...store.entries()]
      .filter(([key]) => key.startsWith('/__push-handoff/log/'))
      .map(([, body]) => JSON.parse(body).step);
    expect(steps).toEqual(['Tipp empfangen', 'Tipp weitergegeben']);
  });

  test('Andere Benachrichtigungen legen nichts ab', async () => {
    const { store, caches } = makeCaches();
    const { listeners } = loadServiceWorker([makeClient()], { caches });

    await click(listeners, { type: 'consumption_reminder', eventId: 'e1' });

    expect(store.size).toBe(0);
  });

  test('Andere Benachrichtigungen navigieren weiter per URL', async () => {
    const client = makeClient();
    const { listeners } = loadServiceWorker([client]);

    await click(listeners, { type: 'consumption_reminder', eventId: 'e1' });

    expect(client.navigate).toHaveBeenCalledWith('/?eventReminder=e1');
    expect(client.postMessage).not.toHaveBeenCalled();
  });
});

describe('Aktualisierung und Version', () => {
  test('eine neue Fassung wartet nicht, sondern übernimmt sofort', () => {
    const { listeners, self } = loadServiceWorker([]);

    listeners.install({});

    expect(self.skipWaiting).toHaveBeenCalled();
  });

  test('meldet ihre Version auf Anfrage', () => {
    const { listeners } = loadServiceWorker([]);
    const port = { postMessage: jest.fn() };

    listeners.message({ data: { type: 'GET_MESSAGING_SW_VERSION' }, ports: [port] });

    expect(port.postMessage).toHaveBeenCalledWith({ version: '__MESSAGING_SW_VERSION__' });
  });
});
