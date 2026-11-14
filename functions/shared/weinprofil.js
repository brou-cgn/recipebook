/**
 * Gericht-Profil der Weinbegleitung (`recipes/{id}.weinprofil`, Tracker
 * docs/vorhaben/weinbegleitung.md): Wertelisten, inputHash, Prompt, responseSchema
 * und die Prüfung der KI-Antwort für generateWeinprofile (handlers/weinbegleitung.js).
 *
 * Dieselben Listen stehen im Client in src/utils/weinbegleitung/profilSchema.js,
 * dieselbe Hash-Eingabe in src/utils/weinbegleitung/profilHash.js;
 * src/utils/weinbegleitung/profilHash.test.js prüft beides (Muster: sprachen.js).
 * Deshalb hier nur node:crypto und keine Firebase-Module: der Client-Test lädt die Datei.
 */

const crypto = require('crypto');

const SCHEMA_VERSION = 1;

const ROLLEN = [
  'hauptgericht', 'vorspeise', 'suppe', 'salat', 'dessert',
  'gebaeck_kuchen', 'sauce_dip', 'beilage', 'getraenk', 'snack',
];

const HAUPTKOMPONENTEN = [
  'fisch_mager', 'fisch_fett', 'meeresfruechte', 'gefluegel', 'schwein_kalb',
  'rind_lamm', 'wild', 'wurst_schinken', 'spargel', 'gemuese', 'pilze',
  'huelsenfruechte_getreide', 'kaese_frisch', 'kaese_hart', 'kaese_blau', 'ei',
  'dessert_frucht', 'dessert_schoko', 'dessert_creme',
];

const ZUBEREITUNGEN = [
  'roh', 'gedaempft_pochiert', 'gebraten', 'gegrillt_geroestet', 'geschmort',
  'frittiert', 'gebacken', 'kalt',
];

const SAUCEN = [
  'keine', 'zitrus_essig', 'sahne_butter_kaese', 'tomate', 'kraeuter_gruen',
  'pilz_erdig', 'soja_umami', 'scharf_chili', 'curry_gewuerze', 'suess_fruchtig',
  'rotwein_jus', 'rauch',
];

const KOMPONENTEN = ['saeure', 'suesse', 'salz', 'fett', 'schaerfe', 'bitter', 'umami'];

const INTENSITAET_MIN = 1;
const INTENSITAET_MAX = 5;
const KOMPONENTE_MIN = 0;
const KOMPONENTE_MAX = 3;

// Teil der Hash-Eingabe: Ändert sich, was in den Hash eingeht, steigt die Kennung,
// und alle Profile gelten als veraltet.
const HASH_KENNUNG = 'weinprofil-v1';

// Obergrenzen für den Prompt, damit ein sehr langes Rezept die Kosten nicht treibt.
const PROMPT_MAX_ZUTATEN = 60;
const PROMPT_MAX_SCHRITTE = 40;
const PROMPT_MAX_ZEICHEN_JE_EINTRAG = 300;

/**
 * Text eines Zutaten- oder Schritt-Eintrags (String oder {type, text}).
 * @param {*} eintrag
 * @return {string}
 */
function eintragText(eintrag) {
  if (typeof eintrag === 'string') return eintrag.trim();
  if (eintrag && typeof eintrag.text === 'string') return eintrag.text.trim();
  return '';
}

/**
 * @param {*} liste - Array von Einträgen oder etwas anderes
 * @return {string[]} nicht leere Texte in Originalreihenfolge
 */
function eintragTexte(liste) {
  return (Array.isArray(liste) ? liste : []).map(eintragText).filter(Boolean);
}

/**
 * Speisekategorie und Kulinarik sind Array oder (alte Rezepte) String. Sortiert,
 * damit eine andere Reihenfolge kein neues Profil auslöst.
 * @param {*} wert
 * @return {string[]}
 */
function sortierteWerte(wert) {
  const werte = Array.isArray(wert) ? wert : [wert];
  return werte
      .filter((eintrag) => typeof eintrag === 'string')
      .map((eintrag) => eintrag.trim())
      .filter(Boolean)
      .sort();
}

