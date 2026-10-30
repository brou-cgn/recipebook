/**
 * Tests für den Import-Sweeper recoverStuckImportJobs (Tech-Check S21):
 * Neustarts zählen gegen ein eigenes Tageslimit je Autor, bei nicht prüfbarem
 * Zähler bleibt der Job unberührt (fail closed).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

let sweeper;
let quotaCount; // heutiger Zählerstand des Autors (null = noch kein Dokument)
let quotaFails;
let jobUpdates;
let importRuns;
let failures;
let finalized;

function loadSweeper(jobs) {
  require('./testSupport').purgeFunctionsCache();
  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/scheduler') return {onSchedule: (_o, handler) => handler};
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
        }
      }
      return {onCall: (_o, h) => h, onRequest: (_o, h) => h, HttpsError: MockHttpsError};
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h};
    }
    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => 'secret'})};
    }
    if (/^\.\.\/shared\/importJobs$/.test(request)) {
      return {
        isReelImportSource: () => false,
        runImportFromSource: async (source, authorId, jobId) => {
          importRuns.push({authorId, jobId});
          return {title: 'ok'};
        },
        finalizeImportJobBackground: async (jobId) => finalized.push(jobId),
        failImportJobBackground: async (jobId, authorId, error) => failures.push({jobId, code: error.code}),
      };
    }
    if (request === 'firebase-admin') {
      const docs = jobs.map((job) => ({
        id: job.id,
        data: () => job.data,
        ref: {update: async (fields) => jobUpdates.push({id: job.id, fields})},
      }));
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => ({empty: docs.length === 0, size: docs.length, docs}),
      };
      const db = {
        collection: (name) => (name === 'recipes' ?
          query :
          {doc: () => ({})}),
        runTransaction: async (fn) => {
          if (quotaFails) throw new Error('firestore down');
          return fn({
            get: async () => ({exists: quotaCount !== null, data: () => ({count: quotaCount})}),
            set: () => {},
            update: () => {},
          });
        },
      };
      const firestore = () => db;
      firestore.FieldValue = {delete: () => '__delete__', increment: (n) => n};
      return {
        apps: [{}],
        initializeApp: () => {},
        firestore,
        auth: () => ({}),
        storage: () => ({}),
        messaging: () => ({}),
      };
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  sweeper = require('./handlers/importScheduled').recoverStuckImportJobs;
  Module._load = originalLoad;
}

const job = (id, extra = {}) => ({
  id,
  data: {
    authorId: 'editor1',
    importStatus: 'processing',
    importAttempts: 0,
    importSource: {type: 'web', url: 'https://example.test/rezept'},
    ...extra,
  },
});

test.beforeEach(() => {
  quotaCount = null;
  quotaFails = false;
  jobUpdates = [];
  importRuns = [];
  failures = [];
  finalized = [];
});

test('unter dem Tageslimit wird der Job neu gestartet', async () => {
  quotaCount = 5;
  loadSweeper([job('j1')]);
  await sweeper({});
  assert.equal(importRuns.length, 1);
  assert.deepEqual(finalized, ['j1']);
  assert.equal(jobUpdates[0].fields.importAttempts, 1);
});

test('am Tageslimit wird der Job endgültig abgelehnt und nicht ausgeführt', async () => {
  quotaCount = 20;
  loadSweeper([job('j1')]);
  await sweeper({});
  assert.equal(importRuns.length, 0);
  assert.equal(jobUpdates.length, 0);
  assert.deepEqual(failures, [{jobId: 'j1', code: 'resource-exhausted'}]);
});

test('ist der Zähler nicht prüfbar, bleibt der Job unberührt (fail closed)', async () => {
  quotaFails = true;
  loadSweeper([job('j1')]);
  await sweeper({});
  assert.equal(importRuns.length, 0);
  assert.equal(jobUpdates.length, 0);
  assert.equal(failures.length, 0);
});

test('ein Job ohne importSource verbraucht kein Kontingent', async () => {
  quotaCount = 20;
  loadSweeper([job('j1', {importSource: null})]);
  await sweeper({});
  assert.equal(failures.length, 1);
  assert.equal(failures[0].code, 'failed-precondition');
  assert.equal(importRuns.length, 0);
});
