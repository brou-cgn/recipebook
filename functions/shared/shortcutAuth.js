/**
 * Von mehreren Function-Gruppen genutzte Helfer (shortcutAuth; aus index.js, Tech-Check F2).
 */

const {getFirestore} = require('firebase-admin/firestore');
const {verifyShortcutToken} = require('../shortcutToken');
const {checkRateLimit} = require('./rateLimit');

// Antwort für Kurzbefehle, die noch den abgeschalteten gemeinsamen Schlüssel schicken (Tech-Check S7)
const SHARED_KEY_RETIRED = 'Der gemeinsame Schlüssel (X-Api-Key und X-User-Email) gilt nicht mehr. ' +
  'Erzeuge in der App unter Chefkoch › Kurzbefehl-Schlüssel deinen eigenen Schlüssel und schicke ihn im ' +
  'Header X-Shortcut-Token.';

/**
 * Shared authentication for all Shortcut endpoints: the member's personal key in the header
 * X-Shortcut-Token (shortcutToken.js, Tech-Check S7) identifies the account; then the user's role
 * is checked. The shared SHORTCUT_API_KEY with X-User-Email and the Webimport-PIN were retired on
 * 23.11.2026; requests that still send them get an explanatory 401. Writes the error response itself
 * and returns null on failure; the caller just has to `return`.
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {string} fnName - endpoint name, used in log messages
 * @param {{allowShortcutUser?: boolean}} [opts]
 *   allowShortcutUser (default true): users flagged isShortcutUser pass without edit role
 * @return {Promise<{userId: string, userData: object, db: object}|null>}
 */
async function authenticateShortcutRequest(req, res, fnName, {allowShortcutUser = true} = {}) {
  const db = getFirestore();
  const tokenHeader = req.headers['x-shortcut-token'];

  if (!tokenHeader) {
    if (req.headers['x-api-key'] || req.headers['x-user-email']) {
      res.status(401).json({success: false, error: SHARED_KEY_RETIRED});
      return null;
    }
    res.status(401).json({
      success: false,
      error: 'Missing authentication header',
      requiredHeaders: ['X-Shortcut-Token'],
    });
    return null;
  }

  let userId;
  try {
    userId = await verifyShortcutToken(db, tokenHeader);
  } catch (err) {
    console.error(`${fnName}: error verifying shortcut token:`, err);
    res.status(500).json({success: false, error: 'Failed to validate user'});
    return null;
  }
  if (!userId) {
    console.warn(`${fnName}: invalid shortcut token attempt`);
    res.status(401).json({success: false, error: 'Invalid shortcut token'});
    return null;
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
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
 * Daily Gemini quota for the Gemini-backed Shortcut endpoints. Shares the
 * aiScanLimits counter with the in-app callables (see checkRateLimit), so the
 * Shortcut is not a second way past the per-user daily limit. Writes the error
 * response itself; call it after authentication so unauthenticated requests
 * never consume quota.
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

module.exports = {authenticateShortcutRequest, enforceShortcutAiLimit, SHARED_KEY_RETIRED};
