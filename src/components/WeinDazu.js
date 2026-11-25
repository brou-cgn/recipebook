import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { WeinGlas, WeinSymbol, Gruende, sichereId } from './WeinbegleitungTeile';
import WeinprofilEinblick from './WeinprofilEinblick';
import { canEditRecipes } from '../utils/userManagement';
import { empfehlungFuerWeinprofil } from '../utils/weinbegleitung/engine';
import { STATUS_OK, STATUS_KEIN_STIL, STATUS_OHNE_PROFIL } from '../utils/weinbegleitung/konstanten';
import { getStil, formatTemperatur } from '../utils/weinbegleitung/wissensbasis';
import { beispieleFuerRegion, regionFuerRezept } from '../utils/weinbegleitung/kulinarik';
import { istOhneWein } from '../utils/weinbegleitung/ohneWein';
import { istWeinprofilAktuell } from '../utils/weinbegleitung/profilHash';
import { kennwerteFuer, weinprofilFehlertext, neueresProfil } from '../utils/weinbegleitung/anzeige';
import { generiereWeinprofile } from '../utils/weinbegleitung/weinprofilCallable';
import { beispielText, labelText, regionName, stilName } from '../utils/weinbegleitung/sprache';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import weinTexte from '../i18n/texte/wein';
import allgemeinTexte from '../i18n/texte/allgemein';
import useModalScrollLock from '../hooks/useModalScrollLock';
import useFadeOutClose from '../hooks/useFadeOutClose';
import './WeinDazu.css';

/**
 * „Wein dazu“ in der Rezeptansicht (Weinbegleitung, Variante B, Tracker
 * docs/vorhaben/weinbegleitung.md): ein Chip in eigener Zeile unter der Metadatenzeile,
 * Antippen öffnet ein Sheet mit Stil, Beispielen, Trinktemperatur, Kennwerten, Gründen
 * samt Quellen und den Alternativen (nur Anzeige, nichts wird gespeichert).
 *
 * Die Empfehlung rechnet die Engine beim Anzeigen aus dem Feld `weinprofil`; das Anzeigen
 * löst nie einen KI-Aufruf aus. Nur ab Rolle edit und außerhalb von Freigabe-Seiten gibt
 * es „Passenden Wein finden“ bzw. „Neu einschätzen“ (Callable generateWeinprofile).
 *
 * `icons`: `{ rot, weiss, rose, suess, keinStil }` aus den Button-Icons (`weinRot`, `weinWeiss`, `weinRose`, `weinSuess`,
 * `weinKeinStil` für „Hier lieber Bier oder Wasser“; `weinIconsAus` in anzeige.js), leer = eingebautes Glas.
 * Das Sheet schließt mobil nur per Wischen nach unten am Griff (Desktop: Hintergrund, Escape).
 * Die Rebsorten-Beispiele folgen der Kulinarik des Rezepts (kulinarik.js), der Stil nicht.
 * Mit der Berechtigung „weinprofilEinblick“ (Funktionen nach Berechtigung, `currentUser`) steht
 * am Ende des Sheets aufklappbar die Einschätzung im Detail (WeinprofilEinblick), nie auf
 * Freigabe-Seiten.
 */

function StilDetails({ option, icons, regionId }) {
  // Wissensbasis und Texte in der geltenden Sprache (Mehrsprachigkeit PR 6c)
  const t = useTexte(weinTexte);
  const { sprache } = useSprache();
  const stil = getStil(option.stilId);
  if (!stil) return null;
  const { beispiele, region } = beispieleFuerRegion(stil, regionId);
  return (
    <div className="wein-dazu-stil">
      <div className="wein-dazu-stil-kopf">
        <span className="wein-dazu-stil-glas">
          <WeinSymbol stil={stil} icons={icons} groesse={40} />
        </span>
        <div>
          <p className="wein-dazu-stil-name">{stilName(stil, sprache)}</p>
          <p className="wein-dazu-stil-beispiele">
            {t('zumBeispiel', { beispiele: beispiele.map((beispiel) => beispielText(beispiel, sprache)).join(', ') })}
            {' · '}
            <span className="wein-dazu-nowrap">{formatTemperatur(stil)}</span>
          </p>
          {region && <p className="wein-dazu-stil-region">{t('beispielePassend', { region: regionName(region, sprache) })}</p>}
          <p className="wein-dazu-stil-label">{labelText(option.label, t)}</p>
        </div>
      </div>
      <dl className="wein-dazu-kennwerte">
        {kennwerteFuer(stil, t).map((eintrag) => (
          <div key={eintrag.name} className="wein-dazu-kennwert">
            <dt>{eintrag.name}</dt>
            <dd>{eintrag.wert}</dd>
          </div>
        ))}
      </dl>
      <h3 className="wein-dazu-abschnitt">{t('warumPasst')}</h3>
      <Gruende regelIds={option.regelIds} mitQuellen={false} />
    </div>
  );
}

