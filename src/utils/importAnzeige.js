import { findeText } from '../i18n/texte';
import rezeptimportTexte, { DIENST_MELDUNGEN, GESPEICHERTE_TEXTE } from '../i18n/texte/rezeptimport';

const ERKANNTE_TEXTE = Object.freeze([...GESPEICHERTE_TEXTE, ...DIENST_MELDUNGEN]);

/**
 * Deutscher Text eines Imports in der geltenden Sprache: Titel des wartenden Rezepts („Foto-Scan“, „Analysiere
 * Bild...“) und Fehler („Import fehlgeschlagen“) entstehen deutsch und stehen so in Firestore (Mehrsprachigkeit
 * PR 6i); seit PR 6m ebenso die Meldungen der Import-Dienste, gespeichert als importError oder direkt im
 * CSV-Dialog. Mehrzeilige Meldungen (Fehler des CSV-Imports) werden Zeile für Zeile übersetzt, ein enthaltener
 * Grund ({grund}) ebenso. Unbekanntes, etwa eine URL oder eine englische technische Meldung, bleibt, wie es ist.
 * @param {string} text - deutscher Text, wie gespeichert oder gemeldet
 * @param {Function} t - Übersetzungsfunktion für rezeptimport.js (useTexte)
 * @returns {string}
 */
export function importTextAnzeige(text, t) {
  if (typeof text === 'string' && text.includes('\n')) {
    return text.split('\n').map((zeile) => importTextAnzeige(zeile, t)).join('\n');
  }
  const treffer = findeText(rezeptimportTexte, text, ERKANNTE_TEXTE);
  if (!treffer) return text;
  const { grund } = treffer.werte;
  return t(treffer.schluessel, grund === undefined ? treffer.werte : { ...treffer.werte, grund: importTextAnzeige(grund, t) });
}
