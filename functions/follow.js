/**
 * Follow (Vernetzung zwischen Mitgliedern), Anfragen und Antworten.
 *
 * Vorhaben-Tracker: docs/vorhaben/follow.md. Die Callables requestFollow und
 * respondFollow in index.js sind dünne Hüllen um diese Funktionen; die Logik
 * hängt nur an `admin` und `db`, damit sie ohne Emulator testbar ist.
 *
 * Datenmodell (alles nur über diese Funktionen schreibbar, siehe firestore.rules):
 * - follows/{followerId}_{followeeId}: {followerId, followeeId, status, createdAt,
 *   respondedAt}. Beide Beteiligten lesen. status: 'pending' | 'accepted'.
 * - users/{followeeId}/followInbox/{followerId}: offene Anfragen aus Sicht des
 *   Gefolgten (nur er liest). Eine abgelehnte oder gesperrte Anfrage steht hier
 *   nicht mehr; das follows-Dokument bleibt 'pending', damit der Anfragende
 *   weiter "Angefragt" sieht und keine Ablehnung erkennt.
 * - followCooldowns/{followerId}_{followeeId}: {blocked, until}. Nach Ablehnung
 *   30 Tage Sperrfrist, nach Blockieren dauerhaft. Eine neue Anfrage in dieser
 *   Zeit sieht für den Anfragenden aus wie eine normale, landet aber nicht in
 *   der Inbox. Nur serverseitig lesbar.
 * - followLimits/{uid}_{day}: Zähler der Anfragen pro Absender und Tag.
 */

/** Anfragen pro Absender und Tag (UTC). Jeder Aufruf zählt, auch wiederholte. */
const FOLLOW_REQUESTS_PER_DAY = 20;

/** Sperrfrist nach einer Ablehnung. */
const DECLINE_COOLDOWN_DAYS = 30;

/** Rollen, die Mitglieder sind (keine anonymen Gäste). */
const MEMBER_ROLES = ['read', 'comment', 'edit', 'moderator', 'admin'];

const RESPOND_ACTIONS = ['accept', 'decline', 'block'];

const DAY_MS = 24 * 60 * 60 * 1000;

const followId = (followerId, followeeId) => `${followerId}_${followeeId}`;

const isUid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 &&
  !value.includes('/');

/**
 * Wirft einen Fehler im Stil der übrigen Callables. HttpsError wird vom
 * Aufrufer übergeben, damit dieses Modul keine Firebase-Abhängigkeit hat.
 */
const fail = (HttpsError, code, message) => {
  throw new HttpsError(code, message);
};

/**
 * Ob ein Nutzer Follow nutzen darf: Mitgliedsrolle und Flag `follow` in
 * rolePermissions/{role}. Schlägt geschlossen fehl: ein nicht lesbares
 * Dokument gilt als "nein".
 * @return {Promise<boolean>}
 */
const canUseFollow = async (db, uid) => {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) return false;
  const role = userSnap.data()?.role;
  if (!MEMBER_ROLES.includes(role)) return false;
  const permSnap = await db.doc(`rolePermissions/${role}`).get();
  return permSnap.exists && permSnap.data()?.follow === true;
};

/**
 * Zählt einen Aufruf gegen das Tageslimit des Absenders.
 * @throws {HttpsError} resource-exhausted, wenn das Limit erreicht ist
 */
