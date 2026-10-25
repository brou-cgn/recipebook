import React from 'react';
import FollowName from './FollowName';
import { describeActorSegments } from '../utils/fuerDichAttribution';

/**
 * Der Satz "Anna hat das gekocht · gestern" mit Namen als Link auf das Profil
 * (Vorhaben Follow). Ohne Freigabe oder ohne Anfrage bleibt der Name Text, siehe FollowName.
 */
function FuerDichAttributionText({ entries, nameOf }) {
  const segments = describeActorSegments(entries, nameOf);
  return segments.map((segment, i) => (segment.userId
    ? <FollowName key={i} userId={segment.userId} name={segment.text} />
    : <React.Fragment key={i}>{segment.text}</React.Fragment>));
}

export default FuerDichAttributionText;
