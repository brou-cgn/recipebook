/**
 * Pill Carousel Utilities
 *
 * Das Auswahlverfahren der Filterpillen aus dem Suchdialog
 * (MobileSearchOverlay): die Pillen laufen in einem zweireihigen, horizontal
 * scrollenden Karussell, die Reihenzugehoerigkeit steht fest, und innerhalb
 * einer Reihe stehen die gewaehlten Pillen vorn.
 *
 * Lag vorher dreimal im Code - in MobileSearchOverlay, TagesmenuFilterOverlay
 * und zuletzt beinahe ein viertes Mal in TutorialForm. Wer das Verfahren
 * anderswo braucht, nimmt diese beiden Funktionen statt eigener Kopien.
 */

/**
 * Teilt eine Pillenliste in zwei unabhaengige Reihen (erste Haelfte / zweite
 * Haelfte). Jede Reihe umbricht fuer sich und behaelt einen gleichmaessigen
 * Abstand, unabhaengig davon, wie breit die Pillen der anderen Reihe sind -
 * die Pillen muessen sich also nicht in Spalten ausrichten.
 *
 * Wichtig: immer auf der stabilen Liste aufrufen, nicht auf der schon nach
 * Auswahl sortierten. Sonst springt eine Pille beim Antippen in die andere
 * Reihe, React haengt sie dafuer aus und wieder ein - und der Fokus geht
 * mitten im Klick verloren.
 *
 * @param {Array} items - Pillen in stabiler Reihenfolge.
 * @returns {[Array, Array]} Die beiden Reihen.
 */
export function splitIntoTwoRows(items) {
  const list = Array.isArray(items) ? items : [];
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)];
}

/**
 * Sortiert die gewaehlten Pillen einer Reihe nach vorn, ohne die
 * Reihenzugehoerigkeit zu aendern.
 *
 * @param {Array} items - Pillen einer Reihe.
 * @param {Array} selected - Aktuell gewaehlte Werte.
 * @param {Function} [getKey] - Liefert den Vergleichswert einer Pille;
 *   Standard ist die Pille selbst (Strings). Fuer Objekte z. B. (o) => o.id.
 * @returns {Array} Die Reihe, gewaehlte Pillen zuerst.
 */
export function reorderActiveFirst(items, selected, getKey = (item) => item) {
  const list = Array.isArray(items) ? items : [];
  const selectedList = Array.isArray(selected) ? selected : [];
  const active = list.filter((item) => selectedList.includes(getKey(item)));
  const inactive = list.filter((item) => !selectedList.includes(getKey(item)));
  return [...active, ...inactive];
}
