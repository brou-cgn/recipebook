/**
 * Themen für die Kachel "Für dich entdeckt" (Collection `discoverTopics`)
 *
 * Admins pflegen die Themen in den Einstellungen. Der wöchentliche
 * Rotationsjob (functions/fuerDichEntdecktRotation.js) zieht daraus ein
 * aktuell relevantes Thema und befüllt damit die persönlichen Listen:
 *   rubrik       -> kleine Rubrik über dem Titel (themeLabel), z. B. "Saison"
 *   beschreibung -> Thementitel auf der Kachel (Listenbeschreibung)
 *   recipeIds    -> relevante Rezepte, aus denen gezogen wird
 *   periodStart / periodEnd -> jährlicher Zeitraum als 'MM-DD' (beide
 *     inklusive; Start > Ende läuft über den Jahreswechsel; beide leer =
 *     ganzjährig)
 *   isActive     -> false nimmt das Thema aus der Rotation
 *   displayDays  -> Anzeige-Dauer in Tagen (leer = 7)
 *   recipeRule   -> Regel, die zusätzlich zu recipeIds Rezepte auswählt:
 *     ingredientIds / mealCategories / cuisines: { include: [], exclude: [] }
 *     created / lastCooked: { minDays, maxDays } = Alter in Tagen (inklusive;
 *       gleiche Werte = "genau vor n Tagen"; null = offen)
 *     dateMode: 'all' | 'any' – gelten beide Datumsbedingungen oder eine
 *     Die Auswertung passiert im Rotationsjob (functions/).
 */

import { db } from '../firebase';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { removeUndefinedFields } from './firestoreUtils';

const COLLECTION = 'discoverTopics';

export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Tage je Monat in einem Schaltjahr: 29.02. ist gültig, weil der Zeitraum jedes Jahr gilt.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isValidMonthDay = (value) => {
  if (!MONTH_DAY.test(value || '')) return false;
  const [month, day] = value.split('-').map(Number);
  return day <= DAYS_IN_MONTH[month - 1];
};

