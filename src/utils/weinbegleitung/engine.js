/**
 * Engine der Weinbegleitung: reine Funktionen, ohne Seiteneffekte und ohne Netz.
 *
 * - empfehlungFuerRezept: Einzelrezept (Rezeptansicht, kein Snapshot)
 * - berechneWeinbegleitung: Menü, Modus „Pro Gang“ (mit Menüfolge R10) oder
 *   „Ein Wein für alles“; das Ergebnis ist die Grundlage des Snapshots
 *   `menus/{id}.weinbegleitung` (gespeichert ab PR 4).
 *
 * Tracker: docs/vorhaben/weinbegleitung.md
 */
import {
  RULES_VERSION,
  ROLLEN_OHNE_WEIN,
  S_MIN,
  MAX_KANDIDATEN_JE_GANG,
  MAX_ALTERNATIVEN,
  MAX_GAENGE_VOLLSTAENDIG,
  FOLGE_KOERPER_TOLERANZ,
  FOLGE_STRAFE_KOERPER_FAELLT,
  FOLGE_STRAFE_ROT_VOR_HELL,
  FOLGE_STRAFE_SUESSE_FAELLT,
  FOLGE_STRAFE_GLEICHER_STIL,
  FOLGE_FARBREGEL_AUSNAHME_AB_SUESSE,
  MODUS_PRO_GANG,
  MODUS_EIN_WEIN,
  HINWEIS_KEIN_STIL,
  HINWEIS_OHNE_PROFIL,
  HINWEIS_KEIN_GEMEINSAMER_STIL,
  STATUS_OK,
  STATUS_OHNE_PROFIL,
  STATUS_ROLLE_OHNE_WEIN,
  STATUS_KEIN_STIL,
} from './konstanten';
import { bewerteAlleStile, ermittleGruende, labelFuer, runde } from './bewertung';
import { gaengeAusMenue, GANG_STATUS_OK } from './gang';
import { normalisiereWeinprofil } from './profilSchema';
import { alleStile, getStil, stilReihenfolge } from './wissensbasis';

// Toleranz für Gleichstand bei Summen gerundeter Scores: der zuerst gefundene Weg gewinnt.
const VERGLEICH_TOLERANZ = 1e-9;

const REGEL_KEIN_STIL = 'R11';

// ---------------------------------------------------------------------------
// Einzelrezept und einzelner Gang
// ---------------------------------------------------------------------------

const stilEintrag = (bewertung, gangProfil) => ({
  stilId: bewertung.stilId,
  score: bewertung.score,
  label: labelFuer(bewertung.score),
  regelIds: ermittleGruende(getStil(bewertung.stilId), gangProfil),
});

/**
 * Empfehlung für ein Gang-Profil ohne Menüfolge: bester Stil und bis zu zwei
 * Alternativen mit Score ≥ S_MIN; ohne Kandidat der Hinweis R11.
 * @param {Object} gangProfil
 * @returns {Object} {status, stilId, score, label, regelIds, alternativen} oder {status: keinStil, hinweis, regelIds}
 */
export function empfehlungFuerGangProfil(gangProfil) {
  const passende = bewerteAlleStile(gangProfil).filter((bewertung) => bewertung.score >= S_MIN);
  if (passende.length === 0) {
    return { status: STATUS_KEIN_STIL, hinweis: HINWEIS_KEIN_STIL, regelIds: [REGEL_KEIN_STIL] };
  }
  const [beste, ...rest] = passende;
  return {
    status: STATUS_OK,
    ...stilEintrag(beste, gangProfil),
    alternativen: rest.slice(0, MAX_ALTERNATIVEN).map((bewertung) => stilEintrag(bewertung, gangProfil)),
  };
}

/**
 * Empfehlung für ein Gericht-Profil. Keine Empfehlung ohne gültiges Profil oder
 * wenn die Rolle in ROLLEN_OHNE_WEIN liegt.
 * @param {*} weinprofil - Feld `weinprofil` eines Rezepts
 * @returns {Object} Ergebnis mit status (ok, ohneProfil, rolleOhneWein, keinStil)
 */
