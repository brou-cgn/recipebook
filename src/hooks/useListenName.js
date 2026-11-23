import { useCallback } from 'react';
import { useTexte } from '../contexts/SpracheContext';
import startseiteTexte from '../i18n/texte/startseite';
import gruppenTexte from '../i18n/texte/gruppen';
import { listenAnzeigeName } from '../utils/fuerDichEntdeckt';

/**
 * Anzeigename einer Liste in der geltenden Sprache (Mehrsprachigkeit PR 6p, PR 6s): die Systemliste
 * „Für dich entdeckt“ und die öffentliche Gruppe übersetzt, eigene Namen, wie sie sind (listenAnzeigeName).
 * @returns {(liste: object) => string}
 */
export default function useListenName() {
  const t = useTexte(startseiteTexte);
  const tGruppen = useTexte(gruppenTexte);
  return useCallback((liste) => listenAnzeigeName(liste, t, tGruppen), [t, tGruppen]);
}
