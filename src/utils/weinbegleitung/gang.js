/**
 * Gänge eines Menüs und ihr gemeinsames Gang-Profil.
 *
 * Gang = Sektion in Menü-Reihenfolge mit mindestens einem Rezept. Die Sektion
 * „Drinks“ zählt nicht, Rezepte mit Rolle getraenk werden ignoriert.
 * Leitrezept = Rezept mit Rolle hauptgericht, sonst das mit der höchsten
 * Intensität (bei Gleichstand das erste). Hauptkomponente und Zubereitung
 * kommen vom Leitrezept, die Sauce von einem Rezept mit Rolle sauce_dip, sonst
 * vom Leitrezept. Intensität und Komponenten sind das Maximum über alle Rezepte.
 */
import {
  ROLLE_GETRAENK,
  ROLLE_HAUPTGERICHT,
  ROLLE_SAUCE,
  SAUCE_KEINE,
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

/**
 * Leitrezept eines Gangs: Hauptgericht vor allem anderen, sonst die höchste Intensität.
 * @param {Array<{id: string, profil: Object}>} eintraege - Rezepte mit gültigem Profil, ohne Getränke
 * @returns {{id: string, profil: Object}}
 */
export function waehleLeitrezept(eintraege) {
  const hauptgerichte = eintraege.filter((eintrag) => eintrag.profil.rolle === ROLLE_HAUPTGERICHT);
  return hoechsteIntensitaet(hauptgerichte.length > 0 ? hauptgerichte : eintraege);
}

/**
 * Gang-Profil aus den Rezepten eines Gangs.
 * @param {Array<Object>} rezepte - Rezepte (mit optionalem Feld weinprofil) in Menü-Reihenfolge
 * @returns {{status: string, profil?: Object, leitRezeptId?: string, rezeptIdsMitProfil?: Array<string>, fehlendeProfile: number}}
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

  const komponenten = {};
  KOMPONENTEN.forEach((name) => {
    komponenten[name] = Math.max(...relevant.map((eintrag) => eintrag.profil.komponenten[name]));
  });

  return {
    status: GANG_STATUS_OK,
    profil: {
      rolle: leit.profil.rolle,
      hauptkomponente: leit.profil.hauptkomponente,
      zubereitung: leit.profil.zubereitung,
      sauce: sauceRezept ? sauceRezept.profil.sauce : leit.profil.sauce,
      intensitaet: Math.max(...relevant.map((eintrag) => eintrag.profil.intensitaet)),
      komponenten,
    },
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
