/**
 * Weinbegleitung im Menü: Snapshot `menus/{id}.weinbegleitung`, sein inputHash und die
 * Zuordnung gespeicherter Gänge zu den Sektionen. Reine Funktionen bis auf den Hash
 * (Web Crypto, async). Tracker: docs/vorhaben/weinbegleitung.md.
 */
import { RULES_VERSION, MODUS_PRO_GANG, MODUS_EIN_WEIN } from './konstanten';
import { istDrinksSektion, menueSektionen } from './gang';
import { sha256Hex } from './profilHash';

// Teil der Hash-Eingabe: Ändert sich, was in den Hash eingeht, steigt die Kennung.
export const MENUE_HASH_KENNUNG = 'weinbegleitung-v1';

const MODI = [MODUS_PRO_GANG, MODUS_EIN_WEIN];

const normalisierterName = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '');

/**
 * Rezept-IDs, die für die Weinbegleitung zählen: alle Sektionen außer „Drinks“, in
 * Menü-Reihenfolge, jede ID einmal.
 * @param {Object} menu
 * @returns {string[]}
 */
export function weinRezeptIds(menu) {
  const ids = [];
  menueSektionen(menu).forEach((sektion) => {
    if (istDrinksSektion(sektion?.name)) return;
    (Array.isArray(sektion?.recipeIds) ? sektion.recipeIds : []).forEach((id) => {
      if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
    });
  });
  return ids;
}

/**
 * @param {Array} liste
 * @param {number} groesse
 * @returns {Array<Array>} Blöcke von höchstens `groesse` Einträgen
 */
export function inBloecken(liste, groesse) {
  const bloecke = [];
  for (let i = 0; i < liste.length; i += groesse) bloecke.push(liste.slice(i, i + groesse));
  return bloecke;
}

/**
 * Eingabe des Snapshot-inputHash: Sektionsnamen, recipeIds, der Profil-inputHash je Rezept
 * und RULES_VERSION. Die Sektion „Drinks“ zählt nicht.
 * @param {Object} menu
 * @param {Array<Object>} rezepte - geladene Rezepte mit optionalem weinprofil
 * @returns {string}
 */
export function menueHashEingabe(menu, rezepte) {
  const rezeptNachId = new Map((rezepte || []).filter(Boolean).map((rezept) => [rezept.id, rezept]));
  const sektionen = menueSektionen(menu)
    .filter((sektion) => !istDrinksSektion(sektion?.name))
    .map((sektion) => [
      typeof sektion?.name === 'string' ? sektion.name.trim() : '',
      (Array.isArray(sektion?.recipeIds) ? sektion.recipeIds : [])
        .filter((id) => typeof id === 'string')
        .map((id) => [id, rezeptNachId.get(id)?.weinprofil?.inputHash || null]),
    ]);
  return JSON.stringify([MENUE_HASH_KENNUNG, RULES_VERSION, sektionen]);
}

/**
 * @param {Object} menu
 * @param {Array<Object>} rezepte
 * @param {{subtle?: SubtleCrypto}} [optionen]
 * @returns {Promise<string>} sha256 als Hex
 */
export function menueInputHash(menu, rezepte, optionen = {}) {
  return sha256Hex(menueHashEingabe(menu, rezepte), optionen);
}

/**
 * Snapshot aus dem Ergebnis von berechneWeinbegleitung. Firestore nimmt kein `undefined`,
 * deshalb stehen fehlende Werte als `null` da.
 * @param {Object} parameter
 * @param {Object} parameter.ergebnis - Ergebnis von berechneWeinbegleitung
 * @param {Array<Object>} [parameter.fixierungen] - fixierte Gänge im Modus „Pro Gang“
 * @param {string|null} [parameter.gewaehlterGemeinsamerStilId] - im Modus „Ein Wein“ gewählter Stil
 * @param {string|null} parameter.inputHash
 * @param {string|null} parameter.nutzerId
 * @param {number} [parameter.jetzt]
 * @returns {Object}
 */
