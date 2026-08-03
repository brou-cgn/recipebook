import React, { useState, useEffect, useMemo } from 'react';
import './EventsPage.css';
import {
  EVENT_TYPES,
  deriveSeason,
  calculateEventDrinks,
  subscribeToCustomDrinks,
  subscribeToGuestProfiles,
} from '../utils/eventsFirestore';
import { getDrinkParentCategoryId, categoryHasOwnBudget } from '../utils/drinkCategories';
import { computeGuestPreferenceMultipliers, getGuestDisplayName } from '../utils/guestPreferences';
import EventGuestSelectionPage from './EventGuestSelectionPage';
import EventDrinkSelectionPage from './EventDrinkSelectionPage';

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
const DEFAULT_DISTRIBUTION_FACTOR = 1;

const normalizeDistributionFactor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DISTRIBUTION_FACTOR;
  if (parsed < 0.1 || parsed > 2.0) return DEFAULT_DISTRIBUTION_FACTOR;
  return parsed;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

function EventForm({ onSaved, onCancel, currentUser, onManageDrinks, initialEvent }) {
  const isEditing = Boolean(initialEvent?.id);

  const [eventName, setEventName] = useState(initialEvent?.eventName ?? '');
  const [date, setDate] = useState(initialEvent?.date ?? todayIsoDate());
  const [startTime, setStartTime] = useState(initialEvent?.startTime ?? '');
  const [durationHours, setDurationHours] = useState(initialEvent?.durationHours ?? 4);
  const [adults, setAdults] = useState(initialEvent?.guests?.adults ?? 10);
  const [children, setChildren] = useState(initialEvent?.guests?.children ?? 0);
  const [eventType, setEventType] = useState(initialEvent?.eventType ?? 'familienfeier');
  const [customDrinkIds, setCustomDrinkIds] = useState(initialEvent?.customDrinkIds ?? []);
  const [drinkDistributionFactors, setDrinkDistributionFactors] = useState(initialEvent?.drinkDistributionFactors ?? {});
  const [pufferProzent, setPufferProzent] = useState(initialEvent?.pufferProzent ?? DEFAULT_PUFFER_PROZENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [guests, setGuests] = useState([]);
  const [customDrinks, setCustomDrinks] = useState([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState(initialEvent?.selectedGuestIds ?? []);
  const [driverGuestIds, setDriverGuestIds] = useState(initialEvent?.driverGuestIds ?? []);
  const [showGuestSelection, setShowGuestSelection] = useState(false);
  const [showDrinkSelection, setShowDrinkSelection] = useState(false);

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
      const categories = [...new Set(
        customDrinkIds
          .map((drinkId) => customDrinks.find((drink) => drink.id === drinkId)?.kategorie)
          .filter(Boolean)
          .map((categoryId) =>
            categoryHasOwnBudget(categoryId) ? categoryId : getDrinkParentCategoryId(categoryId) || categoryId
          ),
      )];

      const event = {
        eventName: eventName.trim(),
        date,
        startTime: startTime || undefined,
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
        categories,
        customDrinkIds,
        drinkDistributionFactors: customDrinkIds.reduce((acc, drinkId) => {
          const factor = normalizeDistributionFactor(drinkDistributionFactors[drinkId]);
          if (factor !== DEFAULT_DISTRIBUTION_FACTOR) acc[drinkId] = factor;
          return acc;
        }, {}),
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

  if (showGuestSelection) {
    return (
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={selectedGuestIds}
        driverGuestIds={driverGuestIds}
        onSave={(newSelectedIds, newDriverIds) => {
          setSelectedGuestIds(newSelectedIds);
          setDriverGuestIds(newDriverIds);
          setAdults(newSelectedIds.length > 0 ? newSelectedIds.length : adults);
          setShowGuestSelection(false);
        }}
        onBack={() => setShowGuestSelection(false)}
      />
    );
  }

  if (showDrinkSelection) {
    return (
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={customDrinkIds}
        drinkDistributionFactors={drinkDistributionFactors}
        onSave={(newDrinkIds, newDrinkDistributionFactors) => {
          setCustomDrinkIds(newDrinkIds);
          setDrinkDistributionFactors(newDrinkDistributionFactors || {});
          setShowDrinkSelection(false);
        }}
        onBack={() => setShowDrinkSelection(false)}
      />
    );
  }

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

        <label className="events-form-field">
          <span>Anlass</span>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>
            ))}
          </select>
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
            <span>Startuhrzeit</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-label="Startuhrzeit"
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
            <span>Gäste</span>
            {selectedGuestIds.length > 0 ? (
              <p className="events-info-text">
                {selectedGuestIds.length} {selectedGuestIds.length === 1 ? 'Gast' : 'Gäste'} ausgewählt
                {driverGuestIds.length > 0 ? `, ${driverGuestIds.length} Fahrer markiert` : ''}.
              </p>
            ) : (
              <p className="events-info-text">Keine Gäste ausgewählt.</p>
            )}
            <button
              type="button"
              className="events-secondary-btn"
              onClick={() => setShowGuestSelection(true)}
            >
              Gäste verwalten
            </button>
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

        <div className="events-form-field">
          <span>Eigene Getränke</span>
          {customDrinks.length > 0 ? (
            <>
              {customDrinkIds.length > 0 ? (
                <p className="events-info-text">
                  {customDrinkIds.length} {customDrinkIds.length === 1 ? 'Getränk' : 'Getränke'} ausgewählt
                </p>
              ) : (
                <p className="events-info-text">Keine Getränke ausgewählt.</p>
              )}
              <button
                type="button"
                className="events-secondary-btn"
                onClick={() => setShowDrinkSelection(true)}
              >
                Getränke verwalten
              </button>
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
