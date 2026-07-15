import React, { useState } from 'react';
import './EventsPage.css';
import { EVENT_CATEGORIES, EVENT_TYPES, deriveSeason, calculateEventDrinks } from '../utils/eventsFirestore';

const CATEGORY_LABELS = {
  wasser: 'Wasser',
  softdrinks: 'Softdrinks',
  saft: 'Saft',
  bier: 'Bier',
  wein: 'Wein',
  sekt: 'Sekt',
  spirituosen: 'Spirituosen',
  kaffee: 'Kaffee',
  tee: 'Tee',
};

const EVENT_TYPE_LABELS = {
  familienfeier: 'Familienfeier',
  party: 'Party',
  kaffeeundkuchen: 'Kaffee & Kuchen',
  grillfest: 'Grillfest',
  sportuebertragung: 'Sportübertragung',
};

const DEFAULT_PUFFER_PROZENT = 12;

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

function EventForm({ onSaved, onCancel }) {
  const [eventName, setEventName] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [durationHours, setDurationHours] = useState(4);
  const [adults, setAdults] = useState(10);
  const [children, setChildren] = useState(0);
  const [eventType, setEventType] = useState('familienfeier');
  const [categories, setCategories] = useState(['wasser', 'softdrinks', 'bier', 'wein']);
  const [pufferProzent, setPufferProzent] = useState(DEFAULT_PUFFER_PROZENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleCategory = (cat) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventName.trim() || !date || !durationHours || categories.length === 0) {
      setError('Bitte Name, Datum, Dauer und mindestens eine Getränkekategorie angeben.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const event = {
        eventName: eventName.trim(),
        date,
        durationHours: Number(durationHours),
        guests: { adults: Number(adults) || 0, children: Number(children) || 0 },
        season: deriveSeason(date),
        eventType,
        categories,
        pufferProzent: Number(pufferProzent),
      };
      const result = await calculateEventDrinks(event);
      onSaved(result.eventId);
    } catch (err) {
      console.error('Error calculating event drinks:', err);
      setError('Die Berechnung ist fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Neues Event</h2>
        <button
          className="events-close-btn"
          onClick={onCancel}
          aria-label="Abbrechen"
          title="Abbrechen"
        >
          ×
        </button>
      </div>
      <form className="events-form" onSubmit={handleSubmit}>
        <label className="events-form-field">
          <span>Name</span>
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="z. B. Sommerfest im Garten"
            required
          />
        </label>

        <div className="events-form-row">
          <label className="events-form-field">
            <span>Datum</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="events-form-field">
            <span>Dauer (Stunden)</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="events-form-row">
          <label className="events-form-field">
            <span>Erwachsene</span>
            <input
              type="number"
              min="0"
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
            />
          </label>
          <label className="events-form-field">
            <span>Kinder</span>
            <input
              type="number"
              min="0"
              value={children}
              onChange={(e) => setChildren(e.target.value)}
            />
          </label>
        </div>

        <label className="events-form-field">
          <span>Anlass</span>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>

        <div className="events-form-field">
          <span>Getränkekategorien</span>
          <div className="events-category-grid">
            {EVENT_CATEGORIES.map((cat) => (
              <label key={cat} className="events-category-checkbox">
                <input
                  type="checkbox"
                  checked={categories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                />
                <span>{CATEGORY_LABELS[cat]}</span>
              </label>
            ))}
          </div>
        </div>

        <label className="events-form-field">
          <span>Puffer (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            value={pufferProzent}
            onChange={(e) => setPufferProzent(e.target.value)}
          />
        </label>

        {error && <p className="events-error-text">{error}</p>}

        <div className="events-form-actions">
          <button type="button" className="events-secondary-btn" onClick={onCancel} disabled={saving}>
            Abbrechen
          </button>
          <button type="submit" className="events-primary-btn" disabled={saving}>
            {saving ? 'Berechne...' : 'Einkaufsliste berechnen'}
          </button>
        </div>
      </form>
    </div>
  );
}

export { CATEGORY_LABELS, EVENT_TYPE_LABELS };
export default EventForm;
