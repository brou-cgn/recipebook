import React, { useState, useEffect, useRef } from 'react';
import './EventsPage.css';
import { subscribeToGuestProfiles } from '../utils/eventsFirestore';
import { getGuestDisplayName } from '../utils/guestPreferences';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function EventGuestSelectionPage({
  currentUser,
  ownerId,
  selectedGuestIds: initialSelectedGuestIds,
  driverGuestIds: initialDriverGuestIds,
  onSave,
  onBack,
  buttonIcons,
  isDarkMode,
}) {
  const [guests, setGuests] = useState([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState(initialSelectedGuestIds ?? []);
  const [driverGuestIds, setDriverGuestIds] = useState(initialDriverGuestIds ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const effectiveButtonIcons = buttonIcons || DEFAULT_BUTTON_ICONS;
  const effectiveOwnerId = ownerId || currentUser?.id;

  useEffect(() => {
    if (!effectiveOwnerId) return undefined;
    const unsubGuests = subscribeToGuestProfiles(effectiveOwnerId, setGuests);
    return unsubGuests;
  }, [effectiveOwnerId]);

  useEffect(() => {
    setDriverGuestIds((prev) => prev.filter((guestId) => selectedGuestIds.includes(guestId)));
  }, [selectedGuestIds]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleGuest = (guestId) => {
    setSelectedGuestIds((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]
    );
  };

  const toggleDriverGuest = (guestId) => {
    if (!selectedGuestIds.includes(guestId)) return;
    setDriverGuestIds((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]
    );
  };

  const handleSave = () => {
    onSave(selectedGuestIds, driverGuestIds);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setIsDropdownOpen(e.target.value.trim().length > 0);
  };

  const handleSelectGuest = (guestId) => {
    setSelectedGuestIds((prev) => (prev.includes(guestId) ? prev : [...prev, guestId]));
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredGuests = normalizedQuery
    ? guests.filter((guest) => {
        const fullName = (getGuestDisplayName(guest) || 'Unbenannter Gast').toLowerCase();
        return fullName.includes(normalizedQuery) && !selectedGuestIds.includes(guest.id);
      })
    : [];

  const selectedGuests = guests.filter((g) => selectedGuestIds.includes(g.id));

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Gäste</h2>
      </div>

      <div className="events-form">
        <div className="events-form-field">
          <div className="events-guest-typeahead">
            <input
              ref={searchRef}
              type="text"
              className="events-guest-search-input"
              placeholder="Gast suchen..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => {
                if (searchQuery.trim().length > 0) setIsDropdownOpen(true);
              }}
              aria-label="Gast suchen"
              aria-autocomplete="list"
              aria-expanded={isDropdownOpen}
              role="combobox"
              aria-controls="guest-typeahead-list"
            />
            {isDropdownOpen && (
              <ul
                id="guest-typeahead-list"
                ref={dropdownRef}
                className="events-guest-typeahead-list"
                role="listbox"
              >
                {filteredGuests.length === 0 ? (
                  <li className="events-guest-typeahead-empty">Keine Gäste gefunden.</li>
                ) : (
                  filteredGuests.map((guest) => {
                    const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                    return (
                      <li
                        key={guest.id}
                        role="option"
                        aria-selected={false}
                        className="events-guest-typeahead-option"
                        onMouseDown={() => handleSelectGuest(guest.id)}
                      >
                        {fullName}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {selectedGuests.length > 0 && (
            <div className="events-table-container">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>Gast</th>
                    <th>Fahrer</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGuests.map((guest) => {
                    const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                    return (
                      <tr key={guest.id}>
                        <td>
                          <label className="events-category-checkbox">
                            <input
                              type="checkbox"
                              checked
                              onChange={() => toggleGuest(guest.id)}
                              aria-label={`${fullName} als Gast auswählen`}
                            />
                            <span>{fullName}</span>
                          </label>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="events-driver-checkbox"
                            checked={driverGuestIds.includes(guest.id)}
                            onChange={() => toggleDriverGuest(guest.id)}
                            aria-label={`${fullName} als Fahrer markieren`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="events-guest-summary-badges">
            <span className="events-summary-badge">
              {selectedGuestIds.length} {selectedGuestIds.length === 1 ? 'Gast' : 'Gäste'} ausgewählt.
            </span>
            <span className="events-summary-badge">
              {driverGuestIds.length} Fahrer markiert.
            </span>
          </div>
        </div>
        <div className="events-form-actions">
          <button
            type="button"
            className="events-secondary-btn events-save-desktop-only"
            onClick={onBack}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="events-primary-btn events-form-actions-save"
            onClick={handleSave}
          >
            Speichern
          </button>
        </div>
      </div>

      {/* FAB Save button - mobile only */}
      <button
        type="button"
        className={`events-save-fab-button${fabPressed ? ' pressed' : ''}`}
        onClick={handleSave}
        onMouseDown={() => setFabPressed(true)}
        onMouseUp={() => setFabPressed(false)}
        onMouseLeave={() => setFabPressed(false)}
        onTouchStart={() => setFabPressed(true)}
        onTouchEnd={() => setFabPressed(false)}
        aria-label="Gästeliste speichern"
        title="Speichern"
      >
        {isBase64Image(getEffectiveIcon(effectiveButtonIcons, 'saveRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(effectiveButtonIcons, 'saveRecipe', isDarkMode)} alt="Speichern" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(effectiveButtonIcons, 'saveRecipe', isDarkMode)
        )}
      </button>

      {/* Cancel FAB button - positioned at bottom-left, mobile only */}
      <button
        type="button"
        className={`events-cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
        onClick={onBack}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        title="Abbrechen"
        aria-label="Gästeauswahl abbrechen"
      >
        {isBase64Image(getEffectiveIcon(effectiveButtonIcons, 'cancelRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(effectiveButtonIcons, 'cancelRecipe', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(effectiveButtonIcons, 'cancelRecipe', isDarkMode)
        )}
      </button>
    </div>
  );
}

export default EventGuestSelectionPage;
