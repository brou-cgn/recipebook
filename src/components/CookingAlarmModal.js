import React from 'react';
import { useTexte } from '../contexts/SpracheContext';
import kochmodusTexte from '../i18n/texte/kochmodus';
import allgemeinTexte from '../i18n/texte/allgemein';
import './CookingAlarmModal.css';

/**
 * Dialog, wenn ein Schritt-Timer abgelaufen ist. Listet alle abgelaufenen Timer mit
 * Rezeptnamen, weil der Alarm auch kommt, wenn das Rezept gerade nicht offen ist
 * (Kochsitzung, siehe src/contexts/CookingSessionContext.js).
 */
function CookingAlarmModal({ alarm, onStop }) {
  const t = useTexte(kochmodusTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  if (!alarm || alarm.items.length === 0) return null;

  return (
    <div className="alarm-modal-overlay">
      <div className="alarm-modal" role="dialog" aria-modal="true" aria-labelledby="alarm-modal-title">
        <h2 className="alarm-modal-title" id="alarm-modal-title">{t('timerAbgelaufenTitel')}</h2>
        {alarm.items.map((item, index) => (
          <div className="alarm-modal-item" key={index}>
            {item.recipeTitle && <p className="alarm-modal-recipe">{item.recipeTitle}</p>}
            <p className="alarm-modal-label">{item.label}</p>
          </div>
        ))}
        <button className="alarm-modal-stop-btn" onClick={onStop}>
          {tAllgemein('ok')}
        </button>
      </div>
    </div>
  );
}

export default CookingAlarmModal;
