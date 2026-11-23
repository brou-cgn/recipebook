import React, { useEffect, useState } from 'react';
import './AtelierTasteIntroOverlay.css';
import { useTexte } from '../contexts/SpracheContext';
import atelierTexte from '../i18n/texte/atelier';

const PADDING = 6;

function AtelierTasteIntroOverlay({ onContinue }) {
  const [phase, setPhase] = useState('taste'); // 'taste' | 'bite'
  const [spotlightStyle, setSpotlightStyle] = useState(null);
  // Texte des Ateliers (Mehrsprachigkeit PR 6n)
  const t = useTexte(atelierTexte);

  useEffect(() => {
    if (phase !== 'bite') return;
    // Such-Knopf im Header, über data-spotlight statt über seinen (übersetzten) Namen
    const btn = document.querySelector('[data-spotlight="suche"]');
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
    <div className="atelier-taste-intro-overlay" role="dialog" aria-modal="true" aria-label={t('nachDemKochenName')}>
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
          <p className="atelier-taste-intro-card__tag">{t('letsTaste')}</p>
          <h2 className="atelier-taste-intro-card__title">{t('tageRezepte')}</h2>
          <p
            className="atelier-taste-intro-card__body atelier-taste-intro-card__body--tappable"
            onClick={() => setPhase('bite')}
          >
            {t('wenigerIstMehr')}
          </p>
        </div>
      ) : (
        <div className="atelier-taste-intro-card" data-testid="atelier-taste-intro-card-bite">
          <p className="atelier-taste-intro-card__tag">{t('finalBite')}</p>
          <h2 className="atelier-taste-intro-card__title">{t('deinUrteil')}</h2>
          <p className="atelier-taste-intro-card__body">
            {t('bewertungText')}
          </p>
        </div>
      )}

      <button
        className="atelier-taste-intro-overlay__btn"
        onClick={onContinue}
        type="button"
      >
        {t('weiterNachDemKochen')}
      </button>
    </div>
  );
}

export default AtelierTasteIntroOverlay;
