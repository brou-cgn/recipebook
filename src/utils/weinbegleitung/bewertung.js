/**
 * Bewertung eines Weinstils für ein Gang-Profil (Gang im Menü oder Einzelrezept).
 * Reine Funktionen ohne Seiteneffekte. Spezifikation und Startwerte:
 * docs/vorhaben/weinbegleitung.md, Konstanten in konstanten.js.
 */
import {
  PASSUNG_PUNKTE,
  GEWICHT_SAUCE,
  GEWICHT_HAUPTKOMPONENTE_MIT_SAUCE,
  GEWICHT_HAUPTKOMPONENTE_OHNE_SAUCE,
  GEWICHT_ZUBEREITUNG,
  SAUCE_KEINE,
  R1_STRAFE_JE_STUFE,
  R2_STRAFE_JE_STUFE,
  R3_STRAFE_NACH_ABSTAND,
  R3_UEBERSUESSE_AB_DIFFERENZ,
  R3_UEBERSUESSE_STRAFE_JE_STUFE_UEBER_1,
  R3_AUSNAHME_HAUPTKOMPONENTE,
  R4_AB_SCHAERFE,
  R4_STRAFE_JE_TANNIN,
  R4_STRAFE_JE_ALKOHOL_UEBER_1,
  R4_BONUS_RESTSUESSE,
  R4_BONUS_SCHAUM,
  R4_RESTSUESSE_AB,
  R4_SCHONEND_MAX_TANNIN,
  R4_SCHONEND_MAX_ALKOHOL,
  R5_AB_UMAMI,
  R5_SALZ_UNTER,
  R5_STRAFE_JE_TANNIN_UEBER_1,
  R5_TANNIN_FREI_BIS,
  R6_AB_FETT_ODER_SALZ,
  R6_AB_TANNIN,
  R6_SAEURE,
  R6_BONUS,
  R9_AB_BITTER,
  R9_AB_TANNIN,
  R9_STRAFE,
  S_MIN,
  S_GUT,
  S_TOP,
  LABEL_TOP,
  LABEL_GUT,
  LABEL_BASIS,
  MAX_GRUENDE,
  R1_GRUND_NAH_ABSTAND,
  R2_GRUND_AB_SAEURE,
  R3_GRUND_AB_SUESSE,
  R3_GRUND_BLAUSCHIMMEL_AB_SUESSE,
  GRUND_GEWICHT_R1_GLEICH,
  GRUND_GEWICHT_R1_NAH,
  GRUND_GEWICHT_R2,
  GRUND_GEWICHT_R3,
  GRUND_GEWICHT_R5,
  GRUND_GEWICHT_R9,
  GRUND_GEWICHT_R10,
  R8_ROT_HAUPTKOMPONENTEN,
  R8_WEISS_HAUPTKOMPONENTEN,
} from './konstanten';
import { TAG_HAUPTKOMPONENTE, TAG_ZUBEREITUNG, TAG_SAUCE, TAG_ROLLE } from './profilSchema';
import { alleStile, stilReihenfolge } from './wissensbasis';

// Scores auf zwei Nachkommastellen runden, damit 0,8 + 0,5 + 2 nicht als 3,3000000000000003
// an einer Schwelle vorbeirutscht.
export const runde = (wert) => Math.round(wert * 100) / 100;

// -0 entsteht bei 0 Stufen Abstand („-1 * 0“) und stört nur in Vergleichen mit Object.is.
const ohneMinusNull = (wert) => (wert === 0 ? 0 : wert);

const regelNummer = (regelId) => Number(String(regelId).slice(1));

/**
 * @param {Object} gang - Gang-Profil (hauptkomponente, zubereitung, sauce, intensitaet, komponenten)
 * @returns {boolean} true, wenn das Gericht eine Sauce hat, die mitbewertet wird
 */
export const hatSauce = (gang) => Boolean(gang.sauce) && gang.sauce !== SAUCE_KEINE;