export function empfehlungFuerWeinprofil(weinprofil) {
  const profil = normalisiereWeinprofil(weinprofil);
  if (!profil) return { status: STATUS_OHNE_PROFIL };
  if (ROLLEN_OHNE_WEIN.includes(profil.rolle)) return { status: STATUS_ROLLE_OHNE_WEIN, rolle: profil.rolle };
  return empfehlungFuerGangProfil(profil);
}

/**
 * @param {Object} rezept - Rezept mit optionalem Feld weinprofil
 * @returns {Object} wie empfehlungFuerWeinprofil
 */
export const empfehlungFuerRezept = (rezept) => empfehlungFuerWeinprofil(rezept?.weinprofil);

// ---------------------------------------------------------------------------
// Menüfolge (R10)
// ---------------------------------------------------------------------------

/**
 * Strafpunkte für den Übergang vom vorherigen Gang mit Wein zum nächsten.
 * @param {Object} vorher - Stil des vorherigen Gangs mit Wein
 * @param {Object} nachher - Stil des aktuellen Gangs
 * @returns {number} Strafe (≥ 0), wird vom Gesamtwert abgezogen
 */
export function folgeStrafe(vorher, nachher) {
  let strafe = 0;
  if (vorher.koerper - nachher.koerper > FOLGE_KOERPER_TOLERANZ) strafe += FOLGE_STRAFE_KOERPER_FAELLT;
  const farbregelAusgenommen = vorher.suesse >= FOLGE_FARBREGEL_AUSNAHME_AB_SUESSE
    || nachher.suesse >= FOLGE_FARBREGEL_AUSNAHME_AB_SUESSE;
  if (!farbregelAusgenommen && vorher.farbe === 'rot' && (nachher.farbe === 'weiss' || nachher.farbe === 'rose')) {
    strafe += FOLGE_STRAFE_ROT_VOR_HELL;
  }
  if (nachher.suesse < vorher.suesse) strafe += FOLGE_STRAFE_SUESSE_FAELLT;
  if (vorher.id === nachher.id) strafe += FOLGE_STRAFE_GLEICHER_STIL;
  return strafe;
}

/**
 * Steigert sich die Folge sichtbar (kräftiger, von hell zu rot oder süßer)? Dann
 * erscheint R10 als Grund, sofern der Übergang ohne Strafe ist.
 * @param {Object} vorher
 * @param {Object} nachher
 * @returns {boolean}
 */
export function folgeSteigertSich(vorher, nachher) {
  return nachher.koerper > vorher.koerper
    || (vorher.farbe !== 'rot' && nachher.farbe === 'rot')
    || nachher.suesse > vorher.suesse;
}

/**
 * Beste Folge über alle Kombinationen der Kandidaten (Summe der Scores minus Strafen).
 * Bei Gleichstand gewinnt die zuerst gefundene Kombination, also die mit den
 * besser bewerteten Kandidaten weiter vorn.
 * @param {Array<{kandidaten: Array<{stilId: string, score: number}>}>} gaenge - nur Gänge mit Wein
 * @returns {Array<Object>} gewählter Kandidat je Gang
 */
export function optimiereFolgeVollstaendig(gaenge) {
  let besteAuswahl = [];
  let besterWert = -Infinity;
  const pfad = [];
  const suche = (index, wert, vorherStil) => {
    if (index === gaenge.length) {
      if (wert > besterWert + VERGLEICH_TOLERANZ) {
        besterWert = wert;
        besteAuswahl = [...pfad];
      }
      return;
    }
    gaenge[index].kandidaten.forEach((kandidat) => {
      const stil = getStil(kandidat.stilId);
      const strafe = vorherStil ? folgeStrafe(vorherStil, stil) : 0;
      pfad.push(kandidat);
      suche(index + 1, wert + kandidat.score - strafe, stil);
      pfad.pop();
    });
  };
  suche(0, 0, null);
  return besteAuswahl;
}

/**
 * Greedy von vorn: je Gang der Kandidat mit dem besten Score abzüglich der Strafe
 * gegenüber dem zuvor gewählten Gang.
 * @param {Array<{kandidaten: Array<{stilId: string, score: number}>}>} gaenge - nur Gänge mit Wein
 * @returns {Array<Object>} gewählter Kandidat je Gang
 */
