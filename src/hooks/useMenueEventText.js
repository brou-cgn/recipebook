import { useCallback, useMemo } from 'react';
import { useSprache } from '../contexts/SpracheContext';
import { uebersetzterText } from '../i18n/textUebersetzung';

/**
 * Name und Beschreibung eines Menüs in der geltenden Sprache (Mehrsprachigkeit PR 6u): die Übersetzung
 * aus `textUebersetzung`, nur mit der Berechtigung sprachwahl und solange sie zum Original passt, sonst
 * das Original. Bearbeitet wird immer das Original (MenuForm).
 * @returns {{name: (menue: object) => string, beschreibung: (menue: object) => string}}
 */
export function useMenueText() {
  const { sprache, inhalteUebersetzen } = useSprache();
  return useMemo(() => ({
    name: (menue) => uebersetzterText(menue, 'name', sprache, inhalteUebersetzen),
    beschreibung: (menue) => uebersetzterText(menue, 'description', sprache, inhalteUebersetzen),
  }), [sprache, inhalteUebersetzen]);
}

/**
 * Name eines Events (`eventName`) in der geltenden Sprache (Mehrsprachigkeit PR 6u), wie useMenueText.
 * @returns {(event: object) => string}
 */
export function useEventName() {
  const { sprache, inhalteUebersetzen } = useSprache();
  return useCallback(
    (event) => uebersetzterText(event, 'name', sprache, inhalteUebersetzen, 'eventName'),
    [sprache, inhalteUebersetzen],
  );
}
