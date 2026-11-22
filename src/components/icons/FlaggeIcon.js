import React from 'react';

/**
 * Flaggen der App-Sprachen als SVG (Sprachwahl im Header). Bewusst keine Emoji-Flaggen:
 * Windows zeigt sie nur als Buchstaben, und Emojis im UI-Code sind ohnehin nicht erlaubt.
 * Englisch zeigt die britische Flagge, passend zum Locale en-GB.
 *
 * Die Grafik füllt ihren Rahmen (preserveAspectRatio slice); Größe, Form und Ring setzt der
 * Aufrufer per CSS. Rein dekorativ: Den Namen der Sprache trägt immer der Text daneben.
 */
const FLAGGEN = {
  de: (
    <svg viewBox="0 0 5 3" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="5" height="3" fill="#ffce00" />
      <rect width="5" height="2" fill="#dd0000" />
      <rect width="5" height="1" fill="#000000" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="60" height="30" fill="#012169" />
      <rect x="-40" y="-3" width="80" height="6" fill="#ffffff" transform="translate(30 15) rotate(26.565)" />
      <rect x="-40" y="-3" width="80" height="6" fill="#ffffff" transform="translate(30 15) rotate(-26.565)" />
      <rect x="-40" y="-1" width="80" height="2" fill="#c8102e" transform="translate(30 15) rotate(26.565)" />
      <rect x="-40" y="-1" width="80" height="2" fill="#c8102e" transform="translate(30 15) rotate(-26.565)" />
      <rect x="25" width="10" height="30" fill="#ffffff" />
      <rect y="10" width="60" height="10" fill="#ffffff" />
      <rect x="27" width="6" height="30" fill="#c8102e" />
      <rect y="12" width="60" height="6" fill="#c8102e" />
    </svg>
  ),
  fr: (
    <svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="3" height="2" fill="#ef4135" />
      <rect width="2" height="2" fill="#ffffff" />
      <rect width="1" height="2" fill="#0055a4" />
    </svg>
  ),
};

/** Für jede Sprache aus src/i18n/sprachen.js gibt es eine Flagge (Test). */
export const FLAGGEN_SPRACHEN = Object.freeze(Object.keys(FLAGGEN));

const FlaggeIcon = ({ sprache, className = '' }) => (
  <span className={`flagge ${className}`.trim()} data-sprache={sprache}>
    {FLAGGEN[sprache] || null}
  </span>
);

export default FlaggeIcon;
