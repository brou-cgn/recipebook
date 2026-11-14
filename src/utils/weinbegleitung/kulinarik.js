/**
 * Kulinarik in der Weinbegleitung: Rebsorten-Beispiele aus der Weinregion der Küche
 * (Tracker docs/vorhaben/weinbegleitung.md, „Kulinarik“).
 *
 * Den Weinstil bestimmt weiter das Gericht-Profil (Engine). Die Kulinarik der Rezepte
 * (Feld `kulinarik`, String oder Array, frei konfigurierbare Namen wie „Italienische Küche“)
 * entscheidet nur, welche Rebsorten als Beispiel zuerst stehen: zur Pizza Chianti statt
 * Lemberger, zur Paella Albariño statt Muscadet. Küchen ohne eigene Weinregion (z. B.
 * Indische Küche, Vegetarisch) behalten die allgemeinen Beispiele.
 *
 * Bewusst außerhalb von Engine und Snapshot: Die Beispiele entstehen beim Anzeigen, ändern
 * weder Score noch gespeicherte Menü-Weinbegleitungen und brauchen deshalb keine neue
 * RULES_VERSION (die Daten liegen nicht im Fingerabdruck von wissensbasis.test.js).
 */
import regionenDaten from '../../data/weinbegleitung/kulinarik.json';

const REGIONEN = Object.freeze(regionenDaten.map((region) => Object.freeze(region)));
const REGION_NACH_ID = new Map(REGIONEN.map((region) => [region.id, region]));

/** @returns {Array<Object>} alle Weinregionen in der Reihenfolge der Daten */
export const alleRegionen = () => REGIONEN;

/** @param {string} id @returns {Object|null} */
export const getRegion = (id) => REGION_NACH_ID.get(id) || null;

const alsListe = (wert) => (Array.isArray(wert) ? wert : [wert]).filter((eintrag) => typeof eintrag === 'string' && eintrag.trim());

/**
 * Weinregion zu einem Kulinarik-Namen, erkannt über Wortstämme („Italienische Küche“,
 * „Toskanisch“ → italien). Bei mehreren Treffern gilt die erste Region der Daten.
 * @param {string} name
 * @returns {string|null} Regions-ID
 */
export function regionFuerKulinarik(name) {
  if (typeof name !== 'string') return null;
  const text = name.trim().toLowerCase();
  if (!text) return null;
  const treffer = REGIONEN.find((region) => region.erkennung.some((stamm) => text.includes(stamm)));
  return treffer ? treffer.id : null;
}

/**
 * Weinregion eines Rezepts: die erste Kulinarik, zu der es eine Region gibt.
 * @param {Object} rezept - mit `kulinarik` (String oder Array)
 * @returns {string|null}
 */
export function regionFuerRezept(rezept) {
  for (const name of alsListe(rezept?.kulinarik)) {
    const region = regionFuerKulinarik(name);
    if (region) return region;
  }
  return null;
}

/**
 * Weinregion mehrerer Rezepte (Gang, Menü): die häufigste Region. Rezepte ohne Region zählen
 * nicht mit; bei Gleichstand gibt es keine Region, damit ein deutsch-italienisches Menü nicht
 * zufällig italienisch wird.
 * @param {Array<Object>} rezepte
 * @returns {string|null}
 */
export function regionFuerRezepte(rezepte) {
  const zaehler = new Map();
  (rezepte || []).forEach((rezept) => {
    const region = regionFuerRezept(rezept);
    if (region) zaehler.set(region, (zaehler.get(region) || 0) + 1);
  });
  let beste = null;
  let besteAnzahl = 0;
  let gleichstand = false;
  zaehler.forEach((anzahl, region) => {
    if (anzahl > besteAnzahl) {
      beste = region;
      besteAnzahl = anzahl;
      gleichstand = false;
    } else if (anzahl === besteAnzahl) {
      gleichstand = true;
    }
  });
  return gleichstand ? null : beste;
}

/**
 * Rebsorten-Beispiele eines Stils, die der Region zuerst, aufgefüllt mit den allgemeinen.
 * @param {Object} stil - aus der Wissensbasis
 * @param {string|null} regionId
 * @param {number} [anzahl=2]
 * @returns {{beispiele: Array<string>, region: Object|null}} `region` nur, wenn mindestens
 *   ein Beispiel aus ihr stammt (für den Hinweis „passend zur … Küche“)
 */
export function beispieleFuerRegion(stil, regionId, anzahl = 2) {
  const allgemein = Array.isArray(stil?.beispiele) ? stil.beispiele : [];
  const region = regionId ? getRegion(regionId) : null;
  const regional = region && Array.isArray(region.beispiele[stil?.id]) ? region.beispiele[stil.id] : [];
  const beispiele = [...new Set([...regional, ...allgemein])].slice(0, anzahl);
  return { beispiele, region: regional.length > 0 ? region : null };
}

/**
 * Weinregionen eines Menüs. Je Gang zählen zuerst die Rezepte der Auswahl (die Gerichte, die den
 * Wein bestimmen: zur Pizza mit deutschem Salat bleibt es italienisch); ergeben sie keine Region,
 * alle Rezepte der Sektion. Fürs ganze Menü („Ein Wein für alles“) zählen die Rezepte, die bei den
 * Nicht-Dessert-Gängen gezählt haben.
 * @param {Array<Object>} gaenge - Ergebnis von gaengeAusMenue
 * @param {Array<Object>} rezepte - geladene Rezepte
 * @returns {{jeGang: Map<number, string>, menue: string|null}}
 */
export function regionenFuerGaenge(gaenge, rezepte) {
  const rezeptNachId = new Map((rezepte || []).filter(Boolean).map((rezept) => [rezept.id, rezept]));
  const holen = (ids) => (ids || []).map((id) => rezeptNachId.get(id)).filter(Boolean);
  const jeGang = new Map();
  const menueRezepte = [];
  (gaenge || []).forEach((eintrag) => {
    const auswahl = holen((eintrag.gang?.auswahl || []).map((teil) => teil.id));
    const alle = holen(eintrag.rezeptIds);
    const ausAuswahl = regionFuerRezepte(auswahl);
    const region = ausAuswahl || regionFuerRezepte(alle);
    if (region) jeGang.set(eintrag.sektionIndex, region);
    if (!eintrag.istDessert) menueRezepte.push(...(ausAuswahl ? auswahl : alle));
  });
  return { jeGang, menue: regionFuerRezepte(menueRezepte) };
}