/**
 * Passungs-Tags eines Gangs mit ihrem Gewicht: hk immer, zb immer, sc nur bei gesetzter Sauce.
 * @param {Object} gang
 * @returns {Array<{art: string, tag: string, gewicht: number}>}
 */
export function gangTags(gang) {
  const mitSauce = hatSauce(gang);
  const tags = [
    {
      art: TAG_HAUPTKOMPONENTE,
      tag: `${TAG_HAUPTKOMPONENTE}:${gang.hauptkomponente}`,
      gewicht: mitSauce ? GEWICHT_HAUPTKOMPONENTE_MIT_SAUCE : GEWICHT_HAUPTKOMPONENTE_OHNE_SAUCE,
    },
    { art: TAG_ZUBEREITUNG, tag: `${TAG_ZUBEREITUNG}:${gang.zubereitung}`, gewicht: GEWICHT_ZUBEREITUNG },
  ];
  if (mitSauce) tags.push({ art: TAG_SAUCE, tag: `${TAG_SAUCE}:${gang.sauce}`, gewicht: GEWICHT_SAUCE });
  return tags;
}

/**
 * @param {Object} stil
 * @param {string} tag - z. B. „hk:rind_lamm“
 * @returns {'stark'|'gut'|'neutral'|'meiden'}
 */
export function passungsStufe(stil, tag) {
  const passung = stil.passung || {};
  if ((passung.meiden || []).includes(tag)) return 'meiden';
  if ((passung.stark || []).includes(tag)) return 'stark';
  if ((passung.gut || []).includes(tag)) return 'gut';
  return 'neutral';
}

/**
 * Die Regel-Terme R1 bis R6 und R9 einzeln (R7, R8, R10 und R11 haben keinen eigenen Term).
 * @param {Object} stil
 * @param {Object} gang
 * @returns {{R1: number, R2: number, R3: number, R4: number, R5: number, R6: number, R9: number}}
 */
export function regelTerme(stil, gang) {
  const k = gang.komponenten;
  const terme = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R9: 0 };

  terme.R1 = -R1_STRAFE_JE_STUFE * Math.abs(stil.koerper - gang.intensitaet);

  if (k.saeure > stil.saeure) terme.R2 = -R2_STRAFE_JE_STUFE * (k.saeure - stil.saeure);

  if (k.suesse > stil.suesse) terme.R3 -= R3_STRAFE_NACH_ABSTAND[k.suesse - stil.suesse];
  const uebersuesse = stil.suesse - k.suesse;
  if (uebersuesse >= R3_UEBERSUESSE_AB_DIFFERENZ && gang.hauptkomponente !== R3_AUSNAHME_HAUPTKOMPONENTE) {
    terme.R3 -= R3_UEBERSUESSE_STRAFE_JE_STUFE_UEBER_1 * (uebersuesse - 1);
  }

  if (k.schaerfe >= R4_AB_SCHAERFE) {
    terme.R4 = -R4_STRAFE_JE_TANNIN * stil.tannin
      - R4_STRAFE_JE_ALKOHOL_UEBER_1 * Math.max(0, stil.alkohol - R4_SCHONEND_MAX_ALKOHOL)
      + (stil.suesse >= R4_RESTSUESSE_AB ? R4_BONUS_RESTSUESSE : 0)
      + (stil.schaum ? R4_BONUS_SCHAUM : 0);
  }

  if (k.umami >= R5_AB_UMAMI && k.salz < R5_SALZ_UNTER) {
    terme.R5 = -R5_STRAFE_JE_TANNIN_UEBER_1 * Math.max(0, stil.tannin - R5_TANNIN_FREI_BIS);
  }

  const fettOderSalz = k.fett >= R6_AB_FETT_ODER_SALZ || k.salz >= R6_AB_FETT_ODER_SALZ;
  if (fettOderSalz && (stil.tannin >= R6_AB_TANNIN || stil.saeure === R6_SAEURE)) terme.R6 = R6_BONUS;

  if (k.bitter >= R9_AB_BITTER && stil.tannin >= R9_AB_TANNIN) terme.R9 = -R9_STRAFE;

  Object.keys(terme).forEach((key) => { terme[key] = ohneMinusNull(terme[key]); });
  return terme;
}

