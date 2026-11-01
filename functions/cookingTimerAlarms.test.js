const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CLAIM_MS,
  GRACE_MS,
  STALE_MS,
  WINDOW_MS,
  buildTimerAlarmMessage,
  processDueCookingTimerAlarms,
} = require('./cookingTimerAlarms');

const NOW = 1_800_000_000_000;
const ts = (ms) => ({toMillis: () => ms, ms});

/**
 * Nachgebautes Firestore mit cookingTimerAlarms und users, dazu firebase-admin mit
 * aufgezeichnetem Versand.
 */
function fakes({alarms = {}, users = {}, sendError = null} = {}) {
  const store = {alarms: new Map(Object.entries(alarms)), users: new Map(Object.entries(users))};
  const log = {sent: [], deleted: [], userUpdates: [], query: null};
  const alarmRef = (id) => ({
    id,
    get: async () => ({exists: store.alarms.has(id), data: () => store.alarms.get(id)}),
    update: async (patch) => store.alarms.set(id, {...store.alarms.get(id), ...patch}),
    delete: async () => {
      log.deleted.push(id);
      store.alarms.delete(id);
    },
  });
  const userRef = (uid) => ({
    get: async () => ({exists: store.users.has(uid), data: () => store.users.get(uid)}),
    update: async (patch) => log.userUpdates.push({uid, patch}),
  });
  const db = {
    collection: (name) => {
      if (name === 'users') return {doc: userRef};
      assert.equal(name, 'cookingTimerAlarms');
      const q = {where: null, orderBy: null, limit: null};
      const query = {
        where: (field, op, value) => {
          q.where = [field, op, value.ms];
          return query;
        },
        orderBy: (field) => {
          q.orderBy = field;
          return query;
        },
        limit: (n) => {
          q.limit = n;
          return query;
        },
        get: async () => {
          log.query = q;
          const docs = [...store.alarms.entries()]
              .filter(([, a]) => a.dueAt.toMillis() <= q.where[2])
              .sort(([, a], [, b]) => a.dueAt.toMillis() - b.dueAt.toMillis())
              .slice(0, q.limit)
              .map(([id]) => ({id, ref: alarmRef(id)}));
          return {docs};
        },
      };
      return query;
    },
    runTransaction: async (fn) => fn({get: (ref) => ref.get(), update: (ref, patch) => ref.update(patch)}),
  };
  const admin = {
    firestore: {
      Timestamp: {fromMillis: ts},
      FieldValue: {arrayRemove: (value) => ({arrayRemove: value})},
    },
    messaging: () => ({
      send: async (message) => {
        if (sendError) throw sendError;
        log.sent.push(message);
        return 'message-id';
      },
    }),
  };
  return {admin, db, store, log};
}

/** Uhr für Tests: steht still; sleep zeichnet die Wartezeit auf und kann etwas dazwischen tun. */
function clock(onSleep = () => {}) {
  const waits = [];
  return {
    waits,
    now: () => NOW,
    sleep: async (ms) => {
      waits.push(ms);
      await onSleep(ms);
    },
  };
}

const alarm = (dueAt, extra = {}) => ({
  uid: 'u1', token: 'tok-1', body: 'Rinderrouladen: 90 Minuten', dueAt: ts(dueAt), ...extra,
});
const owner = {u1: {timerPushTokens: ['tok-1']}};

test('sends a due alarm to the starting device at its end time and removes it', async () => {
  const {admin, db, log, store} = fakes({alarms: {a1: alarm(NOW + 20_000)}, users: owner});
  const c = clock();

  assert.equal(await processDueCookingTimerAlarms(admin, db, c), 1);

  assert.deepEqual(c.waits, [20_000 + GRACE_MS]);
  assert.equal(log.sent.length, 1);
  assert.deepEqual(log.sent[0], buildTimerAlarmMessage('a1', alarm(NOW + 20_000)));
  assert.equal(log.sent[0].token, 'tok-1');
  assert.equal(log.sent[0].data.type, 'cooking_timer');
  assert.equal(log.sent[0].data.title, 'Timer abgelaufen!');
  assert.equal(log.sent[0].data.body, 'Rinderrouladen: 90 Minuten');
  assert.equal(log.sent[0].data.notificationId, 'timer-a1');
  assert.equal(log.sent[0].webpush.headers.Urgency, 'high');
  assert.equal(store.alarms.has('a1'), false);
});

