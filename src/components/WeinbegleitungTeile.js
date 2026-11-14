import React, { useId } from 'react';
import { getRegel, quellenFuerRegel } from '../utils/weinbegleitung/wissensbasis';
import { weinfarbe } from '../utils/weinbegleitung/anzeige';
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

const istBildQuelle = (wert) => /^(data:image\/|https?:\/\/|\/)/.test(wert);

/**
 * Symbol für einen Stil: das in den Button-Icons hinterlegte Icon für Rot- bzw. Weißwein
 * (`icons` = `{ rot, weiss }` aus `weinRot`/`weinWeiss`), sonst das Glas in der Weinfarbe.
 * Rosé hat kein eigenes Icon und bleibt beim Glas. Bilder (data:, http(s), Pfad) als `<img>`,
 * anderer Text als Zeichen.
 */
export function WeinSymbol({ stil, icons = null, groesse = 20 }) {
  const eigenes = stil?.farbe === 'rot' ? icons?.rot : stil?.farbe === 'weiss' ? icons?.weiss : '';
  if (eigenes) {
    return istBildQuelle(eigenes) ? (
      <img className="wein-symbol-bild" src={eigenes} alt="" width={groesse} height={groesse} />
    ) : (
      <span className="wein-symbol-text" style={{ fontSize: groesse * 0.8 }} aria-hidden="true">{eigenes}</span>
    );
  }
  return <WeinGlas farbe={stil ? weinfarbe(stil) : null} groesse={groesse} />;
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

/**
 * „Warum passt das?“: Kurztexte der Regeln, mit `mitQuellen` samt Quellenlinks
 * (Rezept-Sheet seit 14.11.2026 ohne Quellen).
 */
export function Gruende({ regelIds, mitQuellen = true }) {
  return (
    <ul className="wein-gruende">
      {(regelIds || []).map((regelId) => {
        const regel = getRegel(regelId);
        if (!regel) return null;
        return (
          <li key={regelId}>
            {regel.kurztext}
            {mitQuellen && <> <Quellen regelId={regelId} /></>}
          </li>
        );
      })}
    </ul>
  );
}
