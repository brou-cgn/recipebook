import React, { useState, useEffect, useMemo, useRef } from 'react';
import './RecipeDetail.css';
import { canDirectlyEditRecipe, canCreateNewVersion, canDeleteRecipe, canDeleteRecipes, isCurrentUserAdmin } from '../utils/userManagement';
import { isRecipeVersion, getVersionNumber, getRecipeVersions, getParentRecipe, sortRecipeVersions } from '../utils/recipeVersioning';
import { getUserFavorites } from '../utils/userFavorites';
import { isBase64Image } from '../utils/imageUtils';
import { decodeRecipeLink } from '../utils/recipeLinks';
import { updateRecipe, enableRecipeSharing, disableRecipeSharing, resetRecipeThumbnail } from '../utils/recipeFirestore';
import { mapNutritionCalcError } from '../utils/nutritionUtils';
import { scaleIngredient as scaleIngredientUtil, combineIngredients, isWaterIngredient, convertIngredientUnits, formatIngredientAsFraction } from '../utils/ingredientUtils';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import NutritionModal from './NutritionModal';
import ShoppingListModal from './ShoppingListModal';
import RatingModal from './RatingModal';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, DEFAULT_PRINT_FORMATS, selectPrintFormat, mergePrintElementsWithDefaults, getAlarmSoundPreference } from '../utils/customLists';
import { playAlarmPattern } from '../utils/alarmAudioUtils';
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
  const [isMobileLandscape, setIsMobileLandscape] = useState(
    window.innerHeight <= MOBILE_BREAKPOINT && window.innerWidth > MOBILE_BREAKPOINT
  );
  const [recipeNavigationStack, setRecipeNavigationStack] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const wakeLockRef = useRef(null);
  const contentRef = useRef(null);
  const stepsContainerRef = useRef(null);
  // Tracks whether cooking mode was auto-activated by a landscape rotation
  const landscapeAutoActivatedRef = useRef(false);
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
  const [printRecipeIcon, setPrintRecipeIcon] = useState('⎙');
  const [editRecipeIcon, setEditRecipeIcon] = useState('Edit');
  const [editFabPressed, setEditFabPressed] = useState(false);
  const [newVersionIcon, setNewVersionIcon] = useState('Version');
  const [favoritesButtonIcon, setFavoritesButtonIcon] = useState('☆');
  const [favoritesButtonActiveIcon, setFavoritesButtonActiveIcon] = useState('★');
  const [newVersionFabPressed, setNewVersionFabPressed] = useState(false);
  const [publishRecipeIcon, setPublishRecipeIcon] = useState('↑');
  const [publishFabPressed, setPublishFabPressed] = useState(false);
  const [deleteRecipeIcon, setDeleteRecipeIcon] = useState('🗑');
  const [deleteFabPressed, setDeleteFabPressed] = useState(false);
  const [resetThumbnailFabPressed, setResetThumbnailFabPressed] = useState(false);
  const [resetThumbnailLoading, setResetThumbnailLoading] = useState(false);
  const [conversionTable, setConversionTable] = useState([]);
  const [showCookDateModal, setShowCookDateModal] = useState(false);
  const [cookDateModalPrefillToday, setCookDateModalPrefillToday] = useState(false);
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineCookEventBubbleIcon, setTimelineCookEventBubbleIcon] = useState(null);
  const [timelineCookEventDefaultImage, setTimelineCookEventDefaultImage] = useState(null);
  const [printFormats, setPrintFormats] = useState(DEFAULT_PRINT_FORMATS);
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
  const [alarmSoundKey] = useState(() => getAlarmSoundPreference());

  useEffect(() => {
    const loadSettings = async () => {
      const { getCustomLists, getButtonIcons, getTimelineBubbleIcon, getTimelineCookEventBubbleIcon, getTimelineCookEventDefaultImage, getPrintFormats } = require('../utils/customLists');
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
      setPrintRecipeIcon(eff('printRecipe') || '⎙');
      setEditRecipeIcon(eff('editRecipe') || 'Edit');
      setNewVersionIcon(eff('newVersion') || 'Version');
      setFavoritesButtonIcon(eff('menuFavoritesButton') || '☆');
      setFavoritesButtonActiveIcon(eff('menuFavoritesButtonActive') || '★');
      setPublishRecipeIcon(eff('publishRecipe') || '↑');
      setDeleteRecipeIcon(eff('deleteRecipe') || '🗑');
      setAllButtonIcons(icons);
      setPortionUnits(lists.portionUnits || []);
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
      const formats = await getPrintFormats();
      setPrintFormats(formats && formats.length > 0 ? formats : DEFAULT_PRINT_FORMATS);
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
    setPrintRecipeIcon(eff('printRecipe') || '⎙');
    setEditRecipeIcon(eff('editRecipe') || 'Edit');
    setNewVersionIcon(eff('newVersion') || 'Version');
    setFavoritesButtonIcon(eff('menuFavoritesButton') || '☆');
    setFavoritesButtonActiveIcon(eff('menuFavoritesButtonActive') || '★');
    setPublishRecipeIcon(eff('publishRecipe') || '↑');
    setDeleteRecipeIcon(eff('deleteRecipe') || '🗑');
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
        setIsMobileLandscape(window.innerHeight <= MOBILE_BREAKPOINT && window.innerWidth > MOBILE_BREAKPOINT);
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

  // Auto-activate cooking mode when rotating to mobile landscape, deactivate on rotation back
  useEffect(() => {
    if (isMobileLandscape) {
      if (!cookingMode) {
        landscapeAutoActivatedRef.current = true;
        setCookingMode(true);
        setCurrentStepIndex(0);
      }
    } else {
      if (landscapeAutoActivatedRef.current) {
        landscapeAutoActivatedRef.current = false;
        setCookingMode(false);
      }
    }
  }, [isMobileLandscape, cookingMode]); // cookingMode needed to prevent stale closure when user manually activates before rotating

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

  // Keep header visible on mobile; hide in landscape mode to maximize cooking space
  useEffect(() => {
    if (!onHeaderVisibilityChange) return;

    // Hide header in mobile landscape mode, show otherwise
    onHeaderVisibilityChange(!isMobileLandscape);

    return () => {
      // Show header again when leaving detail view
      onHeaderVisibilityChange(true);
    };
  }, [isMobileLandscape, onHeaderVisibilityChange]);

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
  const deleteAtPublishPosition = isRecipePublic && userCanDelete;
  const userCanResetThumbnail = canDeleteRecipes(currentUser);
  const thumbnailResetAtSecondPosition = deleteAtPublishPosition && userCanResetThumbnail;

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

  const handleResetThumbnail = async () => {
    if (!window.confirm(`Möchten Sie das WhatsApp-Thumbnail für "${recipe.title}" zurücksetzen? Beim nächsten Teilen über WhatsApp wird ein neues Thumbnail generiert.`)) return;
    setResetThumbnailLoading(true);
    try {
      await resetRecipeThumbnail(recipe.id);
      setSelectedRecipe(prev => { const { imageThumbnail: _removed, ...rest } = prev; return rest; });
    } catch (error) {
      console.error('Error resetting thumbnail:', error);
      alert('Fehler beim Zurücksetzen des Thumbnails. Bitte versuchen Sie es erneut.');
    } finally {
      setResetThumbnailLoading(false);
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

  const handlePrint = () => {
    const allImages = Array.isArray(recipe.images) && recipe.images.length > 0
      ? recipe.images
      : (recipe.image ? [recipe.image] : []);
    const imageCount = allImages.length;
    const format = selectPrintFormat(printFormats, imageCount);

    const root = document.documentElement;
    const fontFamily = format?.fontFamily || "Georgia, 'Times New Roman', serif";
    const orientation = format?.orientation || 'portrait';
    const imageColumns = format?.imageColumns || 'auto';

    root.style.setProperty('--print-font-family', fontFamily);

    // Inject a @page orientation rule
    let pageStyle = document.getElementById('print-page-format');
    if (!pageStyle) {
      pageStyle = document.createElement('style');
      pageStyle.id = 'print-page-format';
      document.head.appendChild(pageStyle);
    }
    pageStyle.textContent = `@page { size: ${orientation}; }`;

    // Inject image column override when a fixed column count is configured
    let columnStyle = document.getElementById('print-image-columns');
    if (!columnStyle) {
      columnStyle = document.createElement('style');
      columnStyle.id = 'print-image-columns';
      document.head.appendChild(columnStyle);
    }
    if (imageColumns !== 'auto') {
      const colCount = parseInt(imageColumns, 10);
      const cols = Array.from({ length: colCount }, () => '1fr').join(' ');
      columnStyle.textContent = `@media print { .carousel-track, .carousel-track[data-image-count] { grid-template-columns: ${cols} !important; } }`;
    } else {
      columnStyle.textContent = '';
    }

    // WYSIWYG element positioning: inject absolute-position CSS when the format has
    // an `elements` array (new-style format from PrintFormatEditor).
    const ELEMENT_SELECTOR_MAP = {
      title:              '.recipe-title-row',
      images:             '.recipe-section--images',
      authorDate:         '.author-date-caption',
      metadata:           '.recipe-metadata',
      ingredients:        '.recipe-section--ingredients',
      steps:              '.recipe-section--steps',
      ingredientsHeading: '.recipe-ingredients-heading',
      stepsHeading:       '.recipe-steps-heading',
      photo1:             '.recipe-photo-1',
      photo2:             '.recipe-photo-2',
      photo3:             '.recipe-photo-3',
      photo4:             '.recipe-photo-4',
    };

    // Elements that are hidden by default and need display:block when shown in WYSIWYG
    const WYSIWYG_HIDDEN_ELEMENTS = new Set([
      'ingredientsHeading', 'stepsHeading', 'photo1', 'photo2', 'photo3', 'photo4',
    ]);

    let elemStyle = document.getElementById('print-element-positions');
    if (!elemStyle) {
      elemStyle = document.createElement('style');
      elemStyle.id = 'print-element-positions';
      document.head.appendChild(elemStyle);
    }

    // Toggle the WYSIWYG layout class on the content container
    const contentEl = contentRef.current;
    const useWysiwyg = format?.elements && format.elements.length > 0;
    if (contentEl) {
      if (useWysiwyg) {
        contentEl.classList.add('print-wysiwyg-layout');
      } else {
        contentEl.classList.remove('print-wysiwyg-layout');
      }
    }

    if (useWysiwyg) {
      // Merge stored elements with defaults so all known IDs are present
      const mergedElements = mergePrintElementsWithDefaults(format?.elements, orientation);

      // Image element IDs – these do not receive text formatting rules
      const WYSIWYG_IMAGE_ELEMENT_IDS = new Set(['photo1', 'photo2', 'photo3', 'photo4']);

      const rules = mergedElements.map((el) => {
        const selector = ELEMENT_SELECTOR_MAP[el.id];
        if (!selector) return '';
        if (el.visible === false) {
          return `@media print { ${selector} { display: none !important; } }`;
        }
        const displayRule = WYSIWYG_HIDDEN_ELEMENTS.has(el.id)
          ? 'display: block !important;\n    '
          : '';

        // Per-element text formatting (not for image elements)
        const isImageEl = WYSIWYG_IMAGE_ELEMENT_IDS.has(el.id);
        const textRules = [];
        if (!isImageEl) {
          if (el.fontSizeScale && el.fontSizeScale !== 1) {
            textRules.push(`font-size: ${el.fontSizeScale}em !important;`);
          }
          if (el.fontBold) textRules.push('font-weight: bold !important;');
          if (el.fontItalic) textRules.push('font-style: italic !important;');
          if (el.fontUnderline) textRules.push('text-decoration: underline !important;');
          if (el.fontColor) textRules.push(`color: ${el.fontColor} !important;`);
        }
        const rotationRule = el.rotation ? `transform: rotate(${el.rotation}deg) !important;` : '';

        return `@media print {
  ${selector} {
    ${displayRule}position: absolute !important;
    left: ${el.x.toFixed(2)}% !important;
    top: ${el.y.toFixed(2)}% !important;
    width: ${el.w.toFixed(2)}% !important;
    height: ${el.h.toFixed(2)}% !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    ${rotationRule}
    ${textRules.join('\n    ')}
  }
}`;
      });

      // In WYSIWYG mode, always hide the combined images carousel; individual photo elements are used instead
      rules.push('@media print { .recipe-section--images { display: none !important; } }');

      // When the separate heading elements are visible, hide the duplicated headings
      // inside their respective sections so they do not appear twice
      const ingredientsHeadingEl = mergedElements.find((e) => e.id === 'ingredientsHeading');
      if (ingredientsHeadingEl && ingredientsHeadingEl.visible !== false) {
        rules.push('@media print { .recipe-section--ingredients .section-header { display: none !important; } }');
      }
      const stepsHeadingEl = mergedElements.find((e) => e.id === 'stepsHeading');
      if (stepsHeadingEl && stepsHeadingEl.visible !== false) {
        rules.push('@media print { .recipe-section--steps > h2 { display: none !important; } }');
      }

      elemStyle.textContent = rules.join('\n');
    } else {
      // Legacy format: fall back to flex-order approach
      const elementOrder = format?.elementOrder || ['images', 'ingredients', 'steps'];
      const imageWidth = format?.imageWidth != null ? format.imageWidth : 100;
      const imageAlign = format?.imageAlign || 'center';
      const alignSelfMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      root.style.setProperty('--print-images-order', String(elementOrder.indexOf('images') + 1));
      root.style.setProperty('--print-ingredients-order', String(elementOrder.indexOf('ingredients') + 1));
      root.style.setProperty('--print-steps-order', String(elementOrder.indexOf('steps') + 1));
      root.style.setProperty('--print-image-width', `${imageWidth}%`);
      root.style.setProperty('--print-image-align-self', alignSelfMap[imageAlign] || 'center');
      elemStyle.textContent = '';
    }

    // Clean up CSS variables and the injected styles after printing
    const cleanup = () => {
      root.style.removeProperty('--print-font-family');
      root.style.removeProperty('--print-images-order');
      root.style.removeProperty('--print-ingredients-order');
      root.style.removeProperty('--print-steps-order');
      root.style.removeProperty('--print-image-width');
      root.style.removeProperty('--print-image-align-self');
      if (contentEl) contentEl.classList.remove('print-wysiwyg-layout');
      if (pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);
      if (columnStyle.parentNode) columnStyle.parentNode.removeChild(columnStyle);
      if (elemStyle.parentNode) elemStyle.parentNode.removeChild(elemStyle);
    };
    // afterprint fires when the print dialog closes (including cancellation in most browsers)
    window.addEventListener('afterprint', cleanup, { once: true });
    // Fallback: clean up after a timeout in case afterprint does not fire (e.g. some older browsers)
    const cleanupTimeout = setTimeout(cleanup, 30000);
    window.addEventListener('afterprint', () => clearTimeout(cleanupTimeout), { once: true });

    window.print();
  };

  const scaleIngredient = (ingredient) => {
    const scaled = scaleIngredientUtil(ingredient, servingMultiplier);
    return formatIngredientAsFraction(scaled);
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
      const soundKey = alarmSoundKey;
  
      // Auf manchen Mobilgeräten startet der Context suspended
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
  
      // Sofort einmal abspielen
      playAlarmPattern(ctx, soundKey);
  
      // Dann wiederholen bis OK gedrückt wird
      alarmIntervalRef.current = setInterval(async () => {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          playAlarmPattern(ctx, soundKey);
        } catch (_) {
          // ignorieren
        }
      }, 1000);
    } catch (_) {
      // Audio API nicht verfügbar – Modal bleibt trotzdem sichtbar
    }
  
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
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
      if (e.key === 'ArrowLeft' || (isMobileLandscape && e.key === 'ArrowUp')) {
        e.preventDefault();
        setCurrentStepIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight' || (isMobileLandscape && e.key === 'ArrowDown')) {
        e.preventDefault();
        setCurrentStepIndex(prev => Math.min(stepItems.length - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cookingMode, stepItems, isMobileLandscape]);

  // Scroll to current step card
  useEffect(() => {
    if (!cookingMode || !stepsContainerRef.current) return;

    const container = stepsContainerRef.current;
    const cards = container.querySelectorAll('.step-card');
    const currentCard = cards[currentStepIndex];
    
    if (currentCard && currentCard.scrollIntoView) {
      if (isMobileLandscape) {
        // Vertical carousel in landscape: scroll to the card vertically
        currentCard.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      } else {
        currentCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentStepIndex, cookingMode, isMobileLandscape]);

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

        // In landscape the carousel scrolls vertically; use vertical centre detection
        const containerCenter = isMobileLandscape
          ? containerRect.top + containerRect.height / 2
          : containerRect.left + containerRect.width / 2;

        let closestIndex = 0;
        let closestDistance = Infinity;

        cards.forEach((card, index) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = isMobileLandscape
            ? cardRect.top + cardRect.height / 2
            : cardRect.left + cardRect.width / 2;
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
  }, [cookingMode, isMobileLandscape]);

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
      {cookingMode && !isMobileLandscape && (
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
      
      {!isMobile && !isMobileLandscape && !cookingMode && (
        <div className="recipe-detail-header">
          <button className="back-button" onClick={handleBackFromLinkedRecipe}>
            ← Zurück
          </button>
          
          <div className="action-buttons" style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}>
            {userCanDirectlyEdit && !showShoppingListModal && !showPortionSelector && (
              <button className="edit-button" onClick={() => onEdit(recipe)}>
                Bearbeiten
              </button>
            )}
            {userCanCreateVersion && !userCanDirectlyEdit && (
              <button className="version-button" onClick={() => onCreateVersion(recipe)}>
                Eigene Version erstellen
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
            {currentUser?.printRecipe !== false && (
              <button
                className="cook-date-button print-recipe-button"
                onClick={() => handlePrint()}
                title="Rezept drucken"
                aria-label="Rezept drucken"
              >
                {isBase64Image(printRecipeIcon) ? (
                  <img src={printRecipeIcon} alt="Drucken" className="cook-date-icon-img" />
                ) : (
                  printRecipeIcon
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

      <div className={`recipe-detail-content ${cookingMode ? 'cooking-mode-active' : ''} ${cookingMode && isMobileLandscape ? 'cooking-mode-landscape' : ''}`} ref={contentRef}>
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
                <>
                  {/* Individual photo wrappers for WYSIWYG print positioning.
                      Hidden on screen; each one is shown only when the corresponding
                      'photoN' print element is active. */}
                  {orderedImages.slice(0, 4).map((img, idx) => (
                    <div key={idx} className={`recipe-photo-wysiwyg recipe-photo-${idx + 1}`} aria-hidden="true">
                      <img src={img.url} alt={recipe.title} />
                    </div>
                  ))}

                <div
                  className="recipe-detail-image recipe-section--images"
                >
                  <div
                    className="carousel-track"
                    data-image-count={orderedImages.length}
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
                  {(isMobile || isMobileLandscape) && (
                    <div className={`image-overlay-actions${categoryImageSetLoaded ? '' : ' image-overlay-actions--hidden'}`}>
                      <div 
                        className="overlay-cooking-mode-static" 
                        onClick={toggleCookingMode} 
                        role="button" 
                        tabIndex="0" 
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCookingMode()}
                        onContextMenu={(e) => e.preventDefault()}
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
                </>
              );
            })()}

            {(isMobile || isMobileLandscape) && (
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
                {currentUser?.printRecipe !== false && (
                  <button
                    className="cook-date-button print-recipe-button"
                    onClick={() => handlePrint()}
                    title="Rezept drucken"
                    aria-label="Rezept drucken"
                  >
                    {isBase64Image(printRecipeIcon) ? (
                      <img src={printRecipeIcon} alt="Drucken" className="cook-date-icon-img" />
                    ) : (
                      printRecipeIcon
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
              {hasMultipleVersions && (
                <button 
                  className="version-arrow"
                  onClick={handlePreviousVersion}
                  disabled={currentVersionIndex === 0}
                  title="Vorherige Version"
                >
                  ←
                </button>
              )}
              <h1 className="recipe-title">{recipe.title}</h1>
              {hasMultipleVersions && (
                <button 
                  className="version-arrow"
                  onClick={handleNextVersion}
                  disabled={currentVersionIndex === allVersions.length - 1}
                  title="Nächste Version"
                >
                  →
                </button>
              )}
            </div>

            {hasMultipleVersions && (
              <div className="version-caption-row">
                <span className="version-caption">
                  {isRecipeVersion(recipe) ? `Version ${versionNumber}` : 'Original'}
                </span>
              </div>
            )}

            {(authorName || formattedCreatedAt) && (
              <div className="author-date-caption">
                {authorName && <span className="author-name">Autor: {authorName}</span>}
                {formattedCreatedAt && <span className="creation-date">Erstellt am: {formattedCreatedAt}</span>}
              </div>
            )}

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

            {/* Ingredients heading – separate element for WYSIWYG print positioning.
                Hidden on screen; shown only when the 'ingredientsHeading' print element
                is active.  When shown, the duplicate heading inside the section is hidden
                via dynamically injected CSS. */}
            <div className="recipe-ingredients-heading" aria-hidden="true">
              <h2>Zutaten</h2>
            </div>

            <section className="recipe-section recipe-section--ingredients">
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

            {/* Steps heading – separate element for WYSIWYG print positioning.
                Hidden on screen; shown only when the 'stepsHeading' print element is active. */}
            <div className="recipe-steps-heading" aria-hidden="true">
              <h2>Zubereitung</h2>
            </div>

            <section className="recipe-section recipe-section--steps">
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
      {userCanDirectlyEdit && onEdit && !cookingMode && !showShoppingListModal && !showPortionSelector && (
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
      {userCanDelete && onDelete && !cookingMode && (
        <button
          className={`delete-fab-button${deleteFabPressed ? ' pressed' : ''}${deleteAtPublishPosition ? ' at-publish-position' : ''}`}
          style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}
          onClick={handleDelete}
          onTouchStart={() => setDeleteFabPressed(true)}
          onTouchEnd={() => setDeleteFabPressed(false)}
          onTouchCancel={() => setDeleteFabPressed(false)}
          onMouseDown={() => setDeleteFabPressed(true)}
          onMouseUp={() => setDeleteFabPressed(false)}
          onMouseLeave={() => setDeleteFabPressed(false)}
          title="Rezept löschen"
          aria-label="Rezept löschen"
        >
          {isBase64Image(deleteRecipeIcon) ? (
            <img src={deleteRecipeIcon} alt="Löschen" className="button-icon-image" draggable="false" />
          ) : (
            deleteRecipeIcon
          )}
        </button>
      )}
      {userCanPublish && onPublish && !cookingMode && (
        <button
          className={`publish-fab-button${publishFabPressed ? ' pressed' : ''}`}
          style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}
          onClick={handlePublish}
          onTouchStart={() => setPublishFabPressed(true)}
          onTouchEnd={() => setPublishFabPressed(false)}
          onTouchCancel={() => setPublishFabPressed(false)}
          onMouseDown={() => setPublishFabPressed(true)}
          onMouseUp={() => setPublishFabPressed(false)}
          onMouseLeave={() => setPublishFabPressed(false)}
          disabled={publishLoading}
          title="Rezept veröffentlichen"
          aria-label="Rezept veröffentlichen"
        >
          {publishLoading ? '…' : (
            isBase64Image(publishRecipeIcon) ? (
              <img src={publishRecipeIcon} alt="Veröffentlichen" className="button-icon-image" draggable="false" />
            ) : (
              publishRecipeIcon
            )
          )}
        </button>
      )}
      {userCanResetThumbnail && !cookingMode && (
        <button
          className={`reset-thumbnail-fab-button${resetThumbnailFabPressed ? ' pressed' : ''}${thumbnailResetAtSecondPosition ? ' at-second-position' : ''}`}
          style={{ visibility: buttonIconsLoaded ? 'visible' : 'hidden' }}
          onClick={handleResetThumbnail}
          onTouchStart={() => setResetThumbnailFabPressed(true)}
          onTouchEnd={() => setResetThumbnailFabPressed(false)}
          onTouchCancel={() => setResetThumbnailFabPressed(false)}
          onMouseDown={() => setResetThumbnailFabPressed(true)}
          onMouseUp={() => setResetThumbnailFabPressed(false)}
          onMouseLeave={() => setResetThumbnailFabPressed(false)}
          disabled={resetThumbnailLoading}
          title="WhatsApp-Thumbnail zurücksetzen"
          aria-label="WhatsApp-Thumbnail zurücksetzen"
        >
          {resetThumbnailLoading ? '…' : '📷'}
        </button>
      )}
    </div>
  );
}

export default RecipeDetail;
