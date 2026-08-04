import React, { useState, useEffect, useRef } from 'react';
import './EventsPage.css';
import { subscribeToCustomDrinks, saveCustomDrink, deleteCustomDrink } from '../utils/eventsFirestore';
import OverviewAddFab from './OverviewAddFab';
import { DRINK_CATEGORIES, getDrinkCategoryLabel, PREDEFINED_DRINKS } from '../utils/drinkCategories';
import { getCustomLists, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

const SWIPE_DELETE_THRESHOLD = 56;
const SWIPE_DELETE_MAX_OFFSET = 96;
const SWIPE_DIRECTION_LOCK_THRESHOLD = 6;

function SwipeableDrinkCard({ drink, isDeleteVisible, onEdit, onDelete, onSwipeDeleteVisible, onSwipeDeleteHidden, swipeDeleteIcon }) {
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
      const isDeleteButton = e.target.closest('.events-drink-row-swipe-action');
      if (isDeleteButton) return;
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
    onDelete(drink);
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
      onTouchCancel={() => resetSwipe()}
    >
      <div className="events-drink-row-swipe-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="events-drink-row-swipe-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${drink.name} löschen`}
          >
            {isBase64Image(swipeDeleteIcon) ? (
              <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
            ) : (
              <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
            )}
          </button>
        )}
      </div>
      <div className="events-drink-row-content" style={swipeContentStyle} onClick={() => onEdit(drink)}>
        <div className="events-drink-row-name">{drink.name}</div>
        <div className="events-drink-row-details">
          <div className="events-drink-row-einheiten">
            <span className="events-card-meta">
              {[
                drink.kategorie ? getDrinkCategoryLabel(drink.kategorie) : null,
                Array.isArray(drink.einheiten) && drink.einheiten.length > 0
                  ? drink.einheiten
                      .map((e) => getUnitSizeLabel(e.einheitsgroesse) || String(e.einheitsgroesse))
                      .join(', ')
                  : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const UNIT_SIZES = [
  { label: '200 ml', value: 0.2 },
  { label: '330 ml', value: 0.33 },
  { label: '500 ml', value: 0.5 },
  { label: '750 ml', value: 0.75 },
  { label: '1,0 l', value: 1.0 },
  { label: '1,5 l', value: 1.5 },
  { label: '2,0 l', value: 2.0 },
  { label: '5,0 l (Pittermännchen)', value: 5.0 },
  { label: '10,0 l (Fässchen)', value: 10.0 },
];

const getUnitSizeLabel = (liters) => {
  const value = Number(liters);
  if (!Number.isFinite(value) || value <= 0) return null;
  const configuredUnit = UNIT_SIZES.find((unit) => unit.value === value);
  if (configuredUnit) return configuredUnit.label;
  if (value < 1) return `${Math.round(value * 1000)} ml`;
  return `${value.toFixed(1).replace('.', ',')} l`;
};

const emptyEinheit = () => ({
  einheitsgroesse: 0.5,
  gebindeinheit: '',
  einheitenProGebinde: '',
});

const emptyForm = () => ({
  name: '',
  kategorie: '',
  einheiten: [emptyEinheit()],
});

function DrinkManagementPage({ onBack, currentUser }) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [isPredefined, setIsPredefined] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [packageUnits, setPackageUnits] = useState([]);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const [swipeDeleteVisibleId, setSwipeDeleteVisibleId] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    getCustomLists().then((lists) => {
      setPackageUnits(lists.packageUnits || []);
    }).catch(() => {
      setPackageUnits([]);
    });
    import('../utils/customLists').then(({ getButtonIcons }) => {
      getButtonIcons().then((icons) => setButtonIcons(icons)).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubscribe = subscribeToCustomDrinks(currentUser.id, (loaded) => {
      setDrinks(loaded);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser?.id]);

  const openNew = () => {
    setEditId(null);
    setIsPredefined(false);
    setForm(emptyForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (drink) => {
    setEditId(drink.id);
    setIsPredefined(Boolean(drink.predefined));
    setForm({
      name: drink.name || '',
      kategorie: drink.kategorie || '',
      einheiten:
        Array.isArray(drink.einheiten) && drink.einheiten.length > 0
          ? drink.einheiten.map((e) => ({
              einheitsgroesse: e.einheitsgroesse ?? 0.5,
              gebindeinheit: e.gebindeinheit || '',
              einheitenProGebinde: e.einheitenProGebinde ?? '',
            }))
          : [emptyEinheit()],
    });
    setError('');
    setShowForm(true);
  };

  const addEinheit = () => {
    setForm((f) => ({ ...f, einheiten: [...f.einheiten, emptyEinheit()] }));
  };

  const removeEinheit = (idx) => {
    setForm((f) => ({ ...f, einheiten: f.einheiten.filter((_, i) => i !== idx) }));
  };

  const updateEinheit = (idx, field, value) => {
    setForm((f) => ({
      ...f,
      einheiten: f.einheiten.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isPredefined && !form.name.trim()) {
      setError('Bitte einen Namen angeben.');
      return;
    }
    if (form.einheiten.length === 0) {
      setError('Bitte mindestens eine Einheit angeben.');
      return;
    }
    for (const einheit of form.einheiten) {
      if (!einheit.einheitsgroesse) {
        setError('Bitte eine Einheitsgröße pro Einheit angeben.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...(isPredefined ? {} : { name: form.name.trim(), kategorie: form.kategorie || null }),
        einheiten: form.einheiten.map((e) => {
          const einheit = { einheitsgroesse: Number(e.einheitsgroesse) };
          const gebindeinheitTrimmed = String(e.gebindeinheit || '').trim();
          if (gebindeinheitTrimmed) einheit.gebindeinheit = gebindeinheitTrimmed;
          if (e.einheitenProGebinde !== '' && e.einheitenProGebinde !== null && e.einheitenProGebinde !== undefined) {
            einheit.einheitenProGebinde = Number(e.einheitenProGebinde);
          }
          return einheit;
        }),
      };
      if (isPredefined) {
        await saveCustomDrink(currentUser.id, { ...payload, predefined: true }, editId || undefined);
      } else {
        await saveCustomDrink(currentUser.id, payload, editId || undefined);
      }
      setShowForm(false);
    } catch (err) {
      console.error('Error saving custom drink:', err);
      setError('Das Getränk konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (drink) => {
    if (!window.confirm(`Möchtest du "${drink.name}" wirklich löschen?`)) return;
    try {
      await deleteCustomDrink(currentUser.id, drink.id);
    } catch (err) {
      console.error('Error deleting custom drink:', err);
    }
  };

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{editId ? 'Getränk bearbeiten' : 'Neues Getränk'}</h2>
          <button
            className="events-close-btn"
            onClick={() => setShowForm(false)}
            aria-label="Abbrechen"
            title="Abbrechen"
          >
            ×
          </button>
        </div>
        <form className="events-form" onSubmit={handleSave} ref={formRef}>
          <label className="events-form-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="z. B. Craft-Bier, Apfelsaft, ..."
              required={!isPredefined}
              disabled={isPredefined}
            />
          </label>

          <label className="events-form-field">
            <span>Getränkekategorie</span>
            <select
              value={form.kategorie}
              onChange={(e) => setForm((f) => ({ ...f, kategorie: e.target.value }))}
              disabled={isPredefined}
            >
              <option value="">Keine Kategorie</option>
              {DRINK_CATEGORIES.map((cat) =>
                cat.subcategories ? (
                  <optgroup key={cat.id} label={cat.label}>
                    <option value={cat.id}>{cat.label}</option>
                    {cat.subcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                )
              )}
            </select>
          </label>

          <div className="events-form-field">
            <span>Einheiten</span>
            {form.einheiten.map((einheit, idx) => (
              <div key={idx} className="events-form-row events-einheit-row">
                <label className="events-form-field">
                  <span>Einheitsgröße</span>
                  <select
                    value={einheit.einheitsgroesse}
                    onChange={(e) => updateEinheit(idx, 'einheitsgroesse', e.target.value)}
                  >
                    {UNIT_SIZES.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </label>
                <label className="events-form-field">
                  <span>Gebindeinheit</span>
                  {packageUnits.length > 0 ? (
                    <select
                      value={einheit.gebindeinheit}
                      onChange={(e) => updateEinheit(idx, 'gebindeinheit', e.target.value)}
                    >
                      <option value="">Keine Angabe</option>
                      {packageUnits.map((unit) => (
                        <option key={unit.id} value={unit.singular}>{unit.singular}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={einheit.gebindeinheit}
                      onChange={(e) => updateEinheit(idx, 'gebindeinheit', e.target.value)}
                      placeholder="z. B. Flasche, Dose, Kasten"
                    />
                  )}
                </label>
                <label className="events-form-field">
                  <span>Einheiten pro Gebinde</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={einheit.einheitenProGebinde}
                    onChange={(e) => updateEinheit(idx, 'einheitenProGebinde', e.target.value)}
                  />
                </label>
                {form.einheiten.length > 1 && (
                  <button
                    type="button"
                    className="events-secondary-btn"
                    onClick={() => removeEinheit(idx)}
                    aria-label="Einheit entfernen"
                  >
                    –
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="events-secondary-btn"
              onClick={addEinheit}
            >
              Einheit hinzufügen
            </button>
          </div>

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <button
              type="button"
              className="events-secondary-btn events-save-desktop-only"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" className="events-primary-btn events-save-desktop-only" disabled={saving}>
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>

        {/* FAB Save Button - mobile only */}
        <button
          type="button"
          className={`drink-save-fab-button events-save-mobile-only${fabPressed ? ' pressed' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            if (formRef.current) {
              if (typeof formRef.current.requestSubmit === 'function') {
                formRef.current.requestSubmit();
              } else {
                handleSave(e);
              }
            }
          }}
          onMouseDown={() => setFabPressed(true)}
          onMouseUp={() => setFabPressed(false)}
          onMouseLeave={() => setFabPressed(false)}
          onTouchStart={() => setFabPressed(true)}
          onTouchEnd={() => setFabPressed(false)}
          disabled={saving}
          aria-label={editId ? 'Getränk aktualisieren' : 'Getränk speichern'}
          title={editId ? 'Getränk aktualisieren' : 'Getränk speichern'}
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)} alt="Speichern" className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode) || '💾'
          )}
        </button>
        {/* Cancel FAB button - positioned at bottom-left, mobile only */}
        <button
          type="button"
          className={`events-cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
          onClick={() => setShowForm(false)}
          onTouchStart={() => setCancelPressed(true)}
          onTouchEnd={() => setCancelPressed(false)}
          onTouchCancel={() => setCancelPressed(false)}
          onMouseDown={() => setCancelPressed(true)}
          onMouseUp={() => setCancelPressed(false)}
          onMouseLeave={() => setCancelPressed(false)}
          title="Abbrechen"
          aria-label="Getränkbearbeitung abbrechen"
          disabled={saving}
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Getränke verwalten</h2>
        {onBack && (
          <button
            className="events-close-btn"
            onClick={onBack}
            aria-label="Zurück"
            title="Zurück"
          >
            ×
          </button>
        )}
      </div>

      {loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : (
        <div className="events-list">
          {[...PREDEFINED_DRINKS, ...drinks].map((drink) => {
            const isDeletable = !drink.predefined;
            if (isDeletable) {
              const swipeDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode) || '🗑';
              return (
                <SwipeableDrinkCard
                  key={drink.id}
                  drink={drink}
                  isDeleteVisible={swipeDeleteVisibleId === drink.id}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSwipeDeleteVisible={() => setSwipeDeleteVisibleId(drink.id)}
                  onSwipeDeleteHidden={() => setSwipeDeleteVisibleId(null)}
                  swipeDeleteIcon={swipeDeleteIcon}
                />
              );
            }
            return (
              <div key={drink.id} className="events-card" onClick={() => openEdit(drink)}>
                <div className="events-card-main">
                  <h3>{drink.name}</h3>
                  <p className="events-card-meta">
                    {[
                      drink.kategorie ? getDrinkCategoryLabel(drink.kategorie) : null,
                      Array.isArray(drink.einheiten) && drink.einheiten.length > 0
                        ? drink.einheiten
                            .map((e) => getUnitSizeLabel(e.einheitsgroesse) || String(e.einheitsgroesse))
                            .join(', ')
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            );
          })}
          {drinks.length === 0 && (
            <p className="events-info-text">Noch keine eigenen Getränke angelegt.</p>
          )}
        </div>
      )}
      <OverviewAddFab onClick={openNew} title="Getränk anlegen" ariaLabel="Getränk anlegen" />
    </div>
  );
}

export default DrinkManagementPage;
