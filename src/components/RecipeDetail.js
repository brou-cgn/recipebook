import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber, getRecipeVersions, getParentRecipe, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';

// Mobile breakpoint constant
const MOBILE_BREAKPOINT = 480;

function RecipeDetail({ recipe: initialRecipe, onBack, onEdit, onDelete, onToggleFavorite, onCreateVersion, currentUser, allRecipes = [], allUsers = [], onHeaderVisibilityChange }) {
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [selectedRecipe, setSelectedRecipe] = useState(initialRecipe);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [cookingMode, setCookingMode] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const wakeLockRef = useRef(null);
  const contentRef = useRef(null);

  // Get portion units from custom lists
  const [portionUnits, setPortionUnits] = useState([]);

  useEffect(() => {
    const loadPortionUnits = async () => {
      const { getCustomLists } = require('../utils/customLists');
      const lists = await getCustomLists();
      setPortionUnits(lists.portionUnits || []);
    };
    loadPortionUnits();
  }, []);

  // Track window size for responsive design with debouncing
  useEffect(() => {
    let timeoutId = null;
    
    const handleResize = () => {
      // Debounce resize events to avoid excessive re-renders
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      }, 150);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Load favorite IDs when user changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const favorites = await getUserFavorites(currentUser.id);
        setFavoriteIds(favorites);
      } else {
        setFavoriteIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  // Update selected recipe when initial recipe changes
  useEffect(() => {
    setSelectedRecipe(initialRecipe);
  }, [initialRecipe]);

  // Scroll to content on mobile to hide header buttons initially (pull-to-reveal effect)
  useEffect(() => {
    const isMobileView = window.innerWidth <= MOBILE_BREAKPOINT;
    
    if (isMobileView && contentRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        // Scroll to the content element to hide the header above
        contentRef.current.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    }
  }, [initialRecipe]); // Re-run when recipe changes

  // Mobile header visibility: hide header on mount, show on scroll up
  useEffect(() => {
    if (!onHeaderVisibilityChange) return;

    // Mobile breakpoint constant
    const MOBILE_BREAKPOINT = 768;
    
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          
          // Show header when scrolling up or at top
          if (currentScrollY < lastScrollY || currentScrollY < 50) {
            onHeaderVisibilityChange(true);
          } 
          // Hide header when scrolling down
          else if (currentScrollY > lastScrollY && currentScrollY > 100) {
            onHeaderVisibilityChange(false);
          }
          
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    // Hide header initially on mobile
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (isMobile) {
      onHeaderVisibilityChange(false);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      // Show header again when leaving detail view
      onHeaderVisibilityChange(true);
    };
  }, [onHeaderVisibilityChange]);

  // Cooking mode: Wake Lock API integration
  useEffect(() => {
    let wakeLock = null;
    
    const handleVisibilityChange = async () => {
      if (wakeLock !== null && document.visibilityState === 'visible' && cookingMode) {
        try {
          if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLockRef.current = wakeLock;
          }
        } catch (err) {
          console.error('Error re-acquiring wake lock:', err);
        }
      }
    };

    const requestWakeLock = async () => {
      if (!cookingMode) {
        // Release wake lock if it exists
        if (wakeLockRef.current) {
          try {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
          } catch (err) {
            console.error('Error releasing wake lock:', err);
          }
        }
        // Remove visibility change listener
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        return;
      }

      // Request wake lock
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLockRef.current = wakeLock;
          
          // Re-acquire wake lock if page becomes visible again
          document.addEventListener('visibilitychange', handleVisibilityChange);
        }
      } catch (err) {
        console.error('Error requesting wake lock:', err);
      }
    };

    requestWakeLock();

    // Cleanup on unmount or when cookingMode changes
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(err => {
          console.error('Error releasing wake lock on unmount:', err);
        });
      }
    };
  }, [cookingMode]);

  // Get all versions for this recipe
  const parentRecipe = getParentRecipe(allRecipes, selectedRecipe) || (!isRecipeVersion(selectedRecipe) ? selectedRecipe : null);
  const unsortedVersions = parentRecipe ? [parentRecipe, ...getRecipeVersions(allRecipes, parentRecipe.id)] : [selectedRecipe];
  
  // Sort versions according to priority: favorite > own > version number
  const allVersions = sortRecipeVersions(unsortedVersions, currentUser?.id, (userId, recipeId) => favoriteIds.includes(recipeId), allRecipes);
  const hasMultipleVersions = allVersions.length > 1;

  const recipe = selectedRecipe;
  
  // Derive favorite status from favoriteIds
  const isFavorite = favoriteIds.includes(recipe?.id);

  const userCanDirectlyEdit = canDirectlyEditRecipe(currentUser, recipe);
  const userCanCreateVersion = canCreateNewVersion(currentUser);
  const userCanDelete = canDeleteRecipe(currentUser, recipe);

  // Get current version index
  const currentVersionIndex = allVersions.findIndex(v => v.id === recipe.id);
  
  // Navigation handlers
  const handlePreviousVersion = () => {
    if (currentVersionIndex > 0) {
      setSelectedRecipe(allVersions[currentVersionIndex - 1]);
      setServingMultiplier(1);
    }
  };

  const handleNextVersion = () => {
    if (currentVersionIndex < allVersions.length - 1) {
      setSelectedRecipe(allVersions[currentVersionIndex + 1]);
      setServingMultiplier(1);
    }
  };

  // Get author name
  const authorName = useMemo(() => {
    if (!recipe.authorId || !allUsers || allUsers.length === 0) return null;
    const author = allUsers.find(u => u.id === recipe.authorId);
    if (!author) return null;
    return `${author.vorname} ${author.nachname}`;
  }, [recipe.authorId, allUsers]);

  const versionNumber = useMemo(() => 
    hasMultipleVersions ? getVersionNumber(allRecipes, recipe) : 0, 
    [hasMultipleVersions, allRecipes, recipe]
  );

  const handleDelete = () => {
    if (window.confirm(`Möchten Sie "${recipe.title}" wirklich löschen?`)) {
      onDelete(recipe.id);
    }
  };

  const scaleIngredient = (ingredient) => {
    if (servingMultiplier === 1) return ingredient;
    
    // Match numbers with optional fractions and units at the start or after whitespace
    // This pattern is designed to match quantities like "200g", "2 cups", "1/2 tsp"
    const regex = /(?:^|\s)(\d+(?:[.,]\d+)?|\d+\/\d+)\s*([a-zA-Z]+)?/g;
    
    return ingredient.replace(regex, (match, number, unit) => {
      // Preserve leading whitespace if any
      const leadingSpace = match.startsWith(' ') ? ' ' : '';
      
      // Convert fraction to decimal if needed
      let value;
      if (number.includes('/')) {
        const [num, denom] = number.split('/');
        value = parseFloat(num) / parseFloat(denom);
      } else {
        value = parseFloat(number.replace(',', '.'));
      }
      
      const scaled = value * servingMultiplier;
      const formatted = scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
      
      return leadingSpace + (unit ? `${formatted} ${unit}` : formatted);
    });
  };

  const currentServings = (recipe.portionen || 4) * servingMultiplier;

  // Get the portion unit for the recipe
  const portionUnitId = recipe.portionUnitId || 'portion';
  const portionUnit = portionUnits.find(u => u.id === portionUnitId) || { singular: 'Portion', plural: 'Portionen' };
  const portionLabel = currentServings === 1 ? portionUnit.singular : portionUnit.plural;

  // Handle both array and string formats for kulinarik
  const cuisineDisplay = Array.isArray(recipe.kulinarik) 
    ? recipe.kulinarik.join(', ') 
    : recipe.kulinarik;

  // Handle both array and string formats for speisekategorie
  const categoryDisplay = Array.isArray(recipe.speisekategorie)
    ? recipe.speisekategorie.join(', ')
    : recipe.speisekategorie;

  const toggleCookingMode = () => {
    setCookingMode(prev => !prev);
  };

  return (
    <div className="recipe-detail-container">
      {cookingMode && (
        <div className="cooking-mode-indicator">
          <div className="cooking-mode-content">
            <span className="cooking-mode-icon">👨‍🍳</span>
            <span className="cooking-mode-text">Kochmodus aktiv</span>
            <button 
              className="cooking-mode-exit"
              onClick={toggleCookingMode}
              title="Kochmodus beenden"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="recipe-detail-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        
        <button 
          className={`cooking-mode-button ${cookingMode ? 'active' : ''}`}
          onClick={toggleCookingMode}
          title={cookingMode ? 'Kochmodus beenden' : 'Kochmodus aktivieren - Bildschirm bleibt an'}
        >
          {isMobile ? '🥄' : (cookingMode ? '👨‍🍳 Aktiv' : '👨‍🍳 Kochmodus')}
        </button>
        
        <div className="action-buttons">
          {onToggleFavorite && (
            <button 
              className={`favorite-button ${isFavorite ? 'is-favorite' : ''}`}
              onClick={async () => {
                await onToggleFavorite(recipe.id);
                // Update local state immediately for responsive UI
                if (isFavorite) {
                  setFavoriteIds(favoriteIds.filter(id => id !== recipe.id));
                } else {
                  setFavoriteIds([...favoriteIds, recipe.id]);
                }
              }}
              title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              {isFavorite ? '★' : '☆'}
            </button>
          )}
          {userCanDirectlyEdit && (
            <button className="edit-button" onClick={() => onEdit(recipe)}>
              Bearbeiten
            </button>
          )}
          {userCanCreateVersion && !userCanDirectlyEdit && (
            <button className="version-button" onClick={() => onCreateVersion(recipe)}>
              Neue Version erstellen
            </button>
          )}
          {userCanDelete && (
            <button className="delete-button" onClick={handleDelete}>
              Löschen
            </button>
          )}
        </div>
      </div>

      <div className="recipe-detail-content" ref={contentRef}>
        {recipe.image && (
          <div className="recipe-detail-image">
            <img src={recipe.image} alt={recipe.title} />
          </div>
        )}

        <h1 className="recipe-title">{recipe.title}</h1>

        <div className="recipe-captions">
          {hasMultipleVersions && (
            <div className="version-navigation">
              <button 
                className="version-arrow"
                onClick={handlePreviousVersion}
                disabled={currentVersionIndex === 0}
                title="Vorherige Version"
              >
                ←
              </button>
              <span className="version-caption">
                {isRecipeVersion(recipe) ? `Version ${versionNumber}` : 'Original'}
              </span>
              <button 
                className="version-arrow"
                onClick={handleNextVersion}
                disabled={currentVersionIndex === allVersions.length - 1}
                title="Nächste Version"
              >
                →
              </button>
            </div>
          )}
          {authorName && (
            <div className="author-caption">
              Autor: {authorName}
            </div>
          )}
        </div>

        <div className="recipe-metadata">
          {cuisineDisplay && (
            <div className="metadata-item">
              <span className="metadata-label">Kulinarik:</span>
              <span className="metadata-value cuisine-badge">{cuisineDisplay}</span>
            </div>
          )}
          
          {categoryDisplay && (
            <div className="metadata-item">
              <span className="metadata-label">Kategorie:</span>
              <span className="metadata-value">{categoryDisplay}</span>
            </div>
          )}
          
          {recipe.schwierigkeit && (
            <div className="metadata-item">
              <span className="metadata-label">Schwierigkeit:</span>
              <span className="metadata-value difficulty-stars">
                {'⭐'.repeat(recipe.schwierigkeit)}
              </span>
            </div>
          )}
          
          {recipe.kochdauer && (
            <div className="metadata-item">
              <span className="metadata-label">Zeit:</span>
              <span className="metadata-value">{recipe.kochdauer} Min.</span>
            </div>
          )}
        </div>

        <section className="recipe-section">
          <div className="section-header">
            <h2>Zutaten ({recipe.ingredients?.length || 0})</h2>
            {recipe.portionen && (
              <div className="serving-control">
                <button 
                  className="serving-btn"
                  onClick={() => {
                    const basePortions = recipe.portionen || 4;
                    const newServings = currentServings - 1;
                    if (newServings >= 1) {
                      setServingMultiplier(newServings / basePortions);
                    }
                  }}
                  disabled={currentServings <= 1}
                >
                  -
                </button>
                <span className="serving-display">
                  {currentServings} {portionLabel}
                </span>
                <button 
                  className="serving-btn"
                  onClick={() => {
                    const basePortions = recipe.portionen || 4;
                    const newServings = currentServings + 1;
                    setServingMultiplier(newServings / basePortions);
                  }}
                >
                  +
                </button>
              </div>
            )}
          </div>
          <ul className="ingredients-list">
            {recipe.ingredients?.map((ingredient, index) => (
              <li key={index}>{scaleIngredient(ingredient)}</li>
            )) || <li>Keine Zutaten aufgelistet</li>}
          </ul>
        </section>

        <section className="recipe-section">
          <h2>Zubereitungsschritte</h2>
          <ol className="steps-list">
            {recipe.steps?.map((step, index) => (
              <li key={index}>{step}</li>
            )) || <li>Keine Zubereitungsschritte aufgelistet</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}

export default RecipeDetail;