/**
 * Kommt der Stil für das Gericht überhaupt infrage? Ein Stil mit `nurZu` in stile.json
 * (Süßweine: nur zu Dessert und Käse) passt nur, wenn die Rolle („rolle:dessert“) oder
 * die Hauptkomponente („hk:kaese_blau“) des Gangs in der Liste steht. Das gilt unabhängig
 * vom Score: Eine geschätzte Süße im herzhaften Gericht macht es nicht zum Dessert.
 * @param {Object} stil
 * @param {Object} gang
 * @returns {boolean}
 */
export function kommtInfrage(stil, gang) {
  if (!Array.isArray(stil.nurZu) || stil.nurZu.length === 0) return true;
  return stil.nurZu.includes(`${TAG_ROLLE}:${gang.rolle}`)
    || stil.nurZu.includes(`${TAG_HAUPTKOMPONENTE}:${gang.hauptkomponente}`);
}

/**
 * Score eines Stils für ein Gang-Profil: Passung der Tags plus Regel-Terme.
 * @param {Object} stil
 * @param {Object} gang
 * @returns {{stilId: string, score: number, infrage: boolean, passung: number, passungen: Array, terme: Object}}
 */
export function bewerteStil(stil, gang) {
  const passungen = gangTags(gang).map(({ art, tag, gewicht }) => {
    const stufe = passungsStufe(stil, tag);
    return { art, tag, stufe, gewicht, punkte: gewicht * PASSUNG_PUNKTE[stufe] };
  });
  const passung = passungen.reduce((summe, eintrag) => summe + eintrag.punkte, 0);
  const terme = regelTerme(stil, gang);
  const summeTerme = Object.values(terme).reduce((summe, wert) => summe + wert, 0);
  return {
    stilId: stil.id,
    score: ohneMinusNull(runde(passung + summeTerme)),
    infrage: kommtInfrage(stil, gang),
    passung: ohneMinusNull(runde(passung)),
    passungen,
    terme,
  };
}

/**
 * Kandidat für eine Empfehlung: Der Stil kommt infrage und erreicht S_MIN.
 * @param {{score: number, infrage: boolean}} bewertung - Ergebnis von bewerteStil
 * @returns {boolean}
 */
export const istKandidat = (bewertung) => bewertung.infrage && bewertung.score >= S_MIN;

/**
 * Alle Stile der Wissensbasis, absteigend nach Score; bei Gleichstand gilt die
 * Reihenfolge der Wissensbasis.
 * @param {Object} gang
 * @returns {Array<Object>} Bewertungen wie bewerteStil
 */
export function bewerteAlleStile(gang) {
  return alleStile()
    .map((stil) => bewerteStil(stil, gang))
    .sort((a, b) => (b.score - a.score) || (stilReihenfolge(a.stilId) - stilReihenfolge(b.stilId)));
}

/**
 * @param {number} score
 * @returns {string} „passt hervorragend“, „passt gut“ oder „passt“
 */
export function labelFuer(score) {
  if (score >= S_TOP) return LABEL_TOP;
  if (score >= S_GUT) return LABEL_GUT;
  return LABEL_BASIS;
}

/**
 * R8 nennt die Farbe nur als Grund, wenn sie zur Aussage der Regel passt.
 * @param {Object} stil
 * @param {Object} gang
 * @returns {boolean}
 */
export function farbePasstZuR8(stil, gang) {
  if (stil.farbe === 'rot') return R8_ROT_HAUPTKOMPONENTEN.includes(gang.hauptkomponente);
  if (stil.farbe === 'weiss') return R8_WEISS_HAUPTKOMPONENTEN.includes(gang.hauptkomponente);
  return false;
}

