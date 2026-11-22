import React from 'react';
import './EventplanungPage.css';
import KalibrierungsAuswertung from './KalibrierungsAuswertung';
import { UnterseiteKopf } from './Unterseite';

/**
 * Eventplanung: Soll-vs.-Ist-Auswertung des Getraenkeverbrauchs ueber alle
 * abgeschlossenen Events. Sichtbarkeit ueber die Rollenberechtigung
 * `eventplanung`; dieselbe Berechtigung schaltet in firestore.rules
 * (canSeeEventplanung) den Lesezugriff auf die Snapshots frei.
 */
function EventplanungPage({ onBack, currentUser }) {
  return (
    <div className="eventplanung-container">
      <UnterseiteKopf onZurueck={onBack}>
        <h2>Eventplanung</h2>
      </UnterseiteKopf>
      <div className="eventplanung-content unterseite-karte">
        {currentUser?.eventplanung ? (
          <KalibrierungsAuswertung />
        ) : (
          <div className="eventplanung-empty">Dieser Bereich ist für deine Rolle nicht freigeschaltet.</div>
        )}
      </div>
    </div>
  );
}

export default EventplanungPage;
