/**
 * Tests for the sendGroupInvitationEmail callable (Tech-Check S6, S16).
 *
 *  - Unauthenticated callers are rejected ("unauthenticated").
 *  - Callers below the edit role, incl. anonymous guests, are rejected
 *    ("permission-denied") and no mail is sent.
 *  - Each sender has a daily limit ("resource-exhausted").
 *  - Only the owner of a private list (or an admin) invites; the invitation is
 *    stored in groupInvitations, never in the list document (S16).
 *  - The response is identical for new, already invited and registered
 *    addresses, so the registration status is not revealed; mail is only sent
 *    to addresses that are neither registered nor invited.
 *  - Errors after the invitation was stored say so (details.gespeichert).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {isFirebaseAdminRequest, firebaseAdminModule} = require('./testSupport');

let sendGroupInvitationEmail;
let userRoles;
let registeredEmails;
let invitedEmails;
let quotaCount; // null → no call recorded today
let sentMails;
let groups;
let storedInvitations;
let failMail;

function loadFunction() {
  require('./testSupport').purgeFunctionsCache();

  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {
        constructor(code, message, details) {
          super(message);
          this.code = code;
          this.details = details;
        }
      }
      return {
        onCall: (_opts, handler) => handler,
        onRequest: (_opts, handler) => handler,
        HttpsError: MockHttpsError,
      };
    }
    if (request === 'firebase-functions/v2/firestore') {
      return {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h};
    }
    if (request === 'firebase-functions/v2/scheduler') {
      return {onSchedule: (_o, h) => h};
    }
    if (request === 'firebase-functions/params') {
      return {defineSecret: () => ({value: () => 'x'})};
    }
    if (request === '@google/genai') {
      return {GoogleGenAI: class {}};
    }
    if (/^\.\.?\/nutritionNormalization$/.test(request)) {
      return {
        createNutritionNormalizationUtils: () => ({parseIngredientForNutrition: () => null}),
      };
    }
    if (request === 'nodemailer') {
      return {
        createTransport: () => ({
          sendMail: async (opts) => {
            if (failMail) throw Object.assign(new Error('smtp down'), {code: 'ECONNECTION'});
            sentMails.push(opts.to);
            return {};
          },
        }),
      };
    }
    if (request === 'sharp') {
      return () => ({});
    }
    if (isFirebaseAdminRequest(request, parent)) {
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => ({
            get: async () => {
              if (name === 'invitations') {
                return {exists: invitedEmails.has(id), data: () => ({})};
              }
              if (name === 'groups') {
                return {exists: id in groups, data: () => groups[id]};
              }
              return {exists: false, data: () => ({})};
            },
            set: async (data) => {
              if (name === 'invitations') invitedEmails.add(id);
              if (name === 'groupInvitations') storedInvitations.push({id, ...data});
              if (name === 'groups') throw new Error('groups darf nicht beschrieben werden');
            },
          }),
        }),
        doc: (path) => ({
          get: async () => {
            const uid = path.replace(/^users\//, '');
            return uid in userRoles ?
              {exists: true, data: () => ({role: userRoles[uid]})} :
              {exists: false, data: () => ({})};
          },
        }),
        runTransaction: async (fn) => fn({
          get: async () => quotaCount === null ?
            {exists: false, data: () => ({})} :
            {exists: true, data: () => ({count: quotaCount})},
          set: (_ref, data) => {
            quotaCount = data.count;
          },
        }),
      });
      firestoreFactory.FieldValue = {serverTimestamp: () => ({}), increment: (n) => n};
      return firebaseAdminModule(request, {
        initializeApp: () => {},
        firestore: firestoreFactory,
        auth: () => ({
          getUserByEmail: async (email) => {
            if (registeredEmails.has(email)) return {uid: 'x'};
            const err = new Error('not found');
            err.code = 'auth/user-not-found';
            throw err;
          },
        }),
      });
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  sendGroupInvitationEmail = require('./index').sendGroupInvitationEmail;
  // Stubs bleiben aktiv: Handler laden sharp/nodemailer erst beim Aufruf (testSupport setzt zurück).
}

const EDITOR = {uid: 'editor1', token: {firebase: {sign_in_provider: 'password'}}};
const OTHER_EDITOR = {uid: 'editor2', token: {firebase: {sign_in_provider: 'password'}}};
const ADMIN = {uid: 'admin1', token: {firebase: {sign_in_provider: 'password'}}};
const GUEST = {uid: 'guest1', token: {firebase: {sign_in_provider: 'anonymous'}}};
const call = (auth, email = 'new@example.com', groupId = 'list1') =>
  sendGroupInvitationEmail({auth, data: {email, groupId}});

test.beforeEach(() => {
  userRoles = {editor1: 'edit', editor2: 'edit', admin1: 'admin', guest1: 'guest', reader1: 'read'};
  registeredEmails = new Set(['known@example.com']);
  invitedEmails = new Set(['invited@example.com']);
  quotaCount = null;
  sentMails = [];
  groups = {
    list1: {type: 'private', ownerId: 'editor1', memberIds: ['editor1', 'editor2']},
    pub: {type: 'public', ownerId: null, memberIds: []},
  };
  storedInvitations = [];
  failMail = false;
  loadFunction();
});

test('rejects unauthenticated callers', async () => {
  await assert.rejects(call(null), {code: 'unauthenticated'});
  assert.equal(sentMails.length, 0);
});

test('rejects anonymous guests and roles below edit', async () => {
  await assert.rejects(call(GUEST), {code: 'permission-denied'});
  await assert.rejects(
      call({uid: 'reader1', token: {firebase: {sign_in_provider: 'password'}}}),
      {code: 'permission-denied'},
  );
  await assert.rejects(
      call({uid: 'unknown', token: {firebase: {sign_in_provider: 'password'}}}),
      {code: 'permission-denied'},
  );
  assert.equal(sentMails.length, 0);
});

test('sends a mail for a new address and answers only { success: true }', async () => {
  const result = await call(EDITOR);
  assert.deepEqual(result, {success: true});
  assert.deepEqual(sentMails, ['new@example.com']);
});

test('stores the invitation in groupInvitations with list, address and inviter (S16)', async () => {
  await call(EDITOR, ' New@Example.com ');
  assert.equal(storedInvitations.length, 1);
  const [invitation] = storedInvitations;
  assert.equal(invitation.groupId, 'list1');
  assert.equal(invitation.email, 'new@example.com');
  assert.equal(invitation.invitedBy, 'editor1');
  assert.match(invitation.id, /^[0-9a-f]{64}$/);
});

test('stores the invitation also for an already invited address, but not for a registered one', async () => {
  await call(EDITOR, 'invited@example.com');
  await call(EDITOR, 'known@example.com');
  assert.deepEqual(storedInvitations.map((i) => i.email), ['invited@example.com']);
  assert.deepEqual(sentMails, []);
});

test('only the owner of a private list or an admin may invite (S16)', async () => {
  await assert.rejects(call(OTHER_EDITOR), {code: 'permission-denied'});
  await assert.rejects(call(EDITOR, 'new@example.com', 'pub'), {code: 'failed-precondition'});
  await assert.rejects(call(EDITOR, 'new@example.com', 'missing'), {code: 'not-found'});
  await assert.rejects(call(EDITOR, 'new@example.com', null), {code: 'invalid-argument'});
  assert.deepEqual(storedInvitations, []);
  assert.deepEqual(sentMails, []);

  assert.deepEqual(await call(ADMIN), {success: true});
  assert.deepEqual(storedInvitations.map((i) => i.invitedBy), ['admin1']);
});

test('a failed mail reports that the invitation is stored', async () => {
  failMail = true;
  await assert.rejects(call(EDITOR), (err) => {
    assert.equal(err.code, 'internal');
    assert.deepEqual(err.details, {gespeichert: true});
    return true;
  });
  assert.equal(storedInvitations.length, 1);
});

test('answers identically for registered and already invited addresses, without mail', async () => {
  const fresh = await call(EDITOR, 'other@example.com');
  const registered = await call(EDITOR, 'known@example.com');
  const invited = await call(EDITOR, 'invited@example.com');
  assert.deepEqual(registered, fresh);
  assert.deepEqual(invited, fresh);
  assert.deepEqual(sentMails, ['other@example.com']);
});

test('refuses once the daily limit is used up', async () => {
  quotaCount = 20;
  await assert.rejects(call(EDITOR), {code: 'resource-exhausted'});
  assert.equal(sentMails.length, 0);
});
