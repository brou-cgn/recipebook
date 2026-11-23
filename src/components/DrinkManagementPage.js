import React, { useState, useEffect, useRef, useMemo } from 'react';
import { defaultIcon } from '../utils/defaultButtonIcons';
import TrashIcon from './icons/TrashIcon';
import './EventsPage.css';
import { saveCustomDrink, deleteCustomDrink } from '../utils/eventsFirestore';
import OverviewAddFab from './OverviewAddFab';
import DeleteRowButton from './DeleteRowButton';
import useUndoableDelete from '../hooks/useUndoableDelete';
import RecipeTypeahead from './RecipeTypeahead';
import { DRINK_CATEGORIES, getraenkKategorieAnzeige, getraenkNameAnzeige, mergePredefinedDrinks } from '../utils/drinkCategories';
import { getCustomLists, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import { isBase64Image, generateThumbnailBlob } from '../utils/imageUtils';
import { uploadDrinkImage, uploadDrinkThumbnail, deleteRecipeImage } from '../utils/storageUtils';
import { encodeRecipeLink, containsHashForTypeahead, decodeRecipeLink } from '../utils/recipeLinks';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { parseIngredientPartsSync, computeRecipeDrinkEinheitsgroesse, scaleIngredient, decimalToFraction } from '../utils/ingredientUtils';
import { updateRecipe } from '../utils/recipeFirestore';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import Button from './Button';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereZahl } from '../i18n/format';
import { STANDARD_SPRACHE } from '../i18n/sprachen';
import getraenkeTexte from '../i18n/texte/getraenke';
import allgemeinTexte from '../i18n/texte/allgemein';

const DRINK_RECIPE_CATEGORY = 'Drinks';

const CATEGORY_ORDER = DRINK_CATEGORIES.reduce((acc, cat) => {
  acc.push(cat.id);
  if (Array.isArray(cat.subcategories)) {
    cat.subcategories.forEach((sub) => acc.push(sub.id));
  }
  return acc;
}, []);
const UNCATEGORIZED_GROUP_ID = '__uncategorized__';

