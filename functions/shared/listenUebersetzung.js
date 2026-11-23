/**
 * Auswahllisten übersetzen (Vorhaben Mehrsprachigkeit, docs/vorhaben/mehrsprachigkeit.md, PR 5 und
 * 6t): Prüfung der Anfrage, Prompt, Antwortschema und Prüfung der Gemini-Antwort für die Callable
 * uebersetzeListenwerte und den Trigger uebersetzeListenwerteAutomatisch (handlers/uebersetzung.js),
 * dazu für den Trigger: fehlende Übersetzungen finden und nur leere Felder füllen. Ohne Firestore
 * und Netz.
 *
 * Die Callable schreibt nichts: Sie liefert Vorschläge, die Admins unter Einstellungen › Listen &
 * Kategorien prüfen und mit den übrigen Übersetzungen speichern (settings/app.listenUebersetzungen,
 * Aufbau in src/i18n/listenwerte.js). Der Trigger trägt Übersetzungen neuer Werte selbst ein und
 * vermerkt die gefüllten Sprachen in `kiUngeprueft`, bis jemand sie dort prüft. Die Listen und
 * quellwerte hier müssen UEBERSETZBARE_LISTEN und quellwerte dort entsprechen (Test
 * src/i18n/listenwerteServer.test.js).
 */

const TEXT_LISTEN = ['cuisineTypes', 'cuisineGroups', 'mealCategories', 'units'];
const EINHEIT_LISTEN = ['portionUnits', 'packageUnits', 'drinkUnits'];
const LISTEN = [...TEXT_LISTEN, ...EINHEIT_LISTEN];
/** Zielsprachen wie ZIELSPRACHEN in src/i18n/listenwerte.js; Deutsch ist immer das Original. */
const ZIELSPRACHEN = ['en', 'fr'];
/** Feld am Eintrag: Sprachen, die der Trigger gefüllt hat und die noch niemand geprüft hat. */
const KI_UNGEPRUEFT = 'kiUngeprueft';
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

// ── Automatik (PR 6t) ─────────────────────────────────────────────────────────

const istText = (wert) => typeof wert === 'string' && wert.trim() !== '';
const istEinheitText = (wert) => Boolean(wert) && istText(wert.einzahl) && istText(wert.mehrzahl);
const istUebersetzt = (einheit, wert) => (einheit ? istEinheitText(wert) : istText(wert));
const istObjekt = (wert) => Boolean(wert) && typeof wert === 'object' && !Array.isArray(wert);

/**
 * Die Quellwerte einer Liste aus settings/app wie quellwerte in src/i18n/listenwerte.js: Texte
 * bzw. Einheiten mit Einzahl und Mehrzahl, bei Kulinarik-Gruppen der Gruppenname.
 * @param {object} einstellungen - Daten von settings/app
 * @param {string} liste
 * @return {Array<{wert: string, text?: string, einzahl?: string, mehrzahl?: string}>}
 */
function quellwerte(einstellungen, liste) {
  const werte = Array.isArray(einstellungen?.[liste]) ? einstellungen[liste] : [];
  if (EINHEIT_LISTEN.includes(liste)) {
    return werte
        .filter((einheit) => einheit && istText(einheit.id) && istText(einheit.singular))
        .map((einheit) => ({wert: einheit.id, einzahl: einheit.singular, mehrzahl: einheit.plural || einheit.singular}));
  }
  if (!TEXT_LISTEN.includes(liste)) return [];
  const texte = werte.map((wert) => (liste === 'cuisineGroups' ? wert?.name : wert)).filter(istText);
  return [...new Set(texte)].map((text) => ({wert: text, text}));
}

/**
 * Übersetzungen einer Liste je Wert; bei doppelten Einträgen zählt wie bei der Anzeige
 * (baueListenIndex im Client) der letzte.
 * @param {object|undefined} uebersetzungen - listenUebersetzungen
 * @param {string} liste
 * @return {Map<string, object>}
 */
function eintraegeNachWert(uebersetzungen, liste) {
  const eintraege = Array.isArray(uebersetzungen?.[liste]) ? uebersetzungen[liste] : [];
  return new Map(eintraege.filter((eintrag) => istText(eintrag?.wert)).map((eintrag) => [eintrag.wert, eintrag]));
}

/**
 * Werte, denen in einer Zielsprache die Übersetzung fehlt (wie fehlendeUebersetzungen im
 * Client), in der Form der Anfrage an pruefeListenEingabe. Werte, die diese Prüfung nicht
 * bestünden (zu lang, Zeilenumbruch, Leerzeichen am Rand), fehlen: Ihre Übersetzung ließe sich
 * nicht unter dem gespeicherten Wert ablegen.
 * @param {object} einstellungen - Daten von settings/app
 * @return {Array<{liste: string, wert: string, text?: string, einzahl?: string, mehrzahl?: string}>}
 */
function fehlendeListenwerte(einstellungen) {
  return LISTEN.flatMap((liste) => {
    const einheit = EINHEIT_LISTEN.includes(liste);
    const vorhanden = eintraegeNachWert(einstellungen?.listenUebersetzungen, liste);
    return quellwerte(einstellungen, liste)
        .filter((quelle) => sauber(quelle.wert) === quelle.wert && (!einheit || sauber(quelle.einzahl)))
        .filter((quelle) => ZIELSPRACHEN.some((sprache) => !istUebersetzt(einheit, vorhanden.get(quelle.wert)?.[sprache])))
        .map((quelle) => ({liste, ...quelle}));
  });
}