export const toMonthDay = (month, day) =>
  `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** 'MM-DD' -> '15. Oktober'; leere/ungültige Werte -> ''. */
export const formatMonthDay = (value) => {
  if (!isValidMonthDay(value)) return '';
  const [month, day] = value.split('-').map(Number);
  return `${day}. ${MONTH_NAMES[month - 1]}`;
};

/** Zeitraum für die Listenansicht, z. B. "15. September – 30. November". */
export const formatPeriod = (topic) => {
  const start = formatMonthDay(topic?.periodStart);
  const end = formatMonthDay(topic?.periodEnd);
  if (!topic?.periodStart && !topic?.periodEnd) return 'Ganzjährig';
  if (!start || !end) return 'Unvollständig';
  return `${start} – ${end}`;
};

export const DEFAULT_DISPLAY_DAYS = 7;

const cleanValues = (values) => [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];
const cleanFilter = (filter) => ({ include: cleanValues(filter?.include), exclude: cleanValues(filter?.exclude) });
const toDays = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
};
const cleanRange = (range) => ({ minDays: toDays(range?.minDays), maxDays: toDays(range?.maxDays) });

export const emptyRecipeRule = () => ({
  ingredientIds: { include: [], exclude: [] },
  mealCategories: { include: [], exclude: [] },
  cuisines: { include: [], exclude: [] },
  created: { minDays: null, maxDays: null },
  lastCooked: { minDays: null, maxDays: null },
  dateMode: 'all',
});

/** Bereinigte Kopie der Regel (getrimmt, ohne Duplikate, Tage als Zahl oder null). */
export const normalizeRecipeRule = (rule) => ({
  ingredientIds: cleanFilter(rule?.ingredientIds),
  mealCategories: cleanFilter(rule?.mealCategories),
  cuisines: cleanFilter(rule?.cuisines),
  created: cleanRange(rule?.created),
  lastCooked: cleanRange(rule?.lastCooked),
  dateMode: rule?.dateMode === 'any' ? 'any' : 'all',
});

const filterActive = (f) => f.include.length > 0 || f.exclude.length > 0;
const rangeActive = (r) => r.minDays !== null || r.maxDays !== null;

export const hasRecipeRule = (rule) => {
  const r = normalizeRecipeRule(rule);
  return filterActive(r.ingredientIds) || filterActive(r.mealCategories) || filterActive(r.cuisines)
    || rangeActive(r.created) || rangeActive(r.lastCooked);
};

const describeRange = (label, { minDays, maxDays }) => {
  if (minDays !== null && minDays === maxDays) return `${label} vor genau ${minDays} Tagen`;
  if (minDays !== null && maxDays !== null) return `${label} vor ${minDays}–${maxDays} Tagen`;
  if (minDays !== null) return `${label} vor mind. ${minDays} Tagen`;
  return `${label} vor höchstens ${maxDays} Tagen`;
};

const describeFilter = (label, f) => [
  f.include.length ? `${label}: ${f.include.join(' / ')}` : '',
  f.exclude.length ? `${label} nicht: ${f.exclude.join(' / ')}` : '',
].filter(Boolean);

/** Kurzfassung der Regel für die Listenansicht; '—' wenn keine Regel gesetzt ist. */
export const formatRecipeRule = (rule) => {
  if (!hasRecipeRule(rule)) return '—';
  const r = normalizeRecipeRule(rule);
  const dates = [
    rangeActive(r.created) ? describeRange('erstellt', r.created) : '',
    rangeActive(r.lastCooked) ? describeRange('gekocht', r.lastCooked) : '',
  ].filter(Boolean).join(r.dateMode === 'any' ? ' oder ' : ' und ');
  return [
    ...describeFilter('Zutat', r.ingredientIds),
    ...describeFilter('Kategorie', r.mealCategories),
    ...describeFilter('Küche', r.cuisines),
    dates,
  ].filter(Boolean).join(' · ');
};

/** Anzeige-Dauer für die Listenansicht, z. B. "7 Tage". */
export const formatDisplayDays = (topic) => {
  const days = Number(topic?.displayDays);
  const value = Number.isInteger(days) && days >= 1 ? days : DEFAULT_DISPLAY_DAYS;
  return value === 1 ? '1 Tag' : `${value} Tage`;
};

/**
 * Prüft ein Thema vor dem Speichern.
 * @returns {string} Fehlermeldung oder '' wenn gültig
 */
export const validateTopic = (topic) => {
  if (!String(topic?.rubrik || '').trim()) return 'Bitte eine Rubrik angeben.';
  if (!String(topic?.beschreibung || '').trim()) return 'Bitte eine Beschreibung angeben.';
  const hasStart = Boolean(topic.periodStart);
  const hasEnd = Boolean(topic.periodEnd);
  if (hasStart !== hasEnd) return 'Bitte Beginn und Ende des Zeitraums angeben – oder beides leer lassen (ganzjährig).';
  if (hasStart && (!isValidMonthDay(topic.periodStart) || !isValidMonthDay(topic.periodEnd))) {
    return 'Der Zeitraum enthält ein ungültiges Datum.';
  }
  const days = toDays(topic.displayDays);
  if (days !== null && (!Number.isInteger(days) || days < 1)) {
    return 'Die Anzeige-Dauer muss mindestens 1 Tag betragen.';
  }
  const rule = normalizeRecipeRule(topic.recipeRule);
  for (const [name, range] of [['Erstellt am', rule.created], ['Zuletzt gekocht', rule.lastCooked]]) {
    const values = [range.minDays, range.maxDays];
    if (values.some((v) => v !== null && (Number.isNaN(v) || v < 0))) {
      return `${name}: Tage müssen eine Zahl ab 0 sein.`;
    }
    if (range.minDays !== null && range.maxDays !== null && range.minDays > range.maxDays) {
      return `${name}: „Mindestens" darf nicht größer sein als „Höchstens".`;
    }
  }
  return '';
};

/** Themen nach Zeitraum-Beginn (ganzjährige zuletzt), dann nach Rubrik. */
export const sortTopics = (topics) =>
  [...topics].sort((a, b) => {
    const aStart = a.periodStart || '99-99';
    const bStart = b.periodStart || '99-99';
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    return String(a.rubrik || '').localeCompare(String(b.rubrik || ''), 'de');
  });

export const subscribeToDiscoverTopics = (callback) =>
  onSnapshot(collection(db, COLLECTION), (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (error) => {
    if (error?.code === 'permission-denied') {
      console.warn('Discover topics subscription skipped: permission denied');
    } else {
      console.error('Error subscribing to discover topics:', error);
    }
    callback([]);
  });

const toDocData = (topic, updatedBy) => removeUndefinedFields({
  rubrik: String(topic.rubrik).trim(),
  beschreibung: String(topic.beschreibung).trim(),
  recipeIds: [...new Set(topic.recipeIds || [])],
  periodStart: topic.periodStart || '',
  periodEnd: topic.periodEnd || '',
  isActive: topic.isActive !== false,
  displayDays: toDays(topic.displayDays),
  recipeRule: normalizeRecipeRule(topic.recipeRule),
  updatedAt: serverTimestamp(),
  updatedBy,
});

/** Legt ein Thema an (ohne `id`) oder überschreibt es (mit `id`). */
export const saveDiscoverTopic = async (topic, updatedBy) => {
  const error = validateTopic(topic);
  if (error) throw new Error(error);
  const data = toDocData(topic, updatedBy);
  if (topic.id) {
    await setDoc(doc(db, COLLECTION, topic.id), data, { merge: true });
    return topic.id;
  }
  const ref = await addDoc(collection(db, COLLECTION), { ...data, createdAt: serverTimestamp() });
  return ref.id;
};

export const deleteDiscoverTopic = (id) => deleteDoc(doc(db, COLLECTION, id));
