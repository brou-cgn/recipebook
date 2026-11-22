/**
 * Texte der App auf Deutsch, Englisch und Französisch (Vorhaben Mehrsprachigkeit,
 * docs/vorhaben/mehrsprachigkeit.md).
 *
 * Wörterbücher liegen je Bereich in src/i18n/texte/<bereich>.js, alle drei Sprachen
 * nebeneinander, Deutsch ist das Original:
 *
 *   export default {
 *     de: { suchen: 'Suchen', treffer: { one: '{anzahl} Treffer', other: '{anzahl} Treffer' } },
 *     en: { suchen: 'Search', treffer: { one: '{anzahl} result', other: '{anzahl} results' } },
 *     fr: { suchen: 'Rechercher', treffer: { one: '{anzahl} résultat', other: '{anzahl} résultats' } },
 *   };
 *
 * In der Komponente:
 *
 *   import { useTexte } from '../contexts/SpracheContext';
 *   import suchTexte from '../i18n/texte/suche';
 *
 *   const t = useTexte(suchTexte);
 *   <button aria-label={t('suchen')} />
 *   <p>{t('treffer', { anzahl: treffer.length })}</p>
 *
 * Außerhalb von React (Hilfsfunktionen, Tests): erstelleT(woerterbuch, sprache).
 *
 * Regeln, geprüft für jedes Wörterbuch in src/i18n/texte/ (texte.test.js):
 *  - Jede Sprache hat genau die Schlüssel des Deutschen, kein Text ist leer.
 *  - Übersetzungen erfinden keine Platzhalter, die es im Deutschen nicht gibt.
 *  - Mengenabhängige Texte sind Objekte mit den Formen von Intl.PluralRules, mindestens
 *    `one` und `other`. Die Menge kommt als Wert `anzahl`; sie wählt die Form und wird nach
 *    der Sprache formatiert (1.234,5 / 1,234.5 / 1 234,5). Französisch zählt 0 und 1 als `one`.
 *  - Französisch duzt (wie die Wichtel-Seite) und setzt geschützte Leerzeichen (U+00A0)
 *    vor : ? ! ; und innerhalb von « ».
 * Andere Zahlen in Platzhaltern vorher mit formatiereZahl (format.js) formatieren.
 */
import { STANDARD_SPRACHE, localeFuer } from './sprachen';

/**
 * Setzt Werte in die Platzhalter eines Textes ein ('Hallo {name}!').
 * Sind alle Werte Text oder Zahl, kommt ein String zurück; sonst (etwa ein fett gesetzter
 * Name als React-Element) eine Liste, die React direkt rendert – das Element braucht dann
 * einen key. Unbekannte Platzhalter bleiben stehen, fehlende Werte werden leer.
 * @param {string} text
 * @param {Object<string, *>} [werte]
 * @returns {string|Array}
 */
export function fuelleText(text, werte = {}) {
  const teile = text.split(/\{(\w+)\}/).map((teil, i) => {
    if (i % 2 === 0) return teil;
    return Object.prototype.hasOwnProperty.call(werte, teil) ? (werte[teil] ?? '') : `{${teil}}`;
  });
  const nurText = teile.every((teil) => typeof teil === 'string' || typeof teil === 'number');
  return nurText ? teile.join('') : teile.filter((teil) => teil !== '');
}

const pluralRegeln = new Map();
const zahlFormate = new Map();

function regelnFuer(locale) {
  if (!pluralRegeln.has(locale)) pluralRegeln.set(locale, new Intl.PluralRules(locale));
  return pluralRegeln.get(locale);
}

function zahlFormatFuer(locale) {
  if (!zahlFormate.has(locale)) zahlFormate.set(locale, new Intl.NumberFormat(locale));
  return zahlFormate.get(locale);
}

const istZahl = (wert) => typeof wert === 'number' && Number.isFinite(wert);

/**
 * Baut die Übersetzungsfunktion t für ein Wörterbuch und eine Sprache.
 * Fehlt ein Schlüssel in der Sprache, gilt der deutsche Text; fehlt er auch dort,
 * erscheint der Schlüssel selbst (sichtbar statt leer).
 * @param {Object<string, Object>} woerterbuch - { de: {…}, en: {…}, fr: {…} }
 * @param {string} sprache
 * @returns {(schluessel: string, werte?: Object<string, *>) => (string|Array)}
 */
export function erstelleT(woerterbuch, sprache) {
  const deutsch = woerterbuch?.[STANDARD_SPRACHE] || {};
  const texte = woerterbuch?.[sprache] || deutsch;
  const locale = localeFuer(sprache);

  return function t(schluessel, werte) {
    let eintrag = Object.prototype.hasOwnProperty.call(texte, schluessel) ? texte[schluessel] : deutsch[schluessel];
    if (eintrag === undefined || eintrag === null) return schluessel;

    let fuellwerte = werte;
    if (typeof eintrag === 'object') {
      const anzahl = werte?.anzahl;
      const form = istZahl(anzahl) ? regelnFuer(locale).select(anzahl) : 'other';
      eintrag = eintrag[form] ?? eintrag.other;
      if (istZahl(anzahl)) fuellwerte = { ...werte, anzahl: zahlFormatFuer(locale).format(anzahl) };
    }
    return fuellwerte ? fuelleText(eintrag, fuellwerte) : eintrag;
  };
}
