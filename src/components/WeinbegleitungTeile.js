import React, { useId } from 'react';
import { getRegel, quellenFuerRegel } from '../utils/weinbegleitung/wissensbasis';
import './WeinbegleitungTeile.css';

/**
 * Gemeinsame Bausteine der Weinbegleitung für Rezeptansicht (WeinDazu) und Menü
 * (Weinbegleitung): Glas in der Weinfarbe, Gründe mit Quellenlinks. Eigenes Stylesheet,
 * weil beide Ansichten in getrennten Chunks laden (cssChunkIsolation.test.js).
 */

// useId liefert je nach React-Version Zeichen wie „:“ oder „«“, die in url(#…) nicht gehen.
export const sichereId = (praefix, id) => `${praefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

/**
 * Weinglas als Inline-SVG. Mit `farbe` gefüllt (weiss, rose, rot, suess), mit `laedt`
 * füllt es sich animiert (ohne Animation bei „Bewegung reduzieren“), sonst leer.
 */
export function WeinGlas({ farbe = null, groesse = 20, laedt = false }) {
  const clipId = sichereId('wein-glas', useId());
  return (
    <svg
      className={`wein-glas${laedt ? ' wein-glas--laedt' : ''}`}
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
            className={`wein-glas-fuellung wein-glas-fuellung--${farbe || 'rot'}`}
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

/** Quellenlinks einer Regel (neuer Tab), durch Komma getrennt. */
export function Quellen({ regelId }) {
  const quellen = quellenFuerRegel(regelId);
  if (quellen.length === 0) return null;
  return (
    <span className="wein-quellen">
      {quellen.map((quelle, index) => (
        <React.Fragment key={quelle.id}>
          {index > 0 && ', '}
          <a
            href={quelle.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Quelle: ${quelle.titel} (${quelle.herausgeber})`}
          >
            {quelle.herausgeber}
          </a>
        </React.Fragment>
      ))}
    </span>
  );
}

/** „Warum passt das?“: Kurztexte der Regeln mit ihren Quellen. */
export function Gruende({ regelIds }) {
  return (
    <ul className="wein-gruende">
      {(regelIds || []).map((regelId) => {
        const regel = getRegel(regelId);
        if (!regel) return null;
        return (
          <li key={regelId}>
            {regel.kurztext} <Quellen regelId={regelId} />
          </li>
        );
      })}
    </ul>
  );
}
