import React, { useState } from 'react';
import './EventsPage.css';
import { submitConsumption, savePurchase } from '../utils/eventsFirestore';
import { CATEGORY_LABELS } from './EventForm';

function getEinheitLabel(einheit) {
  if (!einheit) return '';
  const liters = Number(einheit.einheitsgroesse);
  let sizeLabel;
  if (liters < 1) {
    sizeLabel = `${Math.round(liters * 1000)} ml`;
  } else {
    sizeLabel = `${liters.toFixed(1).replace('.', ',')} l`;
  }
  return einheit.gebindeinheit ? `${sizeLabel} (${einheit.gebindeinheit})` : sizeLabel;
}

function getRowLabel(row) {
  if (row.isCustomDrink && row.drinkLabel) {
    const drinkName = row.drinkLabel;
    if (row.kategorie && row.kategorie.includes(':') && Array.isArray(row.einheiten) && row.einheitIdx !== undefined) {
      const einheit = row.einheiten[row.einheitIdx];
      return `${drinkName} (${getEinheitLabel(einheit)})`;
    }
    return drinkName;
  }
  return CATEGORY_LABELS[row.kategorie] || row.kategorie;
}

function ConsumptionForm({ event, onDone, onCancel }) {
  const kategorien = (event.berechnung?.ergebnis || []).filter((row) => row.gebindeGroesseLiter);
  const [values, setValues] = useState(() => {
    const initial = {};
    const existing = event.istVerbrauchEingegeben || {};
    kategorien.forEach((row) => {
      const prev = existing[row.kategorie];
      initial[row.kategorie] = {
        eingekauft: prev?.eingekauft != null ? String(prev.eingekauft) : '',
        uebrig: prev?.uebrig != null ? String(prev.uebrig) : '',
      };
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [savingIntermediate, setSavingIntermediate] = useState(false);
  const [error, setError] = useState('');
  const [savedIntermediate, setSavedIntermediate] = useState(false);
  const [changes, setChanges] = useState(null);

  const updateValue = (kategorie, field, value) => {
    setValues((prev) => ({
      ...prev,
      [kategorie]: { ...prev[kategorie], [field]: value },
    }));
  };

  const buildGebinde = () => {
    const gebinde = {};
    Object.entries(values).forEach(([kategorie, { eingekauft, uebrig }]) => {
      gebinde[kategorie] = {
        eingekauft: Number(eingekauft) || 0,
        uebrig: Number(uebrig) || 0,
      };
    });
    return gebinde;
  };

  const handleSaveIntermediate = async () => {
    setSavingIntermediate(true);
    setError('');
    setSavedIntermediate(false);
    try {
      await savePurchase(event.id, buildGebinde());
      setSavedIntermediate(true);
    } catch (err) {
      console.error('Error saving purchase:', err);
      setError('Zwischenspeichern fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setSavingIntermediate(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await submitConsumption(event.id, buildGebinde());
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
              {getRowLabel(row)} ({row.gebinde})
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
        {savedIntermediate && <p className="events-success-text">Zwischengespeichert.</p>}

        <div className="events-form-actions">
          <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={saving || savingIntermediate}>
            Abbrechen
          </button>
          <button type="button" className="events-secondary-btn" onClick={handleSaveIntermediate} disabled={saving || savingIntermediate}>
            {savingIntermediate ? 'Speichere...' : 'Zwischenspeichern'}
          </button>
          <button type="submit" className="events-primary-btn" disabled={saving || savingIntermediate}>
            {saving ? 'Speichere...' : 'Verbrauch speichern'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConsumptionForm;
