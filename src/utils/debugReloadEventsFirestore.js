/**
 * Temporary diagnostic logging for the still-unresolved "app resets to the
 * start view on iPhone" report - see utils/crashDiagnostics.js and
 * utils/tutorialVideoCloseDebug.js for how the underlying data is collected
 * from localStorage right after an app restart.
 *
 * Writing to Firestore (instead of only showing an on-device DOM banner)
 * means the reporter no longer has to manually transcribe the banner text -
 * every restart gets documented here and can be reviewed directly in the
 * Firebase console.
 *
 * Data model: debugReloadEvents/{eventId}
 *   - staleClose: object|null         (see tutorialVideoCloseDebug.js)
 *   - reloadMarker: object|null       (which of the 3 known reload() call sites fired, if any)
 *   - errorLog: array|null            (last few uncaught errors/rejections before the reload)
 *   - abruptTermination: object|null  (heartbeat/pagehide evidence of an OS-level process kill - see crashDiagnostics.js)
 *   - interactionLog: array|null      (open/play/closeRequested/closeCompleted timestamps for the tutorial video modal, to correlate with abruptTermination)
 *   - navigationType: string          (performance navigation type, e.g. 'reload')
 *   - appVersion: string
 *   - userAgent: string
 *   - userId, userEmail: string
 *   - timestamp: serverTimestamp
 *
 * Remove this file + its call site in App.js once the bug is understood.
 */
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function logReloadDebugEvent(user, data) {
  if (!user || !user.id) return;
  try {
    await addDoc(collection(db, 'debugReloadEvents'), {
      staleClose: data.staleClose || null,
      reloadMarker: data.reloadMarker || null,
      errorLog: data.errorLog || null,
      abruptTermination: data.abruptTermination || null,
      interactionLog: data.interactionLog || null,
      navigationType: data.navigationType || 'unbekannt',
      appVersion: process.env.REACT_APP_VERSION || '',
      userAgent: navigator.userAgent,
      userId: user.id,
      userEmail: user.email || '',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging reload debug event:', error);
  }
}
