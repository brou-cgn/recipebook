import React from 'react';
import './FollowButton.css';
import { useFollow } from '../contexts/FollowContext';

/**
 * Folgen-Icon neben dem Namen eines Mitglieds (Rezeptdetail, Kochtagebuch).
 * Erscheint nur, wenn Follow für den Nutzer freigeschaltet ist, die Person nicht
 * er selbst ist und noch keine Anfrage besteht. Ab "angefragt" verschwindet das
 * Icon (der Name wird mit dem Profil zum Link, PR 4b).
 */
function FollowButton({ userId, name }) {
  const { enabled, userId: me, statusOf, request } = useFollow();
  if (!enabled || !userId || userId === me || statusOf(userId)) return null;
  const label = `${name} folgen`;
  return (
    <button
      type="button"
      className="follow-button"
      onClick={(e) => { e.stopPropagation(); request(userId, name); }}
      aria-label={label}
      title={label}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 13c.4-2.4 2.2-3.8 4.5-3.8 1.3 0 2.4.4 3.2 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M12 8.5v4M10 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export default FollowButton;
