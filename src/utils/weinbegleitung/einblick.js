/**
 * Weinprofil-Einblick (Tracker docs/vorhaben/weinbegleitung.md, W1): zeigt, wie die KI ein
 * Gericht eingeschätzt hat und wie die Punkte der Weinstile zustande kommen. Wer ihn sieht,
 * steuert die Berechtigung „weinprofilEinblick“ unter „Funktionen nach Berechtigung“
 * (Benutzerverwaltung); standardmäßig nur Admins.
 *
 * Reine Funktionen ohne React. Gerechnet wird mit derselben Bewertung wie die Empfehlung
 * (bewerteAlleStile), damit der Einblick genau die Zahlen zeigt, aus denen sie entsteht.
 * Anzeigen löst nie einen KI-Aufruf aus.
 */
import { normalisiereWeinprofil, KOMPONENTEN } from './profilSchema';
import { bewerteAlleStile, istKandidat } from './bewertung';
import { empfehlungFuerWeinprofil } from './engine';
import { getStil } from './wissensbasis';
import { nurZuText } from './anzeige';
import { RULES_VERSION, S_MIN, STATUS_OK, STATUS_KEIN_STIL } from './konstanten';

// So viele Stile zeigt der Einblick, absteigend nach Punkten
export const EINBLICK_ANZAHL_STILE = 5;

const ROLLE_TEXT = {
  hauptgericht: 'Hauptgericht',
  vorspeise: 'Vorspeise',
  suppe: 'Suppe',
  salat: 'Salat',
  dessert: 'Dessert',
  gebaeck_kuchen: 'Gebäck oder Kuchen',
  sauce_dip: 'Sauce oder Dip',
  beilage: 'Beilage',
  getraenk: 'Getränk',
  snack: 'Snack',
};

const HAUPTKOMPONENTE_TEXT = {
  fisch_mager: 'Fisch, mager',
  fisch_fett: 'Fisch, fett',
  meeresfruechte: 'Meeresfrüchte',
  gefluegel: 'Geflügel',
  schwein_kalb: 'Schwein oder Kalb',
  rind_lamm: 'Rind oder Lamm',
  wild: 'Wild',
  wurst_schinken: 'Wurst oder Schinken',
  spargel: 'Spargel',
  gemuese: 'Gemüse',
  pilze: 'Pilze',
  huelsenfruechte_getreide: 'Hülsenfrüchte oder Getreide',
  kaese_frisch: 'Frischkäse',
  kaese_hart: 'Hartkäse',
  kaese_blau: 'Blauschimmelkäse',
  ei: 'Ei',
  dessert_frucht: 'Dessert mit Frucht',
  dessert_schoko: 'Dessert mit Schokolade',
  dessert_creme: 'Dessert mit Creme',
};

const ZUBEREITUNG_TEXT = {
  roh: 'roh',
  gedaempft_pochiert: 'gedämpft oder pochiert',
  gebraten: 'gebraten',
  gegrillt_geroestet: 'gegrillt oder geröstet',
  geschmort: 'geschmort',
  frittiert: 'frittiert',
  gebacken: 'gebacken',
  kalt: 'kalt angerichtet',
};

const SAUCE_TEXT = {
  keine: 'keine',
  zitrus_essig: 'Zitrus oder Essig',
  sahne_butter_kaese: 'Sahne, Butter oder Käse',
  tomate: 'Tomate',
  kraeuter_gruen: 'Kräuter',
  pilz_erdig: 'Pilze oder Trüffel',
  soja_umami: 'Soja, Miso oder Fischsauce',
  scharf_chili: 'scharf (Chili)',
  curry_gewuerze: 'Curry oder Gewürze',
  suess_fruchtig: 'süß-fruchtig',
  rotwein_jus: 'Rotwein oder Jus',
  rauch: 'Rauch oder Barbecue',
};

const KOMPONENTE_TEXT = {
  saeure: 'Säure',
  suesse: 'Süße',
  salz: 'Salz',
  fett: 'Fett',
  schaerfe: 'Schärfe',
  bitter: 'Bitter',
  umami: 'Umami',
};

// Passung je Tag-Art (hk, zb, sc in stile.json)
const PASSUNG_ART_TEXT = { hk: 'Hauptzutat', zb: 'Zubereitung', sc: 'Sauce' };

// Regel-Terme mit eigenem Punktbeitrag (bewertung.js); Kurztexte der Regeln in regeln.json
const REGEL_TEXT = {
  R1: 'Kraft',
  R2: 'Säure',
  R3: 'Süße',
  R4: 'Schärfe',
  R5: 'Umami',
  R6: 'Fett und Salz',
  R9: 'Bitter',
};

const MINUS = '−';

/**
 * Zahl mit Komma und höchstens zwei Nachkommastellen, z. B. „7,9“ oder „1,5“.
 * @param {number} wert
 * @returns {string}
 */
export function formatZahl(wert) {
  const gerundet = Math.round(Math.abs(wert) * 100) / 100;
  const text = String(gerundet).replace('.', ',');
  return wert < 0 && gerundet !== 0 ? `${MINUS}${text}` : text;
}

/**
 * Punkte mit Vorzeichen, z. B. „+2,4“, „−3“ oder „0“.
 * @param {number} wert
 * @returns {string}
 */
export function formatPunkte(wert) {
  const text = formatZahl(wert);
  return wert > 0 && text !== '0' ? `+${text}` : text;
}

