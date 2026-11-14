/**
 * Gänge eines Menüs und ihre Gang-Profile.
 *
 * Gang = Sektion in Menü-Reihenfolge mit mindestens einem Rezept. Die Sektion
 * „Drinks“ zählt nicht, Rezepte mit Rolle getraenk werden ignoriert.
 * Tragend sind alle Rezepte außer Beilagen und Saucen (BEGLEITER_ROLLEN); gibt es
 * keins, tragen alle. Leitrezept = Rezept mit Rolle hauptgericht, sonst das
 * tragende mit der höchsten Intensität (bei Gleichstand das erste).
 *
 * Tragende Rezepte mit der Rolle des Leitrezepts bilden die Auswahl des Gangs (meist nur
 * das Leitrezept; bei „diverse Pizzen“ oder Tapas alle). Jedes Rezept der Auswahl bekommt
 * ein eigenes Profil, die Engine bewertet die Weinstile je Profil und nimmt den Median
 * (bewerteAuswahl in bewertung.js). Vorher war der Gang ein einziges Profil aus dem Maximum
 * aller tragenden Rezepte: Eine scharfe, eine süße und eine bittere Pizza machten den ganzen
 * Gang scharf, süß und bitter, und kein Wein passte mehr.
 *
 * Profil eines Rezepts der Auswahl: Hauptkomponente, Zubereitung und Sauce vom Rezept selbst;
 * hat es keine Sauce, zählt die eines Rezepts mit Rolle sauce_dip. Intensität und Komponenten
 * sind das Maximum aus dem Rezept und den übrigen tragenden Rezepten (andere Rolle, z. B. ein
 * Salat neben dem Hauptgericht); Beilagen und Saucen heben es höchstens um
 * BEGLEITER_MAX_ANHEBUNG Stufe.
 */
import {
  ROLLE_GETRAENK,
  ROLLE_HAUPTGERICHT,
  ROLLE_SAUCE,
  SAUCE_KEINE,
  BEGLEITER_ROLLEN,
  BEGLEITER_MAX_ANHEBUNG,
  DESSERT_ROLLEN,
  DESSERT_SEKTION_TEIL,
  ALTE_MENUES_SEKTION_NAME,
} from './konstanten';
import { KOMPONENTEN, normalisiereWeinprofil } from './profilSchema';
import { DRINKS_SECTION_NAME } from '../menuSections';

export const GANG_STATUS_OK = 'ok';
export const GANG_STATUS_OHNE_PROFIL = 'ohneProfil';
export const GANG_STATUS_NUR_GETRAENKE = 'nurGetraenke';

/**
 * @param {string} name - Sektionsname
 * @returns {boolean}
 */
export const istDrinksSektion = (name) => typeof name === 'string'
  && name.trim().toLowerCase() === DRINKS_SECTION_NAME.toLowerCase();

const hoechsteIntensitaet = (eintraege) => eintraege.reduce(
  (beste, eintrag) => (eintrag.profil.intensitaet > beste.profil.intensitaet ? eintrag : beste),
  eintraege[0],
);

const istBegleiter = (eintrag) => BEGLEITER_ROLLEN.includes(eintrag.profil.rolle);

/**
 * Leitrezept eines Gangs: Hauptgericht vor allem anderen, sonst das intensivste
 * tragende Rezept (keine Beilage, keine Sauce), sonst das intensivste überhaupt.
 * @param {Array<{id: string, profil: Object}>} eintraege - Rezepte mit gültigem Profil, ohne Getränke
 * @returns {{id: string, profil: Object}}
 */
export function waehleLeitrezept(eintraege) {
  const hauptgerichte = eintraege.filter((eintrag) => eintrag.profil.rolle === ROLLE_HAUPTGERICHT);
  if (hauptgerichte.length > 0) return hoechsteIntensitaet(hauptgerichte);
  const tragende = eintraege.filter((eintrag) => !istBegleiter(eintrag));
  return hoechsteIntensitaet(tragende.length > 0 ? tragende : eintraege);
}

/**
 * Wert des Gangs für eine Eigenschaft: Maximum der tragenden Rezepte, von Beilagen und
 * Saucen um höchstens BEGLEITER_MAX_ANHEBUNG Stufe angehoben.
 * @param {Array<Object>} tragende - nicht leer
 * @param {Array<Object>} begleiter
 * @param {function(Object): number} wertVon
 * @returns {number}
 */
function gangWert(tragende, begleiter, wertVon) {
  const basis = Math.max(...tragende.map(wertVon));
  if (begleiter.length === 0) return basis;
  const begleitung = Math.max(...begleiter.map(wertVon));
  return Math.max(basis, Math.min(begleitung, basis + BEGLEITER_MAX_ANHEBUNG));
}

/**
 * Gang-Profile aus den Rezepten eines Gangs: je Rezept der Auswahl ein Profil (`auswahl`),
 * dazu `profil`, das Profil des Leitrezepts (Rolle für die Dessert-Erkennung; bei einem
 * einzigen tragenden Rezept das Profil des ganzen Gangs).
 * @param {Array<Object>} rezepte - Rezepte (mit optionalem Feld weinprofil) in Menü-Reihenfolge
 * @returns {{status: string, profil?: Object, auswahl?: Array<{id: string, profil: Object}>, leitRezeptId?: string,
 *   rezeptIdsMitProfil?: Array<string>, fehlendeProfile: number}}
 */
