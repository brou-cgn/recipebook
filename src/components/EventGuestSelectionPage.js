import React, { useState, useEffect, useRef } from 'react';
import './EventsPage.css';
import { subscribeToGuestProfiles } from '../utils/eventsFirestore';
import { getGuestDisplayName } from '../utils/guestPreferences';

function EventGuestSelectionPage({
  currentUser,
  selectedGuestIds: initialSelectedGuestIds,
  driverGuestIds: initialDriverGuestIds,
  onSave,
  onBack,
}) {
  const [guests, setGuests] = useState([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState(initialSelectedGuestIds ?? []);
  const [driverGuestIds, setDriverGuestIds] = useState(initialDriverGuestIds ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubGuests = subscribeToGuestProfiles(currentUser.id, setGuests);
    return unsubGuests;
  }, [currentUser?.id]);

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
        <button
          className="events-close-btn"
          onClick={onBack}
          aria-label="Abbrechen"
          title="Abbrechen"
        >
          ×
        </button>
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

          <p className="events-info-text">
            {selectedGuestIds.length} {selectedGuestIds.length === 1 ? 'Gast' : 'Gäste'} ausgewählt.
          </p>
          <p className="events-info-text">
            {driverGuestIds.length} Fahrer markiert.
          </p>
        </div>
        <div className="events-form-actions">
          <button type="button" className="events-secondary-btn" onClick={onBack}>
            Abbrechen
          </button>
          <button type="button" className="events-primary-btn" onClick={handleSave}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

export default EventGuestSelectionPage;
