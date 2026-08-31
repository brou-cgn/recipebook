import React from 'react';
import './GuestLinkConflictDialog.css';

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
  return (
    <div className="guest-link-conflict-overlay" onClick={onCancel}>
      <div className="guest-link-conflict-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guest-link-conflict-header">
          <h2 className="guest-link-conflict-title">Gästelisten zusammenführen</h2>
          <button className="guest-link-conflict-close" onClick={onCancel} aria-label="Schließen">×</button>
        </div>
        <div className="guest-link-conflict-body">
          <p>
            Du hast an Event und Menü bereits Gäste erfasst
            {typeof eventGuestCount === 'number' && typeof menuGuestCount === 'number'
              ? ` (Event: ${eventGuestCount}, Menü: ${menuGuestCount})`
              : ''}
            , welche möchtest du übernehmen?
          </p>
          <div className="guest-link-conflict-options">
            <button
              type="button"
              className="guest-link-conflict-option-btn"
              onClick={() => onChoose('event')}
            >
              Gäste vom Event
            </button>
            <button
              type="button"
              className="guest-link-conflict-option-btn"
              onClick={() => onChoose('menu')}
            >
              Gäste vom Menü
            </button>
            <button
              type="button"
              className="guest-link-conflict-option-btn"
              onClick={() => onChoose('all')}
            >
              Alle Gäste
            </button>
          </div>
        </div>
        <div className="guest-link-conflict-footer">
          <button type="button" className="guest-link-conflict-cancel-btn" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

export default GuestLinkConflictDialog;
