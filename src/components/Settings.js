import React, { useState, useEffect, useRef } from 'react';
import './Settings.css';
import { getCustomLists, saveCustomLists, resetCustomLists, getHeaderSlogan, saveHeaderSlogan, getFaviconImage, saveFaviconImage, getFaviconText, saveFaviconText, getAppLogoImage, saveAppLogoImage, getAppLogoImageUrl, saveAppLogoImageUrl, getButtonIcons, saveButtonIcon, DEFAULT_BUTTON_ICONS, getTimelineBubbleIcon, saveTimelineBubbleIcon, getTimelineMenuBubbleIcon, saveTimelineMenuBubbleIcon, getTimelineMenuDefaultImage, saveTimelineMenuDefaultImage, getTimelineCookEventBubbleIcon, saveTimelineCookEventBubbleIcon, getTimelineCookEventDefaultImage, saveTimelineCookEventDefaultImage, getAIRecipePrompt, saveAIRecipePrompt, resetAIRecipePrompt, DEFAULT_AI_RECIPE_PROMPT, getTileSizePreference, saveTileSizePreference, applyTileSizePreference, TILE_SIZE_SMALL, TILE_SIZE_MEDIUM, TILE_SIZE_LARGE, getDarkModePreference, getDarkModeMode, saveDarkModePreference, applyDarkModePreference, getSortSettings, saveSortSettings, DEFAULT_TRENDING_DAYS, DEFAULT_TRENDING_MIN_VIEWS, DEFAULT_NEW_RECIPE_DAYS, DEFAULT_RATING_MIN_VOTES, getStatusValiditySettings, saveStatusValiditySettings, getGroupStatusThresholds, saveGroupStatusThresholds, DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT, DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV, DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV, DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT, getMaxKandidatenSchwelle, saveMaxKandidatenSchwelle, getStartseitenKandidatenHinweis, saveStartseitenKandidatenHinweis, DEFAULT_STARTSEITEN_KANDIDATEN_HINWEIS, getPrintFormats, savePrintFormats, DEFAULT_PRINT_FORMATS, DEFAULT_PRINT_ELEMENTS_PORTRAIT, PRINT_FORMAT_LAYOUT_VERSION, selectPrintFormat } from '../utils/customLists';
import PrintFormatEditor from './PrintFormatEditor';
import PrintPreview from './PrintPreview';
import { invalidateUnitsCache } from '../utils/ingredientUtils';
import { isCurrentUserAdmin, ROLES, getRolePermissions } from '../utils/userManagement';
import UserManagement from './UserManagement';
import { getCategoryImages, addCategoryImage, updateCategoryImage, removeCategoryImage, getAlreadyAssignedCategories } from '../utils/categoryImages';
import { fileToBase64, isBase64Image, compressImage } from '../utils/imageUtils';
import { updateFavicon, updatePageTitle, updateAppLogo } from '../utils/faviconUtils';
import { uploadAppLogoToStorage, deleteAppLogoFromStorage } from '../utils/storageUtils';
import { addFaq, updateFaq, deleteFaq, subscribeToFaqs, importFaqsFromMarkdown } from '../utils/faqFirestore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DRAGGING_OPACITY = 0.5;

function getSortableItemStyle(transform, transition, isDragging) {
  return {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? DRAGGING_OPACITY : 1,
  };
}

function SortableListItem({ id, label, onRemove, onRename }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = getSortableItemStyle(transform, transition, isDragging);

  const handleEditStart = () => {
    setEditValue(label);
    setIsEditing(true);
  };

  const handleEditConfirm = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label) {
      onRename(label, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleEditConfirm();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className={`list-item ${isDragging ? 'dragging' : ''}`}>
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Verschieben"
      >
        ⋮⋮
      </button>
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditConfirm}
          onKeyDown={handleEditKeyDown}
          autoFocus
          className="list-item-edit-input"
        />
      ) : (
        <span>{label}</span>
      )}
      {onRename && !isEditing && (
        <button className="edit-btn" onClick={handleEditStart} title="Umbenennen">✎</button>
      )}
      <button className="remove-btn" onClick={onRemove} title="Entfernen">×</button>
    </div>
  );
}

