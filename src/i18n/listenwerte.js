/**
 * Übersetzte Auswahllisten (Vorhaben Mehrsprachigkeit, PR 5, docs/vorhaben/mehrsprachigkeit.md).
 *
 * Gespeichert bleibt immer der deutsche Wert (so steht er in Rezepten und Filtern). Übersetzt
 * wird nur die Anzeige, über das Feld `listenUebersetzungen` in settings/app:
 *
 *   { cuisineTypes: [{ wert: 'Italienische Küche', en: 'Italian cuisine', fr: 'Cuisine italienne' }],
 *     portionUnits: [{ wert: 'portion', en: { einzahl: 'serving', mehrzahl: 'servings' }, fr: {…} }] }
 *
 * `wert` ist bei Textlisten der deutsche Wert, bei Einheiten die `id` der Einheit. Listen statt
 * Schlüssel, weil Werte wie „Pck.“ als Feldnamen in Firestore nicht taugen. Fehlt eine
 * Übersetzung, bleibt es beim Original.
 */
import { localeFuer, SPRACH_IDS, STANDARD_SPRACHE } from './sprachen';

/** Listen, die übersetzt werden; `art` 'text' (Werte) oder 'einheit' (id, singular, plural). */
export const UEBERSETZBARE_LISTEN = Object.freeze([
  { id: 'cuisineTypes', name: 'Kulinarik-Typen', art: 'text' },
  { id: 'cuisineGroups', name: 'Kulinarik-Gruppen', art: 'text' },
  { id: 'mealCategories', name: 'Speisekategorien', art: 'text' },
  { id: 'units', name: 'Maßeinheiten', art: 'text' },
  { id: 'portionUnits', name: 'Portionseinheiten', art: 'einheit' },
  { id: 'packageUnits', name: 'Gebindeeinheiten', art: 'einheit' },
  { id: 'drinkUnits', name: 'Getränkeeinheiten', art: 'einheit' },
]);

/** Zielsprachen der Übersetzung: alle außer Deutsch. */
export const ZIELSPRACHEN = Object.freeze(SPRACH_IDS.filter((sprache) => sprache !== STANDARD_SPRACHE));

const istText = (wert) => typeof wert === 'string' && wert.trim() !== '';
const istEinheitText = (wert) => Boolean(wert) && istText(wert.einzahl) && istText(wert.mehrzahl);

/**
 * Die Quellwerte einer Liste aus den Einstellungen: Texte bzw. Einheiten mit Einzahl und Mehrzahl.
 * Bei Kulinarik-Gruppen zählt der Gruppenname.
 * @param {Object} lists - Listen wie aus getCustomLists
 * @param {string} listeId
 * @returns {Array<{wert: string, text?: string, einzahl?: string, mehrzahl?: string}>}
 */
export function quellwerte(lists, listeId) {
  const liste = UEBERSETZBARE_LISTEN.find((eintrag) => eintrag.id === listeId);
  const werte = Array.isArray(lists?.[listeId]) ? lists[listeId] : [];
  if (!liste) return [];
  if (liste.art === 'einheit') {
    return werte
      .filter((einheit) => einheit && istText(einheit.id) && istText(einheit.singular))
      .map((einheit) => ({ wert: einheit.id, einzahl: einheit.singular, mehrzahl: einheit.plural || einheit.singular }));
  }
  const texte = werte.map((wert) => (listeId === 'cuisineGroups' ? wert?.name : wert)).filter(istText);
  return [...new Set(texte)].map((text) => ({ wert: text, text }));
}

/**
 * Nachschlagetabelle aus `listenUebersetzungen`.
 * @param {Object|null|undefined} uebersetzungen
 * @returns {Map<string, Map<string, Object>>} je Liste: Wert → Eintrag
 */
export function baueListenIndex(uebersetzungen) {
  const index = new Map();
  UEBERSETZBARE_LISTEN.forEach(({ id }) => {
    const eintraege = Array.isArray(uebersetzungen?.[id]) ? uebersetzungen[id] : [];
    index.set(id, new Map(eintraege.filter((eintrag) => istText(eintrag?.wert)).map((eintrag) => [eintrag.wert, eintrag])));
  });
  return index;
}

/**
 * Anzeigetext eines Listenwerts, sonst das Original.
 * @param {Map} index - aus baueListenIndex
 * @param {string} listeId
 * @param {string} wert - gespeicherter deutscher Wert
 * @param {string} sprache
 * @returns {string}
 */
export function listenwertText(index, listeId, wert, sprache) {
  if (sprache === STANDARD_SPRACHE) return wert;
  const uebersetzt = index?.get(listeId)?.get(wert)?.[sprache];
  return istText(uebersetzt) ? uebersetzt : wert;
}