export function erstelleSnapshot({
  ergebnis,
  fixierungen = [],
  gewaehlterGemeinsamerStilId = null,
  inputHash,
  nutzerId,
  jetzt = Date.now(),
}) {
  return {
    modus: ergebnis.modus,
    gaenge: ergebnis.gaenge.map((gang) => ({
      sektionIndex: gang.sektionIndex,
      sektionName: gang.sektionName || '',
      stilId: gang.stilId || null,
      optionen: (gang.optionen || []).map((option) => ({
        stilId: option.stilId,
        farbe: option.farbe || null,
        label: option.label || null,
        regelIds: option.regelIds || [],
      })),
      label: gang.label || null,
      regelIds: gang.regelIds || [],
      fixiert: Boolean(gang.fixiert),
      hinweis: gang.hinweis || null,
      istDessert: Boolean(gang.istDessert),
    })),
    gemeinsamerStilId: ergebnis.modus === MODUS_EIN_WEIN ? (ergebnis.gemeinsamerStilId || null) : null,
    fixierungen: fixierungen.map((fixierung) => ({
      sektionIndex: fixierung.sektionIndex,
      sektionName: fixierung.sektionName || '',
      stilId: fixierung.stilId,
    })),
    gewaehlterGemeinsamerStilId: gewaehlterGemeinsamerStilId || null,
    rulesVersion: ergebnis.rulesVersion,
    inputHash: inputHash || null,
    erstelltAm: jetzt,
    erstelltVon: nutzerId || null,
  };
}

/**
 * Taugt ein gespeicherter Snapshot zur Anzeige?
 * @param {*} snapshot - Feld weinbegleitung eines Menüs
 * @returns {boolean}
 */
export const istGueltigerSnapshot = (snapshot) => Boolean(snapshot)
  && MODI.includes(snapshot.modus)
  && Array.isArray(snapshot.gaenge);

/**
 * Gespeicherter Gang zu einer Sektion: Index und Name müssen passen; wurde die Sektion
 * verschoben, genügt der Name, solange er nur einmal vorkommt.
 * @param {Object} snapshot
 * @param {number} sektionIndex
 * @param {string} sektionName
 * @returns {Object|null}
 */
export function gangFuerSektion(snapshot, sektionIndex, sektionName) {
  if (!istGueltigerSnapshot(snapshot)) return null;
  const name = normalisierterName(sektionName);
  const genau = snapshot.gaenge.find(
    (gang) => gang.sektionIndex === sektionIndex && normalisierterName(gang.sektionName) === name,
  );
  if (genau) return genau;
  const nachName = snapshot.gaenge.filter((gang) => normalisierterName(gang.sektionName) === name);
  return nachName.length === 1 ? nachName[0] : null;
}

/**
 * Fixierung eines Gangs setzen oder ersetzen.
 * @param {Array<Object>} fixierungen
 * @param {{sektionIndex: number, sektionName: string, stilId: string}} neu
 * @returns {Array<Object>}
 */
export function mitFixierung(fixierungen, neu) {
  const name = normalisierterName(neu.sektionName);
  return [
    ...(fixierungen || []).filter(
      (fixierung) => !(fixierung.sektionIndex === neu.sektionIndex && normalisierterName(fixierung.sektionName) === name),
    ),
    { sektionIndex: neu.sektionIndex, sektionName: neu.sektionName || '', stilId: neu.stilId },
  ];
}

/**
 * Fixierung eines Gangs entfernen.
 * @param {Array<Object>} fixierungen
 * @param {number} sektionIndex
 * @param {string} sektionName
 * @returns {Array<Object>}
 */
export function ohneFixierung(fixierungen, sektionIndex, sektionName) {
  const name = normalisierterName(sektionName);
  return (fixierungen || []).filter(
    (fixierung) => !(fixierung.sektionIndex === sektionIndex && normalisierterName(fixierung.sektionName) === name),
  );
}

/**
 * Kurzfassung für die Zusammenfassung über den Gängen.
 * @param {Object} snapshot
 * @returns {{weine: number, gaengeMitWein: number, gaenge: number}}
 */
export function snapshotZaehler(snapshot) {
  if (!istGueltigerSnapshot(snapshot)) return { weine: 0, gaengeMitWein: 0, gaenge: 0 };
  const mitWein = snapshot.gaenge.filter((gang) => gang.stilId);
  return {
    weine: new Set(mitWein.map((gang) => gang.stilId)).size,
    gaengeMitWein: mitWein.length,
    gaenge: snapshot.gaenge.length,
  };
}
