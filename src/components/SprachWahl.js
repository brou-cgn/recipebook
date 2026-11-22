import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FlaggeIcon from './icons/FlaggeIcon';
import useModalScrollLock from '../hooks/useModalScrollLock';
import useFadeOutClose from '../hooks/useFadeOutClose';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { SPRACHEN, STANDARD_SPRACHE } from '../i18n/sprachen';
import kopfzeileTexte from '../i18n/texte/kopfzeile';
import allgemeinTexte from '../i18n/texte/allgemein';
import './SprachWahl.css';

/**
 * Sprachwahl im Header (Vorhaben Mehrsprachigkeit, Entscheidung „Sprachwahl im Header“,
 * Entwurf Variante C im Canvas „Sprachwahl im Header“): ein Chip mit Flagge und Kürzel.
 * Auf dem Handy öffnet er ein Bottom Sheet, auf dem Desktop ein Popover.
 *
 * Die Wahl gilt für die laufende Sitzung; die eigene Standardsprache (persönliche Daten) zu
 * wählen hebt die Übersteuerung auf. Solange eine andere Sprache gilt, hat der Chip einen
 * orangen Rand und die Auswahl nennt die Standardsprache. Sichtbar nur mit der Berechtigung
 * sprachwahl; das prüft der Header.
 */

const NAME_IN_UI = { de: 'sprachnameDe', en: 'sprachnameEn', fr: 'sprachnameFr' };
const eigenerName = (id) => SPRACHEN.find((eintrag) => eintrag.id === id)?.name || id;

function Haken({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
    </svg>
  );
}

function SprachZeile({ eintrag, uiSprache, onWaehle, buttonRef }) {
  const nameId = useId();
  const zweitId = useId();
  return (
    <button
      ref={buttonRef}
      type="button"
      lang={eintrag.id}
      className={`sprachwahl-zeile${eintrag.aktiv ? ' sprachwahl-zeile--aktiv' : ''}`}
      aria-pressed={eintrag.aktiv}
      aria-labelledby={nameId}
      aria-describedby={eintrag.zweit ? zweitId : undefined}
      onClick={() => onWaehle(eintrag.id)}
    >
      <FlaggeIcon sprache={eintrag.id} className="sprachwahl-zeile__flagge" />
      <span className="sprachwahl-zeile__text">
        <span className="sprachwahl-zeile__name" id={nameId}>{eintrag.name}</span>
        {eintrag.zweit && (
          <span className="sprachwahl-zeile__zweit" id={zweitId} lang={uiSprache}>{eintrag.zweit}</span>
        )}
      </span>
      {eintrag.aktiv && <Haken className="sprachwahl-zeile__haken" />}
    </button>
  );
}

function SprachSheet({ titel, schliessenText, hinweis, onClose, children }) {
  useModalScrollLock();
  const [closing, close] = useFadeOutClose(onClose);
  const titelId = useId();
  return createPortal(
    <div
      className={`sprachwahl-sheet-root${closing ? ' sprachwahl-sheet-root--closing' : ''}`}
      onKeyDown={(event) => { if (event.key === 'Escape') close(); }}
    >
      <button
        type="button"
        className="sprachwahl-sheet-scrim"
        aria-label={schliessenText}
        tabIndex={-1}
        onClick={close}
      />
      <div className="sprachwahl-sheet" role="dialog" aria-modal="true" aria-labelledby={titelId}>
        <div className="sprachwahl-sheet__griff" aria-hidden="true" />
        <div className="sprachwahl-sheet__kopf">
          <h2 className="sprachwahl-sheet__titel" id={titelId}>{titel}</h2>
          <button type="button" className="sprachwahl-sheet__schliessen" onClick={close} aria-label={schliessenText}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <div className="sprachwahl-liste">{children}</div>
        {hinweis && <p className="sprachwahl-hinweis">{hinweis}</p>}
      </div>
    </div>,
    document.body
  );
}