/**
 * Vorschlag nur dort, wo nichts steht; bei Einheiten auch eine fehlende Einzahl oder Mehrzahl
 * (wie „Fehlende mit KI vorschlagen“ in src/components/ListenUebersetzungen.js).
 * @param {*} vorhanden
 * @param {string|{einzahl: string, mehrzahl: string}} vorschlag
 * @param {boolean} einheit
 * @return {*} vorhanden, wenn nichts zu ergänzen ist
 */
function ergaenze(vorhanden, vorschlag, einheit) {
  if (istUebersetzt(einheit, vorhanden)) return vorhanden;
  if (!einheit) return vorschlag;
  return {
    einzahl: istText(vorhanden?.einzahl) ? vorhanden.einzahl : vorschlag.einzahl,
    mehrzahl: istText(vorhanden?.mehrzahl) ? vorhanden.mehrzahl : vorschlag.mehrzahl,
  };
}

/**
 * Trägt die Vorschläge des Triggers in die aktuellen Übersetzungen ein: nur in leere Felder, von
 * Hand gepflegte Übersetzungen bleiben. Die gefüllten Sprachen kommen nach kiUngeprueft. Werte,
 * die es nicht mehr gibt oder deren deutscher Text sich seit der Anfrage geändert hat, bleiben
 * außen vor; deren Änderung weckt den Trigger ohnehin erneut.
 * @param {object} einstellungen - aktuelle Daten von settings/app (in der Transaktion gelesen)
 * @param {Array<object>} anfrage - die übersetzten Einträge aus fehlendeListenwerte
 * @param {Array<object>} vorschlaege - aus pruefeListenAntwort
 * @return {{listenUebersetzungen: object, neu: number}} neu: Anzahl gefüllter Sprachen
 */
function ergaenzeListenUebersetzungen(einstellungen, anfrage, vorschlaege) {
  const schluessel = (liste, wert) => `${liste}\n${wert}`;
  const angefragt = new Map(anfrage.map((eintrag) => [schluessel(eintrag.liste, eintrag.wert), eintrag]));
  const listenUebersetzungen = istObjekt(einstellungen?.listenUebersetzungen) ? {...einstellungen.listenUebersetzungen} : {};
  let neu = 0;
  for (const vorschlag of vorschlaege) {
    const {liste, wert} = vorschlag;
    const einheit = EINHEIT_LISTEN.includes(liste);
    const gefragt = angefragt.get(schluessel(liste, wert));
    const quelle = quellwerte(einstellungen, liste).find((eintrag) => eintrag.wert === wert);
    const gleicheQuelle = Boolean(gefragt && quelle) &&
      (einheit ? quelle.einzahl === gefragt.einzahl && quelle.mehrzahl === gefragt.mehrzahl : quelle.text === gefragt.text);
    if (!gleicheQuelle) continue;

    const eintraege = Array.isArray(listenUebersetzungen[liste]) ? listenUebersetzungen[liste] : [];
    const vorhanden = eintraegeNachWert({[liste]: eintraege}, liste).get(wert) || {wert};
    const eintrag = {...vorhanden};
    const ungeprueft = new Set(Array.isArray(vorhanden[KI_UNGEPRUEFT]) ? vorhanden[KI_UNGEPRUEFT] : []);
    let gefuellt = 0;
    for (const sprache of ZIELSPRACHEN) {
      const ergaenzt = ergaenze(vorhanden[sprache], vorschlag[sprache], einheit);
      if (ergaenzt === vorhanden[sprache]) continue;
      eintrag[sprache] = ergaenzt;
      ungeprueft.add(sprache);
      gefuellt += 1;
    }
    if (gefuellt === 0) continue;
    eintrag[KI_UNGEPRUEFT] = ZIELSPRACHEN.filter((sprache) => ungeprueft.has(sprache));
    listenUebersetzungen[liste] = [...eintraege.filter((andere) => andere?.wert !== wert), eintrag];
    neu += gefuellt;
  }
  return {listenUebersetzungen, neu};
}

/** Felder von settings/app, deren Änderung den Trigger weckt. */
const LISTEN_FELDER = [...LISTEN, 'listenUebersetzungen'];

const stabil = (wert) => {
  if (Array.isArray(wert)) return wert.map(stabil);
  if (istObjekt(wert)) return Object.fromEntries(Object.keys(wert).sort().map((feld) => [feld, stabil(wert[feld])]));
  return wert;
};

/**
 * Stand der Listen und ihrer Übersetzungen zum Vergleichen von vorher und nachher: Andere
 * Änderungen an settings/app (Slogan, Logo, Prompt …) wecken den Trigger nicht.
 * @param {object|undefined} einstellungen
 * @return {string}
 */
function listenStand(einstellungen) {
  return JSON.stringify(LISTEN_FELDER.map((feld) => stabil(einstellungen?.[feld] ?? null)));
}

module.exports = {
  LISTEN,
  TEXT_LISTEN,
  EINHEIT_LISTEN,
  ZIELSPRACHEN,
  KI_UNGEPRUEFT,
  MAX_EINTRAEGE,
  LISTEN_RESPONSE_SCHEMA,
  pruefeListenEingabe,
  baueListenPrompt,
  pruefeListenAntwort,
  quellwerte,
  fehlendeListenwerte,
  ergaenzeListenUebersetzungen,
  listenStand,
};
