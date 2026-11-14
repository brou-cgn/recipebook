/**
 * Schema des Gericht-Profils `recipes/{id}.weinprofil`. Das Profil schreibt nur
 * die Cloud Function generateWeinprofile (PR 2); sie bekommt dieselben Listen
 * als responseSchema für Gemini. Stehen die Listen später doppelt in functions/,
 * prüft ein Konsistenztest die Gleichheit (Muster: sprachen.js).
 *
 * Die Engine liest Profile nur über normalisiereWeinprofil: Ein Profil mit
 * unbekannten oder fehlenden Werten gilt als nicht vorhanden. Geraten wird nie.
 */

export const SCHEMA_VERSION = 1;

export const ROLLEN = [
  'hauptgericht', 'vorspeise', 'suppe', 'salat', 'dessert',
  'gebaeck_kuchen', 'sauce_dip', 'beilage', 'getraenk', 'snack',
];

export const HAUPTKOMPONENTEN = [
  'fisch_mager', 'fisch_fett', 'meeresfruechte', 'gefluegel', 'schwein_kalb',
  'rind_lamm', 'wild', 'wurst_schinken', 'spargel', 'gemuese', 'pilze',
  'huelsenfruechte_getreide', 'kaese_frisch', 'kaese_hart', 'kaese_blau', 'ei',
  'dessert_frucht', 'dessert_schoko', 'dessert_creme',
];

export const ZUBEREITUNGEN = [
  'roh', 'gedaempft_pochiert', 'gebraten', 'gegrillt_geroestet', 'geschmort',
  'frittiert', 'gebacken', 'kalt',
];

export const SAUCEN = [
  'keine', 'zitrus_essig', 'sahne_butter_kaese', 'tomate', 'kraeuter_gruen',
  'pilz_erdig', 'soja_umami', 'scharf_chili', 'curry_gewuerze', 'suess_fruchtig',
  'rotwein_jus', 'rauch',
];

export const KOMPONENTEN = ['saeure', 'suesse', 'salz', 'fett', 'schaerfe', 'bitter', 'umami'];

export const INTENSITAET_MIN = 1;
export const INTENSITAET_MAX = 5;
export const KOMPONENTE_MIN = 0;
export const KOMPONENTE_MAX = 3;

// Präfixe der Passungs-Tags in stile.json
export const TAG_HAUPTKOMPONENTE = 'hk';
export const TAG_ZUBEREITUNG = 'zb';
export const TAG_SAUCE = 'sc';
// Nur in `nurZu` (stile.json): Rolle des Gerichts, z. B. „rolle:dessert“
export const TAG_ROLLE = 'rolle';

const istGanzzahlImBereich = (wert, min, max) => Number.isInteger(wert) && wert >= min && wert <= max;

/**
 * Prüft ein gespeichertes Profil und gibt die für die Engine nötigen Werte zurück.
 * Metadaten (inputHash, modell, erstelltAm) bleiben außen vor.
 * @param {*} profil - Feld `weinprofil` eines Rezepts
 * @returns {Object|null} bereinigtes Profil oder null, wenn es fehlt oder ungültig ist
 */
export function normalisiereWeinprofil(profil) {
  if (!profil || typeof profil !== 'object') return null;
  const { rolle, hauptkomponente, zubereitung, sauce, intensitaet, komponenten } = profil;
  if (!ROLLEN.includes(rolle)) return null;
  if (!HAUPTKOMPONENTEN.includes(hauptkomponente)) return null;
  if (!ZUBEREITUNGEN.includes(zubereitung)) return null;
  if (!SAUCEN.includes(sauce)) return null;
  if (!istGanzzahlImBereich(intensitaet, INTENSITAET_MIN, INTENSITAET_MAX)) return null;
  if (!komponenten || typeof komponenten !== 'object') return null;

  const bereinigt = {};
  for (const name of KOMPONENTEN) {
    const wert = komponenten[name];
    if (!istGanzzahlImBereich(wert, KOMPONENTE_MIN, KOMPONENTE_MAX)) return null;
    bereinigt[name] = wert;
  }

  return { rolle, hauptkomponente, zubereitung, sauce, intensitaet, komponenten: bereinigt };
}
