/**
 * Namen und Beschreibungen privater Listen übersetzen (Vorhaben Mehrsprachigkeit,
 * docs/vorhaben/mehrsprachigkeit.md, PR 6u): Prompt, Antwortschema und Prüfung der Gemini-Antwort,
 * genutzt vom Trigger und vom Backfill in handlers/uebersetzung.js. Ohne Firestore und Netz, damit
 * es ohne Emulator testbar ist. Muster: Rezepttitel (shared/titelUebersetzung.js).
 *
 * Feld an der Liste (groups/{id}), das nur die Cloud Function schreibt (firestore.rules):
 *   textUebersetzung: {quelle: {name, description}, originalSprache, en: {name, description},
 *                      fr: {name, description}, version, modell, erstelltAm}
 * `quelle` sind Name und Beschreibung, die übersetzt wurden. Jedes Feld gilt für sich: Weicht
 * `name` von `quelle.name` ab, zeigt der Client bis zur neuen Übersetzung den Originalnamen, die
 * Beschreibung aber weiter übersetzt, solange sie passt (src/i18n/listenText.js).
 *
 * Wie bei Rezepten ist das Original immer deutsch (Entscheidung „Primärsprache“): Was nicht deutsch
 * ist, bleibt als feststehender Begriff stehen, ebenso Marken und Eigennamen. Die öffentliche
 * Systemliste („Öffentlich“) übersetzt die App selbst (src/i18n/texte/gruppen.js), sie bleibt hier
 * außen vor.
 */

const {ORIGINAL_SPRACHE, ZIEL_SPRACHEN} = require('./sprachen');

const LISTEN_TEXT_VERSION = 1;
/** Die App erlaubt 80 Zeichen für den Namen und 300 für die Beschreibung; Spielraum für ältere Listen. */
const MAX_NAME_LAENGE = 200;
const MAX_BESCHREIBUNG_LAENGE = 1000;
/** Übersetzungen dürfen länger sein als das Original (Französisch). */
const MAX_UEBERSETZUNG_FAKTOR = 2;
/** So viele Listen gehen höchstens in einen Gemini-Aufruf (Backfill). */
const MAX_LISTEN_JE_AUFRUF = 25;

const TEXTE_SCHEMA = {
  type: 'OBJECT',
  properties: {name: {type: 'STRING'}, description: {type: 'STRING'}},
  required: ['name', 'description'],
};

const LISTEN_TEXT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    listen: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nr: {type: 'INTEGER'},
          ...Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, TEXTE_SCHEMA])),
        },
        required: ['nr', ...ZIEL_SPRACHEN],
      },
    },
  },
  required: ['listen'],
};

const beschreibungVon = (liste) => (typeof liste?.description === 'string' ? liste.description.trim() : '');

/**
 * Was an einer Liste übersetzt wird, oder null, wenn sie nicht übersetzt wird: die öffentliche
 * Systemliste, Listen ohne Namen und zu lange Texte.
 * @param {object} liste - Daten des Listendokuments
 * @return {{name: string, description: string}|null}
 */
function quelleAusListe(liste) {
  if (!liste || liste.type === 'public') return null;
  const name = typeof liste.name === 'string' ? liste.name.trim() : '';
  if (!name || name.length > MAX_NAME_LAENGE || /[\r\n]/.test(name)) return null;
  const description = beschreibungVon(liste);
  if (description.length > MAX_BESCHREIBUNG_LAENGE) return null;
  return {name, description};
}

/**
 * Prompt für eine oder mehrere Listen. Die Texte stehen als JSON im Prompt, damit sie Daten
 * bleiben und keine Anweisungen werden können.
 * @param {Array<{name: string, description: string}>} listen
 * @return {string}
 */
function baueListenTextPrompt(listen) {
  const eintraege = listen.map(({name, description}, index) => ({nr: index + 1, name, description}));
  return [
    'Du übersetzt Namen und Beschreibungen von Rezeptlisten eines deutschen Kochbuchs ins Englische (en)',
    'und Französische (fr). Mitglieder legen solche Listen an, um Rezepte zu sammeln (z. B. „Sonntagsessen“,',
    '„Grillabend mit Freunden“). Jeder Text ist das deutsche Original, auch wenn er ganz oder teilweise in',
    'einer anderen Sprache steht.',
    '',
    'Für jede Liste:',
    '- en, fr: name und description in dieser Sprache. Übersetze natürlich und im Ton des Originals; ein',
    '  Name bleibt kurz. Wird im Original geduzt, duze auf Französisch (tu), Englisch bleibt neutral.',
    '- Ist description leer, bleibt sie in beiden Sprachen leer. Zeilenumbrüche in description bleiben,',
    '  name hat keine.',
    '- Was nicht deutsch ist, ist ein feststehender Begriff und bleibt in beiden Sprachen genau so stehen',
    '  (z. B. Meal Prep, Comfort Food, Pulled Pork, Crème brûlée). Übersetzt werden nur die deutschen Wörter.',
    '- Eigennamen, Namen von Personen, Orten und Gerichten (z. B. Omas, Tiramisu, Wiener Schnitzel) sowie',
    '  Marken und Produktnamen bleiben stehen, auch wenn sie aus deutschen Wörtern bestehen.',
    '- Keine Anführungszeichen um den Text, keine Erklärungen, keine Emojis, nichts hinzufügen oder weglassen.',
    '- nr ist die Nummer der Liste aus der Eingabe.',
    '',
    'Listen (JSON):',
    JSON.stringify(eintraege),
  ].join('\n');
}

