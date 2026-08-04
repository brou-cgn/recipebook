import React, { useState, useRef } from 'react';
import './EventsPage.css';

const MIN_DISTRIBUTION_FACTOR = 0.1;
const MAX_DISTRIBUTION_FACTOR = 2.0;

const normalizeDistributionFactor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed < MIN_DISTRIBUTION_FACTOR || parsed > MAX_DISTRIBUTION_FACTOR) return 1;
  return parsed;
};

const getEinheitLabel = (einheit) => {
  if (!einheit) return '';
  const liters = Number(einheit.einheitsgroesse);
  let sizeLabel;
  if (liters < 1) {
    sizeLabel = `${Math.round(liters * 1000)} ml`;
  } else {
    sizeLabel = `${liters.toFixed(1).replace('.', ',')} l`;
  }
  return einheit.gebindeinheit ? `${sizeLabel} (${einheit.gebindeinheit})` : sizeLabel;
};

const buildInitialSelectedEinheiten = (customDrinks, initialCustomDrinkIds, initialDrinkSelectedEinheiten) => {
  const result = {};
  for (const drinkId of (initialCustomDrinkIds ?? [])) {
    if (initialDrinkSelectedEinheiten && Array.isArray(initialDrinkSelectedEinheiten[drinkId])) {
      result[drinkId] = new Set(initialDrinkSelectedEinheiten[drinkId]);
    } else {
      result[drinkId] = new Set([0]);
    }
  }
  return result;
};

const SWIPE_DELETE_THRESHOLD = 56;
const SWIPE_DELETE_MAX_OFFSET = 96;
const SWIPE_DIRECTION_LOCK_THRESHOLD = 6;

