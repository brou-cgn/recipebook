import React, { useId } from 'react';
import { getRegel, quellenFuerRegel } from '../utils/weinbegleitung/wissensbasis';
import { weinfarbe } from '../utils/weinbegleitung/anzeige';
import { regelText } from '../utils/weinbegleitung/sprache';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import weinTexte from '../i18n/texte/wein';
import './WeinbegleitungTeile.css';

/**
 * Gemeinsame Bausteine der Weinbegleitung für Rezeptansicht (WeinDazu) und Menü
 * (Weinbegleitung): Glas in der Weinfarbe, Gründe mit Quellenlinks. Eigenes Stylesheet,
 * weil beide Ansichten in getrennten Chunks laden (cssChunkIsolation.test.js).
 */

// useId liefert je nach React-Version Zeichen wie „:“ oder „«“, die in url(#…) nicht gehen.
export const sichereId = (praefix, id) => `${praefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

// Form der Ladeanimation (Vorlage des Eigentümers, 170 × 277): Kelch außen und Hohlraum innen.
const LADEN_KELCH = 'M85 0C140 0 170 30 170 92C170 135 135 168 98 176H72C35 168 0 135 0 92C0 30 30 0 85 0Z';
const LADEN_HOHLRAUM = 'M85 158C50 158 18 130 18 92C18 70 20 52 26 36H144C150 52 152 70 152 92C152 130 120 158 85 158Z';

/**
 * Ladezustand der Weinbegleitung: ein Glas, das sich mit einer Welle füllt, kurz voll bleibt und
 * von vorn beginnt. Der Wein liegt hinter dem Glas und ist nur durch die Maske zu sehen (Hohlraum
 * und Kelchöffnung). Quadratische viewBox, damit das Glas denselben Platz belegt wie `WeinGlas`.
 * Bei „Bewegung reduzieren“ steht es halb voll.
 */
function WeinGlasLaden({ groesse }) {
  const id = useId();
  const clipId = sichereId('wein-laden-clip', id);
  const maskeId = sichereId('wein-laden-maske', id);
  return (
    <svg
      className="wein-glas wein-glas--laedt"
      width={groesse}
      height={groesse}
      viewBox="-53.5 0 277 277"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={LADEN_KELCH} />
        </clipPath>
        <mask id={maskeId} maskUnits="userSpaceOnUse" x="0" y="0" width="170" height="277">
          <rect width="170" height="277" fill="#fff" />
          <path d={LADEN_HOHLRAUM} fill="#000" />
          <ellipse cx="85" cy="34" rx="70" ry="18" fill="#fff" />
          <ellipse cx="85" cy="25" rx="46" ry="13.5" fill="#000" />
        </mask>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g className="wein-laden-pegel">
          <path
            className="wein-laden-welle"
            d="M0 8Q21.25 0 42.5 8T85 8T127.5 8T170 8T212.5 8T255 8T297.5 8T340 8V200H0Z"
          />
        </g>
      </g>
      <g className="wein-laden-glas" mask={`url(#${maskeId})`}>
        <path d={LADEN_KELCH} />
        <rect x="74" y="170" width="22" height="60" />
        <ellipse cx="85" cy="249" rx="68" ry="27.5" />
      </g>
    </svg>
  );
}

/**
 * Weinglas als Inline-SVG. Mit `farbe` gefüllt (weiss, rose, rot, suess), sonst leer. Mit `laedt`
 * erscheint stattdessen die Ladeanimation `WeinGlasLaden`.
 */
export function WeinGlas({ farbe = null, groesse = 20, laedt = false }) {
  const clipId = sichereId('wein-glas', useId());
  if (laedt) return <WeinGlasLaden groesse={groesse} />;
  return (
    <svg
      className="wein-glas"
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
      {farbe && (
        <g clipPath={`url(#${clipId})`}>
          <rect
            className={`wein-glas-fuellung wein-glas-fuellung--${farbe}`}
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
 * Symbol für einen Stil: das in den Button-Icons hinterlegte Icon seiner Weinfarbe (`icons` =
 * `{ rot, weiss, rose, suess, keinStil }`, siehe `weinIconsAus` in anzeige.js), sonst das Glas in der
 * Weinfarbe. Süßweine nehmen `icons.suess`, auch wenn sie weiß oder rot sind (Tokaji, Portwein).
 * Ohne Stil („Hier lieber Bier oder Wasser“) gilt `icons.keinStil`, sonst das leere Glas.
 * Bilder (data:, http(s), Pfad) als `<img>`,
 * anderer Text als Zeichen.
 */
export function WeinSymbol({ stil, icons = null, groesse = 20 }) {
  const art = stil ? weinfarbe(stil) : 'keinStil';
  const eigenes = icons?.[art];
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
  const t = useTexte(weinTexte);
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
            aria-label={t('quelle', { titel: quelle.titel, herausgeber: quelle.herausgeber })}
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
  // Kurztexte in der geltenden Sprache (Mehrsprachigkeit PR 6c)
  const { sprache } = useSprache();
  return (
    <ul className="wein-gruende">
      {(regelIds || []).map((regelId) => {
        const regel = getRegel(regelId);
        if (!regel) return null;
        return (
          <li key={regelId}>
            {regelText(regel, sprache)}
            {mitQuellen && <> <Quellen regelId={regelId} /></>}
          </li>
        );
      })}
    </ul>
  );
}
