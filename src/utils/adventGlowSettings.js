import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Lauftext der statischen RSVP-Seite /advent-glow/ (public/advent-glow/index.html).
// Die Seite liest dasselbe Dokument; fehlt es oder ist der Text leer, zeigt sie DEFAULT.
const ADVENT_GLOW_SETTINGS_REF = ['appSettings', 'adventGlow'];

export const ADVENT_GLOW_TICKER_MAX_LENGTH = 600;
export const DEFAULT_ADVENT_GLOW_TICKER_TEXT =
  'Snow on the windows · mulled wine in cold hands · fairy lights and old friends · one more song before midnight · Third Sunday of Advent · Snow on the windows · mulled wine in cold hands · fairy lights and old friends';

export function normalizeAdventGlowTickerText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, ADVENT_GLOW_TICKER_MAX_LENGTH);
}

export async function getAdventGlowTickerText() {
  try {
    const snapshot = await getDoc(doc(db, ...ADVENT_GLOW_SETTINGS_REF));
    const text = snapshot.exists() ? normalizeAdventGlowTickerText(snapshot.data()?.tickerText) : '';
    return text || DEFAULT_ADVENT_GLOW_TICKER_TEXT;
  } catch (error) {
    console.error('Error getting Advent Glow settings:', error);
    return DEFAULT_ADVENT_GLOW_TICKER_TEXT;
  }
}

export async function saveAdventGlowTickerText(value) {
  await setDoc(
    doc(db, ...ADVENT_GLOW_SETTINGS_REF),
    { tickerText: normalizeAdventGlowTickerText(value) || DEFAULT_ADVENT_GLOW_TICKER_TEXT },
    { merge: true }
  );
}