function DrinkRow({
  drink,
  factor,
  einheiten,
  selectedIndices,
  isDeleteVisible,
  onToggleEinheit,
  onUpdateFactor,
  onRemove,
  onSwipeDeleteVisible,
  onSwipeDeleteHidden,
  minFactor,
  maxFactor,
}) {
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);
  const swipeDirectionLockedRef = useRef(null);
  const isSwipingRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const effectiveSwipeOffset = isDeleteVisible ? -SWIPE_DELETE_MAX_OFFSET : swipeOffset;

  const resetSwipe = ({ keepDeleteAction = false } = {}) => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
    setSwipeOffset(0);
    if (!keepDeleteAction) {
      onSwipeDeleteHidden();
    }
  };

  const handleTouchStart = (e) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    if (isDeleteVisible) {
      onSwipeDeleteHidden();
    }
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
  };

  const handleTouchMove = (e) => {
    const touch = e.touches?.[0];
    if (!touch || touchStartXRef.current === null || touchStartYRef.current === null) return;

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipeDirectionLockedRef.current && (absX > SWIPE_DIRECTION_LOCK_THRESHOLD || absY > SWIPE_DIRECTION_LOCK_THRESHOLD)) {
      swipeDirectionLockedRef.current = absX > absY ? 'horizontal' : 'vertical';
    }

    if (swipeDirectionLockedRef.current === 'horizontal' && deltaX < 0) {
      isSwipingRef.current = true;
      setSwipeOffset(Math.max(deltaX, -SWIPE_DELETE_MAX_OFFSET));
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingRef.current && Math.abs(swipeOffset) >= SWIPE_DELETE_THRESHOLD) {
      onSwipeDeleteVisible();
      resetSwipe({ keepDeleteAction: true });
      return;
    }
    resetSwipe();
  };

  const handleSwipeDeleteClick = () => {
    onRemove();
    resetSwipe();
  };

  const swipeContentStyle = {
    transform: `translateX(${effectiveSwipeOffset}px)`,
    transition: 'transform 0.15s ease',
  };

  return (
    <div
      className={`events-drink-row${effectiveSwipeOffset < 0 ? ' swipe-delete-active' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="events-drink-row-swipe-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="events-drink-row-swipe-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${drink.name} entfernen`}
          >
            <span>🗑</span>
          </button>
        )}
      </div>
      <div className="events-drink-row-content" style={swipeContentStyle}>
        <div className="events-drink-row-name">{drink.name}</div>
        <div className="events-drink-row-details">
          <div className="events-drink-row-einheiten">
            {einheiten.length > 1 ? (
              <div className="events-einheit-checkboxes">
                {einheiten.map((einheit, idx) => (
                  <label key={idx} className="events-einheit-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => onToggleEinheit(idx)}
                      aria-label={`${drink.name} ${getEinheitLabel(einheit)}`}
                    />
                    {getEinheitLabel(einheit)}
                  </label>
                ))}
              </div>
            ) : (
              <span>{einheiten.length === 1 ? getEinheitLabel(einheiten[0]) : '–'}</span>
            )}
          </div>
          <div className="events-drink-row-factor">
            <input
              type="number"
              min={minFactor}
              max={maxFactor}
              step="0.01"
              value={factor.toFixed(2)}
              onChange={(e) => onUpdateFactor(e.target.value)}
              aria-label={`${drink.name} Faktor`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDrinkSelectionPage({
  customDrinks,
  customDrinkIds: initialCustomDrinkIds,
  drinkDistributionFactors: initialDrinkDistributionFactors,
  drinkSelectedEinheiten: initialDrinkSelectedEinheiten,
  onSave,
  onBack,
}) {
  const [customDrinkIds, setCustomDrinkIds] = useState(initialCustomDrinkIds ?? []);
  const [drinkDistributionFactors, setDrinkDistributionFactors] = useState(
    initialDrinkDistributionFactors ?? {},
  );
  const [drinkSelectedEinheiten, setDrinkSelectedEinheiten] = useState(() =>
    buildInitialSelectedEinheiten(customDrinks, initialCustomDrinkIds, initialDrinkSelectedEinheiten),
  );
  const [drinkToAdd, setDrinkToAdd] = useState('');
  const [swipeDeleteVisibleId, setSwipeDeleteVisibleId] = useState(null);

  const toggleCustomDrink = (id) => {
    setCustomDrinkIds((prev) => {
      if (prev.includes(id)) {
        setDrinkDistributionFactors((current) => {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        });
        setDrinkSelectedEinheiten((current) => {
          if (!(id in current)) return current;
          const next = { ...current };
          delete next[id];
          return next;
        });
        return prev.filter((d) => d !== id);
      }
      setDrinkSelectedEinheiten((current) => ({ ...current, [id]: new Set([0]) }));
      return [...prev, id];
    });
  };

  const toggleEinheit = (drinkId, idx) => {
    setDrinkSelectedEinheiten((prev) => {
      const current = new Set(prev[drinkId] || []);
      if (current.has(idx)) {
        if (current.size <= 1) return prev;
        current.delete(idx);
      } else {
        current.add(idx);
      }
      return { ...prev, [drinkId]: current };
    });
  };

  const handleSave = () => {
    const optimizedFactors = customDrinkIds.reduce((acc, drinkId) => {
      const factor = normalizeDistributionFactor(drinkDistributionFactors[drinkId]);
      if (factor !== 1) acc[drinkId] = factor;
      return acc;
    }, {});
    const optimizedEinheiten = customDrinkIds.reduce((acc, drinkId) => {
      const selected = drinkSelectedEinheiten[drinkId];
      const indices = selected ? [...selected].sort((a, b) => a - b) : [0];
      if (indices.length > 1 || (indices.length === 1 && indices[0] !== 0)) {
        acc[drinkId] = indices;
      }
      return acc;
    }, {});
    onSave(customDrinkIds, optimizedFactors, optimizedEinheiten);
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
                <div className="events-drink-list">
                  {selectedDrinks.map((drink) => {
                    const factor = normalizeDistributionFactor(drinkDistributionFactors[drink.id]);
                    const einheiten = Array.isArray(drink.einheiten) ? drink.einheiten : [];
                    const selectedIndices = drinkSelectedEinheiten[drink.id] || new Set([0]);
                    const isDeleteVisible = swipeDeleteVisibleId === drink.id;
                    return (
                      <DrinkRow
                        key={drink.id}
                        drink={drink}
                        factor={factor}
                        einheiten={einheiten}
                        selectedIndices={selectedIndices}
                        isDeleteVisible={isDeleteVisible}
                        onToggleEinheit={(idx) => toggleEinheit(drink.id, idx)}
                        onUpdateFactor={(val) => updateDistributionFactor(drink.id, val)}
                        onRemove={() => toggleCustomDrink(drink.id)}
                        onSwipeDeleteVisible={() => setSwipeDeleteVisibleId(drink.id)}
                        onSwipeDeleteHidden={() => setSwipeDeleteVisibleId((prev) => prev === drink.id ? null : prev)}
                        minFactor={MIN_DISTRIBUTION_FACTOR}
                        maxFactor={MAX_DISTRIBUTION_FACTOR}
                      />
                    );
                  })}
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
