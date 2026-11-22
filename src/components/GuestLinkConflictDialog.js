import React from 'react';
import './GuestLinkConflictDialog.css';
import Button from './Button';
import { useTexte } from '../contexts/SpracheContext';
import festtafelTexte from '../i18n/texte/festtafel';
import allgemeinTexte from '../i18n/texte/allgemein';

/**
 * Shown when linking a menu to an existing event and BOTH already have their
 * own guest list, so linking can't just adopt "whichever side has guests"
 * (see MenuForm's handleLinkEvent). Lets the user pick which list wins.
 *
 * @param {Object} props
 * @param {number} props.eventGuestCount
 * @param {number} props.menuGuestCount
 * @param {Function} props.onChoose - Called with 'event' | 'menu' | 'all'
 * @param {Function} props.onCancel
 */
function GuestLinkConflictDialog({ eventGuestCount, menuGuestCount, onChoose, onCancel }) {
  // Texte der Festtafel (Mehrsprachigkeit PR 6g)
  const t = useTexte(festtafelTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const mitAnzahl = typeof eventGuestCount === 'number' && typeof menuGuestCount === 'number';
  return (
    <div className="guest-link-conflict-overlay" onClick={onCancel}>
      <div className="guest-link-conflict-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guest-link-conflict-header">
          <h2 className="guest-link-conflict-title">{t('konfliktTitel')}</h2>
          <button className="guest-link-conflict-close" onClick={onCancel} aria-label={tAllgemein('schliessen')}>×</button>
        </div>
        <div className="guest-link-conflict-body">
          <p>
            {mitAnzahl
              ? t('konfliktFrageAnzahl', { event: eventGuestCount, menue: menuGuestCount })
              : t('konfliktFrage')}
          </p>
          <div className="guest-link-conflict-options">
            <Button variant="secondary" fullWidth onClick={() => onChoose('event')}>
              {t('gaesteVomEvent')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => onChoose('menu')}>
              {t('gaesteVomMenue')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => onChoose('all')}>
              {t('alleGaeste')}
            </Button>
          </div>
        </div>
        <div className="guest-link-conflict-footer">
          <Button variant="ghost" onClick={onCancel}>
            {tAllgemein('abbrechen')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default GuestLinkConflictDialog;
