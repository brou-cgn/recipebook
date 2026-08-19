import React, { useState, useEffect, useRef, useMemo } from 'react';
import './EventsPage.css';
import { subscribeToAllCustomDrinks, saveCustomDrink, deleteCustomDrink } from '../utils/eventsFirestore';
import OverviewAddFab from './OverviewAddFab';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import useUndoableDelete from '../hooks/useUndoableDelete';
import RecipeTypeahead from './RecipeTypeahead';
import { DRINK_CATEGORIES, getDrinkCategoryLabel, mergePredefinedDrinks } from '../utils/drinkCategories';
import { getCustomLists, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { getUsers } from '../utils/userManagement';
import { isBase64Image } from '../utils/imageUtils';
import { encodeRecipeLink, containsHashForTypeahead } from '../utils/recipeLinks';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { parseIngredientPartsSync } from '../utils/ingredientUtils';
import { updateRecipe } from '../utils/recipeFirestore';

const DRINK_RECIPE_CATEGORY = 'Drinks';

const CATEGORY_ORDER = DRINK_CATEGORIES.reduce((acc, cat) => {
  acc.push(cat.id);
  if (Array.isArray(cat.subcategories)) {
    cat.subcategories.forEach((sub) => acc.push(sub.id));
  }
  return acc;
}, []);
const UNCATEGORIZED_GROUP_ID = '__uncategorized__';

const groupDrinksByCategory = (drinksList, recipes) => {
  const groups = new Map();
  drinksList.forEach((drink) => {
    const groupId = drink.kategorie && CATEGORY_ORDER.includes(drink.kategorie)
      ? drink.kategorie
      : UNCATEGORIZED_GROUP_ID;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(drink);
  });

  const orderedGroupIds = [...CATEGORY_ORDER.filter((id) => groups.has(id))];
  if (groups.has(UNCATEGORIZED_GROUP_ID)) orderedGroupIds.push(UNCATEGORIZED_GROUP_ID);

  return orderedGroupIds.map((groupId) => ({
    id: groupId,
    label: groupId === UNCATEGORIZED_GROUP_ID ? 'Ohne Kategorie' : getDrinkCategoryLabel(groupId),
    drinks: [...groups.get(groupId)].sort((a, b) =>
      resolveDrinkDisplay(a, recipes).displayName.localeCompare(
        resolveDrinkDisplay(b, recipes).displayName,
        'de',
        { sensitivity: 'base' },
      )
    ),
  }));
};

const isDrinkRecipe = (recipe) =>
  Array.isArray(recipe?.speisekategorie)
    ? recipe.speisekategorie.includes(DRINK_RECIPE_CATEGORY)
    : recipe?.speisekategorie === DRINK_RECIPE_CATEGORY;

const SWIPE_DELETE_THRESHOLD = 56;
const SWIPE_DELETE_MAX_OFFSET = 96;
const SWIPE_DIRECTION_LOCK_THRESHOLD = 6;

const UNIT_SIZES = [
  { label: '200 ml', value: 0.2 },
  { label: '330 ml', value: 0.33 },
  { label: '500 ml', value: 0.5 },
  { label: '750 ml', value: 0.75 },
  { label: '1,0 l', value: 1.0 },
  { label: '1,5 l', value: 1.5 },
  { label: '2,0 l', value: 2.0 },
  { label: '5,0 l', value: 5.0 },
  { label: '10,0 l', value: 10.0 },
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
  einheit: '',
  gebindeinheit: '',
  einheitenProGebinde: '',
});

const emptyForm = () => ({
  name: '',
  kategorie: '',
  einheiten: [emptyEinheit()],
});

