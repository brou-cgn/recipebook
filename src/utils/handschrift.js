/**
 * Handschrift-Effekt für kurze Texte, zuerst für den Slogan im Header (Entscheidung
 * „Header-Gestaltung“ in docs/vorhaben/mehrsprachigkeit.md, Entwurf „Randnotiz“ im Canvas
 * „Sprachwahl im Header“).
 *
 * Eine Schrift vom Computer zeichnet jeden Buchstaben gleich; genau daran erkennt man sie.
 * Hier bekommt jedes Zeichen eine kleine eigene Drehung, Verschiebung, Größe und Deckkraft.
 * Die Werte entstehen aus dem Text selbst (Hash als Startwert eines kleinen Zufallsgenerators):
 * Derselbe Text sieht bei jedem Laden gleich aus, ein anderer Text (eigener Slogan, Übersetzung)
 * bekommt seine eigene Handschrift.
 *
 * Die Rechnung entspricht dem Canvas-Entwurf (Vorschlag 02, Variation 7, Stärke 1). Wer sie
 * ändert, ändert das Aussehen; der Test hält die ersten Werte fest.
 */

/** Stärke der Abweichungen je Zeichen: Grad, em, Anteil der Größe, kleinste Deckkraft. */
export const RANDNOTIZ = Object.freeze({ drehung: 4, versatz: 0.05, groesse: 0.06, deckkraftMin: 0.78 });

// Startwert wie im Entwurf: Variation 7 und Vorschlag Nummer 2.
const STARTWERT = Math.imul(7, 2654435761) ^ Math.imul(2, 40503);

/** FNV-1a über die Codepoints, 32 Bit ohne Vorzeichen. */
export function textHash(text) {
  let h = 2166136261;
  for (const zeichen of text) {
    h ^= zeichen.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Kleiner, reproduzierbarer Zufallsgenerator (mulberry32); liefert Zahlen in [0, 1). */
function zufall(startwert) {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zerlegt den Text in Wörter aus Zeichen mit ihrer Abweichung. Leerraum trennt Wörter und
 * bekommt selbst keine Abweichung. Zeichen sind Codepoints wie im Entwurf.
 * @param {string} text
 * @param {typeof RANDNOTIZ} [art]
 * @returns {Array<Array<{zeichen: string, transform: string, deckkraft: number}>>}
 */
export function handschriftWoerter(text, art = RANDNOTIZ) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const r = zufall(textHash(text) ^ STARTWERT);
  const woerter = [];
  let wort = null;
  for (const zeichen of text) {
    if (/\s/.test(zeichen)) {
      wort = null;
      continue;
    }
    const drehung = (r() * 2 - 1) * art.drehung;
    const versatz = (r() * 2 - 1) * art.versatz;
    const groesse = 1 + (r() * 2 - 1) * art.groesse;
    const deckkraft = 1 - r() * (1 - art.deckkraftMin);
    if (!wort) {
      wort = [];
      woerter.push(wort);
    }
    wort.push({
      zeichen,
      transform: `translateY(${versatz.toFixed(3)}em) rotate(${drehung.toFixed(2)}deg) scale(${groesse.toFixed(3)})`,
      deckkraft: Number(deckkraft.toFixed(2)),
    });
  }
  return woerter;
}

/**
 * Faktor für die Schriftgröße: Bis `zeichenProZeile` Zeichen passt der Text in eine Zeile,
 * längere Texte werden entsprechend kleiner (die Untergrenze setzt das CSS).
 */
export function handschriftFaktor(text, zeichenProZeile = 22) {
  const anzahl = typeof text === 'string' ? [...text.trim()].length : 0;
  if (anzahl <= zeichenProZeile) return 1;
  return Number((zeichenProZeile / anzahl).toFixed(3));
}
