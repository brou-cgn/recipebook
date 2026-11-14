import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canEditMenu, canEditRecipes } from '../utils/userManagement';
import { saveMenuWeinbegleitung } from '../utils/menuFirestore';
import { berechneWeinbegleitung } from '../utils/weinbegleitung/engine';
import { gaengeAusMenue, GANG_STATUS_OK } from '../utils/weinbegleitung/gang';
import { MODUS_PRO_GANG, MODUS_EIN_WEIN } from '../utils/weinbegleitung/konstanten';
import { istWeinprofilAktuell } from '../utils/weinbegleitung/profilHash';
import {
  weinRezeptIds,
  inBloecken,
  menueInputHash,
  erstelleSnapshot,
  istGueltigerSnapshot,
  gangFuerSektion,
  mitFixierung,
  ohneFixierung,
} from '../utils/weinbegleitung/menue';
import { neueresProfil, weinprofilFehlertext } from '../utils/weinbegleitung/anzeige';
import { regionenFuerGaenge } from '../utils/weinbegleitung/kulinarik';
import { generiereWeinprofile, MAX_REZEPTE_JE_AUFRUF } from '../utils/weinbegleitung/weinprofilCallable';

const TEXT_SPEICHERN_FEHLGESCHLAGEN = 'Die Weinbegleitung konnte nicht gespeichert werden. Versuch es gleich noch einmal.';

/**
 * Weinbegleitung im Menü-Detail (Tracker docs/vorhaben/weinbegleitung.md, Variante B).
 *
 * Angezeigt wird der gespeicherte Snapshot `menu.weinbegleitung`; das Anzeigen löst nie einen
 * KI-Aufruf aus. Nur wer das Menü bearbeiten darf (canEditMenu, ab Rolle edit) und nicht auf
 * einer Freigabe-Seite ist, kann erstellen, neu berechnen, den Modus wechseln und Gänge
 * tauschen. Beim Erstellen und Neuberechnen schätzt das Callable nur Rezepte ohne aktuelles
 * Profil, in Blöcken zu MAX_REZEPTE_JE_AUFRUF; der Server überspringt Unverändertes ohnehin.
 *
 * MenuDetail hält das Menü nach dem Öffnen im eigenen Zustand, deshalb führt der Hook den
 * gespeicherten Snapshot selbst nach.
 */
