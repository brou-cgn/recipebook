import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe, isCurrentUserAdmin } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber, getRecipeVersions, getParentRecipe, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { isBase64Image } from '../utils/imageUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { updateRecipe, enableRecipeSharing, disableRecipeSharing } from '../utils/recipeFirestore';
import { mapNutritionCalcError } from '../utils/nutritionUtils';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import NutritionModal from './NutritionModal';

// Mobile breakpoint constant
const MOBILE_BREAKPOINT = 480;

function RecipeDetail({ recipe: initialRecipe, onBack, onEdit, onDelete, onPublish, onToggleFavorite, onCreateVersion, currentUser, allRecipes = [], allUsers = [], onHeaderVisibilityChange, onAddToMyRecipes, isAddToMyRecipesLoading, isAddToMyRecipesSuccess, isSharedView, publicGroupId }) {
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [selectedRecipe, setSelectedRecipe] = useState(initialRecipe);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [cookingMode, setCookingMode] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [recipeNavigationStack, setRecipeNavigationStack] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const wakeLockRef = useRef(null);
  const contentRef = useRef(null);
  const stepsContainerRef = useRef(null);
  const recipeImageRef = useRef(null);

  // Get portion units from custom lists
  const [portionUnits, setPortionUnits] = useState([]);
  const [cookingModeIcon, setCookingModeIcon] = useState('👨‍🍳');
  const [cookingModeAltIcon, setCookingModeAltIcon] = useState('👨‍🍳');
  const [closeButtonIcon, setCloseButtonIcon] = useState('✕');
  const [closeButtonAltIcon, setCloseButtonAltIcon] = useState('✕');
  // Whether to use alt icons due to bright image corners
  const [useCookingModeAlt, setUseCookingModeAlt] = useState(false);
  const [useCloseButtonAlt, setUseCloseButtonAlt] = useState(false);
  const [copyLinkIcon, setCopyLinkIcon] = useState('📋');
  const [nutritionEmptyIcon, setNutritionEmptyIcon] = useState('➕');
  const [nutritionFilledIcon, setNutritionFilledIcon] = useState('🥦');
  const [showNutritionModal, setShowNutritionModal] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const { getCustomLists, getButtonIcons } = require('../utils/customLists');
      const lists = await getCustomLists();
      const icons = await getButtonIcons();
      setPortionUnits(lists.portionUnits || []);
      setCookingModeIcon(icons.cookingMode || '👨‍🍳');
      setCookingModeAltIcon(icons.cookingModeAlt || icons.cookingMode || '👨‍🍳');
      setCloseButtonIcon(icons.closeButton || '✕');
      setCloseButtonAltIcon(icons.closeButtonAlt || icons.closeButton || '✕');
      setCopyLinkIcon(icons.copyLink || '📋');
      setNutritionEmptyIcon(icons.nutritionEmpty || '➕');
      setNutritionFilledIcon(icons.nutritionFilled || '🥦');
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
    // Reset brightness-based alt icon state for the new recipe's image
    setUseCookingModeAlt(false);
    setUseCloseButtonAlt(false);
    // Scroll to top when opening recipe detail
    window.scrollTo(0, 0);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [initialRecipe]);

  // If the recipe image is already in the browser cache, the onLoad event
  // will not fire and brightness analysis would be skipped. This effect
  // detects that situation and triggers the analysis manually.
  useEffect(() => {
    const img = recipeImageRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      handleRecipeImageLoad({ target: img });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipe.image]);

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
  const isRecipePublic = !recipe.groupId || recipe.groupId === publicGroupId || !!recipe.publishedToPublic;
  const userCanDelete = canDeleteRecipe(currentUser, recipe, isRecipePublic);
  const userCanPublish = !isRecipePublic && userCanDirectlyEdit;

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
    return author.vorname;
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

  const handlePublish = async () => {
    if (!onPublish) return;
    if (window.confirm(`Möchten Sie "${recipe.title}" in der Liste "Öffentlich" veröffentlichen?`)) {
      setPublishLoading(true);
      try {
        await onPublish(recipe.id);
      } finally {
        setPublishLoading(false);
      }
    }
  };

  const handleToggleDraftStatus = async () => {
    try {
      const newStatus = !recipe.isPrivate;
      await updateRecipe(recipe.id, { isPrivate: newStatus });
      // Update the local recipe state to reflect the change
      setSelectedRecipe({ ...recipe, isPrivate: newStatus });
    } catch (error) {
      console.error('Error updating draft status:', error);
      alert('Fehler beim Aktualisieren des Status. Bitte versuchen Sie es erneut.');
    }
  };

  const handleSaveNutrition = async (naehrwerte) => {
    await updateRecipe(recipe.id, { naehrwerte });
    setSelectedRecipe({ ...recipe, naehrwerte });
  };

  const handleAutoCalculateAndSave = async () => {
    const rawIngredients = recipe.zutaten || recipe.ingredients || [];
    const ingredients = rawIngredients
      .filter(item => typeof item === 'string' || (item && typeof item === 'object' && item.type !== 'heading'))
      .map(item => typeof item === 'string' ? item : item.text);
    if (ingredients.length === 0) return;

    // Persist a pending state so the loading indicator survives navigation
    const pending = { ...(recipe.naehrwerte || {}), calcPending: true, calcError: null };
    try {
      await updateRecipe(recipe.id, { naehrwerte: pending });
    } catch (persistErr) {
      console.error('Could not persist calcPending state:', persistErr);
    }
    setSelectedRecipe(prev => ({ ...prev, naehrwerte: pending }));

    const calculateNutrition = httpsCallable(functions, 'calculateNutritionFromOpenFoodFacts');
    const totals = { kalorien: 0, protein: 0, fett: 0, kohlenhydrate: 0, zucker: 0, ballaststoffe: 0, salz: 0 };
    const notIncluded = [];

    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i];
      try {
        const result = await calculateNutrition({ ingredients: [ingredient], portionen: 1 });
        const { naehrwerte: n, details } = result.data;
        const detail = details && details[0];
        if (detail && detail.found) {
          Object.keys(totals).forEach(key => {
            totals[key] += n[key] || 0;
          });
        } else {
          notIncluded.push({ ingredient, error: detail?.error || 'Nicht gefunden' });
        }
      } catch (err) {
        console.error(`Auto-calculation failed for "${ingredient}":`, err);
        notIncluded.push({ ingredient, error: mapNutritionCalcError(err) });
      }
    }

    const final = {
      ...totals,
      calcPending: false,
      calcError: null,
      calcNotIncluded: notIncluded.length > 0 ? notIncluded : null,
      calcFoundCount: ingredients.length - notIncluded.length,
      calcTotalCount: ingredients.length,
    };
    try {
      await updateRecipe(recipe.id, { naehrwerte: final });
      setSelectedRecipe(prev => ({ ...prev, naehrwerte: final }));
    } catch (err) {
      console.error('Could not persist nutrition data:', err);
    }
  };

  const handleNutritionButtonClick = () => {
    if (recipe.naehrwerte?.kalorien != null || recipe.naehrwerte?.calcError || recipe.naehrwerte?.calcNotIncluded) {
      setShowNutritionModal(true);
    } else if (!recipe.naehrwerte?.calcPending) {
      handleAutoCalculateAndSave();
    }
  };

  const getShareUrl = () => {
    const base = window.location.href.split('#')[0];
    return `${base}#share/${recipe.shareId}`;
  };

  const handleToggleShare = async () => {
    setShareLoading(true);
    try {
      if (recipe.shareId) {
        await disableRecipeSharing(recipe.id);
        setSelectedRecipe({ ...recipe, shareId: undefined });
      } else {
        const shareId = await enableRecipeSharing(recipe.id);
        setSelectedRecipe({ ...recipe, shareId });
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
        await navigator.share({ url, title: recipe.title });
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

  // Get actual step items (filter out headings) - moved before useEffect
  const stepItems = useMemo(() => {
    const steps = recipe.steps || [];
    return steps.filter(step => {
      const item = typeof step === 'string' ? { type: 'step', text: step } : step;
      return item.type !== 'heading';
    });
  }, [recipe.steps]);

  const totalSteps = stepItems.length;

  // Keyboard navigation for cooking mode
  useEffect(() => {
    if (!cookingMode) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentStepIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentStepIndex(prev => Math.min(stepItems.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cookingMode, stepItems]);

  // Scroll to current step card
  useEffect(() => {
    if (!cookingMode || !stepsContainerRef.current) return;

    const container = stepsContainerRef.current;
    const cards = container.querySelectorAll('.step-card');
    const currentCard = cards[currentStepIndex];
    
    if (currentCard && currentCard.scrollIntoView) {
      currentCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentStepIndex, cookingMode]);

  // Auto-activate card on swipe/scroll
  useEffect(() => {
    if (!cookingMode || !stepsContainerRef.current) return;

    const container = stepsContainerRef.current;
    let scrollTimeout = null;

    const handleScroll = () => {
      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // Debounce scroll events to avoid excessive updates
      scrollTimeout = setTimeout(() => {
        const cards = container.querySelectorAll('.step-card');
        if (cards.length === 0) return;

        // Calculate which card is most centered in the viewport
        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;

        let closestIndex = 0;
        let closestDistance = Infinity;

        cards.forEach((card, index) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.left + cardRect.width / 2;
          const distance = Math.abs(containerCenter - cardCenter);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });

        // Update currentStepIndex only if it changed
        setCurrentStepIndex(prevIndex => {
          if (prevIndex !== closestIndex) {
            return closestIndex;
          }
          return prevIndex;
        });
      }, 100); // 100ms debounce
    };

    container.addEventListener('scroll', handleScroll);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [cookingMode]);

  /**
   * Analyzes the brightness of the top-left and top-right corners of an image element.
   * If a corner is too bright (luminance > threshold), the corresponding alt icon is used
   * so that the button remains visible against a light background.
   */
  const analyzeBrightness = (imgEl) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      ctx.drawImage(imgEl, 0, 0);

      // Sample the top 20% height and 20% width of each corner
      const sampleW = Math.max(1, Math.floor(imgEl.naturalWidth * 0.2));
      const sampleH = Math.max(1, Math.floor(imgEl.naturalHeight * 0.2));
      const BRIGHTNESS_THRESHOLD = 180;

      // Top-left corner → cooking mode button
      const leftData = ctx.getImageData(0, 0, sampleW, sampleH).data;
      let leftBrightness = 0;
      for (let i = 0; i < leftData.length; i += 4) {
        leftBrightness += leftData[i] * 0.299 + leftData[i + 1] * 0.587 + leftData[i + 2] * 0.114;
      }
      leftBrightness /= leftData.length / 4;
      setUseCookingModeAlt(leftBrightness > BRIGHTNESS_THRESHOLD);

      // Top-right corner → close button
      const rightData = ctx.getImageData(imgEl.naturalWidth - sampleW, 0, sampleW, sampleH).data;
      let rightBrightness = 0;
      for (let i = 0; i < rightData.length; i += 4) {
        rightBrightness += rightData[i] * 0.299 + rightData[i + 1] * 0.587 + rightData[i + 2] * 0.114;
      }
      rightBrightness /= rightData.length / 4;
      setUseCloseButtonAlt(rightBrightness > BRIGHTNESS_THRESHOLD);
    } catch (err) {
      // Silently ignore CORS errors for external images – keep default icons
    }
  };

  /**
   * Called when the visible recipe image finishes loading.
   * For base64 data URLs the image can be analyzed directly.
   * For URL-based images a separate CORS-enabled Image is loaded so that
   * canvas pixel access works without blocking the display of the original image.
   */
  const handleRecipeImageLoad = (e) => {
    const img = e.target;
    if (isBase64Image(img.src)) {
      // Data URLs are never subject to CORS restrictions – analyze directly.
      analyzeBrightness(img);
    } else {
      // Load a separate copy with crossOrigin so getImageData is allowed.
      // The visible <img> has no crossOrigin attribute and therefore always displays.
      const corsImg = new Image();
      corsImg.crossOrigin = 'anonymous';
      corsImg.onload = () => analyzeBrightness(corsImg);
      corsImg.onerror = () => {
        // CORS-only load failed (e.g. Firebase Storage without CORS config).
        // Fall back to analyzing the already-rendered img element directly.
        // analyzeBrightness catches SecurityError (tainted canvas) internally,
        // so worst case the default icons are kept – same as before this fix.
        analyzeBrightness(img);
      };
      corsImg.src = img.src;
    }
  };

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return;
    
    await onToggleFavorite(recipe.id);
    // Update local state immediately for responsive UI
    if (isFavorite) {
      setFavoriteIds(favoriteIds.filter(id => id !== recipe.id));
    } else {
      setFavoriteIds([...favoriteIds, recipe.id]);
    }
    // Preserve local recipe state (e.g. shareId) in case the parent re-render
    // resets selectedRecipe via the useEffect([initialRecipe]) before this resumes
    setSelectedRecipe({ ...recipe });
  };

  const handleRecipeLinkClick = (recipeId) => {
    const linkedRecipe = allRecipes.find(r => r.id === recipeId);
    if (linkedRecipe) {
      // Push current recipe to navigation stack
      setRecipeNavigationStack([...recipeNavigationStack, selectedRecipe]);
      // Navigate to linked recipe
      setSelectedRecipe(linkedRecipe);
      // Reset brightness flags for the new recipe image
      setUseCookingModeAlt(false);
      setUseCloseButtonAlt(false);
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
      // Reset brightness flags for the returning recipe image
      setUseCookingModeAlt(false);
      setUseCloseButtonAlt(false);
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

  return (
    <div className={`recipe-detail-container${cookingMode ? ' cooking-mode-container' : ''}`}>
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
            {userCanDirectlyEdit && isRecipePublic && !recipe.shareId && (
              <button
                className="share-button"
                onClick={handleToggleShare}
                disabled={shareLoading}
                title="Rezept teilen"
              >
                {shareLoading ? '…' : '↑ Teilen'}
              </button>
            )}
            {userCanDirectlyEdit && isRecipePublic && recipe.shareId && (
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
            {isSharedView && !userCanDirectlyEdit && (
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
            {onAddToMyRecipes && (
              isAddToMyRecipesSuccess ? (
                <span className="share-add-success">✓ Zu deinen Rezepten hinzugefügt!</span>
              ) : (
                <button
                  className="share-add-button"
                  onClick={onAddToMyRecipes}
                  disabled={isAddToMyRecipesLoading}
                >
                  {isAddToMyRecipesLoading ? 'Wird hinzugefügt…' : currentUser ? '+ Zu meinen Rezepten' : 'Anmelden & hinzufügen'}
                </button>
              )
            )}
          </div>
        </div>
      )}

      <div className={`recipe-detail-content ${cookingMode ? 'cooking-mode-active' : ''}`} ref={contentRef}>
        {cookingMode ? (
          // Cooking mode layout
          <>
            {/* Ingredients list */}
            <section className="cooking-mode-ingredients">
              <div className="section-header">
                <h2>Zutaten für</h2>
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

            {/* Horizontal step cards with swipe support */}
            <section className="cooking-mode-steps">
              <div className="step-carousel" ref={stepsContainerRef}>
                {stepItems.map((step, index) => (
                  <div
                    key={index}
                    className={`step-card ${index === currentStepIndex ? 'active' : ''}`}
                    onClick={() => setCurrentStepIndex(index)}
                  >
                    <div className="step-content">
                      {typeof step === 'string' ? step : step.text}
                    </div>
                    <div className="step-counter">
                      Schritt {index + 1} von {totalSteps}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Progress indicator dots */}
              <div className="step-dots">
                {stepItems.map((_, index) => (
                  <button
                    key={index}
                    className={`step-dot ${index === currentStepIndex ? 'active' : ''}`}
                    onClick={() => setCurrentStepIndex(index)}
                    aria-label={`Gehe zu Schritt ${index + 1}`}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          // Normal mode layout
          <>
            {recipe.image && (
              <div className="recipe-detail-image">
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  ref={recipeImageRef}
                  onLoad={handleRecipeImageLoad}
                />
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
                      {/* Use alt icon when top-left image corner is too bright */}
                      {isBase64Image(useCookingModeAlt ? cookingModeAltIcon : cookingModeIcon) ? (
                        <img src={useCookingModeAlt ? cookingModeAltIcon : cookingModeIcon} alt="Kochmodus" className="overlay-cooking-mode-icon-img" />
                      ) : (
                        <span>{useCookingModeAlt ? cookingModeAltIcon : cookingModeIcon}</span>
                      )}
                    </div>
                    <button 
                      className="overlay-back-button"
                      onClick={handleBackFromLinkedRecipe}
                      title="Zurück"
                    >
                      {/* Use alt icon when top-right image corner is too bright */}
                      {isBase64Image(useCloseButtonAlt ? closeButtonAltIcon : closeButtonIcon) ? (
                        <img src={useCloseButtonAlt ? closeButtonAltIcon : closeButtonIcon} alt="Schließen" className="close-button-icon-img" />
                      ) : (
                        useCloseButtonAlt ? closeButtonAltIcon : closeButtonIcon
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
                {userCanDirectlyEdit && isRecipePublic && !recipe.shareId && (
                  <button
                    className="share-button"
                    onClick={handleToggleShare}
                    disabled={shareLoading}
                    title="Rezept teilen"
                  >
                    {shareLoading ? '…' : '↑ Teilen'}
                  </button>
                )}
                {userCanDirectlyEdit && isRecipePublic && recipe.shareId && (
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
                {isSharedView && !userCanDirectlyEdit && (
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
                {onAddToMyRecipes && (
                  isAddToMyRecipesSuccess ? (
                    <span className="share-add-success">✓ Zu deinen Rezepten hinzugefügt!</span>
                  ) : (
                    <button
                      className="share-add-button"
                      onClick={onAddToMyRecipes}
                      disabled={isAddToMyRecipesLoading}
                    >
                      {isAddToMyRecipesLoading ? 'Wird hinzugefügt…' : currentUser ? '+ Zu meinen Rezepten' : 'Anmelden & hinzufügen'}
                    </button>
                  )
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
              
              {recipe.kochdauer && (
                <div className="metadata-item">
                  <span className="metadata-label">Zeit:</span>
                  <span className="metadata-value">{recipe.kochdauer} Min.</span>
                </div>
              )}
              
              {recipe.schwierigkeit && (
                <div className="metadata-item">
                  <span className="metadata-label">Schwierigkeit:</span>
                  <span className="metadata-value difficulty-stars">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <span
                        key={level}
                        className={`star ${recipe.schwierigkeit >= level ? 'filled' : 'empty'}`}
                      >
                        {recipe.schwierigkeit >= level ? '★' : '☆'}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              
              {/* Draft status - only visible to admins when activated */}
              {recipe.isPrivate && isCurrentUserAdmin() && (
                <div className="metadata-item draft-checkbox-container">
                  <span className="metadata-label draft-label">Entwurf:</span>
                  <label className="draft-checkbox-wrapper">
                    <input
                      type="checkbox"
                      checked={recipe.isPrivate}
                      onChange={handleToggleDraftStatus}
                      className="draft-checkbox"
                      aria-label="Rezept als Entwurf markieren"
                    />
                  </label>
                </div>
              )}

              {/* Nutrition icon - always visible, two states */}
              {!isSharedView && (
                <div className="metadata-item">
                  <button
                    className="nutrition-metadata-btn"
                    onClick={handleNutritionButtonClick}
                    disabled={recipe.naehrwerte?.calcPending}
                    title={recipe.naehrwerte?.kalorien != null || recipe.naehrwerte?.calcError || recipe.naehrwerte?.calcNotIncluded ? 'Nährwerte anzeigen' : 'Nährwerte berechnen'}
                    aria-label={recipe.naehrwerte?.kalorien != null || recipe.naehrwerte?.calcError || recipe.naehrwerte?.calcNotIncluded ? 'Nährwerte anzeigen' : 'Nährwerte berechnen'}
                  >
                    <span className="nutrition-icon">
                      {recipe.naehrwerte?.kalorien != null || recipe.naehrwerte?.calcError || recipe.naehrwerte?.calcNotIncluded ? (
                        isBase64Image(nutritionFilledIcon) ? (
                          <img src={nutritionFilledIcon} alt="Nährwerte" />
                        ) : (
                          nutritionFilledIcon
                        )
                      ) : (
                        isBase64Image(nutritionEmptyIcon) ? (
                          <img src={nutritionEmptyIcon} alt="Nährwerte hinzufügen" />
                        ) : (
                          nutritionEmptyIcon
                        )
                      )}
                    </span>
                    {recipe.naehrwerte?.kalorien != null && (
                      <span className="nutrition-kcal-badge">{Math.round(recipe.naehrwerte.kalorien / (recipe.portionen || 4))} kcal</span>
                    )}
                    <span className="nutrition-label">
                      {recipe.naehrwerte?.calcPending ? 'Berechne…' : (recipe.naehrwerte?.kalorien != null || recipe.naehrwerte?.calcError || recipe.naehrwerte?.calcNotIncluded ? null : 'Nährwerte berechnen')}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <section className="recipe-section">
              <div className="section-header">
                <h2>Zutaten für</h2>
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

            {userCanPublish && (
              <div className="publish-section">
                <button className="publish-button publish-button-steps" onClick={handlePublish} disabled={publishLoading}>
                  {publishLoading ? '…' : 'Veröffentlichen'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showNutritionModal && (
        <NutritionModal
          recipe={recipe}
          onClose={() => setShowNutritionModal(false)}
          onSave={handleSaveNutrition}
        />
      )}
    </div>
  );
}

export default RecipeDetail;
