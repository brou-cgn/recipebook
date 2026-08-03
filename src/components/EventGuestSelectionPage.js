import React, { useState, useEffect } from 'react';
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
  const [guestToAdd, setGuestToAdd] = useState('');

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubGuests = subscribeToGuestProfiles(currentUser.id, setGuests);
    return unsubGuests;
  }, [currentUser?.id]);

  useEffect(() => {
    setDriverGuestIds((prev) => prev.filter((guestId) => selectedGuestIds.includes(guestId)));
  }, [selectedGuestIds]);

  const selectedGuests = guests.filter((g) => selectedGuestIds.includes(g.id));

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

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Gäste &amp; Fahrer</h2>
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
          <span>Gästeauswahl für Menüplanung</span>
          {selectedGuests.length > 0 && (
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

        {selectedGuests.length > 0 && (
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
