/**
 * Namen und Beschreibungen von Listen, Menüs und Events übersetzen (Vorhaben Mehrsprachigkeit,
 * docs/vorhaben/mehrsprachigkeit.md, PR 6u): Prompt, Antwortschema und Prüfung der Gemini-Antwort,
 * genutzt von den Triggern und vom Backfill in handlers/uebersetzung.js. Ohne Firestore und Netz,
 * damit es ohne Emulator testbar ist. Muster: Rezepttitel (shared/titelUebersetzung.js).
 *
 * Arten (NAMEN_ARTEN) und wo sie liegen:
 *   liste  groups/{id}                 name, description (ohne die öffentliche Systemliste)
 *   menue  menus/{id}                  name, description
 *   event  users/{uid}/events/{id}     eventName (Events haben keine Beschreibung)
 *
 * Feld am Dokument, das nur die Cloud Functions schreiben (firestore.rules):
 *   textUebersetzung: {quelle: {name, description}, originalSprache, en: {name, description},
 *                      fr: {name, description}, version, modell, erstelltAm}
 * `name` und `description` stehen hier für die Felder der Art (bei Events `eventName`). `quelle`
 * sind die übersetzten Texte, getrimmt. Jedes Feld gilt für sich: Weicht der Name von `quelle.name`
 * ab, zeigt der Client bis zur neuen Übersetzung den Originalnamen, die Beschreibung aber weiter
 * übersetzt, solange sie passt (src/i18n/textUebersetzung.js).
 *
 * Wie bei Rezepten ist das Original immer deutsch (Entscheidung „Primärsprache“): Was nicht deutsch
 * ist, bleibt als feststehender Begriff stehen, ebenso Marken und Eigennamen. Die öffentliche
 * Systemliste („Öffentlich“) übersetzt die App selbst (src/i18n/texte/gruppen.js).
 */

const {ORIGINAL_SPRACHE, ZIEL_SPRACHEN} = require('./sprachen');

const NAMEN_VERSION = 1;
const MAX_NAME_LAENGE = 200;
const MAX_BESCHREIBUNG_LAENGE = 2000;
/** Übersetzungen dürfen länger sein als das Original (Französisch). */
const MAX_UEBERSETZUNG_FAKTOR = 2;
/** So viele Dokumente gehen höchstens in einen Gemini-Aufruf (Backfill). */
const MAX_NAMEN_JE_AUFRUF = 25;

/**
 * Je Art: Feldnamen im Dokument, was davon ausgenommen ist und was die Texte sind (für den Prompt).
 * `beschreibung: null` heißt: die Art hat keine Beschreibung.
 */
const NAMEN_ARTEN = {
  liste: {
    name: 'name',
    beschreibung: 'description',
    ausgenommen: (daten) => daten.type === 'public',
    kontext: 'Rezeptlisten. Mitglieder legen sie an, um Rezepte zu sammeln (z. B. „Sonntagsessen“, ' +
      '„Grillabend mit Freunden“).',
  },
  menue: {
    name: 'name',
    beschreibung: 'description',
    ausgenommen: () => false,
    kontext: 'Menüs. Ein Menü fasst die Gänge eines Essens zu einem Anlass zusammen (z. B. ' +
      '„Weihnachtsessen 2026“, „Sommerfest bei Anna“).',
  },
  event: {
    name: 'eventName',
    beschreibung: null,
    ausgenommen: () => false,
    kontext: 'Events. Ein Event ist eine Feier, für die Getränke geplant werden (z. B. „Gartenparty“, ' +
      '„Silvester bei Ben“); es hat nur einen Namen, description ist immer leer.',
  },
};

const TEXTE_SCHEMA = {
  type: 'OBJECT',
  properties: {name: {type: 'STRING'}, description: {type: 'STRING'}},
  required: ['name', 'description'],
};

const NAMEN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    eintraege: {
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
  required: ['eintraege'],
};

const getrimmt = (wert) => (typeof wert === 'string' ? wert.trim() : '');

/**
 * @param {string} art - Schlüssel in NAMEN_ARTEN
 * @return {object} Beschreibung der Art
 */
function artVon(art) {
  const eintrag = NAMEN_ARTEN[art];
  if (!eintrag) throw new Error(`Unbekannte Art: ${art}`);
  return eintrag;
}

/**
 * Was an einem Dokument übersetzt wird, oder null, wenn es nicht übersetzt wird: ausgenommene
 * Dokumente (öffentliche Systemliste), Dokumente ohne Namen und zu lange Texte.
 * @param {string} art - Schlüssel in NAMEN_ARTEN
 * @param {object} daten - Daten des Dokuments
 * @return {{name: string, description: string}|null}
 */
function quelleAus(art, daten) {
  const felder = artVon(art);
  if (!daten || felder.ausgenommen(daten)) return null;
  const name = getrimmt(daten[felder.name]);
  if (!name || name.length > MAX_NAME_LAENGE || /[\r\n]/.test(name)) return null;
  const description = felder.beschreibung ? getrimmt(daten[felder.beschreibung]) : '';
  if (description.length > MAX_BESCHREIBUNG_LAENGE) return null;
  return {name, description};
}

