import React, { useState, useEffect, useMemo } from 'react';
import './EventsPage.css';
import {
  EVENT_TYPES,
  deriveSeason,
  calculateEventDrinks,
  subscribeToAllCustomDrinks,
  subscribeToGuestProfiles,
} from '../utils/eventsFirestore';
import { getMenusByEventId, updateMenu } from '../utils/menuFirestore';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { getDrinkParentCategoryId, categoryHasOwnBudget, PREDEFINED_DRINKS, mergePredefinedDrinks } from '../utils/drinkCategories';
import {
  computeGuestPreferenceMultipliers,
  countGuestsByCategory,
  getGuestDisplayName,
} from '../utils/guestPreferences';
import EventGuestSelectionPage from './EventGuestSelectionPage';
import EventDrinkSelectionPage from './EventDrinkSelectionPage';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

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
  longdrinks: 'Longdrinks',
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

const currentHourStartTime = () => `${String(new Date().getHours()).padStart(2, '0')}:00`;

function EventForm({ onSaved, onCancel, onDelete, currentUser, ownerId, onManageDrinks, initialEvent, recipes }) {
  const isEditing = Boolean(initialEvent?.id);
  const effectiveOwnerId = ownerId || currentUser?.id;

  const [eventName, setEventName] = useState(initialEvent?.eventName ?? '');
  const [date, setDate] = useState(initialEvent?.date ?? todayIsoDate());
  const [startTime, setStartTime] = useState(initialEvent?.startTime ?? currentHourStartTime());
  const [durationHours, setDurationHours] = useState(initialEvent?.durationHours ?? 4);
  const [adults, setAdults] = useState(initialEvent?.guests?.adults ?? '');
  const [children, setChildren] = useState(initialEvent?.guests?.children ?? '');
  const [eventType, setEventType] = useState(initialEvent?.eventType ?? 'familienfeier');
  const [customDrinkIds, setCustomDrinkIds] = useState(initialEvent?.customDrinkIds ?? []);
  const [drinkDistributionFactors, setDrinkDistributionFactors] = useState(initialEvent?.drinkDistributionFactors ?? {});
  const [drinkSelectedEinheiten, setDrinkSelectedEinheiten] = useState(initialEvent?.drinkSelectedEinheiten ?? {});
  const [pufferProzent, setPufferProzent] = useState(initialEvent?.pufferProzent ?? DEFAULT_PUFFER_PROZENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  const [guests, setGuests] = useState([]);
  const [customDrinks, setCustomDrinks] = useState([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState(initialEvent?.selectedGuestIds ?? []);
  const [driverGuestIds, setDriverGuestIds] = useState(initialEvent?.driverGuestIds ?? []);
  const [showGuestSelection, setShowGuestSelection] = useState(false);
  const [showDrinkSelection, setShowDrinkSelection] = useState(false);

  useEffect(() => {
    if (!effectiveOwnerId) return undefined;
    const unsubGuests = subscribeToGuestProfiles(effectiveOwnerId, setGuests);
    const unsubDrinks = subscribeToAllCustomDrinks((drinks) => {
      setCustomDrinks(drinks);
      // Auto-select only Mineralwasser for new events
      setCustomDrinkIds((prev) => {
        if (!isEditing && prev.length === 0) {
          return ['predefined_mineralwasser'];
        }
        return prev;
      });
    });
    return () => {
      unsubGuests();
      unsubDrinks();
    };
  }, [effectiveOwnerId]);

  useEffect(() => {
    const loadButtonIcons = async () => {
      const { getButtonIcons } = await import('../utils/customLists');
      const icons = await getButtonIcons();
      setButtonIcons(icons);
    };
    loadButtonIcons();
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const selectedGuests = useMemo(
    () => guests.filter((guest) => selectedGuestIds.includes(guest.id)),
    [guests, selectedGuestIds],
  );
  const selectedGuestCounts = useMemo(
    () => countGuestsByCategory(selectedGuests),
    [selectedGuests],
  );

  const guestPreferenceMultipliers = useMemo(
    () => computeGuestPreferenceMultipliers(selectedGuests, mergePredefinedDrinks(customDrinks, effectiveOwnerId), driverGuestIds),
    [selectedGuests, customDrinks, driverGuestIds, effectiveOwnerId],
  );

  useEffect(() => {
    setDriverGuestIds((prev) => prev.filter((guestId) => selectedGuestIds.includes(guestId)));
  }, [selectedGuestIds]);

  useEffect(() => {
    if (selectedGuestIds.length === 0) return;
    setAdults(selectedGuestCounts.adults);
    setChildren(selectedGuestCounts.children);
  }, [selectedGuestCounts.adults, selectedGuestCounts.children, selectedGuestIds.length]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventName.trim() || !date || !durationHours) {
      setError('Bitte Name, Datum und Dauer angeben.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const allDrinks = mergePredefinedDrinks(customDrinks, effectiveOwnerId);
      const categories = [...new Set(
        customDrinkIds
          .map((drinkId) => allDrinks.find((drink) => drink.id === drinkId)?.kategorie)
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
        drinkSelectedEinheiten: customDrinkIds.reduce((acc, drinkId) => {
          const indices = drinkSelectedEinheiten[drinkId];
          if (Array.isArray(indices) && indices.length > 0) acc[drinkId] = indices;
          return acc;
        }, {}),
        pufferProzent: Number(pufferProzent),
      };
      const result = await calculateEventDrinks(
        event,
        isEditing ? initialEvent.id : undefined,
        effectiveOwnerId !== currentUser?.id ? effectiveOwnerId : undefined,
      );

      // Drinks removed here should disappear from any menu they were also
      // added to, so the menu stays in sync with this event's Getränke.
      // Drinks added here need no extra propagation: a linked menu reads the
      // event live and already merges its drinks into the "Drinks" section.
      const removedDrinkIds = (initialEvent?.customDrinkIds ?? []).filter(
        (id) => !customDrinkIds.includes(id)
      );
      // A removed drink may be a drink recipe (its underlying drink name
      // encodes a #recipe:id:name link) that a linked menu stores as a
      // regular recipe entry in section.recipeIds rather than section.drinkIds
      // - strip that recipeId too so the recipe disappears along with it.
      const removedRecipeIds = removedDrinkIds
        .map((id) => decodeRecipeLink(allDrinks.find((drink) => drink.id === id)?.name)?.recipeId)
        .filter(Boolean);
      // Keep every linked menu's guest pills mirrored to this event's guest
      // list, in both directions (see MenuForm's handleSubmit for the
      // reverse: menu guests pushed into the event).
      const initialGuestIds = initialEvent?.selectedGuestIds ?? [];
      const guestsChanged =
        selectedGuestIds.length !== initialGuestIds.length ||
        selectedGuestIds.some((id) => !initialGuestIds.includes(id)) ||
        initialGuestIds.some((id) => !selectedGuestIds.includes(id));
      if ((removedDrinkIds.length > 0 || guestsChanged) && effectiveOwnerId) {
        try {
          const linkedMenus = await getMenusByEventId(effectiveOwnerId, result.eventId);
          await Promise.all(linkedMenus.map((linkedMenu) => {
            let changed = false;
            const nextSections = (linkedMenu.sections || []).map((section) => {
              let nextSection = section;
              if (Array.isArray(section.drinkIds) && section.drinkIds.length > 0) {
                const filteredDrinkIds = section.drinkIds.filter((id) => !removedDrinkIds.includes(id));
                if (filteredDrinkIds.length !== section.drinkIds.length) {
                  changed = true;
                  nextSection = { ...nextSection, drinkIds: filteredDrinkIds };
                }
              }
              if (removedRecipeIds.length > 0 && Array.isArray(section.recipeIds) && section.recipeIds.length > 0) {
                const filteredRecipeIds = section.recipeIds.filter((id) => !removedRecipeIds.includes(id));
                if (filteredRecipeIds.length !== section.recipeIds.length) {
                  changed = true;
                  nextSection = { ...nextSection, recipeIds: filteredRecipeIds };
                }
              }
              return nextSection;
            });
            const updates = {};
            if (changed) updates.sections = nextSections;
            const existingMenuGuestIds = Array.isArray(linkedMenu.descriptionGuestIds) ? linkedMenu.descriptionGuestIds : [];
            const menuGuestsDiffer =
              guestsChanged &&
              (existingMenuGuestIds.length !== selectedGuestIds.length ||
                existingMenuGuestIds.some((id) => !selectedGuestIds.includes(id)) ||
                selectedGuestIds.some((id) => !existingMenuGuestIds.includes(id)));
            if (menuGuestsDiffer) updates.descriptionGuestIds = selectedGuestIds;
            if (Object.keys(updates).length === 0) return null;
            return updateMenu(linkedMenu.id, updates);
          }));
        } catch (err) {
          console.error('Error syncing removed drinks/guests to linked menus:', err);
        }
      }

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
        ownerId={effectiveOwnerId}
        selectedGuestIds={selectedGuestIds}
        driverGuestIds={driverGuestIds}
        buttonIcons={buttonIcons}
        isDarkMode={isDarkMode}
        onSave={(newSelectedIds, newDriverIds) => {
          setSelectedGuestIds(newSelectedIds);
          setDriverGuestIds(newDriverIds);
          if (newSelectedIds.length > 0) {
            const nextSelectedGuests = guests.filter((guest) => newSelectedIds.includes(guest.id));
            const nextCounts = countGuestsByCategory(nextSelectedGuests);
            setAdults(nextCounts.adults);
            setChildren(nextCounts.children);
          }
          setShowGuestSelection(false);
        }}
        onBack={() => setShowGuestSelection(false)}
      />
    );
  }

  if (showDrinkSelection) {
    return (
      <EventDrinkSelectionPage
        customDrinks={mergePredefinedDrinks(customDrinks, effectiveOwnerId)}
        customDrinkIds={customDrinkIds}
        drinkDistributionFactors={drinkDistributionFactors}
        drinkSelectedEinheiten={drinkSelectedEinheiten}
        pufferProzent={pufferProzent}
        recipes={recipes}
        buttonIcons={buttonIcons}
        isDarkMode={isDarkMode}
        currentUserId={effectiveOwnerId}
        onSave={(newDrinkIds, newDrinkDistributionFactors, newDrinkSelectedEinheiten, newPufferProzent) => {
          setCustomDrinkIds(newDrinkIds);
          setDrinkDistributionFactors(newDrinkDistributionFactors || {});
          setDrinkSelectedEinheiten(newDrinkSelectedEinheiten || {});
          setPufferProzent(newPufferProzent);
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
              step="900"
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

        <div className="events-form-row events-form-row--guests">
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
          {guests.length > 0 && (
            <button
              type="button"
              className="events-secondary-btn events-guests-manage-btn"
              onClick={() => setShowGuestSelection(true)}
              aria-label="Gäste verwalten"
              title="Gäste verwalten"
            >
              {isBase64Image(getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode)) ? (
                <img
                  src={getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode)}
                  alt=""
                  className="button-icon-image"
                  draggable="false"
                />
              ) : (
                <span className="events-guests-manage-btn-icon">
                  {getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode)}
                </span>
              )}
            </button>
          )}
        </div>

        <div className="events-form-field">
          {customDrinks.length > 0 ? (
            <div className="events-form-row events-form-row--guests">
              {customDrinkIds.length > 0 ? (
                <p className="events-info-text">
                  {customDrinkIds.length} {customDrinkIds.length === 1 ? 'Getränk' : 'Getränke'} ausgewählt
                </p>
              ) : (
                <p className="events-info-text">Keine Getränke ausgewählt.</p>
              )}
              <button
                type="button"
                className="events-secondary-btn events-guests-manage-btn"
                onClick={() => setShowDrinkSelection(true)}
                aria-label="Getränke verwalten"
                title="Getränke verwalten"
              >
                {isBase64Image(getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode)) ? (
                  <img
                    src={getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode)}
                    alt=""
                    className="button-icon-image"
                    draggable="false"
                  />
                ) : (
                  <span className="events-guests-manage-btn-icon">
                    {getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode)}
                  </span>
                )}
              </button>
            </div>
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

        {error && <p className="events-error-text">{error}</p>}

        <div className="events-form-actions">
          {isEditing && onDelete && (
            <button type="button" className="events-secondary-btn events-delete-btn events-secondary-btn--desktop-only" onClick={onDelete} disabled={saving}>
              Löschen
            </button>
          )}
          {!isEditing && (
            <button type="button" className="events-secondary-btn events-secondary-btn--desktop-only" onClick={onCancel} disabled={saving}>
              Abbrechen
            </button>
          )}
          <button type="submit" className={`events-primary-btn events-primary-btn--desktop-only`} disabled={saving}>
            {saving ? 'Berechne...' : isEditing ? 'Berechnung aktualisieren' : 'Einkaufsliste berechnen'}
          </button>
        </div>
      </form>

      <button
        type="button"
        className={`event-save-fab-button${fabPressed ? ' pressed' : ''}`}
        onClick={() => handleSubmit({ preventDefault: () => {} })}
        onMouseDown={() => setFabPressed(true)}
        onMouseUp={() => setFabPressed(false)}
        onMouseLeave={() => setFabPressed(false)}
        onTouchStart={() => setFabPressed(true)}
        onTouchEnd={() => setFabPressed(false)}
        onTouchCancel={() => setFabPressed(false)}
        disabled={saving}
        aria-label={isEditing ? 'Event-Berechnung aktualisieren' : 'Einkaufsliste berechnen'}
        title={isEditing ? 'Berechnung aktualisieren' : 'Einkaufsliste berechnen'}
      >
        {isBase64Image(getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)} alt="Speichern" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)
        )}
      </button>

      <button
        type="button"
        className={`events-cancel-fab-button${cancelPressed ? ' pressed' : ''}`}
        onClick={onCancel}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        title="Abbrechen"
        aria-label={isEditing ? 'Eventbearbeitung abbrechen' : 'Neues Event abbrechen'}
        disabled={saving}
      >
        {isBase64Image(getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
        )}
      </button>
    </div>
  );
}

export { CATEGORY_LABELS, EVENT_TYPE_LABELS };
export default EventForm;
