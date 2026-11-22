/**
 * Rezepttitel übersetzen (Vorhaben Mehrsprachigkeit, docs/vorhaben/mehrsprachigkeit.md, PR 3):
 * Prompt, Antwortschema und Prüfung der Gemini-Antwort, genutzt vom Trigger und vom Backfill
 * in handlers/uebersetzung.js. Ohne Firestore und Netz, damit es ohne Emulator testbar ist.
 *
 * Feld am Rezept, das nur die Cloud Function schreibt (firestore.rules):
 *   titelUebersetzung: {quelle, originalSprache, de, en, fr, modell, erstelltAm}
 * `quelle` ist der Titel, der übersetzt wurde. Weicht `title` davon ab, ist die Übersetzung
 * veraltet: Der Trigger übersetzt neu, der Client zeigt bis dahin das Original
 * (src/i18n/rezeptTitel.js).
 */

const {SPRACHEN} = require('./sprachen');

/** Erkannte Sprache des Originals; „andere“ z. B. für einen italienischen Titel. */
const ORIGINAL_SPRACHEN = [...SPRACHEN, 'andere'];
const MAX_TITEL_LAENGE = 200;
/** So viele Titel gehen höchstens in einen Gemini-Aufruf (Backfill). */
const MAX_TITEL_JE_AUFRUF = 25;

const TITEL_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    titel: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nr: {type: 'INTEGER'},
          originalSprache: {type: 'STRING', format: 'enum', enum: ORIGINAL_SPRACHEN},
          ...Object.fromEntries(SPRACHEN.map((sprache) => [sprache, {type: 'STRING'}])),
        },
        required: ['nr', 'originalSprache', ...SPRACHEN],
      },
    },
  },
  required: ['titel'],
};

/**
 * Prompt für einen oder mehrere Titel. Die Titel stehen als JSON im Prompt, damit sie
 * Daten bleiben und keine Anweisungen werden können.
 * @param {string[]} titel
 * @return {string}
 */
function baueTitelPrompt(titel) {
  const liste = titel.map((text, index) => ({nr: index + 1, text}));
  return [
    'Du übersetzt Rezepttitel eines Kochbuchs ins Deutsche (de), Englische (en) und Französische (fr).',
    '',
    'Für jeden Titel:',
    '- originalSprache: die Sprache des Titels, "de", "en" oder "fr", sonst "andere".',
    '- de, en, fr: der Titel in dieser Sprache. In seiner Originalsprache bleibt er unverändert.',
    '- Übersetze so, wie man das Gericht in der Zielsprache in einem Kochbuch nennen würde: kurz und natürlich.',
    '- Feststehende Gerichtsnamen (z. B. Tiramisu, Ratatouille, Shakshuka, Wiener Schnitzel), Eigennamen',
    '  und Marken bleiben stehen.',
    '- Keine Anführungszeichen, keine Erklärungen, keine Emojis, nichts hinzufügen oder weglassen.',
    '- nr ist die Nummer des Titels aus der Liste.',
    '',
    'Titel (JSON):',
    JSON.stringify(liste),
  ].join('\n');
}

/**
 * @param {*} wert
 * @return {string|null} bereinigter Text oder null, wenn er nicht taugt
 */
function sauberesFeld(wert) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  if (!text || text.length > MAX_TITEL_LAENGE || /[\r\n]/.test(text)) return null;
  return text;
}

/**
 * Prüft die Gemini-Antwort. Ungültige Einträge fallen weg; deren Titel gelten als
 * fehlgeschlagen und werden beim nächsten Anlass erneut versucht.
 * @param {*} antwort - geparstes JSON
 * @param {number} anzahl - Zahl der angefragten Titel
 * @return {Array<object|null>} je Titel (Index wie angefragt) {originalSprache, de, en, fr} oder null
 */
function pruefeTitelAntwort(antwort, anzahl) {
  const ergebnis = Array.from({length: anzahl}, () => null);
  const eintraege = Array.isArray(antwort?.titel) ? antwort.titel : [];
  for (const eintrag of eintraege) {
    const nr = eintrag?.nr;
    if (!Number.isInteger(nr) || nr < 1 || nr > anzahl || ergebnis[nr - 1]) continue;
    if (!ORIGINAL_SPRACHEN.includes(eintrag.originalSprache)) continue;
    const texte = Object.fromEntries(SPRACHEN.map((sprache) => [sprache, sauberesFeld(eintrag[sprache])]));
    if (SPRACHEN.some((sprache) => !texte[sprache])) continue;
    ergebnis[nr - 1] = {originalSprache: eintrag.originalSprache, ...texte};
  }
  return ergebnis;
}

/**
 * Braucht dieses Rezept (neu) eine Übersetzung des Titels? Nicht bei laufenden oder
 * gescheiterten Importen (`importStatus` gesetzt, der Titel ist dann noch vorläufig),
 * nicht ohne Titel und nicht, wenn die Übersetzung zum aktuellen Titel passt.
 * @param {object} rezept - Daten des Rezeptdokuments
 * @return {boolean}
 */
function brauchtTitelUebersetzung(rezept) {
  if (!rezept || rezept.importStatus) return false;
  const titel = rezept.title;
  if (typeof titel !== 'string' || !titel.trim() || titel.length > MAX_TITEL_LAENGE) return false;
  return rezept.titelUebersetzung?.quelle !== titel;
}

/**
 * Das Feld titelUebersetzung für ein geprüftes Ergebnis.
 * @param {string} quelle - übersetzter Titel, genau wie im Rezept
 * @param {{originalSprache: string, de: string, en: string, fr: string}} ergebnis
 * @param {string} modell
 * @param {number} jetzt - Date.now()
 * @return {object}
 */
function baueTitelUebersetzung(quelle, ergebnis, modell, jetzt) {
  return {
    quelle,
    originalSprache: ergebnis.originalSprache,
    ...Object.fromEntries(SPRACHEN.map((sprache) => [sprache, ergebnis[sprache]])),
    modell,
    erstelltAm: jetzt,
  };
}

module.exports = {
  ORIGINAL_SPRACHEN,
  MAX_TITEL_LAENGE,
  MAX_TITEL_JE_AUFRUF,
  TITEL_RESPONSE_SCHEMA,
  baueTitelPrompt,
  pruefeTitelAntwort,
  brauchtTitelUebersetzung,
  baueTitelUebersetzung,
};
