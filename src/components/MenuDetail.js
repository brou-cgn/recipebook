import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLongPress } from '../utils/useLongPress';
import './MenuDetail.css';
import { getUserFavorites } from '../utils/userFavorites';
import { getUserMenuFavorites } from '../utils/menuFavorites';
import { groupRecipesBySections, applyItemOrder } from '../utils/menuSections';
import { canEditMenu, canDeleteMenu } from '../utils/userManagement';
import { isBase64Image } from '../utils/imageUtils';
import { enableMenuSharing, disableMenuSharing } from '../utils/menuFirestore';
import { scaleIngredient, combineIngredients, convertIngredientUnits, isWaterIngredient } from '../utils/ingredientUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { subscribeToEvent, subscribeToCustomDrinks, getCustomDrinks } from '../utils/eventsFirestore';
import { mergePredefinedDrinks } from '../utils/drinkCategories';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { getImageForCategory } from '../utils/categoryImages';
import ShoppingListModal from './ShoppingListModal';
import RecipeCard from './RecipeCard';

const formatEventLiter = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const getDrinkImageUrl = (recipe) => {
  if (!recipe) return null;
  if (Array.isArray(recipe.images) && recipe.images.length > 0) {
    const defaultImg = recipe.images.find((img) => img.isDefault) || recipe.images[0];
    return defaultImg?.url || null;
  }
  return recipe.image || null;
};

const DRINKS_SECTION_NAME = 'Drinks';
const DRINKS_MEAL_CATEGORY_NAME = 'Drinks';

const MOBILE_TABLET_BREAKPOINT = 768;

