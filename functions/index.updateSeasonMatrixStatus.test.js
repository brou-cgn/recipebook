/* eslint-disable require-jsdoc */
/**
 * Tests für updateSeasonMatrixStatus (Tech-Check F7): nur geänderte Status
 * werden geschrieben, in Batches von höchstens 400.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

let job;
let batches;

function loadJob(entries) {
  require('./testSupport').purgeFunctionsCache();
  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/scheduler') return {onSchedule: (_o, h) => h};
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {}
      return {onCall: (_o, h) => h, onRequest: (_o, h) => h, HttpsError: MockHttpsError};
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h};
    }
    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => 'secret'})};
    }
    if (request === 'firebase-admin') {
      const docs = entries.map((data, i) => ({
        id: `e${i}`,
        data: () => data,
        ref: {id: `e${i}`},
      }));
      const db = {
        collection: () => ({get: async () => ({empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn)})}),
        batch: () => {
          const writes = [];
          batches.push(writes);
          return {
            update: (ref, fields) => writes.push({id: ref.id, fields}),
            commit: async () => {},
          };
        },
      };
      const firestore = () => db;
      firestore.FieldValue = {serverTimestamp: () => 'ts', delete: () => '__delete__', increment: (n) => n};
      return {apps: [{}], initializeApp: () => {}, firestore, auth: () => ({}), storage: () => ({}), messaging: () => ({})};
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  job = require('./handlers/nutritionRecalc').updateSeasonMatrixStatus;
  Module._load = originalLoad;
}

test.beforeEach(() => {
  batches = [];
});

const allYear = Array.from({length: 12}, (_, i) => i + 1);

test('schreibt nur Einträge, deren Status sich ändert', async () => {
  loadJob([
    {mainSeasonMonths: allYear, currentSeasonStatus: 'Keine_Saison'},
    {mainSeasonMonths: allYear, currentSeasonStatus: 'Hauptsaison'},
    {mainSeasonMonths: [], secondarySeasonMonths: [], currentSeasonStatus: 'Keine_Saison'},
  ]);
  await job({});
  const writes = batches.flat();
  assert.deepEqual(writes, [{id: 'e0', fields: {currentSeasonStatus: 'Hauptsaison'}}]);
});

test('teilt viele Änderungen in Batches von höchstens 400', async () => {
  loadJob(Array.from({length: 950}, () => ({mainSeasonMonths: allYear})));
  await job({});
  assert.deepEqual(batches.map((b) => b.length), [400, 400, 150]);
});

test('ohne Änderungen wird kein Batch angelegt', async () => {
  loadJob([{mainSeasonMonths: allYear, currentSeasonStatus: 'Hauptsaison'}]);
  await job({});
  assert.equal(batches.length, 0);
});
