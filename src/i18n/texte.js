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
 *  - Die App duzt immer: Deutsch ohne Höflichkeitsform (Sie, Ihr, Ihnen), Französisch mit
 *    „tu“, Englisch neutral.
 *  - Französisch setzt geschützte Leerzeichen (U+00A0) vor : ? ! ; und innerhalb von « ».
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

const sonderzeichen = /[.*+?^${}()|[\]\\]/g;

/**
 * Erkennt einen gespeicherten deutschen Text wieder, etwa eine Meldung, die mit Daten gespeichert
 * wurde (Nährwerte, PR 6b), und liefert Schlüssel und Werte der Platzhalter. So bleiben
 * gespeicherte Daten deutsch, angezeigt werden sie in der geltenden Sprache:
 *
 *   const treffer = findeText(woerterbuch, gespeichert, MELDUNGEN);
 *   const anzeige = treffer ? t(treffer.schluessel, treffer.werte) : gespeichert;
 *
 * Verglichen wird mit dem deutschen Text des Wörterbuchs, nur mit einfachen Texten (ohne
 * Mehrzahl). Ein Platzhalter steht für beliebigen Text.
 * @param {Object<string, Object>} woerterbuch
 * @param {*} text
 * @param {string[]} schluesselListe - welche Schlüssel infrage kommen
 * @returns {{schluessel: string, werte: Object<string, string>}|null}
 */
export function findeText(woerterbuch, text, schluesselListe) {
  if (typeof text !== 'string' || !text) return null;
  const deutsch = woerterbuch?.[STANDARD_SPRACHE] || {};
  for (const schluessel of schluesselListe) {
    const vorlage = deutsch[schluessel];
    if (typeof vorlage !== 'string') continue;
    const namen = [];
    const muster = vorlage.split(/\{(\w+)\}/).map((teil, i) => {
      if (i % 2 === 0) return teil.replace(sonderzeichen, '\\$&');
      namen.push(teil);
      return '(.+?)';
    }).join('');
    const treffer = new RegExp(`^${muster}$`, 's').exec(text);
    if (treffer) {
      return { schluessel, werte: Object.fromEntries(namen.map((name, i) => [name, treffer[i + 1]])) };
    }
  }
  return null;
}

/**
 * Gespeicherter oder gemeldeter deutscher Text in der geltenden Sprache (seit PR 6s): erkennt ihn mit
 * findeText unter den genannten Schlüsseln und gibt die Übersetzung zurück, sonst den Text, wie er ist.
 *
 *   setFehler(erkannterText(netzwerkTexte, err.message, FOLGEN_MELDUNGEN, t));
 *
 * @param {Object<string, Object>} woerterbuch
 * @param {string} text - deutscher Text, wie gespeichert oder gemeldet
 * @param {string[]} schluesselListe - welche Schlüssel infrage kommen
 * @param {Function} t - Übersetzungsfunktion desselben Wörterbuchs
 * @returns {string}
 */
export function erkannterText(woerterbuch, text, schluesselListe, t) {
  const treffer = findeText(woerterbuch, text, schluesselListe);
  return treffer ? t(treffer.schluessel, treffer.werte) : text;
}

/**
 * Text eines Ergebnisses aus einer Hilfsfunktion in der geltenden Sprache (seit PR 6l, etwa
 * `loginUser` in src/utils/userManagement.js): Trägt das Ergebnis einen Schlüssel, kommt der Text
 * über `t`, sonst die mitgelieferte deutsche `message`.
 *
 *   const result = await loginUser(email, passwort);
 *   if (!result.success) setFehler(ergebnisText(result, t));
 *
 * @param {{schluessel?: string, werte?: Object, message?: string}|null|undefined} ergebnis
 * @param {Function} t - Übersetzungsfunktion des Wörterbuchs, aus dem der Schlüssel stammt
 * @returns {string}
 */
export function ergebnisText(ergebnis, t) {
  if (ergebnis?.schluessel) return t(ergebnis.schluessel, ergebnis.werte);
  return ergebnis?.message || '';
}
