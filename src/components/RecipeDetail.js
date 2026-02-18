import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber, getRecipeVersions, getParentRecipe, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { isBase64Image } from '../utils/imageUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';

// Mobile breakpoint constant
const MOBILE_BREAKPOINT = 480;

function RecipeDetail({ recipe: initialRecipe, onBack, onEdit, onDelete, onToggleFavorite, onCreateVersion, currentUser, allRecipes = [], allUsers = [], onHeaderVisibilityChange }) {
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [selectedRecipe, setSelectedRecipe] = useState(initialRecipe);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [cookingMode, setCookingMode] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [recipeNavigationStack, setRecipeNavigationStack] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const wakeLockRef = useRef(null);
  const contentRef = useRef(null);
  const stepsContainerRef = useRef(null);

  // Get portion units from custom lists
  const [portionUnits, setPortionUnits] = useState([]);
  const [cookingModeIcon, setCookingModeIcon] = useState('👨‍🍳');
  const [closeButtonIcon, setCloseButtonIcon] = useState('✕');

  useEffect(() => {
    const loadSettings = async () => {
      const { getCustomLists, getButtonIcons } = require('../utils/customLists');
      const lists = await getCustomLists();
      const icons = await getButtonIcons();
      setPortionUnits(lists.portionUnits || []);
      setCookingModeIcon(icons.cookingMode || '👨‍🍳');
      setCloseButtonIcon(icons.closeButton || '✕');
    };
    loadSettings();
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
    // Scroll to top when opening recipe detail
    window.scrollTo(0, 0);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [initialRecipe]);

  // Keep header visible on mobile - removed auto-hide behavior
  useEffect(() => {
    if (!onHeaderVisibilityChange) return;

    // Ensure header is visible when component mounts
    onHeaderVisibilityChange(true);

    return () => {
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

  // Format creation date
  const formattedCreatedAt = useMemo(() => {
    if (!recipe.createdAt) return null;
    try {
      // Handle Firestore Timestamp objects or ISO strings
      let date;
      if (recipe.createdAt?.toDate) {
        // Firestore Timestamp object
        date = recipe.createdAt.toDate();
      } else if (typeof recipe.createdAt === 'string') {
        // ISO string
        date = new Date(recipe.createdAt);
      } else if (recipe.createdAt instanceof Date) {
        // Already a Date object
        date = recipe.createdAt;
      } else {
        return null;
      }
      return date.toLocaleDateString('de-DE');
    } catch (error) {
      console.error('Error formatting creation date:', error);
      return null;
    }
  }, [recipe.createdAt]);

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
    // Reset to first step when entering cooking mode
    if (!cookingMode) {
      setCurrentStepIndex(0);
    }
  };

  // Swipe gesture handling
  useEffect(() => {
    if (!cookingMode || !stepsContainerRef.current) return;

    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
      touchEndX = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      const steps = recipe.steps || [];
      if (touchStartX - touchEndX > minSwipeDistance) {
        // Swipe left - next step
        setCurrentStepIndex(prev => Math.min(steps.length - 1, prev + 1));
      } else if (touchEndX - touchStartX > minSwipeDistance) {
        // Swipe right - previous step
        setCurrentStepIndex(prev => Math.max(0, prev - 1));
      }
    };

    const container = stepsContainerRef.current;
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [cookingMode, recipe.steps]);

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return;
    
    await onToggleFavorite(recipe.id);
    // Update local state immediately for responsive UI
    if (isFavorite) {
      setFavoriteIds(favoriteIds.filter(id => id !== recipe.id));
    } else {
      setFavoriteIds([...favoriteIds, recipe.id]);
    }
  };

  const handleRecipeLinkClick = (recipeId) => {
    const linkedRecipe = allRecipes.find(r => r.id === recipeId);
    if (linkedRecipe) {
      // Push current recipe to navigation stack
      setRecipeNavigationStack([...recipeNavigationStack, selectedRecipe]);
      // Navigate to linked recipe
      setSelectedRecipe(linkedRecipe);
      setServingMultiplier(1);
      // Scroll to top
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    }
  };

  const handleBackFromLinkedRecipe = () => {
    if (recipeNavigationStack.length > 0) {
      // Pop from navigation stack and go back
      const previousRecipe = recipeNavigationStack[recipeNavigationStack.length - 1];
      setRecipeNavigationStack(recipeNavigationStack.slice(0, -1));
      setSelectedRecipe(previousRecipe);
      setServingMultiplier(1);
      // Scroll to top
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    } else {
      // No navigation stack, use normal back handler
      onBack();
    }
  };

  const renderIngredient = (ingredient, index) => {
    // Handle both old string format and new object format
    const item = typeof ingredient === 'string' 
      ? { type: 'ingredient', text: ingredient }
      : ingredient;

    // Render heading
    if (item.type === 'heading') {
      return (
        <li key={index} className="ingredient-heading">
          {item.text}
        </li>
      );
    }

    // Check if it's a recipe link
    const recipeLink = decodeRecipeLink(item.text);
    
    if (recipeLink) {
      // This is a recipe link
      const linkedRecipe = allRecipes.find(r => r.id === recipeLink.recipeId);
      const displayName = linkedRecipe ? linkedRecipe.title : recipeLink.recipeName;
      
      // Scale the quantity prefix if present
      const scaledQuantity = recipeLink.quantityPrefix 
        ? scaleIngredient(recipeLink.quantityPrefix)
        : '';
      
      return (
        <li key={index} className="ingredient-with-link">
          {scaledQuantity && <span>{scaledQuantity} </span>}
          <button
            className="recipe-link-button"
            onClick={() => handleRecipeLinkClick(recipeLink.recipeId)}
            title={`Öffne Rezept: ${displayName}`}
          >
            {displayName}
          </button>
        </li>
      );
    }
    
    // Regular ingredient
    return <li key={index}>{scaleIngredient(item.text)}</li>;
  };

  // Get actual step items (filter out headings)
  const stepItems = useMemo(() => {
    const steps = recipe.steps || [];
    return steps.filter(step => {
      const item = typeof step === 'string' ? { type: 'step', text: step } : step;
      return item.type !== 'heading';
    });
  }, [recipe.steps]);

  const currentStep = stepItems[currentStepIndex];
  const totalSteps = stepItems.length;

  return (
    <div className="recipe-detail-container">
      {cookingMode && (
        <div className="cooking-mode-indicator">
          <div className="cooking-mode-content">
            <span className="cooking-mode-icon">
              {isBase64Image(cookingModeIcon) ? (
                <img src={cookingModeIcon} alt="Kochmodus" className="cooking-mode-icon-img" />
              ) : (
                cookingModeIcon
              )}
            </span>
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
      
      {!isMobile && !cookingMode && (
        <div className="recipe-detail-header">
          <button className="back-button" onClick={handleBackFromLinkedRecipe}>
            ← Zurück
          </button>
          
          <div className="action-buttons">
            {onToggleFavorite && (
              <button 
                className={`favorite-button ${isFavorite ? 'is-favorite' : ''}`}
                onClick={handleToggleFavorite}
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
                Eigene Version erstellen
              </button>
            )}
            {userCanDelete && (
              <button className="delete-button" onClick={handleDelete}>
                Löschen
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`recipe-detail-content ${cookingMode ? 'cooking-mode-active' : ''}`} ref={contentRef}>
        {cookingMode ? (
          // Cooking mode layout
          <>
            {/* Portion control at the top */}
            {recipe.portionen && (
              <div className="cooking-mode-serving-control">
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

            {/* Ingredients list */}
            <section className="cooking-mode-ingredients">
              <ul className="ingredients-list">
                {recipe.ingredients?.map((ingredient, index) => 
                  renderIngredient(ingredient, index)
                ) || <li>Keine Zutaten aufgelistet</li>}
              </ul>
            </section>

            {/* Single step display with swipe support */}
            <section className="cooking-mode-steps" ref={stepsContainerRef}>
              <div className="current-step">
                {currentStep ? (
                  typeof currentStep === 'string' ? currentStep : currentStep.text
                ) : 'Keine Zubereitungsschritte vorhanden'}
                <div className="step-counter">
                  Schritt {currentStepIndex + 1} von {totalSteps}
                </div>
              </div>
            </section>
          </>
        ) : (
          // Normal mode layout
          <>
            {recipe.image && (
              <div className="recipe-detail-image">
                <img src={recipe.image} alt={recipe.title} />
                {isMobile && (
                  <div className="image-overlay-actions">
                    <div 
                      className="overlay-cooking-mode-static" 
                      onClick={toggleCookingMode} 
                      role="button" 
                      tabIndex="0" 
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCookingMode()}
                      aria-label="Kochmodus aktivieren"
                    >
                      {isBase64Image(cookingModeIcon) ? (
                        <img src={cookingModeIcon} alt="Kochmodus" className="overlay-cooking-mode-icon-img" />
                      ) : (
                        <span>{cookingModeIcon}</span>
                      )}
                    </div>
                    <button 
                      className="overlay-back-button"
                      onClick={handleBackFromLinkedRecipe}
                      title="Zurück"
                    >
                      {isBase64Image(closeButtonIcon) ? (
                        <img src={closeButtonIcon} alt="Schließen" className="close-button-icon-img" />
                      ) : (
                        closeButtonIcon
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {isMobile && (
              <div className="mobile-action-buttons">
                {onToggleFavorite && (
                  <button 
                    className={`favorite-button ${isFavorite ? 'is-favorite' : ''}`}
                    onClick={handleToggleFavorite}
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
                    Eigene Version erstellen
                  </button>
                )}
                {userCanDelete && (
                  <button className="delete-button" onClick={handleDelete}>
                    Löschen
                  </button>
                )}
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
              {(authorName || formattedCreatedAt) && (
                <div className="author-date-caption">
                  {authorName && <span className="author-name">Autor: {authorName}</span>}
                  {formattedCreatedAt && <span className="creation-date">Erstellt am: {formattedCreatedAt}</span>}
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
                {recipe.ingredients?.map((ingredient, index) => 
                  renderIngredient(ingredient, index)
                ) || <li>Keine Zutaten aufgelistet</li>}
              </ul>
            </section>

            <section className="recipe-section">
              <h2>Zubereitungsschritte</h2>
              <ol className="steps-list">
                {recipe.steps?.map((step, index) => {
                  // Handle both old string format and new object format
                  const item = typeof step === 'string' 
                    ? { type: 'step', text: step }
                    : step;
                  
                  // Render heading as non-numbered item
                  if (item.type === 'heading') {
                    return <li key={index} className="step-heading">{item.text}</li>;
                  }
                  
                  // Regular step
                  return <li key={index}>{item.text}</li>;
                }) || <li>Keine Zubereitungsschritte aufgelistet</li>}
              </ol>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default RecipeDetail;
