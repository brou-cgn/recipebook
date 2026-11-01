/**
 * Weckrufe für Kochmodus-Timer (Tech-Check P8).
 *
 * Datenmodell: cookingTimerAlarms/{alarmId}, die ID beginnt mit der uid (siehe firestore.rules)
 *   - uid: string        Eigentümer
 *   - token: string      FCM-Token des Geräts, auf dem der Timer gestartet wurde
 *   - dueAt: Timestamp   Endzeit des Timers
 *   - body: string       Text der Mitteilung, z. B. „Rinderrouladen: 90 Minuten“
 *   - createdAt: serverTimestamp
 *
 * Die Function sendDueCookingTimerAlarms (functions/cookingTimerAlarms.js) schickt zur Endzeit
 * eine Push-Mitteilung, aber nur an einen Token aus users/{uid}.timerPushTokens.
 */
import { db } from '../firebase';
import {
  arrayUnion,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

export const COOKING_TIMER_ALARMS = 'cookingTimerAlarms';

/**
 * Legt einen Weckruf an. Gibt es ihn schon (z. B. nach einem Neustart der App), lehnen die
 * Regeln ab und der vorhandene bleibt bestehen.
 * @param {string} alarmId
 * @param {{ uid: string, token: string, dueAt: number, body: string }} alarm - dueAt in ms
 */
export async function createTimerAlarm(alarmId, { uid, token, dueAt, body }) {
  await setDoc(doc(db, COOKING_TIMER_ALARMS, alarmId), {
    uid,
    token,
    dueAt: Timestamp.fromMillis(dueAt),
    body,
    createdAt: serverTimestamp(),
  });
}

/** Löscht einen Weckruf; auch einen, den der Server schon verschickt und entfernt hat. */
export async function deleteTimerAlarm(alarmId) {
  await deleteDoc(doc(db, COOKING_TIMER_ALARMS, alarmId));
}

/**
 * Merkt den Token dieses Geräts im eigenen Profil vor. Getrennt von `fcmTokens`, damit ein Gerät,
 * auf dem nur ein Timer lief, nicht auch die übrigen Mitteilungen (Listen, Importe) bekommt.
 */
export async function saveTimerPushToken(uid, token) {
  await updateDoc(doc(db, 'users', uid), { timerPushTokens: arrayUnion(token) });
}
