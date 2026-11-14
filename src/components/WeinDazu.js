import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { canEditRecipes } from '../utils/userManagement';
import { empfehlungFuerWeinprofil } from '../utils/weinbegleitung/engine';
import { STATUS_OK, STATUS_KEIN_STIL, STATUS_OHNE_PROFIL } from '../utils/weinbegleitung/konstanten';
import { getStil, getRegel, formatTemperatur, beispieleKurz } from '../utils/weinbegleitung/wissensbasis';
import { istWeinprofilAktuell } from '../utils/weinbegleitung/profilHash';
import { kennwerteFuer, weinfarbe, weinprofilFehlertext, neueresProfil, TEXT_KEIN_STIL } from '../utils/weinbegleitung/anzeige';
import { generiereWeinprofile } from '../utils/weinbegleitung/weinprofilCallable';
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
 * `icons`: `{ rot, weiss }` aus den Button-Icons (`weinRot`, `weinWeiss`), leer = eingebautes Glas.
 * Das Sheet schließt mobil nur per Wischen nach unten am Griff (Desktop: Hintergrund, Escape).
 */

// useId liefert je nach React-Version Zeichen wie „:“ oder „«“, die in url(#…) nicht gehen.
const sichereId = (praefix, id) => `${praefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

function WeinGlas({ farbe = null, groesse = 20, laedt = false }) {
  const clipId = sichereId('wein-glas', useId());
  return (
    <svg
      className={`wein-dazu-glas${laedt ? ' wein-dazu-glas--laedt' : ''}`}
      width={groesse}
      height={groesse}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M7 3h10l-1 7a4 4 0 0 1-8 0z" />
        </clipPath>
      </defs>
      {(farbe || laedt) && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            className={`wein-dazu-glas-fuellung wein-dazu-glas-fuellung--${farbe || 'rot'}`}
            x="0"
            y="5"
            width="24"
            height="12"
          />
        </g>
      )}
      <path d="M7 3h10l-1 7a4 4 0 0 1-8 0z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 14v6M8.5 21h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const istBildQuelle = (wert) => /^(data:image\/|https?:\/\/|\/)/.test(wert);

/**
 * Symbol für einen Stil: das in den Button-Icons hinterlegte Icon für Rot- bzw. Weißwein
 * (Schlüssel `weinRot`, `weinWeiss`), sonst das eingebaute Glas in der Weinfarbe.
 * Rosé hat kein eigenes Icon und bleibt beim Glas.
 */
function WeinSymbol({ stil, icons, groesse }) {
  const eigenes = stil?.farbe === 'rot' ? icons?.rot : stil?.farbe === 'weiss' ? icons?.weiss : '';
  if (eigenes) {
    return istBildQuelle(eigenes) ? (
      <img className="wein-dazu-symbol-bild" src={eigenes} alt="" width={groesse} height={groesse} />
    ) : (
      <span className="wein-dazu-symbol-text" style={{ fontSize: groesse * 0.8 }} aria-hidden="true">{eigenes}</span>
    );
  }
  return <WeinGlas farbe={stil ? weinfarbe(stil) : null} groesse={groesse} />;
}

function Gruende({ regelIds }) {
  return (
    <ul className="wein-dazu-gruende">
      {regelIds.map((regelId) => {
        const regel = getRegel(regelId);
        if (!regel) return null;
        return (
          <li key={regelId}>
            {regel.kurztext}
          </li>
        );
      })}
    </ul>
  );
}

function StilDetails({ option, icons }) {
  const stil = getStil(option.stilId);
  if (!stil) return null;
  const beispiele = beispieleKurz(stil);
  return (
    <div className="wein-dazu-stil">
      <div className="wein-dazu-stil-kopf">
        <span className="wein-dazu-stil-glas">
          <WeinSymbol stil={stil} icons={icons} groesse={40} />
        </span>
        <div>
          <p className="wein-dazu-stil-name">{stil.name}</p>
          <p className="wein-dazu-stil-beispiele">
            z. B. {beispiele.join(', ')} · <span className="wein-dazu-nowrap">{formatTemperatur(stil)}</span>
          </p>
          <p className="wein-dazu-stil-label">{option.label}</p>
        </div>
      </div>
      <dl className="wein-dazu-kennwerte">
        {kennwerteFuer(stil).map((eintrag) => (
          <div key={eintrag.name} className="wein-dazu-kennwert">
            <dt>{eintrag.name}</dt>
            <dd>{eintrag.wert}</dd>
          </div>
        ))}
      </dl>
      <h3 className="wein-dazu-abschnitt">Warum passt das?</h3>
      <Gruende regelIds={option.regelIds} />
    </div>
  );
}

// Wischgeste am Griff: ab dieser Strecke (px) oder mit Schwung schließt das Sheet
const WISCH_SCHWELLE = 90;
const WISCH_MIN_SCHWUNG = 30;
const WISCH_TEMPO = 0.5; // px/ms

function WeinDazuSheet({ empfehlung, veraltet, darfSchaetzen, onNeuEinschaetzen, onClose, icons }) {
  useModalScrollLock();
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
      <button type="button" className="wein-dazu-sheet-scrim" aria-label="Schließen" tabIndex={-1} onClick={schliessen} />
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
          <button type="button" className="wein-dazu-sheet-grabber" aria-label="Schließen" onClick={schliessen} />
          <h2 className="wein-dazu-sheet-titel" id={titelId}>Wein dazu</h2>
        </div>
        <div className="wein-dazu-sheet-inhalt">
          {veraltet && (
            <div className="wein-dazu-veraltet">
              <p>Das Rezept wurde seit der Einschätzung geändert.</p>
              {darfSchaetzen && (
                <button type="button" className="wein-dazu-knopf" onClick={onNeuEinschaetzen}>
                  Neu einschätzen
                </button>
              )}
            </div>
          )}

          {empfehlung.status === STATUS_KEIN_STIL ? (
            <div className="wein-dazu-stil">
              <div className="wein-dazu-stil-kopf">
                <span className="wein-dazu-stil-glas"><WeinGlas groesse={40} /></span>
                <p className="wein-dazu-stil-name">{TEXT_KEIN_STIL}</p>
              </div>
              <Gruende regelIds={empfehlung.regelIds} />
            </div>
          ) : (
            gewaehlt && <StilDetails option={gewaehlt} icons={icons} />
          )}

          {optionen.length > 1 && (
            <section className="wein-dazu-optionen" aria-label="Empfehlung und Alternativen">
              <h3 className="wein-dazu-abschnitt">Zur Auswahl</h3>
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
                          <span className="wein-dazu-option-name">{stil.name}</span>
                          <span className="wein-dazu-option-label">
                            {index === 0 ? 'Empfehlung' : 'Alternative'} · {option.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function WeinDazu({ recipe, currentUser, isSharedView = false, icons = null }) {
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

  // Veraltet-Erkennung über den inputHash; ohne Web Crypto bleibt es bei „unbekannt“
  useEffect(() => {
    let abgebrochen = false;
    if (!profil) {
      setAktuell(null);
      return undefined;
    }
    istWeinprofilAktuell({ ...recipe, weinprofil: profil })
      .then((ergebnis) => { if (!abgebrochen) setAktuell(ergebnis); })
      .catch(() => { if (!abgebrochen) setAktuell(null); });
    return () => { abgebrochen = true; };
  }, [recipe, profil]);

  const schaetzen = useCallback(async () => {
    if (!rezeptId) return;
    setLaedt(true);
    setFehler(null);
    try {
      const antwort = await generiereWeinprofile([rezeptId]);
      if (!aktivRef.current) return;
      const neu = antwort?.profile?.[rezeptId];
      if (neu) setLokal({ recipeId: rezeptId, profil: neu });
      else setFehler(weinprofilFehlertext(antwort?.fehlerGruende?.[rezeptId]));
    } catch (error) {
      if (aktivRef.current) setFehler(weinprofilFehlertext(error));
    } finally {
      if (aktivRef.current) setLaedt(false);
    }
  }, [rezeptId]);

  const sheetSchliessen = useCallback(() => {
    setSheetOffen(false);
    if (chipRef.current) chipRef.current.focus();
  }, []);

  const neuEinschaetzenAusSheet = useCallback(() => {
    setSheetOffen(false);
    schaetzen();
  }, [schaetzen]);

  if (!recipe) return null;
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
            Gericht wird eingeschätzt …
          </span>
        ) : empfehlung.status === STATUS_OHNE_PROFIL ? (
          <button type="button" className="wein-dazu-chip wein-dazu-chip--leer" onClick={schaetzen}>
            <WeinGlas groesse={20} />
            Passenden Wein finden
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
                <span><span className="wein-dazu-chip-praefix">Wein:</span> {stil.name}</span>
              ) : (
                <span>{TEXT_KEIN_STIL}</span>
              )}
            </button>
            {veraltet && (darfSchaetzen ? (
              <button type="button" className="wein-dazu-link" onClick={schaetzen}>
                Neu einschätzen
              </button>
            ) : (
              <span className="wein-dazu-hinweis">Einschätzung veraltet</span>
            ))}
          </>
        )}
      </div>
      {fehler && <p className="wein-dazu-fehler" role="alert">{fehler}</p>}
      {sheetOffen && (
        <WeinDazuSheet
          icons={icons}
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
