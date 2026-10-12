/* eslint-disable require-jsdoc */
/**
 * Tests for the sendGroupInvitationEmail callable (Tech-Check S6).
 *
 *  - Unauthenticated callers are rejected ("unauthenticated").
 *  - Callers below the edit role, incl. anonymous guests, are rejected
 *    ("permission-denied") and no mail is sent.
 *  - Each sender has a daily limit ("resource-exhausted").
 *  - The response is identical for new, already invited and registered
 *    addresses, so the registration status is not revealed; mail is only sent
 *    to addresses that are neither registered nor invited.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

let sendGroupInvitationEmail;
let userRoles;
let registeredEmails;
let invitedEmails;
let quotaCount; // null → no call recorded today
let sentMails;

function loadFunction() {
  delete require.cache[require.resolve('./index')];

  const Module = require('module');
  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain, ...args) {
    if (request === 'firebase-functions/v2/https') {
      class MockHttpsError extends Error {
        constructor(code, message) {
          super(message);
          this.code = code;
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
    if (request === '@google/generative-ai') {
      return {GoogleGenerativeAI: class {}};
    }
    if (request === './nutritionNormalization') {
      return {
        createNutritionNormalizationUtils: () => ({parseIngredientForNutrition: () => null}),
      };
    }
    if (request === 'nodemailer') {
      return {
        createTransport: () => ({
          sendMail: async (opts) => {
            sentMails.push(opts.to);
            return {};
          },
        }),
      };
    }
    if (request === 'sharp') {
      return () => ({});
    }
    if (request === 'firebase-admin') {
      const firestoreFactory = () => ({
        collection: (name) => ({
          doc: (id) => ({
            get: async () => {
              if (name === 'invitations') {
                return {exists: invitedEmails.has(id), data: () => ({})};
              }
              return {exists: false, data: () => ({})};
            },
            set: async () => {
              if (name === 'invitations') invitedEmails.add(id);
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
      return {
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
      };
    }
    return originalLoad.call(this, request, parent, isMain, ...args);
  };

  sendGroupInvitationEmail = require('./index').sendGroupInvitationEmail;
  Module._load = originalLoad;
}

const EDITOR = {uid: 'editor1', token: {firebase: {sign_in_provider: 'password'}}};
const GUEST = {uid: 'guest1', token: {firebase: {sign_in_provider: 'anonymous'}}};
const call = (auth, email = 'new@example.com') =>
  sendGroupInvitationEmail({auth, data: {email}});

test.beforeEach(() => {
  userRoles = {editor1: 'edit', guest1: 'guest', reader1: 'read'};
  registeredEmails = new Set(['known@example.com']);
  invitedEmails = new Set(['invited@example.com']);
  quotaCount = null;
  sentMails = [];
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
