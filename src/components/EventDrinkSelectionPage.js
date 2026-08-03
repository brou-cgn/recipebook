import React, { useState } from 'react';
import './EventsPage.css';

function EventDrinkSelectionPage({
  customDrinks,
  customDrinkIds: initialCustomDrinkIds,
  guestPreferenceMultipliers,
  selectedGuestIds,
  onSave,
  onBack,
}) {
  const [customDrinkIds, setCustomDrinkIds] = useState(initialCustomDrinkIds ?? []);
  const [drinkToAdd, setDrinkToAdd] = useState('');

  const toggleCustomDrink = (id) => {
    setCustomDrinkIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    onSave(customDrinkIds);
  };

  const selectedDrinks = customDrinks.filter((d) => customDrinkIds.includes(d.id));
  const showMultipliers = (selectedGuestIds ?? []).length > 0;

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Getränke</h2>
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
          {customDrinks.length > 0 ? (
            <>
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

              {selectedDrinks.length > 0 && (
                <div className="events-table-container">
                  <table className="events-table">
                    <thead>
                      <tr>
                        <th>Getränk</th>
                        {showMultipliers && <th>Faktor</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDrinks.map((drink) => {
                        const multiplier =
                          showMultipliers &&
                          typeof guestPreferenceMultipliers?.[drink.id] === 'number'
                            ? guestPreferenceMultipliers[drink.id]
                            : null;
                        return (
                          <tr key={drink.id}>
                            <td>{drink.name}</td>
                            {showMultipliers && <td>{multiplier}</td>}
                            <td>
                              <button
                                type="button"
                                className="events-drink-chip-remove"
                                onClick={() => toggleCustomDrink(drink.id)}
                                aria-label={`${drink.name} entfernen`}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="events-info-text">Noch keine eigenen Getränke angelegt.</p>
          )}

          <p className="events-info-text">
            {customDrinkIds.length} {customDrinkIds.length === 1 ? 'Getränk' : 'Getränke'} ausgewählt.
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

export default EventDrinkSelectionPage;
