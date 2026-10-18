import React from 'react';
import './FollowButton.css';
import { useFollow } from '../contexts/FollowContext';

/**
 * Name eines Mitglieds. Ab "angefragt" ein Link auf das Profil (Vorhaben Follow,
 * PR 4b), sonst reiner Text. Ohne Freischaltung oder Profil-Handler immer Text.
 */
function FollowName({ userId, name, className }) {
  const { enabled, statusOf, openProfile } = useFollow();
  if (!enabled || !openProfile || !userId || !statusOf(userId)) {
    return <span className={className}>{name}</span>;
  }
  return (
    <button
      type="button"
      className={`follow-name-link${className ? ` ${className}` : ''}`}
      onClick={(e) => { e.stopPropagation(); openProfile(userId); }}
      aria-label={`Profil von ${name} öffnen`}
    >
      {name}
    </button>
  );
}

export default FollowName;
