/**
 * Weckruf vom Server für Kochmodus-Timer (Tech-Check P8).
 *
 * Im Hintergrund pausiert iOS die App; Takt und Ton der Kochsitzung stehen dann still. Für jeden
 * laufenden Timer legt die Kochsitzung deshalb einen Weckruf an (cookingTimerAlarmsFirestore.js),
 * und der Server schickt zur Endzeit eine Push-Mitteilung an dieses Gerät
 * (functions/cookingTimerAlarms.js). Endet der Timer anders – gestoppt, oder er klingelt in der
 * offenen App –, wird der Weckruf gelöscht.
 *
 * Firebase wird erst beim ersten Weckruf geladen, damit die Kochsitzung leicht bleibt.
 */

const MAX_BODY_LENGTH = 200;

/** Ergebnis von scheduleTimerPush */
export const PUSH_SCHEDULED = 'scheduled';
/** Mitteilungen (noch) nicht erlaubt, z. B. weil die Abfrage gerade offen ist: später erneut versuchen */
export const PUSH_NOT_ALLOWED = 'not-allowed';
export const PUSH_FAILED = 'failed';

/**
 * ID des Weckrufs: eindeutig je Timerlauf und nach einem Neustart gleich, damit derselbe Lauf
 * nicht zweimal angelegt wird. Beginnt mit der uid (firestore.rules).
 */
export function timerAlarmId(uid, recipeId, stepKey, timerIndex, endTime) {
  const part = (value) => String(value).replace(/[^A-Za-z0-9-]/g, '-');
  return [uid, ...[recipeId, stepKey, timerIndex, endTime].map(part)].join('_');
}

function notificationsAllowed() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

// Token dieses Geräts, einmal je Sitzung und Nutzer geholt und im Profil vorgemerkt
let deviceToken = null;

function getDeviceToken(uid) {
  if (deviceToken && deviceToken.uid === uid) return deviceToken.promise;
  const promise = (async () => {
    const { requestNotificationPermission } = await import('./pushNotifications');
    const token = await requestNotificationPermission();
    if (!token) return null;
    const { saveTimerPushToken } = await import('./cookingTimerAlarmsFirestore');
    await saveTimerPushToken(uid, token);
    return token;
  })().catch(() => null);
  deviceToken = { uid, promise };
  return promise;
}

// Weckrufe, deren Anlegen gerade läuft: Löschen wartet darauf, sonst entstünde der Weckruf danach neu
const issuing = new Map();

/**
 * Legt den Weckruf für einen Timer an. Wirft nie.
 * @param {string} uid
 * @param {string} alarmId - aus timerAlarmId
 * @param {{ dueAt: number, body: string }} alarm - dueAt in ms
 * @returns {Promise<string>} PUSH_SCHEDULED, PUSH_NOT_ALLOWED oder PUSH_FAILED
 */
export function scheduleTimerPush(uid, alarmId, { dueAt, body }) {
  if (!notificationsAllowed()) return Promise.resolve(PUSH_NOT_ALLOWED);
  // Löst auf, sobald der Schreibauftrag erteilt ist (nicht erst, wenn der Server ihn bestätigt):
  // Firestore führt Schreibaufträge in Reihenfolge aus, ein späteres Löschen kommt also danach.
  const issued = (async () => {
    const token = await getDeviceToken(uid);
    if (!token) return null;
    const { createTimerAlarm } = await import('./cookingTimerAlarmsFirestore');
    const write = createTimerAlarm(alarmId, {
      uid,
      token,
      dueAt,
      body: String(body || '').slice(0, MAX_BODY_LENGTH),
    });
    return { write };
  })().catch(() => null);
  issuing.set(alarmId, issued);
  issued.then(() => {
    if (issuing.get(alarmId) === issued) issuing.delete(alarmId);
  });
  return issued
    .then((result) => (result ? result.write.then(() => PUSH_SCHEDULED) : PUSH_FAILED))
    .catch(() => PUSH_FAILED);
}

/** Löscht den Weckruf eines Timers. Wirft nie. */
export async function cancelTimerPush(alarmId) {
  try {
    await issuing.get(alarmId);
    const { deleteTimerAlarm } = await import('./cookingTimerAlarmsFirestore');
    await deleteTimerAlarm(alarmId);
  } catch (_) {
    // Offline oder nicht erlaubt: Der Server prüft vor dem Senden, ob es den Weckruf noch gibt;
    // ein vergessener wird spätestens zur Endzeit verschickt und dann entfernt.
  }
}