test('only takes alarms that fall due before the next run', async () => {
  const later = alarm(NOW + 2 * 60 * 1000);
  const {admin, db, log, store} = fakes({alarms: {soon: alarm(NOW + 10_000), later}, users: owner});

  await processDueCookingTimerAlarms(admin, db, clock());

  assert.deepEqual(log.query, {where: ['dueAt', '<=', NOW + WINDOW_MS - GRACE_MS], orderBy: 'dueAt', limit: 200});
  assert.deepEqual(log.sent.map((m) => m.data.notificationId), ['timer-soon']);
  assert.deepEqual(store.alarms.get('later'), later);
});

test('sends nothing when the app removed the alarm during the wait', async () => {
  // Timer gestoppt, oder er lief bei offener App ab und klingelte dort
  const {admin, db, log, store} = fakes({alarms: {a1: alarm(NOW + 20_000)}, users: owner});
  const c = clock(() => store.alarms.delete('a1'));

  assert.equal(await processDueCookingTimerAlarms(admin, db, c), 0);
  assert.equal(log.sent.length, 0);
});

test('sends only to a token in the owner\'s own timerPushTokens', async () => {
  const {admin, db, log, store} = fakes({
    alarms: {a1: alarm(NOW + 5_000, {token: 'fremd'})},
    users: owner,
  });

  assert.equal(await processDueCookingTimerAlarms(admin, db, clock()), 0);
  assert.equal(log.sent.length, 0);
  assert.equal(store.alarms.has('a1'), false);
});

test('sends an overdue alarm at once and drops one that is too old to help', async () => {
  const {admin, db, log, store} = fakes({
    alarms: {late: alarm(NOW - 60_000), stale: alarm(NOW - STALE_MS - 1)},
    users: owner,
  });
  const c = clock();

  assert.equal(await processDueCookingTimerAlarms(admin, db, c), 1);
  assert.deepEqual(c.waits, []);
  assert.deepEqual(log.sent.map((m) => m.data.notificationId), ['timer-late']);
  assert.equal(store.alarms.has('stale'), false);
});

test('leaves an alarm to the run that claimed it, but takes over a stuck claim', async () => {
  const {admin, db, log} = fakes({
    alarms: {
      busy: alarm(NOW + 5_000, {claimedAt: ts(NOW - 30_000)}),
      stuck: alarm(NOW - 5_000, {claimedAt: ts(NOW - CLAIM_MS - 1)}),
    },
    users: owner,
  });

  await processDueCookingTimerAlarms(admin, db, clock());

  assert.deepEqual(log.sent.map((m) => m.data.notificationId), ['timer-stuck']);
});

test('forgets a token FCM no longer knows', async () => {
  const error = Object.assign(new Error('gone'), {code: 'messaging/registration-token-not-registered'});
  const {admin, db, log, store} = fakes({alarms: {a1: alarm(NOW)}, users: owner, sendError: error});

  assert.equal(await processDueCookingTimerAlarms(admin, db, clock()), 0);
  assert.deepEqual(log.userUpdates, [{uid: 'u1', patch: {timerPushTokens: {arrayRemove: 'tok-1'}}}]);
  assert.equal(store.alarms.has('a1'), false);
});

test('keeps the alarm for a later retry when sending fails otherwise, without throwing', async () => {
  const {admin, db, store} = fakes({alarms: {a1: alarm(NOW)}, users: owner, sendError: new Error('boom')});
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await processDueCookingTimerAlarms(admin, db, clock()), 0);
  } finally {
    console.error = originalError;
  }
  assert.equal(store.alarms.has('a1'), true);
  assert.equal(store.alarms.get('a1').claimedAt.toMillis(), NOW);
});
