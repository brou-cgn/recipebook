import React from 'react';

/**
 * Fahnen der App-Sprachen als Umriss (Sprachwahl im Header): nur Linien, keine Farbflächen,
 * gewählt am 22.11.2026 (Canvas „Sprachwahl im Header“, Reihe „Fahnen als Umriss“). Bewusst
 * keine Emoji-Flaggen: Windows zeigt sie nur als Buchstaben, und Emojis im UI-Code sind ohnehin
 * nicht erlaubt. Englisch zeigt die britische Fahne, passend zum Locale en-GB.
 *
 * Alle drei im Rahmen 45 x 30 (3 : 2). Die britische Fahne ist mittig aus der amtlichen Geometrie
 * 60 x 30 geschnitten und für kleine Größen vereinfacht: das Kreuz mit seinem weißen Rand und die
 * Ränder der weißen Diagonalen, ohne die versetzten roten Streifen. Die Detailfassung wie in einer
 * Malvorlage läuft unter etwa 30 px Breite zusammen.
 *
 * Linienfarbe und -stärke setzt SprachWahl.css (.flagge); die Grafik füllt ihren Rahmen. Rein
 * dekorativ: Den Namen der Sprache trägt immer der Text daneben.
 */
export const FLAGGEN_LINIEN = Object.freeze({
  de: 'M0 10H45M0 20H45',
  en: 'M27.5 0V10H45M45 20H27.5V30M17.5 30V20H0M0 10H17.5V0'
    + 'M17.5 9.15L0 0.4M5.79 10L0 7.1M39.21 10L45 7.1M27.5 9.15L45 0.4'
    + 'M27.5 20.85L45 29.6M39.21 20L45 22.9M5.79 20L0 22.9M17.5 20.85L0 29.6',
  fr: 'M15 0V30M30 0V30',
});

/** Für jede Sprache aus src/i18n/sprachen.js gibt es eine Fahne (Test). */
export const FLAGGEN_SPRACHEN = Object.freeze(Object.keys(FLAGGEN_LINIEN));

const FlaggeIcon = ({ sprache, className = '' }) => (
  <span className={`flagge ${className}`.trim()} data-sprache={sprache}>
    {FLAGGEN_LINIEN[sprache] && (
      <svg viewBox="0 0 45 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect width="45" height="30" />
        <path d={FLAGGEN_LINIEN[sprache]} />
      </svg>
    )}
  </span>
);

export default FlaggeIcon;
