import { useCallback } from 'react';
import { useTexte } from '../contexts/SpracheContext';
import startseiteTexte from '../i18n/texte/startseite';
import { listenAnzeigeName } from '../utils/fuerDichEntdeckt';

/**
 * Anzeigename einer Liste in der geltenden Sprache (Mehrsprachigkeit PR 6p): die Systemliste
 * „Für dich entdeckt“ übersetzt, eigene Namen, wie sie sind (listenAnzeigeName).
 * @returns {(liste: object) => string}
 */
export default function useListenName() {
  const t = useTexte(startseiteTexte);
  return useCallback((liste) => listenAnzeigeName(liste, t), [t]);
}
