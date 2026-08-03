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

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubGuests = subscribeToGuestProfiles(currentUser.id, setGuests);
    return unsubGuests;
  }, [currentUser?.id]);

  useEffect(() => {
    setDriverGuestIds((prev) => prev.filter((guestId) => selectedGuestIds.includes(guestId)));
  }, [selectedGuestIds]);

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
          {guests.length === 0 ? (
            <p className="events-info-text">Noch keine Gäste erfasst.</p>
          ) : (
            <div className="events-table-container">
              <table className="events-table">
                <thead>
                  <tr>
                    <th>Gast</th>
                    <th>Fahrer</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((guest) => {
                    const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                    const isSelected = selectedGuestIds.includes(guest.id);
                    return (
                      <tr key={guest.id}>
                        <td>
                          <label className="events-category-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
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
                            disabled={!isSelected}
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