export function optimiereFolgeGreedy(gaenge) {
  const auswahl = [];
  let vorherStil = null;
  gaenge.forEach((gang) => {
    let beste = null;
    let besterWert = -Infinity;
    gang.kandidaten.forEach((kandidat) => {
      const stil = getStil(kandidat.stilId);
      const wert = kandidat.score - (vorherStil ? folgeStrafe(vorherStil, stil) : 0);
      if (wert > besterWert + VERGLEICH_TOLERANZ) {
        besterWert = wert;
        beste = kandidat;
      }
    });
    auswahl.push(beste);
    vorherStil = getStil(beste.stilId);
  });
  return auswahl;
}

/**
 * Bis MAX_GAENGE_VOLLSTAENDIG Gänge mit Wein alle Kombinationen, darüber greedy.
 * @param {Array<Object>} gaenge - nur Gänge mit Wein, je mit kandidaten
 * @returns {Array<Object>} gewählter Kandidat je Gang
 */
export function waehleFolge(gaenge) {
  return gaenge.length <= MAX_GAENGE_VOLLSTAENDIG ? optimiereFolgeVollstaendig(gaenge) : optimiereFolgeGreedy(gaenge);
}

const normalisierterName = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '');

/**
 * Fixierter Stil eines Gangs. Zuerst zählt die genaue Übereinstimmung (Index und
 * Name); wurde die Sektion verschoben, genügt der Name, solange er im Menü nur
 * einmal vorkommt. Unbekannte Stile werden ignoriert.
 * @param {{sektionIndex: number, sektionName: string}} gang
 * @param {Array<{sektionIndex: number, sektionName: string, stilId: string}>} fixierungen
 * @param {Map<string, number>} namensHaeufigkeit - Anzahl der Gänge je normalisiertem Namen
 * @returns {string|null}
 */
export function findeFixierung(gang, fixierungen, namensHaeufigkeit) {
  const gueltig = (Array.isArray(fixierungen) ? fixierungen : [])
    .filter((fixierung) => fixierung && typeof fixierung.stilId === 'string' && getStil(fixierung.stilId));
  const name = normalisierterName(gang.sektionName);
  const genau = gueltig.find(
    (fixierung) => fixierung.sektionIndex === gang.sektionIndex && normalisierterName(fixierung.sektionName) === name,
  );
  if (genau) return genau.stilId;
  if ((namensHaeufigkeit?.get(name) || 0) !== 1) return null;
  const nachName = gueltig.filter((fixierung) => normalisierterName(fixierung.sektionName) === name);
  return nachName.length === 1 ? nachName[0].stilId : null;
}

const leererEintrag = (gang, hinweis) => ({
  sektionIndex: gang.sektionIndex,
  sektionName: gang.sektionName,
  stilId: null,
  alternativen: [],
  label: null,
  regelIds: hinweis === HINWEIS_KEIN_STIL ? [REGEL_KEIN_STIL] : [],
  fixiert: false,
  hinweis,
  score: null,
  strafe: 0,
  istDessert: gang.istDessert,
});

const alternativEintraege = (bewertungen, ohneStilId) => bewertungen
  .filter((bewertung) => bewertung.stilId !== ohneStilId)
  .slice(0, MAX_ALTERNATIVEN)
  .map((bewertung) => ({ stilId: bewertung.stilId, label: labelFuer(bewertung.score) }));

/**
 * Modus „Pro Gang“: je Gang die besten vier Stile mit Score ≥ S_MIN als Kandidaten,
 * dann die beste Folge (bis MAX_GAENGE_VOLLSTAENDIG Gänge mit Wein alle
 * Kombinationen, darüber greedy von vorn). Fixierte Gänge sind gesetzt.
 * @param {Array<Object>} gaenge - Ergebnis von gaengeAusMenue
 * @param {{fixierungen?: Array<Object>}} [optionen]
 * @returns {{modus: string, rulesVersion: string, gaenge: Array<Object>, gesamtwert: number, strafen: number}}
 */