function SprachWahl({ alsSheet = false, onOffenChange }) {
  const t = useTexte(kopfzeileTexte);
  const tA = useTexte(allgemeinTexte);
  const { sprache, profilSprache, setzeSitzungsSprache } = useSprache();
  const standard = profilSprache || STANDARD_SPRACHE;
  const uebersteuert = sprache !== standard;
  const [offen, setOffen] = useState(false);
  const containerRef = useRef(null);
  const chipRef = useRef(null);
  const aktivRef = useRef(null);
  const popoverTitelId = useId();

  useEffect(() => {
    if (onOffenChange) onOffenChange(offen);
  }, [offen, onOffenChange]);

  const schliessen = useCallback(() => {
    setOffen(false);
    chipRef.current?.focus();
  }, []);

  // Beim Öffnen steht der Fokus auf der geltenden Sprache.
  useEffect(() => {
    if (offen) aktivRef.current?.focus();
  }, [offen, alsSheet]);

  // Popover: ein Klick außerhalb schließt es, ohne den Fokus zu verschieben.
  useEffect(() => {
    if (!offen || alsSheet) return undefined;
    const aussen = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOffen(false);
    };
    document.addEventListener('mousedown', aussen);
    return () => document.removeEventListener('mousedown', aussen);
  }, [offen, alsSheet]);

  const waehle = (id) => {
    setzeSitzungsSprache(id === standard ? null : id);
    schliessen();
  };

  const eintraege = SPRACHEN.map(({ id }) => {
    const zweit = [];
    const nameInUi = t(NAME_IN_UI[id]);
    if (nameInUi !== eigenerName(id)) zweit.push(nameInUi);
    if (id === standard) zweit.push(t('standardsprache'));
    return { id, name: eigenerName(id), zweit: zweit.join(' · '), aktiv: id === sprache };
  });
  const zeilen = eintraege.map((eintrag) => (
    <SprachZeile
      key={eintrag.id}
      eintrag={eintrag}
      uiSprache={sprache}
      onWaehle={waehle}
      buttonRef={eintrag.aktiv ? aktivRef : undefined}
    />
  ));
  const hinweis = uebersteuert ? t('spracheNurSitzung', { sprache: eigenerName(standard) }) : null;
  const chipText = t('spracheWaehlen', { sprache: eigenerName(sprache) });

  return (
    <div className="sprachwahl" ref={containerRef}>
      <button
        ref={chipRef}
        type="button"
        className={`sprachwahl-chip${uebersteuert ? ' sprachwahl-chip--uebersteuert' : ''}`}
        aria-label={chipText}
        title={chipText}
        aria-haspopup={alsSheet ? 'dialog' : 'true'}
        aria-expanded={offen}
        onClick={() => setOffen((wert) => !wert)}
      >
        <span className="sprachwahl-chip__flaeche">
          <FlaggeIcon sprache={sprache} className="sprachwahl-chip__flagge" />
          <span className="sprachwahl-chip__kuerzel" aria-hidden="true">{sprache.toUpperCase()}</span>
          <svg className="sprachwahl-chip__pfeil" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" fill="currentColor" />
          </svg>
        </span>
      </button>

      {offen && alsSheet && (
        <SprachSheet titel={t('sprache')} schliessenText={tA('schliessen')} hinweis={hinweis} onClose={schliessen}>
          {zeilen}
        </SprachSheet>
      )}

      {offen && !alsSheet && (
        <div
          className="sprachwahl-popover"
          role="group"
          aria-labelledby={popoverTitelId}
          onKeyDown={(event) => { if (event.key === 'Escape') schliessen(); }}
        >
          <div className="sprachwahl-popover__titel" id={popoverTitelId}>{t('sprache')}</div>
          <div className="sprachwahl-liste">{zeilen}</div>
          {hinweis && <p className="sprachwahl-hinweis">{hinweis}</p>}
        </div>
      )}
    </div>
  );
}

export default SprachWahl;