// Wischgeste am Griff: ab dieser Strecke (px) oder mit Schwung schließt das Sheet
const WISCH_SCHWELLE = 90;
const WISCH_MIN_SCHWUNG = 30;
const WISCH_TEMPO = 0.5; // px/ms

function WeinDazuSheet({
  empfehlung, veraltet, darfSchaetzen, onNeuEinschaetzen, onClose, icons, regionId = null, rezept = null, einblickProfil = null,
}) {
  useModalScrollLock();
  const t = useTexte(weinTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const { sprache } = useSprache();
  const [closing, schliessen] = useFadeOutClose(onClose);
  const [auswahl, setAuswahl] = useState(0);
  const [zug, setZug] = useState(0);
  const [ziehend, setZiehend] = useState(false);
  const [gewischt, setGewischt] = useState(false);
  const dialogRef = useRef(null);
  const startRef = useRef(null);
  const titelId = sichereId('wein-dazu-titel', useId());

  useEffect(() => {
    if (dialogRef.current) dialogRef.current.focus();
  }, []);

  useEffect(() => {
    const beiTaste = (event) => {
      if (event.key === 'Escape') schliessen();
    };
    document.addEventListener('keydown', beiTaste);
    return () => document.removeEventListener('keydown', beiTaste);
  }, [schliessen]);

  const zugStart = (event) => {
    const touch = event.touches[0];
    startRef.current = { y: touch.clientY, zeit: Date.now() };
    setZiehend(true);
  };

  const zugBewegen = (event) => {
    if (!startRef.current) return;
    setZug(Math.max(0, event.touches[0].clientY - startRef.current.y));
  };

  const zugEnde = (event) => {
    if (!startRef.current) return;
    // Kein synthetischer Klick auf den Griff: Antippen allein schließt nicht
    if (event.cancelable) event.preventDefault();
    const dauer = Math.max(1, Date.now() - startRef.current.zeit);
    startRef.current = null;
    setZiehend(false);
    if (zug >= WISCH_SCHWELLE || (zug >= WISCH_MIN_SCHWUNG && zug / dauer >= WISCH_TEMPO)) {
      setGewischt(true);
      schliessen();
    } else {
      setZug(0);
    }
  };

  const optionen = empfehlung.status === STATUS_OK ? [empfehlung, ...empfehlung.alternativen] : [];
  const gewaehlt = optionen[auswahl] || optionen[0];

  const rootKlassen = ['wein-dazu-sheet-root'];
  if (closing) rootKlassen.push('wein-dazu-sheet-root--closing');
  if (gewischt) rootKlassen.push('wein-dazu-sheet-root--gewischt');

  return (
    <div className={rootKlassen.join(' ')}>
      <button type="button" className="wein-dazu-sheet-scrim" aria-label={tAllgemein('schliessen')} tabIndex={-1} onClick={schliessen} />
      <div
        className={`wein-dazu-sheet${ziehend ? ' wein-dazu-sheet--ziehend' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        tabIndex={-1}
        ref={dialogRef}
        style={{ '--wein-dazu-zug': `${zug}px`, transform: zug > 0 ? `translateY(${zug}px)` : undefined }}
      >
        <div
          className="wein-dazu-sheet-ziehzone"
          onTouchStart={zugStart}
          onTouchMove={zugBewegen}
          onTouchEnd={zugEnde}
          onTouchCancel={zugEnde}
        >
          {/* Für Tastatur und Screenreader; mit dem Finger schließt nur das Wischen */}
          <button type="button" className="wein-dazu-sheet-grabber" aria-label={tAllgemein('schliessen')} onClick={schliessen} />
          <h2 className="wein-dazu-sheet-titel" id={titelId}>{t('weinDazu')}</h2>
        </div>
        <div className="wein-dazu-sheet-inhalt">
          {veraltet && (
            <div className="wein-dazu-veraltet">
              <p>{t('veraendert')}</p>
              {darfSchaetzen && (
                <button type="button" className="wein-dazu-knopf" onClick={onNeuEinschaetzen}>
                  {t('neuEinschaetzen')}
                </button>
              )}
            </div>
          )}

          {empfehlung.status === STATUS_KEIN_STIL ? (
            <div className="wein-dazu-stil">
              <div className="wein-dazu-stil-kopf">
                <span className="wein-dazu-stil-glas"><WeinSymbol stil={null} icons={icons} groesse={40} /></span>
                <p className="wein-dazu-stil-name">{t('keinStil')}</p>
              </div>
              <Gruende regelIds={empfehlung.regelIds} mitQuellen={false} />
            </div>
          ) : (
            gewaehlt && <StilDetails option={gewaehlt} icons={icons} regionId={regionId} />
          )}

          {optionen.length > 1 && (
            <section className="wein-dazu-optionen" aria-label={t('empfehlungUndAlternativen')}>
              <h3 className="wein-dazu-abschnitt">{t('zurAuswahl')}</h3>
              <ul className="wein-dazu-optionen-liste">
                {optionen.map((option, index) => {
                  const stil = getStil(option.stilId);
                  if (!stil) return null;
                  return (
                    <li key={option.stilId}>
                      <button
                        type="button"
                        className="wein-dazu-option"
                        aria-pressed={index === auswahl}
                        onClick={() => setAuswahl(index)}
                      >
                        <WeinSymbol stil={stil} icons={icons} groesse={22} />
                        <span className="wein-dazu-option-text">
                          <span className="wein-dazu-option-name">{stilName(stil, sprache)}</span>
                          <span className="wein-dazu-option-label">
                            {index === 0 ? t('empfehlung') : t('alternative')} · {labelText(option.label, t)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {einblickProfil && <WeinprofilEinblick rezept={rezept} profil={einblickProfil} />}
        </div>
      </div>
    </div>
  );
}

function WeinDazu({ recipe, currentUser, isSharedView = false, icons = null }) {
  const t = useTexte(weinTexte);
  const { sprache } = useSprache();
  const [lokal, setLokal] = useState(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [sheetOffen, setSheetOffen] = useState(false);
  const [aktuell, setAktuell] = useState(null);
  const chipRef = useRef(null);
  const aktivRef = useRef(true);
  const rezeptId = recipe?.id;

  useEffect(() => {
    aktivRef.current = true;
    return () => { aktivRef.current = false; };
  }, []);

  // Anderes Rezept (z. B. verknüpftes Unterrezept): alles zurücksetzen
  useEffect(() => {
    setLokal(null);
    setFehler(null);
    setSheetOffen(false);
  }, [rezeptId]);

  const lokalesProfil = lokal && lokal.recipeId === rezeptId ? lokal.profil : null;
  const profil = neueresProfil(recipe?.weinprofil, lokalesProfil);
  const empfehlung = useMemo(() => empfehlungFuerWeinprofil(profil), [profil]);
  const darfSchaetzen = !isSharedView && canEditRecipes(currentUser);
  // Einschätzung im Detail: Berechtigung „weinprofilEinblick“, nie auf Freigabe-Seiten
  const darfEinblick = !isSharedView && Boolean(currentUser?.weinprofilEinblick);

  // Veraltet-Erkennung über den inputHash; ohne Web Crypto bleibt es bei „unbekannt“.
  // Freigabe-Seiten zeigen nur das Ergebnis: Gäste können nichts neu einschätzen lassen.
  useEffect(() => {
    let abgebrochen = false;
    if (!profil || isSharedView) {
      setAktuell(null);
      return undefined;
    }
    istWeinprofilAktuell({ ...recipe, weinprofil: profil })
      .then((ergebnis) => { if (!abgebrochen) setAktuell(ergebnis); })
      .catch(() => { if (!abgebrochen) setAktuell(null); });
    return () => { abgebrochen = true; };
  }, [recipe, profil, isSharedView]);

  const schaetzen = useCallback(async () => {
    if (!rezeptId) return;
    setLaedt(true);
    setFehler(null);
    try {
      const antwort = await generiereWeinprofile([rezeptId]);
      if (!aktivRef.current) return;
      const neu = antwort?.profile?.[rezeptId];
      if (neu) setLokal({ recipeId: rezeptId, profil: neu });
      else setFehler(weinprofilFehlertext(antwort?.fehlerGruende?.[rezeptId], t));
    } catch (error) {
      if (aktivRef.current) setFehler(weinprofilFehlertext(error, t));
    } finally {
      if (aktivRef.current) setLaedt(false);
    }
  }, [rezeptId, t]);

  const sheetSchliessen = useCallback(() => {
    setSheetOffen(false);
    if (chipRef.current) chipRef.current.focus();
  }, []);

  const neuEinschaetzenAusSheet = useCallback(() => {
    setSheetOffen(false);
    schaetzen();
  }, [schaetzen]);

  if (!recipe) return null;
  if (istOhneWein(recipe)) return null; // Gebäcke & Teige, Drinks: nie eine Weinempfehlung, auch nicht berechenbar
  if (empfehlung.status !== STATUS_OK && empfehlung.status !== STATUS_KEIN_STIL && empfehlung.status !== STATUS_OHNE_PROFIL) {
    return null; // Rolle ohne Wein (Getränk, Sauce, Beilage, Gebäck)
  }
  if (empfehlung.status === STATUS_OHNE_PROFIL && !darfSchaetzen && !laedt) return null;

  const veraltet = aktuell === false;
  const stil = empfehlung.status === STATUS_OK ? getStil(empfehlung.stilId) : null;

  return (
    <div className="wein-dazu">
      <div className="wein-dazu-zeile">
        {laedt ? (
          <span className="wein-dazu-laden" role="status">
            <WeinGlas laedt groesse={22} />
            {t('wirdEingeschaetzt')}
          </span>
        ) : empfehlung.status === STATUS_OHNE_PROFIL ? (
          <button type="button" className="wein-dazu-chip wein-dazu-chip--leer" onClick={schaetzen}>
            <WeinGlas groesse={20} />
            {t('weinFinden')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="wein-dazu-chip"
              onClick={() => setSheetOffen(true)}
              aria-haspopup="dialog"
              ref={chipRef}
            >
              <WeinSymbol stil={stil} icons={icons} groesse={20} />
              {stil ? (
                <span><span className="wein-dazu-chip-praefix">{t('wein')}</span> {stilName(stil, sprache)}</span>
              ) : (
                <span>{t('keinStil')}</span>
              )}
            </button>
            {veraltet && (darfSchaetzen ? (
              <button type="button" className="wein-dazu-link" onClick={schaetzen}>
                {t('neuEinschaetzen')}
              </button>
            ) : (
              <span className="wein-dazu-hinweis">{t('veraltet')}</span>
            ))}
          </>
        )}
      </div>
      {fehler && <p className="wein-dazu-fehler" role="alert">{fehler}</p>}
      {sheetOffen && (
        <WeinDazuSheet
          icons={icons}
          regionId={regionFuerRezept(recipe)}
          rezept={recipe}
          einblickProfil={darfEinblick ? profil : null}
          empfehlung={empfehlung}
          veraltet={veraltet}
          darfSchaetzen={darfSchaetzen}
          onNeuEinschaetzen={neuEinschaetzenAusSheet}
          onClose={sheetSchliessen}
        />
      )}
    </div>
  );
}

export default WeinDazu;