// t: Texte aus getraenke.js, damit vordefinierte Getränke nach ihrem angezeigten Namen sortiert werden
const groupDrinksByCategory = (drinksList, recipes, t) => {
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

  // Überschrift je Gruppe beim Anzeigen in der geltenden Sprache (Mehrsprachigkeit PR 6k)
  return orderedGroupIds.map((groupId) => ({
    id: groupId,
    drinks: [...groups.get(groupId)].sort((a, b) =>
      resolveDrinkDisplay(a, recipes, t).displayName.localeCompare(
        resolveDrinkDisplay(b, recipes, t).displayName,
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

// Wählbare Einheitsgrößen in Litern; angezeigt über getUnitSizeLabel
const UNIT_SIZES = [0.2, 0.33, 0.5, 0.75, 1.0, 1.5, 2.0, 5.0, 10.0];

// Größe einer Einheit: unter 1 l in ml, sonst in l mit einer Nachkommastelle im Format der Sprache
// (Mehrsprachigkeit PR 6k; auf Deutsch wie bisher „1,0 l“)
const getUnitSizeLabel = (liters, sprache = STANDARD_SPRACHE) => {
  const value = Number(liters);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 1) return `${Math.round(value * 1000)} ml`;
  return `${formatiereZahl(value, sprache, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} l`;
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
  image: null,
  einheiten: [emptyEinheit()],
});

// Stored drink photo: { url, thumbnailUrl } (thumbnailUrl may be missing).
const normalizeDrinkImage = (drink) => (drink?.image?.url
  ? { url: drink.image.url, thumbnailUrl: drink.image.thumbnailUrl || null }
  : null);

const deleteDrinkImageFiles = (image) => {
  if (!image) return Promise.resolve();
  return Promise.all([deleteRecipeImage(image.url), deleteRecipeImage(image.thumbnailUrl)]);
};

function DrinkRow({ drink, displayName, isForeign, canManage, canAddUnits, onEdit, onAddUnits, onDelete, swipeDeleteIcon }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: drink.predefined || !canManage });
  const t = useTexte(getraenkeTexte);
  const { sprache } = useSprache();
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
              aria-label={t('nameLoeschen', { name: displayName })}
            >
              {isBase64Image(swipeDeleteIcon) ? (
                <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
              ) : (
                <span className="swipe-delete-icon-text">{swipeDeleteIcon || <TrashIcon />}</span>
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
          {drink.image?.url && (
            <img
              src={drink.image.thumbnailUrl || drink.image.url}
              alt=""
              className="drink-list-item-thumb"
              loading="lazy"
              draggable="false"
            />
          )}
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
            drink.kategorie ? getraenkKategorieAnzeige(drink.kategorie, t) : null,
            Array.isArray(drink.einheiten) && drink.einheiten.length > 0
              ? drink.einheiten
                  .map((e) => getUnitSizeLabel(e.einheitsgroesse, sprache) || String(e.einheitsgroesse))
                  .join(', ')
              : null,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

// Eine Gebindeeinheit im Getränkeformular. Entfernen wie jede Zeile der App (CLAUDE.md, Tech-Check D7):
// am Desktop DeleteRowButton am rechten Rand, auf dem Handy Linksswipe; die Snackbar „Rückgängig“
// verwaltet die Seite.
function EinheitGroup({ index, canRemove, onRemove, swipeDeleteIcon, children }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: !canRemove });
  const t = useTexte(getraenkeTexte);
  const itemName = t('einheitNummer', { nummer: index + 1 });
  return (
    <div className={`events-einheit-group${offset < 0 ? ' swipe-delete-active' : ''}`}>
      {canRemove && (
        <div className="drink-swipe-delete-background events-einheit-swipe-background" aria-hidden={!isDeleteVisible}>
          {isDeleteVisible && (
            <button
              type="button"
              className="drink-swipe-delete-action"
              onClick={() => { onRemove(index); reset(); }}
              aria-label={t('nameLoeschen', { name: itemName })}
            >
              {isBase64Image(swipeDeleteIcon) ? (
                <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
              ) : (
                <span className="swipe-delete-icon-text">{swipeDeleteIcon || <TrashIcon />}</span>
              )}
            </button>
          )}
        </div>
      )}
      <div
        className="events-einheit-content delete-row-hover-target"
        style={{ transform: `translateX(${offset}px)` }}
        {...handlers}
      >
        <div className="events-einheit-fields">{children}</div>
        {canRemove && (
          <DeleteRowButton
            itemName={itemName}
            className="events-einheit-delete-btn"
            onClick={() => onRemove(index)}
          />
        )}
      </div>
    </div>
  );
}

function DrinkManagementPage({ onBack, currentUser, recipes, customDrinks: drinks = [], customDrinksLoaded = true }) {
  const loading = !customDrinksLoaded;
  // Texte der Getränke (Mehrsprachigkeit PR 6k); Einheiten bleiben deutsch gespeichert und angezeigt (Phase B)
  const t = useTexte(getraenkeTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const { sprache } = useSprache();
  const kategorieName = (id) => getraenkKategorieAnzeige(id, t);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editOwnerId, setEditOwnerId] = useState(null);
  const [isPredefined, setIsPredefined] = useState(false);
  const [isAddUnitsMode, setIsAddUnitsMode] = useState(false);
  const [addUnitsDrink, setAddUnitsDrink] = useState(null);
  const isAdmin = currentUser?.role === 'admin';
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
  const einheitUndo = useUndoableDelete();
  const einheitSessionRef = useRef(0);
  const einheitRemovalCounterRef = useRef(0);
  useEffect(() => {
    einheitSessionRef.current += 1;
  }, [showForm, editId, addUnitsDrink]);
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const [showOwnOnly, setShowOwnOnly] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Photo stored with the drink when the form was opened; files uploaded
  // during editing are only discarded/kept once the user saves or cancels.
  const savedImageRef = useRef(null);
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
  const groupedDrinks = useMemo(() => groupDrinksByCategory(allDrinks, recipes, t), [allDrinks, recipes, t]);

  const nameDrinkDisplay = resolveDrinkDisplay(form.name, recipes);

  const openNew = () => {
    setEditId(null);
    setEditOwnerId(null);
    setIsPredefined(false);
    setIsAddUnitsMode(false);
    setAddUnitsDrink(null);
    setForm(emptyForm());
    savedImageRef.current = null;
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
    savedImageRef.current = normalizeDrinkImage(drink);
    setForm({
      name: drink.name || '',
      kategorie: drink.kategorie || '',
      image: normalizeDrinkImage(drink),
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
    savedImageRef.current = null;
    setForm({
      name: drink.name || '',
      kategorie: drink.kategorie || '',
      image: null,
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
    // aufgerundet auf die nächsten 10 ml, Einheit immer "Drink".
    const einheitsgroesse = computeRecipeDrinkEinheitsgroesse(selectedRecipe.ingredients, selectedRecipe.portionen);
    setForm((f) => ({
      ...f,
      name: encodeRecipeLink(selectedRecipe.id, selectedRecipe.title),
      kategorie: 'longdrinks',
      einheiten: [{
        ...emptyEinheit(),
        einheitsgroesse,
        einheit: 'Drink',
      }],
    }));
    setShowNameTypeahead(false);
  };

  const handleClearNameLink = () => {
    setForm((f) => ({ ...f, name: '' }));
  };

  // Files uploaded in this editing session but not (yet) stored with the
  // drink are orphans: delete them whenever they are replaced or discarded.
  const discardUnsavedImage = (image) => {
    if (image && image.url !== savedImageRef.current?.url) {
      deleteDrinkImageFiles(image).catch(() => {});
    }
  };

  const handleImageUpload = async (e) => {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    setUploadingImage(true);
    setError('');
    try {
      const [url, thumbnailBlob] = await Promise.all([
        uploadDrinkImage(file, currentUser?.id),
        generateThumbnailBlob(file).catch(() => null),
      ]);
      let thumbnailUrl = null;
      if (thumbnailBlob) {
        try {
          thumbnailUrl = await uploadDrinkThumbnail(thumbnailBlob, currentUser?.id);
        } catch (thumbErr) {
          console.warn('Drink thumbnail upload failed (non-critical):', thumbErr);
        }
      }
      discardUnsavedImage(form.image);
      setForm((f) => ({ ...f, image: { url, thumbnailUrl } }));
    } catch (err) {
      console.error('Error uploading drink image:', err);
      setError(t('fehlerBild'));
    } finally {
      setUploadingImage(false);
      input.value = '';
    }
  };

  const handleRemoveImage = () => {
    discardUnsavedImage(form.image);
    setForm((f) => ({ ...f, image: null }));
  };

  const closeForm = () => {
    discardUnsavedImage(form.image);
    setShowNameTypeahead(false);
    setShowForm(false);
    setIsAddUnitsMode(false);
    setAddUnitsDrink(null);
  };

  const addEinheit = () => {
    setForm((f) => ({ ...f, einheiten: [...f.einheiten, emptyEinheit()] }));
  };

  // Entfernen wirkt sofort, „Rückgängig“ setzt die Einheit an der alten Stelle wieder ein. Die Sitzung
  // zählt hoch, sobald das Formular schließt oder ein anderes Getränk zeigt: Ein Rückgängig aus einem
  // früheren Formular darf nicht im neuen landen.
  const removeEinheit = (idx) => {
    const removed = form.einheiten[idx];
    if (!removed) return;
    const session = einheitSessionRef.current;
    setForm((f) => ({ ...f, einheiten: f.einheiten.filter((_, i) => i !== idx) }));
    einheitRemovalCounterRef.current += 1;
    einheitUndo.scheduleDelete({
      key: `einheit-${session}-${einheitRemovalCounterRef.current}`,
      message: t('einheitEntfernt'),
      onConfirm: () => {},
      onUndo: () => {
        if (einheitSessionRef.current !== session) return;
        setForm((f) => {
          const next = [...f.einheiten];
          next.splice(Math.min(idx, next.length), 0, removed);
          return { ...f, einheiten: next };
        });
      },
    });
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
      setError(t('fehlerEinheitenSpeichern'));
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
      setError(t('fehlerName'));
      return;
    }
    if (form.einheiten.length === 0) {
      setError(t('fehlerEinheit'));
      return;
    }
    for (const einheit of form.einheiten) {
      if (!einheit.einheitsgroesse) {
        setError(t('fehlerGroesse'));
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...(isPredefined ? {} : { name: form.name.trim(), kategorie: form.kategorie || null }),
        image: form.image,
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
      if (savedImageRef.current && savedImageRef.current.url !== form.image?.url) {
        deleteDrinkImageFiles(savedImageRef.current).catch(() => {});
      }
      savedImageRef.current = form.image;
      setShowForm(false);
    } catch (err) {
      console.error('Error saving custom drink:', err);
      setError(t('fehlerSpeichern'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (drink) => {
    const ownerId = drink.ownerId || currentUser.id;
    const deletedDisplayName = resolveDrinkDisplay(drink, recipes, t).displayName;
    scheduleDelete({
      key: `${drink.ownerId || ''}_${drink.id}`,
      message: t('getraenkGeloescht', { name: deletedDisplayName }),
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
          <h2>{isAddUnitsMode ? t('zusaetzlicheEinheiten') : editId ? t('getraenkBearbeiten') : t('neuesGetraenk')}</h2>
        </div>
        <form className="events-form" onSubmit={handleSave} ref={formRef}>
          {isAddUnitsMode ? (
            <div className="events-form-field">
              <span>{t('getraenk')}</span>
              <p className="drink-add-units-name">{resolveDrinkDisplay(addUnitsDrink, recipes, t).displayName}</p>
            </div>
          ) : (
            <>
              <div className="events-form-field">
                <label htmlFor="drinkName" className="drink-field-label">{t('name')}</label>
                <div className="drink-title-image-row">
                <div className="events-name-input-wrapper">
                  <input
                    id="drinkName"
                    type="text"
                    value={nameDrinkDisplay.isRecipe ? nameDrinkDisplay.displayName : (isPredefined ? getraenkNameAnzeige(form.name, t) : form.name)}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={t('nameBeispiel')}
                    required={!isPredefined}
                    disabled={isPredefined}
                    readOnly={nameDrinkDisplay.isRecipe}
                    className={nameDrinkDisplay.isRecipe ? 'recipe-link-input' : ''}
                    title={nameDrinkDisplay.isRecipe ? t('verlinktesRezept', { name: nameDrinkDisplay.displayName }) : undefined}
                  />
                  {nameDrinkDisplay.isRecipe && !isPredefined && (
                    <button
                      type="button"
                      className="events-name-link-clear-btn"
                      onClick={handleClearNameLink}
                      aria-label={t('verknuepfungEntfernen')}
                      title={t('verknuepfungEntfernen')}
                    >
                      ×
                    </button>
                  )}
                </div>
                <label
                  htmlFor="drinkImageFile"
                  className="drink-add-image-btn"
                  title={uploadingImage ? t('hochladen') : t('bildHinzufuegen')}
                >
                  {isBase64Image(getEffectiveIcon(buttonIcons, 'addImage', isDarkMode)) ? (
                    <img src={getEffectiveIcon(buttonIcons, 'addImage', isDarkMode)} alt={t('bildHinzufuegen')} className="drink-add-image-icon-img" />
                  ) : (
                    getEffectiveIcon(buttonIcons, 'addImage', isDarkMode)
                  )}
                </label>
                <input
                  type="file"
                  id="drinkImageFile"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingImage}
                />
                </div>
              </div>

              {form.image && (
                <div className="events-form-field">
                  <span>{t('getraenkebild')}</span>
                  <div className="drink-image-tile delete-row-hover-target">
                    <img
                      src={form.image.thumbnailUrl || form.image.url}
                      alt={t('getraenkebild')}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="drink-image-actions">
                      <DeleteRowButton itemName={t('getraenkebild')} onClick={handleRemoveImage} />
                    </div>
                  </div>
                </div>
              )}

              <label className="events-form-field">
                <span>{t('getraenkekategorie')}</span>
                <select
                  value={form.kategorie}
                  onChange={(e) => setForm((f) => ({ ...f, kategorie: e.target.value }))}
                  disabled={isPredefined}
                >
                  <option value="">{t('keineKategorie')}</option>
                  {DRINK_CATEGORIES.map((cat) =>
                    cat.subcategories ? (
                      <optgroup key={cat.id} label={kategorieName(cat.id)}>
                        <option value={cat.id}>{kategorieName(cat.id)}</option>
                        {cat.subcategories.map((sub) => (
                          <option key={sub.id} value={sub.id}>{kategorieName(sub.id)}</option>
                        ))}
                      </optgroup>
                    ) : (
                      <option key={cat.id} value={cat.id}>{kategorieName(cat.id)}</option>
                    )
                  )}
                </select>
              </label>
            </>
          )}

          {isAddUnitsMode && (
            <div className="events-form-field">
              <span>{t('vorhandeneEinheiten')}</span>
              {(Array.isArray(addUnitsDrink?.einheiten) ? addUnitsDrink.einheiten : [])
                .filter((e) => e.addedByUserId !== currentUser?.id).length > 0 ? (
                <ul className="drink-existing-einheiten-list">
                  {addUnitsDrink.einheiten
                    .filter((e) => e.addedByUserId !== currentUser?.id)
                    .map((e, idx) => (
                      <li key={idx}>
                        {[getUnitSizeLabel(e.einheitsgroesse, sprache) || String(e.einheitsgroesse), e.einheit].filter(Boolean).join(' ')}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="events-info-text">{t('nochKeineEinheiten')}</p>
              )}
            </div>
          )}

          <div className="events-form-field">
            <span>{isAddUnitsMode ? t('meineZusaetzlichenEinheiten') : t('einheiten')}</span>
            {form.einheiten.map((einheit, idx) => (
              <EinheitGroup
                key={idx}
                index={idx}
                canRemove={form.einheiten.length > 1 || isAddUnitsMode}
                onRemove={removeEinheit}
                swipeDeleteIcon={getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode)}
              >
                <div className="events-form-row events-einheit-row">
                  <label className="events-form-field">
                    <span>{nameDrinkDisplay.isRecipe ? t('einheitsgroesseMl') : t('einheitsgroesse')}</span>
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
                        placeholder={t('groesseBeispiel')}
                      />
                    ) : (
                      <select
                        value={einheit.einheitsgroesse}
                        onChange={(e) => updateEinheit(idx, 'einheitsgroesse', e.target.value)}
                      >
                        {UNIT_SIZES.map((liter) => (
                          <option key={liter} value={liter}>{getUnitSizeLabel(liter, sprache)}</option>
                        ))}
                      </select>
                    )}
                  </label>
                  <label className="events-form-field">
                    <span>{t('einheit')}</span>
                    {drinkUnits.length > 0 ? (
                      <select
                        value={einheit.einheit}
                        onChange={(e) => updateEinheit(idx, 'einheit', e.target.value)}
                      >
                        <option value="">{t('keineAngabe')}</option>
                        {drinkUnits.map((unit) => (
                          <option key={unit.id} value={unit.singular}>{unit.singular}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={einheit.einheit}
                        onChange={(e) => updateEinheit(idx, 'einheit', e.target.value)}
                        placeholder={t('einheitBeispiel')}
                      />
                    )}
                  </label>
                </div>
                <div className="events-form-row events-einheit-row">
                  <label className="events-form-field">
                    <span>{t('mengeGebinde')}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={einheit.einheitenProGebinde}
                      onChange={(e) => updateEinheit(idx, 'einheitenProGebinde', e.target.value)}
                    />
                  </label>
                  <label className="events-form-field">
                    <span>{t('gebindeinheit')}</span>
                    {packageUnits.length > 0 ? (
                      <select
                        value={einheit.gebindeinheit}
                        onChange={(e) => updateEinheit(idx, 'gebindeinheit', e.target.value)}
                      >
                        <option value="">{t('keineAngabe')}</option>
                        {packageUnits.map((unit) => (
                          <option key={unit.id} value={unit.singular}>{unit.singular}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={einheit.gebindeinheit}
                        onChange={(e) => updateEinheit(idx, 'gebindeinheit', e.target.value)}
                        placeholder={t('gebindeBeispiel')}
                      />
                    )}
                  </label>
                </div>
              </EinheitGroup>
            ))}
            {einheitUndo.banners
              .filter((banner) => banner.key.startsWith(`einheit-${einheitSessionRef.current}-`))
              .map((banner) => (
                <div key={banner.id} className="undo-snackbar" role="status">
                  <span>{banner.message}</span>
                  <button type="button" className="undo-snackbar-btn" onClick={() => einheitUndo.undoDelete(banner.id)}>
                    {tAllgemein('rueckgaengig')}
                  </button>
                </div>
              ))}
            <Button onClick={addEinheit}>
              {t('einheitHinzufuegen')}
            </Button>
          </div>

          {!isAddUnitsMode && nameDrinkDisplay.isRecipe && nameDrinkDisplay.recipe && (
            <div className="events-form-field">
              <span>{t('zutatenVon', { name: nameDrinkDisplay.displayName })}</span>
              <ul className="drink-recipe-ingredient-list">
                {(() => {
                  // Zutatenmengen sind im Rezept auf Basis der Rezeptportionen
                  // angegeben (z. B. 2 Drinks) — hier je Portion/Drink anzeigen.
                  const portionen = nameDrinkDisplay.recipe.portionen || 4;
                  const perPortion = (value) => {
                    const scaled = value / portionen;
                    if (scaled % 1 === 0) return scaled.toString();
                    const fraction = decimalToFraction(scaled);
                    return fraction !== null ? fraction : scaled.toFixed(1);
                  };
                  return nameDrinkDisplay.ingredients.map((rawItem, idx) => {
                    const item = typeof rawItem === 'string' ? { type: 'ingredient', text: rawItem } : rawItem;
                    if (item.type === 'heading') return null;
                    const recipeLink = decodeRecipeLink(item.text);
                    let name;
                    let amountLabel;
                    if (recipeLink) {
                      const linkedRecipe = recipes.find((r) => r.id === recipeLink.recipeId);
                      name = linkedRecipe ? linkedRecipe.title : recipeLink.recipeName;
                      amountLabel = recipeLink.quantityPrefix
                        ? scaleIngredient(recipeLink.quantityPrefix, 1 / portionen)
                        : null;
                    } else {
                      const parsed = parseIngredientPartsSync(item.text);
                      name = parsed.name;
                      amountLabel = parsed.amount != null
                        ? `${perPortion(parsed.amount)}${parsed.amountMax != null ? `–${perPortion(parsed.amountMax)}` : ''}${parsed.unit ? ` ${parsed.unit}` : ''}`
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
                            aria-label={t('inKalkulation', { name })}
                          />
                          <span className="drink-recipe-ingredient-toggle-slider" aria-hidden="true" />
                        </label>
                      </li>
                    );
                  });
                })()}
              </ul>
            </div>
          )}

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <Button className="events-save-desktop-only" onClick={closeForm} disabled={saving}>
              {tAllgemein('abbrechen')}
            </Button>
            <Button variant="primary" type="submit" className="events-save-desktop-only" loading={saving}>
              {saving ? t('speichert') : tAllgemein('speichern')}
            </Button>
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
          aria-label={isAddUnitsMode ? t('einheitenSpeichern') : editId ? t('getraenkAktualisieren') : t('getraenkSpeichern')}
          title={isAddUnitsMode ? t('einheitenSpeichern') : editId ? t('getraenkAktualisieren') : t('getraenkSpeichern')}
        >
          {(() => {
            const saveIcon = getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode) || defaultIcon('save');
            return isBase64Image(saveIcon)
              ? <img src={saveIcon} alt={tAllgemein('speichern')} className="button-icon-image" draggable="false" />
              : saveIcon;
          })()}
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
          title={tAllgemein('abbrechen')}
          aria-label={t('getraenkbearbeitungAbbrechen')}
          disabled={saving}
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)} alt={tAllgemein('abbrechen')} className="button-icon-image" draggable="false" />
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

  const swipeDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode);
  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode) || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode);

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>{t('getraenkeVerwalten')}</h2>
        <div className="events-page-header-actions">
          <Button
            className="events-header-add-btn"
            onClick={openNew}
            aria-label={t('neuesGetraenkAnlegen')}
          >
            {t('plusGetraenk')}
          </Button>
          {onBack && (
            <button
              className="app-close-button"
              onClick={onBack}
              aria-label={t('getraenkeVerwaltenSchliessen')}
              title={t('getraenkeVerwaltenSchliessen')}
            >
              {isBase64Image(closeIcon) ? (
                <img src={closeIcon} alt={t('getraenkeVerwaltenSchliessen')} className="app-close-button-icon-img" />
              ) : (
                closeIcon || '×'
              )}
            </button>
          )}
        </div>
      </div>

      <div className="drink-own-filter-row">
        <label className="drink-own-filter-label">
          <span>{t('eigeneGetraenke')}</span>
          <span className="drink-own-filter-toggle">
            <input
              type="checkbox"
              checked={showOwnOnly}
              onChange={(e) => setShowOwnOnly(e.target.checked)}
              aria-label={t('nurEigeneAnzeigen')}
            />
            <span className="drink-own-filter-toggle-slider" aria-hidden="true" />
          </span>
        </label>
      </div>

      {loading ? (
        <div className="events-empty-state">{t('laden')}</div>
      ) : (
        <div className="events-list">
          {groupedDrinks.map((group) => (
            <div key={group.id} className="drink-category-group">
              <h3 className="drink-category-group-header">{group.id === UNCATEGORIZED_GROUP_ID ? t('ohneKategorie') : kategorieName(group.id)}</h3>
              {group.drinks.map((drink) => {
                const isForeign = Boolean(drink.ownerId) && drink.ownerId !== currentUser?.id;
                const canManage = drink.predefined || !isForeign || isAdmin;
                const canAddUnits = isForeign && !isAdmin;
                return (
                  <DrinkRow
                    key={`${drink.ownerId || ''}_${drink.id}`}
                    drink={drink}
                    displayName={resolveDrinkDisplay(drink, recipes, t).displayName}
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
            <p className="events-info-text">{t('nochKeineGetraenke')}</p>
          )}
        </div>
      )}
      {deleteBanners.map((banner) => (
        <div key={banner.id} className="undo-snackbar" role="status">
          <span>{banner.message}</span>
          <button type="button" className="undo-snackbar-btn" onClick={() => undoDelete(banner.id)}>
            {tAllgemein('rueckgaengig')}
          </button>
        </div>
      ))}
      <OverviewAddFab onClick={openNew} title={t('getraenkAnlegen')} ariaLabel={t('getraenkAnlegen')} />
    </div>
  );
}

export default DrinkManagementPage;
