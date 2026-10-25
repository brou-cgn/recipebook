import React, { useState } from 'react';
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

  const trimmed = text.trim();
  const canSubmit = trimmed.length >= 3 && !isApplying;

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

  return (
    <form className="version-describe" onSubmit={handleSubmit}>
      <div className="version-describe-header">
        <h2 className="version-describe-title">Eigene Version erstellen</h2>
      </div>
      <p className="version-describe-intro">
        Beschreibe, was du bei „{recipe?.title}“ anders gemacht hast. Die Änderungen werden
        ins Rezept eingearbeitet, danach kannst du alles noch einmal kontrollieren.
      </p>

      <label className="version-describe-label" htmlFor="version-describe-text">Was war anders?</label>
      <div className="version-describe-field">
        <textarea
          id="version-describe-text"
          className="version-describe-textarea"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="z. B. Ich habe Olivenöl statt Butter genommen und die Pfannkuchen 5 Minuten länger gebacken."
          rows={7}
          disabled={isApplying}
        />
        {dictation.interim && (
          <p className="version-describe-interim" aria-live="polite">{dictation.interim}</p>
        )}
        {dictation.supported && (
          <button
            type="button"
            className={`version-describe-mic${dictation.listening ? ' listening' : ''}`}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={isApplying}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? 'Diktat beenden' : 'Diktat starten'}
            title={dictation.listening ? 'Diktat beenden' : 'Diktat starten'}
          >
            <MicIcon />
            <span>{dictation.listening ? 'Diktat beenden' : 'Diktieren'}</span>
          </button>
        )}
      </div>
      {dictation.error && <p className="version-describe-error" role="alert">{dictation.error}</p>}
      {error && <p className="version-describe-error" role="alert">{error}</p>}

      <div className="version-describe-actions">
        <button type="button" className="version-describe-cancel" onClick={onCancel} disabled={isApplying}>
          Abbrechen
        </button>
        <button type="button" className="version-describe-skip" onClick={onSkip} disabled={isApplying}>
          Ohne Beschreibung weiter
        </button>
        <button type="submit" className="version-describe-submit" disabled={!canSubmit}>
          {isApplying ? 'Wird eingearbeitet …' : 'Änderungen einarbeiten'}
        </button>
      </div>
    </form>
  );
}

export default RecipeVersionDescribe;
