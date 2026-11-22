/**
 * Slogan im Header in der geltenden Sprache (Vorhaben Mehrsprachigkeit, Entscheidung „Slogan im
 * Header“ in docs/vorhaben/mehrsprachigkeit.md).
 *
 * Der Slogan ist frei einstellbar (Einstellungen › Allgemein, nur Admins) und bleibt deutsch das
 * Original. Übersetzungen stehen in `settings/app.sloganUebersetzungen` = `{quelle, en, fr}`;
 * `quelle` ist der deutsche Slogan, zu dem sie gehören. Weicht der Slogan davon ab, gilt die
 * Übersetzung als veraltet und es erscheint das Original, bis sie angepasst oder bestätigt ist
 * (wie `quelle` bei der Titelübersetzung).
 *
 * Für den Standard-Slogan bringt die App eine eigene Übersetzung mit (Wörterbuch kopfzeile.js,
 * `standardSlogan`), damit er ohne Pflege übersetzt erscheint.
 */
import { STANDARD_SPRACHE, istSprache } from './sprachen';

const text = (wert) => (typeof wert === 'string' ? wert.trim() : '');

/**
 * @param {object} p
 * @param {string} p.slogan - deutscher Slogan aus den Einstellungen
 * @param {{quelle?: string, en?: string, fr?: string}|null} [p.uebersetzungen]
 * @param {string} p.sprache - geltende Sprache
 * @param {{slogan: string, uebersetzung: string}} [p.standard] - Standard-Slogan und seine
 *   Übersetzung in der geltenden Sprache
 * @returns {string} der anzuzeigende Slogan
 */
export function sloganInSprache({ slogan, uebersetzungen = null, sprache, standard = null }) {
  const original = text(slogan);
  if (!original || sprache === STANDARD_SPRACHE || !istSprache(sprache)) return original;
  if (uebersetzungenPassen(uebersetzungen, original)) {
    const uebersetzt = text(uebersetzungen[sprache]);
    if (uebersetzt) return uebersetzt;
  }
  if (standard && text(standard.slogan) === original && text(standard.uebersetzung)) {
    return text(standard.uebersetzung);
  }
  return original;
}

/** @returns {boolean} ob die gespeicherten Übersetzungen zum Slogan gehören */
export function uebersetzungenPassen(uebersetzungen, slogan) {
  return Boolean(uebersetzungen && typeof uebersetzungen === 'object' && text(uebersetzungen.quelle)
    && text(uebersetzungen.quelle) === text(slogan));
}

/**
 * Bereinigt die Eingaben für das Speichern: getrimmt, leere Sprachen weg. Ohne eine einzige
 * Übersetzung ergibt sich null (das Feld wird geleert).
 * @param {{quelle: string, en?: string, fr?: string}} eingabe
 * @returns {{quelle: string, en?: string, fr?: string}|null}
 */
export function sloganUebersetzungenZumSpeichern({ quelle, en, fr }) {
  const ergebnis = { quelle: text(quelle) };
  if (text(en)) ergebnis.en = text(en);
  if (text(fr)) ergebnis.fr = text(fr);
  if (!ergebnis.quelle || (!ergebnis.en && !ergebnis.fr)) return null;
  return ergebnis;
}
