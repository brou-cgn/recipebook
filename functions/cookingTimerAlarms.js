/**
 * Weckruf für Kochmodus-Timer (Tech-Check P8).
 *
 * Eine iOS-PWA im Hintergrund oder bei gesperrtem Bildschirm führt keinen Code aus: Takt und Ton
 * des Timers stehen dann still. Deshalb legt die App beim Start eines Timers in
 * `cookingTimerAlarms` einen Weckruf an (Endzeit, FCM-Token des Geräts, Text). Die Function
 * sendDueCookingTimerAlarms läuft jede Minute, nimmt die Weckrufe der nächsten knapp 60 Sekunden,
 * wartet bis zu ihrer Endzeit und schickt dann eine Push-Mitteilung an genau dieses Gerät.
 *
 * Läuft die App beim Ablauf im Vordergrund, spielt sie den Alarm selbst und löscht den Weckruf.
 * Dafür wartet der Job GRACE_MS über die Endzeit hinaus und prüft vor dem Senden, ob es ihn noch
 * gibt. Gesendet wird nur an einen Token aus users/{uid}.timerPushTokens, also an ein Gerät des
 * Nutzers selbst, der den Weckruf angelegt hat (die Regeln erzwingen uid == Anmeldung).
 */

const COLLECTION = 'cookingTimerAlarms';
/** Ein Lauf deckt die nächsten 55 s ab und endet damit vor dem nächsten (jede Minute). */
const WINDOW_MS = 55 * 1000;
/** Vorsprung für die offene App, die den Alarm selbst spielt und den Weckruf löscht. */
const GRACE_MS = 3 * 1000;
/** Ältere Weckrufe (z. B. nach einem Ausfall) sind wertlos und werden verworfen. */
const STALE_MS = 10 * 60 * 1000;
/** So lange gilt ein Weckruf als in Arbeit; danach darf ein späterer Lauf ihn übernehmen. */
const CLAIM_MS = 2 * 60 * 1000;
const BATCH_LIMIT = 200;
const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Die Push-Mitteilung zu einem Weckruf, im Format der übrigen Pushes (Daten-Nachricht,
 * angezeigt von public/firebase-messaging-sw.js).
 * @param {string} alarmId - ID des Weckrufs
 * @param {{token: string, body?: string}} alarm - Weckruf
 * @return {object} Nachricht für admin.messaging().send()
 */
function buildTimerAlarmMessage(alarmId, alarm) {
  const title = 'Timer abgelaufen!';
  const body = alarm.body || '';
  return {
    token: alarm.token,
    data: {
      type: 'cooking_timer',
      title,
      body,
      icon: '/logo192.png',
      badge: '/favicon.ico',
      notificationId: `timer-${alarmId}`,
    },
    apns: {
      headers: {'apns-push-type': 'alert', 'apns-priority': '10'},
      payload: {aps: {alert: {title, body}, 'sound': 'default', 'mutable-content': 1}},
    },
    webpush: {
      // Sofort zustellen; was später als STALE_MS ankäme, braucht niemand mehr
      headers: {Urgency: 'high', TTL: String(STALE_MS / 1000)},
    },
  };
}

/**
 * Übernimmt einen Weckruf für diesen Lauf (Transaktion), damit sich überlappende Läufe nicht
 * doppelt senden.
 * @param {object} admin - firebase-admin
 * @param {object} db - Firestore
 * @param {object} ref - Dokument des Weckrufs
 * @param {function(): number} now - aktuelle Zeit in ms
 * @return {Promise<object|null>} Daten des Weckrufs, oder null, wenn er weg oder schon vergeben ist
 */
function claimAlarm(admin, db, ref, now) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    const claimedAt = data.claimedAt && data.claimedAt.toMillis ? data.claimedAt.toMillis() : 0;
    if (claimedAt && now() - claimedAt < CLAIM_MS) return null;
    tx.update(ref, {claimedAt: admin.firestore.Timestamp.fromMillis(now())});
    return data;
  });
}

/**
 * Wartet bis zur Endzeit eines Weckrufs und sendet ihn, wenn er dann noch gewollt ist.
 * @param {object} admin - firebase-admin
 * @param {object} db - Firestore
 * @param {object} ref - Dokument des Weckrufs
 * @param {{now: function(): number, sleep: function(number): Promise<void>}} clock - Zeitquelle
 * @return {Promise<boolean>} ob eine Mitteilung gesendet wurde
 */
async function handleAlarm(admin, db, ref, {now, sleep}) {
  let alarm;
  try {
    alarm = await claimAlarm(admin, db, ref, now);
  } catch (err) {
    console.error(`cookingTimerAlarms: Übernahme von ${ref.id} fehlgeschlagen:`, err);
    return false;
  }
  if (!alarm) return false;

  const dueMs = alarm.dueAt && alarm.dueAt.toMillis ? alarm.dueAt.toMillis() : NaN;
  if (!alarm.uid || typeof alarm.token !== 'string' || !Number.isFinite(dueMs) ||
      now() - dueMs > STALE_MS) {
    await ref.delete().catch(() => {});
    return false;
  }

  const waitMs = dueMs + GRACE_MS - now();
  if (waitMs > 0) await sleep(waitMs);

  // Gelöscht, weil der Timer gestoppt wurde oder die offene App den Alarm selbst spielt
  const current = await ref.get();
  if (!current.exists) return false;

  const userRef = db.collection('users').doc(alarm.uid);
  const userSnap = await userRef.get();
  const ownTokens = userSnap.exists && Array.isArray(userSnap.data().timerPushTokens) ?
    userSnap.data().timerPushTokens :
    [];
  if (!ownTokens.includes(alarm.token)) {
    await ref.delete().catch(() => {});
    return false;
  }

  try {
    await admin.messaging().send(buildTimerAlarmMessage(ref.id, alarm));
  } catch (err) {
    if (STALE_TOKEN_CODES.has(err && err.code)) {
      await userRef.update({timerPushTokens: admin.firestore.FieldValue.arrayRemove(alarm.token)})
          .catch(() => {});
      await ref.delete().catch(() => {});
    } else {
      // Weckruf bleibt liegen: ein späterer Lauf versucht es nach CLAIM_MS erneut
      console.error(`cookingTimerAlarms: Senden von ${ref.id} (uid ${alarm.uid}) fehlgeschlagen:`, err);
    }
    return false;
  }
  await ref.delete().catch(() => {});
  return true;
}

/**
 * Ein Lauf: alle Weckrufe, die vor dem nächsten Lauf fällig werden, pünktlich senden.
 * @param {object} admin - firebase-admin (firestore.Timestamp, firestore.FieldValue, messaging)
 * @param {object} db - Firestore
 * @param {{now?: function(): number, sleep?: function(number): Promise<void>}} [clock] - für Tests
 * @return {Promise<number>} Anzahl gesendeter Mitteilungen
 */
async function processDueCookingTimerAlarms(admin, db, {now = Date.now, sleep = defaultSleep} = {}) {
  const until = now() + WINDOW_MS - GRACE_MS;
  const snap = await db.collection(COLLECTION)
      .where('dueAt', '<=', admin.firestore.Timestamp.fromMillis(until))
      .orderBy('dueAt')
      .limit(BATCH_LIMIT)
      .get();
  const results = await Promise.all(snap.docs.map((doc) => handleAlarm(admin, db, doc.ref, {now, sleep})));
  return results.filter(Boolean).length;
}

module.exports = {
  COLLECTION,
  WINDOW_MS,
  GRACE_MS,
  STALE_MS,
  CLAIM_MS,
  buildTimerAlarmMessage,
  processDueCookingTimerAlarms,
};