/**
 * Eingabe des inputHash: Titel, Zutaten-Texte, Schritte, Speisekategorie, Kulinarik.
 * Muss Zeichen für Zeichen der Client-Fassung entsprechen.
 * @param {object} rezept
 * @return {string}
 */
function weinprofilHashEingabe(rezept) {
  return JSON.stringify([
    HASH_KENNUNG,
    typeof rezept?.title === 'string' ? rezept.title.trim() : '',
    eintragTexte(rezept?.ingredients),
    eintragTexte(rezept?.steps),
    sortierteWerte(rezept?.speisekategorie),
    sortierteWerte(rezept?.kulinarik),
  ]);
}

/**
 * @param {object} rezept
 * @return {string} sha256 als Hex
 */
function weinprofilInputHash(rezept) {
  return crypto.createHash('sha256').update(weinprofilHashEingabe(rezept), 'utf8').digest('hex');
}

const istGanzzahlImBereich = (wert, min, max) => Number.isInteger(wert) && wert >= min && wert <= max;

/**
 * Prüft die Antwort der KI (oder ein gespeichertes Profil) streng gegen die Listen.
 * Ungültiges wird verworfen, nicht geraten.
 * @param {*} antwort - geparstes JSON
 * @return {object|null} {rolle, hauptkomponente, zubereitung, sauce, intensitaet, komponenten, konfidenz}
 */
function pruefeWeinprofilWerte(antwort) {
  if (!antwort || typeof antwort !== 'object') return null;
  const {rolle, hauptkomponente, zubereitung, sauce, intensitaet, komponenten, konfidenz} = antwort;
  if (!ROLLEN.includes(rolle)) return null;
  if (!HAUPTKOMPONENTEN.includes(hauptkomponente)) return null;
  if (!ZUBEREITUNGEN.includes(zubereitung)) return null;
  if (!SAUCEN.includes(sauce)) return null;
  if (!istGanzzahlImBereich(intensitaet, INTENSITAET_MIN, INTENSITAET_MAX)) return null;
  if (!komponenten || typeof komponenten !== 'object') return null;
  if (typeof konfidenz !== 'number' || !Number.isFinite(konfidenz) || konfidenz < 0 || konfidenz > 1) return null;

  const bereinigt = {};
  for (const name of KOMPONENTEN) {
    if (!istGanzzahlImBereich(komponenten[name], KOMPONENTE_MIN, KOMPONENTE_MAX)) return null;
    bereinigt[name] = komponenten[name];
  }
  return {rolle, hauptkomponente, zubereitung, sauce, intensitaet, komponenten: bereinigt, konfidenz};
}

/**
 * Ein gespeichertes Profil ist aktuell, wenn es gültig ist, zum Schema passt und
 * aus genau diesem Rezeptinhalt entstand.
 * @param {*} profil - Feld weinprofil
 * @param {string} inputHash - Hash des aktuellen Rezeptinhalts
 * @return {boolean}
 */
function istAktuellesWeinprofil(profil, inputHash) {
  return Boolean(profil) &&
    profil.schemaVersion === SCHEMA_VERSION &&
    profil.inputHash === inputHash &&
    pruefeWeinprofilWerte(profil) !== null;
}

const enumSchema = (werte) => ({type: 'STRING', format: 'enum', enum: werte});

/** responseSchema für Gemini: genau die Listen, keine freien Texte. */
const WEINPROFIL_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    rolle: enumSchema(ROLLEN),
    hauptkomponente: enumSchema(HAUPTKOMPONENTEN),
    zubereitung: enumSchema(ZUBEREITUNGEN),
    sauce: enumSchema(SAUCEN),
    intensitaet: {type: 'INTEGER'},
    komponenten: {
      type: 'OBJECT',
      properties: Object.fromEntries(KOMPONENTEN.map((name) => [name, {type: 'INTEGER'}])),
      required: KOMPONENTEN,
    },
    konfidenz: {type: 'NUMBER'},
  },
  required: ['rolle', 'hauptkomponente', 'zubereitung', 'sauce', 'intensitaet', 'komponenten', 'konfidenz'],
};

