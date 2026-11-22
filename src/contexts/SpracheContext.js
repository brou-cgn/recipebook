import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  STANDARD_SPRACHE,
  aktiveSprache,
  istSprache,
  leseSitzungsSprache,
  speichereSitzungsSprache,
} from '../i18n/sprachen';
import { erstelleT } from '../i18n/texte';
import { rezeptTitel } from '../i18n/rezeptTitel';

// Sprache der App (Vorhaben docs/vorhaben/mehrsprachigkeit.md). Der Provider umschließt in
// src/index.js die ganze App. App.js meldet die Sprache aus den persönlichen Einstellungen
// (useProfilSprache), der Umschalter im Header setzt die Sprache dieser Sitzung
// (setzeSitzungsSprache, null hebt sie auf). Welche gilt: aktiveSprache in src/i18n/sprachen.js.
// Ohne Provider (etwa in Tests mit render() statt renderWithProviders) gilt Deutsch.
// `inhalteUebersetzen`: übersetzte Inhalte (Rezepttitel, ab PR 4 Rezeptinhalt) anzeigen; in
// der App nur mit der Berechtigung sprachwahl (useSpracheFuerNutzer).
const OHNE_PROVIDER = Object.freeze({
  sprache: STANDARD_SPRACHE,
  profilSprache: null,
  sitzungsSprache: null,
  inhalteUebersetzen: false,
  setzeProfilSprache: () => {},
  setzeSitzungsSprache: () => {},
  setzeInhalteUebersetzen: () => {},
});

const SpracheContext = createContext(OHNE_PROVIDER);

const gueltigOderNull = (wert) => (istSprache(wert) ? wert : null);

/**
 * @param {object} props
 * @param {string|null} [props.profilSprache] - Startwert der persönlichen Einstellung (Tests);
 *   in der App meldet App.js sie über useProfilSprache
 * @param {Storage|null} [props.speicher] - wo die Sitzungs-Sprache liegt; ohne Angabe
 *   sessionStorage, null = nirgends (Tests)
 * @param {boolean} [props.inhalteUebersetzen] - Startwert (Tests); in der App setzt ihn
 *   useSpracheFuerNutzer
 */
export function SpracheProvider({
  children,
  profilSprache: startProfilSprache = null,
  speicher,
  inhalteUebersetzen: startInhalteUebersetzen = false,
}) {
  const [profilSprache, setProfilSprache] = useState(() => gueltigOderNull(startProfilSprache));
  const [inhalteUebersetzen, setInhalteUebersetzen] = useState(Boolean(startInhalteUebersetzen));
  const [sitzungsSprache, setSitzungsSprache] = useState(() => (
    speicher === null ? null : leseSitzungsSprache(speicher)
  ));

  const setzeProfilSprache = useCallback((wert) => setProfilSprache(gueltigOderNull(wert)), []);
  const setzeInhalteUebersetzen = useCallback((wert) => setInhalteUebersetzen(Boolean(wert)), []);

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
    inhalteUebersetzen,
    setzeProfilSprache,
    setzeSitzungsSprache,
    setzeInhalteUebersetzen,
  }), [sprache, profilSprache, sitzungsSprache, inhalteUebersetzen,
    setzeProfilSprache, setzeSitzungsSprache, setzeInhalteUebersetzen]);

  return <SpracheContext.Provider value={wert}>{children}</SpracheContext.Provider>;
}

/**
 * @returns {{sprache: string, profilSprache: string|null, sitzungsSprache: string|null,
 *   inhalteUebersetzen: boolean, setzeProfilSprache: Function, setzeSitzungsSprache: Function,
 *   setzeInhalteUebersetzen: Function}}
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
 * Titel eines Rezepts in der geltenden Sprache (src/i18n/rezeptTitel.js), solange übersetzte
 * Inhalte eingeschaltet sind; sonst das Original.
 * @returns {(rezept: object) => string}
 */
export function useRezeptTitel() {
  const { sprache, inhalteUebersetzen } = useSprache();
  return useCallback((rezept) => rezeptTitel(rezept, sprache, inhalteUebersetzen), [sprache, inhalteUebersetzen]);
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

/**
 * Verbindet die Sprache mit der angemeldeten Person (App.js mit `currentUser`).
 * Die persönliche Einstellung gilt nur mit der Berechtigung `sprachwahl` (Funktionen nach
 * Berechtigung); ohne sie gilt Deutsch, übersetzte Inhalte bleiben aus, und eine im Header
 * gewählte Sitzungs-Sprache endet.
 * Sie endet auch beim Abmelden, damit die nächste Person nicht in fremder Sprache startet.
 * Solange noch niemand angemeldet ist (App-Start), bleibt sie stehen.
 * @param {object|null} nutzer - currentUser mit `sprache` und `sprachwahl`
 */
export function useSpracheFuerNutzer(nutzer) {
  const angemeldet = Boolean(nutzer);
  const darfWaehlen = Boolean(nutzer?.sprachwahl);
  useProfilSprache(darfWaehlen ? nutzer?.sprache : null);

  const { setzeSitzungsSprache, setzeInhalteUebersetzen } = useSprache();
  useEffect(() => {
    setzeInhalteUebersetzen(darfWaehlen);
  }, [darfWaehlen, setzeInhalteUebersetzen]);
  const warAngemeldet = useRef(false);
  useEffect(() => {
    const abgemeldet = !angemeldet && warAngemeldet.current;
    if ((angemeldet && !darfWaehlen) || abgemeldet) setzeSitzungsSprache(null);
    warAngemeldet.current = angemeldet;
  }, [angemeldet, darfWaehlen, setzeSitzungsSprache]);
}