/**
 * @param {*} wert
 * @param {number} maxLaenge
 * @param {boolean} mitUmbruch - Zeilenumbrüche erlaubt (Beschreibung)
 * @return {string|null} bereinigter Text oder null, wenn er nicht taugt
 */
function sauberesFeld(wert, maxLaenge, mitUmbruch) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  if (!text || text.length > maxLaenge) return null;
  if (!mitUmbruch && /[\r\n]/.test(text)) return null;
  return text;
}

/**
 * Prüft die Texte einer Sprache gegen das Original: Name immer, Beschreibung nur, wenn das Original
 * eine hat (sonst bleibt sie leer, egal was die KI liefert).
 * @param {*} texte - Antwort der KI für eine Sprache
 * @param {{name: string, description: string}} quelle
 * @return {{name: string, description: string}|null}
 */
function pruefeTexte(texte, quelle) {
  const name = sauberesFeld(texte?.name, MAX_NAME_LAENGE, false);
  if (!name) return null;
  if (!quelle.description) return {name, description: ''};
  const maxBeschreibung = Math.max(quelle.description.length * MAX_UEBERSETZUNG_FAKTOR, 100);
  const description = sauberesFeld(texte?.description, Math.min(maxBeschreibung, MAX_BESCHREIBUNG_LAENGE * MAX_UEBERSETZUNG_FAKTOR), true);
  return description ? {name, description} : null;
}

/**
 * Prüft die Gemini-Antwort. Ungültige Einträge fallen weg; deren Listen gelten als fehlgeschlagen
 * und werden beim nächsten Anlass erneut versucht.
 * @param {*} antwort - geparstes JSON
 * @param {Array<{name: string, description: string}>} listen - angefragte Texte
 * @return {Array<object|null>} je Liste (Index wie angefragt) {en, fr} oder null
 */
function pruefeListenTextAntwort(antwort, listen) {
  const ergebnis = listen.map(() => null);
  const eintraege = Array.isArray(antwort?.listen) ? antwort.listen : [];
  for (const eintrag of eintraege) {
    const nr = eintrag?.nr;
    if (!Number.isInteger(nr) || nr < 1 || nr > listen.length || ergebnis[nr - 1]) continue;
    const texte = Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, pruefeTexte(eintrag[sprache], listen[nr - 1])]));
    if (ZIEL_SPRACHEN.some((sprache) => !texte[sprache])) continue;
    ergebnis[nr - 1] = texte;
  }
  return ergebnis;
}

/**
 * Braucht diese Liste (neu) eine Übersetzung? Nicht die öffentliche Systemliste, nicht ohne Namen
 * und nicht, wenn die Übersetzung zu Name und Beschreibung passt und nach den geltenden Regeln
 * entstand (`version`).
 * @param {object} liste - Daten des Listendokuments
 * @return {boolean}
 */
function brauchtListenTextUebersetzung(liste) {
  const quelle = quelleAusListe(liste);
  if (!quelle) return false;
  const uebersetzung = liste.textUebersetzung;
  const aktuell = uebersetzung?.quelle?.name === quelle.name &&
    (uebersetzung.quelle.description || '') === quelle.description &&
    Number(uebersetzung.version) >= LISTEN_TEXT_VERSION;
  return !aktuell;
}

/**
 * Das Feld textUebersetzung für ein geprüftes Ergebnis.
 * @param {{name: string, description: string}} quelle - übersetzte Texte, wie in quelleAusListe
 * @param {object} ergebnis - {en: {name, description}, fr: {…}}
 * @param {string} modell
 * @param {number} jetzt - Date.now()
 * @return {object}
 */
function baueListenTextUebersetzung(quelle, ergebnis, modell, jetzt) {
  return {
    quelle: {name: quelle.name, description: quelle.description},
    originalSprache: ORIGINAL_SPRACHE,
    ...Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, {...ergebnis[sprache]}])),
    version: LISTEN_TEXT_VERSION,
    modell,
    erstelltAm: jetzt,
  };
}

module.exports = {
  LISTEN_TEXT_VERSION,
  MAX_NAME_LAENGE,
  MAX_BESCHREIBUNG_LAENGE,
  MAX_LISTEN_JE_AUFRUF,
  LISTEN_TEXT_RESPONSE_SCHEMA,
  quelleAusListe,
  baueListenTextPrompt,
  pruefeListenTextAntwort,
  brauchtListenTextUebersetzung,
  baueListenTextUebersetzung,
};
