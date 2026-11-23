/**
 * Rezepttitel übersetzen (Vorhaben Mehrsprachigkeit, docs/vorhaben/mehrsprachigkeit.md, PR 3):
 * Prompt, Antwortschema und Prüfung der Gemini-Antwort, genutzt vom Trigger und vom Backfill
 * in handlers/uebersetzung.js. Ohne Firestore und Netz, damit es ohne Emulator testbar ist.
 *
 * Feld am Rezept, das nur die Cloud Function schreibt (firestore.rules):
 *   titelUebersetzung: {quelle, originalSprache, de, en, fr, version, modell, erstelltAm}
 * `quelle` ist der Titel, der übersetzt wurde. Weicht `title` davon ab, ist die Übersetzung
 * veraltet: Der Trigger übersetzt neu, der Client zeigt bis dahin das Original
 * (src/i18n/rezeptTitel.js).
 *
 * Der Titel ist immer das deutsche Original (Entscheidung „Primärsprache“), auch wenn er ganz
 * oder teilweise englisch ist („American Pancakes“). Gemini übersetzt deshalb nur ins Englische
 * und Französische; `originalSprache` ist immer `de` und `de` der Titel selbst. Was im Titel nicht
 * deutsch ist, bleibt als feststehender Begriff in jeder Sprache stehen.
 *
 * `version` 2 steht für diese Regeln. Bis Version 1 (ohne Feld) erkannte Gemini die Sprache am Titel
 * allein und übersetzte englische Gerichtsnamen deutscher Rezepte ins Deutsche
 * („Amerikanische Pfannkuchen“). Solche Übersetzungen gelten als veraltet und werden beim
 * nächsten Schreiben des Rezepts oder im Backfill erneuert.
 */

const {ORIGINAL_SPRACHE, ZIEL_SPRACHEN} = require('./sprachen');

const TITEL_VERSION = 2;
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
          ...Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, {type: 'STRING'}])),
        },
        required: ['nr', ...ZIEL_SPRACHEN],
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
    'Du übersetzt Rezepttitel eines deutschen Kochbuchs ins Englische (en) und Französische (fr).',
    'Jeder Titel ist das deutsche Original, auch wenn er ganz oder teilweise in einer anderen Sprache steht.',
    '',
    'Für jeden Titel:',
    '- en, fr: der Titel in dieser Sprache. Übersetze so, wie man das Gericht in der Zielsprache in einem',
    '  Kochbuch nennen würde: kurz und natürlich.',
    '- Was im Titel nicht deutsch ist, ist ein feststehender Begriff und bleibt in beiden Sprachen genau so',
    '  stehen (z. B. American Pancakes, Pulled Pork, Banana Bread, Chili con Carne, Crème brûlée).',
    '  Übersetzt werden nur die deutschen Wörter (z. B. American Pancakes mit Blaubeeren →',
    '  American Pancakes with blueberries → American Pancakes aux myrtilles).',
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
 * fehlgeschlagen und werden beim nächsten Anlass erneut versucht. Weitere Felder (etwa eine
 * Originalsprache oder eine deutsche Fassung) zählen nicht: Deutsch ist immer das Original.
 * @param {*} antwort - geparstes JSON
 * @param {number} anzahl - Zahl der angefragten Titel
 * @return {Array<object|null>} je Titel (Index wie angefragt) {en, fr} oder null
 */
function pruefeTitelAntwort(antwort, anzahl) {
  const ergebnis = Array.from({length: anzahl}, () => null);
  const eintraege = Array.isArray(antwort?.titel) ? antwort.titel : [];
  for (const eintrag of eintraege) {
    const nr = eintrag?.nr;
    if (!Number.isInteger(nr) || nr < 1 || nr > anzahl || ergebnis[nr - 1]) continue;
    const texte = Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, sauberesFeld(eintrag[sprache])]));
    if (ZIEL_SPRACHEN.some((sprache) => !texte[sprache])) continue;
    ergebnis[nr - 1] = texte;
  }
  return ergebnis;
}

/**
 * Braucht dieses Rezept (neu) eine Übersetzung des Titels? Nicht bei laufenden oder
 * gescheiterten Importen (`importStatus` gesetzt, der Titel ist dann noch vorläufig),
 * nicht ohne Titel und nicht, wenn die Übersetzung zum aktuellen Titel passt und nach den
 * geltenden Regeln entstand (`version`).
 * @param {object} rezept - Daten des Rezeptdokuments
 * @return {boolean}
 */
function brauchtTitelUebersetzung(rezept) {
  if (!rezept || rezept.importStatus) return false;
  const titel = rezept.title;
  if (typeof titel !== 'string' || !titel.trim() || titel.length > MAX_TITEL_LAENGE) return false;
  const uebersetzung = rezept.titelUebersetzung;
  const aktuell = uebersetzung?.quelle === titel && Number(uebersetzung.version) >= TITEL_VERSION;
  return !aktuell;
}

/**
 * Das Feld titelUebersetzung für ein geprüftes Ergebnis.
 * @param {string} quelle - übersetzter Titel, genau wie im Rezept
 * @param {{en: string, fr: string}} ergebnis
 * @param {string} modell
 * @param {number} jetzt - Date.now()
 * @return {object}
 */
function baueTitelUebersetzung(quelle, ergebnis, modell, jetzt) {
  return {
    quelle,
    originalSprache: ORIGINAL_SPRACHE,
    [ORIGINAL_SPRACHE]: quelle,
    ...Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, ergebnis[sprache]])),
    version: TITEL_VERSION,
    modell,
    erstelltAm: jetzt,
  };
}

module.exports = {
  TITEL_VERSION,
  MAX_TITEL_LAENGE,
  MAX_TITEL_JE_AUFRUF,
  TITEL_RESPONSE_SCHEMA,
  baueTitelPrompt,
  pruefeTitelAntwort,
  brauchtTitelUebersetzung,
  baueTitelUebersetzung,
};
