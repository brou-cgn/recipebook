/**
 * Texte und Einordnungen für die Anzeige der Weinbegleitung (Rezeptansicht, später
 * Menü und Freigabe-Seiten). Reine Funktionen, ohne React.
 */
import { getCallableErrorDetails } from '../callableErrors';
import { erstelleT } from '../../i18n/texte';
import { STANDARD_SPRACHE } from '../../i18n/sprachen';
import weinTexte from '../../i18n/texte/wein';

// Texte über t aus src/i18n/texte/wein.js (Mehrsprachigkeit PR 6c); ohne t Deutsch
const T_DEUTSCH = erstelleT(weinTexte, STANDARD_SPRACHE);

export const TEXT_KEIN_STIL = T_DEUTSCH('keinStil');

// Stufen der Kennwerte, je Stufe ein Text (koerper1 … koerper5 usw. in wein.js)
const STUFEN = { koerper: [1, 2, 3, 4, 5], gerbstoff: [0, 1, 2, 3], suesse: [0, 1, 2, 3] };
const stufeText = (art, wert, t) => (STUFEN[art].includes(wert) ? t(`${art}${wert}`) : '');

/**
 * Kennwerte eines Stils in Worten, für die Übersicht im Sheet.
 * @param {Object} stil
 * @param {Function} [t] - Übersetzungsfunktion für wein.js (useTexte), sonst Deutsch
 * @returns {Array<{name: string, wert: string}>}
 */
export function kennwerteFuer(stil, t = T_DEUTSCH) {
  if (!stil) return [];
  return [
    { name: t('koerper'), wert: stufeText('koerper', stil.koerper, t) },
    { name: t('gerbstoff'), wert: stufeText('gerbstoff', stil.tannin, t) },
    { name: t('suesse'), wert: stufeText('suesse', stil.suesse, t) },
  ];
}

/**
 * Farbe des Glases: weiß, rosé, rot; edelsüße und Likörweine bekommen ein eigenes Bernstein.
 * @param {Object} stil
 * @returns {'weiss'|'rose'|'rot'|'suess'}
 */
export function weinfarbe(stil) {
  if (stil?.suesse >= 3) return 'suess';
  if (stil?.farbe === 'rose' || stil?.farbe === 'rot') return stil.farbe;
  return 'weiss';
}

/**
 * Einschränkung eines Stils in Worten (Feld `nurZu` der Wissensbasis, z. B. Süßweine nur zu
 * Dessert und Käse). Ohne Einschränkung null.
 * @param {Object} stil
 * @returns {string|null}
 */
export function nurZuText(stil) {
  const tags = Array.isArray(stil?.nurZu) ? stil.nurZu : [];
  const teile = [];
  if (tags.some((tag) => tag === 'rolle:dessert' || tag.startsWith('hk:dessert'))) teile.push('Dessert');
  const kaese = tags.filter((tag) => tag.startsWith('hk:kaese'));
  if (kaese.length > 0) teile.push(kaese.every((tag) => tag === 'hk:kaese_blau') ? 'Blauschimmelkäse' : 'Käse');
  return teile.length > 0 ? `nur zu ${teile.join(' und ')}` : null;
}

// Grund aus der Antwort (fehlerGruende) → Schlüssel in wein.js
const FEHLERTEXTE = {
  tageslimit: 'fehlerTageslimit',
  keinZugriff: 'fehlerKeinZugriff',
  nichtGefunden: 'fehlerNichtGefunden',
  kiUngueltig: 'fehlerKiUngueltig',
  speichern: 'fehlerSpeichern',
  rolle: 'fehlerRolle',
  allgemein: 'fehlerAllgemein',
};

/**
 * Fehlertext für einen Grund aus der Antwort (fehlerGruende) oder einen geworfenen
 * Callable-Fehler.
 * @param {string|Error} grundOderFehler
 * @param {Function} [t] - Übersetzungsfunktion für wein.js (useTexte), sonst Deutsch
 * @returns {string}
 */
export function weinprofilFehlertext(grundOderFehler, t = T_DEUTSCH) {
  if (typeof grundOderFehler === 'string') return t(FEHLERTEXTE[grundOderFehler] || FEHLERTEXTE.allgemein);
  const { code } = getCallableErrorDetails(grundOderFehler);
  if (code === 'resource-exhausted') return t(FEHLERTEXTE.tageslimit);
  if (code === 'permission-denied') return t(FEHLERTEXTE.rolle);
  return t(FEHLERTEXTE.allgemein);
}

/**
 * Das neuere von zwei Profilen (nach erstelltAm). Das Callable liefert ein frisches
 * Profil zurück, bevor der Live-Listener das Rezept aktualisiert hat.
 * @param {Object|null|undefined} a
 * @param {Object|null|undefined} b
 * @returns {Object|null}
 */
export function neueresProfil(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return (Number(b.erstelltAm) || 0) > (Number(a.erstelltAm) || 0) ? b : a;
}
