import { useCallback, useEffect, useRef, useState } from 'react';
import { trageTitelUebersetzungenNach } from '../utils/titelUebersetzungCallable';
import { getCallableErrorDetails } from '../utils/callableErrors';

export const TITEL_BACKFILL_STATUS = {
  BEREIT: 'bereit',
  LAEUFT: 'laeuft',
  ANGEHALTEN: 'angehalten',
  TAGESLIMIT: 'tageslimit',
  FEHLER: 'fehler',
  FERTIG: 'fertig',
};

const LEER = { geprueft: 0, neu: 0, uebersprungen: 0, fehlgeschlagen: 0, gesamt: null };

// Admin-Bereich: bleibt deutsch (Tracker Mehrsprachigkeit, „Admin-Bereich“).
const TEXT_NUR_ADMINS = 'Titelübersetzungen nachtragen dürfen nur Admins.';
const TEXT_UNERWARTET = 'Die Antwort des Servers war unerwartet. Versuch es gleich noch einmal.';
const TEXT_ALLGEMEIN = 'Das hat nicht geklappt. Versuch es gleich noch einmal.';

/**
 * Admin-Backfill der Titelübersetzungen (Vorhaben Mehrsprachigkeit, PR 3), gebaut wie
 * useWeinprofilBackfill: ruft backfillTitelUebersetzungen Seite für Seite auf, bis der Bestand
 * durch ist, und summiert den Fortschritt. Anhalten wirkt nach der laufenden Seite; nach
 * Anhalten, Fehler oder Tageslimit setzt „Fortsetzen“ am letzten Cursor an. Verlässt man die
 * Seite, endet der Lauf nach der laufenden Seite.
 *
 * @returns {{status: string, stand: Object, fehler: string|null, kannFortsetzen: boolean,
 *   haltAngefragt: boolean, starten: Function, fortsetzen: Function, anhalten: Function}}
 */
export default function useTitelUebersetzungBackfill() {
  const [status, setStatus] = useState(TITEL_BACKFILL_STATUS.BEREIT);
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
    let ende = TITEL_BACKFILL_STATUS.FERTIG;
    let fehlerText = null;
    setStand(summe);
    setFehler(null);
    setKannFortsetzen(false);
    setHaltAngefragt(false);
    setStatus(TITEL_BACKFILL_STATUS.LAEUFT);

    try {
      for (;;) {
        if (anhaltenRef.current) {
          ende = TITEL_BACKFILL_STATUS.ANGEHALTEN;
          break;
        }
        const cursor = cursorRef.current;
        let antwort;
        try {
          antwort = await trageTitelUebersetzungenNach({ cursor });
        } catch (error) {
          const { code, message } = getCallableErrorDetails(error);
          if (code === 'resource-exhausted') {
            ende = TITEL_BACKFILL_STATUS.TAGESLIMIT;
          } else {
            ende = TITEL_BACKFILL_STATUS.FEHLER;
            fehlerText = code === 'permission-denied' ? TEXT_NUR_ADMINS : (message || TEXT_ALLGEMEIN);
          }
          break;
        }
        // Ohne Fortschritt (kein neuer Cursor, obwohl nicht fertig) nicht von vorn beginnen.
        if (!antwort || (!antwort.fertig && (!antwort.naechsterCursor || antwort.naechsterCursor === cursor))) {
          ende = TITEL_BACKFILL_STATUS.FEHLER;
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
          ende = TITEL_BACKFILL_STATUS.FERTIG;
          break;
        }
        cursorRef.current = antwort.naechsterCursor;
        if (antwort.tageslimitErreicht) {
          ende = TITEL_BACKFILL_STATUS.TAGESLIMIT;
          break;
        }
      }
    } finally {
      laeuftRef.current = false;
      if (aktivRef.current) {
        setStatus(ende);
        setFehler(fehlerText);
        setKannFortsetzen(ende !== TITEL_BACKFILL_STATUS.FERTIG);
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
