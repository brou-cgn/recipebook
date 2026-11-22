import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  STANDARD_SPRACHE,
  aktiveSprache,
  istSprache,
  leseSitzungsSprache,
  speichereSitzungsSprache,
} from '../i18n/sprachen';
import { erstelleT } from '../i18n/texte';

// Sprache der App (Vorhaben docs/vorhaben/mehrsprachigkeit.md). Der Provider umschließt in
// src/index.js die ganze App. App.js meldet die Sprache aus den persönlichen Einstellungen
// (useProfilSprache), der Umschalter im Header setzt die Sprache dieser Sitzung
// (setzeSitzungsSprache, null hebt sie auf). Welche gilt: aktiveSprache in src/i18n/sprachen.js.
// Ohne Provider (etwa in Tests mit render() statt renderWithProviders) gilt Deutsch.
const OHNE_PROVIDER = Object.freeze({
  sprache: STANDARD_SPRACHE,
  profilSprache: null,
  sitzungsSprache: null,
  setzeProfilSprache: () => {},
  setzeSitzungsSprache: () => {},
});

const SpracheContext = createContext(OHNE_PROVIDER);

const gueltigOderNull = (wert) => (istSprache(wert) ? wert : null);

/**
 * @param {object} props
 * @param {string|null} [props.profilSprache] - Startwert der persönlichen Einstellung (Tests);
 *   in der App meldet App.js sie über useProfilSprache
 * @param {Storage|null} [props.speicher] - wo die Sitzungs-Sprache liegt; ohne Angabe
 *   sessionStorage, null = nirgends (Tests)
 */
export function SpracheProvider({ children, profilSprache: startProfilSprache = null, speicher }) {
  const [profilSprache, setProfilSprache] = useState(() => gueltigOderNull(startProfilSprache));
  const [sitzungsSprache, setSitzungsSprache] = useState(() => (
    speicher === null ? null : leseSitzungsSprache(speicher)
  ));

  const setzeProfilSprache = useCallback((wert) => setProfilSprache(gueltigOderNull(wert)), []);

  const setzeSitzungsSprache = useCallback((wert) => {
    const neu = gueltigOderNull(wert);
    if (speicher !== null) speichereSitzungsSprache(neu, speicher);
    setSitzungsSprache(neu);
  }, [speicher]);

  const sprache = aktiveSprache({ sitzungsSprache, profilSprache });

  // Vorlesefunktionen, Silbentrennung und Browser-Übersetzung richten sich nach <html lang>.
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = sprache;
  }, [sprache]);

  const wert = useMemo(() => ({
    sprache,
    profilSprache,
    sitzungsSprache,
    setzeProfilSprache,
    setzeSitzungsSprache,
  }), [sprache, profilSprache, sitzungsSprache, setzeProfilSprache, setzeSitzungsSprache]);

  return <SpracheContext.Provider value={wert}>{children}</SpracheContext.Provider>;
}

/**
 * @returns {{sprache: string, profilSprache: string|null, sitzungsSprache: string|null,
 *   setzeProfilSprache: Function, setzeSitzungsSprache: Function}}
 */
export function useSprache() {
  return useContext(SpracheContext);
}

/**
 * Übersetzungsfunktion für ein Wörterbuch aus src/i18n/texte/ in der geltenden Sprache.
 * Anleitung: src/i18n/texte.js.
 * @param {Object<string, Object>} woerterbuch
 */
export function useTexte(woerterbuch) {
  const { sprache } = useSprache();
  return useMemo(() => erstelleT(woerterbuch, sprache), [woerterbuch, sprache]);
}

/**
 * Meldet die Sprache aus den persönlichen Einstellungen an den Provider (App.js mit
 * `currentUser?.sprache`). Ohne Anmeldung oder ohne Wahl: null, dann gilt Deutsch.
 * @param {string|null|undefined} wert
 */
export function useProfilSprache(wert) {
  const { setzeProfilSprache } = useSprache();
  useEffect(() => {
    setzeProfilSprache(wert);
  }, [wert, setzeProfilSprache]);
}
