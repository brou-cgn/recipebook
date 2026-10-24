/**
 * Von mehreren Function-Gruppen genutzte Helfer (rateLimit; aus index.js, Tech-Check F2).
 */

const {HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

/**
 * Same day-counter pattern as checkRateLimit above, for a quota with its own
 * collection (one document per user and Berlin day). A limit of 0 or less
 * refuses without writing a counter.
 * @param {string} collectionName - Firestore collection holding the counters
 * @param {number} limit - Calls allowed per day
 * @param {{userId: string, isAuthenticated: boolean, isAdmin: boolean, isModerator: boolean}} caller
 * @returns {Promise<{allowed: boolean, remaining: number, limit: number}>}
 */
async function consumeDailyQuota(collectionName, limit, {userId, isAuthenticated, isAdmin, isModerator}) {
  if (limit <= 0) return {allowed: false, remaining: 0, limit};

  const db = admin.firestore();
  const today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Europe/Berlin'});
  const docRef = db.collection(collectionName).doc(`${userId}_${today}`);

  try {
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        transaction.set(docRef, {
          userId: userId,
          date: today,
          count: 1,
          isAuthenticated: isAuthenticated,
          isAdmin: isAdmin,
          isModerator: isModerator,
        });
        return {allowed: true, remaining: limit - 1, limit};
      }

      const data = doc.data();
      if (data.count >= limit) {
        return {allowed: false, remaining: 0, limit};
      }

      transaction.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
      });
      return {allowed: true, remaining: limit - data.count - 1, limit};
    });
  } catch (error) {
    console.error(`Rate limit check error (${collectionName}):`, error);
    // Fail closed, same as checkRateLimit.
    throw new HttpsError(
        'unavailable',
        'Das KI-Tageslimit konnte nicht geprüft werden. Bitte versuche es gleich noch einmal.',
    );
  }
}

module.exports = {consumeDailyQuota};
