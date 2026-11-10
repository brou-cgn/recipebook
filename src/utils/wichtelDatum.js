/**
 * Datum der Feier einer Wichtel-Runde: ein Kalendertag 'JJJJ-MM-TT' ohne Uhrzeit, wie ihn
 * <input type="date"> liefert und der Server speichert (functions/wichteln.js, Feld `datum`).
 * Formatiert wird in UTC, damit der Tag in keiner Zeitzone auf den Vortag rutscht.
 * Schreibweise wie in den Mails (functions/wichtelMail.js): Englisch britisch.
 */

const LOCALES = { de: 'de-DE', en: 'en-GB', fr: 'fr-FR' };
const MUSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

const STILE = {
  // „So., 13.12.2026“ – Organisator-Ansicht
  kurz: { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' },
  // „Sonntag, 13. Dezember 2026“ – Teilnehmerseite
  lang: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};

/**
 * @param {string} datum - 'JJJJ-MM-TT'
 * @param {string} [sprache='de'] - 'de', 'en' oder 'fr' (sonst Deutsch)
 * @param {'kurz'|'lang'} [stil='lang']
 * @returns {string} formatiertes Datum, '' ohne gültigen Kalendertag
 */
export function formatWichtelDatum(datum, sprache = 'de', stil = 'lang') {
  const treffer = typeof datum === 'string' ? datum.match(MUSTER) : null;
  if (!treffer) return '';
  const [jahr, monat, tag] = treffer.slice(1).map(Number);
  const zeitpunkt = new Date(Date.UTC(jahr, monat - 1, tag));
  if (zeitpunkt.getUTCMonth() !== monat - 1 || zeitpunkt.getUTCDate() !== tag) return '';
  return zeitpunkt.toLocaleDateString(LOCALES[sprache] || LOCALES.de, { ...(STILE[stil] || STILE.lang), timeZone: 'UTC' });
}

/**
 * Teile für das Kalenderblatt im Formular: Monat kurz in Großbuchstaben und Tag.
 * @param {string} datum - 'JJJJ-MM-TT'
 * @returns {{monat: string, tag: string}|null} null ohne gültigen Kalendertag
 */
export function wichtelKalenderblatt(datum) {
  if (!formatWichtelDatum(datum)) return null;
  const [jahr, monat, tag] = datum.split('-').map(Number);
  const zeitpunkt = new Date(Date.UTC(jahr, monat - 1, tag));
  const monatKurz = zeitpunkt.toLocaleDateString('de-DE', { month: 'short', timeZone: 'UTC' });
  return { monat: monatKurz.replace('.', '').toUpperCase(), tag: String(tag) };
}

/**
 * Abstand vom heutigen Tag (Ortszeit des Geräts) bis zur Feier, als Text fürs Formular.
 * @param {string} datum - 'JJJJ-MM-TT'
 * @param {Date} [jetzt=new Date()]
 * @returns {string} „heute“, „morgen“, „in 39 Tagen“, „vor 2 Tagen“ …; '' ohne gültigen Kalendertag
 */
export function wichtelAbstandText(datum, jetzt = new Date()) {
  if (!formatWichtelDatum(datum)) return '';
  const [jahr, monat, tag] = datum.split('-').map(Number);
  const heute = Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  const tage = Math.round((Date.UTC(jahr, monat - 1, tag) - heute) / 86400000);
  if (tage === 0) return 'heute';
  if (tage === 1) return 'morgen';
  if (tage === -1) return 'gestern';
  return tage > 0 ? `in ${tage} Tagen` : `vor ${-tage} Tagen`;
}

/**
 * Heutiger Kalendertag in Ortszeit als 'JJJJ-MM-TT' (für `min` am Datumsfeld).
 * @param {Date} [jetzt=new Date()]
 */
export function heuteAlsWichtelDatum(jetzt = new Date()) {
  const zwei = (n) => String(n).padStart(2, '0');
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}
