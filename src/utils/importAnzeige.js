import { findeText } from '../i18n/texte';
import rezeptimportTexte, { GESPEICHERTE_TEXTE } from '../i18n/texte/rezeptimport';

/**
 * Gespeicherter Text eines Hintergrund-Imports in der geltenden Sprache: Titel des wartenden Rezepts
 * („Foto-Scan“, „Analysiere Bild...“) und Fehler („Import fehlgeschlagen“) entstehen deutsch und stehen so
 * in Firestore (Mehrsprachigkeit PR 6i). Unbekanntes, etwa eine URL oder die Meldung eines Dienstes,
 * bleibt, wie es gespeichert ist.
 * @param {string} text - gespeicherter Text
 * @param {Function} t - Übersetzungsfunktion für rezeptimport.js (useTexte)
 * @returns {string}
 */
export function importTextAnzeige(text, t) {
  const treffer = findeText(rezeptimportTexte, text, GESPEICHERTE_TEXTE);
  return treffer ? t(treffer.schluessel, treffer.werte) : text;
}
