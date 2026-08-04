/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');

const {_internal} = require('./submitConsumption');

// ── _internal unit tests ──────────────────────────────────────────────────

test('gebindeZuLiter: converts gebinde units to liters correctly', () => {
  const ratesDb = {
    bier: {gebindeLiter: 0.5},
    wein: {gebindeLiter: 0.75},
  };
  const gebinde = {
    bier: {eingekauft: 10, uebrig: 2},
    wein: {eingekauft: 4, uebrig: 1},
  };
  const result = _internal.gebindeZuLiter(gebinde, ratesDb);
  assert.strictEqual(result.bier, 4.0); // (10-2) * 0.5
  assert.strictEqual(result.wein, 2.25); // (4-1) * 0.75
});

test('gebindeZuLiter: skips categories missing from ratesDb', () => {
  const ratesDb = {bier: {gebindeLiter: 0.5}};
  const gebinde = {bier: {eingekauft: 2, uebrig: 0}, wasser: {eingekauft: 3, uebrig: 1}};
  const result = _internal.gebindeZuLiter(gebinde, ratesDb);
  assert.ok('bier' in result);
  assert.ok(!('wasser' in result));
});

test('gebindeZuLiter: clamps to 0 when uebrig > eingekauft', () => {
  const ratesDb = {bier: {gebindeLiter: 0.5}};
  const result = _internal.gebindeZuLiter({bier: {eingekauft: 1, uebrig: 5}}, ratesDb);
  assert.strictEqual(result.bier, 0);
});

// ── savePurchase callable mock test ───────────────────────────────────────

function buildMockSavePurchase(eventExists = true) {
  const savedData = {};

  let handler;

  const mockOnCall = (_opts, fn) => {
    handler = fn;
    return fn;
  };

  class MockHttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }

  const eventData = {status: 'berechnet'};
  const eventRef = {
    get: async () => ({exists: eventExists, data: () => eventData}),
    set: async (data, _opts) => {
      Object.assign(savedData, data);
    },
  };

  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => eventRef,
        }),
      }),
    }),
  };

  // Temporarily override requires
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'firebase-functions/v2/https') {
      return {onCall: mockOnCall, HttpsError: MockHttpsError};
    }
    if (request === 'firebase-admin') {
      return {firestore: () => db};
    }
    if (request === './drinkRates') {
      return {DEFAULT_RATES: {}, SEASON_FACTORS: {}, EVENT_TYPE_FACTORS: {}, durationFactor: () => 1};
    }
    return originalLoad.apply(this, arguments);
  };

  delete require.cache[require.resolve('./submitConsumption')];
  const mod = require('./submitConsumption');
  Module._load = originalLoad;

  return {handler, savedData};
}

test('savePurchase: saves istVerbrauchEingegeben without changing status', async () => {
  const {handler, savedData} = buildMockSavePurchase(true);

  const request = {
    auth: {uid: 'user1'},
    data: {
      eventId: 'evt1',
      gebinde: {bier: {eingekauft: 5, uebrig: 1}},
    },
  };

  const result = await handler(request);
  assert.deepStrictEqual(result, {eventId: 'evt1'});
  assert.deepStrictEqual(savedData.istVerbrauchEingegeben, {bier: {eingekauft: 5, uebrig: 1}});
  assert.ok(!('status' in savedData), 'status must not be set by savePurchase');
});

test('savePurchase: throws unauthenticated when no auth', async () => {
  const {handler} = buildMockSavePurchase(true);
  await assert.rejects(
      () => handler({auth: null, data: {eventId: 'e', gebinde: {}}}),
      (err) => err.code === 'unauthenticated',
  );
});

test('savePurchase: throws invalid-argument when missing fields', async () => {
  const {handler} = buildMockSavePurchase(true);
  await assert.rejects(
      () => handler({auth: {uid: 'u'}, data: {eventId: 'e'}}),
      (err) => err.code === 'invalid-argument',
  );
});

test('savePurchase: throws not-found when event does not exist', async () => {
  const {handler} = buildMockSavePurchase(false);
  await assert.rejects(
      () => handler({auth: {uid: 'u'}, data: {eventId: 'e', gebinde: {}}}),
      (err) => err.code === 'not-found',
  );
});
