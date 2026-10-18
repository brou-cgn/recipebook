/* eslint-disable require-jsdoc */

const test = require('node:test');
const assert = require('node:assert/strict');
const {fetchFirestoreDailyUsage, buildFirestoreUsageSection} = require('./firestoreUsage');

const NOW = new Date('2026-10-18T01:00:00Z');

// Antwort von timeSeries.list: ein Punkt je Tag, Fensterende = Mitternacht danach.
function seriesFor(valuesByDay) {
  return {
    timeSeries: [{
      points: Object.entries(valuesByDay).map(([day, value]) => {
        const end = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString();
        return {interval: {startTime: `${day}T00:00:00Z`, endTime: end}, value: {int64Value: String(value)}};
      }),
    }],
  };
}

function fakeFetch(responsesByMetric, calls = []) {
  return async (url, options) => {
    calls.push({url, options});
    const filter = new URL(url).searchParams.get('filter');
    const metric = Object.keys(responsesByMetric).find((name) => filter.includes(name));
    if (!metric) return {ok: false, status: 404, json: async () => ({})};
    return {ok: true, status: 200, json: async () => responsesByMetric[metric]};
  };
}

test('fetchFirestoreDailyUsage sums per UTC day, newest first, missing days as 0', async () => {
  const calls = [];
  const rows = await fetchFirestoreDailyUsage({
    projectId: 'demo-project',
    getAccessToken: async () => ({access_token: 'token-1'}),
    now: NOW,
    days: 3,
    fetchImpl: fakeFetch({
      'document/read_count': seriesFor({'2026-10-17': 1200, '2026-10-15': 300}),
      'document/write_count': seriesFor({'2026-10-17': 40}),
      'document/delete_count': {},
    }, calls),
  });

  assert.deepEqual(rows, [
    {day: '2026-10-17', reads: 1200, writes: 40, deletes: 0},
    {day: '2026-10-16', reads: 0, writes: 0, deletes: 0},
    {day: '2026-10-15', reads: 300, writes: 0, deletes: 0},
  ]);
  assert.equal(calls.length, 3);
  const params = new URL(calls[0].url).searchParams;
  assert.match(calls[0].url, /\/projects\/demo-project\/timeSeries\?/);
  assert.equal(params.get('interval.startTime'), '2026-10-15T00:00:00.000Z');
  assert.equal(params.get('interval.endTime'), '2026-10-18T00:00:00.000Z');
  assert.equal(params.get('aggregation.alignmentPeriod'), '86400s');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
});

test('fetchFirestoreDailyUsage throws on an HTTP error with Google\'s message and the status', async () => {
  await assert.rejects(
      fetchFirestoreDailyUsage({
        projectId: 'demo-project',
        getAccessToken: async () => ({access_token: 'token-1'}),
        now: NOW,
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          json: async () => ({error: {message: 'Cloud Monitoring API has not been used in project demo-project'}}),
        }),
      }),
      (error) => {
        assert.equal(error.status, 403);
        assert.match(error.message, /HTTP 403 \(Cloud Monitoring API has not been used/);
        return true;
      },
  );
});

test('fetchFirestoreDailyUsage throws without project id', async () => {
  await assert.rejects(
      fetchFirestoreDailyUsage({projectId: '', getAccessToken: async () => ({access_token: 'x'})}),
      /Projekt-ID/,
  );
});

test('buildFirestoreUsageSection shows peak, average and free-tier share', () => {
  const section = buildFirestoreUsageSection({rows: [
    {day: '2026-10-17', reads: 25000, writes: 2000, deletes: 10},
    {day: '2026-10-16', reads: 5000, writes: 100, deletes: 0},
  ]});

  assert.match(section.text, /Spitze 25\.000 am 2026-10-17 \(50 % des Gratis-Kontingents/);
  assert.match(section.text, /Schnitt 15\.000\/Tag/);
  assert.match(section.text, /2026-10-16 \| 5\.000 \| 100 \| 0/);
  assert.match(section.html, /25\.000 \(50 %\)/);
  assert.match(section.html, /2\.000 \(10 %\)/);
});

test('buildFirestoreUsageSection names role and API only for a 403', () => {
  const section = buildFirestoreUsageSection({error: 'Cloud Monitoring antwortete mit HTTP 403', status: 403});

  assert.match(section.text, /Nicht verfügbar: Cloud Monitoring antwortete mit HTTP 403\./);
  assert.match(section.text, /roles\/monitoring\.viewer/);
  assert.match(section.text, /Cloud Monitoring API/);
  assert.match(section.html, /Nicht verfügbar/);
});

test('buildFirestoreUsageSection gives only the reason for other failures (e.g. timeout)', () => {
  const section = buildFirestoreUsageSection({error: 'The operation was aborted due to timeout'});

  assert.match(section.text, /Nicht verfügbar: The operation was aborted due to timeout\./);
  assert.doesNotMatch(section.text, /Monitoring-Betrachter/);
});
