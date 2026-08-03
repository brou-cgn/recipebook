import React, { useState } from 'react';
import './EventsPage.css';

const MIN_DISTRIBUTION_FACTOR = 0.1;
const MAX_DISTRIBUTION_FACTOR = 2.0;

const normalizeDistributionFactor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed < MIN_DISTRIBUTION_FACTOR || parsed > MAX_DISTRIBUTION_FACTOR) return 1;
  return parsed;
};

function EventDrinkSelectionPage({
  customDrinks,
  customDrinkIds: initialCustomDrinkIds,
  drinkDistributionFactors: initialDrinkDistributionFactors,
  onSave,
  onBack,
}) {
  const [customDrinkIds, setCustomDrinkIds] = useState(initialCustomDrinkIds ?? []);
  const [drinkDistributionFactors, setDrinkDistributionFactors] = useState(
    initialDrinkDistributionFactors ?? {},
  );
  const [drinkToAdd, setDrinkToAdd] = useState('');

  const toggleCustomDrink = (id) => {
    setCustomDrinkIds((prev) => {
      if (prev.includes(id)) {
        setDrinkDistributionFactors((current) => {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        });
        return prev.filter((d) => d !== id);
      }
      return [...prev, id];
    });
  };

  const handleSave = () => {
    const optimizedFactors = customDrinkIds.reduce((acc, drinkId) => {
      const factor = normalizeDistributionFactor(drinkDistributionFactors[drinkId]);
      if (factor !== 1) acc[drinkId] = factor;
      return acc;
    }, {});
    onSave(customDrinkIds, optimizedFactors);
  };

  const selectedDrinks = customDrinks.filter((d) => customDrinkIds.includes(d.id));
  const updateDistributionFactor = (drinkId, value) => {
    setDrinkDistributionFactors((prev) => {
      const factor = normalizeDistributionFactor(value);
      if (factor === 1) {
        if (!(drinkId in prev)) return prev;
        const next = { ...prev };
        delete next[drinkId];
        return next;
      }
      return { ...prev, [drinkId]: factor };
    });
  };

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
                        <th>Faktor</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDrinks.map((drink) => {
                        const factor = normalizeDistributionFactor(drinkDistributionFactors[drink.id]);
                        return (
                          <tr key={drink.id}>
                            <td>{drink.name}</td>
                            <td>
                              <input
                                type="number"
                                min={MIN_DISTRIBUTION_FACTOR}
                                max={MAX_DISTRIBUTION_FACTOR}
                                step="0.01"
                                value={factor.toFixed(2)}
                                onChange={(e) => updateDistributionFactor(drink.id, e.target.value)}
                                aria-label={`${drink.name} Faktor`}
                              />
                            </td>
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
