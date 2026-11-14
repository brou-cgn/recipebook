import { useCallback, useEffect, useRef, useState } from 'react';
import { trageWeinprofileNach } from '../utils/weinbegleitung/weinprofilCallable';
import { weinprofilFehlertext } from '../utils/weinbegleitung/anzeige';
import { getCallableErrorDetails } from '../utils/callableErrors';

export const BACKFILL_STATUS = {
  BEREIT: 'bereit',
  LAEUFT: 'laeuft',
  ANGEHALTEN: 'angehalten',
  TAGESLIMIT: 'tageslimit',
  FEHLER: 'fehler',
  FERTIG: 'fertig',
};

const LEER = { geprueft: 0, neu: 0, uebersprungen: 0, fehlgeschlagen: 0, gesamt: null };

const TEXT_NUR_ADMINS = 'Weinprofile nachtragen dürfen nur Admins.';
const TEXT_UNERWARTET = 'Die Antwort des Servers war unerwartet. Versuch es gleich noch einmal.';

/**
 * Admin-Backfill der Gericht-Profile (Tracker docs/vorhaben/weinbegleitung.md, PR 5).
 *
 * Ruft backfillWeinprofile Seite für Seite auf, bis der Bestand durch ist, und summiert den
 * Fortschritt. Anhalten wirkt nach der laufenden Seite; nach Anhalten, Fehler oder
 * Tageslimit setzt „Fortsetzen“ am letzten Cursor an. Verlässt man die Seite, endet der
 * Lauf nach der laufenden Seite (keine Aufrufe im Hintergrund).
 *
 * @returns {{status: string, stand: Object, fehler: string|null, kannFortsetzen: boolean,
 *   haltAngefragt: boolean, starten: Function, fortsetzen: Function, anhalten: Function}}
 */
export default function useWeinprofilBackfill() {
  const [status, setStatus] = useState(BACKFILL_STATUS.BEREIT);
  const [stand, setStand] = useState(LEER);
  const [fehler, setFehler] = useState(null);
  const [kannFortsetzen, setKannFortsetzen] = useState(false);
  const [haltAngefragt, setHaltAngefragt] = useState(false);
  const standRef = useRef(LEER);
  const cursorRef = useRef(null);
  const laeuftRef = useRef(false);
  const anhaltenRef = useRef(false);
  const aktivRef = useRef(true);

  useEffect(() => {
    aktivRef.current = true;
    return () => {
      aktivRef.current = false;
      anhaltenRef.current = true;
    };
  }, []);

  const lauf = useCallback(async (vonVorn) => {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    anhaltenRef.current = false;
    if (vonVorn) {
      cursorRef.current = null;
      standRef.current = LEER;
    }
    let summe = standRef.current;
    let ende = BACKFILL_STATUS.FERTIG;
    let fehlerText = null;
    setStand(summe);
    setFehler(null);
    setKannFortsetzen(false);
    setHaltAngefragt(false);
    setStatus(BACKFILL_STATUS.LAEUFT);

    try {
      for (;;) {
        if (anhaltenRef.current) {
          ende = BACKFILL_STATUS.ANGEHALTEN;
          break;
        }
        const cursor = cursorRef.current;
        let antwort;
        try {
          antwort = await trageWeinprofileNach({ cursor });
        } catch (error) {
          const { code } = getCallableErrorDetails(error);
          if (code === 'resource-exhausted') {
            ende = BACKFILL_STATUS.TAGESLIMIT;
          } else {
            ende = BACKFILL_STATUS.FEHLER;
            fehlerText = code === 'permission-denied' ? TEXT_NUR_ADMINS : weinprofilFehlertext(error);
          }
          break;
        }
        // Ohne Fortschritt (kein Cursor, obwohl nicht fertig) nicht von vorn beginnen.
        if (!antwort || (!antwort.fertig && (!antwort.naechsterCursor || antwort.naechsterCursor === cursor))) {
          ende = BACKFILL_STATUS.FEHLER;
          fehlerText = TEXT_UNERWARTET;
          break;
        }

        summe = {
          geprueft: summe.geprueft + (antwort.geprueft || 0),
          neu: summe.neu + (antwort.neu || 0),
          uebersprungen: summe.uebersprungen + (antwort.uebersprungen || 0),
          fehlgeschlagen: summe.fehlgeschlagen + (antwort.fehlgeschlagen?.length || 0),
          gesamt: typeof antwort.gesamt === 'number' ? antwort.gesamt : summe.gesamt,
        };
        standRef.current = summe;
        if (aktivRef.current) setStand(summe);

        if (antwort.fertig) {
          cursorRef.current = null;
          ende = BACKFILL_STATUS.FERTIG;
          break;
        }
        cursorRef.current = antwort.naechsterCursor;
        if (antwort.tageslimitErreicht) {
          ende = BACKFILL_STATUS.TAGESLIMIT;
          break;
        }
      }
    } finally {
      laeuftRef.current = false;
      if (aktivRef.current) {
        setStatus(ende);
        setFehler(fehlerText);
        setKannFortsetzen(ende !== BACKFILL_STATUS.FERTIG);
        setHaltAngefragt(false);
      }
    }
  }, []);

  const starten = useCallback(() => lauf(true), [lauf]);
  const fortsetzen = useCallback(() => lauf(false), [lauf]);
  const anhalten = useCallback(() => {
    if (!laeuftRef.current) return;
    anhaltenRef.current = true;
    setHaltAngefragt(true);
  }, []);

  return { status, stand, fehler, kannFortsetzen, haltAngefragt, starten, fortsetzen, anhalten };
}