function SortablePortionUnitItem({ id, unit, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = getSortableItemStyle(transform, transition, isDragging);

  return (
    <div ref={setNodeRef} style={style} className={`list-item ${isDragging ? 'dragging' : ''}`}>
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Verschieben"
      >
        ⋮⋮
      </button>
      <span>{unit.singular} / {unit.plural}</span>
      <button className="remove-btn" onClick={onRemove} title="Entfernen">×</button>
    </div>
  );
}

const CATEGORY_ALREADY_ASSIGNED_ERROR = 'Die folgenden Kategorien sind bereits einem anderen Bild zugeordnet: {categories}\n\nBitte wählen Sie andere Kategorien.';
const STATUS_VALIDITY_HINT = 'Nach X Tagen erscheint das Rezept wieder im Stack. Leer = kein Ablaufdatum.';

/**
 * Renders text with **bold** markdown syntax as <strong> elements.
 */
function renderBoldText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const DARK_MODE_ICON_ROWS = [
  { key: 'cookingMode', label: 'Kochmodus-Button' },
  { key: 'cookingModeAlt', label: 'Kochmodus-Alt (helles Bild oben links)' },
  { key: 'cookingModeDefaultImg', label: 'Kochmodus-Button (Standard-Kategoriebild)' },
  { key: 'importRecipe', label: 'Import-Button' },
  { key: 'scanImage', label: 'Bild-scannen-Button' },
  { key: 'webImport', label: 'Web-Import-Button' },
  { key: 'closeButton', label: 'Schließen-Button' },
  { key: 'closeButtonAlt', label: 'Schließen-Alt (helles Bild oben rechts)' },
  { key: 'closeButtonDefaultImg', label: 'Schließen-Button (Standard-Kategoriebild)' },
  { key: 'menuCloseButton', label: 'Menü-Schließen-Button' },
  { key: 'filterButton', label: 'Filter-Button' },
  { key: 'filterButtonActive', label: 'Filter-Button (aktiv)' },
  { key: 'copyLink', label: 'Link kopieren' },
  { key: 'nutritionEmpty', label: 'Nährwerte hinzufügen' },
  { key: 'nutritionFilled', label: 'Nährwerte vorhanden' },
  { key: 'ratingHeartEmpty', label: 'Bewertung (leer)' },
  { key: 'ratingHeartEmptyModal', label: 'Bewertung Modal (leer)' },
  { key: 'ratingHeartFilled', label: 'Bewertung (gefüllt)' },
  { key: 'privateListBack', label: 'Private Liste zurück' },
  { key: 'shoppingList', label: 'Einkaufslisten-Button' },
  { key: 'bringButton', label: 'Bring!-Button' },
  { key: 'timerStart', label: 'Timer starten' },
  { key: 'timerStop', label: 'Timer stoppen' },
  { key: 'cookDate', label: 'Kochdatum' },
  { key: 'addRecipe', label: 'Rezept hinzufügen' },
  { key: 'editRecipe', label: 'Rezept bearbeiten' },
  { key: 'addMenu', label: 'Menü hinzufügen' },
  { key: 'addPrivateRecipe', label: 'Privates Rezept hinzufügen' },
  { key: 'saveRecipe', label: 'Rezept speichern' },
  { key: 'cancelRecipe', label: 'Rezept verwerfen' },
  { key: 'swipeRight', label: 'Swipe rechts (Ja)' },
  { key: 'swipeLeft', label: 'Swipe links (Nein)' },
  { key: 'swipeUp', label: 'Swipe hoch (Favorit)' },
  { key: 'menuFavoritesButton', label: 'Menü-Favoriten' },
  { key: 'menuFavoritesButtonActive', label: 'Menü-Favoriten (aktiv)' },
  { key: 'tagesmenuFilterButton', label: 'Tagesmenü-Filter' },
  { key: 'tagesmenuZumTagesMenu', label: 'Zum Tagesmenü' },
  { key: 'tagesmenuMeineAuswahl', label: 'Meine Auswahl' },
  { key: 'tagesmenuKachelMenu', label: 'Tagesmenü-Kachelmenü' },
  { key: 'tagesmenuKachelMenuAlt', label: 'Tagesmenü-Kachelmenü (dunkles Bild)' },
  { key: 'newVersion', label: 'Neue Version' },
  { key: 'publishRecipe', label: 'Rezept veröffentlichen' },
  { key: 'deleteRecipe', label: 'Rezept löschen' },
  { key: 'printRecipe', label: 'Rezept drucken' },
  { key: 'addSection', label: 'Abschnitt hinzufügen (Menü bearbeiten)' },
  { key: 'resetThumbnail', label: 'Thumbnail-Löschen-Button (FAB)' },
  { key: 'recipeCardSwipeRight', label: 'Rezeptkarte: Rechts-Swipe-Button' },
  { key: 'trendingDifficultyIcon', label: 'Trend-Kachel: Icon vor Schwierigkeitsgrad' },
  { key: 'trendingTimeIcon', label: 'Trend-Kachel: Icon vor Zubereitungszeit' },
];

function Settings({ onBack, currentUser, allUsers = [], allRecipes = [], onUpdateRecipe }) {
  const [lists, setLists] = useState({
    cuisineTypes: [],
    cuisineGroups: [],
    mealCategories: [],
    units: [],
    portionUnits: [],
    conversionTable: [],
    customUnits: []
  });
  const [newCuisine, setNewCuisine] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newCustomUnit, setNewCustomUnit] = useState('');
  const [newPortionSingular, setNewPortionSingular] = useState('');
  const [newPortionPlural, setNewPortionPlural] = useState('');
  const [newConversionIngredient, setNewConversionIngredient] = useState('');
  const [newConversionUnit, setNewConversionUnit] = useState('');
  const [newConversionGrams, setNewConversionGrams] = useState('');
  const [newConversionMl, setNewConversionMl] = useState('');
  const [headerSlogan, setHeaderSlogan] = useState('');
  const [activeTab, setActiveTab] = useState(currentUser?.role === ROLES.MODERATOR ? 'lists' : 'general'); // 'general', 'lists', 'druck', or 'users'
  const isAdmin = isCurrentUserAdmin();
  const isModerator = currentUser?.role === ROLES.MODERATOR;

  // New cuisine group state (for adding a new parent group)
  const [newGroupName, setNewGroupName] = useState('');

  // Pending renames for cuisine types and meal categories (to propagate to recipes on save)
  const [pendingCuisineRenames, setPendingCuisineRenames] = useState([]);
  const [pendingCategoryRenames, setPendingCategoryRenames] = useState([]);
  // Pending deletes for cuisine types and meal categories (to propagate to recipes on save)
  const [pendingCuisineDeletes, setPendingCuisineDeletes] = useState([]);
  const [pendingCategoryDeletes, setPendingCategoryDeletes] = useState([]);
  
  // Category images state
  const [categoryImages, setCategoryImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingImageId, setEditingImageId] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);

  // Favicon state
  const [faviconImage, setFaviconImage] = useState(null);
  const [faviconText, setFaviconText] = useState('');
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  // App logo state
  const [appLogoImage, setAppLogoImage] = useState(null);
  const [appLogoImageUrl, setAppLogoImageUrl] = useState(null);
  const [uploadingAppLogo, setUploadingAppLogo] = useState(false);

  // Button icons state
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [uploadingButtonIcon, setUploadingButtonIcon] = useState(null);
  const buttonIconSaveTimeoutsRef = useRef({});

  // Timeline bubble icon state
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [uploadingTimelineBubbleIcon, setUploadingTimelineBubbleIcon] = useState(false);

  // Timeline menu bubble icon state
  const [timelineMenuBubbleIcon, setTimelineMenuBubbleIcon] = useState(null);
  const [uploadingTimelineMenuBubbleIcon, setUploadingTimelineMenuBubbleIcon] = useState(false);

  // Timeline default images state
  const [timelineMenuDefaultImage, setTimelineMenuDefaultImage] = useState(null);
  const [uploadingTimelineMenuDefaultImage, setUploadingTimelineMenuDefaultImage] = useState(false);

  // Timeline cook event bubble icon state
  const [timelineCookEventBubbleIcon, setTimelineCookEventBubbleIcon] = useState(null);
  const [uploadingTimelineCookEventBubbleIcon, setUploadingTimelineCookEventBubbleIcon] = useState(false);

  // Timeline cook event default image state
  const [timelineCookEventDefaultImage, setTimelineCookEventDefaultImage] = useState(null);
  const [uploadingTimelineCookEventDefaultImage, setUploadingTimelineCookEventDefaultImage] = useState(false);

  // AI recipe prompt state
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_RECIPE_PROMPT);

  // FAQ state
  const [faqs, setFaqs] = useState([]);
  const [faqForm, setFaqForm] = useState({ title: '', description: '', screenshot: null, level: 1, adminOnly: false, showOnDesktop: true, showOnMobile: true });
  const [editingFaqId, setEditingFaqId] = useState(null);
  const [uploadingFaqScreenshot, setUploadingFaqScreenshot] = useState(false);
  const [savingFaq, setSavingFaq] = useState(false);
  const [importingFaq, setImportingFaq] = useState(false);
  const [faqSelectedIds, setFaqSelectedIds] = useState([]);

  // Tile size state
  const [tileSize, setTileSize] = useState(getTileSizePreference);

  // Dark mode state ('light' | 'dark' | 'auto')
  const [darkMode, setDarkMode] = useState(getDarkModeMode);

  // Sort/filter settings state
  const [trendingDays, setTrendingDays] = useState(DEFAULT_TRENDING_DAYS);
  const [trendingMinViews, setTrendingMinViews] = useState(DEFAULT_TRENDING_MIN_VIEWS);
  const [newRecipeDays, setNewRecipeDays] = useState(DEFAULT_NEW_RECIPE_DAYS);
  const [ratingMinVotes, setRatingMinVotes] = useState(DEFAULT_RATING_MIN_VOTES);

  // Status validity settings for Tagesmenü swipe flags ('' = permanent, positive integer string = days)
  const [statusValidityDaysKandidat, setStatusValidityDaysKandidat] = useState('');
  const [statusValidityDaysGeparkt, setStatusValidityDaysGeparkt] = useState('');
  const [statusValidityDaysArchiv, setStatusValidityDaysArchiv] = useState('');

  // Group status thresholds for shared status determination in interactive lists (0–100)
  const [groupThresholdKandidatMinKandidat, setGroupThresholdKandidatMinKandidat] = useState(DEFAULT_GROUP_THRESHOLD_KANDIDAT_MIN_KANDIDAT);
  const [groupThresholdKandidatMaxArchiv, setGroupThresholdKandidatMaxArchiv] = useState(DEFAULT_GROUP_THRESHOLD_KANDIDAT_MAX_ARCHIV);
  const [groupThresholdArchivMinArchiv, setGroupThresholdArchivMinArchiv] = useState(DEFAULT_GROUP_THRESHOLD_ARCHIV_MIN_ARCHIV);
  const [groupThresholdArchivMaxKandidat, setGroupThresholdArchivMaxKandidat] = useState(DEFAULT_GROUP_THRESHOLD_ARCHIV_MAX_KANDIDAT);

  // Maximum candidate score threshold for ending the swipe stack early ('' = disabled)
  const [maxKandidatenSchwelle, setMaxKandidatenSchwelle] = useState('');

  // Hint text shown on the Startseite carousel when no gemeinsame Kandidaten exist
  const [startseitenKandidatenHinweis, setStartseitenKandidatenHinweis] = useState(DEFAULT_STARTSEITEN_KANDIDATEN_HINWEIS);

  // Print format settings
  const [printFormats, setPrintFormats] = useState(DEFAULT_PRINT_FORMATS);
  const [savingPrintFormats, setSavingPrintFormats] = useState(false);
  // ID of the recipe currently selected for the print format preview ('' = none)
  const [printPreviewRecipeId, setPrintPreviewRecipeId] = useState('');

  // Role permissions state (for abortCalc and editLists permission checks)
  const [rolePermissions, setRolePermissions] = useState(null);

  // Whether the current user can rename cuisine types and meal categories
  const canEditLists = isAdmin || rolePermissions?.[currentUser?.role]?.editLists === true;

  // Cleanup timeout on unmount
  useEffect(() => {
    const loadSettings = async () => {
      const lists = await getCustomLists();
      const slogan = await getHeaderSlogan();
      const faviconImg = await getFaviconImage();
      const faviconTxt = await getFaviconText();
      const appLogoImg = await getAppLogoImage();
      const appLogoUrl = await getAppLogoImageUrl();
      const icons = await getButtonIcons();
      const catImages = await getCategoryImages();
      const timelineIcon = await getTimelineBubbleIcon();
      const timelineMenuIcon = await getTimelineMenuBubbleIcon();
      const timelineMenuImg = await getTimelineMenuDefaultImage();
      const timelineCookEventIcon = await getTimelineCookEventBubbleIcon();
      const timelineCookEventImg = await getTimelineCookEventDefaultImage();
      const aiRecipePrompt = await getAIRecipePrompt();
      const sortSettings = await getSortSettings();
      const statusValidity = await getStatusValiditySettings();
      const groupThresholds = await getGroupStatusThresholds();
      const maxSchwelle = await getMaxKandidatenSchwelle();
      
      setLists(lists);
      setHeaderSlogan(slogan);
      setCategoryImages(catImages);
      setFaviconImage(faviconImg);
      setFaviconText(faviconTxt);
      setAppLogoImage(appLogoImg);
      setAppLogoImageUrl(appLogoUrl);
      setButtonIcons({ ...DEFAULT_BUTTON_ICONS, ...icons });
      setTimelineBubbleIcon(timelineIcon);
      setTimelineMenuBubbleIcon(timelineMenuIcon);
      setTimelineMenuDefaultImage(timelineMenuImg);
      setTimelineCookEventBubbleIcon(timelineCookEventIcon);
      setTimelineCookEventDefaultImage(timelineCookEventImg);
      setAiPrompt(aiRecipePrompt);
      setTrendingDays(sortSettings.trendingDays);
      setTrendingMinViews(sortSettings.trendingMinViews);
      setNewRecipeDays(sortSettings.newRecipeDays);
      setRatingMinVotes(sortSettings.ratingMinVotes);
      setStatusValidityDaysKandidat(statusValidity.statusValidityDaysKandidat != null ? String(statusValidity.statusValidityDaysKandidat) : '');
      setStatusValidityDaysGeparkt(statusValidity.statusValidityDaysGeparkt != null ? String(statusValidity.statusValidityDaysGeparkt) : '');
      setStatusValidityDaysArchiv(statusValidity.statusValidityDaysArchiv != null ? String(statusValidity.statusValidityDaysArchiv) : '');
      setGroupThresholdKandidatMinKandidat(groupThresholds.groupThresholdKandidatMinKandidat);
      setGroupThresholdKandidatMaxArchiv(groupThresholds.groupThresholdKandidatMaxArchiv);
      setGroupThresholdArchivMinArchiv(groupThresholds.groupThresholdArchivMinArchiv);
      setGroupThresholdArchivMaxKandidat(groupThresholds.groupThresholdArchivMaxKandidat);
      setMaxKandidatenSchwelle(maxSchwelle != null ? String(maxSchwelle) : '');
      const hinweis = await getStartseitenKandidatenHinweis();
      setStartseitenKandidatenHinweis(hinweis || DEFAULT_STARTSEITEN_KANDIDATEN_HINWEIS);
      const formats = await getPrintFormats();
      setPrintFormats(formats && formats.length > 0 ? formats : DEFAULT_PRINT_FORMATS);
    };
    loadSettings();
  }, []);

  // Load role permissions for abortCalc check
  useEffect(() => {
    getRolePermissions().then(setRolePermissions);
  }, []);

  // Cleanup pending button icon save timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(buttonIconSaveTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  // Subscribe to FAQs for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToFaqs((faqList) => {
      setFaqs(faqList);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // FAQ handlers
  const handleFaqScreenshotUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFaqScreenshot(true);
    try {
      const base64 = await fileToBase64(file);
      const compressed = await compressImage(base64, 800, 600, 0.8);
      setFaqForm(prev => ({ ...prev, screenshot: compressed }));
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingFaqScreenshot(false);
    }
  };

  const handleSaveFaq = async () => {
    if (!faqForm.title.trim()) {
      alert('Bitte gib einen Titel für den Kochschule-Eintrag ein.');
      return;
    }
    setSavingFaq(true);
    try {
      if (editingFaqId) {
        await updateFaq(editingFaqId, {
          title: faqForm.title.trim(),
          description: faqForm.description.trim(),
          screenshot: faqForm.screenshot || null,
          level: faqForm.level ?? 1,
          adminOnly: faqForm.adminOnly ?? false,
          showOnDesktop: faqForm.showOnDesktop ?? true,
          showOnMobile: faqForm.showOnMobile ?? true
        });
      } else {
        await addFaq({
          title: faqForm.title.trim(),
          description: faqForm.description.trim(),
          screenshot: faqForm.screenshot || null,
          level: faqForm.level ?? 1,
          adminOnly: faqForm.adminOnly ?? false,
          showOnDesktop: faqForm.showOnDesktop ?? true,
          showOnMobile: faqForm.showOnMobile ?? true,
          order: faqs.length
        });
      }
      setFaqForm({ title: '', description: '', screenshot: null, level: 1, adminOnly: false, showOnDesktop: true, showOnMobile: true });
      setEditingFaqId(null);
    } catch (error) {
      alert('Fehler beim Speichern des Kochschule-Eintrags: ' + error.message);
    } finally {
      setSavingFaq(false);
    }
  };

  const handleEditFaq = (faq) => {
    setEditingFaqId(faq.id);
    setFaqForm({ title: faq.title || '', description: faq.description || '', screenshot: faq.screenshot || null, level: faq.level ?? 1, adminOnly: faq.adminOnly ?? false, showOnDesktop: faq.showOnDesktop ?? true, showOnMobile: faq.showOnMobile ?? true });
  };

  const handleDeleteFaq = async (faqId) => {
    if (!window.confirm('Möchtest du diesen Kochschule-Eintrag wirklich löschen?')) return;
    try {
      await deleteFaq(faqId);
      if (editingFaqId === faqId) {
        setEditingFaqId(null);
        setFaqForm({ title: '', description: '', screenshot: null, level: 1, adminOnly: false, showOnDesktop: true, showOnMobile: true });
      }
      setFaqSelectedIds(prev => prev.filter(id => id !== faqId));
    } catch (error) {
      alert('Fehler beim Löschen des Kochschule-Eintrags: ' + error.message);
    }
  };

  const handleCancelFaqEdit = () => {
    setEditingFaqId(null);
    setFaqForm({ title: '', description: '', screenshot: null, level: 1, adminOnly: false, showOnDesktop: true, showOnMobile: true });
  };

  const handleFaqIndent = async (delta) => {
    const updates = faqSelectedIds.map(id => {
      const faq = faqs.find(f => f.id === id);
      if (!faq) return null;
      const newLevel = Math.max(0, (faq.level ?? 1) + delta);
      return updateFaq(id, { level: newLevel });
    }).filter(Boolean);
    await Promise.all(updates);
  };

  const handleFaqMoveUp = async (faqId) => {
    const index = faqs.findIndex(f => f.id === faqId);
    if (index <= 0) return;
    const faq = faqs[index];
    const prevFaq = faqs[index - 1];
    await Promise.all([
      updateFaq(faq.id, { order: prevFaq.order ?? (index - 1) }),
      updateFaq(prevFaq.id, { order: faq.order ?? index })
    ]);
  };

  const handleFaqMoveDown = async (faqId) => {
    const index = faqs.findIndex(f => f.id === faqId);
    if (index < 0 || index >= faqs.length - 1) return;
    const faq = faqs[index];
    const nextFaq = faqs[index + 1];
    await Promise.all([
      updateFaq(faq.id, { order: nextFaq.order ?? (index + 1) }),
      updateFaq(nextFaq.id, { order: faq.order ?? index })
    ]);
  };

  const handleImportFaqFromMd = async () => {
    if (!window.confirm('Möchtest du alle FAQ-Einträge aus der FAQ.md importieren? Bereits vorhandene Einträge bleiben erhalten.')) return;
    setImportingFaq(true);
    try {
      const response = await fetch(process.env.PUBLIC_URL + '/FAQ.md', { cache: 'no-cache' });
      if (!response.ok) throw new Error('FAQ.md konnte nicht geladen werden.');
      const text = await response.text();
      const count = await importFaqsFromMarkdown(text, faqs);
      alert(`${count} FAQ-Einträge erfolgreich importiert.`);
    } catch (error) {
      alert('Fehler beim Import: ' + error.message);
    } finally {
      setImportingFaq(false);
    }
  };

  /**
   * Propagate renames of a recipe field (kulinarik or speisekategorie) to all affected recipes.
   * @param {Array<{from: string, to: string}>} renames - Pending renames
   * @param {string} field - Recipe field name ('kulinarik' or 'speisekategorie')
   * @param {Function} clearRenames - State setter to clear the pending renames
   */
  const propagateRenames = async (renames, field, clearRenames) => {
    const effective = renames.filter(r => r.from !== r.to);
    if (effective.length === 0 || !onUpdateRecipe) return;
    const recipesToUpdate = allRecipes.filter(recipe => {
      const values = Array.isArray(recipe[field])
        ? recipe[field]
        : recipe[field] ? [recipe[field]] : [];
      return effective.some(({ from }) => values.includes(from));
    });
    for (const recipe of recipesToUpdate) {
      const values = Array.isArray(recipe[field])
        ? recipe[field]
        : recipe[field] ? [recipe[field]] : [];
      const updated = values.map(v => {
        const rename = effective.find(r => r.from === v);
        return rename ? rename.to : v;
      });
      await onUpdateRecipe(recipe.id, { [field]: updated });
    }
    clearRenames([]);
  };

  /**
   * Propagate deletions of a recipe field (kulinarik or speisekategorie) to all affected recipes.
   * @param {Array<string>} deletes - Names of items that were deleted
   * @param {string} field - Recipe field name ('kulinarik' or 'speisekategorie')
   * @param {Function} clearDeletes - State setter to clear the pending deletes
   */
  const propagateDeletes = async (deletes, field, clearDeletes) => {
    if (deletes.length === 0 || !onUpdateRecipe) return;
    const recipesToUpdate = allRecipes.filter(recipe => {
      const values = Array.isArray(recipe[field])
        ? recipe[field]
        : recipe[field] ? [recipe[field]] : [];
      return deletes.some(d => values.includes(d));
    });
    for (const recipe of recipesToUpdate) {
      const values = Array.isArray(recipe[field])
        ? recipe[field]
        : recipe[field] ? [recipe[field]] : [];
      const updated = values.filter(v => !deletes.includes(v));
      await onUpdateRecipe(recipe.id, { [field]: updated });
    }
    clearDeletes([]);
  };

  const handleSave = async () => {
    try {
      await saveCustomLists(lists);
      saveHeaderSlogan(headerSlogan);
      saveFaviconImage(faviconImage);
      saveFaviconText(faviconText);
      saveAppLogoImage(appLogoImage);

      // Upload app logo to Firebase Storage so social-media crawlers can access it
      // via a public HTTPS URL, then persist that URL in Firestore.
      if (appLogoImage && appLogoImage.startsWith('data:')) {
        try {
          const url = await uploadAppLogoToStorage(appLogoImage);
          setAppLogoImageUrl(url);
          await saveAppLogoImageUrl(url);
        } catch (storageErr) {
          console.warn('Could not upload app logo to Storage:', storageErr);
          // Don't abort the overall save – the base64 is still saved to Firestore.
          // Clear the URL to avoid stale references from a previous successful upload.
          setAppLogoImageUrl(null);
          await saveAppLogoImageUrl(null).catch(e => console.warn('Could not clear app logo URL from Firestore. Manual cleanup may be required:', e));
        }
      } else if (!appLogoImage && appLogoImageUrl) {
        // Logo was removed – clean up Storage and clear the URL.
        try {
          await deleteAppLogoFromStorage();
          setAppLogoImageUrl(null);
          await saveAppLogoImageUrl(null);
        } catch (storageErr) {
          console.warn('Could not delete app logo from Storage:', storageErr);
        }
      }

      // Button icons are now saved incrementally (auto-save after each change)
      saveTimelineBubbleIcon(timelineBubbleIcon);
      saveTimelineMenuBubbleIcon(timelineMenuBubbleIcon);
      saveTimelineMenuDefaultImage(timelineMenuDefaultImage);
      saveTimelineCookEventBubbleIcon(timelineCookEventBubbleIcon);
      saveTimelineCookEventDefaultImage(timelineCookEventDefaultImage);
      saveTileSizePreference(tileSize);
      saveDarkModePreference(darkMode);
      await saveSortSettings({ trendingDays, trendingMinViews, newRecipeDays, ratingMinVotes });
      await saveStatusValiditySettings({
        statusValidityDaysKandidat: statusValidityDaysKandidat !== '' ? parseInt(statusValidityDaysKandidat, 10) : null,
        statusValidityDaysGeparkt: statusValidityDaysGeparkt !== '' ? parseInt(statusValidityDaysGeparkt, 10) : null,
        statusValidityDaysArchiv: statusValidityDaysArchiv !== '' ? parseInt(statusValidityDaysArchiv, 10) : null,
      });
      await saveGroupStatusThresholds({
        groupThresholdKandidatMinKandidat,
        groupThresholdKandidatMaxArchiv,
        groupThresholdArchivMinArchiv,
        groupThresholdArchivMaxKandidat,
      });
      await saveMaxKandidatenSchwelle(maxKandidatenSchwelle !== '' ? parseFloat(maxKandidatenSchwelle) : null);
      await saveStartseitenKandidatenHinweis(startseitenKandidatenHinweis);

      // Propagate cuisine type renames to all affected recipes
      await propagateRenames(pendingCuisineRenames, 'kulinarik', setPendingCuisineRenames);

      // Propagate cuisine type deletions to all affected recipes
      await propagateDeletes(pendingCuisineDeletes, 'kulinarik', setPendingCuisineDeletes);

      // Propagate meal category renames to all affected recipes
      await propagateRenames(pendingCategoryRenames, 'speisekategorie', setPendingCategoryRenames);

      // Propagate meal category deletions to all affected recipes
      await propagateDeletes(pendingCategoryDeletes, 'speisekategorie', setPendingCategoryDeletes);

      // Apply favicon changes immediately
      updateFavicon(faviconImage);
      updatePageTitle(faviconText);
      updateAppLogo(appLogoImage);

      // Apply tile size immediately
      applyTileSizePreference(tileSize);

      // Apply dark mode immediately
      applyDarkModePreference(darkMode);

      // Notify service worker about settings update for PWA manifest/icons
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'UPDATE_APP_SETTINGS',
          settings: {
            faviconText: faviconText,
            headerSlogan: headerSlogan,
            appLogoImage: appLogoImage
          }
        });
      }

      alert('Einstellungen erfolgreich gespeichert!');
    } catch (error) {
      console.error('Fehler beim Speichern der Einstellungen:', error);
      alert('Fehler beim Speichern der Einstellungen. Bitte versuchen Sie es erneut.');
    }
  };

  const handleReset = async () => {
    if (window.confirm('Möchten Sie wirklich alle Listen auf die Standardwerte zurücksetzen?')) {
      try {
        const defaultLists = await resetCustomLists();
        setLists(defaultLists);
        setPendingCuisineRenames([]);
        setPendingCategoryRenames([]);
        setPendingCuisineDeletes([]);
        setPendingCategoryDeletes([]);
        alert('Listen auf Standardwerte zurückgesetzt!');
      } catch (error) {
        console.error('Fehler beim Zurücksetzen der Listen:', error);
        alert('Fehler beim Zurücksetzen der Listen. Bitte versuchen Sie es erneut.');
      }
    }
  };

  const addCuisine = () => {
    const trimmed = newCuisine.trim();
    if (trimmed && !lists.cuisineTypes.includes(trimmed)) {
      setLists({
        ...lists,
        cuisineTypes: [...lists.cuisineTypes, trimmed]
      });
      setNewCuisine('');
      // Cancel a pending delete if this type was just re-added with the same name
      setPendingCuisineDeletes(prev => prev.filter(d => d !== trimmed));
    }
  };

  const removeCuisine = (cuisine) => {
    setLists(prev => ({
      ...prev,
      cuisineTypes: prev.cuisineTypes.filter(c => c !== cuisine),
      cuisineGroups: (prev.cuisineGroups || []).map(g => ({
        ...g,
        children: g.children.filter(c => c !== cuisine)
      }))
    }));
    setPendingCuisineDeletes(prev => prev.includes(cuisine) ? prev : [...prev, cuisine]);
  };

  const renameCuisine = (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setLists(prev => ({
      ...prev,
      cuisineTypes: prev.cuisineTypes.map(c => c === oldName ? trimmed : c),
      cuisineGroups: (prev.cuisineGroups || []).map(g => ({
        ...g,
        children: g.children.map(c => c === oldName ? trimmed : c)
      }))
    }));
    setPendingCuisineRenames(prev => {
      const existingIdx = prev.findIndex(r => r.to === oldName);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { from: updated[existingIdx].from, to: trimmed };
        return updated;
      }
      return [...prev, { from: oldName, to: trimmed }];
    });
  };

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !lists.mealCategories.includes(trimmed)) {
      setLists({
        ...lists,
        mealCategories: [...lists.mealCategories, trimmed]
      });
      setNewCategory('');
      // Cancel a pending delete if this category was just re-added with the same name
      setPendingCategoryDeletes(prev => prev.filter(d => d !== trimmed));
    }
  };

  // Cuisine groups management
  const addCuisineGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const groups = lists.cuisineGroups || [];
    if (groups.some(g => g.name === name)) return;
    setLists(prev => ({
      ...prev,
      cuisineGroups: [...groups, { name, children: [] }]
    }));
    setNewGroupName('');
  };

  const removeCuisineGroup = (groupName) => {
    setLists(prev => ({
      ...prev,
      cuisineGroups: (prev.cuisineGroups || []).filter(g => g.name !== groupName)
    }));
  };

  const addChildToGroup = (groupName, childName) => {
    setLists(prev => ({
      ...prev,
      cuisineGroups: (prev.cuisineGroups || []).map(g =>
        g.name === groupName && !g.children.includes(childName)
          ? { ...g, children: [...g.children, childName] }
          : g
      )
    }));
  };

  const removeChildFromGroup = (groupName, childName) => {
    setLists(prev => ({
      ...prev,
      cuisineGroups: (prev.cuisineGroups || []).map(g =>
        g.name === groupName
          ? { ...g, children: g.children.filter(c => c !== childName) }
          : g
      )
    }));
  };

  const removeCategory = (category) => {
    setLists({
      ...lists,
      mealCategories: lists.mealCategories.filter(c => c !== category)
    });
    setPendingCategoryDeletes(prev => prev.includes(category) ? prev : [...prev, category]);
  };

  const renameCategory = (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || oldName === trimmed) return;
    setLists(prev => ({
      ...prev,
      mealCategories: prev.mealCategories.map(c => c === oldName ? trimmed : c)
    }));
    setPendingCategoryRenames(prev => {
      const existingIdx = prev.findIndex(r => r.to === oldName);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { from: updated[existingIdx].from, to: trimmed };
        return updated;
      }
      return [...prev, { from: oldName, to: trimmed }];
    });
  };

  const addUnit = () => {
    if (newUnit.trim() && !lists.units.includes(newUnit.trim())) {
      setLists({
        ...lists,
        units: [...lists.units, newUnit.trim()]
      });
      setNewUnit('');
    }
  };

  const removeUnit = (unit) => {
    setLists({
      ...lists,
      units: lists.units.filter(u => u !== unit)
    });
  };

  const addPortionUnit = () => {
    if (newPortionSingular.trim() && newPortionPlural.trim()) {
      const newId = newPortionSingular.toLowerCase().replace(/\s+/g, '-');
      const exists = lists.portionUnits.some(pu => pu.id === newId);
      
      if (!exists) {
        setLists({
          ...lists,
          portionUnits: [...lists.portionUnits, {
            id: newId,
            singular: newPortionSingular.trim(),
            plural: newPortionPlural.trim()
          }]
        });
        setNewPortionSingular('');
        setNewPortionPlural('');
      }
    }
  };

  const removePortionUnit = (unitId) => {
    setLists({
      ...lists,
      portionUnits: lists.portionUnits.filter(pu => pu.id !== unitId)
    });
  };

  const addConversionEntry = () => {
    if (newConversionIngredient.trim() && newConversionUnit.trim()) {
      const slugify = (str) => str.toLowerCase()
        .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const newId = `${slugify(newConversionIngredient)}-${slugify(newConversionUnit)}-${Date.now()}`;
      const entry = {
        id: newId,
        ingredient: newConversionIngredient.trim(),
        unit: newConversionUnit.trim(),
        grams: newConversionGrams.trim(),
        milliliters: newConversionMl.trim()
      };
      setLists({
        ...lists,
        conversionTable: [...(lists.conversionTable || []), entry]
      });
      setNewConversionIngredient('');
      setNewConversionUnit('');
      setNewConversionGrams('');
      setNewConversionMl('');
    }
  };

  const removeConversionEntry = (id) => {
    setLists({
      ...lists,
      conversionTable: lists.conversionTable.filter(e => e.id !== id)
    });
  };

  const updateConversionEntry = (id, field, value) => {
    setLists({
      ...lists,
      conversionTable: lists.conversionTable.map(e => e.id === id ? { ...e, [field]: value } : e)
    });
  };

  const addCustomUnitHandler = () => {
    const trimmed = newCustomUnit.trim();
    const currentUnits = lists.customUnits || [];
    if (trimmed && !currentUnits.includes(trimmed)) {
      const updated = [...currentUnits, trimmed];
      const updatedLists = { ...lists, customUnits: updated };
      setLists(updatedLists);
      saveCustomLists(updatedLists);
      invalidateUnitsCache();
      setNewCustomUnit('');
    }
  };

  const removeCustomUnitHandler = (index) => {
    const updated = (lists.customUnits || []).filter((_, i) => i !== index);
    const updatedLists = { ...lists, customUnits: updated };
    setLists(updatedLists);
    saveCustomLists(updatedLists);
    invalidateUnitsCache();
  };

  const updateCustomUnitHandler = (index, value) => {
    const updated = [...(lists.customUnits || [])];
    updated[index] = value;
    setLists({ ...lists, customUnits: updated });
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag and drop handlers
  const handleDragEndCuisineTypes = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.cuisineTypes.indexOf(active.id);
        const newIndex = prevLists.cuisineTypes.indexOf(over.id);
        return {
          ...prevLists,
          cuisineTypes: arrayMove(prevLists.cuisineTypes, oldIndex, newIndex)
        };
      });
    }
  };

  const handleDragEndMealCategories = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.mealCategories.indexOf(active.id);
        const newIndex = prevLists.mealCategories.indexOf(over.id);
        return {
          ...prevLists,
          mealCategories: arrayMove(prevLists.mealCategories, oldIndex, newIndex)
        };
      });
    }
  };

  const handleDragEndUnits = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.units.indexOf(active.id);
        const newIndex = prevLists.units.indexOf(over.id);
        return {
          ...prevLists,
          units: arrayMove(prevLists.units, oldIndex, newIndex)
        };
      });
    }
  };

  const handleDragEndPortionUnits = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.portionUnits.findIndex(u => u.id === active.id);
        const newIndex = prevLists.portionUnits.findIndex(u => u.id === over.id);
        return {
          ...prevLists,
          portionUnits: arrayMove(prevLists.portionUnits, oldIndex, newIndex)
        };
      });
    }
  };

  // Category image handlers
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      
      if (editingImageId) {
        // Update existing image
        await updateCategoryImage(editingImageId, { image: compressedBase64 });
        const catImages = await getCategoryImages();
        setCategoryImages(catImages);
        setEditingImageId(null);
      } else {
        // Add new image with selected categories
        const alreadyAssigned = await getAlreadyAssignedCategories(selectedCategories);
        if (alreadyAssigned.length > 0) {
          alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
          setUploadingImage(false);
          return;
        }
        
        await addCategoryImage(compressedBase64, selectedCategories);
        const catImages = await getCategoryImages();
        setCategoryImages(catImages);
        setSelectedCategories([]);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const handleRemoveCategoryImage = async (imageId) => {
    if (window.confirm('Möchten Sie dieses Bild wirklich entfernen?')) {
      await removeCategoryImage(imageId);
      const catImages = await getCategoryImages();
      setCategoryImages(catImages);
    }
  };

  const handleEditImageCategories = (imageId) => {
    const image = categoryImages.find(img => img.id === imageId);
    if (image) {
      setEditingImageId(imageId);
      setSelectedCategories([...image.categories]);
    }
  };

  const handleSaveImageCategories = async () => {
    if (!editingImageId) return;

    const alreadyAssigned = await getAlreadyAssignedCategories(selectedCategories, editingImageId);
    if (alreadyAssigned.length > 0) {
      alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
      return;
    }

    await updateCategoryImage(editingImageId, { categories: selectedCategories });
    const catImages = await getCategoryImages();
    setCategoryImages(catImages);
    setEditingImageId(null);
    setSelectedCategories([]);
  };

  const handleCancelEditCategories = () => {
    setEditingImageId(null);
    setSelectedCategories([]);
  };

  // Favicon handlers
  const handleFaviconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFavicon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setFaviconImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleRemoveFavicon = () => {
    setFaviconImage(null);
  };

  // App logo handlers
  const handleAppLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAppLogo(true);

    try {
      const base64 = await fileToBase64(file);
      // Use larger dimensions for PWA icons and preserve transparency for PNG
      const isPNG = file.type === 'image/png';
      const compressedBase64 = await compressImage(base64, 512, 512, 0.9, isPNG);
      setAppLogoImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingAppLogo(false);
    }
  };

  const handleRemoveAppLogo = () => {
    setAppLogoImage(null);
  };

  // Button icon image handlers
  const handleButtonIconImageUpload = async (iconKey, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingButtonIcon(iconKey);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);

      // Update local state immediately (optimistic update)
      setButtonIcons({ ...buttonIcons, [iconKey]: compressedBase64 });

      // Save to Firestore immediately (incremental save)
      await saveButtonIcon(iconKey, compressedBase64);
    } catch (error) {
      alert(`Fehler beim Speichern des Icons: ${error.message}`);
      // Revert local state on error
      setButtonIcons(prev => ({ ...prev, [iconKey]: DEFAULT_BUTTON_ICONS[iconKey] }));
    } finally {
      setUploadingButtonIcon(null);
    }
  };

  const handleRemoveButtonIconImage = async (iconKey) => {
    const defaultValue = DEFAULT_BUTTON_ICONS[iconKey];
    setButtonIcons({ ...buttonIcons, [iconKey]: defaultValue });

    try {
      await saveButtonIcon(iconKey, defaultValue);
    } catch (error) {
      alert(`Fehler beim Zurücksetzen des Icons: ${error.message}`);
    }
  };

  const handleResetButtonIcon = async (iconKey) => {
    const defaultValue = DEFAULT_BUTTON_ICONS[iconKey];
    setButtonIcons(prev => ({ ...prev, [iconKey]: defaultValue }));

    try {
      await saveButtonIcon(iconKey, defaultValue);
    } catch (error) {
      alert(`Fehler beim Zurücksetzen des Icons: ${error.message}`);
    }
  };

  const handleButtonIconTextChange = async (iconKey, value) => {
    // Update local state immediately
    setButtonIcons(prev => ({ ...prev, [iconKey]: value }));

    // Debounce per icon: Save after 1 second of no typing for this specific icon
    if (buttonIconSaveTimeoutsRef.current[iconKey]) {
      clearTimeout(buttonIconSaveTimeoutsRef.current[iconKey]);
    }

    buttonIconSaveTimeoutsRef.current[iconKey] = setTimeout(async () => {
      delete buttonIconSaveTimeoutsRef.current[iconKey];
      try {
        await saveButtonIcon(iconKey, value);
      } catch (error) {
        alert(`Fehler beim Speichern des Icons: ${error.message}`);
      }
    }, 1000);
  };

  // Timeline bubble icon handlers
  const handleTimelineBubbleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineBubbleIcon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineBubbleIcon(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineBubbleIcon(false);
    }
  };

  const handleRemoveTimelineBubbleIcon = () => {
    setTimelineBubbleIcon(null);
  };

  // Timeline menu bubble icon handlers
  const handleTimelineMenuBubbleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineMenuBubbleIcon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineMenuBubbleIcon(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineMenuBubbleIcon(false);
    }
  };

  const handleRemoveTimelineMenuBubbleIcon = () => {
    setTimelineMenuBubbleIcon(null);
  };

  // Timeline menu default image handlers
  const handleTimelineMenuDefaultImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineMenuDefaultImage(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineMenuDefaultImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineMenuDefaultImage(false);
    }
  };

  const handleRemoveTimelineMenuDefaultImage = () => {
    setTimelineMenuDefaultImage(null);
  };

  // Timeline cook event bubble icon handlers
  const handleTimelineCookEventBubbleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineCookEventBubbleIcon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineCookEventBubbleIcon(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineCookEventBubbleIcon(false);
    }
  };

  const handleRemoveTimelineCookEventBubbleIcon = () => {
    setTimelineCookEventBubbleIcon(null);
  };

  // Timeline cook event default image handlers
  const handleTimelineCookEventDefaultImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineCookEventDefaultImage(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineCookEventDefaultImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineCookEventDefaultImage(false);
    }
  };

  const handleRemoveTimelineCookEventDefaultImage = () => {
    setTimelineCookEventDefaultImage(null);
  };

  const handlePercentChange = (setter) => (e) => {
    const val = e.target.valueAsNumber;
    if (!isNaN(val) && val >= 0 && val <= 100) setter(val);
  };

  const timelineBubbleIconRows = [
    { label: 'Zeitleisten-Icon (Rezepte)', icon: timelineBubbleIcon, uploading: uploadingTimelineBubbleIcon, onChange: handleTimelineBubbleIconUpload, onRemove: handleRemoveTimelineBubbleIcon, fileId: 'timelineBubbleIconFile' },
    { label: 'Zeitleisten-Icon (Menüs)', icon: timelineMenuBubbleIcon, uploading: uploadingTimelineMenuBubbleIcon, onChange: handleTimelineMenuBubbleIconUpload, onRemove: handleRemoveTimelineMenuBubbleIcon, fileId: 'timelineMenuBubbleIconFile' },
    { label: 'Zeitleisten-Icon (Kochereignisse)', icon: timelineCookEventBubbleIcon, uploading: uploadingTimelineCookEventBubbleIcon, onChange: handleTimelineCookEventBubbleIconUpload, onRemove: handleRemoveTimelineCookEventBubbleIcon, fileId: 'timelineCookEventBubbleIconFile' },
  ];

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h2>Einstellungen</h2>
      </div>

      {(isAdmin || isModerator) && (
        <div className="settings-tabs">
          {isAdmin && (
            <button
              className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              Allgemein
            </button>
          )}
          <button
            className={`tab-button ${activeTab === 'lists' ? 'active' : ''}`}
            onClick={() => setActiveTab('lists')}
          >
            Listen & Kategorien
          </button>
          {isAdmin && (
            <button
              className={`tab-button ${activeTab === 'druck' ? 'active' : ''}`}
              onClick={() => setActiveTab('druck')}
            >
              Drucklayout
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab-button ${activeTab === 'tagesmenu' ? 'active' : ''}`}
              onClick={() => setActiveTab('tagesmenu')}
            >
              Tagesmenü
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Benutzerverwaltung
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab-button ${activeTab === 'ai' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              KI-Einstellungen
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveTab('faq')}
            >
              Kochschule
            </button>
          )}
        </div>
      )}

      <div className="settings-content">
        {activeTab === 'general' ? (
          <>
            <div className="settings-section">
              <h3>Header-Slogan</h3>
              <p className="section-description">
                Passen Sie den Slogan an, der im Header unter "brouBook" angezeigt wird.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={headerSlogan}
                  onChange={(e) => setHeaderSlogan(e.target.value)}
                  placeholder="Header-Slogan eingeben..."
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Favicon</h3>
              <p className="section-description">
                Personalisieren Sie das Favicon (Browser-Tab-Symbol) und den Titel Ihrer brouBook-Instanz.
              </p>
              
              {/* Favicon Text */}
              <div className="favicon-text-section">
                <label htmlFor="faviconText">Favicon-Text (Browser-Tab-Titel):</label>
                <div className="list-input">
                  <input
                    type="text"
                    id="faviconText"
                    value={faviconText}
                    onChange={(e) => setFaviconText(e.target.value)}
                    placeholder="z.B. brouBook"
                    maxLength={50}
                  />
                </div>
                <p className="input-hint">Maximale Länge: 50 Zeichen</p>
              </div>

              {/* Favicon Image */}
              <div className="favicon-image-section">
                <label>Logo für Browser-Tab und Social-Media:</label>
                {faviconImage ? (
                  <div className="favicon-preview">
                    <img src={faviconImage} alt="Favicon" style={{ width: '32px', height: '32px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="faviconImageFile" className="favicon-change-btn">
                        {uploadingFavicon ? 'Hochladen...' : 'Ändern'}
                      </label>
                      <button 
                        className="favicon-remove-btn" 
                        onClick={handleRemoveFavicon}
                        disabled={uploadingFavicon}
                      >
                        × Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="faviconImageFile" className="image-upload-label">
                      {uploadingFavicon ? 'Hochladen...' : 'Logo hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="faviconImageFile"
                  accept="image/*"
                  onChange={handleFaviconUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingFavicon}
                />
                <p className="input-hint">
                  Unterstützte Formate: JPEG, PNG, GIF, WebP. Maximale Größe: 5MB. 
                  Empfohlene Größe: 32x32, 64x64 oder 512x512 Pixel (quadratisch).
                  Wird verwendet für Browser-Favicon und Social-Media-Vorschauen (OpenGraph, Twitter).
                </p>
              </div>

              {/* App Logo Image */}
              <div className="favicon-image-section">
                <label>App-Logo für Header und Apple Touch Icon:</label>
                {appLogoImage ? (
                  <div className="favicon-preview">
                    <img src={appLogoImage} alt="App Logo" style={{ width: '64px', height: '64px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="appLogoImageFile" className="favicon-change-btn">
                        {uploadingAppLogo ? 'Hochladen...' : 'Ändern'}
                      </label>
                      <button 
                        className="favicon-remove-btn" 
                        onClick={handleRemoveAppLogo}
                        disabled={uploadingAppLogo}
                      >
                        × Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="appLogoImageFile" className="image-upload-label">
                      {uploadingAppLogo ? 'Hochladen...' : 'App-Logo hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="appLogoImageFile"
                  accept="image/*"
                  onChange={handleAppLogoUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingAppLogo}
                />
                <p className="input-hint">
                  <strong>Empfohlen: PNG mit transparentem Hintergrund</strong> für optimale Darstellung auf allen Plattformen. 
                  Unterstützte Formate: JPEG, PNG, GIF, WebP. Maximale Größe: 5MB. 
                  Empfohlene Größe: 192x192 oder 512x512 Pixel (quadratisch).
                  Wird verwendet für App-Header-Logo, Apple Touch Icon und PWA-Installation.
                  <br />
                  <em>Hinweis: Bei PWA-Icons werden transparente Bereiche ggf. rund/abgerundet angezeigt. 
                  Vermeiden Sie zu große transparente Ränder für optimale Skalierung.</em>
                </p>
              </div>
            </div>

            <div className="settings-section">
              <h3>Button-Icons</h3>
              <p className="section-description">
                Wählen Sie für jeden Button das Normal- und optional eine Darkmode-Variante.
                Unterstützte Formate: Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB).
                Ist keine Dunkelmodusvariante gespeichert, wird das normale Icon auch im Dunkelmodus angezeigt.
              </p>
              <div className="dark-icon-config">
                <div className="dark-icon-header-row">
                  <span className="dark-icon-col-label">Button</span>
                  <span className="dark-icon-col-normal">Normal</span>
                  <span className="dark-icon-col-dark">Dunkel-Variante</span>
                </div>
                {DARK_MODE_ICON_ROWS.map(({ key, label }) => {
                  const darkKey = key + 'Dark';
                  return (
                    <div className="dark-icon-row" key={key}>
                      <span className="dark-icon-col-label">{label}</span>
                      <div className="dark-icon-col-normal">
                        <div className="dark-icon-input-group">
                          {!isBase64Image(buttonIcons[key]) ? (
                            <>
                              <input
                                type="text"
                                value={buttonIcons[key] || ''}
                                onChange={(e) => handleButtonIconTextChange(key, e.target.value)}
                                placeholder="–"
                                maxLength={10}
                                className="dark-icon-text-input"
                              />
                              <label
                                htmlFor={`${key}NormalFile`}
                                className="upload-icon-btn"
                                title="Bild hochladen"
                              >
                                {uploadingButtonIcon === key ? '...' : 'Foto'}
                              </label>
                              <input
                                type="file"
                                id={`${key}NormalFile`}
                                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                                onChange={(e) => handleButtonIconImageUpload(key, e)}
                                style={{ display: 'none' }}
                                disabled={uploadingButtonIcon === key}
                              />
                            </>
                          ) : (
                            <>
                              <span className="dark-icon-image-info">Bild</span>
                              <button
                                type="button"
                                className="reset-icon-btn"
                                onClick={() => handleRemoveButtonIconImage(key)}
                                title="Bild entfernen"
                              >
                                ×
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="reset-icon-btn"
                            onClick={() => handleResetButtonIcon(key)}
                            title="Auf Standard zurücksetzen"
                          >
                            ↻
                          </button>
                          <div className="dark-icon-preview">
                            {isBase64Image(buttonIcons[key]) ? (
                              <img src={buttonIcons[key]} alt={label} className="icon-image" />
                            ) : (
                              <span>{buttonIcons[key]}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="dark-icon-col-dark">
                        <div className="dark-icon-input-group">
                          {!isBase64Image(buttonIcons[darkKey]) ? (
                            <input
                              type="text"
                              value={buttonIcons[darkKey] || ''}
                              onChange={(e) => handleButtonIconTextChange(darkKey, e.target.value)}
                              placeholder="–"
                              maxLength={10}
                              className="dark-icon-text-input"
                            />
                          ) : (
                            <span className="dark-icon-image-info">Bild</span>
                          )}
                          <label
                            htmlFor={`${darkKey}File`}
                            className="upload-icon-btn"
                            title="Bild hochladen"
                          >
                            {uploadingButtonIcon === darkKey ? '...' : 'Foto'}
                          </label>
                          <input
                            type="file"
                            id={`${darkKey}File`}
                            accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                            onChange={(e) => handleButtonIconImageUpload(darkKey, e)}
                            style={{ display: 'none' }}
                            disabled={uploadingButtonIcon === darkKey}
                          />
                          {buttonIcons[darkKey] ? (
                            <button
                              type="button"
                              className="reset-icon-btn"
                              onClick={() => handleResetButtonIcon(darkKey)}
                              title="Dunkel-Variante entfernen"
                            >
                              ×
                            </button>
                          ) : null}
                          <div className="dark-icon-preview">
                            {isBase64Image(buttonIcons[darkKey]) ? (
                              <img src={buttonIcons[darkKey]} alt="Dunkel" className="icon-image" />
                            ) : buttonIcons[darkKey] ? (
                              <span>{buttonIcons[darkKey]}</span>
                            ) : (
                              <span className="dark-icon-fallback">
                                {isBase64Image(buttonIcons[key]) ? '↑' : buttonIcons[key]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {timelineBubbleIconRows.map(({ label, icon, uploading, onChange, onRemove, fileId }) => (
                  <div className="dark-icon-row" key={fileId}>
                    <span className="dark-icon-col-label">{label}</span>
                    <div className="dark-icon-col-normal">
                      <div className="dark-icon-input-group">
                        {icon ? (
                          <>
                            <span className="dark-icon-image-info">Bild</span>
                            <button
                              type="button"
                              className="reset-icon-btn"
                              onClick={onRemove}
                              title="Bild entfernen"
                            >
                              ×
                            </button>
                          </>
                        ) : null}
                        <label
                          htmlFor={fileId}
                          className="upload-icon-btn"
                          title="Bild hochladen"
                        >
                          {uploading ? '...' : 'Foto'}
                        </label>
                        <input
                          type="file"
                          id={fileId}
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={onChange}
                          style={{ display: 'none' }}
                          disabled={uploading}
                        />
                        <div className="dark-icon-preview">
                          {icon ? (
                            <img src={icon} alt={label} className="icon-image" />
                          ) : (
                            <span className="dark-icon-fallback">–</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="dark-icon-col-dark">
                      <span className="dark-icon-fallback" style={{ padding: '0.25rem 0.4rem' }}>–</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <h3>Standardbild für Menüs in der Zeitleiste</h3>
              <p className="section-description">
                Dieses Bild wird ausschließlich für Menükarten in der Zeitleiste verwendet.
                Es wird nicht in der normalen Menüübersicht angezeigt.
                Unterstützte Formate: JPEG, PNG, WebP. Empfohlen: 16:9 oder quadratisches Format.
              </p>
              <div className="favicon-image-section">
                {timelineMenuDefaultImage ? (
                  <div className="favicon-preview">
                    <img src={timelineMenuDefaultImage} alt="Standardbild Menüs" style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="timelineMenuDefaultImageFile" className="favicon-change-btn">
                        {uploadingTimelineMenuDefaultImage ? 'Hochladen...' : 'Ändern'}
                      </label>
                      <button
                        className="favicon-remove-btn"
                        onClick={handleRemoveTimelineMenuDefaultImage}
                        disabled={uploadingTimelineMenuDefaultImage}
                      >
                        × Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="timelineMenuDefaultImageFile" className="image-upload-label">
                      {uploadingTimelineMenuDefaultImage ? 'Hochladen...' : 'Standardbild hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="timelineMenuDefaultImageFile"
                  accept="image/*"
                  onChange={handleTimelineMenuDefaultImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingTimelineMenuDefaultImage}
                />
              </div>
            </div>


            <div className="settings-section">
              <h3>Standardbild für Kochereignisse in der Zeitleiste</h3>
              <p className="section-description">
                Dieses Bild wird für Kochereigniskarten in der Zeitleiste "Kochbuch" verwendet, wenn kein Rezeptbild vorhanden ist.
                Unterstützte Formate: JPEG, PNG, WebP. Empfohlen: 16:9 oder quadratisches Format.
              </p>
              <div className="favicon-image-section">
                {timelineCookEventDefaultImage ? (
                  <div className="favicon-preview">
                    <img src={timelineCookEventDefaultImage} alt="Standardbild Kochereignisse" style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="timelineCookEventDefaultImageFile" className="favicon-change-btn">
                        {uploadingTimelineCookEventDefaultImage ? 'Hochladen...' : 'Ändern'}
                      </label>
                      <button
                        className="favicon-remove-btn"
                        onClick={handleRemoveTimelineCookEventDefaultImage}
                        disabled={uploadingTimelineCookEventDefaultImage}
                      >
                        × Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="timelineCookEventDefaultImageFile" className="image-upload-label">
                      {uploadingTimelineCookEventDefaultImage ? 'Hochladen...' : 'Standardbild hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="timelineCookEventDefaultImageFile"
                  accept="image/*"
                  onChange={handleTimelineCookEventDefaultImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingTimelineCookEventDefaultImage}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Kategoriebilder</h3>
              <p className="section-description">
                Laden Sie Bilder hoch und verknüpfen Sie diese mit Speisekategorien. 
                Diese Bilder werden als Platzhalter verwendet, wenn ein Rezept ohne Titelbild gespeichert wird.
                Jede Kategorie kann nur einem Bild zugeordnet werden.
              </p>
              
              {/* Upload new image section */}
              {!editingImageId && (
                <div className="category-image-upload">
                  <div className="category-selection">
                    <label>Wählen Sie Speisekategorien für das neue Bild:</label>
                    <div className="category-checkboxes">
                      {lists.mealCategories.map(category => {
                        const isAssigned = categoryImages.some(img => img.categories.includes(category));
                        const isSelected = selectedCategories.includes(category);
                        return (
                          <label 
                            key={category} 
                            className={`category-checkbox ${isAssigned && !isSelected ? 'disabled' : ''}`}
                            title={isAssigned && !isSelected ? 'Diese Kategorie ist bereits einem Bild zugeordnet' : ''}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleCategoryToggle(category)}
                              disabled={isAssigned && !isSelected}
                            />
                            <span>{category}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="image-upload-button-container">
                    <label htmlFor="categoryImageFile" className="image-upload-label">
                      {uploadingImage ? 'Hochladen...' : 'Neues Bild hochladen'}
                    </label>
                    <input
                      type="file"
                      id="categoryImageFile"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                      disabled={uploadingImage || selectedCategories.length === 0}
                    />
                    {selectedCategories.length === 0 && (
                      <p className="upload-hint">Bitte wählen Sie mindestens eine Kategorie aus.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Existing images */}
              <div className="category-images-list">
                {categoryImages.map(img => (
                  <div key={img.id} className="category-image-item">
                    <div className="category-image-preview">
                      <img src={img.image} alt="Category" />
                      {editingImageId !== img.id && (
                        <button
                          className="category-image-remove-icon"
                          onClick={() => handleRemoveCategoryImage(img.id)}
                          title="Bild entfernen"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    
                    {editingImageId === img.id ? (
                      <div className="category-image-edit">
                        <div className="category-selection">
                          <label>Kategorien bearbeiten:</label>
                          <div className="category-checkboxes">
                            {lists.mealCategories.map(category => {
                              const isAssignedToOther = categoryImages.some(
                                otherImg => otherImg.id !== img.id && otherImg.categories.includes(category)
                              );
                              const isSelected = selectedCategories.includes(category);
                              return (
                                <label 
                                  key={category} 
                                  className={`category-checkbox ${isAssignedToOther ? 'disabled' : ''}`}
                                  title={isAssignedToOther ? 'Diese Kategorie ist bereits einem anderen Bild zugeordnet' : ''}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleCategoryToggle(category)}
                                    disabled={isAssignedToOther}
                                  />
                                  <span>{category}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="category-image-actions">
                          <button 
                            className="save-categories-btn" 
                            onClick={handleSaveImageCategories}
                            disabled={selectedCategories.length === 0}
                          >
                            ✓ Speichern
                          </button>
                          <button 
                            className="cancel-edit-btn" 
                            onClick={handleCancelEditCategories}
                          >
                            × Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="category-image-info">
                        <div className="category-image-categories">
                          {img.categories.length > 0 ? (
                            img.categories.map(cat => (
                              <span key={cat} className="category-badge">{cat}</span>
                            ))
                          ) : (
                            <span className="no-categories">Keine Kategorien zugeordnet</span>
                          )}
                        </div>
                        <div className="category-image-actions">
                          <button 
                            className="edit-categories-btn" 
                            onClick={() => handleEditImageCategories(img.id)}
                            title="Kategorien bearbeiten"
                          >
                            Bearbeiten
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <h3>Kachelgröße</h3>
              <p className="section-description">
                Passen Sie die Größe der Kacheln in allen Grid-Ansichten an. Diese Einstellung wirkt sich besonders auf mobilen Geräten aus.
              </p>
              <div className="tile-size-options">
                <button
                  type="button"
                  className={`tile-size-btn${tileSize === TILE_SIZE_SMALL ? ' active' : ''}`}
                  onClick={() => setTileSize(TILE_SIZE_SMALL)}
                >
                  <span className="tile-size-icon">⊞⊞⊞</span>
                  <span className="tile-size-label">Klein</span>
                  <span className="tile-size-desc">Mehr Kacheln pro Zeile</span>
                </button>
                <button
                  type="button"
                  className={`tile-size-btn${tileSize === TILE_SIZE_MEDIUM ? ' active' : ''}`}
                  onClick={() => setTileSize(TILE_SIZE_MEDIUM)}
                >
                  <span className="tile-size-icon">⊞⊞</span>
                  <span className="tile-size-label">Mittel</span>
                  <span className="tile-size-desc">Standard</span>
                </button>
                <button
                  type="button"
                  className={`tile-size-btn${tileSize === TILE_SIZE_LARGE ? ' active' : ''}`}
                  onClick={() => setTileSize(TILE_SIZE_LARGE)}
                >
                  <span className="tile-size-icon">⊞</span>
                  <span className="tile-size-label">Groß</span>
                  <span className="tile-size-desc">Weniger Kacheln pro Zeile</span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <h3>Erscheinungsbild</h3>
              <p className="section-description">
                Wählen Sie zwischen hellem und dunklem Design oder übernehmen Sie die Systemeinstellung automatisch.
              </p>
              <div className="theme-options">
                <button
                  type="button"
                  className={`theme-btn${darkMode === 'light' ? ' active' : ''}`}
                  onClick={() => setDarkMode('light')}
                >
                  <span className="theme-btn-icon">Hell</span>
                  <span className="theme-btn-label">Hell</span>
                  <span className="theme-btn-desc">Helles Design</span>
                </button>
                <button
                  type="button"
                  className={`theme-btn${darkMode === 'dark' ? ' active' : ''}`}
                  onClick={() => setDarkMode('dark')}
                >
                  <span className="theme-btn-icon">Dunkel</span>
                  <span className="theme-btn-label">Dunkel</span>
                  <span className="theme-btn-desc">Dunkles Design</span>
                </button>
                <button
                  type="button"
                  className={`theme-btn${darkMode === 'auto' ? ' active' : ''}`}
                  onClick={() => setDarkMode('auto')}
                >
                  <span className="theme-btn-icon">Auto</span>
                  <span className="theme-btn-label">Automatisch</span>
                  <span className="theme-btn-desc">Systemeinstellung</span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <h3>Sortier- und Filter-Einstellungen</h3>
              <p className="section-description">
                Konfigurieren Sie die Parameter für die Karussell-Sortieroptionen in der Rezeptübersicht.
              </p>
              <div className="sort-settings-grid">
                <div className="sort-settings-group">
                  <h4>Im Trend</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="trendingDays">Zeitfenster in Tagen (X):</label>
                    <input
                      id="trendingDays"
                      type="number"
                      min="1"
                      max="365"
                      value={trendingDays}
                      onChange={(e) => {
                        const val = e.target.valueAsNumber;
                        if (!isNaN(val) && val >= 1) setTrendingDays(val);
                      }}
                    />
                    <span className="sort-settings-hint">Nur Aufrufe der letzten X Tage werden gezählt.</span>
                  </div>
                  <div className="sort-settings-field">
                    <label htmlFor="trendingMinViews">Mindestaufrufe (Y):</label>
                    <input
                      id="trendingMinViews"
                      type="number"
                      min="0"
                      value={trendingMinViews}
                      onChange={(e) => {
                        const val = e.target.valueAsNumber;
                        if (!isNaN(val) && val >= 0) setTrendingMinViews(val);
                      }}
                    />
                    <span className="sort-settings-hint">Rezepte mit weniger als Y Aufrufen werden ausgeblendet.</span>
                  </div>
                </div>
                <div className="sort-settings-group">
                  <h4>Neue Rezepte</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="newRecipeDays">Zeitfenster in Tagen (X):</label>
                    <input
                      id="newRecipeDays"
                      type="number"
                      min="1"
                      max="365"
                      value={newRecipeDays}
                      onChange={(e) => {
                        const val = e.target.valueAsNumber;
                        if (!isNaN(val) && val >= 1) setNewRecipeDays(val);
                      }}
                    />
                    <span className="sort-settings-hint">Nur Rezepte, die in den letzten X Tagen erstellt wurden, werden angezeigt.</span>
                  </div>
                </div>
                <div className="sort-settings-group">
                  <h4>Nach Bewertung</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="ratingMinVotes">Mindestanzahl Bewertungen (m):</label>
                    <input
                      id="ratingMinVotes"
                      type="number"
                      min="1"
                      value={ratingMinVotes}
                      onChange={(e) => {
                        const val = e.target.valueAsNumber;
                        if (!isNaN(val) && val >= 1) setRatingMinVotes(val);
                      }}
                    />
                    <span className="sort-settings-hint">Dämpfungsparameter für den Bewertungs-Score: Score = (v/(v+m))·R + (m/(v+m))·C</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <button className="save-button" onClick={handleSave}>
                Einstellungen speichern
              </button>
            </div>
          </>
        ) : activeTab === 'druck' ? (
          <>
            <div className="settings-section">
              <h3>Druckformate</h3>
              <p className="section-description">
                Konfigurieren Sie das Drucklayout für Rezepte. Platzieren Sie die Elemente per Drag &amp; Drop
                frei auf der Seite und passen Sie ihre Größe durch Ziehen an den Rändern an.
                Die Anzahl der Fotos bestimmt, welches Format angewendet wird.
              </p>

              {/* ── Preview recipe selector ─────────────────────────────── */}
              {allRecipes.length > 0 && (
                <div className="print-preview-selector">
                  <label htmlFor="print-preview-recipe" className="print-preview-label">
                    Vorschau-Rezept:
                  </label>
                  <select
                    id="print-preview-recipe"
                    className="pfe-select"
                    value={printPreviewRecipeId}
                    onChange={(e) => setPrintPreviewRecipeId(e.target.value)}
                  >
                    <option value="">– kein Vorschau-Rezept –</option>
                    {[...allRecipes]
                      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de'))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {printFormats.map((fmt, fmtIdx) => (
                <div key={fmt.id} className="print-format-item">
                  <div className="print-format-header">
                    <input
                      type="text"
                      className="print-format-name-input"
                      value={fmt.name}
                      placeholder="Formatname"
                      onChange={(e) => {
                        const updated = printFormats.map((f, i) =>
                          i === fmtIdx ? { ...f, name: e.target.value } : f
                        );
                        setPrintFormats(updated);
                      }}
                    />
                    <button
                      type="button"
                      className="faq-delete-btn"
                      title="Format löschen"
                      onClick={() => {
                        if (printFormats.length <= 1) {
                          alert('Es muss mindestens ein Druckformat vorhanden sein.');
                          return;
                        }
                        const isCatchAll = fmt.maxPhotos === null || fmt.maxPhotos === undefined;
                        const remainingCatchAlls = printFormats.filter(
                          (f, i) => i !== fmtIdx && (f.maxPhotos === null || f.maxPhotos === undefined)
                        );
                        if (isCatchAll && remainingCatchAlls.length === 0) {
                          alert('Mindestens ein Format ohne Fotobegrenzung (Standardformat) muss vorhanden sein.');
                          return;
                        }
                        if (window.confirm('Dieses Druckformat wirklich löschen?')) {
                          setPrintFormats(printFormats.filter((_, i) => i !== fmtIdx));
                        }
                      }}
                    >
                      Löschen
                    </button>
                  </div>

                  {/* Max photos threshold */}
                  <div className="sort-settings-field" style={{ marginBottom: '0.75rem' }}>
                    <label>Maximale Fotoanzahl:</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Unbegrenzt"
                      value={fmt.maxPhotos != null ? fmt.maxPhotos : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val = raw === '' ? null : parseInt(raw, 10);
                        const updated = printFormats.map((f, i) =>
                          i === fmtIdx ? { ...f, maxPhotos: isNaN(val) ? null : val } : f
                        );
                        setPrintFormats(updated);
                      }}
                    />
                    <span className="sort-settings-hint">
                      Dieses Format wird verwendet, wenn die Anzahl der Fotos ≤ diesem Wert ist. Leer = gilt für alle.
                    </span>
                  </div>

                  {/* WYSIWYG editor */}
                  <PrintFormatEditor
                    format={fmt}
                    onChange={(updatedFmt) => {
                      const updated = printFormats.map((f, i) =>
                        i === fmtIdx ? updatedFmt : f
                      );
                      setPrintFormats(updated);
                    }}
                  />

                  {/* Print format preview */}
                  {printPreviewRecipeId && (() => {
                    const previewRecipe = allRecipes.find((r) => r.id === printPreviewRecipeId);
                    if (!previewRecipe) return null;
                    const allImages =
                      Array.isArray(previewRecipe.images) && previewRecipe.images.length > 0
                        ? previewRecipe.images
                        : previewRecipe.image
                        ? [{ url: previewRecipe.image }]
                        : [];
                    const imageCount = allImages.length;
                    const applicableFormat = selectPrintFormat(printFormats, imageCount);
                    const isApplicable = applicableFormat?.id === fmt.id;
                    return (
                      <div className="print-preview-container">
                        <div className="print-preview-header">
                          <span className="print-preview-title">Vorschau: {previewRecipe.title}</span>
                          {isApplicable ? (
                            <span className="print-preview-badge print-preview-badge--active">
                              Aktives Format für dieses Rezept
                            </span>
                          ) : (
                            <span className="print-preview-badge print-preview-badge--inactive">
                              Nicht aktiv für dieses Rezept
                            </span>
                          )}
                        </div>
                        <PrintPreview recipe={previewRecipe} format={fmt} />
                      </div>
                    );
                  })()}
                </div>
              ))}

              <div className="print-format-actions">
                <button
                  type="button"
                  className="save-button"
                  onClick={() => {
                    const newFormat = {
                      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `format-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                      name: `Format ${printFormats.length + 1}`,
                      maxPhotos: null,
                      orientation: 'portrait',
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      imageColumns: 'auto',
                      layoutVersion: PRINT_FORMAT_LAYOUT_VERSION,
                      elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT,
                    };
                    setPrintFormats([...printFormats, newFormat]);
                  }}
                >
                  + Neues Format hinzufügen
                </button>
                <button
                  type="button"
                  className="save-button"
                  disabled={savingPrintFormats}
                  onClick={async () => {
                    setSavingPrintFormats(true);
                    try {
                      await savePrintFormats(printFormats);
                      alert('Druckformate gespeichert!');
                    } catch (err) {
                      alert('Fehler beim Speichern der Druckformate: ' + err.message);
                    } finally {
                      setSavingPrintFormats(false);
                    }
                  }}
                >
                  {savingPrintFormats ? 'Speichern...' : 'Druckformate speichern'}
                </button>
              </div>
            </div>
          </>
        ) : activeTab === 'tagesmenu' ? (
          <>
            <div className="settings-section">
              <h3>Tagesmenü – Status-Gültigkeitsdauer</h3>
              <p className="section-description">
                Konfigurieren Sie, wie lange ein Rezept nach dem Swipen in einer privaten Liste den jeweiligen Status behält. Leeres Feld bedeutet: Status bleibt permanent erhalten.
              </p>
              <div className="sort-settings-grid">
                <div className="sort-settings-group">
                  <h4>⭐ Kandidat</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="statusValidityDaysKandidat">Gültigkeitsdauer (Tage):</label>
                    <input
                      id="statusValidityDaysKandidat"
                      type="number"
                      min="1"
                      placeholder="∞ permanent"
                      value={statusValidityDaysKandidat}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setStatusValidityDaysKandidat('');
                        } else {
                          const val = parseInt(raw, 10);
                          if (!isNaN(val) && val >= 1) setStatusValidityDaysKandidat(String(val));
                        }
                      }}
                    />
                    <span className="sort-settings-hint">{STATUS_VALIDITY_HINT}</span>
                  </div>
                </div>
                <div className="sort-settings-group">
                  <h4>Geparkt</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="statusValidityDaysGeparkt">Gültigkeitsdauer (Tage):</label>
                    <input
                      id="statusValidityDaysGeparkt"
                      type="number"
                      min="1"
                      placeholder="∞ permanent"
                      value={statusValidityDaysGeparkt}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setStatusValidityDaysGeparkt('');
                        } else {
                          const val = parseInt(raw, 10);
                          if (!isNaN(val) && val >= 1) setStatusValidityDaysGeparkt(String(val));
                        }
                      }}
                    />
                    <span className="sort-settings-hint">{STATUS_VALIDITY_HINT}</span>
                  </div>
                </div>
                <div className="sort-settings-group">
                  <h4>Archiv</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="statusValidityDaysArchiv">Gültigkeitsdauer (Tage):</label>
                    <input
                      id="statusValidityDaysArchiv"
                      type="number"
                      min="1"
                      placeholder="∞ permanent"
                      value={statusValidityDaysArchiv}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setStatusValidityDaysArchiv('');
                        } else {
                          const val = parseInt(raw, 10);
                          if (!isNaN(val) && val >= 1) setStatusValidityDaysArchiv(String(val));
                        }
                      }}
                    />
                    <span className="sort-settings-hint">{STATUS_VALIDITY_HINT}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Tagesmenü – Gemeinsame Statusermittlung</h3>
              <p className="section-description">
                Konfigurieren Sie die Grenzwerte für die gemeinsame Statusermittlung in interaktiven Listen mit mehreren Mitgliedern. Fehlt der Swipe eines Mitglieds, wird dieser als "Kandidaten"-Swipe gewertet.
              </p>
              <div className="sort-settings-grid">
                <div className="sort-settings-group">
                  <h4>⭐ Kandidat</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="groupThresholdKandidatMinKandidat">Minimum Kandidaten-Swipes (%):</label>
                    <input
                      id="groupThresholdKandidatMinKandidat"
                      type="number"
                      min="0"
                      max="100"
                      value={groupThresholdKandidatMinKandidat}
                      onChange={handlePercentChange(setGroupThresholdKandidatMinKandidat)}
                    />
                    <span className="sort-settings-hint">Ein Rezept gilt als gemeinsamer Kandidat, wenn mindestens X % der Mitglieder "Kandidat" geswipet haben.</span>
                  </div>
                  <div className="sort-settings-field">
                    <label htmlFor="groupThresholdKandidatMaxArchiv">Maximum Archiv-Swipes (%):</label>
                    <input
                      id="groupThresholdKandidatMaxArchiv"
                      type="number"
                      min="0"
                      max="100"
                      value={groupThresholdKandidatMaxArchiv}
                      onChange={handlePercentChange(setGroupThresholdKandidatMaxArchiv)}
                    />
                    <span className="sort-settings-hint">Ein Rezept gilt als gemeinsamer Kandidat, wenn höchstens Y % der Mitglieder "Archiv" geswipet haben.</span>
                  </div>
                </div>
                <div className="sort-settings-group">
                  <h4>Archiv</h4>
                  <div className="sort-settings-field">
                    <label htmlFor="groupThresholdArchivMinArchiv">Minimum Archiv-Swipes (%):</label>
                    <input
                      id="groupThresholdArchivMinArchiv"
                      type="number"
                      min="0"
                      max="100"
                      value={groupThresholdArchivMinArchiv}
                      onChange={handlePercentChange(setGroupThresholdArchivMinArchiv)}
                    />
                    <span className="sort-settings-hint">Ein Rezept wird gemeinsam archiviert, wenn mindestens X % der Mitglieder "Archiv" geswipet haben.</span>
                  </div>
                  <div className="sort-settings-field">
                    <label htmlFor="groupThresholdArchivMaxKandidat">Maximum Kandidaten-Swipes (%):</label>
                    <input
                      id="groupThresholdArchivMaxKandidat"
                      type="number"
                      min="0"
                      max="100"
                      value={groupThresholdArchivMaxKandidat}
                      onChange={handlePercentChange(setGroupThresholdArchivMaxKandidat)}
                    />
                    <span className="sort-settings-hint">Ein Rezept wird gemeinsam archiviert, wenn höchstens Y % der Mitglieder "Kandidat" geswipet haben.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Tagesmenü – Maximale Kandidaten-Schwelle</h3>
              <p className="section-description">
                Steuern Sie, wann der Swipe-Stapel automatisch beendet wird. Sobald der Kandidaten-Score S den Grenzwert erreicht oder überschreitet, wird der Stapel abgeschlossen.
                Der Score berechnet sich als S&nbsp;=&nbsp;∑&nbsp;1/(1+n<sub>i</sub>), wobei n<sub>i</sub> die Anzahl der offenen Votings des i-ten Rezepts ist.
                Leeres Feld bedeutet: kein automatischer Abbruch.
              </p>
              <div className="sort-settings-grid">
                <div className="sort-settings-group">
                  <div className="sort-settings-field">
                    <label htmlFor="maxKandidatenSchwelle">Maximaler Kandidaten-Grenzwert:</label>
                    <input
                      id="maxKandidatenSchwelle"
                      type="number"
                      min="0.1"
                      step="0.1"
                      placeholder="∞ kein Limit"
                      value={maxKandidatenSchwelle}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setMaxKandidatenSchwelle('');
                        } else {
                          const val = parseFloat(raw);
                          if (!isNaN(val) && val >= 0.1) setMaxKandidatenSchwelle(String(val));
                        }
                      }}
                    />
                    <span className="sort-settings-hint">Sobald S ≥ Grenzwert, wird der Swipe-Stapel beendet. Leer = kein automatischer Abbruch.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Startseite – Gemeinsame Kandidaten</h3>
              <p className="section-description">
                Konfigurieren Sie den Hinweistext, der auf der Startseite im Karussell „Gemeinsame Kandidaten“ angezeigt wird, wenn keine gemeinsamen Kandidaten vorhanden sind.
              </p>
              <div className="sort-settings-grid">
                <div className="sort-settings-group">
                  <div className="sort-settings-field">
                    <label htmlFor="startseitenKandidatenHinweis">Hinweistext:</label>
                    <input
                      id="startseitenKandidatenHinweis"
                      type="text"
                      value={startseitenKandidatenHinweis}
                      onChange={(e) => setStartseitenKandidatenHinweis(e.target.value)}
                    />
                    <span className="sort-settings-hint">Wird angezeigt, wenn aktuell keine gemeinsamen Kandidaten in der Standard-Liste für Webimport vorhanden sind.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <button className="save-button" onClick={handleSave}>
                Einstellungen speichern
              </button>
            </div>
          </>
        ) : activeTab === 'lists' ? (
          <>
            <div className="settings-section">
          <h3>Kulinarik-Typen</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCuisine()}
              placeholder="Neuen Kulinarik-Typ hinzufügen..."
            />
            <button onClick={addCuisine}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCuisineTypes}>
            <SortableContext items={lists.cuisineTypes} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.cuisineTypes.map((cuisine) => (
                  <SortableListItem key={cuisine} id={cuisine} label={cuisine} onRemove={() => removeCuisine(cuisine)} onRename={canEditLists ? renameCuisine : undefined} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Kulinarik-Gruppen</h3>
          <p className="section-description">
            Übergeordnete Kulinariktypen für die Suchfilterung. Untergeordnete Typen müssen aus der Liste der Kulinarik-Typen ausgewählt werden. Übergeordnete Typen können nicht direkt Rezepten zugeordnet werden.
          </p>
          <div className="list-input">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCuisineGroup()}
              placeholder="Neue Gruppe hinzufügen (z.B. Asiatische Küche)..."
            />
            <button onClick={addCuisineGroup}>Hinzufügen</button>
          </div>
          <div className="list-items">
            {(lists.cuisineGroups || []).map(group => (
              <div key={group.name} className="cuisine-group-item">
                <div className="cuisine-group-header">
                  <strong>{group.name}</strong>
                  <button className="remove-btn" onClick={() => removeCuisineGroup(group.name)} title="Gruppe entfernen">×</button>
                </div>
                <div className="cuisine-group-children">
                  {group.children.map(child => (
                    <span key={child} className="cuisine-group-child-tag">
                      {child}
                      <button
                        className="remove-child-btn"
                        onClick={() => removeChildFromGroup(group.name, child)}
                        title="Untertyp entfernen"
                        aria-label={`${child} aus Gruppe entfernen`}
                      >×</button>
                    </span>
                  ))}
                  <select
                    className="cuisine-group-add-child"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addChildToGroup(group.name, e.target.value);
                    }}
                    aria-label={`Untertyp zu ${group.name} hinzufügen`}
                  >
                    <option value="">+ Untertyp hinzufügen...</option>
                    {lists.cuisineTypes
                      .filter(c => !group.children.includes(c))
                      .map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Speisekategorien</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Neue Speisekategorie hinzufügen..."
            />
            <button onClick={addCategory}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndMealCategories}>
            <SortableContext items={lists.mealCategories} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.mealCategories.map((category) => (
                  <SortableListItem key={category} id={category} label={category} onRemove={() => removeCategory(category)} onRename={canEditLists ? renameCategory : undefined} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Maßeinheiten</h3>
          <div className="list-input">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addUnit()}
              placeholder="Neue Einheit hinzufügen..."
            />
            <button onClick={addUnit}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndUnits}>
            <SortableContext items={lists.units} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.units.map((unit) => (
                  <SortableListItem key={unit} id={unit} label={unit} onRemove={() => removeUnit(unit)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Portionseinheiten</h3>
          <p className="section-description">
            Definieren Sie benutzerdefinierte Portionseinheiten mit Singular- und Pluralformen (z.B. Pizza/Pizzen, Drink/Drinks).
          </p>
          <div className="list-input portion-unit-input">
            <input
              type="text"
              value={newPortionSingular}
              onChange={(e) => setNewPortionSingular(e.target.value)}
              placeholder="Singular (z.B. Pizza)"
            />
            <input
              type="text"
              value={newPortionPlural}
              onChange={(e) => setNewPortionPlural(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addPortionUnit()}
              placeholder="Plural (z.B. Pizzen)"
            />
            <button onClick={addPortionUnit}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPortionUnits}>
            <SortableContext items={lists.portionUnits.map(u => u.id)} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.portionUnits.map((unit) => (
                  <SortablePortionUnitItem key={unit.id} id={unit.id} unit={unit} onRemove={() => removePortionUnit(unit.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Umrechnungstabelle</h3>
          <p className="section-description">
            Definieren Sie Umrechnungswerte für Zutaten. Die Tabelle gibt an, wie viel Gramm (g) oder Milliliter (ml) eine Einheit einer Zutat entspricht.
          </p>
          <div className="conversion-table-container">
            <table className="conversion-table">
              <thead>
                <tr>
                  <th>Zutat</th>
                  <th>Einheit</th>
                  <th>In g</th>
                  <th>In ml</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...(lists.conversionTable || [])].sort((a, b) =>
                  (a.ingredient || '').localeCompare(b.ingredient || '', undefined, { sensitivity: 'base' })
                ).map((entry) => {
                  const missingValues = !entry.grams?.trim() && !entry.milliliters?.trim();
                  return (
                  <tr key={entry.id} className={missingValues ? 'conversion-row-no-values' : ''}>
                    <td>
                      <input
                        type="text"
                        value={entry.ingredient}
                        onChange={(e) => updateConversionEntry(entry.id, 'ingredient', e.target.value)}
                        className="conversion-table-input"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={entry.unit}
                        onChange={(e) => updateConversionEntry(entry.id, 'unit', e.target.value)}
                        className="conversion-table-input"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={entry.grams}
                        onChange={(e) => updateConversionEntry(entry.id, 'grams', e.target.value)}
                        className="conversion-table-input"
                        placeholder="–"
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={entry.milliliters}
                        onChange={(e) => updateConversionEntry(entry.id, 'milliliters', e.target.value)}
                        className="conversion-table-input"
                        placeholder="–"
                      />
                    </td>
                    <td>
                      <button className="remove-btn" onClick={() => removeConversionEntry(entry.id)} title="Entfernen">×</button>
                    </td>
                  </tr>
                  );
                })}
                <tr className="conversion-table-new-row">
                  <td>
                    <input
                      type="text"
                      value={newConversionIngredient}
                      onChange={(e) => setNewConversionIngredient(e.target.value)}
                      placeholder="Zutat..."
                      className="conversion-table-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={newConversionUnit}
                      onChange={(e) => setNewConversionUnit(e.target.value)}
                      placeholder="Einheit..."
                      className="conversion-table-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={newConversionGrams}
                      onChange={(e) => setNewConversionGrams(e.target.value)}
                      placeholder="–"
                      className="conversion-table-input"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={newConversionMl}
                      onChange={(e) => setNewConversionMl(e.target.value)}
                      placeholder="–"
                      className="conversion-table-input"
                      onKeyDown={(e) => e.key === 'Enter' && addConversionEntry()}
                    />
                  </td>
                  <td>
                    <button onClick={addConversionEntry} className="add-conversion-btn" title="Hinzufügen">+</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="settings-section">
          <h3>Verfügbare Maßeinheiten</h3>
          <p className="section-description">
            Definieren Sie zusätzliche Maßeinheiten, die bei der Zutatenerkennung verwendet werden.
            Standard-Einheiten wie g, kg, ml, l, TL, EL, Teelöffel, Esslöffel sind bereits vorinstalliert.
          </p>
          <div className="custom-units-container">
            <div className="custom-units-list">
              {(lists.customUnits || []).map((unit, index) => (
                <div key={index} className="custom-unit-item">
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => updateCustomUnitHandler(index, e.target.value)}
                    className="custom-unit-input"
                  />
                  <button
                    onClick={() => removeCustomUnitHandler(index)}
                    className="custom-unit-remove"
                    title="Einheit entfernen"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="custom-unit-add-row">
              <input
                type="text"
                value={newCustomUnit}
                onChange={(e) => setNewCustomUnit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomUnitHandler()}
                placeholder="Neue Maßeinheit..."
                className="custom-unit-input"
              />
              <button onClick={addCustomUnitHandler} className="add-custom-unit-btn">
                + Hinzufügen
              </button>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button className="reset-button" onClick={handleReset}>
            Auf Standard zurücksetzen
          </button>
          <button className="save-button" onClick={handleSave}>
            Einstellungen speichern
          </button>
        </div>
      </>
        ) : activeTab === 'ai' ? (
          <>
            <div className="settings-section">
              <h3>KI-Rezepterkennung (Prompt)</h3>
              <p className="prompt-help-text">
                Dieser Prompt wird für die KI-Rezepterkennung (Fotoscan &amp; Web-Import) verwendet. Änderungen werden sofort aktiv.
              </p>
              <textarea
                className="ai-prompt-textarea"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={15}
              />
              <div className="prompt-actions">
                <button
                  className="save-button"
                  onClick={async () => {
                    try {
                      await saveAIRecipePrompt(aiPrompt);
                      alert('KI-Prompt erfolgreich gespeichert!');
                    } catch (e) {
                      alert('Fehler beim Speichern: ' + e.message);
                    }
                  }}
                >
                  Speichern
                </button>
                <button
                  className="reset-button"
                  onClick={async () => {
                    if (window.confirm('Möchten Sie den KI-Prompt wirklich auf den Standard zurücksetzen?')) {
                      try {
                        const defaultPrompt = await resetAIRecipePrompt();
                        setAiPrompt(defaultPrompt);
                        alert('KI-Prompt auf Standard zurückgesetzt!');
                      } catch (e) {
                        alert('Fehler beim Zurücksetzen: ' + e.message);
                      }
                    }
                  }}
                >
                  Auf Standard zurücksetzen
                </button>
              </div>
            </div>
          </>
        ) : activeTab === 'faq' ? (
          <>
            <div className="settings-section">
              <h3>Kochschule-Einträge</h3>
              <p className="section-description">
                Hier kannst du Kochschule-Einträge anlegen und pflegen. Einträge können optional als „nur für Administratoren sichtbar" markiert werden.
              </p>

              {/* FAQ Import aus FAQ.md */}
              <div className="faq-import-section">
                <h4>FAQ aus FAQ.md importieren</h4>
                <p className="section-description">
                  Importiert alle Einträge aus der <code>FAQ.md</code>-Datei automatisch als FAQ-Einträge. Bereits vorhandene Einträge werden nicht gelöscht.
                </p>
                <button
                  className="save-button"
                  onClick={handleImportFaqFromMd}
                  disabled={importingFaq}
                >
                  {importingFaq ? 'Importiere...' : 'FAQ.md importieren'}
                </button>
              </div>

              {/* FAQ form */}
              <div className="faq-form">
                <h4>{editingFaqId ? 'Kochschule-Eintrag bearbeiten' : 'Neuen Kochschule-Eintrag hinzufügen'}</h4>
                <div className="list-input">
                  <input
                    type="text"
                    placeholder="Titel (z.B. Wie lege ich ein neues Rezept an?)"
                    value={faqForm.title}
                    onChange={(e) => setFaqForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="list-input">
                  <textarea
                    className="faq-description-input"
                    placeholder="Beschreibung – locker und verständlich formuliert (z.B. Klick auf das große Plus rechts unten und fülle die Felder aus. Fertig!)"
                    value={faqForm.description}
                    rows={4}
                    onChange={(e) => setFaqForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="faq-level-select">
                  <label htmlFor="faqLevelSelect">Ebene:</label>
                  <select
                    id="faqLevelSelect"
                    value={faqForm.level ?? 1}
                    onChange={(e) => setFaqForm(prev => ({ ...prev, level: Number(e.target.value) }))}
                  >
                    <option value={0}>0 – Abschnittsüberschrift</option>
                    <option value={1}>1 – Frage/Antwort</option>
                    <option value={2}>2 – Eingerückt</option>
                  </select>
                </div>
                <div className="faq-admin-only-section">
                  <label className="faq-admin-only-label">
                    <input
                      type="checkbox"
                      checked={faqForm.adminOnly ?? false}
                      onChange={(e) => setFaqForm(prev => ({ ...prev, adminOnly: e.target.checked }))}
                    />
                    Nur für Administratoren sichtbar
                  </label>
                </div>
                <div className="faq-visibility-section">
                  <span className="faq-visibility-title">Sichtbarkeit:</span>
                  <label className="faq-visibility-label">
                    <input
                      type="checkbox"
                      checked={faqForm.showOnDesktop ?? true}
                      onChange={(e) => setFaqForm(prev => ({ ...prev, showOnDesktop: e.target.checked }))}
                    />
                    Desktop
                  </label>
                  <label className="faq-visibility-label">
                    <input
                      type="checkbox"
                      checked={faqForm.showOnMobile ?? true}
                      onChange={(e) => setFaqForm(prev => ({ ...prev, showOnMobile: e.target.checked }))}
                    />
                    Mobil
                  </label>
                </div>
                <div className="faq-screenshot-section">
                  <label>Screenshot (optional):</label>
                  {faqForm.screenshot ? (
                    <div className="faq-screenshot-preview">
                      <img src={faqForm.screenshot} alt="Screenshot" className="faq-screenshot-img" />
                      <button
                        type="button"
                        className="favicon-remove-btn"
                        onClick={() => setFaqForm(prev => ({ ...prev, screenshot: null }))}
                      >
                        × Entfernen
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="faqScreenshotFile" className="image-upload-label">
                      {uploadingFaqScreenshot ? 'Hochladen...' : 'Screenshot hochladen'}
                    </label>
                  )}
                  <input
                    type="file"
                    id="faqScreenshotFile"
                    accept="image/*"
                    onChange={handleFaqScreenshotUpload}
                    style={{ display: 'none' }}
                    disabled={uploadingFaqScreenshot}
                  />
                </div>
                <div className="faq-form-actions">
                  <button
                    className="save-button"
                    onClick={handleSaveFaq}
                    disabled={savingFaq}
                  >
                    {savingFaq ? 'Speichern...' : editingFaqId ? 'Kochschule-Eintrag aktualisieren' : 'Kochschule-Eintrag hinzufügen'}
                  </button>
                  {editingFaqId && (
                    <button className="reset-button" onClick={handleCancelFaqEdit}>
                      Abbrechen
                    </button>
                  )}
                </div>
              </div>

              {/* FAQ list */}
              {faqs.length === 0 ? (
                <p className="section-description">Noch keine Kochschule-Einträge vorhanden. Füge oben den ersten Eintrag hinzu!</p>
              ) : (
                <>
                  {faqSelectedIds.length > 0 && (
                    <div className="faq-indent-toolbar">
                      <span className="faq-indent-toolbar-label">{faqSelectedIds.length} ausgewählt:</span>
                      <button
                        className="faq-indent-btn"
                        onClick={() => handleFaqIndent(-1)}
                        title="Ausrücken"
                      >
                        ← Ausrücken
                      </button>
                      <button
                        className="faq-indent-btn"
                        onClick={() => handleFaqIndent(1)}
                        title="Einrücken"
                      >
                        Einrücken →
                      </button>
                    </div>
                  )}
                  <div className="faq-list">
                    {faqs.map((faq, faqIndex) => {
                      const isSelected = faqSelectedIds.includes(faq.id);
                      return (
                        <div
                          key={faq.id}
                          className={`faq-list-item${faq.level === 0 ? ' faq-list-item--heading' : ''}${faq.level > 1 ? ' faq-list-item--indented' : ''}${isSelected ? ' faq-list-item--selected' : ''}`}
                        >
                          <div className="faq-list-item-header">
                            <input
                              type="checkbox"
                              className="faq-list-item-checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFaqSelectedIds(prev => [...prev, faq.id]);
                                } else {
                                  setFaqSelectedIds(prev => prev.filter(id => id !== faq.id));
                                }
                              }}
                              aria-label="Auswählen"
                            />
                            <strong className="faq-list-item-title">{renderBoldText(faq.title)}</strong>
                            <span className="faq-list-item-level">Ebene {faq.level ?? 1}</span>
                            {faq.adminOnly && (
                              <span className="faq-admin-badge" title="Nur für Administratoren sichtbar">Admin</span>
                            )}
                            {(faq.showOnDesktop !== false) && (
                              <span className="faq-visibility-badge" title="Auf Desktop sichtbar">Desktop</span>
                            )}
                            {(faq.showOnMobile !== false) && (
                              <span className="faq-visibility-badge" title="Auf Mobilgeräten sichtbar">Mobil</span>
                            )}
                            <div className="faq-list-item-actions">
                              <button
                                className="faq-move-btn"
                                onClick={() => handleFaqMoveUp(faq.id)}
                                disabled={faqIndex === 0}
                                title="Nach oben"
                              >
                                ↑
                              </button>
                              <button
                                className="faq-move-btn"
                                onClick={() => handleFaqMoveDown(faq.id)}
                                disabled={faqIndex === faqs.length - 1}
                                title="Nach unten"
                              >
                                ↓
                              </button>
                              <button
                                className="faq-edit-btn"
                                onClick={() => handleEditFaq(faq)}
                                title="Bearbeiten"
                              >
                                Edit
                              </button>
                              <button
                                className="faq-delete-btn"
                                onClick={() => handleDeleteFaq(faq.id)}
                                title="Löschen"
                              >
                                Löschen
                              </button>
                            </div>
                          </div>
                          {faq.description && (
                            <p className="faq-list-item-description">{renderBoldText(faq.description)}</p>
                          )}
                          {faq.screenshot && (
                            <img src={faq.screenshot} alt="Screenshot" className="faq-list-screenshot" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <UserManagement onBack={() => setActiveTab('general')} currentUser={currentUser} allUsers={allUsers} />
        )}
      </div>
    </div>
  );
}

export default Settings;