/**
 * Konfidenz der KI (0 bis 1) als Prozent, z. B. „90 %“; ohne gültigen Wert null.
 * @param {*} konfidenz
 * @returns {string|null}
 */
export function formatKonfidenz(konfidenz) {
  if (typeof konfidenz !== 'number' || !Number.isFinite(konfidenz) || konfidenz < 0 || konfidenz > 1) return null;
  return `${Math.round(konfidenz * 100)} %`;
}

/**
 * Datum der Einschätzung (Millisekunden) als „14.11.2026“; ohne Zeitpunkt null.
 * @param {*} millisekunden
 * @returns {string|null}
 */
export function formatDatum(millisekunden) {
  if (typeof millisekunden !== 'number' || !Number.isFinite(millisekunden) || millisekunden <= 0) return null;
  const datum = new Date(millisekunden);
  const zweistellig = (zahl) => String(zahl).padStart(2, '0');
  return `${zweistellig(datum.getDate())}.${zweistellig(datum.getMonth() + 1)}.${datum.getFullYear()}`;
}

/**
 * Wie die Punkte eines Stils zustande kommen: Passung je Tag (auch „neutral“, das zählt
 * positiv) und die Regel-Terme, die nicht 0 sind.
 * @param {Object} bewertung - Ergebnis von bewerteStil (passungen, terme)
 * @returns {Array<{text: string, punkte: number}>}
 */
export function stilAufschluesselung(bewertung) {
  const passung = (bewertung.passungen || []).map((eintrag) => ({
    text: `${PASSUNG_ART_TEXT[eintrag.art] || eintrag.art} ${eintrag.stufe}`,
    punkte: eintrag.punkte,
  }));
  const regeln = Object.entries(bewertung.terme || {})
    .filter(([, punkte]) => punkte !== 0)
    .map(([regelId, punkte]) => ({ text: `${REGEL_TEXT[regelId] || regelId} (${regelId})`, punkte }));
  return [...passung, ...regeln];
}

/**
 * Alles für den Einblick in ein gespeichertes Gericht-Profil.
 * @param {*} weinprofil - Feld `weinprofil` eines Rezepts
 * @param {{anzahl?: number}} [optionen]
 * @returns {Object|null} null, wenn das Profil fehlt oder ungültig ist; sonst
 *   `werte` und `komponenten` (je {name, wert}), `konfidenz`, `modell`, `datum` (Texte oder null),
 *   `schwelle` (ab diesen Punkten wird empfohlen) und `stile` (die besten, je mit stilId, name,
 *   score, kandidat, einschraenkung und teile)
 */
export function profilEinblick(weinprofil, { anzahl = EINBLICK_ANZAHL_STILE } = {}) {
  const profil = normalisiereWeinprofil(weinprofil);
  if (!profil) return null;
  return {
    werte: [
      { name: 'Rolle', wert: ROLLE_TEXT[profil.rolle] },
      { name: 'Hauptzutat', wert: HAUPTKOMPONENTE_TEXT[profil.hauptkomponente] },
      { name: 'Zubereitung', wert: ZUBEREITUNG_TEXT[profil.zubereitung] },
      { name: 'Sauce', wert: SAUCE_TEXT[profil.sauce] },
      { name: 'Intensität', wert: `${profil.intensitaet} von 5` },
    ],
    komponenten: KOMPONENTEN.map((id) => ({ id, name: KOMPONENTE_TEXT[id], wert: profil.komponenten[id] })),
    konfidenz: formatKonfidenz(weinprofil.konfidenz),
    modell: typeof weinprofil.modell === 'string' && weinprofil.modell.trim() ? weinprofil.modell.trim() : null,
    datum: formatDatum(weinprofil.erstelltAm),
    schwelle: S_MIN,
    stile: bewerteAlleStile(profil).slice(0, anzahl).map((bewertung) => {
      const stil = getStil(bewertung.stilId);
      return {
        stilId: bewertung.stilId,
        name: stil ? stil.name : bewertung.stilId,
        score: bewertung.score,
        kandidat: istKandidat(bewertung),
        einschraenkung: bewertung.infrage ? null : nurZuText(stil),
        teile: stilAufschluesselung(bewertung),
      };
    }),
  };
}

/**
 * Eine Zeile JSON für „Werte kopieren“: das Profil als Testfall (Tracker W2), mit Titel,
 * aktueller Empfehlung und Regelstand. Keine Zutaten und keine Schritte.
 * @param {Object} rezept
 * @param {*} weinprofil
 * @returns {string|null} null ohne gültiges Profil
 */
export function testfallText(rezept, weinprofil) {
  const profil = normalisiereWeinprofil(weinprofil);
  if (!profil) return null;
  const empfehlung = empfehlungFuerWeinprofil(weinprofil);
  let ergebnis = empfehlung.status;
  if (empfehlung.status === STATUS_OK) ergebnis = empfehlung.stilId;
  else if (empfehlung.status === STATUS_KEIN_STIL) ergebnis = 'R11';
  return JSON.stringify({
    titel: typeof rezept?.title === 'string' ? rezept.title.trim() : '',
    ...profil,
    konfidenz: typeof weinprofil.konfidenz === 'number' ? weinprofil.konfidenz : null,
    modell: typeof weinprofil.modell === 'string' ? weinprofil.modell : null,
    empfehlung: ergebnis,
    rulesVersion: RULES_VERSION,
  });
}