const WEINPROFIL_PROMPT = `Du beschreibst ein Gericht so, wie es auf dem Teller schmeckt. Daraus wird später eine Weinempfehlung berechnet, aber du nennst KEINE Weine, Rebsorten oder anderen Getränke und empfiehlst nichts.

Bewerte nur das Gericht und gib ausschließlich JSON mit diesen Feldern zurück:
- "rolle": Rolle im Menü. hauptgericht, vorspeise, suppe, salat, dessert, snack; getraenk für Getränke, sauce_dip für Saucen und Dips, beilage für Beilagen und Grundrezepte, gebaeck_kuchen für Brot, Gebäck, Teige und Kuchen.
- "hauptkomponente": die Zutat, die den Geschmack prägt. fisch_mager (z. B. Kabeljau, Zander, Forelle), fisch_fett (z. B. Lachs, Makrele, Thunfisch), meeresfruechte, gefluegel, schwein_kalb, rind_lamm, wild, wurst_schinken, spargel, gemuese, pilze, huelsenfruechte_getreide (Linsen, Bohnen, Reis, Pasta ohne prägende andere Zutat), kaese_frisch (Ziegen-, Frischkäse, Mozzarella), kaese_hart (Bergkäse, Parmesan), kaese_blau (Blauschimmel), ei, dessert_frucht, dessert_schoko, dessert_creme (Pudding, Creme, Sahnedesserts).
- "zubereitung": die prägende Garmethode. roh, gedaempft_pochiert, gebraten, gegrillt_geroestet, geschmort, frittiert, gebacken, kalt (kalt angerichtet, z. B. Mousse).
- "sauce": die prägende Sauce oder Würzung, keine wenn es keine gibt. zitrus_essig (Zitrus, Essig, Vinaigrette), sahne_butter_kaese (Sahne-, Butter-, Käsesauce, Hollandaise), tomate, kraeuter_gruen (Kräuter, Pesto, grüne Sauce), pilz_erdig (Pilze, Trüffel), soja_umami (Sojasauce, Miso, Fischsauce), scharf_chili, curry_gewuerze, suess_fruchtig (Frucht, Honig, süß-sauer), rotwein_jus (Rotwein, dunkler Jus), rauch (Rauch, Barbecue).
- "intensitaet": Geschmacksintensität von 1 (sehr zart) bis 5 (sehr kräftig).
- "komponenten": saeure, suesse, salz, fett, schaerfe, bitter, umami, jeweils 0 (nicht vorhanden) bis 3 (stark).
- "konfidenz": 0 bis 1, wie sicher du dir bist.

Die Speisekategorie des Rezepts ist nur ein Hinweis auf die Rolle. Sie ist frei benannt und kann fehlen oder ungenau sein; entscheide nach Zutaten und Zubereitung.`;

const kuerzen = (text) => (text.length > PROMPT_MAX_ZEICHEN_JE_EINTRAG ?
  `${text.slice(0, PROMPT_MAX_ZEICHEN_JE_EINTRAG)}…` : text);

/**
 * Prompt für ein Rezept: feste Anweisung plus Rezeptdaten als JSON.
 * @param {object} rezept
 * @return {string}
 */
function baueWeinprofilPrompt(rezept) {
  const daten = {
    titel: typeof rezept?.title === 'string' ? rezept.title.trim() : '',
    speisekategorie: sortierteWerte(rezept?.speisekategorie),
    kulinarik: sortierteWerte(rezept?.kulinarik),
    zutaten: eintragTexte(rezept?.ingredients).slice(0, PROMPT_MAX_ZUTATEN).map(kuerzen),
    schritte: eintragTexte(rezept?.steps).slice(0, PROMPT_MAX_SCHRITTE).map(kuerzen),
  };
  return `${WEINPROFIL_PROMPT}\n\nREZEPT:\n${JSON.stringify(daten)}`;
}

module.exports = {
  SCHEMA_VERSION,
  ROLLEN,
  HAUPTKOMPONENTEN,
  ZUBEREITUNGEN,
  SAUCEN,
  KOMPONENTEN,
  HASH_KENNUNG,
  WEINPROFIL_RESPONSE_SCHEMA,
  weinprofilHashEingabe,
  weinprofilInputHash,
  pruefeWeinprofilWerte,
  istAktuellesWeinprofil,
  baueWeinprofilPrompt,
};
