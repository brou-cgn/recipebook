import React, { useState, useEffect, useMemo, useRef } from 'react';
import './MenuDetail.css';
import { getUserFavorites } from '../utils/userFavorites';
import { getUserMenuFavorites } from '../utils/menuFavorites';
import { groupRecipesBySections } from '../utils/menuSections';
import { canEditMenu, canDeleteMenu } from '../utils/userManagement';
import { isBase64Image } from '../utils/imageUtils';
import { enableMenuSharing, disableMenuSharing } from '../utils/menuFirestore';
import { scaleIngredient, combineIngredients, convertIngredientUnits, isWaterIngredient } from '../utils/ingredientUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import ShoppingListModal from './ShoppingListModal';

function MenuDetail({ menu: initialMenu, recipes, onBack, onEdit, onDelete, onSelectRecipe, onToggleMenuFavorite, currentUser, allUsers, isSharedView }) {
  const [menu, setMenu] = useState(initialMenu);
  const [favoriteMenuIds, setFavoriteMenuIds] = useState([]);
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState([]);
  const [closeButtonIcon, setCloseButtonIcon] = useState('✕');
  const [copyLinkIcon, setCopyLinkIcon] = useState('📋');
  const [shoppingListIcon, setShoppingListIcon] = useState('🛒');
  const [bringButtonIcon, setBringButtonIcon] = useState('🛍️');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showPortionSelector, setShowPortionSelector] = useState(false);
  const [portionCounts, setPortionCounts] = useState(initialMenu.portionCounts || {});
  const [linkedPortionCounts, setLinkedPortionCounts] = useState({});
  const [conversionTable, setConversionTable] = useState([]);
  const missingSavedRef = useRef(false);

  // Load close button icon from settings
  useEffect(() => {
    const loadButtonIcons = async () => {
      const { getButtonIcons, getCustomLists } = require('../utils/customLists');
      const [icons, lists] = await Promise.all([getButtonIcons(), getCustomLists()]);
      setCloseButtonIcon(icons.menuCloseButton || '✕');
      setCopyLinkIcon(icons.copyLink || '📋');
      setShoppingListIcon(icons.shoppingList || '🛒');
      setBringButtonIcon(icons.bringButton || '🛍️');
      setConversionTable(lists.conversionTable || []);
    };
    loadButtonIcons();
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

  const authorName = useMemo(() => {
    if (!menu.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === menu.authorId);
    if (!author) return null;
    return author.vorname;
  }, [menu.authorId, allUsers]);

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
  let recipeSections = [];
  if (menu.sections && menu.sections.length > 0) {
    recipeSections = groupRecipesBySections(menu.sections, recipes);
  } else {
    // Fallback for old menu format
    const menuRecipes = recipes.filter(r => menu.recipeIds?.includes(r.id));
    recipeSections = [{
      name: 'Alle Rezepte',
      recipes: menuRecipes
    }];
  }

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

  const getMenuShoppingListIngredients = () => {
    const ingredients = [];
    for (const section of recipeSections) {
      for (const recipe of section.recipes) {
        const targetPortions = portionCounts[recipe.id] ?? (recipe.portionen || 4);
        const recipePortions = recipe.portionen || 4;
        const multiplier = targetPortions / recipePortions;
        for (const ing of (recipe.ingredients || [])) {
          const item = typeof ing === 'string' ? { type: 'ingredient', text: ing } : ing;
          if (item.type === 'heading') continue;
          const text = typeof ing === 'string' ? ing : ing.text;
          const recipeLink = decodeRecipeLink(text);
          if (recipeLink) {
            // Expand linked recipe ingredients (already included separately via allLinkedRecipes)
            const linkedRecipe = recipes.find(r => r.id === recipeLink.recipeId);
            if (linkedRecipe) {
              const linkedTarget = linkedPortionCounts[recipeLink.recipeId] ?? (linkedRecipe.portionen || 4);
              const linkedMultiplier = linkedTarget / (linkedRecipe.portionen || 4);
              for (const linkedIng of (linkedRecipe.ingredients || [])) {
                const linkedItem = typeof linkedIng === 'string' ? { type: 'ingredient', text: linkedIng } : linkedIng;
                if (linkedItem.type === 'heading') continue;
                const linkedText = typeof linkedIng === 'string' ? linkedIng : linkedIng.text;
                if (decodeRecipeLink(linkedText)) continue; // skip nested links
                if (isWaterIngredient(linkedText)) continue; // skip water
                ingredients.push(linkedMultiplier !== 1 ? scaleIngredient(linkedText, linkedMultiplier) : linkedText);
              }
            }
          } else {
            if (isWaterIngredient(text)) continue; // skip water
            ingredients.push(multiplier !== 1 ? scaleIngredient(text, multiplier) : text);
          }
        }
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
            {isFavorite ? '★' : '☆'}
          </button>
          {canEditMenu(currentUser, menu) && (
            <button className="edit-button" onClick={() => onEdit(menu)}>
              Bearbeiten
            </button>
          )}
          <button
            className="shopping-list-trigger-button"
            onClick={() => setShowPortionSelector(true)}
            title="Einkaufsliste anzeigen"
            aria-label="Einkaufsliste öffnen"
          >
            {isBase64Image(shoppingListIcon) ? (
              <img src={shoppingListIcon} alt="Einkaufsliste" className="shopping-list-icon-img" />
            ) : (
              shoppingListIcon
            )}
          </button>
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
        
        {(formattedMenuDate || authorName) && (
          <div className="menu-author-date">
            {authorName && <span className="menu-author"><span className="menu-author-label">Autor:</span> {authorName}</span>}
            {formattedMenuDate && <span className="menu-date"><span className="menu-date-label">Datum:</span> {formattedMenuDate}</span>}
          </div>
        )}

        {menu.description && (
          <p className="menu-description">{menu.description}</p>
        )}

        {recipeSections.map((section, index) => (
          <section key={index} className="menu-section">
            <h2 className="section-title">{section.name}</h2>
            {section.recipes.length === 0 ? (
              <p className="no-recipes">Keine Rezepte in diesem Abschnitt</p>
            ) : (
              <div className="recipes-grid">
                {section.recipes.map((recipe) => {
                  const isRecipeFav = favoriteRecipeIds.includes(recipe.id);
                  return (
                    <div
                      key={recipe.id}
                      className="recipe-card"
                      onClick={() => onSelectRecipe(recipe)}
                    >
                      {isRecipeFav && (
                        <div className="favorite-badge">★</div>
                      )}
                      {recipe.image && (
                        <div className="recipe-image">
                          <img src={recipe.image} alt={recipe.title} />
                        </div>
                      )}
                      <div className="recipe-card-content">
                        <h3>{recipe.title}</h3>
                        <div className="recipe-meta">
                          <span>{recipe.ingredients?.length || 0} Zutaten</span>
                          <span>{recipe.steps?.length || 0} Schritte</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
      {canDeleteMenu(currentUser, menu) && (
        <div className="menu-delete-actions">
          <button className="delete-button" onClick={handleDelete}>
            Löschen
          </button>
        </div>
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
              <h2 className="portion-selector-title">🛒 Portionen für Einkaufsliste</h2>
              <button
                className="portion-selector-close"
                onClick={() => setShowPortionSelector(false)}
                aria-label="Portionsauswahl schließen"
              >
                ✕
              </button>
            </div>
            <div className="portion-selector-body">
              {recipeSections.flatMap(s => s.recipes).map(recipe => {
                const current = portionCounts[recipe.id] ?? (recipe.portionen || 4);
                return (
                  <div key={recipe.id} className="portion-selector-item">
                    <span className="portion-selector-recipe-name">{recipe.title}</span>
                    <div className="portion-selector-controls">
                      <button
                        className="portion-selector-btn"
                        onClick={() => setPortionCounts(prev => ({
                          ...prev,
                          [recipe.id]: Math.max(1, current - 1)
                        }))}
                        aria-label="Portionen verringern"
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
                    return (
                      <div key={linkedRecipe.id} className="portion-selector-item">
                        <span className="portion-selector-recipe-name">{linkedRecipe.title}</span>
                        <div className="portion-selector-controls">
                          <button
                            className="portion-selector-btn"
                            onClick={() => setLinkedPortionCounts(prev => ({
                              ...prev,
                              [linkedRecipe.id]: Math.max(1, current - 1)
                            }))}
                            aria-label="Portionen verringern"
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
    </div>
  );
}

export default MenuDetail;
