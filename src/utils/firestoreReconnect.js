import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Baut die Firestore-Verbindung sofort neu auf.
 *
 * Nach dem Fortsetzen aus dem Hintergrund (iOS-PWA) ist die alte Verbindung
 * oft schon abgerissen, Firestore merkt das aber erst nach einer Weile; bis
 * dahin zeigen die Listener den Stand von vor der Pause. Ein Tipp auf
 * „Rezept bereit zur Prüfung" wartet genau auf so einen Listener (App.js).
 * Offene Schreibvorgänge bleiben erhalten und laufen nach dem Neuaufbau weiter.
 *
 * @returns {Promise<void>} Nie ein Fehler nach außen.
 */
export async function reconnectFirestore() {
  await disableNetwork(db).catch(() => {});
  await enableNetwork(db).catch(() => {});
}
