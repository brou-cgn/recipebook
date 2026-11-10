/**
 * Gäste für eine Wichtel-Runde: Typeahead über Vor- und Nachname und Prüfung der E-Mail-Adresse
 * (Eintragen in src/components/WichtelTeilnehmerFormular.js).
 */
import { getGuestDisplayName } from './guestPreferences';

// Wie EMAIL_MUSTER in functions/wichteln.js: genau eine Adresse, ohne Zeichen, die eine
// Adressliste trennen oder umschließen. Höchstlänge wie LAENGE.email dort.
const EMAIL_MUSTER = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const EMAIL_MAX = 254;

/** Wie viele passende Gäste als Pillen erscheinen. */
export const MAX_TREFFER = 8;

/**
 * Kleinbuchstaben ohne Akzente, Leerraum zusammengefasst, ß wie ss: „ Zoë  “ → „zoe“, „Groß“ → „gross“.
 * (Großschreiben vor dem Kleinschreiben macht aus ß ein ss.)
 */
export const normalisiereSuche = (wert) => String(wert || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleUpperCase('de')
  .toLocaleLowerCase('de')
  .replace(/\s+/g, ' ')
  .trim();

/** Beginnt `feld` – oder ein Teil eines Doppel- oder Mehrfachnamens – mit `suche`? */
const beginntMit = (feld, suche) => {
  const text = normalisiereSuche(feld);
  return text.startsWith(suche) || text.split(/[\s-]+/).some((teil) => teil.startsWith(suche));
};

/**
 * Gäste, die zur Eingabe passen: Was im Feld Vorname steht, sucht im Vornamen des Gasts, was im
 * Feld Nachname steht, im Nachnamen; sind beide ausgefüllt, müssen beide passen. Gesucht wird am
 * Anfang eines Namens oder Namensteils („lena“ findet „Anna-Lena“, „mus“ findet „von Muster“),
 * ohne Rücksicht auf Groß-/Kleinschreibung und Akzente, ß wie ss. Wer den ganzen Namen ins Vornamenfeld
 * tippt („Anna Mu“), findet den Gast ebenfalls.
 * @param {Array<{id: string, vorname?: string, nachname?: string}>} gaeste - in Frage kommende Gäste
 * @param {{vorname?: string, nachname?: string}} eingabe - Inhalt der beiden Felder
 * @param {number} [max] - höchstens so viele Treffer
 * @returns {Array} Treffer nach Namen sortiert; leer, solange beide Felder leer sind
 */
export const sucheGaeste = (gaeste, { vorname, nachname } = {}, max = MAX_TREFFER) => {
  const sucheVorname = normalisiereSuche(vorname);
  const sucheNachname = normalisiereSuche(nachname);
  if (!sucheVorname && !sucheNachname) return [];
  return (Array.isArray(gaeste) ? gaeste : [])
    .filter((gast) => (!sucheVorname
      || beginntMit(gast?.vorname, sucheVorname)
      || normalisiereSuche(getGuestDisplayName(gast)).startsWith(sucheVorname))
      && (!sucheNachname || beginntMit(gast?.nachname, sucheNachname)))
    .sort((a, b) => getGuestDisplayName(a).localeCompare(getGuestDisplayName(b), 'de', { sensitivity: 'base' }))
    .slice(0, max);
};

/** Ist `wert` eine E-Mail-Adresse, die der Server annimmt? Leerraum am Rand zählt nicht. */
export const istGueltigeEmail = (wert) => {
  const email = String(wert || '').trim();
  return email.length <= EMAIL_MAX && EMAIL_MUSTER.test(email);
};