export function bildeGangProfil(rezepte) {
  const mitProfil = [];
  let fehlendeProfile = 0;
  (rezepte || []).forEach((rezept) => {
    const profil = normalisiereWeinprofil(rezept?.weinprofil);
    if (profil) mitProfil.push({ id: rezept.id, profil });
    else fehlendeProfile += 1;
  });

  const relevant = mitProfil.filter((eintrag) => eintrag.profil.rolle !== ROLLE_GETRAENK);
  if (relevant.length === 0) {
    return {
      status: fehlendeProfile > 0 ? GANG_STATUS_OHNE_PROFIL : GANG_STATUS_NUR_GETRAENKE,
      fehlendeProfile,
    };
  }

  const leit = waehleLeitrezept(relevant);
  const sauceRezept = relevant.find(
    (eintrag) => eintrag.profil.rolle === ROLLE_SAUCE && eintrag.profil.sauce !== SAUCE_KEINE,
  );

  const tragendeRezepte = relevant.filter((eintrag) => !istBegleiter(eintrag));
  const tragende = tragendeRezepte.length > 0 ? tragendeRezepte : relevant;
  const begleiter = tragendeRezepte.length > 0 ? relevant.filter(istBegleiter) : [];
  const auswahl = tragende.filter((eintrag) => eintrag.profil.rolle === leit.profil.rolle);
  const uebrige = tragende.filter((eintrag) => !auswahl.includes(eintrag));

  const profilFuer = (eintrag) => {
    const basis = [eintrag, ...uebrige];
    const komponenten = {};
    KOMPONENTEN.forEach((name) => {
      komponenten[name] = gangWert(basis, begleiter, (anderer) => anderer.profil.komponenten[name]);
    });
    return {
      rolle: eintrag.profil.rolle,
      hauptkomponente: eintrag.profil.hauptkomponente,
      zubereitung: eintrag.profil.zubereitung,
      // Eine Sauce aus eigenem Rezept zählt nur, wenn das Rezept keine hat: Preiselbeeren
      // neben dem Rehrücken ersetzen nicht dessen Wildjus.
      sauce: eintrag.profil.sauce === SAUCE_KEINE && sauceRezept ? sauceRezept.profil.sauce : eintrag.profil.sauce,
      intensitaet: gangWert(basis, begleiter, (anderer) => anderer.profil.intensitaet),
      komponenten,
    };
  };
  const auswahlProfile = auswahl.map((eintrag) => ({ id: eintrag.id, profil: profilFuer(eintrag) }));

  return {
    status: GANG_STATUS_OK,
    profil: auswahlProfile.find((eintrag) => eintrag.id === leit.id).profil,
    auswahl: auswahlProfile,
    leitRezeptId: leit.id,
    rezeptIdsMitProfil: relevant.map((eintrag) => eintrag.id),
    fehlendeProfile,
  };
}

/**
 * Dessert-Gang für den Modus „Ein Wein für alles“: Leitrezept mit Rolle dessert oder
 * gebaeck_kuchen, oder der Sektionsname enthält „Dessert“.
 * @param {string} sektionName
 * @param {Object} gang - Ergebnis von bildeGangProfil
 * @returns {boolean}
 */
export function istDessertGang(sektionName, gang) {
  if (typeof sektionName === 'string' && sektionName.toLowerCase().includes(DESSERT_SEKTION_TEIL)) return true;
  return gang?.status === GANG_STATUS_OK && DESSERT_ROLLEN.includes(gang.profil.rolle);
}

/**
 * Sektionen eines Menüs; alte Menüs ohne Sektionen bilden eine Sektion aus `recipeIds`
 * (Name wie in MenuDetail.js).
 * @param {Object} menu
 * @returns {Array<{name: string, recipeIds: Array<string>}>}
 */
export function menueSektionen(menu) {
  return Array.isArray(menu?.sections) && menu.sections.length > 0
    ? menu.sections
    : [{ name: ALTE_MENUES_SEKTION_NAME, recipeIds: menu?.recipeIds || [] }];
}

/**
 * Gänge eines Menüs in Menü-Reihenfolge. Sektionen ohne geladenes Rezept, die
 * Sektion „Drinks“ und Sektionen nur aus Getränken sind keine Gänge.
 * Alte Menüs ohne Sektionen bilden einen Gang aus `recipeIds`.
 * @param {Object} menu - Menü mit sections [{name, recipeIds}] oder altem recipeIds
 * @param {Array<Object>} rezepte - geladene Rezepte (mit optionalem weinprofil)
 * @returns {Array<{sektionIndex: number, sektionName: string, rezeptIds: Array<string>, gang: Object, istDessert: boolean}>}
 */
export function gaengeAusMenue(menu, rezepte) {
  const rezeptNachId = new Map((rezepte || []).filter(Boolean).map((rezept) => [rezept.id, rezept]));
  return menueSektionen(menu).flatMap((sektion, sektionIndex) => {
    const sektionName = typeof sektion?.name === 'string' ? sektion.name : '';
    if (istDrinksSektion(sektionName)) return [];
    const sektionRezepte = (Array.isArray(sektion?.recipeIds) ? sektion.recipeIds : [])
      .map((id) => rezeptNachId.get(id))
      .filter(Boolean);
    if (sektionRezepte.length === 0) return [];
    const gang = bildeGangProfil(sektionRezepte);
    if (gang.status === GANG_STATUS_NUR_GETRAENKE) return [];
    return [{
      sektionIndex,
      sektionName,
      rezeptIds: sektionRezepte.map((rezept) => rezept.id),
      gang,
      istDessert: istDessertGang(sektionName, gang),
    }];
  });
}