export function berechneProGang(gaenge, { fixierungen = [] } = {}) {
  const namensHaeufigkeit = new Map();
  gaenge.forEach((gang) => {
    const name = normalisierterName(gang.sektionName);
    namensHaeufigkeit.set(name, (namensHaeufigkeit.get(name) || 0) + 1);
  });

  const vorbereitet = gaenge.map((gang) => {
    if (gang.gang.status !== GANG_STATUS_OK) return { ...gang, art: HINWEIS_OHNE_PROFIL };
    const bewertungen = bewerteAlleStile(gang.gang.profil);
    const passende = bewertungen.filter((bewertung) => bewertung.score >= S_MIN);
    const fixierterStilId = findeFixierung(gang, fixierungen, namensHaeufigkeit);
    if (fixierterStilId) {
      const fixiert = bewertungen.find((bewertung) => bewertung.stilId === fixierterStilId);
      return { ...gang, art: 'wein', passende, kandidaten: [fixiert], fixiert: true };
    }
    if (passende.length === 0) return { ...gang, art: HINWEIS_KEIN_STIL };
    return { ...gang, art: 'wein', passende, kandidaten: passende.slice(0, MAX_KANDIDATEN_JE_GANG), fixiert: false };
  });

  const mitWein = vorbereitet.filter((gang) => gang.art === 'wein');
  const auswahl = waehleFolge(mitWein);

  let vorherStil = null;
  let weinIndex = 0;
  let gesamtwert = 0;
  let strafen = 0;
  const eintraege = vorbereitet.map((gang) => {
    if (gang.art !== 'wein') return leererEintrag(gang, gang.art);
    const gewaehlt = auswahl[weinIndex];
    weinIndex += 1;
    const stil = getStil(gewaehlt.stilId);
    const strafe = vorherStil ? folgeStrafe(vorherStil, stil) : 0;
    const folgeGrund = Boolean(vorherStil) && strafe === 0 && folgeSteigertSich(vorherStil, stil);
    vorherStil = stil;
    gesamtwert += gewaehlt.score - strafe;
    strafen += strafe;
    const alternativQuelle = gang.fixiert ? gang.passende : gang.kandidaten;
    return {
      sektionIndex: gang.sektionIndex,
      sektionName: gang.sektionName,
      stilId: gewaehlt.stilId,
      alternativen: alternativEintraege(alternativQuelle, gewaehlt.stilId),
      label: labelFuer(gewaehlt.score),
      regelIds: ermittleGruende(stil, gang.gang.profil, { folgeGrund }),
      fixiert: gang.fixiert,
      hinweis: null,
      score: gewaehlt.score,
      strafe,
      istDessert: gang.istDessert,
    };
  });

  return {
    modus: MODUS_PRO_GANG,
    rulesVersion: RULES_VERSION,
    gaenge: eintraege,
    gesamtwert: runde(gesamtwert),
    strafen,
  };
}

// ---------------------------------------------------------------------------
// Modus „Ein Wein für alles“
// ---------------------------------------------------------------------------

/**
 * Rangliste der Stile für mehrere Gänge: höchstes Minimum, bei Gleichstand höhere
 * Summe, dann Reihenfolge der Wissensbasis.
 * @param {Array<{bewertungen: Array<Object>}>} gaenge
 * @returns {Array<{stilId: string, minimum: number, summe: number, scores: Array<number>}>}
 */
export function gemeinsameRangliste(gaenge) {
  return alleStile()
    .map((stil) => {
      const scores = gaenge.map((gang) => gang.bewertungen.find((bewertung) => bewertung.stilId === stil.id).score);
      return {
        stilId: stil.id,
        minimum: Math.min(...scores),
        summe: runde(scores.reduce((summe, score) => summe + score, 0)),
        scores,
      };
    })
    .sort((a, b) => (b.minimum - a.minimum) || (b.summe - a.summe) || (stilReihenfolge(a.stilId) - stilReihenfolge(b.stilId)));
}

/**
 * Modus „Ein Wein für alles“: ein gemeinsamer Stil für alle Nicht-Dessert-Gänge mit
 * passendem Wein (höchstes Minimum, Gleichstand: höhere Summe); Dessert-Gänge
 * bekommen eine eigene Empfehlung. Gänge ohne passenden Stil behalten R11.
 * @param {Array<Object>} gaenge - Ergebnis von gaengeAusMenue
 * @param {{gemeinsamerStilId?: string|null}} [optionen] - vom Nutzer gewählter gemeinsamer Stil
 * @returns {{modus: string, rulesVersion: string, gaenge: Array<Object>, gemeinsamerStilId: string|null}}
 */
