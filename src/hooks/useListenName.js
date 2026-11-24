import { useCallback } from 'react';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import startseiteTexte from '../i18n/texte/startseite';
import gruppenTexte from '../i18n/texte/gruppen';
import { listenAnzeigeName } from '../utils/fuerDichEntdeckt';
import { namenFassungen, uebersetzterText } from '../i18n/textUebersetzung';

/**
 * Anzeigename einer Liste in der geltenden Sprache (Mehrsprachigkeit PR 6p, PR 6s, PR 6u): die Systemliste
 * „Für dich entdeckt“ und die öffentliche Gruppe über die Wörterbücher, eigene Namen über ihre Übersetzung
 * (`textUebersetzung`, nur mit der Berechtigung sprachwahl), sonst wie gespeichert (listenAnzeigeName).
 * @returns {(liste: object) => string}
 */
export default function useListenName() {
  const t = useTexte(startseiteTexte);
  const tGruppen = useTexte(gruppenTexte);
  const { sprache, inhalteUebersetzen } = useSprache();
  return useCallback(
    (liste) => listenAnzeigeName(liste, t, tGruppen, { sprache, aktiv: inhalteUebersetzen }),
    [t, tGruppen, sprache, inhalteUebersetzen],
  );
}

/**
 * Beschreibung einer Liste in der geltenden Sprache (PR 6u), getrimmt; leer, wenn sie keine hat.
 * @returns {(liste: object) => string}
 */
export function useListenBeschreibung() {
  const { sprache, inhalteUebersetzen } = useSprache();
  return useCallback(
    (liste) => uebersetzterText(liste, 'description', sprache, inhalteUebersetzen),
    [sprache, inhalteUebersetzen],
  );
}

/**
 * Für die Suche nach Listen: angezeigter Name, Original und Übersetzungen (ohne Doppelte), damit „Grill“
 * auf Englisch auch „Grillabend“ findet und „Barbecue“ dieselbe Liste.
 * @returns {(liste: object) => string[]}
 */
export function useListenNamenSuche() {
  const listenName = useListenName();
  const { inhalteUebersetzen } = useSprache();
  return useCallback(
    (liste) => [...new Set([listenName(liste), ...namenFassungen(liste, inhalteUebersetzen)])],
    [listenName, inhalteUebersetzen],
  );
}

/**
 * @param {string[]} fassungen - aus useListenNamenSuche
 * @param {string} suche - bereits kleingeschrieben
 * @returns {boolean}
 */
export const passtZurSuche = (fassungen, suche) => fassungen.some((name) => name.toLowerCase().includes(suche));
