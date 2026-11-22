/**
 * Rezeptinhalt übersetzen (Vorhaben Mehrsprachigkeit, docs/vorhaben/mehrsprachigkeit.md, PR 4):
 * Hash, Prompt, Antwortschema und Prüfung der Gemini-Antwort, genutzt von Trigger und Backfill
 * in handlers/uebersetzung.js. Ohne Firestore und Netz, damit es ohne Emulator testbar ist.
 *
 * Übersetzt werden Zutaten und Zubereitungsschritte samt Zwischenüberschriften. Das Ergebnis
 * steht in rezeptUebersetzungen/{recipeId}, geschrieben nur von der Cloud Function:
 *   {quellHash, originalSprache, schemaVersion, modell, erstelltAm,
 *    <sprache>: {zutaten: string[], schritte: string[]}}  (für jede Sprache außer der des Originals)
 * Die Listen stehen Eintrag für Eintrag wie im Rezept: gleiche Länge, gleiche Reihenfolge.
 * Verknüpfte Rezepte (#recipe:…) und leere Einträge bleiben unverändert.
 *
 * Die Menge am Anfang einer Zutat bleibt wie im Original. So rechnet die Portionsumrechnung
 * (scaleIngredient in src/utils/ingredientUtils.js, nur die Menge am Zeilenanfang) auch mit
 * übersetzten Zeilen.
 *
 * quellHash ist der sha256 von inhaltHashEingabe. Dieselbe Eingabe bildet
 * src/i18n/rezeptInhalt.js (Konsistenztest dort), damit die App eine veraltete Übersetzung
 * erkennt, ohne die Function zu fragen.
 */

const crypto = require('crypto');
const {SPRACHEN} = require('./sprachen');

const SCHEMA_VERSION = 1;
const HASH_KENNUNG = 'inhalt-v1';
const ORIGINAL_SPRACHEN = [...SPRACHEN, 'andere'];
const MAX_ZUTAT_LAENGE = 300;
const MAX_SCHRITT_LAENGE = 3000;

const liste = (wert) => (Array.isArray(wert) ? wert : []);
const eintragText = (eintrag) => {
  if (typeof eintrag === 'string') return eintrag;
  return typeof eintrag?.text === 'string' ? eintrag.text : '';
};
const istUeberschrift = (eintrag) => Boolean(eintrag) && typeof eintrag === 'object' && eintrag.type === 'heading';
/** Verknüpftes Rezept in den Zutaten (src/utils/recipeLinks.js): bleibt unübersetzt. */
const istRezeptVerknuepfung = (text) => /#recipe:[^:]+:/.test(text);

/**
 * Eingabe des quellHash: Art und Text jedes Eintrags von Zutaten und Schritten, in der
 * Reihenfolge des Rezepts. Leere Einträge zählen mit, weil die Übersetzung nach Position geht.
 * @param {object} rezept
 * @return {string}
 */
function inhaltHashEingabe(rezept) {
  const teil = (eintraege) => liste(eintraege).map((eintrag) => [istUeberschrift(eintrag) ? 'h' : '', eintragText(eintrag)]);
  return JSON.stringify([HASH_KENNUNG, teil(rezept?.ingredients), teil(rezept?.steps)]);
}

/**
 * @param {object} rezept
 * @return {string} sha256 der Hash-Eingabe als Hex
 */
function inhaltQuellHash(rezept) {
  return crypto.createHash('sha256').update(inhaltHashEingabe(rezept), 'utf8').digest('hex');
}

/**
 * Was an Gemini geht: nur Einträge mit Text, ohne Rezept-Verknüpfungen. `nr` ist die Position
 * im Rezept (ab 1), damit sich die Antwort sicher zuordnen lässt.
 * @param {object} rezept
 * @return {{zutaten: Array<object>, schritte: Array<object>}|null} null, wenn nichts zu übersetzen ist
 */
function anfrageAusRezept(rezept) {
  const auswahl = (eintraege, mitVerknuepfungen) => liste(eintraege).flatMap((eintrag, index) => {
    const text = eintragText(eintrag).trim();
    if (!text || (mitVerknuepfungen && istRezeptVerknuepfung(text))) return [];
    return [{nr: index + 1, text, ...(istUeberschrift(eintrag) ? {ueberschrift: true} : {})}];
  });
  const zutaten = auswahl(rezept?.ingredients, true);
  const schritte = auswahl(rezept?.steps, false);
  return zutaten.length || schritte.length ? {zutaten, schritte} : null;
}

const zeilenSchema = {
  type: 'ARRAY',
  items: {type: 'OBJECT', properties: {nr: {type: 'INTEGER'}, text: {type: 'STRING'}}, required: ['nr', 'text']},
};
const sprachSchema = {
  type: 'OBJECT',
  properties: {zutaten: zeilenSchema, schritte: zeilenSchema},
  required: ['zutaten', 'schritte'],
};

const INHALT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    originalSprache: {type: 'STRING', format: 'enum', enum: ORIGINAL_SPRACHEN},
    ...Object.fromEntries(SPRACHEN.map((sprache) => [sprache, sprachSchema])),
  },
  required: ['originalSprache'],
};

/**
 * @param {{zutaten: Array<object>, schritte: Array<object>}} anfrage
 * @return {string}
 */
