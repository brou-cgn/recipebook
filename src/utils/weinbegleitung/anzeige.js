/**
 * Texte und Einordnungen für die Anzeige der Weinbegleitung (Rezeptansicht, später
 * Menü und Freigabe-Seiten). Reine Funktionen, ohne React.
 */
import { getCallableErrorDetails } from '../callableErrors';

export const TEXT_KEIN_STIL = 'Hier lieber Bier oder Wasser';

const KOERPER = { 1: 'sehr leicht', 2: 'leicht', 3: 'mittel', 4: 'kräftig', 5: 'sehr kräftig' };
const GERBSTOFF = { 0: 'kaum', 1: 'wenig', 2: 'mittel', 3: 'kräftig' };
const SUESSE = { 0: 'trocken', 1: 'feinherb', 2: 'lieblich', 3: 'süß' };

/**
 * Kennwerte eines Stils in Worten, für die Übersicht im Sheet.
 * @param {Object} stil
 * @returns {Array<{name: string, wert: string}>}
 */
export function kennwerteFuer(stil) {
  if (!stil) return [];
  return [
    { name: 'Körper', wert: KOERPER[stil.koerper] || '' },
    { name: 'Gerbstoff', wert: GERBSTOFF[stil.tannin] || '' },
    { name: 'Süße', wert: SUESSE[stil.suesse] || '' },
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

const FEHLERTEXTE = {
  tageslimit: 'Das Tageslimit für Wein-Einschätzungen ist erreicht. Versuch es morgen wieder.',
  keinZugriff: 'Dieses Rezept kannst du nicht einschätzen lassen.',
  nichtGefunden: 'Das Rezept wurde nicht gefunden.',
  kiUngueltig: 'Die Einschätzung war nicht brauchbar. Versuch es später noch einmal.',
  speichern: 'Die Einschätzung konnte nicht gespeichert werden. Versuch es gleich noch einmal.',
  rolle: 'Wein-Einschätzungen sind erst ab der Rolle „Bearbeiten“ möglich.',
  allgemein: 'Die Einschätzung hat nicht geklappt. Versuch es gleich noch einmal.',
};

/**
 * Fehlertext für einen Grund aus der Antwort (fehlerGruende) oder einen geworfenen
 * Callable-Fehler.
 * @param {string|Error} grundOderFehler
 * @returns {string}
 */
export function weinprofilFehlertext(grundOderFehler) {
  if (typeof grundOderFehler === 'string') return FEHLERTEXTE[grundOderFehler] || FEHLERTEXTE.allgemein;
  const { code } = getCallableErrorDetails(grundOderFehler);
  if (code === 'resource-exhausted') return FEHLERTEXTE.tageslimit;
  if (code === 'permission-denied') return FEHLERTEXTE.rolle;
  return FEHLERTEXTE.allgemein;
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
