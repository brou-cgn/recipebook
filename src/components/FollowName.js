import React from 'react';
import './FollowButton.css';
import { useFollow } from '../contexts/FollowContext';

/**
 * Name eines Mitglieds. Ab "angefragt" ein Link auf das Profil (Vorhaben Follow,
 * PR 4b), sonst reiner Text. Ohne Freischaltung oder Profil-Handler immer Text.
 * `fromNetwork`: Zeile der Netzwerk-Seite. Dort ist der Name immer ein Link, auch
 * ohne eigene Anfrage (Follower, offene Anfragen), und "Zurück" führt wieder dorthin.
 */
function FollowName({ userId, name, className, fromNetwork = false }) {
  const { enabled, statusOf, openProfile } = useFollow();
  if (!enabled || !openProfile || !userId || !(fromNetwork || statusOf(userId))) {
    return <span className={className}>{name}</span>;
  }
  return (
    <button
      type="button"
      className={`follow-name-link${className ? ` ${className}` : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); if (fromNetwork) openProfile(userId, { fromNetwork: true }); else openProfile(userId); }}
      aria-label={`Profil von ${name} öffnen`}
    >
      {name}
    </button>
  );
}

export default FollowName;