export function berechneEinWein(gaenge, { gemeinsamerStilId = null } = {}) {
  const vorbereitet = gaenge.map((gang) => {
    if (gang.gang.status !== GANG_STATUS_OK) return { ...gang, art: HINWEIS_OHNE_PROFIL };
    const bewertungen = bewerteAlleStile(gang.gang.profil);
    const passende = bewertungen.filter((bewertung) => bewertung.score >= S_MIN);
    if (passende.length === 0) return { ...gang, art: HINWEIS_KEIN_STIL };
    return { ...gang, art: 'wein', bewertungen, passende };
  });

  const hauptgaenge = vorbereitet.filter((gang) => gang.art === 'wein' && !gang.istDessert);
  const rangliste = hauptgaenge.length > 0 ? gemeinsameRangliste(hauptgaenge) : [];

  let gemeinsam = null;
  let fixiert = false;
  if (hauptgaenge.length > 0) {
    if (gemeinsamerStilId && getStil(gemeinsamerStilId)) {
      gemeinsam = gemeinsamerStilId;
      fixiert = true;
    } else if (rangliste[0].minimum >= S_MIN) {
      gemeinsam = rangliste[0].stilId;
    }
  }
  const gemeinsameAlternativen = rangliste
    .filter((eintrag) => eintrag.minimum >= S_MIN && eintrag.stilId !== gemeinsam)
    .slice(0, MAX_ALTERNATIVEN);

  const eintraege = vorbereitet.map((gang) => {
    if (gang.art !== 'wein') return leererEintrag(gang, gang.art);

    if (gang.istDessert) {
      const [beste] = gang.passende;
      return {
        sektionIndex: gang.sektionIndex,
        sektionName: gang.sektionName,
        stilId: beste.stilId,
        alternativen: alternativEintraege(gang.passende, beste.stilId),
        label: labelFuer(beste.score),
        regelIds: ermittleGruende(getStil(beste.stilId), gang.gang.profil),
        fixiert: false,
        hinweis: null,
        score: beste.score,
        strafe: 0,
        istDessert: true,
      };
    }

    if (!gemeinsam) return leererEintrag(gang, HINWEIS_KEIN_GEMEINSAMER_STIL);
    const bewertung = gang.bewertungen.find((eintrag) => eintrag.stilId === gemeinsam);
    const scoreVon = (stilId) => gang.bewertungen.find((eintrag) => eintrag.stilId === stilId).score;
    return {
      sektionIndex: gang.sektionIndex,
      sektionName: gang.sektionName,
      stilId: gemeinsam,
      alternativen: gemeinsameAlternativen.map((eintrag) => ({
        stilId: eintrag.stilId,
        label: labelFuer(scoreVon(eintrag.stilId)),
      })),
      label: labelFuer(bewertung.score),
      regelIds: ermittleGruende(getStil(gemeinsam), gang.gang.profil),
      fixiert,
      hinweis: null,
      score: bewertung.score,
      strafe: 0,
      istDessert: false,
    };
  });

  return {
    modus: MODUS_EIN_WEIN,
    rulesVersion: RULES_VERSION,
    gaenge: eintraege,
    gemeinsamerStilId: gemeinsam,
  };
}

// ---------------------------------------------------------------------------
// Einstieg für das Menü
// ---------------------------------------------------------------------------

/**
 * Weinbegleitung für ein Menü.
 * @param {Object} parameter
 * @param {Object} parameter.menu - Menü mit sections [{name, recipeIds}]
 * @param {Array<Object>} parameter.rezepte - geladene Rezepte mit optionalem weinprofil
 * @param {string} [parameter.modus] - MODUS_PRO_GANG (Standard) oder MODUS_EIN_WEIN
 * @param {Array<Object>} [parameter.fixierungen] - fixierte Gänge (sektionIndex, sektionName, stilId)
 * @param {string|null} [parameter.gemeinsamerStilId] - gewählter Stil im Modus „Ein Wein“
 * @returns {Object} Ergebnis von berechneProGang bzw. berechneEinWein
 */
export function berechneWeinbegleitung({ menu, rezepte, modus = MODUS_PRO_GANG, fixierungen = [], gemeinsamerStilId = null }) {
  const gaenge = gaengeAusMenue(menu, rezepte);
  if (modus === MODUS_EIN_WEIN) return berechneEinWein(gaenge, { gemeinsamerStilId });
  return berechneProGang(gaenge, { fixierungen });
}
