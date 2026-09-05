import React, { useState, useEffect, useRef, useMemo } from 'react';
import './EventsPage.css';
import { saveCustomDrink, deleteCustomDrink } from '../utils/eventsFirestore';
import OverviewAddFab from './OverviewAddFab';
import DeleteRowButton from './DeleteRowButton';
import useUndoableDelete from '../hooks/useUndoableDelete';
import RecipeTypeahead from './RecipeTypeahead';
import { DRINK_CATEGORIES, getDrinkCategoryLabel, mergePredefinedDrinks } from '../utils/drinkCategories';
import { getCustomLists, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { encodeRecipeLink, containsHashForTypeahead, decodeRecipeLink } from '../utils/recipeLinks';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { parseIngredientPartsSync, sumRecipeIngredientAmountsInMl } from '../utils/ingredientUtils';
import { updateRecipe } from '../utils/recipeFirestore';
import useSwipeToDelete from '../hooks/useSwipeToDelete';

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

function DrinkRow({ drink, displayName, isForeign, canManage, canAddUnits, onEdit, onAddUnits, onDelete, swipeDeleteIcon }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: drink.predefined || !canManage });
  const isClickable = canManage || canAddUnits;
  const handleRowClick = () => {
    if (canManage) onEdit(drink);
    else if (canAddUnits) onAddUnits(drink);
  };

  return (
    <div
      className={`drink-list-item events-card${offset < 0 ? ' swipe-delete-active' : ''}`}
      style={{ padding: 0 }}
    >
      {!drink.predefined && canManage && (
        <div className="drink-swipe-delete-background" aria-hidden={!isDeleteVisible}>
          {isDeleteVisible && (
            <button
              type="button"
              className="drink-swipe-delete-action"
              onClick={() => { onDelete(drink); reset(); }}
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
        style={{ transform: `translateX(${offset}px)`, padding: '16px 20px', width: '100%' }}
        onClick={offset < 0 || !isClickable ? undefined : handleRowClick}
        {...handlers}
      >
        <div className="drink-list-item-header delete-row-hover-target">
          <h3 className={isForeign ? 'drink-list-item-title--foreign' : undefined}>{displayName}</h3>
          {!drink.predefined && canManage && (
            <DeleteRowButton
              itemName={displayName}
              className="drink-list-item-delete-btn"
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
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

function DrinkManagementPage({ onBack, currentUser, recipes, customDrinks: drinks = [], customDrinksLoaded = true }) {
  const loading = !customDrinksLoaded;
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editOwnerId, setEditOwnerId] = useState(null);
  const [isPredefined, setIsPredefined] = useState(false);
  const [isAddUnitsMode, setIsAddUnitsMode] = useState(false);
  const [addUnitsDrink, setAddUnitsDrink] = useState(null);
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
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const [showOwnOnly, setShowOwnOnly] = useState(true);
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

  const drinkRecipes = useMemo(
    () => (Array.isArray(recipes) ? recipes.filter(isDrinkRecipe) : []),
    [recipes]
  );
  const allDrinks = useMemo(() => {
    const merged = mergePredefinedDrinks(drinks, currentUser?.id)
      .filter((drink) => !pendingDeleteKeys.has(`${drink.ownerId || ''}_${drink.id}`));
    if (!showOwnOnly) return merged;
    return merged.filter((drink) => !drink.ownerId || drink.ownerId === currentUser?.id);
  }, [drinks, currentUser?.id, showOwnOnly, pendingDeleteKeys]);
  const groupedDrinks = useMemo(() => groupDrinksByCategory(allDrinks, recipes), [allDrinks, recipes]);

  const nameDrinkDisplay = resolveDrinkDisplay(form.name, recipes);

  const openNew = () => {
    setEditId(null);
    setEditOwnerId(null);
    setIsPredefined(false);
    setIsAddUnitsMode(false);
    setAddUnitsDrink(null);
    setForm(emptyForm());
    setError('');
    setShowNameTypeahead(false);
    setShowForm(true);
  };

  const openEdit = (drink) => {
    setEditId(drink.id);
    setEditOwnerId(drink.ownerId || null);
    setIsPredefined(Boolean(drink.predefined));
    setIsAddUnitsMode(false);
    setAddUnitsDrink(null);
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

  // Drinks owned by another user can't be edited directly (Firestore only
  // lets the owner/an admin write their document); instead, the current
  // user maintains their own additional Einheiten alongside the owner's,
  // stored under their own account and merged in wherever the drink is used.
  const openAddUnits = (drink) => {
    setEditId(drink.id);
    setEditOwnerId(drink.ownerId || null);
    setIsPredefined(false);
    setIsAddUnitsMode(true);
    setAddUnitsDrink(drink);
    const ownEinheiten = (Array.isArray(drink.einheiten) ? drink.einheiten : [])
      .filter((e) => e.addedByUserId === currentUser?.id)
      .map((e) => ({
        einheitsgroesse: e.einheitsgroesse ?? 0.5,
        einheit: e.einheit || '',
        gebindeinheit: e.gebindeinheit || '',
        einheitenProGebinde: e.einheitenProGebinde ?? '',
      }));
    setForm({
      name: drink.name || '',
      kategorie: drink.kategorie || '',
      einheiten: ownEinheiten.length > 0 ? ownEinheiten : [emptyEinheit()],
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
    // Getränk aus einem Rezept: Kategorie immer Longdrinks, Einheitsgröße als
    // Summe der Zutatenmengen (in l) geteilt durch die Rezeptportionen,
    // Einheit immer "Drink".
    const totalMl = sumRecipeIngredientAmountsInMl(selectedRecipe.ingredients);
    const portionen = selectedRecipe.portionen || 4;
    setForm((f) => ({
      ...f,
      name: encodeRecipeLink(selectedRecipe.id, selectedRecipe.title),
      kategorie: 'longdrinks',
      einheiten: [{
        ...emptyEinheit(),
        einheitsgroesse: totalMl > 0 ? totalMl / 1000 / portionen : 0.5,
        einheit: 'Drink',
      }],
    }));
    setShowNameTypeahead(false);
  };

  const handleClearNameLink = () => {
    setForm((f) => ({ ...f, name: '' }));
  };

  const closeForm = () => {
    setShowNameTypeahead(false);
    setShowForm(false);
    setIsAddUnitsMode(false);
    setAddUnitsDrink(null);
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

  const buildEinheitenPayload = () => form.einheiten.map((e) => {
    const einheit = { einheitsgroesse: Number(e.einheitsgroesse) };
    const einheitTrimmed = String(e.einheit || '').trim();
    if (einheitTrimmed) einheit.einheit = einheitTrimmed;
    const gebindeinheitTrimmed = String(e.gebindeinheit || '').trim();
    if (gebindeinheitTrimmed) einheit.gebindeinheit = gebindeinheitTrimmed;
    if (e.einheitenProGebinde !== '' && e.einheitenProGebinde !== null && e.einheitenProGebinde !== undefined) {
      einheit.einheitenProGebinde = Number(e.einheitenProGebinde);
    }
    return einheit;
  });

  const handleSaveUnitAddition = async () => {
    setSaving(true);
    setError('');
    try {
      const einheiten = buildEinheitenPayload().filter((e) => e.einheitsgroesse);
      if (einheiten.length === 0) {
        await deleteCustomDrink(currentUser.id, editId);
      } else {
        await saveCustomDrink(currentUser.id, { einheiten, extendsOwnerId: editOwnerId }, editId);
      }
      setShowForm(false);
      setIsAddUnitsMode(false);
      setAddUnitsDrink(null);
    } catch (err) {
      console.error('Error saving drink unit addition:', err);
      setError('Die zusätzlichen Einheiten konnten nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isAddUnitsMode) {
      await handleSaveUnitAddition();
      return;
    }
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
        einheiten: buildEinheitenPayload(),
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

  const handleDelete = (drink) => {
    const ownerId = drink.ownerId || currentUser.id;
    const deletedDisplayName = resolveDrinkDisplay(drink, recipes).displayName;
    scheduleDelete({
      key: `${drink.ownerId || ''}_${drink.id}`,
      message: `"${deletedDisplayName}" gelöscht.`,
      onConfirm: async () => {
        try {
          await deleteCustomDrink(ownerId, drink.id);
        } catch (err) {
          console.error('Error deleting custom drink:', err);
        }
      },
      onUndo: () => {},
    });
  };

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{isAddUnitsMode ? 'Zusätzliche Einheiten' : editId ? 'Getränk bearbeiten' : 'Neues Getränk'}</h2>
        </div>
        <form className="events-form" onSubmit={handleSave} ref={formRef}>
          {isAddUnitsMode ? (
            <div className="events-form-field">
              <span>Getränk</span>
              <p className="drink-add-units-name">{resolveDrinkDisplay(addUnitsDrink, recipes).displayName}</p>
            </div>
          ) : (
            <>
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
            </>
          )}

          {isAddUnitsMode && (
            <div className="events-form-field">
              <span>Vorhandene Einheiten</span>
              {(Array.isArray(addUnitsDrink?.einheiten) ? addUnitsDrink.einheiten : [])
                .filter((e) => e.addedByUserId !== currentUser?.id).length > 0 ? (
                <ul className="drink-existing-einheiten-list">
                  {addUnitsDrink.einheiten
                    .filter((e) => e.addedByUserId !== currentUser?.id)
                    .map((e, idx) => (
                      <li key={idx}>
                        {[getUnitSizeLabel(e.einheitsgroesse) || String(e.einheitsgroesse), e.einheit].filter(Boolean).join(' ')}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="events-info-text">Noch keine Einheiten vorhanden.</p>
              )}
            </div>
          )}

          <div className="events-form-field">
            <span>{isAddUnitsMode ? 'Meine zusätzlichen Einheiten' : 'Einheiten'}</span>
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
                  {(form.einheiten.length > 1 || isAddUnitsMode) && (
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

          {!isAddUnitsMode && nameDrinkDisplay.isRecipe && nameDrinkDisplay.recipe && (
            <div className="events-form-field">
              <span>Zutaten von „{nameDrinkDisplay.displayName}"</span>
              <ul className="drink-recipe-ingredient-list">
                {nameDrinkDisplay.ingredients.map((rawItem, idx) => {
                  const item = typeof rawItem === 'string' ? { type: 'ingredient', text: rawItem } : rawItem;
                  if (item.type === 'heading') return null;
                  const recipeLink = decodeRecipeLink(item.text);
                  let name;
                  let amountLabel;
                  if (recipeLink) {
                    const linkedRecipe = recipes.find((r) => r.id === recipeLink.recipeId);
                    name = linkedRecipe ? linkedRecipe.title : recipeLink.recipeName;
                    amountLabel = recipeLink.quantityPrefix || null;
                  } else {
                    const parsed = parseIngredientPartsSync(item.text);
                    name = parsed.name;
                    amountLabel = parsed.amount != null
                      ? `${parsed.amount}${parsed.amountMax != null ? `–${parsed.amountMax}` : ''}${parsed.unit ? ` ${parsed.unit}` : ''}`
                      : null;
                  }
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
          aria-label={isAddUnitsMode ? 'Einheiten speichern' : editId ? 'Getränk aktualisieren' : 'Getränk speichern'}
          title={isAddUnitsMode ? 'Einheiten speichern' : editId ? 'Getränk aktualisieren' : 'Getränk speichern'}
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
          {isBase64Image(getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
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
        <div className="events-page-header-actions">
          <button
            type="button"
            className="events-primary-btn events-header-add-btn"
            onClick={openNew}
            aria-label="Neues Getränk anlegen"
          >
            + Getränk
          </button>
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
      </div>

      <div className="drink-own-filter-row">
        <label className="drink-own-filter-label">
          <span>Eigene Getränke</span>
          <span className="drink-own-filter-toggle">
            <input
              type="checkbox"
              checked={showOwnOnly}
              onChange={(e) => setShowOwnOnly(e.target.checked)}
              aria-label="Nur eigene Getränke anzeigen"
            />
            <span className="drink-own-filter-toggle-slider" aria-hidden="true" />
          </span>
        </label>
      </div>

      {loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : (
        <div className="events-list">
          {groupedDrinks.map((group) => (
            <div key={group.id} className="drink-category-group">
              <h3 className="drink-category-group-header">{group.label}</h3>
              {group.drinks.map((drink) => {
                const isForeign = Boolean(drink.ownerId) && drink.ownerId !== currentUser?.id;
                const canManage = drink.predefined || !isForeign || isAdmin;
                const canAddUnits = isForeign && !isAdmin;
                return (
                  <DrinkRow
                    key={`${drink.ownerId || ''}_${drink.id}`}
                    drink={drink}
                    displayName={resolveDrinkDisplay(drink, recipes).displayName}
                    isForeign={isForeign}
                    canManage={canManage}
                    canAddUnits={canAddUnits}
                    onEdit={openEdit}
                    onAddUnits={openAddUnits}
                    onDelete={handleDelete}
                    swipeDeleteIcon={swipeDeleteIcon}
                  />
                );
              })}
            </div>
          ))}
          {drinks.length === 0 && (
            <p className="events-info-text">Noch keine Getränke angelegt.</p>
          )}
        </div>
      )}
      {deleteBanners.map((banner) => (
        <div key={banner.id} className="undo-snackbar" role="status">
          <span>{banner.message}</span>
          <button type="button" className="undo-snackbar-btn" onClick={() => undoDelete(banner.id)}>
            Rückgängig
          </button>
        </div>
      ))}
      <OverviewAddFab onClick={openNew} title="Getränk anlegen" ariaLabel="Getränk anlegen" />
    </div>
  );
}

export default DrinkManagementPage;