function DrinkRow({ drink, displayName, ownerName, canManage, onEdit, onDelete, swipeDeleteIcon }) {
  const touchStartXRef = React.useRef(null);
  const touchStartYRef = React.useRef(null);
  const swipeDirectionLockedRef = React.useRef(null);
  const isSwipingRef = React.useRef(false);
  const swipeOffsetRef = React.useRef(0);
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const [isDeleteVisible, setIsDeleteVisible] = React.useState(false);

  const effectiveOffset = isDeleteVisible ? -SWIPE_DELETE_MAX_OFFSET : swipeOffset;

  const resetSwipe = ({ keepDelete = false } = {}) => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
    swipeOffsetRef.current = 0;
    setSwipeOffset(0);
    if (!keepDelete) setIsDeleteVisible(false);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches?.[0];
    if (!touch || drink.predefined || !canManage) return;
    if (isDeleteVisible) setIsDeleteVisible(false);
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
  };

  const handleTouchMove = (e) => {
    const touch = e.touches?.[0];
    if (!touch || touchStartXRef.current === null || touchStartYRef.current === null || drink.predefined || !canManage) return;

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipeDirectionLockedRef.current && (absX > SWIPE_DIRECTION_LOCK_THRESHOLD || absY > SWIPE_DIRECTION_LOCK_THRESHOLD)) {
      swipeDirectionLockedRef.current = absX > absY ? 'horizontal' : 'vertical';
    }

    if (swipeDirectionLockedRef.current === 'horizontal' && deltaX < 0) {
      isSwipingRef.current = true;
      const clamped = Math.max(deltaX, -SWIPE_DELETE_MAX_OFFSET);
      swipeOffsetRef.current = clamped;
      setSwipeOffset(clamped);
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingRef.current && Math.abs(swipeOffsetRef.current) >= SWIPE_DELETE_THRESHOLD) {
      setIsDeleteVisible(true);
      resetSwipe({ keepDelete: true });
      return;
    }
    resetSwipe();
  };

  return (
    <div
      className={`drink-list-item events-card${effectiveOffset < 0 ? ' swipe-delete-active' : ''}`}
      style={{ padding: 0 }}
    >
      {!drink.predefined && canManage && (
        <div className="drink-swipe-delete-background" aria-hidden={!isDeleteVisible}>
          {isDeleteVisible && (
            <button
              type="button"
              className="drink-swipe-delete-action"
              onClick={() => { onDelete(drink); resetSwipe(); }}
              aria-label={`${displayName} löschen`}
            >
              {isBase64Image(swipeDeleteIcon) ? (
                <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
              ) : (
                <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
              )}
            </button>
          )}
        </div>
      )}
      <div
        className="drink-swipe-content events-card-main"
        style={{ transform: `translateX(${effectiveOffset}px)`, padding: '16px 20px', width: '100%' }}
        onClick={effectiveOffset < 0 || !canManage ? undefined : () => onEdit(drink)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetSwipe}
      >
        <div className="drink-list-item-header delete-row-hover-target">
          <h3>{displayName}</h3>
          {!drink.predefined && canManage && (
            <DeleteRowButton
              itemName={displayName}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(drink);
              }}
            />
          )}
        </div>
        <p className="events-card-meta">
          {[
            drink.kategorie ? getDrinkCategoryLabel(drink.kategorie) : null,
            Array.isArray(drink.einheiten) && drink.einheiten.length > 0
              ? drink.einheiten
                  .map((e) => getUnitSizeLabel(e.einheitsgroesse) || String(e.einheitsgroesse))
                  .join(', ')
              : null,
            ownerName ? `von ${ownerName}` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

function DrinkManagementPage({ onBack, currentUser, recipes }) {
  const [drinks, setDrinks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editOwnerId, setEditOwnerId] = useState(null);
  const [isPredefined, setIsPredefined] = useState(false);
  const isAdmin = currentUser?.isAdmin === true;
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [packageUnits, setPackageUnits] = useState([]);
  const [drinkUnits, setDrinkUnits] = useState([]);
  const [showNameTypeahead, setShowNameTypeahead] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const { notifyDeleted, undo, pendingName } = useUndoableDelete();
  const formRef = useRef(null);

  useEffect(() => {
    getCustomLists().then((lists) => {
      setPackageUnits(lists.packageUnits || []);
      setDrinkUnits(lists.drinkUnits || []);
    }).catch(() => {
      setPackageUnits([]);
      setDrinkUnits([]);
    });
    import('../utils/customLists').then(({ getButtonIcons }) => {
      getButtonIcons().then((icons) => setButtonIcons(icons)).catch(() => {});
    });
  }, []);

  useEffect(() => {
    const handler = () => setIsDarkMode(getDarkModePreference());
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    getUsers().then(setAllUsers).catch(() => setAllUsers([]));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAllCustomDrinks((loaded) => {
      setDrinks(loaded);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const drinkRecipes = useMemo(
    () => (Array.isArray(recipes) ? recipes.filter(isDrinkRecipe) : []),
    [recipes]
  );
  const allDrinks = useMemo(
    () => mergePredefinedDrinks(drinks, currentUser?.id),
    [drinks, currentUser?.id]
  );
  const groupedDrinks = useMemo(() => groupDrinksByCategory(allDrinks, recipes), [allDrinks, recipes]);
  const getOwnerFirstName = (ownerId) => {
    if (!ownerId) return null;
    return allUsers.find((u) => u.id === ownerId)?.vorname || null;
  };

  const nameDrinkDisplay = resolveDrinkDisplay(form.name, recipes);

  const openNew = () => {
    setEditId(null);
    setEditOwnerId(null);
    setIsPredefined(false);
    setForm(emptyForm());
    setError('');
    setShowNameTypeahead(false);
    setShowForm(true);
  };

  const openEdit = (drink) => {
    setEditId(drink.id);
    setEditOwnerId(drink.ownerId || null);
    setIsPredefined(Boolean(drink.predefined));
    setForm({
      name: drink.name || '',
      kategorie: drink.kategorie || '',
      einheiten:
        Array.isArray(drink.einheiten) && drink.einheiten.length > 0
          ? drink.einheiten.map((e) => ({
              einheitsgroesse: e.einheitsgroesse ?? 0.5,
              einheit: e.einheit || '',
              gebindeinheit: e.gebindeinheit || '',
              einheitenProGebinde: e.einheitenProGebinde ?? '',
            }))
          : [emptyEinheit()],
    });
    setError('');
    setShowNameTypeahead(false);
    setShowForm(true);
  };

  const handleNameChange = (value) => {
    setForm((f) => ({ ...f, name: value }));
    setShowNameTypeahead(containsHashForTypeahead(value));
  };

  const handleNameRecipeSelect = (selectedRecipe) => {
    setForm((f) => ({ ...f, name: encodeRecipeLink(selectedRecipe.id, selectedRecipe.title) }));
    setShowNameTypeahead(false);
  };

  const handleClearNameLink = () => {
    setForm((f) => ({ ...f, name: '' }));
  };

  const closeForm = () => {
    setShowNameTypeahead(false);
    setShowForm(false);
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

  const handleToggleIngredientIncluded = async (ingredientIndex) => {
    const recipe = nameDrinkDisplay.recipe;
    if (!recipe) return;
    const currentIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const updatedIngredients = currentIngredients.map((item, idx) => {
      if (idx !== ingredientIndex) return item;
      const normalized = typeof item === 'string' ? { type: 'ingredient', text: item } : item;
      const currentlyIncluded = normalized.includedInCalculation !== false;
      return { ...normalized, includedInCalculation: !currentlyIncluded };
    });
    try {
      await updateRecipe(recipe.id, { ingredients: updatedIngredients });
    } catch (err) {
      console.error('Error updating ingredient calculation flag:', err);
    }
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
          const einheitTrimmed = String(e.einheit || '').trim();
          if (einheitTrimmed) einheit.einheit = einheitTrimmed;
          const gebindeinheitTrimmed = String(e.gebindeinheit || '').trim();
          if (gebindeinheitTrimmed) einheit.gebindeinheit = gebindeinheitTrimmed;
          if (e.einheitenProGebinde !== '' && e.einheitenProGebinde !== null && e.einheitenProGebinde !== undefined) {
            einheit.einheitenProGebinde = Number(e.einheitenProGebinde);
          }
          return einheit;
        }),
      };
      const targetOwnerId = editId ? (editOwnerId || currentUser.id) : currentUser.id;
      if (isPredefined) {
        await saveCustomDrink(targetOwnerId, {
          ...payload,
          name: form.name.trim(),
          kategorie: form.kategorie || null,
          predefined: true,
        }, editId || undefined);
      } else {
        await saveCustomDrink(targetOwnerId, payload, editId || undefined);
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
    const displayName = resolveDrinkDisplay(drink, recipes).displayName;
    try {
      await deleteCustomDrink(drink.ownerId || currentUser.id, drink.id);
    } catch (err) {
      console.error('Error deleting custom drink:', err);
      return;
    }
    notifyDeleted({
      id: `${drink.ownerId || ''}_${drink.id}`,
      name: displayName,
      undo: async () => {
        // eslint-disable-next-line no-unused-vars
        const { id, ownerId, predefined, ...payload } = drink;
        try {
          await saveCustomDrink(drink.ownerId || currentUser.id, payload, drink.id);
        } catch (err) {
          console.error('Error restoring custom drink:', err);
        }
      },
    });
  };

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{editId ? 'Getränk bearbeiten' : 'Neues Getränk'}</h2>
        </div>
        <form className="events-form" onSubmit={handleSave} ref={formRef}>
          <label className="events-form-field">
            <span>Name</span>
            <div className="events-name-input-wrapper">
              <input
                type="text"
                value={nameDrinkDisplay.isRecipe ? nameDrinkDisplay.displayName : form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="z. B. Craft-Bier, Apfelsaft, ... (# verlinkt ein Rezept)"
                required={!isPredefined}
                disabled={isPredefined}
                readOnly={nameDrinkDisplay.isRecipe}
                className={nameDrinkDisplay.isRecipe ? 'recipe-link-input' : ''}
                title={nameDrinkDisplay.isRecipe ? `Verlinktes Rezept: ${nameDrinkDisplay.displayName}` : undefined}
              />
              {nameDrinkDisplay.isRecipe && !isPredefined && (
                <button
                  type="button"
                  className="events-name-link-clear-btn"
                  onClick={handleClearNameLink}
                  aria-label="Verknüpfung entfernen"
                  title="Verknüpfung entfernen"
                >
                  ×
                </button>
              )}
            </div>
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
              <div key={idx} className="events-einheit-group">
                <div className="events-form-row events-einheit-row">
                  <label className="events-form-field">
                    <span>{nameDrinkDisplay.isRecipe ? 'Einheitsgröße (ml)' : 'Einheitsgröße'}</span>
                    {nameDrinkDisplay.isRecipe ? (
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={
                          einheit.einheitsgroesse !== '' && einheit.einheitsgroesse !== null && einheit.einheitsgroesse !== undefined
                            ? Math.round(Number(einheit.einheitsgroesse) * 1000)
                            : ''
                        }
                        onChange={(e) => {
                          const ml = e.target.value;
                          updateEinheit(idx, 'einheitsgroesse', ml === '' ? '' : Number(ml) / 1000);
                        }}
                        placeholder="z. B. 250"
                      />
                    ) : (
                      <select
                        value={einheit.einheitsgroesse}
                        onChange={(e) => updateEinheit(idx, 'einheitsgroesse', e.target.value)}
                      >
                        {UNIT_SIZES.map((u) => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                    )}
                  </label>
                  <label className="events-form-field">
                    <span>Einheit</span>
                    {drinkUnits.length > 0 ? (
                      <select
                        value={einheit.einheit}
                        onChange={(e) => updateEinheit(idx, 'einheit', e.target.value)}
                      >
                        <option value="">Keine Angabe</option>
                        {drinkUnits.map((unit) => (
                          <option key={unit.id} value={unit.singular}>{unit.singular}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={einheit.einheit}
                        onChange={(e) => updateEinheit(idx, 'einheit', e.target.value)}
                        placeholder="z. B. Glas, Flasche, Dose"
                      />
                    )}
                  </label>
                </div>
                <div className="events-form-row events-einheit-row">
                  <label className="events-form-field">
                    <span>Menge/Gebinde</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={einheit.einheitenProGebinde}
                      onChange={(e) => updateEinheit(idx, 'einheitenProGebinde', e.target.value)}
                    />
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

          {nameDrinkDisplay.isRecipe && nameDrinkDisplay.recipe && (
            <div className="events-form-field">
              <span>Zutaten von „{nameDrinkDisplay.displayName}"</span>
              <ul className="drink-recipe-ingredient-list">
                {nameDrinkDisplay.ingredients.map((rawItem, idx) => {
                  const item = typeof rawItem === 'string' ? { type: 'ingredient', text: rawItem } : rawItem;
                  if (item.type === 'heading') return null;
                  const { amount, amountMax, unit, name } = parseIngredientPartsSync(item.text);
                  const amountLabel = amount != null
                    ? `${amount}${amountMax != null ? `–${amountMax}` : ''}${unit ? ` ${unit}` : ''}`
                    : null;
                  const included = item.includedInCalculation !== false;
                  return (
                    <li key={idx} className="drink-recipe-ingredient-row">
                      <span className="drink-recipe-ingredient-name">{name}</span>
                      {amountLabel && <span className="drink-recipe-ingredient-amount">{amountLabel}</span>}
                      <label className="drink-recipe-ingredient-toggle">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => handleToggleIngredientIncluded(idx)}
                          aria-label={`${name} in Kalkulation berücksichtigen`}
                        />
                        <span className="drink-recipe-ingredient-toggle-slider" aria-hidden="true" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <button
              type="button"
              className="events-secondary-btn events-save-desktop-only"
              onClick={closeForm}
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
          onClick={closeForm}
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

        {showNameTypeahead && (
          <RecipeTypeahead
            recipes={drinkRecipes}
            onSelect={handleNameRecipeSelect}
            onCancel={() => setShowNameTypeahead(false)}
            inputValue={form.name}
          />
        )}
      </div>
    );
  }

  const swipeDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode) || '🗑';
  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode) || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode);

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Getränke verwalten</h2>
        {onBack && (
          <button
            className="app-close-button"
            onClick={onBack}
            aria-label="Getränke verwalten schließen"
            title="Getränke verwalten schließen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Getränke verwalten schließen" className="app-close-button-icon-img" />
            ) : (
              closeIcon || '×'
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : (
        <div className="events-list">
          {groupedDrinks.map((group) => (
            <div key={group.id} className="drink-category-group">
              <h3 className="drink-category-group-header">{group.label}</h3>
              {group.drinks.map((drink) => (
                <DrinkRow
                  key={`${drink.ownerId || ''}_${drink.id}`}
                  drink={drink}
                  displayName={resolveDrinkDisplay(drink, recipes).displayName}
                  ownerName={drink.ownerId && drink.ownerId !== currentUser?.id ? getOwnerFirstName(drink.ownerId) : null}
                  canManage={drink.predefined || !drink.ownerId || drink.ownerId === currentUser?.id || isAdmin}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  swipeDeleteIcon={swipeDeleteIcon}
                />
              ))}
            </div>
          ))}
          {drinks.length === 0 && (
            <p className="events-info-text">Noch keine Getränke angelegt.</p>
          )}
        </div>
      )}
      <OverviewAddFab onClick={openNew} title="Getränk anlegen" ariaLabel="Getränk anlegen" />
      <UndoSnackbar itemName={pendingName} onUndo={undo} />
    </div>
  );
}

export default DrinkManagementPage;
