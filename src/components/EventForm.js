import React, { useState, useEffect, useMemo } from 'react';
import './EventsPage.css';
import {
  EVENT_TYPES,
  deriveSeason,
  calculateEventDrinks,
  subscribeToCustomDrinks,
  subscribeToGuestProfiles,
} from '../utils/eventsFirestore';
import { computeGuestPreferenceMultipliers, getGuestDisplayName } from '../utils/guestPreferences';

const CATEGORY_LABELS = {
  wasser: 'Wasser',
  softdrinks: 'Softdrinks',
  saft: 'Saft',
  bier: 'Bier',
  bier_koelsch: 'Kölsch',
  bier_pils: 'Pils',
  bier_weizen: 'Weizen',
  bier_alkoholfrei: 'Alkoholfreies Bier',
  wein: 'Wein',
  wein_weisswein: 'Weißwein',
  wein_rose: 'Rosé',
  wein_rotwein: 'Rotwein',
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

const DEFAULT_PUFFER_PROZENT = 25;

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

function EventForm({ onSaved, onCancel, currentUser, onManageDrinks, initialEvent }) {
  const isEditing = Boolean(initialEvent?.id);

  const [eventName, setEventName] = useState(initialEvent?.eventName ?? '');
  const [date, setDate] = useState(initialEvent?.date ?? todayIsoDate());
  const [durationHours, setDurationHours] = useState(initialEvent?.durationHours ?? 4);
  const [adults, setAdults] = useState(initialEvent?.guests?.adults ?? 10);
  const [children, setChildren] = useState(initialEvent?.guests?.children ?? 0);
  const [eventType, setEventType] = useState(initialEvent?.eventType ?? 'familienfeier');
  const [customDrinkIds, setCustomDrinkIds] = useState(initialEvent?.customDrinkIds ?? []);
  const [pufferProzent, setPufferProzent] = useState(initialEvent?.pufferProzent ?? DEFAULT_PUFFER_PROZENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [guests, setGuests] = useState([]);
  const [customDrinks, setCustomDrinks] = useState([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState(initialEvent?.selectedGuestIds ?? []);
  const [driverGuestIds, setDriverGuestIds] = useState(initialEvent?.driverGuestIds ?? []);
  const [guestToAdd, setGuestToAdd] = useState('');
  const [drinkToAdd, setDrinkToAdd] = useState('');

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubGuests = subscribeToGuestProfiles(currentUser.id, setGuests);
    const unsubDrinks = subscribeToCustomDrinks(currentUser.id, (drinks) => {
      setCustomDrinks(drinks);
      // Auto-select all custom drinks when they load for the first time (only for new events)
      setCustomDrinkIds((prev) => {
        if (!isEditing && prev.length === 0 && drinks.length > 0) {
          return drinks.map((d) => d.id);
        }
        return prev;
      });
    });
    return () => {
      unsubGuests();
      unsubDrinks();
    };
  }, [currentUser?.id]);

  const selectedGuests = useMemo(
    () => guests.filter((guest) => selectedGuestIds.includes(guest.id)),
    [guests, selectedGuestIds],
  );

  const guestPreferenceMultipliers = useMemo(
    () => computeGuestPreferenceMultipliers(selectedGuests, customDrinks),
    [selectedGuests, customDrinks],
  );

  useEffect(() => {
    setDriverGuestIds((prev) => prev.filter((guestId) => selectedGuestIds.includes(guestId)));
  }, [selectedGuestIds]);

  const toggleCustomDrink = (id) => {
    setCustomDrinkIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const toggleGuest = (guestId) => {
    setSelectedGuestIds((prev) => {
      const next = prev.includes(guestId)
        ? prev.filter((id) => id !== guestId)
        : [...prev, guestId];
      setAdults(next.length);
      return next;
    });
  };

  const applyGuestDrinkFilter = () => {
    if (selectedGuestIds.length === 0) return;
    setCustomDrinkIds((prev) => prev.filter((id) => (guestPreferenceMultipliers[id] ?? 1) > 0));
  };

  const toggleDriverGuest = (guestId) => {
    if (!selectedGuestIds.includes(guestId)) return;
    setDriverGuestIds((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventName.trim() || !date || !durationHours) {
      setError('Bitte Name, Datum und Dauer angeben.');
      return;
    }
    if (customDrinkIds.length === 0) {
      setError('Bitte mindestens ein eigenes Getränk auswählen.');
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
        selectedGuestIds,
        driverGuestIds: driverGuestIds.filter((guestId) => selectedGuestIds.includes(guestId)),
        guestNamesById: selectedGuests.reduce((acc, guest) => {
          acc[guest.id] = getGuestDisplayName(guest) || 'Unbenannter Gast';
          return acc;
        }, {}),
        guestPreferenceMultipliers,
        season: deriveSeason(date),
        eventType,
        categories: [],
        customDrinkIds,
        pufferProzent: Number(pufferProzent),
      };
      const result = await calculateEventDrinks(event, isEditing ? initialEvent.id : undefined);
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
        <h2>{isEditing ? 'Event bearbeiten' : 'Neues Event'}</h2>
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

        {guests.length > 0 && (
          <div className="events-form-field">
            <span>Gästeauswahl für Menüplanung</span>
            {selectedGuestIds.length > 0 && (
              <div className="events-preferred-drinks-list">
                {selectedGuests.map((guest) => {
                  const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                  return (
                    <span key={guest.id} className="events-drink-chip">
                      {fullName}
                      <button
                        type="button"
                        className="events-drink-chip-remove"
                        onClick={() => toggleGuest(guest.id)}
                        aria-label={`${fullName} entfernen`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="events-drink-selector">
              <select
                value={guestToAdd}
                onChange={(e) => setGuestToAdd(e.target.value)}
                aria-label="Gast auswählen"
              >
                <option value="">Gast auswählen …</option>
                {guests
                  .filter((g) => !selectedGuestIds.includes(g.id))
                  .map((guest) => {
                    const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                    return (
                      <option key={guest.id} value={guest.id}>{fullName}</option>
                    );
                  })}
              </select>
              <button
                type="button"
                className="events-secondary-btn"
                onClick={() => {
                  if (guestToAdd) {
                    toggleGuest(guestToAdd);
                    setGuestToAdd('');
                  }
                }}
                disabled={!guestToAdd}
                aria-label="Gast hinzufügen"
              >
                Hinzufügen
              </button>
            </div>
            {selectedGuestIds.length > 0 && (
              <p className="events-info-text">
                {selectedGuestIds.length} {selectedGuestIds.length === 1 ? 'Gast' : 'Gäste'} ausgewählt.
              </p>
            )}
          </div>
        )}

        {selectedGuestIds.length > 0 && (
          <div className="events-form-field">
            <span>Fahrer festlegen</span>
            <div className="events-preferred-drinks-list">
              {selectedGuests.map((guest) => {
                const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                return (
                  <label key={guest.id} className="events-category-checkbox">
                    <input
                      type="checkbox"
                      checked={driverGuestIds.includes(guest.id)}
                      onChange={() => toggleDriverGuest(guest.id)}
                      aria-label={`${fullName} als Fahrer markieren`}
                    />
                    <span>{fullName}</span>
                  </label>
                );
              })}
            </div>
            <p className="events-info-text">
              {driverGuestIds.length} Fahrer markiert.
            </p>
          </div>
        )}

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
          <span>Eigene Getränke</span>
          {customDrinks.length > 0 ? (
            <>
              {customDrinkIds.length > 0 && (
                <div className="events-preferred-drinks-list">
                  {customDrinkIds.map((id) => {
                    const drink = customDrinks.find((d) => d.id === id);
                    const label = drink ? drink.name : id;
                    const multiplierText =
                      selectedGuestIds.length > 0 && typeof guestPreferenceMultipliers[id] === 'number'
                        ? ` (${guestPreferenceMultipliers[id]})`
                        : '';
                    return (
                      <span key={id} className="events-drink-chip">
                        {label}{multiplierText}
                        <button
                          type="button"
                          className="events-drink-chip-remove"
                          onClick={() => toggleCustomDrink(id)}
                          aria-label={`${label} entfernen`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="events-drink-selector">
                <select
                  value={drinkToAdd}
                  onChange={(e) => setDrinkToAdd(e.target.value)}
                  aria-label="Getränk auswählen"
                >
                  <option value="">Getränk auswählen …</option>
                  {customDrinks
                    .filter((d) => !customDrinkIds.includes(d.id))
                    .map((drink) => (
                      <option key={drink.id} value={drink.id}>{drink.name}</option>
                    ))}
                </select>
                <button
                  type="button"
                  className="events-secondary-btn"
                  onClick={() => {
                    if (drinkToAdd) {
                      toggleCustomDrink(drinkToAdd);
                      setDrinkToAdd('');
                    }
                  }}
                  disabled={!drinkToAdd}
                  aria-label="Getränk hinzufügen"
                >
                  Hinzufügen
                </button>
              </div>
            </>
          ) : (
            <p className="events-info-text">
              Noch keine eigenen Getränke angelegt.
              {onManageDrinks && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="events-manage-link-btn"
                    onClick={onManageDrinks}
                  >
                    Getränke verwalten
                  </button>
                </>
              )}
            </p>
          )}
        </div>

        {selectedGuestIds.length > 0 && (
          <button type="button" className="events-secondary-btn" onClick={applyGuestDrinkFilter}>
            Getränke nach Gästewunsch filtern
          </button>
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
            {saving ? 'Berechne...' : isEditing ? 'Berechnung aktualisieren' : 'Einkaufsliste berechnen'}
          </button>
        </div>
      </form>
    </div>
  );
}

export { CATEGORY_LABELS, EVENT_TYPE_LABELS };
export default EventForm;
