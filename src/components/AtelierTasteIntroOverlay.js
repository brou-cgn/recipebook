import React, { useEffect, useState } from 'react';
import './AtelierTasteIntroOverlay.css';

const PADDING = 6;

function AtelierTasteIntroOverlay({ onContinue }) {
  const [phase, setPhase] = useState('taste'); // 'taste' | 'bite'
  const [spotlightStyle, setSpotlightStyle] = useState(null);

  useEffect(() => {
    if (phase !== 'bite') return;
    const btn = document.querySelector('[aria-label="Suche"]');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setSpotlightStyle({
        left: rect.left - PADDING,
        top: rect.top - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      });
    }
  }, [phase]);

  return (
    <div className="atelier-taste-intro-overlay" role="dialog" aria-modal="true" aria-label="Onboarding: Nach dem Kochen">
      {phase === 'taste' && <div className="atelier-taste-intro-overlay__scrim" />}
      {phase === 'bite' && spotlightStyle && (
        <div
          className="atelier-taste-intro-overlay__spotlight"
          style={spotlightStyle}
          data-testid="atelier-taste-intro-spotlight"
        />
      )}

      {phase === 'taste' ? (
        <div className="atelier-taste-intro-card" data-testid="atelier-taste-intro-card-taste">
          <p className="atelier-taste-intro-card__tag">Let&apos;s Taste</p>
          <h2 className="atelier-taste-intro-card__title">7 Tage, 6 Rezepte</h2>
          <p
            className="atelier-taste-intro-card__body atelier-taste-intro-card__body--tappable"
            onClick={() => setPhase('bite')}
          >
            Weniger ist mehr – das Atelier-Grid zeigt dir maximal 6 Rezepte. Kein Scrollen durch
            deine Merklisten, keine Kochbücher durchblättern, du behältst auch hier immer den
            Überblick.
          </p>
        </div>
      ) : (
        <div className="atelier-taste-intro-card" data-testid="atelier-taste-intro-card-bite">
          <p className="atelier-taste-intro-card__tag">The Final Bite</p>
          <h2 className="atelier-taste-intro-card__title">Ein Rezept, dein Urteil</h2>
          <p className="atelier-taste-intro-card__body">
            Du hast gekocht, probiert, vielleicht sogar den Teller abgeleckt?! Jetzt fehlt nur
            noch deine Bewertung – sie entscheidet, ob das Rezept wieder auf deinem Tisch landet.
          </p>
        </div>
      )}

      <button
        className="atelier-taste-intro-overlay__btn"
        onClick={onContinue}
        type="button"
      >
        Weiter: Nach dem Kochen
      </button>
    </div>
  );
}

export default AtelierTasteIntroOverlay;