/**
 * Gründe für „Warum passt das?“: bis zu MAX_GRUENDE Regeln mit dem größten positiven
 * Beitrag oder einer erfüllten Bedingung. Mindestens ein Grund (Fallback R8 oder R1).
 * @param {Object} stil
 * @param {Object} gang
 * @param {{folgeGrund?: boolean}} [optionen] - folgeGrund: Menüfolge steigert sich passend (R10)
 * @returns {Array<string>} Regel-IDs
 */
export function ermittleGruende(stil, gang, { folgeGrund = false } = {}) {
  const bewertung = bewerteStil(stil, gang);
  const k = gang.komponenten;
  const kandidaten = [];
  const passungNachArt = (art) => bewertung.passungen.find((eintrag) => eintrag.art === art);

  const sauce = passungNachArt(TAG_SAUCE);
  if (sauce && sauce.stufe === 'stark') kandidaten.push({ id: 'R7', gewicht: sauce.punkte });

  const hauptkomponente = passungNachArt(TAG_HAUPTKOMPONENTE);
  if (hauptkomponente && hauptkomponente.stufe === 'stark' && farbePasstZuR8(stil, gang)) {
    kandidaten.push({ id: 'R8', gewicht: hauptkomponente.punkte });
  }

  const abstand = Math.abs(stil.koerper - gang.intensitaet);
  if (abstand === 0) kandidaten.push({ id: 'R1', gewicht: GRUND_GEWICHT_R1_GLEICH });
  else if (abstand <= R1_GRUND_NAH_ABSTAND) kandidaten.push({ id: 'R1', gewicht: GRUND_GEWICHT_R1_NAH });

  if (k.saeure >= R2_GRUND_AB_SAEURE && stil.saeure >= k.saeure) kandidaten.push({ id: 'R2', gewicht: GRUND_GEWICHT_R2 });

  const suessePasst = k.suesse >= R3_GRUND_AB_SUESSE && stil.suesse >= k.suesse && bewertung.terme.R3 === 0;
  const blauschimmel = gang.hauptkomponente === R3_AUSNAHME_HAUPTKOMPONENTE && stil.suesse >= R3_GRUND_BLAUSCHIMMEL_AB_SUESSE;
  if (suessePasst || blauschimmel) kandidaten.push({ id: 'R3', gewicht: GRUND_GEWICHT_R3 });

  if (k.schaerfe >= R4_AB_SCHAERFE) {
    const schonend = stil.tannin <= R4_SCHONEND_MAX_TANNIN && stil.alkohol <= R4_SCHONEND_MAX_ALKOHOL;
    if (bewertung.terme.R4 > 0 || schonend) kandidaten.push({ id: 'R4', gewicht: Math.max(bewertung.terme.R4, 1) });
  }

  if (k.umami >= R5_AB_UMAMI && k.salz < R5_SALZ_UNTER && stil.tannin <= R5_TANNIN_FREI_BIS) {
    kandidaten.push({ id: 'R5', gewicht: GRUND_GEWICHT_R5 });
  }

  if (bewertung.terme.R6 > 0) kandidaten.push({ id: 'R6', gewicht: bewertung.terme.R6 });

  if (k.bitter >= R9_AB_BITTER && stil.tannin < R9_AB_TANNIN) kandidaten.push({ id: 'R9', gewicht: GRUND_GEWICHT_R9 });

  if (folgeGrund) kandidaten.push({ id: 'R10', gewicht: GRUND_GEWICHT_R10 });

  kandidaten.sort((a, b) => (b.gewicht - a.gewicht) || (regelNummer(a.id) - regelNummer(b.id)));
  const gruende = kandidaten.slice(0, MAX_GRUENDE).map((grund) => grund.id);
  if (gruende.length > 0) return gruende;
  return [farbePasstZuR8(stil, gang) ? 'R8' : 'R1'];
}
