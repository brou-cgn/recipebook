import React, { useEffect, useState } from 'react';
import './AtelierOnboardingOverlay.css';

const PADDING = 6;

function AtelierOnboardingOverlay({ onConfirm }) {
  const [spotlightStyle, setSpotlightStyle] = useState(null);
  const [bubbleBottom, setBubbleBottom] = useState(120);

  useEffect(() => {
    const btn = document.querySelector('[aria-label="Atelier"]');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setSpotlightStyle({
        left: rect.left - PADDING,
        top: rect.top - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      });
      setBubbleBottom(window.innerHeight - rect.top + 16);
    }
  }, []);

  return (
    <div className="atelier-onboarding-overlay" role="dialog" aria-modal="true" aria-label="Atelier Onboarding">
      {spotlightStyle && (
        <div
          className="atelier-onboarding-spotlight"
          style={spotlightStyle}
          data-testid="atelier-onboarding-spotlight"
        />
      )}
      <div
        className="atelier-onboarding-bubble"
        style={{ bottom: bubbleBottom }}
        data-testid="atelier-onboarding-bubble"
      >
        <div className="atelier-onboarding-bubble__arrow" />
        <p className="atelier-onboarding-bubble__tag">Dein Kreativraum</p>
        <h2 className="atelier-onboarding-bubble__title">Dein Atelier, dein Kreativraum</h2>
        <p className="atelier-onboarding-bubble__body">
          In <strong>Meine Kochideen</strong> und <strong>Meine Alltagsklassiker</strong> warten
          Rezepte auf dich. Lass dich inspirieren und entdecke, was heute auf den Tisch kommt.
        </p>
        <button
          className="atelier-onboarding-overlay__btn"
          onClick={onConfirm}
          type="button"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

export default AtelierOnboardingOverlay;
