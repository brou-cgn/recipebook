import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useSpeechDictation from '../hooks/useSpeechDictation';
import { useTexte } from '../contexts/SpracheContext';
import { findeText } from '../i18n/texte';
import rezeptansichtTexte, { VERSION_MELDUNGEN } from '../i18n/texte/rezeptansicht';
import diktatTexte from '../i18n/texte/diktat';
import './RecipeVersionDescribe.css';

const MAX_LENGTH = 2000;

/**
 * Meldung beim Einarbeiten in der geltenden Sprache (Mehrsprachigkeit PR 6o): bekannte deutsche
 * Meldungen der Cloud Function über ihren Schlüssel, andere so, wie sie kommen, ohne Meldung der
 * eigene Ersatztext.
 * @param {string} meldung - message des Fehlers aus onApply
 * @param {Function} t - Übersetzungsfunktion für rezeptansicht.js
 */
function versionFehlerText(meldung, t) {
  if (!meldung) return t('versionFehler');
  const treffer = findeText(rezeptansichtTexte, meldung, VERSION_MELDUNGEN);
  return treffer ? t(treffer.schluessel, treffer.werte) : meldung;
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

// Gleiche Schwellen wie RecipeDetail: bis dahin zeigt das Rezept den runden
// "Eigene Version erstellen"-Button (FAB), der hier zugleich "Weiter" ist.
const TABLET_BREAKPOINT = 768;
const MOBILE_BREAKPOINT = 480;
const hasVersionFab = () => window.innerWidth <= TABLET_BREAKPOINT || window.innerHeight <= MOBILE_BREAKPOINT;

/**
 * Vorschritt von "Eigene Version erstellen" (Berechtigung versionDictation):
 * Die Abwandlung wird frei beschrieben (getippt oder diktiert); danach arbeitet
 * die KI sie ins Rezept ein und das Formular öffnet sich zur Kontrolle.
 *
 * @param {Object} props
 * @param {Object} props.recipe - das Rezept, von dem die Version abgeleitet wird
 * @param {(description: string) => Promise<void>} props.onApply - wirft bei Fehlern
 * @param {Function} props.onSkip - Formular ohne Beschreibung öffnen
 * @param {Function} props.onCancel
 * @param {(hasText: boolean) => void} [props.onHasTextChange] - meldet, ob schon Text erfasst ist
 * @param {{current: ?Function}} [props.continueRef] - bekommt die Weiter-Aktion
 *   (ohne Text: onSkip, mit Text: einarbeiten) für den Versionsbutton des Rezepts
 */
function RecipeVersionDescribe({ recipe, onApply, onSkip, onCancel, continueRef, onHasTextChange }) {
  const [text, setText] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  // Fehler beim Einarbeiten: { meldung } wie geworfen, übersetzt erst bei der Anzeige
  const [error, setError] = useState(null);
  const t = useTexte(rezeptansichtTexte);
  const tDiktat = useTexte(diktatTexte);

  const appendText = (chunk) => {
    setText((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${chunk}`.slice(0, MAX_LENGTH));
  };
  const dictation = useSpeechDictation({ onText: appendText });

  const textareaRef = useRef(null);
  const overlayRef = useRef(null);

  // Rezept dahinter bleibt stehen, solange das Textfeld offen ist. Nativ
  // registriert, weil React touchmove/wheel passiv einhängt (preventDefault
  // wirkte sonst nicht). Das Textfeld selbst darf weiter scrollen.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = overlayRef.current;
    const block = (e) => {
      if (!e.target.closest?.('.version-describe-textarea')) e.preventDefault();
    };
    overlay?.addEventListener('touchmove', block, { passive: false });
    overlay?.addEventListener('wheel', block, { passive: false });
    return () => {
      document.body.style.overflow = prevOverflow;
      overlay?.removeEventListener('touchmove', block);
      overlay?.removeEventListener('wheel', block);
    };
  }, []);

  // Pille wächst mit dem Text (mindestens 2 Zeilen Platz, danach nach Bedarf).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const trimmed = text.trim();
  const hasText = trimmed.length > 0;
  useEffect(() => {
    onHasTextChange?.(hasText);
    return () => onHasTextChange?.(false);
  }, [hasText]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = hasText && !isApplying;

  const [fabVisible, setFabVisible] = useState(hasVersionFab);
  useEffect(() => {
    const onResize = () => setFabVisible(hasVersionFab());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const submit = async () => {
    if (!canSubmit) return;
    dictation.stop();
    setIsApplying(true);
    setError(null);
    try {
      await onApply(trimmed);
    } catch (err) {
      setError({ meldung: err?.message || '' });
      setIsApplying(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  // "Weiter": ohne Beschreibung überspringen, mit Beschreibung einarbeiten.
  const proceed = () => {
    if (isApplying) return;
    if (hasText) submit();
    else onSkip();
  };

  useEffect(() => {
    if (!continueRef) return undefined;
    continueRef.current = proceed;
    return () => { continueRef.current = null; };
  });

  // Klick neben Pille und Hinweiskarte schließt den Vorschritt.
  const handleOverlayClick = (e) => {
    if (isApplying || e.target.closest('.version-describe-pill, .version-describe-note')) return;
    onCancel();
  };

  const errorText = error ? versionFehlerText(error.meldung, t) : '';
  const note = errorText || dictation.error || (isApplying ? t('versionWirdEingearbeitet') : dictation.interim);

  return (
    <div
      ref={overlayRef}
      className="version-describe-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('eigeneVersion')}
      onClick={handleOverlayClick}
      onKeyDown={(e) => { if (e.key === 'Escape' && !isApplying) onCancel(); }}
    >
      <form className={`version-describe${fabVisible ? ' has-fab' : ''}`} onSubmit={handleSubmit}>
        {note && (
          <p
            className={`version-describe-note${errorText || dictation.error ? ' is-error' : ''}`}
            role={errorText || dictation.error ? 'alert' : undefined}
            aria-live="polite"
          >
            {note}
          </p>
        )}

        <div className="version-describe-pill">
          <textarea
            ref={textareaRef}
            id="version-describe-text"
            className="version-describe-textarea"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            aria-label={t('versionWasAnders')}
            placeholder={t('versionPlatzhalter')}
            rows={2}
            disabled={isApplying}
          />
          {dictation.supported && (
            <button
              type="button"
              className={`version-describe-icon-btn version-describe-mic${dictation.listening ? ' listening' : ''}`}
              onClick={dictation.listening ? dictation.stop : dictation.start}
              disabled={isApplying}
              aria-pressed={dictation.listening}
              aria-label={tDiktat(dictation.listening ? 'diktatBeenden' : 'diktatStarten')}
              title={tDiktat(dictation.listening ? 'diktatBeenden' : 'diktatStarten')}
            >
              <MicIcon />
            </button>
          )}
          {!fabVisible && (
            <button
              type="button"
              className="version-describe-continue"
              onClick={proceed}
              disabled={isApplying}
              aria-label={t('versionErstellen')}
              title={t(hasText ? 'versionEinarbeitenTitel' : 'versionOhneBeschreibung')}
            >
              {t('versionErstellen')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default RecipeVersionDescribe;
