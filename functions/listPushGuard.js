/**
 * Berechtigungsprüfung für notifyPrivateListMembers (Tech-Check S18).
 *
 * Die Callable bekommt groupId, recipeId und actorId vom Client. Ohne diese Prüfung konnte
 * jeder Angemeldete, der eine groupId kennt, Push-Nachrichten an alle Mitglieder einer
 * privaten Liste auslösen. Hier steht, wer das darf und wie oft; die Function selbst
 * verschickt nur noch, wenn `authorizeListPush` durchläuft.
 */

const MEMBER_ROLES = ['read', 'comment', 'edit', 'moderator', 'admin'];
const ACTIONS = ['created', 'added'];

// Großzügig, weil ein Massenimport pro Rezept einen Aufruf auslöst; zählt nur gegen Missbrauch.
const LIST_PUSH_PER_DAY = 300;

const fail = (HttpsError, code, message) => {
  throw new HttpsError(code, message);
};

/**
 * @param {Object} db - admin.firestore()
 * @param {Function} HttpsError
 * @param {Object} params
 * @param {{uid: string}} params.auth - request.auth des Callables
 * @param {*} params.actorId - vom Client gemeldete UID der handelnden Person
 * @param {*} params.action - 'created' | 'added' (leer wird wie 'added' behandelt)
 * @param {Object} params.groupData - Daten des Listendokuments
 * @param {number} [params.nowMs]
 * @throws {HttpsError} permission-denied, invalid-argument oder resource-exhausted
 */
const authorizeListPush = async (db, HttpsError, {auth, actorId, action, groupData, nowMs = Date.now()}) => {
  const uid = auth?.uid;
  if (!uid) fail(HttpsError, 'unauthenticated', 'Sie müssen angemeldet sein.');
  if (actorId !== uid) {
    fail(HttpsError, 'permission-denied', 'actorId muss der angemeldeten Person entsprechen.');
  }
  if (action !== undefined && action !== null && !ACTIONS.includes(action)) {
    fail(HttpsError, 'invalid-argument', 'Ungültige Aktion.');
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const role = userSnap.exists ? userSnap.data()?.role : null;
  if (!MEMBER_ROLES.includes(role)) {
    fail(HttpsError, 'permission-denied', 'Keine Berechtigung.');
  }

  const memberIds = Array.isArray(groupData?.memberIds) ? groupData.memberIds : [];
  const isListMember = groupData?.ownerId === uid || memberIds.includes(uid);
  if (!isListMember && role !== 'admin') {
    fail(HttpsError, 'permission-denied', 'Nur Mitglieder der Liste dürfen Benachrichtigungen auslösen.');
  }

  const day = new Date(nowMs).toISOString().slice(0, 10);
  const ref = db.doc(`listPushLimits/${uid}_${day}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data().count || 0) : 0;
    if (count >= LIST_PUSH_PER_DAY) {
      fail(HttpsError, 'resource-exhausted', 'Das Tageslimit für Listen-Benachrichtigungen ist erreicht.');
    }
    tx.set(ref, {uid, day, count: count + 1});
  });
};

module.exports = {authorizeListPush, LIST_PUSH_PER_DAY, MEMBER_ROLES};
