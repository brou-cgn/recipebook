import React, { useRef } from 'react';
import './AuswahlGruppe.css';

const VOR = ['ArrowRight', 'ArrowDown'];
const ZURUECK = ['ArrowLeft', 'ArrowUp'];

/**
 * Feste Auswahl direkt in einer Einstellungszeile, ohne eigene Unterseite (Profilseite,
 * Variante B des Designvorschlags https://claude.ai/artifact/5S6yBvMf7j4JvfHLCzwQU2).
 *
 * Technisch eine Radiogruppe: Tab springt auf die gewählte Option, die Pfeiltasten wechseln
 * und wählen (wie bei nativen Radioknöpfen), Pos1/Ende springen an den Rand.
 *
 * - darstellung="segmente": Felder nebeneinander in einer Spur (Erscheinungsbild, Sprache).
 *   Für wenige, kurze Optionen.
 * - darstellung="liste": Zeilen untereinander mit Haken (Alarmton). Für mehr Optionen.
 *
 * `onWaehlen` kommt auch beim Tipp auf die schon gewählte Option: Der Alarmton spielt so noch
 * einmal an. Wer dabei nichts tun soll, prüft den Wert selbst.
 *
 * optionen: [{ wert, label, lang? }]; `lang` setzt die Sprache des Labels (Sprachnamen stehen
 * in ihrer eigenen Sprache).
 */
export default function AuswahlGruppe({
  optionen,
  wert,
  onWaehlen,
  darstellung = 'segmente',
  disabled = false,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}) {
  const knoepfe = useRef([]);
  const gewaehlterIndex = optionen.findIndex((option) => option.wert === wert);
  const tabIndex = gewaehlterIndex >= 0 ? gewaehlterIndex : 0;

  const handleKeyDown = (event, index) => {
    let ziel = null;
    if (VOR.includes(event.key)) ziel = (index + 1) % optionen.length;
    else if (ZURUECK.includes(event.key)) ziel = (index - 1 + optionen.length) % optionen.length;
    else if (event.key === 'Home') ziel = 0;
    else if (event.key === 'End') ziel = optionen.length - 1;
    if (ziel === null) return;
    event.preventDefault();
    knoepfe.current[ziel]?.focus();
    onWaehlen(optionen[ziel].wert);
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-disabled={disabled || undefined}
      className={`auswahl-gruppe auswahl-gruppe--${darstellung}`}
    >
      {optionen.map((option, index) => {
        const gewaehlt = option.wert === wert;
        return (
          <button
            key={option.wert}
            ref={(element) => { knoepfe.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={gewaehlt}
            tabIndex={index === tabIndex ? 0 : -1}
            lang={option.lang}
            disabled={disabled}
            className={`auswahl-gruppe__option${gewaehlt ? ' auswahl-gruppe__option--gewaehlt' : ''}`}
            onClick={() => onWaehlen(option.wert)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {darstellung === 'liste' && (
              <span className="auswahl-gruppe__haken" aria-hidden="true">
                {gewaehlt && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
            )}
            <span className="auswahl-gruppe__text">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