const pluralRegeln = new Map();
const istEinzahl = (sprache, anzahl) => {
  const locale = localeFuer(sprache);
  if (!pluralRegeln.has(locale)) pluralRegeln.set(locale, new Intl.PluralRules(locale));
  return pluralRegeln.get(locale).select(anzahl) === 'one';
};

/**
 * Name einer Einheit für eine Menge, z. B. „4 servings“. Auf Deutsch wie bisher (1 → Einzahl).
 * @param {Map} index - aus baueListenIndex
 * @param {string} listeId - 'portionUnits', 'packageUnits' oder 'drinkUnits'
 * @param {{id: string, singular: string, plural: string}} einheit
 * @param {string} sprache
 * @param {number} anzahl
 * @returns {string}
 */
export function einheitText(index, listeId, einheit, sprache, anzahl) {
  const deutsch = anzahl === 1 ? einheit?.singular : (einheit?.plural || einheit?.singular);
  if (sprache === STANDARD_SPRACHE || !einheit) return deutsch || '';
  const uebersetzt = index?.get(listeId)?.get(einheit.id)?.[sprache];
  if (!istEinheitText(uebersetzt)) return deutsch || '';
  return istEinzahl(sprache, anzahl) ? uebersetzt.einzahl : uebersetzt.mehrzahl;
}

/**
 * Name einer Kulinarik (Typ oder Gruppe; Filter-Chips zeigen beides).
 * @param {Map} index
 * @param {string} name
 * @param {string} sprache
 * @returns {string}
 */
export function kulinarikText(index, name, sprache) {
  const alsGruppe = listenwertText(index, 'cuisineGroups', name, sprache);
  return alsGruppe !== name ? alsGruppe : listenwertText(index, 'cuisineTypes', name, sprache);
}

/**
 * Quellwerte, denen in einer Zielsprache noch die Übersetzung fehlt, über alle Listen.
 * @param {Object} lists
 * @param {Object|null} uebersetzungen
 * @returns {Array<{liste: string, wert: string, text?: string, einzahl?: string, mehrzahl?: string}>}
 */
export function fehlendeUebersetzungen(lists, uebersetzungen) {
  const index = baueListenIndex(uebersetzungen);
  return UEBERSETZBARE_LISTEN.flatMap(({ id, art }) => quellwerte(lists, id)
    .filter((quelle) => {
      const eintrag = index.get(id).get(quelle.wert);
      return ZIELSPRACHEN.some((sprache) => !(art === 'einheit' ? istEinheitText(eintrag?.[sprache]) : istText(eintrag?.[sprache])));
    })
    .map((quelle) => ({ liste: id, ...quelle })));
}

/**
 * Setzt einen Eintrag (eine Liste, ein Wert, eine Sprache) und gibt eine neue Struktur zurück.
 * Leere Texte entfernen die Übersetzung dieser Sprache.
 * @param {Object|null} uebersetzungen
 * @param {string} listeId
 * @param {string} wert
 * @param {string} sprache
 * @param {string|{einzahl: string, mehrzahl: string}} uebersetzung
 * @returns {Object}
 */
export function mitUebersetzung(uebersetzungen, listeId, wert, sprache, uebersetzung) {
  const liste = Array.isArray(uebersetzungen?.[listeId]) ? uebersetzungen[listeId] : [];
  const vorhanden = liste.find((eintrag) => eintrag?.wert === wert) || { wert };
  const leer = typeof uebersetzung === 'string' ? !istText(uebersetzung) : !uebersetzung;
  const { [sprache]: _alt, ...rest } = vorhanden;
  const neu = leer ? rest : { ...rest, [sprache]: uebersetzung };
  const andere = liste.filter((eintrag) => eintrag?.wert !== wert);
  const hatUebersetzung = ZIELSPRACHEN.some((ziel) => neu[ziel] !== undefined);
  return { ...(uebersetzungen || {}), [listeId]: hatUebersetzung ? [...andere, neu] : andere };
}

/**
 * Nur die Übersetzungen behalten, deren Wert es in den Listen noch gibt (entfernte Werte
 * nehmen ihre Übersetzung mit).
 * @param {Object} lists
 * @param {Object|null} uebersetzungen
 * @returns {Object}
 */
export function bereinigeUebersetzungen(lists, uebersetzungen) {
  const ergebnis = {};
  UEBERSETZBARE_LISTEN.forEach(({ id }) => {
    const gueltig = new Set(quellwerte(lists, id).map((quelle) => quelle.wert));
    const eintraege = Array.isArray(uebersetzungen?.[id]) ? uebersetzungen[id] : [];
    const behalten = eintraege.filter((eintrag) => gueltig.has(eintrag?.wert));
    if (behalten.length) ergebnis[id] = behalten;
  });
  return ergebnis;
}