/**
 * Prompt für ein oder mehrere Dokumente einer Art. Die Texte stehen als JSON im Prompt, damit sie
 * Daten bleiben und keine Anweisungen werden können.
 * @param {string} art - Schlüssel in NAMEN_ARTEN
 * @param {Array<{name: string, description: string}>} quellen
 * @return {string}
 */
function baueNamenPrompt(art, quellen) {
  const eintraege = quellen.map(({name, description}, index) => ({nr: index + 1, name, description}));
  return [
    'Du übersetzt Namen und Beschreibungen aus einer deutschen Kochbuch-App ins Englische (en) und',
    `Französische (fr). Es sind ${artVon(art).kontext}`,
    'Jeder Text ist das deutsche Original, auch wenn er ganz oder teilweise in einer anderen Sprache steht.',
    '',
    'Für jeden Eintrag:',
    '- en, fr: name und description in dieser Sprache. Übersetze natürlich und im Ton des Originals; ein',
    '  Name bleibt kurz. Wird im Original geduzt, duze auf Französisch (tu), Englisch bleibt neutral.',
    '- Ist description leer, bleibt sie in beiden Sprachen leer. Zeilenumbrüche in description bleiben,',
    '  name hat keine.',
    '- Was nicht deutsch ist, ist ein feststehender Begriff und bleibt in beiden Sprachen genau so stehen',
    '  (z. B. Meal Prep, Comfort Food, Pulled Pork, Crème brûlée). Übersetzt werden nur die deutschen Wörter.',
    '- Eigennamen, Namen von Personen, Orten und Gerichten (z. B. Anna, Tiramisu, Wiener Schnitzel) sowie',
    '  Marken und Produktnamen bleiben stehen, auch wenn sie aus deutschen Wörtern bestehen. Zahlen und',
    '  Jahreszahlen bleiben.',
    '- Keine Anführungszeichen um den Text, keine Erklärungen, keine Emojis, nichts hinzufügen oder weglassen.',
    '- nr ist die Nummer des Eintrags aus der Eingabe.',
    '',
    'Einträge (JSON):',
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
  const description = sauberesFeld(texte?.description, maxBeschreibung, true);
  return description ? {name, description} : null;
}

/**
 * Prüft die Gemini-Antwort. Ungültige Einträge fallen weg; deren Dokumente gelten als
 * fehlgeschlagen und werden beim nächsten Anlass erneut versucht.
 * @param {*} antwort - geparstes JSON
 * @param {Array<{name: string, description: string}>} quellen - angefragte Texte
 * @return {Array<object|null>} je Dokument (Index wie angefragt) {en, fr} oder null
 */
function pruefeNamenAntwort(antwort, quellen) {
  const ergebnis = quellen.map(() => null);
  const eintraege = Array.isArray(antwort?.eintraege) ? antwort.eintraege : [];
  for (const eintrag of eintraege) {
    const nr = eintrag?.nr;
    if (!Number.isInteger(nr) || nr < 1 || nr > quellen.length || ergebnis[nr - 1]) continue;
    const texte = Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, pruefeTexte(eintrag[sprache], quellen[nr - 1])]));
    if (ZIEL_SPRACHEN.some((sprache) => !texte[sprache])) continue;
    ergebnis[nr - 1] = texte;
  }
  return ergebnis;
}

/**
 * Braucht dieses Dokument (neu) eine Übersetzung? Nicht, wenn es nicht übersetzt wird (quelleAus),
 * und nicht, wenn die Übersetzung zu Name und Beschreibung passt und nach den geltenden Regeln
 * entstand (`version`).
 * @param {string} art - Schlüssel in NAMEN_ARTEN
 * @param {object} daten - Daten des Dokuments
 * @return {boolean}
 */
function brauchtNamenUebersetzung(art, daten) {
  const quelle = quelleAus(art, daten);
  if (!quelle) return false;
  const uebersetzung = daten.textUebersetzung;
  const aktuell = uebersetzung?.quelle?.name === quelle.name &&
    (uebersetzung.quelle.description || '') === quelle.description &&
    Number(uebersetzung.version) >= NAMEN_VERSION;
  return !aktuell;
}

/**
 * Das Feld textUebersetzung für ein geprüftes Ergebnis.
 * @param {{name: string, description: string}} quelle - übersetzte Texte, wie in quelleAus
 * @param {object} ergebnis - {en: {name, description}, fr: {…}}
 * @param {string} modell
 * @param {number} jetzt - Date.now()
 * @return {object}
 */
function baueNamenUebersetzung(quelle, ergebnis, modell, jetzt) {
  return {
    quelle: {name: quelle.name, description: quelle.description},
    originalSprache: ORIGINAL_SPRACHE,
    ...Object.fromEntries(ZIEL_SPRACHEN.map((sprache) => [sprache, {...ergebnis[sprache]}])),
    version: NAMEN_VERSION,
    modell,
    erstelltAm: jetzt,
  };
}

module.exports = {
  NAMEN_VERSION,
  NAMEN_ARTEN,
  MAX_NAME_LAENGE,
  MAX_BESCHREIBUNG_LAENGE,
  MAX_NAMEN_JE_AUFRUF,
  NAMEN_RESPONSE_SCHEMA,
  quelleAus,
  baueNamenPrompt,
  pruefeNamenAntwort,
  brauchtNamenUebersetzung,
  baueNamenUebersetzung,
};