const consumeFollowQuota = async (db, HttpsError, uid, nowMs) => {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const ref = db.doc(`followLimits/${uid}_${day}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data().count || 0) : 0;
    if (count >= FOLLOW_REQUESTS_PER_DAY) {
      fail(HttpsError, 'resource-exhausted',
          'Das Tageslimit für Follow-Anfragen ist erreicht. Bitte versuche es morgen erneut.');
    }
    tx.set(ref, {uid, day, count: count + 1});
  });
};

/**
 * Ob für das Paar eine Sperre gilt (Blockiert oder Sperrfrist läuft noch).
 * `until` kann ein Firestore-Timestamp (toMillis) oder eine Zahl sein.
 */
const isCooldownActive = (cooldown, nowMs) => {
  if (!cooldown) return false;
  if (cooldown.blocked === true) return true;
  const until = cooldown.until;
  const untilMs = typeof until?.toMillis === 'function' ? until.toMillis() : Number(until);
  return Number.isFinite(untilMs) && untilMs > nowMs;
};

/**
 * Legt eine Follow-Anfrage an.
 * @param {Object} admin - firebase-admin
 * @param {Object} db - admin.firestore()
 * @param {Function} HttpsError
 * @param {Object} params
 * @param {{uid: string, token?: Object}} params.auth - request.auth des Callables
 * @param {*} params.followeeId - UID der Person, der gefolgt werden soll
 * @param {Function} [params.onNewRequest] - wird nach dem Anlegen mit {followerId, followeeId}
 *   aufgerufen, wenn die Anfrage in der Inbox des Gefolgten gelandet ist (Push).
 *   Best-effort: ein Fehler hier ändert die Antwort nicht.
 * @param {number} [params.nowMs]
 * @return {Promise<{status: string}>} 'pending' oder, bei bestehender Beziehung, deren Status
 */
const requestFollow = async (admin, db, HttpsError, {auth, followeeId, onNewRequest, nowMs = Date.now()}) => {
  if (!auth) fail(HttpsError, 'unauthenticated', 'Du musst angemeldet sein.');
  if (auth.token?.firebase?.sign_in_provider === 'anonymous') {
    fail(HttpsError, 'permission-denied', 'Gäste können niemandem folgen.');
  }
  if (!isUid(followeeId)) fail(HttpsError, 'invalid-argument', 'Ungültige Person.');
  const followerId = auth.uid;
  if (followeeId === followerId) {
    fail(HttpsError, 'invalid-argument', 'Du kannst dir nicht selbst folgen.');
  }

  await consumeFollowQuota(db, HttpsError, followerId, nowMs);

  if (!(await canUseFollow(db, followerId))) {
    fail(HttpsError, 'permission-denied', 'Follow ist für dich nicht freigeschaltet.');
  }
  // Gleiche Antwort für "gibt es nicht" und "nutzt Follow nicht": die Funktion
  // verrät nicht, wer freigeschaltet ist.
  if (!(await canUseFollow(db, followeeId))) {
    fail(HttpsError, 'not-found', 'Diese Person ist nicht erreichbar.');
  }

  const id = followId(followerId, followeeId);
  const cooldownSnap = await db.doc(`followCooldowns/${id}`).get();
  const silent = isCooldownActive(cooldownSnap.exists ? cooldownSnap.data() : null, nowMs);

  const followRef = db.doc(`follows/${id}`);
  const inboxRef = db.doc(`users/${followeeId}/followInbox/${followerId}`);
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(followRef);
    const inboxExisting = await tx.get(inboxRef);
    if (existing.exists) return {status: existing.data().status, notify: false};
    tx.set(followRef, {
      followerId,
      followeeId,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Bei einer Sperre sieht der Anfragende "Angefragt", der Gefolgte nichts.
    if (!silent) {
      tx.set(inboxRef, {
        followerId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    // Push nur, wenn die Anfrage neu in der Inbox steht: Wer zurückzieht und neu
    // anfragt, solange die alte Inbox-Zeile noch da ist, löst keinen zweiten Push aus.
    return {status: 'pending', notify: !silent && !inboxExisting.exists};
  });

  if (result.notify && typeof onNewRequest === 'function') {
    try {
      await onNewRequest({followerId, followeeId});
    } catch (err) {
      console.error('requestFollow: Benachrichtigung fehlgeschlagen:', err);
    }
  }
  return {status: result.status};
};

/**
 * Antwortet als Gefolgter auf eine Anfrage.
 * - accept: nur für Anfragen in der Inbox; status wird 'accepted'.
 * - decline: still. Die Inbox-Zeile verschwindet, das follows-Dokument bleibt
 *   'pending'; 30 Tage Sperrfrist für neue Anfragen.
 * - block: follows-Dokument und Inbox-Zeile werden gelöscht (auch bei einer
 *   bestehenden Beziehung), dauerhafte Sperre.
 * @return {Promise<{status: string}>} 'accepted' | 'declined' | 'blocked'
 */
const respondFollow = async (admin, db, HttpsError, {auth, followerId, action, nowMs = Date.now()}) => {
  if (!auth) fail(HttpsError, 'unauthenticated', 'Du musst angemeldet sein.');
  if (auth.token?.firebase?.sign_in_provider === 'anonymous') {
    fail(HttpsError, 'permission-denied', 'Gäste können Anfragen nicht beantworten.');
  }
  if (!isUid(followerId)) fail(HttpsError, 'invalid-argument', 'Ungültige Person.');
  if (!RESPOND_ACTIONS.includes(action)) fail(HttpsError, 'invalid-argument', 'Ungültige Aktion.');
  const followeeId = auth.uid;

  if (!(await canUseFollow(db, followeeId))) {
    fail(HttpsError, 'permission-denied', 'Follow ist für dich nicht freigeschaltet.');
  }

  const id = followId(followerId, followeeId);
  const followRef = db.doc(`follows/${id}`);
  const inboxRef = db.doc(`users/${followeeId}/followInbox/${followerId}`);
  const cooldownRef = db.doc(`followCooldowns/${id}`);
  const FieldValue = admin.firestore.FieldValue;

  return db.runTransaction(async (tx) => {
    const followSnap = await tx.get(followRef);
    const inboxSnap = await tx.get(inboxRef);
    if (!followSnap.exists) fail(HttpsError, 'not-found', 'Diese Anfrage gibt es nicht mehr.');
    const status = followSnap.data().status;

    if (action === 'accept') {
      // Nur was in der Inbox steht, wurde dem Gefolgten auch gezeigt. Eine still
      // abgelehnte oder gesperrte Anfrage lässt sich so nicht nachträglich annehmen.
      if (status !== 'pending' || !inboxSnap.exists) {
        fail(HttpsError, 'failed-precondition', 'Diese Anfrage lässt sich nicht annehmen.');
      }
      tx.update(followRef, {status: 'accepted', respondedAt: FieldValue.serverTimestamp()});
      tx.delete(inboxRef);
      tx.delete(cooldownRef);
      return {status: 'accepted'};
    }

    if (action === 'decline') {
      if (status !== 'pending') {
        fail(HttpsError, 'failed-precondition', 'Diese Anfrage ist bereits beantwortet.');
      }
      tx.delete(inboxRef);
      tx.set(cooldownRef, {
        blocked: false,
        until: admin.firestore.Timestamp.fromMillis(nowMs + DECLINE_COOLDOWN_DAYS * DAY_MS),
        createdAt: FieldValue.serverTimestamp(),
      });
      return {status: 'declined'};
    }

    tx.delete(followRef);
    tx.delete(inboxRef);
    tx.set(cooldownRef, {blocked: true, createdAt: FieldValue.serverTimestamp()});
    return {status: 'blocked'};
  });
};

module.exports = {
  FOLLOW_REQUESTS_PER_DAY,
  DECLINE_COOLDOWN_DAYS,
  MEMBER_ROLES,
  followId,
  canUseFollow,
  isCooldownActive,
  requestFollow,
  respondFollow,
};