function MenuDetail({ menu: initialMenu, recipes, onBack, onEdit, onDelete, onPublish, onSelectRecipe, onToggleMenuFavorite, onOpenEvent, currentUser, allUsers, isSharedView }) {
  const [menu, setMenu] = useState(initialMenu);
  const [favoriteMenuIds, setFavoriteMenuIds] = useState([]);
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState([]);
  const [closeButtonIcon, setCloseButtonIcon] = useState('×');
  const [copyLinkIcon, setCopyLinkIcon] = useState('Link');
  const [openEventIcon, setOpenEventIcon] = useState('📅');
  const [shoppingListIcon, setShoppingListIcon] = useState('Einkauf');
  const [bringButtonIcon, setBringButtonIcon] = useState('Bring');
  const [favoritesButtonIcon, setFavoritesButtonIcon] = useState('☆');
  const [favoritesButtonActiveIcon, setFavoritesButtonActiveIcon] = useState('★');
  const [editMenuIcon, setEditMenuIcon] = useState('Edit');
  const [editFabPressed, setEditFabPressed] = useState(false);
  const [deleteMenuIcon, setDeleteMenuIcon] = useState('🗑');
  const [deleteFabPressed, setDeleteFabPressed] = useState(false);
  const [publishMenuIcon, setPublishMenuIcon] = useState('↑');
  const [publishFabPressed, setPublishFabPressed] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(() => window.innerWidth <= MOBILE_TABLET_BREAKPOINT);
  const [allButtonIcons, setAllButtonIcons] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showPortionSelector, setShowPortionSelector] = useState(false);
  const [portionCounts, setPortionCounts] = useState(initialMenu.portionCounts || {});
  const [linkedPortionCounts, setLinkedPortionCounts] = useState({});
  const [conversionTable, setConversionTable] = useState([]);
  const missingSavedRef = useRef(false);
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [linkedEventLoading, setLinkedEventLoading] = useState(false);
  const [linkedEventCustomDrinks, setLinkedEventCustomDrinks] = useState([]);
  const [expandedDrinkId, setExpandedDrinkId] = useState(null);
  const [drinksCategoryImage, setDrinksCategoryImage] = useState(null);
  const [manualDrinkCatalog, setManualDrinkCatalog] = useState([]);
  const {
    activeId: portionMinusLongPressActiveId,
    triggeredRef: portionMinusLongPressTriggeredRef,
    start: handlePortionMinusPressStart,
    end: handlePortionMinusPressEnd,
  } = useLongPress();

  // Load close button icon from settings
  useEffect(() => {
    const loadButtonIcons = async () => {
      const { getButtonIcons, getCustomLists } = require('../utils/customLists');
      const [icons, lists] = await Promise.all([getButtonIcons(), getCustomLists()]);
      setAllButtonIcons(icons);
      setConversionTable(lists.conversionTable || []);
    };
    loadButtonIcons();
  }, []);

  // Re-compute icon states when icons or dark mode changes
  useEffect(() => {
    if (!allButtonIcons) return;
    const eff = (key) => getEffectiveIcon(allButtonIcons, key, isDarkMode);
    setCloseButtonIcon(eff('menuCloseButton') || '×');
    setCopyLinkIcon(eff('copyLink') || 'Link');
    setOpenEventIcon(eff('openLinkedEvent') || '📅');
    setShoppingListIcon(eff('shoppingList') || 'Einkauf');
    setBringButtonIcon(eff('bringButton') || 'Bring');
    setFavoritesButtonIcon(eff('menuFavoritesButton') || '☆');
    setFavoritesButtonActiveIcon(eff('menuFavoritesButtonActive') || '★');
    setEditMenuIcon(eff('editRecipe') || 'Edit');
    setDeleteMenuIcon(eff('deleteRecipe') || '🗑');
    setPublishMenuIcon(eff('publishRecipe') || '↑');
  }, [allButtonIcons, isDarkMode]);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobileOrTablet(window.innerWidth <= MOBILE_TABLET_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load favorite IDs when user changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const [menuFavorites, recipeFavorites] = await Promise.all([
          getUserMenuFavorites(currentUser.id),
          getUserFavorites(currentUser.id)
        ]);
        setFavoriteMenuIds(menuFavorites);
        setFavoriteRecipeIds(recipeFavorites);
      } else {
        setFavoriteMenuIds([]);
        setFavoriteRecipeIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  // Live-track the linked event's drinks, so changes made on the event side
  // (or synced back from another menu edit) show up immediately here too.
  useEffect(() => {
    if (!menu.eventId || !menu.eventOwnerId) {
      setLinkedEvent(null);
      setLinkedEventCustomDrinks([]);
      return undefined;
    }
    setLinkedEventLoading(true);
    let firstEventSnapshot = true;
    let firstDrinksSnapshot = true;
    const unsubEvent = subscribeToEvent(menu.eventOwnerId, menu.eventId, (event) => {
      setLinkedEvent(event);
      if (firstEventSnapshot) {
        firstEventSnapshot = false;
        if (!firstDrinksSnapshot) setLinkedEventLoading(false);
      }
    });
    const unsubDrinks = subscribeToCustomDrinks(menu.eventOwnerId, (drinks) => {
      setLinkedEventCustomDrinks(drinks);
      if (firstDrinksSnapshot) {
        firstDrinksSnapshot = false;
        if (!firstEventSnapshot) setLinkedEventLoading(false);
      }
    });
    return () => {
      unsubEvent();
      unsubDrinks();
    };
  }, [menu.eventId, menu.eventOwnerId]);

  // Load the default category image for the "Drinks" meal category once, used
  // as a fallback picture for drink cards that have no image of their own.
  useEffect(() => {
    let cancelled = false;
    getImageForCategory(DRINKS_MEAL_CATEGORY_NAME).then((image) => {
      if (!cancelled) setDrinksCategoryImage(image);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whether any section carries manually added drink-catalog IDs (see MenuForm's
  // "Drinks" section), independent of whether an event is linked.
  const hasManualDrinks = useMemo(
    () => (menu.sections || []).some((section) => Array.isArray(section.drinkIds) && section.drinkIds.length > 0),
    [menu.sections]
  );

  // Load the drink catalog needed to resolve manually added drinks, once, only
  // when the menu actually has any (no live sync, matching the event drinks load).
  useEffect(() => {
    if (!hasManualDrinks || !currentUser?.id) {
      setManualDrinkCatalog([]);
      return undefined;
    }
    let cancelled = false;
    getCustomDrinks(currentUser.id).then((drinks) => {
      if (!cancelled) setManualDrinkCatalog(drinks);
    });
    return () => {
      cancelled = true;
    };
  }, [hasManualDrinks, currentUser?.id]);

  const resolveManualDrinks = (drinkIds) => {
    if (!Array.isArray(drinkIds) || drinkIds.length === 0) return [];
    const allDrinks = mergePredefinedDrinks(manualDrinkCatalog);
    return drinkIds.map((drinkId) => {
      const drink = allDrinks.find((d) => d.id === drinkId);
      const display = resolveDrinkDisplay(drink || drinkId, recipes);
      return {
        id: drinkId,
        displayName: display.displayName || drinkId,
        imageUrl: getDrinkImageUrl(display.recipe) || drinksCategoryImage,
        literMitPuffer: null,
        recipeId: display.recipeId,
      };
    });
  };

  const eventDrinks = useMemo(() => {
    if (!linkedEvent) return [];
    const allDrinks = mergePredefinedDrinks(linkedEventCustomDrinks);
    const ids = Array.isArray(linkedEvent.customDrinkIds) ? linkedEvent.customDrinkIds : [];
    return ids.map((drinkId) => {
      const drink = allDrinks.find((d) => d.id === drinkId);
      const display = resolveDrinkDisplay(drink || drinkId, recipes);
      const ergebnisRow = (linkedEvent.berechnung?.ergebnis || []).find((row) => row.drinkId === drinkId);
      return {
        id: drinkId,
        displayName: display.displayName || drinkId,
        imageUrl: getDrinkImageUrl(display.recipe) || drinksCategoryImage,
        literMitPuffer: ergebnisRow?.literMitPuffer ?? null,
        recipeId: display.recipeId,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEvent, linkedEventCustomDrinks, recipes, drinksCategoryImage]);

  const authorName = useMemo(() => {
    if (!menu.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === menu.authorId);
    if (!author) return null;
    return author.vorname;
  }, [menu.authorId, allUsers]);

  const getRecipeAuthorName = (recipe) => {
    if (!recipe.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === recipe.authorId);
    return author ? author.vorname : null;
  };

  const formattedMenuDate = useMemo(() => {
    if (menu.menuDate) {
      try {
        return new Date(menu.menuDate).toLocaleDateString('de-DE');
      } catch (e) {
        return null;
      }
    }
    if (menu.createdAt) {
      try {
        let date;
        if (menu.createdAt?.toDate) {
          date = menu.createdAt.toDate();
        } else if (typeof menu.createdAt === 'string') {
          date = new Date(menu.createdAt);
        } else if (menu.createdAt instanceof Date) {
          date = menu.createdAt;
        }
        return date ? date.toLocaleDateString('de-DE') : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [menu.menuDate, menu.createdAt]);

  const handleDelete = () => {
    if (window.confirm(`Möchten Sie "${menu.name}" wirklich löschen?`)) {
      onDelete(menu.id);
    }
  };

  // Edit FAB press handlers
  const handleEditFabPressStart = () => {
    setEditFabPressed(true);
  };

  const handleEditFabPressEnd = () => {
    setEditFabPressed(false);
  };

  const handleEditFabClick = () => {
    onEdit && onEdit(menu);
  };

  // Delete FAB press handlers
  const handleDeleteFabPressStart = () => {
    setDeleteFabPressed(true);
  };

  const handleDeleteFabPressEnd = () => {
    setDeleteFabPressed(false);
  };

  const handlePublish = async () => {
    if (!onPublish) return;
    if (window.confirm(`Möchten Sie "${menu.name}" in der Liste "Öffentlich" veröffentlichen?`)) {
      setPublishLoading(true);
      try {
        await onPublish(menu.id);
      } finally {
        setPublishLoading(false);
      }
    }
  };

  const handlePublishFabPressStart = () => {
    setPublishFabPressed(true);
  };

  const handlePublishFabPressEnd = () => {
    setPublishFabPressed(false);
  };

  // Derive favorite status from favoriteMenuIds
  const isFavorite = favoriteMenuIds.includes(menu?.id);

  const handleToggleFavorite = async () => {
    await onToggleMenuFavorite(menu.id);
    // Update local state immediately for responsive UI
    if (isFavorite) {
      setFavoriteMenuIds(favoriteMenuIds.filter(id => id !== menu.id));
    } else {
      setFavoriteMenuIds([...favoriteMenuIds, menu.id]);
    }
  };

  const getShareUrl = () => {
    const base = window.location.href.split('#')[0];
    return `${base}#menu-share/${menu.shareId}`;
  };

  const handleToggleShare = async () => {
    setShareLoading(true);
    try {
      if (menu.shareId) {
        await disableMenuSharing(menu.id);
        setMenu({ ...menu, shareId: undefined });
      } else {
        const shareId = await enableMenuSharing(menu.id);
        setMenu({ ...menu, shareId });
      }
    } catch (error) {
      console.error('Error toggling share:', error);
      alert('Fehler beim Ändern des Share-Status. Bitte versuchen Sie es erneut.');
    }
    setShareLoading(false);
  };

  const handleCopyShareUrl = async () => {
    const url = getShareUrl();
    if (navigator.share) {
      try {
        await navigator.share({ url, title: menu.name });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Fall through to clipboard copy on other errors
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    } catch {
      // Legacy fallback for older browsers that don't support the Clipboard API
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setShareUrlCopied(true);
      setTimeout(() => setShareUrlCopied(false), 2000);
    }
  };

  // Get recipes grouped by sections
  const recipeSections = useMemo(() => {
    if (menu.sections && menu.sections.length > 0) {
      return groupRecipesBySections(menu.sections, recipes);
    }
    // Fallback for old menu format
    const menuRecipes = (menu.recipeIds || [])
      .map(id => recipes.find(r => r.id === id))
      .filter(Boolean);
    return [{
      name: 'Alle Rezepte',
      recipes: menuRecipes
    }];
  }, [menu, recipes]);

  // Ensure a "Drinks" section is always available so the linked event's drinks
  // (and the event-linking controls) have somewhere to appear.
  const displaySections = useMemo(() => {
    const hasDrinksSection = recipeSections.some(
      (section) => section.name?.toLowerCase() === DRINKS_SECTION_NAME.toLowerCase()
    );
    if (hasDrinksSection) return recipeSections;
    return [...recipeSections, { name: DRINKS_SECTION_NAME, recipes: [] }];
  }, [recipeSections]);

  // Collect all unique linked (sub-)recipes referenced in menu recipe ingredients
  const allLinkedRecipes = useMemo(() => {
    const seenIds = new Set();
    const result = [];
    for (const section of recipeSections) {
      for (const recipe of section.recipes) {
        for (const ing of (recipe.ingredients || [])) {
          const text = typeof ing === 'string' ? ing : ing?.text;
          const link = decodeRecipeLink(text);
          if (link && !seenIds.has(link.recipeId)) {
            const linked = recipes.find(r => r.id === link.recipeId);
            if (linked) {
              seenIds.add(link.recipeId);
              result.push(linked);
            }
          }
        }
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeSections, recipes]);

  // Extract a numeric quantity from a prefix string like "1 Teil", "0.5 Stück", "1/2"
  const extractQuantityFromPrefix = (prefix) => {
    if (!prefix) return null;
    const match = prefix.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)/);
    if (match) {
      const num = match[1];
      if (num.includes('/')) {
        const [numerator, denominator] = num.split('/');
        return parseFloat(numerator) / parseFloat(denominator);
      }
      return parseFloat(num.replace(',', '.'));
    }
    return null;
  };

  // Calculate total parts needed per linked recipe based on current portionCounts
  const calculateLinkedRecipeRequirements = () => {
    const requirements = {};
    for (const section of recipeSections) {
      for (const recipe of section.recipes) {
        const targetPortions = portionCounts[recipe.id] ?? (recipe.portionen || 4);
        if (targetPortions === 0) continue;
        const recipePortions = recipe.portionen || 4;
        const multiplier = targetPortions / recipePortions;
        for (const ing of (recipe.ingredients || [])) {
          const item = typeof ing === 'string' ? { type: 'ingredient', text: ing } : ing;
          if (item.type === 'heading') continue;
          const text = typeof ing === 'string' ? ing : ing.text;
          const recipeLink = decodeRecipeLink(text);
          if (recipeLink) {
            const quantityFromLink = extractQuantityFromPrefix(recipeLink.quantityPrefix) || 1;
            const partsNeeded = quantityFromLink * multiplier;
            requirements[recipeLink.recipeId] = (requirements[recipeLink.recipeId] || 0) + partsNeeded;
          }
        }
      }
    }
    return requirements;
  };

  const handleShoppingListClick = () => {
    const requirements = calculateLinkedRecipeRequirements();
    setLinkedPortionCounts(requirements);
    setShowPortionSelector(true);
  };

  const getMenuShoppingListIngredients = () => {
    const ingredients = [];

    // Collect normal ingredients from all recipes
    for (const section of recipeSections) {
      for (const recipe of section.recipes) {
        const targetPortions = portionCounts[recipe.id] ?? (recipe.portionen || 4);
        if (targetPortions === 0) continue;
        const recipePortions = recipe.portionen || 4;
        const multiplier = targetPortions / recipePortions;
        for (const ing of (recipe.ingredients || [])) {
          const item = typeof ing === 'string' ? { type: 'ingredient', text: ing } : ing;
          if (item.type === 'heading') continue;
          const text = typeof ing === 'string' ? ing : ing.text;
          if (decodeRecipeLink(text)) continue; // skip recipe links
          if (isWaterIngredient(text)) continue; // skip water
          ingredients.push(multiplier !== 1 ? scaleIngredient(text, multiplier) : text);
        }
      }
    }

    // Add each linked recipe's ingredients exactly once using the portion slider value
    for (const linkedRecipe of allLinkedRecipes) {
      const linkedTarget = linkedPortionCounts[linkedRecipe.id] ?? (linkedRecipe.portionen || 4);
      if (linkedTarget === 0) continue;
      const portionen = linkedRecipe.portionen || 4;
      const linkedMultiplier = linkedTarget / portionen;
      for (const linkedIng of (linkedRecipe.ingredients || [])) {
        const linkedItem = typeof linkedIng === 'string' ? { type: 'ingredient', text: linkedIng } : linkedIng;
        if (linkedItem.type === 'heading') continue;
        const linkedText = typeof linkedIng === 'string' ? linkedIng : linkedIng.text;
        if (decodeRecipeLink(linkedText)) continue; // skip nested links
        if (isWaterIngredient(linkedText)) continue; // skip water
        ingredients.push(linkedMultiplier !== 1 ? scaleIngredient(linkedText, linkedMultiplier) : linkedText);
      }
    }

    const { converted, missing } = convertIngredientUnits(ingredients, conversionTable);
    if (missing.length > 0 && !missingSavedRef.current) {
      missingSavedRef.current = true;
      const { addMissingConversionEntries } = require('../utils/customLists');
      addMissingConversionEntries(missing, conversionTable).catch(console.error);
    }
    return combineIngredients(converted);
  };

  return (
    <div className="menu-detail-container">
      <div className="menu-detail-header">
          <div className="action-buttons">
          <button 
            className={`favorite-button ${isFavorite ? 'favorite-active' : ''}`}
            onClick={handleToggleFavorite}
            title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          >
            {isFavorite ? (
              isBase64Image(favoritesButtonActiveIcon) ? (
                <img src={favoritesButtonActiveIcon} alt="Favorit aktiv" className="button-icon-image" draggable="false" />
              ) : (
                favoritesButtonActiveIcon
              )
            ) : (
              isBase64Image(favoritesButtonIcon) ? (
                <img src={favoritesButtonIcon} alt="Favorit" className="button-icon-image" draggable="false" />
              ) : (
                favoritesButtonIcon
              )
            )}
          </button>
          <button
            className="shopping-list-trigger-button"
            onClick={handleShoppingListClick}
            title="Einkaufsliste anzeigen"
            aria-label="Einkaufsliste öffnen"
          >
            {isBase64Image(shoppingListIcon) ? (
              <img src={shoppingListIcon} alt="Einkaufsliste" className="shopping-list-icon-img" />
            ) : (
              shoppingListIcon
            )}
          </button>
          {!isMobileOrTablet && canEditMenu(currentUser, menu) && onEdit && !showShoppingListModal && !showPortionSelector && (
            <button
              className="menu-edit-button"
              onClick={() => onEdit(menu)}
              title="Menü bearbeiten"
            >
              Bearbeiten
            </button>
          )}
          {!isMobileOrTablet && menu.privat && canEditMenu(currentUser, menu) && onPublish && (
            <button
              className="publish-menu-button"
              onClick={handlePublish}
              disabled={publishLoading}
              title="Menü veröffentlichen"
            >
              {publishLoading ? '…' : 'Veröffentlichen'}
            </button>
          )}
          {!isMobileOrTablet && canDeleteMenu(currentUser, menu) && onDelete && (
            <button
              className="menu-delete-button"
              onClick={handleDelete}
              title="Menü löschen"
            >
              Löschen
            </button>
          )}
          {canEditMenu(currentUser, menu) && !menu.shareId && (
            <button
              className="share-button"
              onClick={handleToggleShare}
              disabled={shareLoading}
              title="Menü teilen"
            >
              {shareLoading ? '…' : '↑ Teilen'}
            </button>
          )}
          {canEditMenu(currentUser, menu) && menu.shareId && (
            <button
              className="share-copy-url-button"
              onClick={handleCopyShareUrl}
              title="Share-Link kopieren"
            >
              {shareUrlCopied ? '✓' : (
                isBase64Image(copyLinkIcon) ? (
                  <img src={copyLinkIcon} alt="Link kopieren" className="copy-link-icon-img" />
                ) : (
                  copyLinkIcon
                )
              )}
            </button>
          )}
          {isSharedView && !canEditMenu(currentUser, menu) && (
            <button
              className="share-copy-url-button"
              onClick={handleCopyShareUrl}
              title="Share-Link kopieren"
            >
              {shareUrlCopied ? '✓' : (
                isBase64Image(copyLinkIcon) ? (
                  <img src={copyLinkIcon} alt="Link kopieren" className="copy-link-icon-img" />
                ) : (
                  copyLinkIcon
                )
              )}
            </button>
          )}
        </div>
      </div>

      <div className="menu-detail-content">
        <div className="menu-title-row">
          <h1 className="menu-title">{menu.name}</h1>
          <button className="close-button" onClick={onBack} title="Schließen">
            {isBase64Image(closeButtonIcon) ? (
              <img src={closeButtonIcon} alt="Schließen" className="close-button-icon-img" />
            ) : (
              closeButtonIcon
            )}
          </button>
        </div>

        {menu.privat && (
          <div className="menu-private-row">
            <span className="private-indicator">Privat</span>
          </div>
        )}

        {(formattedMenuDate || authorName) && (
          <div className="menu-author-date">
            {authorName && <span className="menu-author"><span className="menu-author-label">Autor:</span> {authorName}</span>}
            {formattedMenuDate && <span className="menu-date"><span className="menu-date-label">Datum:</span> {formattedMenuDate}</span>}
          </div>
        )}

        {menu.description && (
          <p className="menu-description">{menu.description}</p>
        )}

        {displaySections.map((section, index) => {
          const isDrinksSection = section.name?.toLowerCase() === DRINKS_SECTION_NAME.toLowerCase();
          // Drinks (event-linked or manual) that resolve to a recipe already shown
          // as its own recipe card in this section are hidden here, so the same
          // recipe doesn't appear twice (once as a recipe card, once as a drink card).
          const sectionRecipeIds = new Set(section.recipes.map((recipe) => recipe.id));
          const manualDrinks = isDrinksSection ? resolveManualDrinks(section.drinkIds) : [];
          const dedupedEventDrinks = isDrinksSection
            ? eventDrinks.filter((drink) => !drink.recipeId || !sectionRecipeIds.has(drink.recipeId))
            : [];
          const eventDrinkIds = new Set(dedupedEventDrinks.map((drink) => drink.id));
          const dedupedManualDrinks = manualDrinks.filter((drink) =>
            !eventDrinkIds.has(drink.id) && (!drink.recipeId || !sectionRecipeIds.has(drink.recipeId))
          );
          const sectionDrinks = isDrinksSection ? [...dedupedEventDrinks, ...dedupedManualDrinks] : [];
          const isLoadingDrinks = isDrinksSection && linkedEventLoading;
          const hasCards = section.recipes.length > 0 || sectionDrinks.length > 0;

          // Recipes and drinks are shown in the free-sort order saved from
          // the menu editor (section.itemOrder), interleaved rather than
          // recipes always rendering above drinks; sections without a saved
          // order (or non-"Drinks" sections) fall back to recipes only.
          const sectionCards = isDrinksSection
            ? applyItemOrder(
                section.itemOrder,
                [
                  ...section.recipes.map((recipe) => ({ compositeId: `recipe:${recipe.id}`, type: 'recipe', recipe })),
                  ...dedupedEventDrinks.map((drink) => ({ compositeId: `event:${drink.id}`, type: 'drink', drink })),
                  ...dedupedManualDrinks.map((drink) => ({ compositeId: `manual:${drink.id}`, type: 'drink', drink })),
                ],
                (card) => card.compositeId
              )
            : section.recipes.map((recipe) => ({ compositeId: `recipe:${recipe.id}`, type: 'recipe', recipe }));

          let emptyText = 'Keine Rezepte in diesem Abschnitt';
          if (isDrinksSection && !menu.eventId) {
            emptyText = canEditMenu(currentUser, menu)
              ? 'Noch kein Event verknüpft. Event über "Menü bearbeiten" verknüpfen oder erstellen.'
              : 'Noch kein Event verknüpft.';
          } else if (isDrinksSection && menu.eventId && !linkedEventLoading && !linkedEvent) {
            emptyText = 'Verknüpftes Event konnte nicht geladen werden.';
          }

          return (
            <section key={index} className="menu-section">
              <div className="section-title-row">
                <h2 className="section-title">{section.name}</h2>
                {isDrinksSection && menu.eventId && menu.eventOwnerId === currentUser?.id && onOpenEvent && (
                  <button
                    className="open-event-button"
                    onClick={() => onOpenEvent(menu.eventOwnerId, menu.eventId)}
                    title="Verknüpftes Event öffnen"
                  >
                    {isBase64Image(openEventIcon) ? (
                      <img src={openEventIcon} alt="Event öffnen" className="open-event-icon-img" />
                    ) : (
                      openEventIcon
                    )}
                  </button>
                )}
              </div>
              {isLoadingDrinks ? (
                <p className="no-recipes">Getränke werden geladen …</p>
              ) : hasCards ? (
                <div className="recipes-grid">
                  {sectionCards.map((card) => {
                    if (card.type === 'recipe') {
                      const recipe = card.recipe;
                      const isRecipeFav = favoriteRecipeIds.includes(recipe.id);
                      return (
                        <RecipeCard
                          key={card.compositeId}
                          recipe={recipe}
                          onClick={() => onSelectRecipe(recipe)}
                          isFavorite={isRecipeFav}
                          favoriteActiveIcon={favoritesButtonActiveIcon}
                          authorName={getRecipeAuthorName(recipe)}
                          currentUser={currentUser}
                        />
                      );
                    }
                    const drink = card.drink;
                    const isExpanded = expandedDrinkId === drink.id;
                    return (
                      <div
                        key={card.compositeId}
                        className={`recipe-card drink-card${isExpanded ? ' drink-card-expanded' : ''}`}
                        onClick={() => setExpandedDrinkId(isExpanded ? null : drink.id)}
                      >
                        {drink.imageUrl && (
                          <div className="recipe-image">
                            <img src={drink.imageUrl} alt={drink.displayName} />
                          </div>
                        )}
                        <div className="recipe-card-content">
                          <h3>{drink.displayName}</h3>
                          {isExpanded && (
                            <p className="drink-card-amount">
                              {drink.literMitPuffer != null
                                ? `${formatEventLiter(drink.literMitPuffer)} l`
                                : 'Noch nicht berechnet'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="no-recipes">{emptyText}</p>
              )}
            </section>
          );
        })}
      </div>
      {isMobileOrTablet && canDeleteMenu(currentUser, menu) && onDelete && (
        <button
          className={`delete-fab-button${deleteFabPressed ? ' pressed' : ''}`}
          onClick={handleDelete}
          onTouchStart={handleDeleteFabPressStart}
          onTouchEnd={handleDeleteFabPressEnd}
          onTouchCancel={handleDeleteFabPressEnd}
          onMouseDown={handleDeleteFabPressStart}
          onMouseUp={handleDeleteFabPressEnd}
          onMouseLeave={handleDeleteFabPressEnd}
          title="Menü löschen"
          aria-label="Menü löschen"
        >
          {isBase64Image(deleteMenuIcon) ? (
            <img src={deleteMenuIcon} alt="Löschen" className="button-icon-image" draggable="false" />
          ) : (
            deleteMenuIcon
          )}
        </button>
      )}
      {isMobileOrTablet && menu.privat && canEditMenu(currentUser, menu) && onPublish && (
        <button
          className={`publish-fab-button${publishFabPressed ? ' pressed' : ''}`}
          onClick={handlePublish}
          onTouchStart={handlePublishFabPressStart}
          onTouchEnd={handlePublishFabPressEnd}
          onTouchCancel={handlePublishFabPressEnd}
          onMouseDown={handlePublishFabPressStart}
          onMouseUp={handlePublishFabPressEnd}
          onMouseLeave={handlePublishFabPressEnd}
          disabled={publishLoading}
          title="Menü veröffentlichen"
          aria-label="Menü veröffentlichen"
        >
          {publishLoading ? '…' : (
            isBase64Image(publishMenuIcon) ? (
              <img src={publishMenuIcon} alt="Veröffentlichen" className="button-icon-image" draggable="false" />
            ) : (
              publishMenuIcon
            )
          )}
        </button>
      )}
      {showShoppingListModal && (
        <ShoppingListModal
          items={getMenuShoppingListIngredients()}
          title={menu.name}
          onClose={() => setShowShoppingListModal(false)}
          shareId={menu.shareId}
          bringButtonIcon={bringButtonIcon}
          onEnableSharing={async () => {
            const sid = await enableMenuSharing(menu.id);
            setMenu({ ...menu, shareId: sid });
            return sid;
          }}
        />
      )}
      {showPortionSelector && (
        <div className="portion-selector-overlay" onClick={() => setShowPortionSelector(false)}>
          <div
            className="portion-selector-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Portionen auswählen"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="portion-selector-header">
              <h2 className="portion-selector-title">Portionen für Einkaufsliste</h2>
              <button
                className="portion-selector-close"
                onClick={() => setShowPortionSelector(false)}
                aria-label="Portionsauswahl schließen"
              >
                ×
              </button>
            </div>
            <div className="portion-selector-body">
              {recipeSections.flatMap(s => s.recipes).map(recipe => {
                const current = portionCounts[recipe.id] ?? (recipe.portionen || 4);
                const portionMinusId = `main-${recipe.id}`;
                return (
                  <div key={recipe.id} className="portion-selector-item">
                    <span className="portion-selector-recipe-name">{recipe.title}</span>
                    <div className="portion-selector-controls">
                      <button
                        className={`portion-selector-btn${portionMinusLongPressActiveId === portionMinusId ? ' longpress-active' : ''}`}
                        onClick={() => {
                          if (portionMinusLongPressTriggeredRef.current) {
                            portionMinusLongPressTriggeredRef.current = false;
                            return;
                          }
                          setPortionCounts(prev => ({
                            ...prev,
                            [recipe.id]: Math.max(0, current - 1)
                          }));
                        }}
                        onMouseDown={() => handlePortionMinusPressStart(portionMinusId, () => setPortionCounts(prev => ({ ...prev, [recipe.id]: 0 })))}
                        onMouseUp={handlePortionMinusPressEnd}
                        onMouseLeave={handlePortionMinusPressEnd}
                        onTouchStart={() => handlePortionMinusPressStart(portionMinusId, () => setPortionCounts(prev => ({ ...prev, [recipe.id]: 0 })))}
                        onTouchEnd={handlePortionMinusPressEnd}
                        onTouchCancel={handlePortionMinusPressEnd}
                        aria-label="Portionen verringern"
                        disabled={current === 0}
                      >
                        −
                      </button>
                      <span className="portion-selector-count">{current}</span>
                      <button
                        className="portion-selector-btn"
                        onClick={() => setPortionCounts(prev => ({
                          ...prev,
                          [recipe.id]: current + 1
                        }))}
                        aria-label="Portionen erhöhen"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
              {allLinkedRecipes.length > 0 && (
                <>
                  <div className="portion-selector-section-label">Verlinkte Rezepte</div>
                  {allLinkedRecipes.map(linkedRecipe => {
                    const current = linkedPortionCounts[linkedRecipe.id] ?? (linkedRecipe.portionen || 4);
                    const linkedPortionMinusId = `linked-${linkedRecipe.id}`;
                    return (
                      <div key={linkedRecipe.id} className="portion-selector-item">
                        <span className="portion-selector-recipe-name">{linkedRecipe.title}</span>
                        <div className="portion-selector-controls">
                          <button
                            className={`portion-selector-btn${portionMinusLongPressActiveId === linkedPortionMinusId ? ' longpress-active' : ''}`}
                            onClick={() => {
                              if (portionMinusLongPressTriggeredRef.current) {
                                portionMinusLongPressTriggeredRef.current = false;
                                return;
                              }
                              setLinkedPortionCounts(prev => ({
                                ...prev,
                                [linkedRecipe.id]: Math.max(0, current - 1)
                              }));
                            }}
                            onMouseDown={() => handlePortionMinusPressStart(linkedPortionMinusId, () => setLinkedPortionCounts(prev => ({ ...prev, [linkedRecipe.id]: 0 })))}
                            onMouseUp={handlePortionMinusPressEnd}
                            onMouseLeave={handlePortionMinusPressEnd}
                            onTouchStart={() => handlePortionMinusPressStart(linkedPortionMinusId, () => setLinkedPortionCounts(prev => ({ ...prev, [linkedRecipe.id]: 0 })))}
                            onTouchEnd={handlePortionMinusPressEnd}
                            onTouchCancel={handlePortionMinusPressEnd}
                            aria-label="Portionen verringern"
                            disabled={current === 0}
                          >
                            −
                          </button>
                          <span className="portion-selector-count">{current}</span>
                          <button
                            className="portion-selector-btn"
                            onClick={() => setLinkedPortionCounts(prev => ({
                              ...prev,
                              [linkedRecipe.id]: current + 1
                            }))}
                            aria-label="Portionen erhöhen"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
            <div className="portion-selector-footer">
              <button
                className="portion-selector-generate-btn"
                onClick={() => {
                  setShowPortionSelector(false);
                  missingSavedRef.current = false;
                  setShowShoppingListModal(true);
                }}
              >
                Einkaufsliste erstellen
              </button>
            </div>
          </div>
        </div>
      )}
      {isMobileOrTablet && canEditMenu(currentUser, menu) && onEdit && !showShoppingListModal && !showPortionSelector && (
        <button
          className={`edit-fab-button${editFabPressed ? ' pressed' : ''}`}
          onClick={handleEditFabClick}
          onTouchStart={handleEditFabPressStart}
          onTouchEnd={handleEditFabPressEnd}
          onTouchCancel={handleEditFabPressEnd}
          onMouseDown={handleEditFabPressStart}
          onMouseUp={handleEditFabPressEnd}
          onMouseLeave={handleEditFabPressEnd}
          title="Menü bearbeiten"
          aria-label="Menü bearbeiten"
        >
          {isBase64Image(editMenuIcon) ? (
            <img src={editMenuIcon} alt="Bearbeiten" className="button-icon-image" draggable="false" />
          ) : (
            editMenuIcon
          )}
        </button>
      )}
    </div>
  );
}

export default MenuDetail;