export default function useMenueWeinbegleitung({ menu, recipes, currentUser, isSharedView = false }) {
  const gespeichert = istGueltigerSnapshot(menu?.weinbegleitung) ? menu.weinbegleitung : null;
  const [snapshot, setSnapshot] = useState(gespeichert);
  const [lokaleProfile, setLokaleProfile] = useState({});
  const [arbeit, setArbeit] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [hinweis, setHinweis] = useState(null);
  const [veraltet, setVeraltet] = useState(null);
  const aktivRef = useRef(true);
  const beschaeftigtRef = useRef(false);

  useEffect(() => {
    aktivRef.current = true;
    return () => { aktivRef.current = false; };
  }, []);

  // Anderes Menü oder neuer Snapshot von außen (z. B. Freigabe-Seite lädt nach)
  useEffect(() => {
    setSnapshot(gespeichert);
    setFehler(null);
    setHinweis(null);
  }, [menu?.id, gespeichert]); // eslint-disable-line react-hooks/exhaustive-deps

  const rezeptIds = useMemo(() => weinRezeptIds(menu), [menu]);

  const rezepte = useMemo(() => {
    const nachId = new Map((recipes || []).filter(Boolean).map((rezept) => [rezept.id, rezept]));
    return rezeptIds
      .map((id) => nachId.get(id))
      .filter(Boolean)
      .map((rezept) => {
        const profil = neueresProfil(rezept.weinprofil, lokaleProfile[rezept.id]);
        return profil === rezept.weinprofil ? rezept : { ...rezept, weinprofil: profil };
      });
  }, [recipes, rezeptIds, lokaleProfile]);

  const gaenge = useMemo(() => gaengeAusMenue(menu, rezepte), [menu, rezepte]);
  const hatGaenge = gaenge.length > 0;
  // Weinregion je Gang und fürs ganze Menü aus der Kulinarik: nur für die Rebsorten-Beispiele,
  // nicht für die Wahl des Stils (kulinarik.js)
  const regionen = useMemo(() => regionenFuerGaenge(gaenge, rezepte), [gaenge, rezepte]);
  const darfBearbeiten = !isSharedView && canEditMenu(currentUser, menu) && canEditRecipes(currentUser);

  // Veraltet: anderer Menü-Hash (Sektionen, Rezepte, Profile, Regeln) oder ein Rezept wurde nach
  // seinem Profil geändert. Ohne Web Crypto bleibt es bei „unbekannt“. Freigabe-Seiten zeigen nur
  // das Ergebnis, ohne Hinweis: Gäste können nichts neu berechnen.
  useEffect(() => {
    let abgebrochen = false;
    if (!snapshot || isSharedView) {
      setVeraltet(null);
      return undefined;
    }
    (async () => {
      try {
        const hash = await menueInputHash(menu, rezepte);
        const aktuell = await Promise.all(rezepte.filter((rezept) => rezept.weinprofil).map((rezept) => istWeinprofilAktuell(rezept)));
        if (!abgebrochen) setVeraltet(snapshot.inputHash !== hash || aktuell.some((ok) => !ok));
      } catch {
        if (!abgebrochen) setVeraltet(null);
      }
    })();
    return () => { abgebrochen = true; };
  }, [snapshot, menu, rezepte, isSharedView]);

  const berechnenUndSpeichern = useCallback(async ({ modus, fixierungen, gewaehlterGemeinsamerStilId, rezepteStand }) => {
    const ergebnis = berechneWeinbegleitung({
      menu,
      rezepte: rezepteStand,
      modus,
      fixierungen,
      gemeinsamerStilId: modus === MODUS_EIN_WEIN ? gewaehlterGemeinsamerStilId : null,
    });
    // Ohne Web Crypto bleibt der Hash leer; die Weinbegleitung gilt dann beim nächsten Öffnen als veraltet.
    const inputHash = await menueInputHash(menu, rezepteStand).catch(() => null);
    const neu = erstelleSnapshot({
      ergebnis,
      fixierungen,
      gewaehlterGemeinsamerStilId,
      inputHash,
      nutzerId: currentUser?.id,
    });
    await saveMenuWeinbegleitung(menu.id, neu);
    if (aktivRef.current) setSnapshot(neu);
    return neu;
  }, [menu, currentUser]);

  const aktuelleWahl = useCallback(() => ({
    modus: snapshot?.modus || MODUS_PRO_GANG,
    fixierungen: snapshot?.fixierungen || [],
    gewaehlterGemeinsamerStilId: snapshot?.gewaehlterGemeinsamerStilId || null,
  }), [snapshot]);

  const ausfuehren = useCallback(async (aufgabe) => {
    if (beschaeftigtRef.current) return;
    beschaeftigtRef.current = true;
    setFehler(null);
    try {
      await aufgabe();
    } finally {
      beschaeftigtRef.current = false;
      if (aktivRef.current) setArbeit(null);
    }
  }, []);

  /** Erstellen bzw. „Neu berechnen“: fehlende oder veraltete Profile schätzen, dann speichern. */
  const berechnen = useCallback(() => ausfuehren(async () => {
    if (!darfBearbeiten) return;
    setHinweis(null);

    const offen = (await Promise.all(rezepte.map(async (rezept) => {
      if (!rezept.weinprofil) return rezept.id;
      try {
        return (await istWeinprofilAktuell(rezept)) ? null : rezept.id;
      } catch {
        return rezept.id; // ohne Hash entscheidet der Server
      }
    }))).filter(Boolean);

    const neueProfile = {};
    const fehlgeschlagen = {};
    if (offen.length > 0) {
      let fertig = 0;
      setArbeit({ art: 'schaetzen', fertig, gesamt: offen.length });
      for (const block of inBloecken(offen, MAX_REZEPTE_JE_AUFRUF)) {
        try {
          const antwort = await generiereWeinprofile(block);
          Object.assign(neueProfile, antwort?.profile || {});
          Object.assign(fehlgeschlagen, antwort?.fehlerGruende || {});
        } catch (error) {
          block.forEach((id) => { fehlgeschlagen[id] = error; });
        }
        fertig += block.length;
        if (aktivRef.current) setArbeit({ art: 'schaetzen', fertig, gesamt: offen.length });
      }
      if (aktivRef.current) setLokaleProfile((vorher) => ({ ...vorher, ...neueProfile }));
    }

    const stand = rezepte.map((rezept) => (neueProfile[rezept.id]
      ? { ...rezept, weinprofil: neueresProfil(rezept.weinprofil, neueProfile[rezept.id]) }
      : rezept));
    const ersterGrund = Object.values(fehlgeschlagen)[0];

    if (!gaengeAusMenue(menu, stand).some((gang) => gang.gang.status === GANG_STATUS_OK)) {
      if (aktivRef.current) setFehler(weinprofilFehlertext(ersterGrund ?? 'allgemein'));
      return;
    }

    setArbeit({ art: 'speichern' });
    try {
      await berechnenUndSpeichern({ ...aktuelleWahl(), rezepteStand: stand });
    } catch {
      if (aktivRef.current) setFehler(TEXT_SPEICHERN_FEHLGESCHLAGEN);
      return;
    }

    const anzahl = Object.keys(fehlgeschlagen).length;
    if (anzahl > 0 && aktivRef.current) {
      const wer = anzahl === 1 ? 'Ein Gericht konnte' : `${anzahl} Gerichte konnten`;
      setHinweis(`${wer} nicht eingeschätzt werden. ${weinprofilFehlertext(ersterGrund)}`);
    }
  }), [ausfuehren, darfBearbeiten, rezepte, menu, berechnenUndSpeichern, aktuelleWahl]);

  const neuSpeichern = useCallback((aenderung) => ausfuehren(async () => {
    if (!darfBearbeiten || !snapshot) return;
    setArbeit({ art: 'speichern' });
    try {
      await berechnenUndSpeichern({ ...aktuelleWahl(), ...aenderung, rezepteStand: rezepte });
    } catch {
      if (aktivRef.current) setFehler(TEXT_SPEICHERN_FEHLGESCHLAGEN);
    }
  }), [ausfuehren, darfBearbeiten, snapshot, berechnenUndSpeichern, aktuelleWahl, rezepte]);

  const modusWechseln = useCallback((modus) => {
    if (!snapshot || snapshot.modus === modus) return undefined;
    return neuSpeichern({ modus });
  }, [snapshot, neuSpeichern]);

  /**
   * Option als Empfehlung festlegen: „Pro Gang“ tauscht und fixiert den Gang, „Ein Wein“ den
   * gemeinsamen Stil. Im Kopf („Ein Wein“) gibt es keinen Gang, dort ist `gang` null.
   */
  const alternativeWaehlen = useCallback((gang, stilId) => {
    if (!snapshot) return undefined;
    if (snapshot.modus === MODUS_EIN_WEIN) {
      if (gang?.istDessert) return undefined;
      return neuSpeichern({ gewaehlterGemeinsamerStilId: stilId });
    }
    if (!gang) return undefined;
    return neuSpeichern({
      fixierungen: mitFixierung(snapshot.fixierungen, { sektionIndex: gang.sektionIndex, sektionName: gang.sektionName, stilId }),
    });
  }, [snapshot, neuSpeichern]);

  /** Fixierung lösen; im Modus „Ein Wein“ (auch aus dem Kopf, `gang` null) die des gemeinsamen Stils. */
  const fixierungLoesen = useCallback((gang) => {
    if (!snapshot) return undefined;
    if (snapshot.modus === MODUS_EIN_WEIN) return neuSpeichern({ gewaehlterGemeinsamerStilId: null });
    if (!gang) return undefined;
    return neuSpeichern({ fixierungen: ohneFixierung(snapshot.fixierungen, gang.sektionIndex, gang.sektionName) });
  }, [snapshot, neuSpeichern]);

  const gangFuer = useCallback(
    (sektionIndex, sektionName) => gangFuerSektion(snapshot, sektionIndex, sektionName),
    [snapshot],
  );

  const regionFuer = useCallback(
    (sektionIndex) => regionen.jeGang.get(sektionIndex) || null,
    [regionen],
  );

  return {
    sichtbar: hatGaenge && (Boolean(snapshot) || darfBearbeiten),
    snapshot,
    darfBearbeiten,
    arbeit,
    fehler,
    hinweis,
    veraltet,
    gangFuer,
    regionFuer,
    regionMenue: regionen.menue,
    berechnen,
    modusWechseln,
    alternativeWaehlen,
    fixierungLoesen,
  };
}
