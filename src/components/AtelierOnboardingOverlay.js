import React, { useEffect, useState } from 'react';
import './AtelierOnboardingOverlay.css';
import { useTexte } from '../contexts/SpracheContext';
import Button from './Button';
import atelierTexte from '../i18n/texte/atelier';
import startseiteTexte from '../i18n/texte/startseite';
import allgemeinTexte from '../i18n/texte/allgemein';

const PADDING = 6;
const ARROW_LEFT_MIN = 0;
const ARROW_LEFT_MAX = 100;
export const BUBBLE_HORIZONTAL_INSET = 16;

function AtelierOnboardingOverlay({ onConfirm }) {
  const [spotlightStyle, setSpotlightStyle] = useState(null);
  const [bubbleBottom, setBubbleBottom] = useState(120);
  const [arrowLeft, setArrowLeft] = useState('50%');
  // Texte des Ateliers (Mehrsprachigkeit PR 6n); die Namen der Listen aus startseite.js
  const t = useTexte(atelierTexte);
  const tStart = useTexte(startseiteTexte);
  const tAllgemein = useTexte(allgemeinTexte);

  useEffect(() => {
    // Über den Schlüssel des Tabs, nicht über seinen (übersetzten) Namen
    const btn = document.querySelector('[data-nav-key="atelier"]');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const buttonCenterX = rect.left + rect.width / 2;
      const bubbleWidth = window.innerWidth - BUBBLE_HORIZONTAL_INSET * 2;
      const relativeArrowLeft = ((buttonCenterX - BUBBLE_HORIZONTAL_INSET) / bubbleWidth) * 100;
      const clampedArrowLeft = Math.min(
        Math.max(relativeArrowLeft, ARROW_LEFT_MIN),
        ARROW_LEFT_MAX,
      );

      setSpotlightStyle({
        left: rect.left - PADDING,
        top: rect.top - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      });
      setBubbleBottom(window.innerHeight - rect.top + 16);
      setArrowLeft(`${clampedArrowLeft}%`);
    }
  }, []);

  return (
    <div className="atelier-onboarding-overlay" role="dialog" aria-modal="true" aria-label={t('onboardingName')}>
      {spotlightStyle && (
        <div
          className="atelier-onboarding-spotlight"
          style={spotlightStyle}
          data-testid="atelier-onboarding-spotlight"
        />
      )}
      <div
        className="atelier-onboarding-bubble"
        style={{ bottom: bubbleBottom, '--arrow-left': arrowLeft }}
        data-testid="atelier-onboarding-bubble"
      >
        <div className="atelier-onboarding-bubble__arrow" />
        <p className="atelier-onboarding-bubble__tag">{t('kreativraum')}</p>
        <h2 className="atelier-onboarding-bubble__title">{t('kreativraumTitel')}</h2>
        <p className="atelier-onboarding-bubble__body">
          {t('kreativraumText', {
            kochideen: <strong key="kochideen">{tStart('meineKochideen')}</strong>,
            alltagsklassiker: <strong key="alltagsklassiker">{tStart('meineAlltagsklassiker')}</strong>,
          })}
        </p>
        <Button variant="primary" fullWidth onClick={onConfirm}>
          {tAllgemein('weiter')}
        </Button>
      </div>
    </div>
  );
}

export default AtelierOnboardingOverlay;
