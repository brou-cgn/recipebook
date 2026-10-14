import React, { useState, useEffect } from 'react';
import './EventplanungPage.css';
import KalibrierungsAuswertung from './KalibrierungsAuswertung';
import { getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

/**
 * Eventplanung: Soll-vs.-Ist-Auswertung des Getraenkeverbrauchs ueber alle
 * abgeschlossenen Events. Die Snapshots sind nur fuer Admins lesbar
 * (firestore.rules), die Seite ist deshalb Admin-only.
 */
function EventplanungPage({ onBack, currentUser }) {
  const [closeIcon, setCloseIcon] = useState(DEFAULT_BUTTON_ICONS.closeButtonDefaultImg);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  useEffect(() => {
    getButtonIcons().then(setAllButtonIcons).catch(() => {});
  }, []);

  useEffect(() => {
    setCloseIcon(
      getEffectiveIcon(allButtonIcons, 'closeButtonDefaultImg', isDarkMode) ||
      getEffectiveIcon(allButtonIcons, 'closeButton', isDarkMode) ||
      DEFAULT_BUTTON_ICONS.closeButtonDefaultImg
    );
  }, [allButtonIcons, isDarkMode]);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  return (
    <div className="eventplanung-container">
      <div className="eventplanung-header">
        <h2>Eventplanung</h2>
        {onBack && (
          <button
            className="app-close-button"
            onClick={onBack}
            aria-label="Eventplanung schließen"
            title="Eventplanung schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Eventplanung schließen" className="app-close-button-icon-img" />
            ) : (
              closeIcon
            )}
          </button>
        )}
      </div>
      <div className="eventplanung-content">
        {currentUser?.isAdmin === true ? (
          <KalibrierungsAuswertung />
        ) : (
          <div className="eventplanung-empty">Dieser Bereich ist nur für Admins verfügbar.</div>
        )}
      </div>
    </div>
  );
}

export default EventplanungPage;
