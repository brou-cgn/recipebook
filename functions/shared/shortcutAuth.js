/**
 * Von mehreren Function-Gruppen genutzte Helfer (shortcutAuth; aus index.js, Tech-Check F2).
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const {requireShortcutPin} = require('../webImportPin');
const {shortcutApiKey} = require('./secrets');
const {checkRateLimit} = require('./rateLimit');

/**
 * Resolves a Shortcut request's X-User-Email header to a Firebase Auth uid.
 * Returns null (instead of throwing) for any lookup failure so callers can
 * respond with the same generic 403 used for other permission failures —
 * this avoids letting a caller who already holds a valid API key enumerate
 * which email addresses are registered.
 * @param {string} email - raw X-User-Email header value
 * @return {Promise<string|null>}
 */
async function resolveShortcutUserId(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  try {
    const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
    return userRecord.uid;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error('resolveShortcutUserId: error looking up user by email:', err);
    }
    return null;
  }
}

/**
 * Shared authentication for all Shortcut endpoints: validates the X-Api-Key
 * header against SHORTCUT_API_KEY (timing-safe), resolves X-User-Email to a
 * uid and checks the user's role. Writes the error response itself and
 * returns null on failure; the caller just has to `return`.
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} fnName - endpoint name, used in log messages
 * @param {{allowShortcutUser?: boolean}} [opts]
 *   allowShortcutUser (default true): users flagged isShortcutUser pass without edit role
 * @return {Promise<{userId: string, userData: object, db: object}|null>}
 */
async function authenticateShortcutRequest(req, res, fnName, {allowShortcutUser = true} = {}) {
  const apiKeyHeader = req.headers['x-api-key'];
  const userEmail = req.headers['x-user-email'];
  if (!apiKeyHeader || !userEmail) {
    res.status(401).json({
      success: false,
      error: 'Missing authentication headers',
      requiredHeaders: ['X-Api-Key', 'X-User-Email'],
    });
    return null;
  }

  const validApiKey = shortcutApiKey.value();
  if (!validApiKey) {
    console.error(`${fnName}: SHORTCUT_API_KEY secret is not set`);
    res.status(500).json({
      success: false,
      error: 'Server misconfiguration: SHORTCUT_API_KEY secret is not set',
    });
    return null;
  }

  let isValidKey;
  try {
    isValidKey = crypto.timingSafeEqual(Buffer.from(apiKeyHeader), Buffer.from(validApiKey));
  } catch (_) {
    isValidKey = false;
  }
  if (!isValidKey) {
    console.warn(`${fnName}: invalid API key attempt`);
    res.status(401).json({success: false, error: 'Invalid API key'});
    return null;
  }

  const userId = await resolveShortcutUserId(userEmail);
  const db = admin.firestore();
  try {
    const userDoc = userId ? await db.collection('users').doc(userId).get() : null;
    if (!userId || !userDoc.exists) {
      res.status(403).json({success: false, error: 'Access denied'});
      return null;
    }
    const userData = userDoc.data();
    const role = userData?.role;
    const hasRole = role === 'edit' || role === 'admin' || role === 'moderator';
    const hasFlag = allowShortcutUser && userData?.isShortcutUser === true;
    if (!hasRole && !hasFlag) {
      res.status(403).json({success: false, error: 'Insufficient permissions'});
      return null;
    }
    return {userId, userData, db};
  } catch (err) {
    console.error(`${fnName}: error validating user:`, err);
    res.status(500).json({success: false, error: 'Failed to validate user'});
    return null;
  }
}

/**
 * Webimport-PIN check for Shortcut endpoints (no-op if the user never set a
 * PIN). Writes the error response itself.
 * @param {object} res - Express response
 * @param {string} userId
 * @param {*} pin - PIN as sent by the Shortcut (body field or query param)
 * @return {Promise<boolean>} true if the request may proceed
 */
async function enforceShortcutPin(res, userId, pin) {
  try {
    await requireShortcutPin(userId, pin);
    return true;
  } catch (pinErr) {
    const status = pinErr.code === 'resource-exhausted' ? 429 :
      pinErr.code === 'invalid-argument' ? 400 : 403;
    res.status(status).json({success: false, error: pinErr.message || 'PIN erforderlich.'});
    return false;
  }
}

/**
 * Daily Gemini quota for the Gemini-backed Shortcut endpoints. Shares the
 * aiScanLimits counter with the in-app callables (see checkRateLimit), so the
 * Shortcut is not a second way past the per-user daily limit. Writes the error
 * response itself; call it after authentication and PIN so unauthenticated
 * requests never consume quota.
 * @param {object} res - Express response
 * @param {{userId: string, userData: object}} auth - result of authenticateShortcutRequest
 * @return {Promise<boolean>} true if the request may proceed
 */
async function enforceShortcutAiLimit(res, {userId, userData}) {
  const role = userData?.role;
  const isAdmin = role === 'admin';
  try {
    const rateLimit = await checkRateLimit(userId, true, isAdmin, !isAdmin && role === 'moderator');
    if (rateLimit.allowed) return true;
    res.status(429).json({
      success: false,
      error: `Tageslimit für KI-Importe erreicht (${rateLimit.limit}/${rateLimit.limit}). Versuche es morgen erneut.`,
    });
  } catch (err) {
    // checkRateLimit fails closed: without a checked counter there is no cost ceiling.
    res.status(503).json({success: false, error: err.message});
  }
  return false;
}

module.exports = {resolveShortcutUserId, authenticateShortcutRequest, enforceShortcutPin, enforceShortcutAiLimit};
