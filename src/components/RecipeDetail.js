import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe, isCurrentUserAdmin } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber, getRecipeVersions, getParentRecipe, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { isBase64Image } from '../utils/imageUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { updateRecipe, enableRecipeSharing, disableRecipeSharing } from '../utils/recipeFirestore';
import { mapNutritionCalcError } from '../utils/nutritionUtils';
import { scaleIngredient as scaleIngredientUtil, combineIngredients, isWaterIngredient, convertIngredientUnits } from '../utils/ingredientUtils';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import NutritionModal from './NutritionModal';
import ShoppingListModal from './ShoppingListModal';
import RatingModal from './RatingModal';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference } from '../utils/customLists';
import RecipeRating from './RecipeRating';
import CookDateModal from './CookDateModal';


// Mobile breakpoint constant
const MOBILE_BREAKPOINT = 480;

// Regex to detect German time expressions: "10 Minuten", "2 Stunden", "45 Sek"
const TIME_REGEX_SOURCE = String.raw`(\d+(?:[.,]\d+)?)\s*(Stunden?|h\b|Minuten?|Min\.?|Sekunden?|Sek\.?)`;

function RecipeDetail({ recipe: initialRecipe, onBack, onEdit, onDelete, onPublish, onToggleFavorite, onCreateVersion, currentUser, allRecipes = [], allUsers = [], onHeaderVisibilityChange, onAddToMyRecipes, isAddToMyRecipesLoading, isAddToMyRecipesSuccess, isSharedView, publicGroupId, menuPortionCount, onPortionCountChange, privateLists = [], onAddToPrivateList, onRemoveFromPrivateList }) {
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
  // Carousel refs
  const carouselImagesRef = useRef([]);
  const carouselTrackRef = useRef(null);
  const carouselScrollTimeoutRef = useRef(null);
  const carouselLengthRef = useRef(0);

  // Get portion units from custom lists
  const [portionUnits, setPortionUnits] = useState([]);
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [cookingModeIcon, setCookingModeIcon] = useState('♨');
  const [cookingModeAltIcon, setCookingModeAltIcon] = useState('♨');
  const [cookingModeDefaultImgIcon, setCookingModeDefaultImgIcon] = useState('♨');
  const [closeButtonIcon, setCloseButtonIcon] = useState('×');
  const [closeButtonAltIcon, setCloseButtonAltIcon] = useState('×');
  const [closeButtonDefaultImgIcon, setCloseButtonDefaultImgIcon] = useState('×');
  // Whether to use alt icons due to bright image corners
  const [useCookingModeAlt, setUseCookingModeAlt] = useState(false);
  const [useCloseButtonAlt, setUseCloseButtonAlt] = useState(false);
  // Whether the current carousel image is a default category image
  const [isDefaultCategoryImage, setIsDefaultCategoryImage] = useState(false);
  const [categoryImageSet, setCategoryImageSet] = useState(new Set());
  // Track whether category images have been loaded to avoid flashing wrong icons
  const [categoryImageSetLoaded, setCategoryImageSetLoaded] = useState(false);
  // Track whether button icons have been loaded to avoid flashing text defaults
  const [buttonIconsLoaded, setButtonIconsLoaded] = useState(false);
  // Image carousel state
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [copyLinkIcon, setCopyLinkIcon] = useState('Link');
  const [nutritionEmptyIcon, setNutritionEmptyIcon] = useState('+');
  const [nutritionFilledIcon, setNutritionFilledIcon] = useState('Nähr.');
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPortionSelector, setShowPortionSelector] = useState(false);
  const [linkedPortionCounts, setLinkedPortionCounts] = useState({});
  const [shoppingListIcon, setShoppingListIcon] = useState('Einkauf');
  const [bringButtonIcon, setBringButtonIcon] = useState('Bring');
  const [timerStartIcon, setTimerStartIcon] = useState('▶');
  const [timerStopIcon, setTimerStopIcon] = useState('■');
  const [cookDateIcon, setCookDateIcon] = useState('Datum');
  const [editRecipeIcon, setEditRecipeIcon] = useState('Edit');
  const [editFabPressed, setEditFabPressed] = useState(false);
  const [newVersionIcon, setNewVersionIcon] = useState('Version');
  const [favoritesButtonIcon, setFavoritesButtonIcon] = useState('☆');
  const [favoritesButtonActiveIcon, setFavoritesButtonActiveIcon] = useState('★');
  const [newVersionFabPressed, setNewVersionFabPressed] = useState(false);
  const [conversionTable, setConversionTable] = useState([]);
  const [showCookDateModal, setShowCookDateModal] = useState(false);
  const [cookDateModalPrefillToday, setCookDateModalPrefillToday] = useState(false);
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineCookEventBubbleIcon, setTimelineCookEventBubbleIcon] = useState(null);
  const [timelineCookEventDefaultImage, setTimelineCookEventDefaultImage] = useState(null);
  const missingSavedRef = useRef(false);
  const editLongPressTimerRef = useRef(null);
  const editLongPressTriggeredRef = useRef(false);
  const [activeTimers, setActiveTimers] = useState({});
  const timerIntervalsRef = useRef({});
  const [alarmRunning, setAlarmRunning] = useState(false);
  const [alarmLabel, setAlarmLabel] = useState('');
  const alarmIntervalRef = useRef(null);
  const alarmCtxRef = useRef(null);
  const notifyTimerDoneRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      const { getCustomLists, getButtonIcons, getTimelineBubbleIcon, getTimelineCookEventBubbleIcon, getTimelineCookEventDefaultImage } = require('../utils/customLists');
      const { getCategoryImages } = require('../utils/categoryImages');
      const [lists, icons, catImages] = await Promise.all([
        getCustomLists(),
        getButtonIcons(),
        Promise.resolve(getCategoryImages()).catch((err) => { console.error('Error loading category images:', err); return []; }),
      ]);
      // Pre-compute individual icon states using the current dark mode preference so
      // that all icon state updates land in the same React batch as setButtonIconsLoaded(true).
      // Without this, buttons become visible (buttonIconsLoaded=true) one render cycle before
      // the dependent useEffect updates the individual icon states, causing a brief flash of
      // the initial text/emoji placeholders.
      const currentDarkMode = getDarkModePreference();
      const eff = (key) => getEffectiveIcon(icons, key, currentDarkMode);
      setCookingModeIcon(eff('cookingMode') || '♨');
      setCookingModeAltIcon(eff('cookingModeAlt') || eff('cookingMode') || '♨');
      setCookingModeDefaultImgIcon(eff('cookingModeDefaultImg') || eff('cookingMode') || '♨');
      setCloseButtonIcon(eff('closeButton') || '×');
      setCloseButtonAltIcon(eff('closeButtonAlt') || eff('closeButton') || '×');
      setCloseButtonDefaultImgIcon(eff('closeButtonDefaultImg') || eff('closeButton') || '×');
      setCopyLinkIcon(eff('copyLink') || 'Link');
      setNutritionEmptyIcon(eff('nutritionEmpty') || '+');
      setNutritionFilledIcon(eff('nutritionFilled') || 'Nähr.');
      setShoppingListIcon(eff('shoppingList') || 'Einkauf');
      setBringButtonIcon(eff('bringButton') || 'Bring');
      setTimerStartIcon(eff('timerStart') || '▶');
      setTimerStopIcon(eff('timerStop') || '■');
      setCookDateIcon(eff('cookDate') || 'Datum');
      setEditRecipeIcon(eff('editRecipe') || 'Edit');
      setNewVersionIcon(eff('newVersion') || 'Version');
      setFavoritesButtonIcon(eff('menuFavoritesButton') || '☆');
      setFavoritesButtonActiveIcon(eff('menuFavoritesButtonActive') || '★');
      setPortionUnits(lists.portionUnits || []);
      setAllButtonIcons(icons);
      setButtonIconsLoaded(true);
      setConversionTable(lists.conversionTable || []);
      setCategoryImageSet(new Set((catImages || []).map(ci => ci.image).filter(Boolean)));
      setCategoryImageSetLoaded(true);
      const bubbleIcon = await getTimelineBubbleIcon();
      const cookEventBubbleIcon = await getTimelineCookEventBubbleIcon();
      const cookEventDefaultImg = await getTimelineCookEventDefaultImage();
      setTimelineBubbleIcon(bubbleIcon);
      setTimelineCookEventBubbleIcon(cookEventBubbleIcon);
      setTimelineCookEventDefaultImage(cookEventDefaultImg);
    };
    loadSettings().catch(() => setButtonIconsLoaded(true));
  }, []);

  // Re-compute individual icon states when icons or dark mode changes
  useEffect(() => {
    const eff = (key) => getEffectiveIcon(allButtonIcons, key, isDarkMode);
    setCookingModeIcon(eff('cookingMode') || '♨');
    setCookingModeAltIcon(eff('cookingModeAlt') || eff('cookingMode') || '♨');
    setCookingModeDefaultImgIcon(eff('cookingModeDefaultImg') || eff('cookingMode') || '♨');
    setCloseButtonIcon(eff('closeButton') || '×');
    setCloseButtonAltIcon(eff('closeButtonAlt') || eff('closeButton') || '×');
    setCloseButtonDefaultImgIcon(eff('closeButtonDefaultImg') || eff('closeButton') || '×');
    setCopyLinkIcon(eff('copyLink') || 'Link');
    setNutritionEmptyIcon(eff('nutritionEmpty') || '+');
    setNutritionFilledIcon(eff('nutritionFilled') || 'Nähr.');
    setShoppingListIcon(eff('shoppingList') || 'Einkauf');
    setBringButtonIcon(eff('bringButton') || 'Bring');
    setTimerStartIcon(eff('timerStart') || '▶');
    setTimerStopIcon(eff('timerStop') || '■');
    setCookDateIcon(eff('cookDate') || 'Datum');
    setEditRecipeIcon(eff('editRecipe') || 'Edit');
    setNewVersionIcon(eff('newVersion') || 'Version');
    setFavoritesButtonIcon(eff('menuFavoritesButton') || '☆');
    setFavoritesButtonActiveIcon(eff('menuFavoritesButtonActive') || '★');
  }, [allButtonIcons, isDarkMode]);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (editLongPressTimerRef.current) {
        clearTimeout(editLongPressTimerRef.current);
      }
    };
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
    setCarouselIndex(0);
    // Initialize serving multiplier from menu portion count if provided
    if (menuPortionCount != null && initialRecipe.portionen) {
      setServingMultiplier(menuPortionCount / initialRecipe.portionen);
    } else {
      setServingMultiplier(1);
    }
    // Scroll carousel track back to the first image
    if (carouselTrackRef.current) {
      carouselTrackRef.current.scrollLeft = 0;
    }
    // Scroll to top when opening recipe detail
    window.scrollTo(0, 0);
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [initialRecipe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also reset carousel index whenever the selected recipe changes (e.g. version navigation)
  useEffect(() => {
    setCarouselIndex(0);
    if (carouselTrackRef.current) {
      carouselTrackRef.current.scrollLeft = 0;
    }
  }, [selectedRecipe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Both useCookingModeAlt and useCloseButtonAlt always share the same value so
  // there is never a mixed icon state.
  // Also detects whether the current image is a default category image.
  useEffect(() => {
    const allImages = Array.isArray(selectedRecipe.images) && selectedRecipe.images.length > 0
      ? selectedRecipe.images
      : (selectedRecipe.image ? [{ url: selectedRecipe.image, isDefault: true }] : []);
    const orderedImages = [
      ...allImages.filter(img => img.isDefault),
      ...allImages.filter(img => !img.isDefault),
    ];
    const safeIdx = Math.min(carouselIndex, Math.max(0, orderedImages.length - 1));
    const currentImage = orderedImages[safeIdx];
    const isBright = currentImage?.imageBrightness?.isBright || false;
    setUseCookingModeAlt(isBright);
    setUseCloseButtonAlt(isBright);
    const isCatImage = Boolean(currentImage?.url) && categoryImageSet.has(currentImage.url);
    setIsDefaultCategoryImage(isCatImage);
  }, [selectedRecipe.images, selectedRecipe.image, carouselIndex, categoryImageSet]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Collect unique linked (sub-)recipes referenced in this recipe's ingredients
  const linkedRecipes = useMemo(() => {
    const seenIds = new Set();
    const result = [];
    for (const ing of (recipe.ingredients || [])) {
      const text = typeof ing === 'string' ? ing : ing?.text;
      const link = decodeRecipeLink(text);
      if (link && !seenIds.has(link.recipeId)) {
        const linked = allRecipes.find(r => r.id === link.recipeId);
        if (linked) {
          seenIds.add(link.recipeId);
          result.push(linked);
        }
      }
    }
    return result;
  }, [recipe.ingredients, allRecipes]);

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

  // Edit FAB long press handlers
  const handleEditFabPressStart = () => {
    setEditFabPressed(true);
    if (userCanCreateVersion && onCreateVersion) {
      editLongPressTimerRef.current = setTimeout(() => {
        editLongPressTriggeredRef.current = true;
        onCreateVersion(recipe);
      }, 500);
    }
  };

  const handleEditFabPressEnd = () => {
    setEditFabPressed(false);
    if (editLongPressTimerRef.current) {
      clearTimeout(editLongPressTimerRef.current);
      editLongPressTimerRef.current = null;
    }
  };

  const handleEditFabClick = () => {
    if (editLongPressTriggeredRef.current) {
      editLongPressTriggeredRef.current = false;
      return;
    }
    onEdit && onEdit(recipe);
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

  const handleTogglePrivateList = async (listId) => {
    if (!recipe.id) return;
    const list = privateLists.find(l => l.id === listId);
    if (!list) return;
    const isInList = Array.isArray(list.recipeIds) && list.recipeIds.includes(recipe.id);
    if (isInList) {
      if (onRemoveFromPrivateList) await onRemoveFromPrivateList(listId, recipe.id);
    } else {
      if (onAddToPrivateList) await onAddToPrivateList(listId, recipe.id);
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

  const getShoppingListIngredients = () => {
    const rawIngredients = recipe.ingredients || [];
    const ingredients = [];
    for (const ing of rawIngredients) {
      const item = typeof ing === 'string' ? { type: 'ingredient' } : ing;
      if (item.type === 'heading') continue;
      const text = typeof ing === 'string' ? ing : ing.text;
      const recipeLink = decodeRecipeLink(text);
      if (recipeLink) {
        // Expand linked recipe ingredients
        const linkedRecipe = allRecipes.find(r => r.id === recipeLink.recipeId);
        if (linkedRecipe) {
          const targetPortions = linkedPortionCounts[recipeLink.recipeId] ?? (linkedRecipe.portionen || 4);
          if (targetPortions === 0) continue;
          const multiplier = targetPortions / (linkedRecipe.portionen || 4);
          for (const linkedIng of (linkedRecipe.ingredients || [])) {
            const linkedItem = typeof linkedIng === 'string' ? { type: 'ingredient', text: linkedIng } : linkedIng;
            if (linkedItem.type === 'heading') continue;
            const linkedText = typeof linkedIng === 'string' ? linkedIng : linkedIng.text;
            if (decodeRecipeLink(linkedText)) continue; // skip nested links
            if (isWaterIngredient(linkedText)) continue; // skip water
            ingredients.push(multiplier !== 1 ? scaleIngredientUtil(linkedText, multiplier) : linkedText);
          }
        }
      } else {
        if (!isWaterIngredient(text)) ingredients.push(scaleIngredient(text));
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

  const getShareUrl = () => {
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
    if (projectId) {
      return `https://${projectId}.web.app/share/${recipe.shareId}`;
    }
    // Fallback when project ID is not configured
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

  const handleShoppingListClick = () => {
    if (linkedRecipes.length > 0) {
      setLinkedPortionCounts({});
      setShowPortionSelector(true);
    } else {
      missingSavedRef.current = false;
      setShowShoppingListModal(true);
    }
  };

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

  // ── Timer helpers ──────────────────────────────────────────────────────────

  function parseTimeToSeconds(value, unit) {
    const num = parseFloat(value.replace(',', '.'));
    const u = unit.toLowerCase();
    if (u === 'h' || u.startsWith('stund')) return Math.round(num * 3600);
    if (u.startsWith('min')) return Math.round(num * 60);
    // seconds: 'sek', 'sekunde', 'sekunden'
    return Math.round(num);
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function playRadarPattern(ctx) {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      // Ascending sweep: 800 Hz → 1800 Hz over 0.3s
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(1800, now + 0.3);
      // Descending sweep: 1800 Hz → 800 Hz over 0.2s
      osc.frequency.linearRampToValueAtTime(800, now + 0.5);
      gain.gain.setValueAtTime(0.65, now);
      gain.gain.setValueAtTime(0.65, now + 0.5);
      gain.gain.linearRampToValueAtTime(0, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);

      // Second harmonic for a more piercing sound
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1600, now);
      osc2.frequency.linearRampToValueAtTime(3600, now + 0.3);
      osc2.frequency.linearRampToValueAtTime(1600, now + 0.5);
      gain2.gain.setValueAtTime(0.28, now);
      gain2.gain.setValueAtTime(0.28, now + 0.5);
      gain2.gain.linearRampToValueAtTime(0, now + 0.6);
      osc2.start(now);
      osc2.stop(now + 0.6);
    } catch (_) {
      // Audio API not available – silently ignore
    }
  }

  /*function startAlarmLoop(label) {
    // Only one alarm at a time
    if (alarmIntervalRef.current) return;

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      alarmCtxRef.current = ctx;
      playRadarPattern(ctx);
      alarmIntervalRef.current = setInterval(() => {
        playRadarPattern(ctx);
      }, 1000);
    } catch (_) {
      // Audio API not available – silently ignore
    }

    setAlarmLabel(label);
    setAlarmRunning(true);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Timer abgelaufen!', { body: label, icon: '/favicon.ico' });
    }
  }*/

  async function startAlarmLoop(label) {
    // Nur ein Alarm gleichzeitig
    if (alarmIntervalRef.current) return;
  
    setAlarmLabel(label);
    setAlarmRunning(true);
  
    try {
      if (!alarmCtxRef.current) {
        // Fallback: context was not pre-created in startTimer (e.g. in tests / non-iOS).
        // On iOS this path will likely be blocked by the browser's autoplay policy.
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('AudioContext not supported');
        alarmCtxRef.current = new AudioCtx();
      }
  
      const ctx = alarmCtxRef.current;
  
      // Auf manchen Mobilgeräten startet der Context suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
  
      // Sofort einmal abspielen
      playRadarPattern(ctx);
  
      // Dann wiederholen bis OK gedrückt wird
      alarmIntervalRef.current = setInterval(async () => {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          playRadarPattern(ctx);
        } catch (_) {
          // ignorieren
        }
      }, 1000);
    } catch (_) {
      // Audio API nicht verfügbar – Modal bleibt trotzdem sichtbar
    }
  
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Timer abgelaufen!', {
        body: label,
        icon: '/favicon.ico'
      });
    }
  }
  
  /*function stopAlarm() {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (alarmCtxRef.current) {
      try { alarmCtxRef.current.close(); } catch (_) {}
      alarmCtxRef.current = null;
    }
    setAlarmRunning(false);
    setAlarmLabel('');
  }*/

  function stopAlarm() {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  
    // Context nicht jedes Mal schließen, sondern behalten.
    // Das ist stabiler als bei jedem Alarm einen neuen anzulegen.
    setAlarmRunning(false);
    setAlarmLabel('');
  }
  
  function notifyTimerDone(label) {
    startAlarmLoop(label);
  }

  // Keep a ref to notifyTimerDone so the visibilitychange effect can always
  // access the latest version without needing it in its dependency array.
  notifyTimerDoneRef.current = notifyTimerDone;

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function startTimer(stepKey, timerIndex, totalSeconds, label) {
    requestNotificationPermission();

    // Initialize AudioContext here (direct user gesture) so iOS allows audio playback later.
    if (!alarmCtxRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          alarmCtxRef.current = new AudioCtx();
        }
      } catch (e) {
        console.warn('AudioContext creation failed:', e);
      }
    }

    // Resume the context in case iOS suspended it.
    if (alarmCtxRef.current && alarmCtxRef.current.state === 'suspended') {
      alarmCtxRef.current.resume().catch(e => console.warn('AudioContext resume failed:', e));
    }

    const endTime = Date.now() + totalSeconds * 1000;
    setActiveTimers(prev => ({
      ...prev,
      [stepKey]: {
        ...(prev[stepKey] || {}),
        [timerIndex]: {
          totalSeconds,
          remainingSeconds: totalSeconds,
          endTime,
          running: true,
          finished: false,
          label,
        },
      },
    }));
    const intervalKey = `${stepKey}_${timerIndex}`;
    if (timerIntervalsRef.current[intervalKey]) {
      clearInterval(timerIntervalsRef.current[intervalKey]);
    }
    timerIntervalsRef.current[intervalKey] = setInterval(() => {
      setActiveTimers(prev => {
        const stepTimers = prev[stepKey];
        if (!stepTimers) return prev;
        const t = stepTimers[timerIndex];
        if (!t || !t.running) return prev;
        const next = Math.max(0, Math.round((t.endTime - Date.now()) / 1000));
        if (next <= 0) {
          clearInterval(timerIntervalsRef.current[intervalKey]);
          delete timerIntervalsRef.current[intervalKey];
          notifyTimerDone(t.label);
          return {
            ...prev,
            [stepKey]: {
              ...stepTimers,
              [timerIndex]: { ...t, remainingSeconds: 0, running: false, finished: true },
            },
          };
        }
        return {
          ...prev,
          [stepKey]: {
            ...stepTimers,
            [timerIndex]: { ...t, remainingSeconds: next },
          },
        };
      });
    }, 1000);
  }

  function pauseTimer(stepKey, timerIndex) {
    const intervalKey = `${stepKey}_${timerIndex}`;
    clearInterval(timerIntervalsRef.current[intervalKey]);
    delete timerIntervalsRef.current[intervalKey];
    setActiveTimers(prev => {
      const stepTimers = prev[stepKey];
      if (!stepTimers) return prev;
      return {
        ...prev,
        [stepKey]: {
          ...stepTimers,
          [timerIndex]: { ...stepTimers[timerIndex], running: false },
        },
      };
    });
  }

  function resumeTimer(stepKey, timerIndex) {
    setActiveTimers(prev => {
      const stepTimers = prev[stepKey];
      if (!stepTimers) return prev;
      const t = stepTimers[timerIndex];
      if (!t || t.finished) return prev;
      const endTime = Date.now() + t.remainingSeconds * 1000;
      const intervalKey = `${stepKey}_${timerIndex}`;
      if (timerIntervalsRef.current[intervalKey]) clearInterval(timerIntervalsRef.current[intervalKey]);
      timerIntervalsRef.current[intervalKey] = setInterval(() => {
        setActiveTimers(cur => {
          const st = cur[stepKey];
          if (!st) return cur;
          const tt = st[timerIndex];
          if (!tt || !tt.running) return cur;
          const next = Math.max(0, Math.round((tt.endTime - Date.now()) / 1000));
          if (next <= 0) {
            clearInterval(timerIntervalsRef.current[intervalKey]);
            delete timerIntervalsRef.current[intervalKey];
            notifyTimerDone(tt.label);
            return { ...cur, [stepKey]: { ...st, [timerIndex]: { ...tt, remainingSeconds: 0, running: false, finished: true } } };
          }
          return { ...cur, [stepKey]: { ...st, [timerIndex]: { ...tt, remainingSeconds: next } } };
        });
      }, 1000);
      return {
        ...prev,
        [stepKey]: { ...stepTimers, [timerIndex]: { ...t, endTime, running: true } },
      };
    });
  }

  function stopTimer(stepKey, timerIndex) {
    const intervalKey = `${stepKey}_${timerIndex}`;
    clearInterval(timerIntervalsRef.current[intervalKey]);
    delete timerIntervalsRef.current[intervalKey];
    setActiveTimers(prev => {
      const stepTimers = { ...(prev[stepKey] || {}) };
      delete stepTimers[timerIndex];
      return { ...prev, [stepKey]: stepTimers };
    });
  }

  // Clean up all intervals on unmount
  /*useEffect(() => {
    const intervals = timerIntervalsRef.current;
    return () => {
      Object.values(intervals).forEach(id => clearInterval(id));
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
      if (alarmCtxRef.current) {
        try { alarmCtxRef.current.close(); } catch (_) {}
      }
    };
  }, []);*/

  useEffect(() => {
    const intervals = timerIntervalsRef.current;
    return () => {
      Object.values(intervals).forEach(id => clearInterval(id));
  
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
  
      if (alarmCtxRef.current) {
        try { alarmCtxRef.current.close(); } catch (_) {}
        alarmCtxRef.current = null;
      }
    };
  }, []);

  // Sync running timers with actual elapsed time when the page becomes visible again
  // (handles screen lock, app switching to background, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      setActiveTimers(prev => {
        const now = Date.now();
        let changed = false;
        const next = {};
        Object.entries(prev).forEach(([stepKey, stepTimers]) => {
          next[stepKey] = { ...stepTimers };
          Object.entries(stepTimers).forEach(([timerIndex, t]) => {
            if (t.running && t.endTime) {
              const remaining = Math.max(0, Math.round((t.endTime - now) / 1000));
              if (remaining <= 0 && !t.finished) {
                const intervalKey = `${stepKey}_${timerIndex}`;
                clearInterval(timerIntervalsRef.current[intervalKey]);
                delete timerIntervalsRef.current[intervalKey];
                next[stepKey] = { ...next[stepKey], [timerIndex]: { ...t, remainingSeconds: 0, running: false, finished: true } };
                notifyTimerDoneRef.current(t.label);
                changed = true;
              } else if (remaining !== t.remainingSeconds) {
                next[stepKey] = { ...next[stepKey], [timerIndex]: { ...t, remainingSeconds: remaining } };
                changed = true;
              }
            }
          });
        });
        return changed ? next : prev;
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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

  // --- Carousel scroll handlers ---

  const scrollToCarouselIndex = (index) => {
    const track = carouselTrackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.offsetWidth, behavior: 'smooth' });
    setCarouselIndex(index);
  };

  const handleCarouselScroll = () => {
    const track = carouselTrackRef.current;
    if (!track) return;

    if (carouselScrollTimeoutRef.current) {
      clearTimeout(carouselScrollTimeoutRef.current);
    }

    carouselScrollTimeoutRef.current = setTimeout(() => {
      const newIndex = Math.round(track.scrollLeft / track.offsetWidth);
      const len = carouselLengthRef.current;
      if (newIndex >= 0 && newIndex < len) {
        setCarouselIndex(newIndex);
      }
    }, 30);
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
              ×
            </button>
          </div>
        </div>
      )}
      
      {!isMobile && !cookingMode && (
        <div className="recipe-detail-header">
          <button className="back-button" onClick={handleBackFromLinkedRecipe}>
            ← Zurück
          </button>
          
          <div className="action-buttons" style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}>
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
            {onToggleFavorite && (
              <button 
                className={`favorite-button ${isFavorite ? 'favorite-button--active' : ''}`}
                onClick={handleToggleFavorite}
                title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                aria-pressed={isFavorite}
                type="button"
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
            )}
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
            {currentUser && !currentUser.isGuest && (
              <button
                className="cook-date-button"
                onClick={() => { setCookDateModalPrefillToday(false); setShowCookDateModal(true); }}
                title="Kochdatum erfassen"
                aria-label="Kochdatum erfassen"
              >
                {isBase64Image(cookDateIcon) ? (
                  <img src={cookDateIcon} alt="Kochdatum" className="cook-date-icon-img" />
                ) : (
                  cookDateIcon
                )}
              </button>
            )}
            <RecipeRating
              recipeId={recipe.id}
              ratingAvg={recipe.ratingAvg}
              ratingCount={recipe.ratingCount}
              currentUser={currentUser}
              onOpenModal={() => setShowRatingModal(true)}
            />
            {isRecipePublic && !recipe.shareId && (
              <button
                className="share-button"
                onClick={handleToggleShare}
                disabled={shareLoading}
                title="Rezept teilen"
              >
                {shareLoading ? '…' : '↑ Teilen'}
              </button>
            )}
            {recipe.shareId && (
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
            {isSharedView && !isRecipePublic && (
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
                          if (onPortionCountChange) onPortionCountChange(recipe.id, newServings);
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
                        if (onPortionCountChange) onPortionCountChange(recipe.id, newServings);
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
                {stepItems.map((step, index) => {
                  const stepText = typeof step === 'string' ? step : step.text;
                  const stepKey = `step_${index}`;

                  // Detect first time mention for the per-step timer
                  const re = new RegExp(TIME_REGEX_SOURCE, 'gi');
                  const firstMatch = re.exec(stepText);
                  const timerLabel = firstMatch ? firstMatch[0] : null;
                  const timerSeconds = firstMatch ? parseTimeToSeconds(firstMatch[1], firstMatch[2]) : 0;
                  const timer = timerLabel ? activeTimers[stepKey]?.[0] : null;

                  return (
                    <div
                      key={index}
                      className={`step-card ${index === currentStepIndex ? 'active' : ''}`}
                      onClick={() => setCurrentStepIndex(index)}
                    >
                      {/* Timer header: start/stop button at top right */}
                      {timerLabel && (
                        <div className="step-timer-header">
                          {timer ? (
                            <div className="step-timer-top-area">
                              <span className={`step-timer-time${timer.finished ? ' finished' : ''}`}>
                                {timer.finished ? '✓' : formatTime(timer.remainingSeconds)}
                              </span>
                              <button
                                className="step-timer-btn stop"
                                onClick={e => { e.stopPropagation(); stopTimer(stepKey, 0); }}
                                aria-label="Timer stoppen"
                                title="Stoppen"
                              >
                                {isBase64Image(timerStopIcon)
                                  ? <img src={timerStopIcon} alt="Timer stoppen" className="timer-stop-icon-img" />
                                  : timerStopIcon}
                              </button>
                            </div>
                          ) : (
                            <button
                              className="step-timer-start-btn"
                              onClick={e => { e.stopPropagation(); startTimer(stepKey, 0, timerSeconds, timerLabel); }}
                              aria-label={`Timer für ${timerLabel} starten`}
                              title={`Timer für ${timerLabel} starten`}
                            >
                              {isBase64Image(timerStartIcon)
                                ? <img src={timerStartIcon} alt="Timer starten" className="timer-start-icon-img" />
                                : timerStartIcon}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="step-content">
                        {stepText}
                      </div>
                      <div className="step-counter">
                        {index === totalSteps - 1 && currentUser && (
                          <button
                            className="step-heute-gekocht-btn"
                            onClick={e => { e.stopPropagation(); setCookDateModalPrefillToday(true); setShowCookDateModal(true); }}
                            aria-label="Heute gekocht"
                          >
                            Heute gekocht
                          </button>
                        )}
                        Schritt {index + 1} von {totalSteps}
                      </div>
                      {/* Progress bar at bottom – spans full card width */}
                      {timer && (
                        <div className="step-timer-progress-bar" aria-hidden="true">
                          <div
                            className={`step-timer-progress-fill${timer.finished ? ' finished' : ''}`}
                            style={{ width: `${(timer.remainingSeconds / timer.totalSeconds) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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
            {(recipe.image || (Array.isArray(recipe.images) && recipe.images.length > 0)) && (() => {
              // Build ordered images list: use images array if available, else fall back to single image
              const allImages = Array.isArray(recipe.images) && recipe.images.length > 0
                ? recipe.images
                : (recipe.image ? [{ url: recipe.image, isDefault: true }] : []);
              // Put default image first
              const orderedImages = [
                ...allImages.filter(img => img.isDefault),
                ...allImages.filter(img => !img.isDefault),
              ];
              const safeIndex = Math.min(carouselIndex, orderedImages.length - 1);
              const hasMultiple = orderedImages.length > 1;
              carouselLengthRef.current = orderedImages.length;
              return (
                <div
                  className="recipe-detail-image"
                >
                  <div
                    className="carousel-track"
                    ref={carouselTrackRef}
                    onScroll={hasMultiple ? handleCarouselScroll : undefined}
                  >
                    {orderedImages.map((img, idx) => (
                      <div key={idx} className="carousel-slide">
                        <img
                          src={img.url}
                          alt={recipe.title}
                          ref={el => { carouselImagesRef.current[idx] = el; }}
                        />
                      </div>
                    ))}
                  </div>
                  {hasMultiple && (
                    <>
                      <button
                        className="carousel-arrow carousel-arrow--prev"
                        onClick={() => scrollToCarouselIndex((safeIndex - 1 + orderedImages.length) % orderedImages.length)}
                        aria-label="Vorheriges Bild"
                      >
                        ‹
                      </button>
                      <button
                        className="carousel-arrow carousel-arrow--next"
                        onClick={() => scrollToCarouselIndex((safeIndex + 1) % orderedImages.length)}
                        aria-label="Nächstes Bild"
                      >
                        ›
                      </button>
                      <div className="carousel-dots">
                        {orderedImages.map((_, dotIdx) => (
                          <button
                            key={dotIdx}
                            className={`carousel-dot${dotIdx === safeIndex ? ' carousel-dot--active' : ''}`}
                            onClick={() => scrollToCarouselIndex(dotIdx)}
                            aria-label={`Bild ${dotIdx + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {isMobile && (
                    <div className={`image-overlay-actions${categoryImageSetLoaded ? '' : ' image-overlay-actions--hidden'}`}>
                      <div 
                        className="overlay-cooking-mode-static" 
                        onClick={toggleCookingMode} 
                        role="button" 
                        tabIndex="0" 
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCookingMode()}
                        aria-label="Kochmodus aktivieren"
                      >
                        {/* Use default-category-image icon when the displayed image is a category image,
                            otherwise fall back to alt icon for bright corners or the normal icon */}
                        {(() => {
                          const icon = isDefaultCategoryImage
                            ? cookingModeDefaultImgIcon
                            : (useCookingModeAlt ? cookingModeAltIcon : cookingModeIcon);
                          return isBase64Image(icon)
                            ? <img src={icon} alt="Kochmodus" className="overlay-cooking-mode-icon-img" />
                            : <span>{icon}</span>;
                        })()}
                      </div>
                      <button 
                        className="overlay-back-button"
                        onClick={handleBackFromLinkedRecipe}
                        title="Zurück"
                      >
                        {/* Use default-category-image icon when the displayed image is a category image,
                            otherwise fall back to alt icon for bright corners or the normal icon */}
                        {(() => {
                          const icon = isDefaultCategoryImage
                            ? closeButtonDefaultImgIcon
                            : (useCloseButtonAlt ? closeButtonAltIcon : closeButtonIcon);
                          return isBase64Image(icon)
                            ? <img src={icon} alt="Schließen" className="close-button-icon-img" />
                            : icon;
                        })()}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {isMobile && (
              <div className="mobile-action-buttons" style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}>
                {onToggleFavorite && (
                <button
                  className={`favorite-button ${isFavorite ? 'favorite-button--active' : ''}`}
                  onClick={handleToggleFavorite}
                  title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                  aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                  aria-pressed={isFavorite}
                  type="button"
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
                )}
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
                {currentUser && !currentUser.isGuest && (
                  <button
                    className="cook-date-button"
                    onClick={() => { setCookDateModalPrefillToday(false); setShowCookDateModal(true); }}
                    title="Kochdatum erfassen"
                    aria-label="Kochdatum erfassen"
                  >
                    {isBase64Image(cookDateIcon) ? (
                      <img src={cookDateIcon} alt="Kochdatum" className="cook-date-icon-img" />
                    ) : (
                      cookDateIcon
                    )}
                  </button>
                )}
                <RecipeRating
                  recipeId={recipe.id}
                  ratingAvg={recipe.ratingAvg}
                  ratingCount={recipe.ratingCount}
                  currentUser={currentUser}
                  onOpenModal={() => setShowRatingModal(true)}
                />
                {isRecipePublic && !recipe.shareId && (
                  <button
                    className="share-button"
                    onClick={handleToggleShare}
                    disabled={shareLoading}
                    title="Rezept teilen"
                  >
                    {shareLoading ? '…' : '↑ Teilen'}
                  </button>
                )}
                {recipe.shareId && (
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
                {isSharedView && !isRecipePublic && (
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

            <div className="recipe-title-row">
              <h1 className="recipe-title">{recipe.title}</h1>
            </div>

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
                          if (onPortionCountChange) onPortionCountChange(recipe.id, newServings);
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
                        if (onPortionCountChange) onPortionCountChange(recipe.id, newServings);
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
              <div className="bottom-action-buttons">
                <button className="publish-button" onClick={handlePublish} disabled={publishLoading}>
                  {publishLoading ? '…' : 'Veröffentlichen'}
                </button>
              </div>
            )}

            {currentUser && privateLists.length > 0 && (onAddToPrivateList || onRemoveFromPrivateList) && (
              <div className="private-lists-section">
                <h3 className="private-lists-title">Private Listen</h3>
                <div className="private-lists-items">
                  {privateLists.map(list => {
                    const isInList = Array.isArray(list.recipeIds) && list.recipeIds.includes(recipe.id);
                    return (
                      <label key={list.id} className="private-list-item">
                        <input
                          type="checkbox"
                          checked={isInList}
                          onChange={() => handleTogglePrivateList(list.id)}
                        />
                        <span>{list.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showNutritionModal && (
        <NutritionModal
          recipe={recipe}
          allRecipes={allRecipes}
          onClose={() => setShowNutritionModal(false)}
          onSave={handleSaveNutrition}
          currentUser={currentUser}
        />
      )}
      {showShoppingListModal && (
        <ShoppingListModal
          items={getShoppingListIngredients()}
          title={recipe.title}
          onClose={() => setShowShoppingListModal(false)}
          shareId={recipe.shareId}
          bringButtonIcon={bringButtonIcon}
          onEnableSharing={async () => {
            const sid = await enableRecipeSharing(recipe.id);
            setSelectedRecipe({ ...recipe, shareId: sid });
            return sid;
          }}
        />
      )}
      {showRatingModal && (
        <RatingModal
          recipeId={recipe.id}
          currentUser={currentUser}
          canDeleteRatings={currentUser?.deleteRating === true}
          onClose={() => setShowRatingModal(false)}
        />
      )}
      {showCookDateModal && currentUser && (
        <CookDateModal
          recipeId={recipe.id}
          currentUser={currentUser}
          allUsers={allUsers}
          recipeAuthorId={recipe.authorId}
          recipeCreatedAt={recipe.createdAt}
          recipeImage={recipe.image}
          timelineBubbleIcon={timelineBubbleIcon}
          timelineCookEventBubbleIcon={timelineCookEventBubbleIcon}
          timelineCookEventDefaultImage={timelineCookEventDefaultImage}
          canDeleteCookDates={currentUser?.deleteRating === true}
          prefillToday={cookDateModalPrefillToday}
          onClose={() => setShowCookDateModal(false)}
        />
      )}
      {showPortionSelector && linkedRecipes.length > 0 && (
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
              <div className="portion-selector-section-label">Verlinkte Rezepte</div>
              {linkedRecipes.map(linkedRecipe => {
                const current = linkedPortionCounts[linkedRecipe.id] ?? (linkedRecipe.portionen || 4);
                return (
                  <div key={linkedRecipe.id} className="portion-selector-item">
                    <span className="portion-selector-recipe-name">{linkedRecipe.title}</span>
                    <div className="portion-selector-controls">
                      <button
                        className="portion-selector-btn"
                        onClick={() => setLinkedPortionCounts(prev => ({
                          ...prev,
                          [linkedRecipe.id]: Math.max(0, current - 1)
                        }))}
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
      {alarmRunning && (
        <div className="alarm-modal-overlay">
          <div className="alarm-modal" role="dialog" aria-modal="true">
            <h2 className="alarm-modal-title">Timer abgelaufen!</h2>
            <p className="alarm-modal-label">{alarmLabel}</p>
            <button className="alarm-modal-stop-btn" onClick={stopAlarm}>
              OK
            </button>
          </div>
        </div>
      )}
      {userCanDirectlyEdit && onEdit && !cookingMode && (
        <button
          className={`edit-fab-button${editFabPressed ? ' pressed' : ''}`}
          style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}
          onClick={handleEditFabClick}
          onTouchStart={handleEditFabPressStart}
          onTouchEnd={handleEditFabPressEnd}
          onTouchCancel={handleEditFabPressEnd}
          onMouseDown={handleEditFabPressStart}
          onMouseUp={handleEditFabPressEnd}
          onMouseLeave={handleEditFabPressEnd}
          title="Rezept bearbeiten"
          aria-label="Rezept bearbeiten"
        >
          {isBase64Image(editRecipeIcon) ? (
            <img src={editRecipeIcon} alt="Bearbeiten" className="button-icon-image" draggable="false" />
          ) : (
            editRecipeIcon
          )}
        </button>
      )}
      {userCanCreateVersion && !userCanDirectlyEdit && onCreateVersion && !cookingMode && (
        <button
          className={`new-version-fab-button${newVersionFabPressed ? ' pressed' : ''}`}
          style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}
          onClick={() => onCreateVersion(recipe)}
          onTouchStart={() => setNewVersionFabPressed(true)}
          onTouchEnd={() => setNewVersionFabPressed(false)}
          onTouchCancel={() => setNewVersionFabPressed(false)}
          onMouseDown={() => setNewVersionFabPressed(true)}
          onMouseUp={() => setNewVersionFabPressed(false)}
          onMouseLeave={() => setNewVersionFabPressed(false)}
          title="Eigene Version erstellen"
          aria-label="Eigene Version erstellen"
        >
          {isBase64Image(newVersionIcon) ? (
            <img src={newVersionIcon} alt="Neue Version" className="button-icon-image" draggable="false" />
          ) : (
            newVersionIcon
          )}
        </button>
      )}
    </div>
  );
}

export default RecipeDetail;