function baueInhaltPrompt(anfrage) {
  return [
    'Du übersetzt den Inhalt eines Kochbuch-Rezepts: Zutaten und Zubereitungsschritte samt',
    'Zwischenüberschriften (ueberschrift: true).',
    '',
    '- originalSprache: die Sprache des Rezepts, "de", "en" oder "fr", sonst "andere".',
    '- Übersetze in jede Sprache aus de, en und fr außer der Originalsprache; bei "andere" in alle drei.',
    '  Die Originalsprache selbst lässt du weg.',
    '- Zutaten: Die Menge am Zeilenanfang bleibt genau wie im Original (Ziffern, Brüche wie 1/2,',
    '  Bereiche wie 2-3, Dezimalkomma wie 1,5). Einheit und Zutat schreibst du so, wie man sie in der',
    '  Zielsprache schreibt (z. B. 2 EL Olivenöl → 2 tbsp olive oil → 2 c. à s. d’huile d’olive).',
    '- Schritte: natürliche Kochanweisungen. Zahlen, Zeiten und Temperaturen bleiben gleich.',
    '- Sprichst du die Lesenden an, dann auf Deutsch mit „du“ und auf Französisch mit „tu“.',
    '- Eigennamen, feststehende Gerichtsnamen und Marken bleiben stehen.',
    '- Nichts weglassen, nichts hinzufügen, keine Erklärungen. Jeder Eintrag behält seine Nummer nr.',
    '',
    'Rezept (JSON):',
    JSON.stringify(anfrage),
  ].join('\n');
}

/**
 * @param {*} wert
 * @param {number} maxLaenge
 * @param {boolean} mehrzeilig
 * @return {string|null}
 */
function sauberesFeld(wert, maxLaenge, mehrzeilig) {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  if (!text || text.length > maxLaenge || (!mehrzeilig && /[\r\n]/.test(text))) return null;
  return text;
}

/**
 * Prüft die Gemini-Antwort. Gültig ist sie nur, wenn es für jede Zielsprache zu jedem angefragten
 * Eintrag einen Text gibt; sonst null (der Versuch wird bei der nächsten Änderung oder im Backfill
 * wiederholt). Eine halbe Übersetzung wäre schlechter als das Original.
 * @param {*} antwort - geparstes JSON
 * @param {{zutaten: Array<object>, schritte: Array<object>}} anfrage
 * @return {{originalSprache: string, sprachen: Object<string, {zutaten: Map, schritte: Map}>}|null}
 */
function pruefeInhaltAntwort(antwort, anfrage) {
  const originalSprache = antwort?.originalSprache;
  if (!ORIGINAL_SPRACHEN.includes(originalSprache)) return null;
  const ziele = SPRACHEN.filter((sprache) => sprache !== originalSprache);
  const sprachen = {};
  for (const sprache of ziele) {
    const teil = antwort[sprache];
    const zuordnen = (eintraege, angefragt, maxLaenge, mehrzeilig) => {
      const texte = new Map();
      for (const eintrag of liste(eintraege)) {
        const text = sauberesFeld(eintrag?.text, maxLaenge, mehrzeilig);
        if (Number.isInteger(eintrag?.nr) && text && !texte.has(eintrag.nr)) texte.set(eintrag.nr, text);
      }
      return angefragt.every((zeile) => texte.has(zeile.nr)) ? texte : null;
    };
    const zutaten = zuordnen(teil?.zutaten, anfrage.zutaten, MAX_ZUTAT_LAENGE, false);
    const schritte = zuordnen(teil?.schritte, anfrage.schritte, MAX_SCHRITT_LAENGE, true);
    if (!zutaten || !schritte) return null;
    sprachen[sprache] = {zutaten, schritte};
  }
  return {originalSprache, sprachen};
}

/**
 * Das Dokument für rezeptUebersetzungen/{recipeId}: je Zielsprache Listen in der Länge des
 * Rezepts; nicht angefragte Einträge (Verknüpfungen, leere) behalten ihren Text.
 * @param {object} rezept
 * @param {string} quellHash
 * @param {{originalSprache: string, sprachen: object}} ergebnis - aus pruefeInhaltAntwort
 * @param {string} modell
 * @param {number} jetzt - Date.now()
 * @return {object}
 */
function baueUebersetzungsDokument(rezept, quellHash, ergebnis, modell, jetzt) {
  const ausrichten = (eintraege, texte) => liste(eintraege).map((eintrag, index) => texte.get(index + 1) ?? eintragText(eintrag));
  const dokument = {quellHash, originalSprache: ergebnis.originalSprache, schemaVersion: SCHEMA_VERSION, modell, erstelltAm: jetzt};
  for (const [sprache, teil] of Object.entries(ergebnis.sprachen)) {
    dokument[sprache] = {
      zutaten: ausrichten(rezept?.ingredients, teil.zutaten),
      schritte: ausrichten(rezept?.steps, teil.schritte),
    };
  }
  return dokument;
}

/**
 * Passt die gespeicherte Übersetzung noch zum Rezept?
 * @param {object|undefined} dokument - Daten aus rezeptUebersetzungen
 * @param {string} quellHash
 * @return {boolean}
 */
function istAktuelleInhaltUebersetzung(dokument, quellHash) {
  return Boolean(dokument) && dokument.quellHash === quellHash && dokument.schemaVersion === SCHEMA_VERSION;
}

module.exports = {
  SCHEMA_VERSION,
  HASH_KENNUNG,
  INHALT_RESPONSE_SCHEMA,
  inhaltHashEingabe,
  inhaltQuellHash,
  anfrageAusRezept,
  baueInhaltPrompt,
  pruefeInhaltAntwort,
  baueUebersetzungsDokument,
  istAktuelleInhaltUebersetzung,
};
