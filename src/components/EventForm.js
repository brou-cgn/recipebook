import React, { useState, useEffect } from 'react';
import './EventsPage.css';
import {
  EVENT_CATEGORIES,
  EVENT_TYPES,
  deriveSeason,
  calculateEventDrinks,
  subscribeToCustomDrinks,
  subscribeToGuestProfiles,
} from '../utils/eventsFirestore';

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

function EventForm({ onSaved, onCancel, currentUser }) {
  const [eventName, setEventName] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [durationHours, setDurationHours] = useState(4);
  const [adults, setAdults] = useState(10);
  const [children, setChildren] = useState(0);
  const [eventType, setEventType] = useState('familienfeier');
  const [categories, setCategories] = useState(['wasser', 'softdrinks', 'bier', 'wein']);
  const [customDrinkIds, setCustomDrinkIds] = useState([]);
  const [pufferProzent, setPufferProzent] = useState(DEFAULT_PUFFER_PROZENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reusable data
  const [guestProfiles, setGuestProfiles] = useState([]);
  const [customDrinks, setCustomDrinks] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubProfiles = subscribeToGuestProfiles(currentUser.id, setGuestProfiles);
    const unsubDrinks = subscribeToCustomDrinks(currentUser.id, setCustomDrinks);
    return () => {
      unsubProfiles();
      unsubDrinks();
    };
  }, [currentUser?.id]);

  const applyGuestProfile = (profileId) => {
    setSelectedProfileId(profileId);
    if (!profileId) return;
    const profile = guestProfiles.find((p) => p.id === profileId);
    if (profile) {
      setAdults(profile.adults ?? 0);
      setChildren(profile.children ?? 0);
    }
  };

  const toggleCategory = (cat) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleCustomDrink = (id) => {
    setCustomDrinkIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventName.trim() || !date || !durationHours) {
      setError('Bitte Name, Datum und Dauer angeben.');
      return;
    }
    if (categories.length === 0 && customDrinkIds.length === 0) {
      setError('Bitte mindestens eine Getränkekategorie oder ein eigenes Getränk auswählen.');
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
        customDrinkIds,
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

        {guestProfiles.length > 0 && (
          <label className="events-form-field">
            <span>Gästeprofil laden</span>
            <select
              value={selectedProfileId}
              onChange={(e) => applyGuestProfile(e.target.value)}
            >
              <option value="">— Manuell eingeben —</option>
              {guestProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.adults ?? 0} Erw. / {p.children ?? 0} Kinder)
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="events-form-row">
          <label className="events-form-field">
            <span>Erwachsene</span>
            <input
              type="number"
              min="0"
              value={adults}
              onChange={(e) => { setSelectedProfileId(''); setAdults(e.target.value); }}
            />
          </label>
          <label className="events-form-field">
            <span>Kinder</span>
            <input
              type="number"
              min="0"
              value={children}
              onChange={(e) => { setSelectedProfileId(''); setChildren(e.target.value); }}
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
          <span>Standardkategorien</span>
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

        {customDrinks.length > 0 && (
          <div className="events-form-field">
            <span>Eigene Getränke</span>
            <div className="events-category-grid">
              {customDrinks.map((drink) => (
                <label key={drink.id} className="events-category-checkbox">
                  <input
                    type="checkbox"
                    checked={customDrinkIds.includes(drink.id)}
                    onChange={() => toggleCustomDrink(drink.id)}
                  />
                  <span>{drink.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

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

