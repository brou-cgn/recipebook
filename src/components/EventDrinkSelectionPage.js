import React, { useState, useRef, useEffect } from 'react';
import './EventsPage.css';
import UnitChip from './UnitChip';
import { getEffectiveIcon, DEFAULT_BUTTON_ICONS } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import DeleteRowButton from './DeleteRowButton';
import useUndoableDelete from '../hooks/useUndoableDelete';

const MIN_DISTRIBUTION_FACTOR = 0.1;
const MAX_DISTRIBUTION_FACTOR = 2.0;
const DEFAULT_PUFFER_PROZENT = 25;

const normalizeDistributionFactor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed < MIN_DISTRIBUTION_FACTOR || parsed > MAX_DISTRIBUTION_FACTOR) return 1;
  return parsed;
};

const getEinheitSizeLabel = (einheit) => {
  if (!einheit) return '';
  const liters = Number(einheit.einheitsgroesse);
  if (liters < 1) {
    return `${Math.round(liters * 1000)} ml`;
  }
  return `${liters.toFixed(1).replace('.', ',')} l`;
};

const getEinheitLabel = (einheit) => {
  if (!einheit) return '';
  const sizeLabel = getEinheitSizeLabel(einheit);
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

function EinheitenTypeahead({ einheiten, selectedIndices, onToggle, drinkName, onOpenChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const unselectedEinheiten = einheiten
    .map((e, idx) => ({ einheit: e, idx }))
    .filter(({ idx }) => !selectedIndices.has(idx));

  const filtered = query.trim()
    ? unselectedEinheiten.filter(({ einheit }) =>
        getEinheitLabel(einheit).toLowerCase().includes(query.toLowerCase()),
      )
    : unselectedEinheiten;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  // The dropdown itself decides its open/visible state (also gated on having
  // results), so it's the source of truth for whether it's actually showing.
  // The row needs to know this to lift itself above the next row, which sits
  // right on top of it in paint order otherwise (see .events-drink-row in
  // EventsPage.css).
  const isShowingDropdown = open && filtered.length > 0;
  useEffect(() => {
    onOpenChange?.(isShowingDropdown);
    return () => onOpenChange?.(false);
  }, [isShowingDropdown, onOpenChange]);

  if (unselectedEinheiten.length === 0) return null;

  return (
    <div className="events-einheiten-typeahead" ref={containerRef}>
      <input
        type="text"
        className="events-einheiten-typeahead-input"
        placeholder="Einheit hinzufügen …"
        value={query}
        aria-label={`${drinkName} Einheit suchen`}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {isShowingDropdown && (
        <ul className="events-einheiten-typeahead-dropdown" role="listbox">
          {filtered.map(({ einheit, idx }) => (
            <li key={idx} role="option" aria-selected="false">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onToggle(idx);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {getEinheitLabel(einheit)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DrinkRow({
  drink,
  displayName,
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
  swipeDeleteIcon,
}) {
  const { offset, reset, handlers } = useSwipeToDelete({
    isDeleteVisible,
    onDeleteVisibleChange: (visible) => (visible ? onSwipeDeleteVisible() : onSwipeDeleteHidden()),
  });
  const [factorInput, setFactorInput] = useState(factor.toFixed(2));
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);

  const handleSwipeDeleteClick = () => {
    onRemove();
    reset();
  };

  const swipeContentStyle = {
    transform: `translateX(${offset}px)`,
    transition: 'transform 0.15s ease',
  };

  return (
    <div
      className={`events-drink-row${offset < 0 ? ' swipe-delete-active' : ''}${isUnitDropdownOpen ? ' events-drink-row--dropdown-open' : ''}`}
    >
      <div className="events-drink-row-swipe-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="events-drink-row-swipe-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${displayName} entfernen`}
          >
            {isBase64Image(swipeDeleteIcon) ? (
              <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
            ) : (
              <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
            )}
          </button>
        )}
      </div>
      <div
        className="events-drink-row-content"
        style={swipeContentStyle}
        {...handlers}
      >
        <div className="events-drink-row-header delete-row-hover-target">
          <div className="events-drink-row-name">{displayName}</div>
          <DeleteRowButton
            className="events-drink-row-delete-btn"
            itemName={displayName}
            onClick={onRemove}
          />
        </div>
        <div className="events-drink-row-details">
          <div className="events-drink-row-einheiten">
            {einheiten.length > 1 ? (
              <div className="events-unit-chip-row">
                {einheiten
                  .map((einheit, idx) => ({ einheit, idx }))
                  .filter(({ idx }) => selectedIndices.has(idx))
                  .map(({ einheit, idx }) => (
                    <UnitChip
                      key={idx}
                      label={getEinheitSizeLabel(einheit)}
                      ariaLabel={getEinheitLabel(einheit)}
                      selected={true}
                      onToggle={() => onToggleEinheit(idx)}
                    />
                  ))}
                <EinheitenTypeahead
                  einheiten={einheiten}
                  selectedIndices={selectedIndices}
                  onToggle={onToggleEinheit}
                  drinkName={displayName}
                  onOpenChange={setIsUnitDropdownOpen}
                />
              </div>
            ) : einheiten.length === 1 ? (
              <span className="events-drink-row-single-unit">{getEinheitLabel(einheiten[0])}</span>
            ) : (
              <span className="events-drink-row-empty-label">Keine Einheit ausgewählt</span>
            )}
          </div>
          <div className="events-drink-row-factor">
            <input
              type="number"
              inputMode="decimal"
              min={minFactor}
              max={maxFactor}
              step="0.01"
              value={factorInput}
              onChange={(e) => {
                setFactorInput(e.target.value);
                onUpdateFactor(e.target.value);
              }}
              onBlur={() => setFactorInput(factor.toFixed(2))}
              aria-label={`${displayName} Faktor`}
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
  pufferProzent: initialPufferProzent,
  recipes,
  onSave,
  onBack,
  buttonIcons,
  isDarkMode,
  currentUserId,
}) {
  const effectiveButtonIcons = buttonIcons || DEFAULT_BUTTON_ICONS;
  const swipeDeleteIcon = getEffectiveIcon(effectiveButtonIcons, 'swipeDelete', isDarkMode) || '🗑';
  const [customDrinkIds, setCustomDrinkIds] = useState(initialCustomDrinkIds ?? []);
  const [drinkDistributionFactors, setDrinkDistributionFactors] = useState(
    initialDrinkDistributionFactors ?? {},
  );
  const [drinkSelectedEinheiten, setDrinkSelectedEinheiten] = useState(() =>
    buildInitialSelectedEinheiten(customDrinks, initialCustomDrinkIds, initialDrinkSelectedEinheiten),
  );
  const [pufferProzent, setPufferProzent] = useState(initialPufferProzent ?? DEFAULT_PUFFER_PROZENT);
  const [drinkToAdd, setDrinkToAdd] = useState('');
  const [showOwnOnly, setShowOwnOnly] = useState(true);
  const [swipeDeleteVisibleId, setSwipeDeleteVisibleId] = useState(null);
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();

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
    // Drinks still pending an undoable swipe-delete haven't actually been removed from
    // customDrinkIds yet (see handleRemoveDrink), but should be saved as removed since
    // they're already hidden from view.
    const drinkIdsToSave = customDrinkIds.filter((id) => !pendingDeleteKeys.has(id));
    const optimizedFactors = drinkIdsToSave.reduce((acc, drinkId) => {
      const factor = normalizeDistributionFactor(drinkDistributionFactors[drinkId]);
      if (factor !== 1) acc[drinkId] = factor;
      return acc;
    }, {});
    const optimizedEinheiten = drinkIdsToSave.reduce((acc, drinkId) => {
      const selected = drinkSelectedEinheiten[drinkId];
      const indices = selected ? [...selected].sort((a, b) => a - b) : [0];
      if (indices.length > 1 || (indices.length === 1 && indices[0] !== 0)) {
        acc[drinkId] = indices;
      }
      return acc;
    }, {});
    onSave(drinkIdsToSave, optimizedFactors, optimizedEinheiten, Number(pufferProzent));
  };

  const handleRemoveDrink = (drink) => {
    const displayName = resolveDrinkDisplay(drink, recipes).displayName;
    scheduleDelete({
      key: drink.id,
      message: `"${displayName}" entfernt.`,
      onConfirm: () => toggleCustomDrink(drink.id),
      onUndo: () => {},
    });
  };

  const selectedDrinks = customDrinks.filter((d) => customDrinkIds.includes(d.id) && !pendingDeleteKeys.has(d.id));
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
    <div className="events-page-container events-drink-selection-page">
      <div className="events-page-header">
        <h2>Getränke</h2>
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
                    .filter((d) => !showOwnOnly || !d.ownerId || d.ownerId === currentUserId)
                    .map((drink) => (
                      <option key={drink.id} value={drink.id}>{resolveDrinkDisplay(drink, recipes).displayName}</option>
                    ))}
                </select>
                <button
                  type="button"
                  className="events-drink-add-btn"
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

              <div className="drink-own-filter-row">
                <label className="drink-own-filter-label">
                  <span>Eigene Getränke</span>
                  <span className="drink-own-filter-toggle">
                    <input
                      type="checkbox"
                      checked={showOwnOnly}
                      onChange={(e) => setShowOwnOnly(e.target.checked)}
                      aria-label="Nur eigene Getränke in der Auswahl anzeigen"
                    />
                    <span className="drink-own-filter-toggle-slider" aria-hidden="true" />
                  </span>
                </label>
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
                        displayName={resolveDrinkDisplay(drink, recipes).displayName}
                        factor={factor}
                        einheiten={einheiten}
                        selectedIndices={selectedIndices}
                        isDeleteVisible={isDeleteVisible}
                        onToggleEinheit={(idx) => toggleEinheit(drink.id, idx)}
                        onUpdateFactor={(val) => updateDistributionFactor(drink.id, val)}
                        onRemove={() => handleRemoveDrink(drink)}
                        onSwipeDeleteVisible={() => setSwipeDeleteVisibleId(drink.id)}
                        onSwipeDeleteHidden={() => setSwipeDeleteVisibleId((prev) => prev === drink.id ? null : prev)}
                        minFactor={MIN_DISTRIBUTION_FACTOR}
                        maxFactor={MAX_DISTRIBUTION_FACTOR}
                        swipeDeleteIcon={swipeDeleteIcon}
                      />
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <p className="events-info-text">Noch keine eigenen Getränke angelegt.</p>
          )}
          {deleteBanners.map((banner) => (
            <div key={banner.id} className="undo-snackbar" role="status">
              <span>{banner.message}</span>
              <button type="button" className="undo-snackbar-btn" onClick={() => undoDelete(banner.id)}>
                Rückgängig
              </button>
            </div>
          ))}

          <span className="events-selected-count-badge">
            {selectedDrinks.length} {selectedDrinks.length === 1 ? 'Getränk' : 'Getränke'} ausgewählt.
          </span>
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

        <div className="events-form-actions">
          <button type="button" className="events-secondary-btn events-save-desktop-only" onClick={onBack}>
            Abbrechen
          </button>
          <button type="button" className="events-primary-btn events-save-desktop-only" onClick={handleSave}>
            Speichern
          </button>
        </div>
      </div>

      {/* FAB Save Button - mobile only, matches the "Rezept bearbeiten" FAB pattern */}
      <button
        type="button"
        className={`events-save-fab-button${fabPressed ? ' pressed' : ''}`}
        onClick={handleSave}
        onMouseDown={() => setFabPressed(true)}
        onMouseUp={() => setFabPressed(false)}
        onMouseLeave={() => setFabPressed(false)}
        onTouchStart={() => setFabPressed(true)}
        onTouchEnd={() => setFabPressed(false)}
        aria-label="Getränkeauswahl speichern"
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
        className={`events-cancel-fab-button${cancelPressed ? ' pressed' : ''}`}
        onClick={onBack}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        title="Abbrechen"
        aria-label="Getränkeauswahl abbrechen"
      >
        {isBase64Image(getEffectiveIcon(effectiveButtonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
          <img src={getEffectiveIcon(effectiveButtonIcons, 'closeButtonDefaultImg', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(effectiveButtonIcons, 'closeButtonDefaultImg', isDarkMode)
        )}
      </button>
    </div>
  );
}

export default EventDrinkSelectionPage;
