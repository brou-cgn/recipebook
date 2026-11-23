const test = require('node:test');
const assert = require('node:assert/strict');
const {
  acceptInvitations, assertCanInvite, invitationId, migrateLegacyInvitedEmails, recordInvitation,
} = require('./groupInvitations');

class FakeHttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const DOC_ID = Symbol('documentId');
const TS = 'serverTimestamp';
const FieldValue = {
  serverTimestamp: () => TS,
  arrayUnion: (...values) => ({arrayUnion: values}),
  delete: () => ({deleteField: true}),
};
const FieldPath = {documentId: () => DOC_ID};

/** Minimaler Firestore-Ersatz: Pfad -> Daten; where, orderBy(documentId), select, limit, Batches. */
const makeDb = (seed = {}) => {
  const store = new Map(Object.entries(seed).map(([path, data]) => [path, structuredClone(data)]));
  const reads = [];
  const ref = (path) => ({
    path,
    id: path.split('/').pop(),
    get: async () => {
      reads.push(path);
      return snapshot(path);
    },
    set: async (data) => {
      store.set(path, applyWrite({}, data));
    },
  });
  const snapshot = (path, fields = null) => {
    const data = store.get(path);
    const view = data && fields ?
      Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key))) :
      data;
    return {id: path.split('/').pop(), ref: ref(path), exists: data !== undefined, data: () => view};
  };
  const applyWrite = (current, data) => {
    const next = {...current};
    for (const [key, value] of Object.entries(data)) {
      if (value && value.deleteField) delete next[key];
      else if (value && value.arrayUnion) next[key] = [...new Set([...(next[key] || []), ...value.arrayUnion])];
      else next[key] = value;
    }
    return next;
  };
  const docsOf = (collection) => [...store.keys()]
      .filter((path) => path.startsWith(`${collection}/`) && !path.slice(collection.length + 1).includes('/'))
      .sort();
  const query = (collection, state) => ({
    where: (field, op, value) => query(collection, {...state, filters: [...state.filters, {field, op, value}]}),
    orderBy: (field) => query(collection, {...state, orderBy: field}),
    select: (...fields) => query(collection, {...state, fields}),
    limit: (n) => query(collection, {...state, limit: n}),
    startAfter: (doc) => query(collection, {...state, after: doc.id}),
    doc: (id) => ref(`${collection}/${id}`),
    get: async () => {
      reads.push(`${collection}?`);
      let paths = docsOf(collection).filter((path) => state.filters.every(({field, op, value}) => {
        const actual = store.get(path)[field];
        if (op === '==') return actual === value;
        if (op === 'array-contains') return Array.isArray(actual) && actual.includes(value);
        throw new Error(`op ${op}`);
      }));
      if (state.orderBy !== undefined && state.orderBy !== DOC_ID) throw new Error('nur orderBy(documentId)');
      if (state.after) paths = paths.filter((path) => path.split('/').pop() > state.after);
      if (state.limit) paths = paths.slice(0, state.limit);
      return {docs: paths.map((path) => snapshot(path, state.fields || null))};
    },
  });
  return {
    store,
    reads,
    batches: 0,
    collection: (name) => query(name, {filters: []}),
    batch() {
      this.batches += 1;
      const ops = [];
      return {
        set: (r, data) => ops.push(() => store.set(r.path, applyWrite({}, data))),
        update: (r, data) => ops.push(() => {
          if (!store.has(r.path)) throw new Error(`update auf fehlendes Dokument ${r.path}`);
          store.set(r.path, applyWrite(store.get(r.path), data));
        }),
        delete: (r) => ops.push(() => store.delete(r.path)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
};

const invitationPath = (groupId, email) => `groupInvitations/${invitationId(groupId, email)}`;

test('assertCanInvite: nur der Eigentümer einer privaten Liste, Admins auch', async () => {
  const db = makeDb({
    'groups/g1': {type: 'private', ownerId: 'anna', memberIds: ['anna', 'ben']},
    'groups/pub': {type: 'public', ownerId: null, memberIds: []},
    'groups/fuerDichEntdeckt_anna': {type: 'private', ownerId: 'anna', systemKey: 'fuerDichEntdeckt'},
  });
  await assert.doesNotReject(assertCanInvite(db, FakeHttpsError, {groupId: 'g1', userId: 'anna', isAdmin: false}));
  await assert.doesNotReject(assertCanInvite(db, FakeHttpsError, {groupId: 'g1', userId: 'admin', isAdmin: true}));
  await assert.rejects(
      assertCanInvite(db, FakeHttpsError, {groupId: 'g1', userId: 'ben', isAdmin: false}),
      {code: 'permission-denied'},
  );
  await assert.rejects(
      assertCanInvite(db, FakeHttpsError, {groupId: 'pub', userId: 'anna', isAdmin: true}),
      {code: 'failed-precondition'},
  );
  await assert.rejects(
      assertCanInvite(db, FakeHttpsError, {groupId: 'fuerDichEntdeckt_anna', userId: 'anna', isAdmin: false}),
      {code: 'failed-precondition'},
  );
  await assert.rejects(
      assertCanInvite(db, FakeHttpsError, {groupId: 'weg', userId: 'anna', isAdmin: false}),
      {code: 'not-found'},
  );
  for (const groupId of [undefined, '', 'a/b', 42]) {
    await assert.rejects(
        assertCanInvite(db, FakeHttpsError, {groupId, userId: 'anna', isAdmin: false}),
        {code: 'invalid-argument'},
    );
  }
});

test('recordInvitation: ein Dokument je Liste und Adresse, Adresse normalisiert, nicht in der Liste', async () => {
  const db = makeDb({'groups/g1': {type: 'private', ownerId: 'anna', memberIds: ['anna']}});
  await recordInvitation(db, {FieldValue}, {groupId: 'g1', email: ' Neu@Example.com ', invitedBy: 'anna'});
  await recordInvitation(db, {FieldValue}, {groupId: 'g1', email: 'neu@example.com', invitedBy: 'anna'});
  const invitations = [...db.store.keys()].filter((path) => path.startsWith('groupInvitations/'));
  assert.deepEqual(invitations, [invitationPath('g1', 'neu@example.com')]);
  assert.deepEqual(db.store.get(invitations[0]),
      {groupId: 'g1', email: 'neu@example.com', invitedBy: 'anna', createdAt: TS});
  assert.equal('invitedEmails' in db.store.get('groups/g1'), false);
});

test('invitationId verträgt Zeichen, die in einer Dokument-ID nicht gehen', () => {
  const id = invitationId('g1', 'a/b@example.com');
  assert.match(id, /^[0-9a-f]{64}$/);
  assert.notEqual(id, invitationId('g2', 'a/b@example.com'));
});

test('acceptInvitations: nimmt in alle eingeladenen Listen auf und löscht die Einladungen', async () => {
  const db = makeDb({
    'groups/g1': {type: 'private', ownerId: 'anna', memberIds: ['anna']},
    'groups/g2': {type: 'private', ownerId: 'ben', memberIds: ['ben']},
    'groups/g3': {type: 'private', ownerId: 'cleo', memberIds: ['cleo']},
    [invitationPath('g1', 'neu@example.com')]: {groupId: 'g1', email: 'neu@example.com'},
    [invitationPath('g2', 'neu@example.com')]: {groupId: 'g2', email: 'neu@example.com'},
    // Liste inzwischen gelöscht: Einladung wird trotzdem entfernt, ohne Fehler im Batch.
    [invitationPath('weg', 'neu@example.com')]: {groupId: 'weg', email: 'neu@example.com'},
    [invitationPath('g3', 'andere@example.com')]: {groupId: 'g3', email: 'andere@example.com'},
  });
  const result = await acceptInvitations(db, {FieldValue}, {userId: 'neu', email: 'Neu@Example.com'});
  assert.deepEqual(result, {groups: 2, invitations: 3});
  assert.deepEqual(db.store.get('groups/g1').memberIds, ['anna', 'neu']);
  assert.deepEqual(db.store.get('groups/g2').memberIds, ['ben', 'neu']);
  assert.deepEqual(db.store.get('groups/g3').memberIds, ['cleo']);
  assert.equal(db.store.get('groups/g1').updatedAt, TS);
  assert.equal(db.store.has(invitationPath('g1', 'neu@example.com')), false);
  assert.equal(db.store.has(invitationPath('weg', 'neu@example.com')), false);
  assert.equal(db.store.has(invitationPath('g3', 'andere@example.com')), true);
  assert.equal(db.store.has('groups/weg'), false);
});

test('acceptInvitations: liest übergangsweise das alte Feld und entfernt nur die eigene Adresse', async () => {
  const db = makeDb({
    'groups/alt1': {type: 'private', ownerId: 'anna', memberIds: ['anna'],
      invitedEmails: ['neu@example.com', 'andere@example.com']},
    'groups/alt2': {type: 'private', ownerId: 'anna', memberIds: ['anna'], invitedEmails: ['neu@example.com']},
    // In beiden Formen eingeladen: eine Aktualisierung, Mitglied nur einmal.
    'groups/beides': {type: 'private', ownerId: 'ben', memberIds: ['ben'], invitedEmails: ['neu@example.com']},
    [invitationPath('beides', 'neu@example.com')]: {groupId: 'beides', email: 'neu@example.com'},
  });
  const result = await acceptInvitations(db, {FieldValue}, {userId: 'neu', email: 'neu@example.com'});
  assert.deepEqual(result, {groups: 3, invitations: 1});
  assert.deepEqual(db.store.get('groups/alt1').memberIds, ['anna', 'neu']);
  assert.deepEqual(db.store.get('groups/alt1').invitedEmails, ['andere@example.com']);
  assert.equal('invitedEmails' in db.store.get('groups/alt2'), false);
  assert.deepEqual(db.store.get('groups/beides').memberIds, ['ben', 'neu']);
  assert.equal('invitedEmails' in db.store.get('groups/beides'), false);
  assert.equal(db.store.has(invitationPath('beides', 'neu@example.com')), false);
});

test('acceptInvitations: ohne Einladung oder ohne Adresse passiert nichts', async () => {
  const db = makeDb({'groups/g1': {type: 'private', ownerId: 'anna', memberIds: ['anna']}});
  assert.deepEqual(await acceptInvitations(db, {FieldValue}, {userId: 'neu', email: 'neu@example.com'}),
      {groups: 0, invitations: 0});
  assert.deepEqual(await acceptInvitations(db, {FieldValue}, {userId: 'neu', email: ''}), {groups: 0, invitations: 0});
  assert.deepEqual(db.store.get('groups/g1').memberIds, ['anna']);
});

test('migrateLegacyInvitedEmails: verlagert das alte Feld seitenweise und ist wiederholbar', async () => {
  const db = makeDb({
    'groups/a': {type: 'private', ownerId: 'anna', memberIds: ['anna'], invitedEmails: ['Eins@Example.com ', 'zwei@example.com']},
    'groups/b': {type: 'private', ownerId: 'anna', memberIds: ['anna']},
    'groups/c': {type: 'private', ownerId: 'ben', memberIds: ['ben'], invitedEmails: []},
    'groups/d': {type: 'public', ownerId: null, memberIds: [], invitedEmails: ['drei@example.com']},
    'groups/e': {type: 'private', ownerId: 'ben', memberIds: ['ben'], invitedEmails: ['eins@example.com']},
  });
  const result = await migrateLegacyInvitedEmails(db, {FieldValue, FieldPath}, {pageSize: 2});
  assert.deepEqual(result, {checked: 5, groups: 4, invitations: 4});
  for (const id of ['a', 'c', 'd', 'e']) {
    assert.equal('invitedEmails' in db.store.get(`groups/${id}`), false, `groups/${id} hat noch invitedEmails`);
  }
  assert.deepEqual(db.store.get('groups/a').memberIds, ['anna']);
  assert.deepEqual(db.store.get(invitationPath('a', 'eins@example.com')),
      {groupId: 'a', email: 'eins@example.com', invitedBy: null, createdAt: TS});
  for (const [groupId, email] of [['a', 'zwei@example.com'], ['d', 'drei@example.com'], ['e', 'eins@example.com']]) {
    assert.equal(db.store.has(invitationPath(groupId, email)), true, `${groupId}/${email} fehlt`);
  }

  // Zweiter Lauf: nichts mehr zu tun, keine Schreibvorgänge.
  const batchesBefore = db.batches;
  assert.deepEqual(await migrateLegacyInvitedEmails(db, {FieldValue, FieldPath}, {pageSize: 2}),
      {checked: 5, groups: 0, invitations: 0});
  assert.equal(db.batches, batchesBefore);
});

test('Ende zu Ende: Migration, danach Registrierung nimmt in die Liste auf', async () => {
  const db = makeDb({
    'groups/g1': {type: 'private', ownerId: 'anna', memberIds: ['anna'], invitedEmails: ['neu@example.com']},
  });
  await migrateLegacyInvitedEmails(db, {FieldValue, FieldPath});
  const result = await acceptInvitations(db, {FieldValue}, {userId: 'neu', email: 'neu@example.com'});
  assert.deepEqual(result, {groups: 1, invitations: 1});
  assert.deepEqual(db.store.get('groups/g1'), {type: 'private', ownerId: 'anna', memberIds: ['anna', 'neu'], updatedAt: TS});
  assert.equal([...db.store.keys()].some((path) => path.startsWith('groupInvitations/')), false);
});
