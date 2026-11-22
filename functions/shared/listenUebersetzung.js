/**
 * Auswahllisten übersetzen (Vorhaben Mehrsprachigkeit, docs/vorhaben/mehrsprachigkeit.md, PR 5):
 * Prüfung der Anfrage, Prompt, Antwortschema und Prüfung der Gemini-Antwort für die Callable
 * uebersetzeListenwerte (handlers/uebersetzung.js). Ohne Firestore und Netz.
 *
 * Die Callable schreibt nichts: Sie liefert Vorschläge, die Admins unter Einstellungen › Listen &
 * Kategorien prüfen und mit den übrigen Übersetzungen speichern (settings/app.listenUebersetzungen,
 * Aufbau in src/i18n/listenwerte.js). Die Listen hier müssen UEBERSETZBARE_LISTEN dort entsprechen.
 */

const TEXT_LISTEN = ['cuisineTypes', 'cuisineGroups', 'mealCategories', 'units'];
const EINHEIT_LISTEN = ['portionUnits', 'packageUnits', 'drinkUnits'];
const LISTEN = [...TEXT_LISTEN, ...EINHEIT_LISTEN];
const MAX_EINTRAEGE = 100;
const MAX_LAENGE = 80;

const sauber = (wert) => {
  if (typeof wert !== 'string') return null;
  const text = wert.trim();
  return text && text.length <= MAX_LAENGE && !/[\r\n]/.test(text) ? text : null;
};

/**
 * Prüft die Anfrage. Wirft mit einer Meldung (für HttpsError invalid-argument), wenn sie nicht taugt.
 * @param {*} eintraege - request.data.eintraege
 * @return {Array<{nr: number, liste: string, wert: string, einheit: boolean, text?: string,
 *   einzahl?: string, mehrzahl?: string}>}
 */
function pruefeListenEingabe(eintraege) {
  if (!Array.isArray(eintraege) || eintraege.length === 0 || eintraege.length > MAX_EINTRAEGE) {
    throw new Error(`eintraege muss ein Array mit 1 bis ${MAX_EINTRAEGE} Einträgen sein`);
  }
  return eintraege.map((eintrag, index) => {
    const liste = eintrag?.liste;
    const wert = sauber(eintrag?.wert);
    if (!LISTEN.includes(liste) || !wert) throw new Error(`Eintrag ${index + 1} ist ungültig`);
    if (EINHEIT_LISTEN.includes(liste)) {
      const einzahl = sauber(eintrag.einzahl);
      const mehrzahl = sauber(eintrag.mehrzahl) || einzahl;
      if (!einzahl) throw new Error(`Eintrag ${index + 1} braucht einzahl`);
      return {nr: index + 1, liste, wert, einheit: true, einzahl, mehrzahl};
    }
    const text = sauber(eintrag.text) || wert;
    return {nr: index + 1, liste, wert, einheit: false, text};
  });
}

const LISTEN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    eintraege: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nr: {type: 'INTEGER'},
          en: {type: 'STRING'},
          fr: {type: 'STRING'},
          en_einzahl: {type: 'STRING'},
          en_mehrzahl: {type: 'STRING'},
          fr_einzahl: {type: 'STRING'},
          fr_mehrzahl: {type: 'STRING'},
        },
        required: ['nr'],
      },
    },
  },
  required: ['eintraege'],
};

/**
 * @param {Array<object>} eintraege - aus pruefeListenEingabe
 * @return {string}
 */
function baueListenPrompt(eintraege) {
  const daten = eintraege.map(({nr, liste, einheit, text, einzahl, mehrzahl}) => (
    einheit ? {nr, liste, einheit: true, einzahl, mehrzahl} : {nr, liste, text}
  ));
  return [
    'Du übersetzt Einträge aus Auswahllisten einer Rezept-App ins Englische (en) und Französische (fr).',
    '',
    'Die Listen: cuisineTypes (Kulinarik, z. B. „Italienische Küche“ → „Italian cuisine“ / „Cuisine',
    'italienne“), cuisineGroups (Gruppen davon), mealCategories (Speisekategorien, z. B. „Hauptspeisen“ →',
    '„Main courses“ / „Plats principaux“), units (Maßeinheiten mit den üblichen Abkürzungen: EL → tbsp /',
    'c. à s., TL → tsp / c. à c., Prise → pinch / pincée; g, kg, ml, l bleiben) sowie portionUnits,',
    'packageUnits und drinkUnits (Einheiten mit Einzahl und Mehrzahl, z. B. Portion/Portionen →',
    'serving/servings → portion/portions).',
    '',
    '- Kurz, wie eine Beschriftung in einer App, ohne Artikel.',
    '- Eigennamen, regionale Begriffe ohne Entsprechung und Marken bleiben stehen.',
    '- Für Textlisten: en und fr. Für Einheiten (einheit: true): en_einzahl, en_mehrzahl, fr_einzahl, fr_mehrzahl.',
    '- nr ist die Nummer des Eintrags. Keine Erklärungen.',
    '',
    'Einträge (JSON):',
    JSON.stringify(daten),
  ].join('\n');
}

/**
 * Prüft die Gemini-Antwort; ungültige oder fehlende Einträge fallen weg (dann gibt es für sie
 * keinen Vorschlag).
 * @param {*} antwort - geparstes JSON
 * @param {Array<object>} eintraege - aus pruefeListenEingabe
 * @return {Array<{liste: string, wert: string, en: (string|object), fr: (string|object)}>}
 */
function pruefeListenAntwort(antwort, eintraege) {
  const nachNummer = new Map();
  for (const eintrag of Array.isArray(antwort?.eintraege) ? antwort.eintraege : []) {
    if (Number.isInteger(eintrag?.nr) && !nachNummer.has(eintrag.nr)) nachNummer.set(eintrag.nr, eintrag);
  }
  return eintraege.flatMap(({nr, liste, wert, einheit}) => {
    const roh = nachNummer.get(nr);
    if (!roh) return [];
    if (einheit) {
      const en = {einzahl: sauber(roh.en_einzahl), mehrzahl: sauber(roh.en_mehrzahl)};
      const fr = {einzahl: sauber(roh.fr_einzahl), mehrzahl: sauber(roh.fr_mehrzahl)};
      if (!en.einzahl || !en.mehrzahl || !fr.einzahl || !fr.mehrzahl) return [];
      return [{liste, wert, en, fr}];
    }
    const en = sauber(roh.en);
    const fr = sauber(roh.fr);
    return en && fr ? [{liste, wert, en, fr}] : [];
  });
}

module.exports = {
  LISTEN,
  TEXT_LISTEN,
  EINHEIT_LISTEN,
  MAX_EINTRAEGE,
  LISTEN_RESPONSE_SCHEMA,
  pruefeListenEingabe,
  baueListenPrompt,
  pruefeListenAntwort,
};
