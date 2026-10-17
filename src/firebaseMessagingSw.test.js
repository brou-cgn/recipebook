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

function loadServiceWorker(windowClients) {
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
  };
  vm.runInNewContext(SW_SOURCE, {
    self,
    clients,
    importScripts: () => {},
    console: { warn: () => {}, error: () => {} },
  });
  return { listeners, clients };
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

  test('Andere Benachrichtigungen navigieren weiter per URL', async () => {
    const client = makeClient();
    const { listeners } = loadServiceWorker([client]);

    await click(listeners, { type: 'consumption_reminder', eventId: 'e1' });

    expect(client.navigate).toHaveBeenCalledWith('/?eventReminder=e1');
    expect(client.postMessage).not.toHaveBeenCalled();
  });
});
