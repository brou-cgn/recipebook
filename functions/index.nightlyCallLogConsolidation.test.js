/**
 * Tests für die geplante Function nightlyCallLogConsolidation (Tech-Check K2):
 * Trend-Zeitfenster aus settings/app, vorsichtiger Ersatzwert, wenn die
 * Einstellungen nicht lesbar sind, und ein Fehler macht den Lauf rot. Die
 * Konsolidierung selbst prüft callLogConsolidation.test.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

let calls;
let settings; // Daten von settings/app, null = Dokument fehlt, 'fail' = Lesen scheitert
let results;
let logged;

function loadHandler() {
  require('./testSupport').purgeFunctionsCache();
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/scheduler') return {onSchedule: (_o, handler) => handler};
    if (request === 'firebase-functions/v2/https') {
      return {onCall: (_o, h) => h, onRequest: (_o, h) => h, HttpsError: class extends Error {}};
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h};
    }
    if (request === 'firebase-functions/v2/storage') return {onObjectFinalized: (_o, h) => h};
    if (request === 'firebase-functions/params') return {defineSecret: () => ({value: () => ''})};
    if (request === '../callLogConsolidation') {
      const real = originalLoad.call(this, request, parent, isMain, ...args);
      return {
        ...real,
        consolidateCallLogs: async (deps) => {
          calls.push(deps);
          return {currentYear: 2026, results};
        },
      };
    }
    if (isFirebaseAdminRequest(request, parent)) {
      const db = {
        doc: (path) => ({
          get: async () => {
            assert.equal(path, 'settings/app');
            if (settings === 'fail') throw new Error('firestore down');
            return {exists: settings !== null, data: () => settings};
          },
        }),
      };
      const firestore = () => db;
      firestore.FieldValue = {increment: (n) => n, serverTimestamp: () => 'ts'};
      return firebaseAdminModule(request, {initializeApp: () => {}, firestore, auth: () => ({}), storage: () => ({}), messaging: () => ({})});
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };
  try {
    return require('./index').nightlyCallLogConsolidation;
  } finally {
    Module._load = originalLoad;
  }
}

const row = (source, extra = {}) => ({
  source, dayCutoff: new Date('2026-11-16T23:00:00Z'), monthCutoff: new Date('2026-10-31T23:00:00Z'),
  consolidated: 3, foldedDays: 0, foldedMonths: 0,
  complete: true, failed: false, timedOut: false, error: null, ...extra,
});

function captureConsole() {
  const original = {log: console.log, warn: console.warn, error: console.error};
  for (const level of Object.keys(original)) {
    console[level] = (...args) => logged.push({level, text: args.join(' ')});
  }
  return () => Object.assign(console, original);
}

test.beforeEach(() => {
  calls = [];
  settings = {trendingDays: 45};
  results = [row('appCalls'), row('recipeCalls')];
  logged = [];
});

test('übernimmt das Trend-Zeitfenster aus settings/app und setzt ein Zeitbudget unter dem Timeout', async () => {
  const handler = loadHandler();
  const restore = captureConsole();
  try {
    const before = Date.now();
    await handler({});
    assert.equal(calls.length, 1);
    assert.equal(calls[0].trendingDays, 45);
    assert.ok(calls[0].deadline >= before + 480 * 1000 && calls[0].deadline <= Date.now() + 480 * 1000);
  } finally {
    restore();
  }
  assert.ok(logged.some(({level, text}) => level === 'log' && text.includes('appCalls: 3 Einzelaufrufe vor 17.11.2026')));
});

test('ohne Einstellung gelten 30 Tage wie im Client', async () => {
  settings = null;
  const handler = loadHandler();
  const restore = captureConsole();
  try {
    await handler({});
  } finally {
    restore();
  }
  assert.equal(calls[0].trendingDays, 30);
});

test('sind die Einstellungen nicht lesbar, bleibt mehr als ein Jahr roh', async () => {
  settings = 'fail';
  const handler = loadHandler();
  const restore = captureConsole();
  try {
    await handler({});
  } finally {
    restore();
  }
  assert.equal(calls[0].trendingDays, 366);
  assert.ok(logged.some(({level}) => level === 'warn'));
});

test('ein Fehler in einem Protokoll macht den Lauf rot', async () => {
  results = [row('appCalls', {complete: false, failed: true, error: 'kaputt'}), row('recipeCalls')];
  const handler = loadHandler();
  const restore = captureConsole();
  try {
    await assert.rejects(handler({}), /appCalls/);
  } finally {
    restore();
  }
  assert.ok(logged.some(({level}) => level === 'error'));
});

test('ein Fehler zählt auch, wenn danach das Zeitbudget ausging', async () => {
  results = [row('appCalls', {complete: false, failed: true, timedOut: true, error: 'kaputt; Zeitbudget erschöpft'})];
  const handler = loadHandler();
  const restore = captureConsole();
  try {
    await assert.rejects(handler({}), /appCalls/);
  } finally {
    restore();
  }
});

test('ein erschöpftes Zeitbudget ist kein Fehler, nur eine Warnung', async () => {
  results = [row('appCalls', {complete: false, timedOut: true, error: 'Zeitbudget erschöpft'}), row('recipeCalls')];
  const handler = loadHandler();
  const restore = captureConsole();
  try {
    await handler({});
  } finally {
    restore();
  }
  assert.ok(logged.some(({level, text}) => level === 'warn' && text.includes('unvollständig')));
});
