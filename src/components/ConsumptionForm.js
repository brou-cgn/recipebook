import React, { useState } from 'react';
import './EventsPage.css';
import { submitConsumption } from '../utils/eventsFirestore';
import { CATEGORY_LABELS } from './EventForm';

function ConsumptionForm({ event, onDone, onCancel }) {
  const kategorien = (event.berechnung?.ergebnis || []).filter((row) => row.gebindeGroesseLiter);
  const [values, setValues] = useState(() => {
    const initial = {};
    kategorien.forEach((row) => {
      initial[row.kategorie] = { eingekauft: '', uebrig: '' };
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [changes, setChanges] = useState(null);

  const updateValue = (kategorie, field, value) => {
    setValues((prev) => ({
      ...prev,
      [kategorie]: { ...prev[kategorie], [field]: value },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const gebinde = {};
      Object.entries(values).forEach(([kategorie, { eingekauft, uebrig }]) => {
        gebinde[kategorie] = {
          eingekauft: Number(eingekauft) || 0,
          uebrig: Number(uebrig) || 0,
        };
      });
      const result = await submitConsumption(event.id, gebinde);
      setChanges(result.changes || []);
    } catch (err) {
      console.error('Error submitting consumption:', err);
      setError('Der Verbrauch konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  if (changes) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>Verbrauch gespeichert</h2>
        </div>
        <div className="events-result-card">
          <p className="events-info-text">
            Danke! Die Kalkulation wird für zukünftige Events genauer.
          </p>
          {changes.length === 0 ? (
            <p className="events-empty-hint">Keine Rate konnte angepasst werden.</p>
          ) : (
            <ul className="events-changes-list">
              {changes.map((change) => (
                <li key={change.kategorie}>
                  <strong>{CATEGORY_LABELS[change.kategorie] || change.kategorie}</strong>
                  {'-Rate angepasst: '}
                  {change.alteRateProErwStunde} → {change.neueRateProErwStunde} L/Person/Std.
                  {' '}(Event Nr. {change.anzahlEventsGesamt})
                </li>
              ))}
            </ul>
          )}
          <div className="events-form-actions">
            <button type="button" className="events-primary-btn" onClick={() => onDone(event.id)}>
              Fertig
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Verbrauch nachtragen</h2>
        <button
          className="events-close-btn"
          onClick={onCancel}
          aria-label="Abbrechen"
          title="Abbrechen"
        >
          ×
        </button>
      </div>
      <p className="events-info-text">
        Wie viele Gebinde wurden für „{event.eventName}" eingekauft, und wie viele sind übrig?
      </p>
      <form className="events-form" onSubmit={handleSubmit}>
        {kategorien.map((row) => (
          <div className="events-form-row" key={row.kategorie}>
            <span className="events-consumption-category-label">
              {CATEGORY_LABELS[row.kategorie] || row.kategorie} ({row.gebinde})
            </span>
            <label className="events-form-field">
              <span>Eingekauft</span>
              <input
                type="number"
                min="0"
                value={values[row.kategorie].eingekauft}
                onChange={(e) => updateValue(row.kategorie, 'eingekauft', e.target.value)}
              />
            </label>
            <label className="events-form-field">
              <span>Übrig</span>
              <input
                type="number"
                min="0"
                value={values[row.kategorie].uebrig}
                onChange={(e) => updateValue(row.kategorie, 'uebrig', e.target.value)}
              />
            </label>
          </div>
        ))}

        {error && <p className="events-error-text">{error}</p>}

        <div className="events-form-actions">
          <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="events-primary-btn" disabled={saving}>
            {saving ? 'Speichere...' : 'Verbrauch speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConsumptionForm;
