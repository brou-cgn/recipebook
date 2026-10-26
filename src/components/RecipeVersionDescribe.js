import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useSpeechDictation from '../hooks/useSpeechDictation';
import './RecipeVersionDescribe.css';

const MAX_LENGTH = 2000;

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
 * @param {{current: ?Function}} [props.continueRef] - bekommt die Weiter-Aktion
 *   (ohne Text: onSkip, mit Text: einarbeiten) für den Versionsbutton des Rezepts
 */
function RecipeVersionDescribe({ recipe, onApply, onSkip, onCancel, continueRef }) {
  const [text, setText] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  const appendText = (chunk) => {
    setText((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${chunk}`.slice(0, MAX_LENGTH));
  };
  const dictation = useSpeechDictation({ onText: appendText });

  const textareaRef = useRef(null);

  // Pille wächst mit dem Text (mindestens 2 Zeilen Platz, danach nach Bedarf).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const trimmed = text.trim();
  const hasText = trimmed.length > 0;
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
    setError('');
    try {
      await onApply(trimmed);
    } catch (err) {
      setError(err?.message || 'Die Änderungen konnten nicht eingearbeitet werden.');
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

  const note = error || dictation.error || (isApplying ? 'Wird eingearbeitet …' : dictation.interim);

  return (
    <div
      className="version-describe-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Eigene Version erstellen"
      onClick={handleOverlayClick}
      onKeyDown={(e) => { if (e.key === 'Escape' && !isApplying) onCancel(); }}
    >
      <form className={`version-describe${fabVisible ? ' has-fab' : ''}`} onSubmit={handleSubmit}>
        {note && (
          <p
            className={`version-describe-note${error || dictation.error ? ' is-error' : ''}`}
            role={error || dictation.error ? 'alert' : undefined}
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
            aria-label="Was war anders?"
            placeholder="Was hast du anders gemacht?"
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
              aria-label={dictation.listening ? 'Diktat beenden' : 'Diktat starten'}
              title={dictation.listening ? 'Diktat beenden' : 'Diktat starten'}
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
              aria-label="Version erstellen"
              title={hasText ? 'Änderungen einarbeiten – danach kannst du alles kontrollieren' : 'Ohne Beschreibung weiter'}
            >
              Version erstellen
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default RecipeVersionDescribe;
