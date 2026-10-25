import React, { useLayoutEffect, useRef, useState } from 'react';
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

function ArrowIcon({ direction }) {
  const rotation = direction === 'up' ? 0 : 90;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

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
 */
function RecipeVersionDescribe({ recipe, onApply, onSkip, onCancel }) {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
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

  const note = error || dictation.error || (isApplying ? 'Wird eingearbeitet …' : dictation.interim);

  return (
    <div className="version-describe-overlay" role="dialog" aria-modal="true" aria-label="Eigene Version erstellen">
      <form className="version-describe" onSubmit={handleSubmit}>
        <div className="version-describe-top">
          <button type="button" className="version-describe-cancel" onClick={onCancel} disabled={isApplying}>
            Abbrechen
          </button>
        </div>
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
            placeholder={`Was war bei „${recipe?.title}“ anders?`}
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
          {hasText ? (
            <button
              type="submit"
              className="version-describe-icon-btn version-describe-submit"
              disabled={!canSubmit}
              aria-label="Änderungen einarbeiten"
              title="Änderungen einarbeiten – danach kannst du alles kontrollieren"
            >
              <ArrowIcon direction="up" />
            </button>
          ) : (
            <button
              type="button"
              className="version-describe-icon-btn version-describe-submit"
              onClick={onSkip}
              disabled={isApplying}
              aria-label="Ohne Beschreibung weiter"
              title="Ohne Beschreibung weiter"
            >
              <ArrowIcon direction="right" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default RecipeVersionDescribe;
