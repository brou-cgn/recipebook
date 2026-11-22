import React, { useEffect, useRef } from 'react';
import './Unterseite.css';
import { useTexte } from '../contexts/SpracheContext';
import bereicheTexte from '../i18n/texte/bereiche';

/**
 * Kopf der Unterseiten von „Chefkoch & mehr“ (Variante A des Designvorschlags,
 * https://claude.ai/artifact/5S6yBvMf7j4JvfHLCzwQU2, „A · Meine Küchenstars“): oben links der
 * Weg zurück als Link-Knopf (statt des Schließen-Symbols), darunter die Titelzeile mit Platz für
 * Aktionen rechts.
 *
 * Titel und Texte kommen als JSX-Kinder (`<h2>…</h2>`), nicht als Text-Props: So zählt
 * src/i18nPolicy.test.js noch nicht übersetzte Texte weiter mit. Ohne `zurueckText` heißt der
 * Link „Chefkoch & mehr“ (bereiche.js).
 */
export function UnterseiteKopf({ onZurueck, zurueckText, aktionen, children }) {
  const tB = useTexte(bereicheTexte);
  const zurueckRef = useRef(null);

  // Auf dem iPhone landet der Fokus nach dem Seitenwechsel sonst auf dem Knopf unter dem Finger
  // und bleibt hervorgehoben (wie zuvor beim Schließen-Knopf der Seiten).
  useEffect(() => {
    zurueckRef.current?.blur();
  }, []);

  return (
    <header className="unterseite-kopf">
      {onZurueck && (
        <button ref={zurueckRef} type="button" className="unterseite-kopf__zurueck" onClick={onZurueck}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {zurueckText || tB('chefkochUndMehr')}
        </button>
      )}
      <div className="unterseite-kopf__zeile">
        <div className="unterseite-kopf__titel">{children}</div>
        {aktionen && <div className="unterseite-kopf__aktionen">{aktionen}</div>}
      </div>
    </header>
  );
}

/** Kachel mit großer Zahl und Bezeichnung darunter. */
export function Kennzahl({ wert, label }) {
  return (
    <div className="unterseite-kennzahl">
      <strong>{wert}</strong>
      <span className="unterseite-kennzahl__label">{label}</span>
    </div>
  );
}
