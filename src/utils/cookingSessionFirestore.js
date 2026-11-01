/**
 * Kochsitzung über Geräte hinweg (Vorhaben „Parallel kochen“, docs/vorhaben/parallel-kochen.md).
 *
 * Datenmodell: cookingSessions/{uid}, ein Dokument je Nutzer (siehe firestore.rules)
 *   - recipes: [{ id, stepIndex }]   Rezepte der Sitzung in ihrer Reihenfolge, mit Schritt je Rezept
 *   - activeRecipeId: string | null  Rezept, das im Kochmodus vorn steht
 *   - deviceId: string               Gerät, das zuletzt geschrieben hat (eigenes Echo erkennen)
 *   - updatedAt: serverTimestamp
 *
 * Nicht synchronisiert: Timer (laufen auf dem Gerät, auf dem sie gestartet wurden; der Alarm
 * kommt per Push, siehe cookingTimerAlarmsFirestore.js) und Portionen.
 */
import { db } from '../firebase';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

export const COOKING_SESSIONS = 'cookingSessions';
// Dieselbe Grenze wie MAX_SESSION_RECIPES in der Kochsitzung, mit Luft für spätere Erhöhung
export const MAX_SYNCED_RECIPES = 12;

const DEVICE_ID_KEY = 'cookingSessionDeviceId';
let memoryDeviceId = null;

/** Zufällige Kennung dieses Geräts (bleibt im localStorage, sonst bis zum Neuladen). */
export function getCookingDeviceId() {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = `d_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch (_) {
    if (!memoryDeviceId) memoryDeviceId = `d_${Math.random().toString(36).slice(2, 12)}`;
    return memoryDeviceId;
  }
}

function normalize(data) {
  const recipes = (Array.isArray(data?.recipes) ? data.recipes : [])
    .filter((r) => r && typeof r.id === 'string' && r.id)
    .slice(0, MAX_SYNCED_RECIPES)
    .map((r) => ({ id: r.id, stepIndex: Number.isInteger(r.stepIndex) && r.stepIndex >= 0 ? r.stepIndex : 0 }));
  const activeRecipeId = typeof data?.activeRecipeId === 'string' && data.activeRecipeId ? data.activeRecipeId : null;
  return { recipes, activeRecipeId };
}

/**
 * Hört auf die Sitzung des Nutzers. `callback` bekommt { recipes, activeRecipeId, deviceId,
 * updatedAtMs, fromCache, hasPendingWrites } oder null, wenn es noch keine Sitzung gibt.
 * @returns {() => void} Abmelden
 */
export function subscribeCookingSession(uid, callback, onError) {
  return onSnapshot(
    doc(db, COOKING_SESSIONS, uid),
    { includeMetadataChanges: false },
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data();
      const updatedAt = data.updatedAt;
      callback({
        ...normalize(data),
        deviceId: typeof data.deviceId === 'string' ? data.deviceId : '',
        updatedAtMs: updatedAt && typeof updatedAt.toMillis === 'function' ? updatedAt.toMillis() : null,
        hasPendingWrites: Boolean(snapshot.metadata?.hasPendingWrites),
      });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

/** Schreibt die Sitzung des Nutzers (ersetzt das Dokument). */
export async function saveCookingSession(uid, { recipes, activeRecipeId }) {
  const { recipes: cleanRecipes, activeRecipeId: cleanActive } = normalize({ recipes, activeRecipeId });
  await setDoc(doc(db, COOKING_SESSIONS, uid), {
    recipes: cleanRecipes,
    activeRecipeId: cleanActive,
    deviceId: getCookingDeviceId(),
    updatedAt: serverTimestamp(),
  });
}
