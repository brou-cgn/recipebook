import { useEffect, useMemo, useState } from 'react';
import { useSprache } from '../contexts/SpracheContext';
import { anzeigbareUebersetzung, inhaltQuellHash } from '../i18n/rezeptInhalt';
import { ladeRezeptUebersetzung } from '../utils/rezeptUebersetzungFirestore';

/**
 * Übersetzte Zutaten und Schritte eines Rezepts in der geltenden Sprache (Vorhaben
 * Mehrsprachigkeit, PR 4), sonst null. Nur, wenn übersetzte Inhalte eingeschaltet sind
 * (Berechtigung sprachwahl); dann lädt der Hook rezeptUebersetzungen/{id} und prüft über den
 * quellHash, ob die Übersetzung zum aktuellen Inhalt passt. Ändert sich der Inhalt, lädt er neu.
 * Fehler beim Laden zeigen einfach das Original.
 *
 * @param {Object} rezept
 * @returns {{zutaten: Array, schritte: Array}|null}
 */
export default function useRezeptInhalt(rezept) {
  const { sprache, inhalteUebersetzen } = useSprache();
  const id = rezept?.id || null;
  const aktiv = Boolean(inhalteUebersetzen && id);
  const zutaten = rezept?.ingredients;
  const schritte = rezept?.steps;
  const [quellHash, setQuellHash] = useState(null);
  const [geladen, setGeladen] = useState({ id: null, hash: null, dokument: null });

  useEffect(() => {
    if (!aktiv) return undefined;
    let aktuell = true;
    inhaltQuellHash({ ingredients: zutaten, steps: schritte })
      .then((hash) => { if (aktuell) setQuellHash(hash); })
      .catch(() => { if (aktuell) setQuellHash(null); });
    return () => { aktuell = false; };
  }, [aktiv, zutaten, schritte]);

  useEffect(() => {
    if (!aktiv || !quellHash) return undefined;
    let aktuell = true;
    ladeRezeptUebersetzung(id)
      .then((dokument) => { if (aktuell) setGeladen({ id, hash: quellHash, dokument }); })
      .catch(() => { if (aktuell) setGeladen({ id, hash: quellHash, dokument: null }); });
    return () => { aktuell = false; };
  }, [aktiv, id, quellHash]);

  return useMemo(() => {
    if (!aktiv || geladen.id !== id || geladen.hash !== quellHash) return null;
    return anzeigbareUebersetzung({ ingredients: zutaten, steps: schritte }, geladen.dokument, sprache, quellHash);
  }, [aktiv, geladen, id, quellHash, zutaten, schritte, sprache]);
}
