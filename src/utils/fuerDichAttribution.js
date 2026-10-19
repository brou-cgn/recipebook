import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Wer hinter den Rezepten von "Für dich entdeckt" steht (Vorhaben Follow, PR 6).
// Die Rotation schreibt users/{uid}/fuerDichEntdeckt/current, nur der Eigentümer
// liest es: { listId, themeId, recipes: { [recipeId]: [{ userId, kind, day }] } }.
// `kind` ist 'cooked' oder 'created', `day` ein Kalendertag (YYYY-MM-DD).

const DAY_MS = 24 * 60 * 60 * 1000;
const ANONYMOUS_NAME = 'Ein Mitglied';

const dayNumber = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : null;
};

/** Grobe Zeitangabe zu einem Tag: "heute", "gestern", "diese Woche", "letzte Woche", sonst "vor n Wochen". */
export const formatActionDay = (day, now = new Date()) => {
  const then = dayNumber(day);
  if (then === null) return '';
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
  const age = Math.max(0, Math.round(today - then));
  if (age === 0) return 'heute';
  if (age === 1) return 'gestern';
  if (age < 7) return 'diese Woche';
  if (age < 14) return 'letzte Woche';
  return `vor ${Math.floor(age / 7)} Wochen`;
};

const joinNames = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`);

/**
 * Satz für die Rezeptkarte, z. B. "Anna hat das gekocht · gestern" oder
 * "Anna und Ben haben das gekocht · diese Woche". Gemischte Handlungen werden
 * getrennt genannt ("Anna hat das gekocht, Ben hat es angelegt"). Die Zeit
 * nennt die jüngste Handlung.
 * @param {Array<{userId: string, kind: string, day: string}>} entries
 * @param {function(string): string} nameOf - UID -> Name ('' = unbekannt)
 * @return {string} '' ohne Einträge
 */
export const describeActors = (entries, nameOf, now = new Date()) => {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const groups = ['cooked', 'created'].map((kind) => {
    const names = entries.filter((e) => e.kind === kind).map((e) => nameOf(e.userId) || ANONYMOUS_NAME);
    return { kind, names };
  }).filter((g) => g.names.length > 0);
  if (groups.length === 0) return '';
  const verbs = {
    cooked: (n) => (n === 1 ? 'hat das gekocht' : 'haben das gekocht'),
    created: (n) => (n === 1 ? 'hat es angelegt' : 'haben es angelegt'),
  };
  const text = groups.map((g) => `${joinNames(g.names)} ${verbs[g.kind](g.names.length)}`).join(', ');
  const newest = entries.map((e) => e.day).filter(Boolean).sort().pop();
  const when = formatActionDay(newest, now);
  return when ? `${text} · ${when}` : text;
};

/**
 * Hört auf das private Attributionsdokument. Gilt nur für die zur aktuellen
 * Rotation passende Liste (listId und themeId), sonst bleibt es leer.
 * @param {string|null} uid
 * @param {{id: string, themeId?: string}|null} list - die Liste "Für dich entdeckt"
 * @return {Object<string, Array>} recipeId -> Einträge
 */
export function useFuerDichAttribution(uid, list) {
  const [recipes, setRecipes] = useState({});
  const listId = list?.id || null;
  const themeId = list?.themeId || null;

  useEffect(() => {
    setRecipes({});
    if (!uid || !listId) return undefined;
    return onSnapshot(
      doc(db, 'users', uid, 'fuerDichEntdeckt', 'current'),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        const fits = data && data.listId === listId && (!themeId || data.themeId === themeId);
        setRecipes(fits && data.recipes && typeof data.recipes === 'object' ? data.recipes : {});
      },
      () => setRecipes({}),
    );
  }, [uid, listId, themeId]);

  return recipes;
}
