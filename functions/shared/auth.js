/**
 * Von mehreren Function-Gruppen genutzte Helfer (auth; aus index.js, Tech-Check F2).
 */

const {HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

/**
 * Roles that may call the Gemini-backed scan/import callables. Every AI import
 * ends in a new recipe, and firestore.rules only lets edit, moderator and admin
 * create recipes - anyone below that could only burn quota, not save a result.
 * Anonymous guests have no role (or 'guest') and are refused as well, so a
 * fresh anonymous login no longer hands out a fresh daily quota.
 */
const AI_ALLOWED_ROLES = ['edit', 'moderator', 'admin'];

/**
 * Throw unless the role holds at least one of the rolePermissions features.
 * Mirrors the client (App.js applyRolePermissionsToUser): the flag comes from
 * rolePermissions/{role}, a missing value counts as false. Admins always pass
 * (their defaults are true and an admin must not be locked out by a stale
 * flag). The nightly importer test account is exempt: its UID can only be
 * minted with the Admin SDK. Fails closed if the flags cannot be read.
 * @param {string} userId - UID of the caller
 * @param {string} role - role from users/{uid}
 * @param {string[]} features - accepted feature flags
 * @returns {Promise<void>}
 */
async function requireRoleFeature(userId, role, features) {
  if (role === 'admin' || userId === AI_IMPORTER_TEST_UID) return;
  let flags;
  try {
    const doc = await admin.firestore().doc(`rolePermissions/${role}`).get();
    flags = doc.exists ? (doc.data() || {}) : {};
  } catch (err) {
    console.error(`requireRoleFeature: failed to read rolePermissions/${role}:`, err);
    throw new HttpsError(
        'unavailable',
        'Die Berechtigung für KI-Funktionen konnte nicht geprüft werden. Bitte versuche es gleich noch einmal.',
    );
  }
  if (!features.some((feature) => flags[feature] === true)) {
    throw new HttpsError(
        'permission-denied',
        'Für diesen Import fehlt deiner Rolle die Berechtigung.',
    );
  }
}

/**
 * Resolve the caller of an AI callable from their users/{uid} role and refuse
 * anyone below the edit role. Fails closed: if the role cannot be read, the
 * request is refused instead of let through.
 * With `features`, the caller's role must additionally hold at least one of
 * these rolePermissions flags (see requireRoleFeature).
 * @param {object} auth - request.auth of the callable (already checked non-null)
 * @param {string[]} [features] - rolePermissions flags of which the role needs one
 * @returns {Promise<{userId: string, isAuthenticated: boolean, isAdmin: boolean, isModerator: boolean}>}
 */
async function requireAiCaller(auth, features = null) {
  const userId = auth.uid;
  let role;
  try {
    const doc = await admin.firestore().doc(`users/${userId}`).get();
    role = doc.exists ? doc.data()?.role : null;
  } catch (err) {
    console.error(`requireAiCaller: failed to look up role for ${userId}:`, err);
    throw new HttpsError(
        'unavailable',
        'Die Berechtigung für KI-Funktionen konnte nicht geprüft werden. Bitte versuche es gleich noch einmal.',
    );
  }
  if (!AI_ALLOWED_ROLES.includes(role)) {
    throw new HttpsError(
        'permission-denied',
        'KI-Funktionen sind erst ab der Rolle „Bearbeiten“ verfügbar.',
    );
  }
  // role is the only source of truth for admin status (as in firestore.rules).
  const isAdmin = role === 'admin';
  if (features) await requireRoleFeature(userId, role, features);
  return {
    userId,
    isAuthenticated: auth.token.firebase?.sign_in_provider !== 'anonymous',
    isAdmin,
    isModerator: !isAdmin && role === 'moderator',
  };
}

/**
 * Fixed UID used only to mint a throwaway Firebase Auth identity for the
 * nightly importer test. signInWithCustomToken provisions this user on first
 * use; its users/{uid} profile (role 'edit', the minimum for the AI callables)
 * is written by mintImporterTestIdToken, so no manual Firebase Console setup is
 * required. It never gets an admin/moderator role, so it exercises the same
 * "authenticated" rate-limit tier as a regular logged-in user.
 */
const AI_IMPORTER_TEST_UID = 'nightly-ai-importer-test';

module.exports = {AI_ALLOWED_ROLES, requireRoleFeature, requireAiCaller, AI_IMPORTER_TEST_UID};
