import React from 'react';
import './FollowButton.css';
import { useFollow } from '../contexts/FollowContext';
import { defaultIcon } from '../utils/defaultButtonIcons';
import { isBase64Image } from '../utils/imageUtils';

/**
 * Folgen-Button (Rezeptdetail, Kochtagebuch).
 * Erscheint nur, wenn Follow für den Nutzer freigeschaltet ist, die Person nicht
 * er selbst ist und noch keine Anfrage besteht. Ab "angefragt" verschwindet der
 * Button (der Name wird mit dem Profil zum Link, PR 4b).
 *
 * variant "tile":  quadratische Kachel in der Aktionsleiste des Rezeptdetails.
 * variant "round": runder Button in der Zeile des Kochtagebuchs.
 * icon: Wert aus den Button-Icons (Schlüssel `followButton`); ohne Angabe das Standard-Symbol.
 */
function FollowButton({ userId, name, variant = 'tile', icon }) {
  const { enabled, userId: me, statusOf, request } = useFollow();
  if (!enabled || !userId || userId === me || statusOf(userId)) return null;
  const label = `${name} folgen`;
  const iconValue = icon || defaultIcon('follow');
  return (
    <button
      type="button"
      className={`follow-button follow-button--${variant}`}
      onClick={(e) => { e.stopPropagation(); request(userId, name); }}
      aria-label={label}
      title={label}
    >
      {isBase64Image(iconValue) ? (
        <img src={iconValue} alt="" className="follow-button-icon-img" draggable="false" />
      ) : (
        <span className="follow-button-icon-text">{iconValue}</span>
      )}
    </button>
  );
}

export default FollowButton;
