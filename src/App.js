import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from 'react';
import './App.css';
import RecipeList from './components/RecipeList';
import RecipeFilterSidebar from './components/RecipeFilterSidebar';
import Header from './components/Header';
import Login from './components/Login';
import SplashScreen from './components/SplashScreen';
import MobileSearchOverlay from './components/MobileSearchOverlay';
import BottomNavigation from './components/BottomNavigation';
import {
  loginUser, 
  logoutUser, 
  registerUser,
  loginAsGuest,
  sendPasswordResetEmail,
  getUsers,
  onAuthStateChange,
  canEditMenu,
  canDeleteMenu,
  getRolePermissions,
  ROLE_PERMISSIONS_DEFAULT,
  saveFcmToken,
  updateUserProfile
} from './utils/userManagement';
import {
  requestNotificationPermission,
  setupForegroundMessageListener,
  notifyPrivateListMembers
} from './utils/pushNotifications';
import { 
  toggleFavorite,
  migrateGlobalFavorites
} from './utils/userFavorites';
import { toggleMenuFavorite } from './utils/menuFavorites';
import { getOnboardingTestmodeActive, shouldShowOnboardingOverlay } from './utils/onboardingSettings';
import { applyFaviconSettings } from './utils/faviconUtils';
import { applyTileSizePreference, applyDarkModePreference, getCustomLists, expandCuisineSelection, getInspirationListSettings } from './utils/customLists';
import { logRecipeCall } from './utils/recipeCallsFirestore';
import { deleteRecipeThumbnail } from './utils/storageUtils';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import { getSeasonMatrixOnce } from './utils/seasonMatrix';
import { hasHauptsaisonIngredient } from './utils/recipeSortIndex';
import { getAllCookDatesForUser } from './utils/recipeCookDates';
import {
  subscribeToRecipes,
  addRecipe as addRecipeToFirestore,
  updateRecipe as updateRecipeInFirestore,
  deleteRecipe as deleteRecipeFromFirestore,
  seedSampleRecipes,
  initializeRecipeCounts,
  enableRecipeSharing
} from './utils/recipeFirestore';
import {
  subscribeToMenus,
  addMenu as addMenuToFirestore,
  updateMenu as updateMenuInFirestore,
  deleteMenu as deleteMenuFromFirestore,
  updateMenuPortionCount
} from './utils/menuFirestore';
import {
  subscribeToGroups,
  addGroup as addGroupToFirestore,
  updateGroup as updateGroupInFirestore,
  deleteGroup as deleteGroupFromFirestore,
  ensurePublicGroup,
  addRecipeToGroup as addRecipeToGroupInFirestore,
  removeRecipeFromGroup as removeRecipeFromGroupInFirestore
} from './utils/groupFirestore';
import { NutritionReferenceProvider, useNutritionReference } from './contexts/NutritionReferenceContext';
import { RecipeImportQueueProvider, useRecipeImportQueue } from './contexts/RecipeImportQueueContext';
import { updateAppBadge } from './utils/appBadge';
import { resolveRecipeGroupContext, resolveImportGroupContext } from './utils/recipeGroupContext';

// Lazily loaded: everything below is a secondary view/overlay that isn't
// needed for the initial "recipes" screen. Splitting these out of the main
// bundle (which included tesseract.js via RecipeForm -> OcrScanModal) cuts
// the initial JS payload substantially, which matters most on slower mobile
// CPUs/networks (e.g. iPhone on cellular).
const RecipeDetail = lazy(() => import('./components/RecipeDetail'));
const RecipeForm = lazy(() => import('./components/RecipeForm'));
const Settings = lazy(() => import('./components/Settings'));
const MenuList = lazy(() => import('./components/MenuList'));
const MenuDetail = lazy(() => import('./components/MenuDetail'));
const MenuForm = lazy(() => import('./components/MenuForm'));
const Register = lazy(() => import('./components/Register'));
const PasswordChangeModal = lazy(() => import('./components/PasswordChangeModal'));
const Kueche = lazy(() => import('./components/Kueche'));
const SharePage = lazy(() => import('./components/SharePage'));
const MenuSharePage = lazy(() => import('./components/MenuSharePage'));
const GroupList = lazy(() => import('./components/GroupList'));
const GroupDetail = lazy(() => import('./components/GroupDetail'));
const AppCallsPage = lazy(() => import('./components/AppCallsPage'));
const MeineKuechenstarsPage = lazy(() => import('./components/MeineKuechenstarsPage'));
const EventsPage = lazy(() => import('./components/EventsPage'));
const Tagesmenu = lazy(() => import('./components/Tagesmenu'));
const UniversalImportModal = lazy(() => import('./components/UniversalImportModal'));
const Startseite = lazy(() => import('./components/Startseite'));
const AtelierOnboardingOverlay = lazy(() => import('./components/AtelierOnboardingOverlay'));
const AtelierSwipeTrainerOverlay = lazy(() => import('./components/AtelierSwipeTrainerOverlay'));
const AtelierTasteIntroOverlay = lazy(() => import('./components/AtelierTasteIntroOverlay'));
const AtelierCategorySelectionPage = lazy(() => import('./components/AtelierCategorySelectionPage'));

const ViewLoadingFallback = () => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>Laden...</div>
);

const PENDING_WEBIMPORT_URL_STORAGE_KEY = 'pendingWebimportUrl';
const PENDING_WEBIMPORT_AUTHOR_STORAGE_KEY = 'pendingWebimportAuthor';
const PENDING_EVENT_REMINDER_STORAGE_KEY = 'pendingEventReminderId';
const PENDING_REVIEW_IMPORT_STORAGE_KEY = 'pendingReviewImportFlag';
const ATELIER_ONBOARDING_KEY = 'atelierOnboardingSeen';
const BOTTOM_NAV_TABS = [
  { key: 'home', label: 'Küche', view: 'startseite' },
  { key: 'recipes', label: 'Kochbuch', view: 'recipes' },
  { key: 'menus', label: 'Festtafel', view: 'menus' },
  { key: 'atelier', label: 'Atelier', view: 'tagesmenu' },
  { key: 'chef', label: 'Chefkoch', view: 'kueche' },
];

// IndexedDB helpers to read/clear shared data written by the service worker
function readSharedDataFromDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('recipebook-settings', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.close();
        return resolve({ images: [], title: '', text: '', url: '' });
      }

      const tx = db.transaction(['settings'], 'readonly');
      const store = tx.objectStore('settings');
      // Try new unified key first
      const newReq = store.get('pendingSharedData');
      newReq.onsuccess = () => {
        if (newReq.result && typeof newReq.result === 'object') {
          db.close();
          return resolve({
            images: Array.isArray(newReq.result.images) ? newReq.result.images : [],
            title: newReq.result.title || '',
            text: newReq.result.text || '',
            url: newReq.result.url || '',
          });
        }
        // Fall back to legacy images-only key
        const legacyReq = store.get('pendingSharedImages');
        legacyReq.onsuccess = () => {
          db.close();
          resolve({
            images: Array.isArray(legacyReq.result) ? legacyReq.result : [],
            title: '',
            text: '',
            url: '',
          });
        };
        legacyReq.onerror = () => { db.close(); resolve({ images: [], title: '', text: '', url: '' }); };
      };
      newReq.onerror = () => { db.close(); resolve({ images: [], title: '', text: '', url: '' }); };
    };
    request.onerror = () => resolve({ images: [], title: '', text: '', url: '' });
  });
}

function clearSharedDataFromDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('recipebook-settings', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.close();
        return resolve();
      }
      const tx = db.transaction(['settings'], 'readwrite');
      const store = tx.objectStore('settings');
      store.delete('pendingSharedData');
      store.delete('pendingSharedImages');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    };
    request.onerror = () => resolve();
  });
}

// Helper function to check if a recipe matches the category filter
function matchesCategoryFilter(recipe, categoryFilter) {
  if (!categoryFilter) return true;
  
  // Handle both array and string formats for speisekategorie
  if (Array.isArray(recipe.speisekategorie)) {
    return recipe.speisekategorie.includes(categoryFilter);
  }
  return recipe.speisekategorie === categoryFilter;
}

// Helper function to check if a recipe matches the draft filter
function matchesDraftFilter(recipe, showDrafts) {
  if (showDrafts === 'all') return true;
  if (showDrafts === 'yes') return recipe.isPrivate === true;
  if (showDrafts === 'no') return !recipe.isPrivate;
  return true;
}

// Helper function to check if a recipe matches the cuisine (Kulinarik) filter.
// selectedCuisines may include parent group names which are expanded to their children.
function matchesCuisineFilter(recipe, selectedCuisines, cuisineGroups) {
  if (!selectedCuisines || selectedCuisines.length === 0) return true;
  const expanded = expandCuisineSelection(selectedCuisines, cuisineGroups || []);
  if (Array.isArray(recipe.kulinarik)) {
    return expanded.some(c => recipe.kulinarik.includes(c));
  }
  return expanded.includes(recipe.kulinarik);
}

// Helper function to check if a recipe matches the Speisekategorie filter
// selected via the Search Overlay's meal category pills.
function matchesMealCategoryFilter(recipe, selectedCategories) {
  if (!selectedCategories || selectedCategories.length === 0) return true;
  if (Array.isArray(recipe.speisekategorie)) {
    return selectedCategories.some(c => recipe.speisekategorie.includes(c));
  }
  return selectedCategories.includes(recipe.speisekategorie);
}

// Helper function to check if a recipe matches the author filter
function matchesAuthorFilter(recipe, selectedAuthors) {
  if (!selectedAuthors || selectedAuthors.length === 0) return true;
  return selectedAuthors.includes(recipe.authorId);
}

// Helper function to check if a recipe matches the private group filter
// Checks both the recipe's groupId and the group's recipeIds array (for cross-group assignments)
function matchesGroupFilter(recipe, selectedGroup, groups) {
  if (!selectedGroup) return true;
  if (recipe.groupId === selectedGroup) return true;
  const group = groups && groups.find(g => g.id === selectedGroup);
  return Array.isArray(group?.recipeIds) && group.recipeIds.includes(recipe.id);
}

// Helper function to check if a recipe belongs to any of the selected private lists
// (selected via the Search Overlay private list pills)
function matchesPrivateListsFilter(recipe, selectedPrivateLists, groups) {
  if (!selectedPrivateLists || selectedPrivateLists.length === 0) return true;
  return selectedPrivateLists.some((listId) => {
    if (recipe.groupId === listId) return true;
    const group = groups && groups.find(g => g.id === listId);
    return Array.isArray(group?.recipeIds) && group.recipeIds.includes(recipe.id);
  });
}

function AppNutritionRowsSync({ onRows }) {
  const { rows } = useNutritionReference();

  useEffect(() => {
    onRows(rows);
  }, [rows, onRows]);

  return null;
}

function AppReviewRecipesSync({ onReviewRecipes }) {
  const { reviewRecipes } = useRecipeImportQueue();

  useEffect(() => {
    onReviewRecipes(reviewRecipes);
  }, [reviewRecipes, onReviewRecipes]);

  return null;
}

function matchesSeasonalFilter(recipe, showSeasonalOnly, seasonMatrixEntries, nutritionReferenceRows) {
  if (!showSeasonalOnly) return true;
  return hasHauptsaisonIngredient(recipe, seasonMatrixEntries, undefined, nutritionReferenceRows);
}

function getAtelierMealCategories(interactiveLists, recipes) {
  const interactiveListIds = new Set(interactiveLists.map((list) => list.id));
  const interactiveListRecipeIds = new Set(
    interactiveLists.flatMap((list) => Array.isArray(list.recipeIds) ? list.recipeIds : [])
  );
  const categories = new Set();

  recipes.forEach((recipe) => {
    if (!interactiveListIds.has(recipe.groupId) && !interactiveListRecipeIds.has(recipe.id)) {
      return;
    }
    const rawCategories = Array.isArray(recipe?.speisekategorie)
      ? recipe.speisekategorie
      : recipe?.speisekategorie
        ? [recipe.speisekategorie]
        : [];

    rawCategories
      .map((category) => typeof category === 'string' ? category.trim() : '')
      .filter(Boolean)
      .forEach((category) => categories.add(category));
  });

  return Array.from(categories).sort((a, b) => a.localeCompare(b, 'de'));
}

const emptyPrivateListFilterHandler = () => {};

function applyRolePermissionsToUser(user, permissionsMap = {}) {
  if (!user) return user;
  const rolePerms = (permissionsMap && permissionsMap[user.role]) || {};
  return {
    ...user,
    settingsAccess: rolePerms.settingsAccess ?? false,
    fotoscan: rolePerms.fotoscan ?? false,
    webimport: rolePerms.webimport ?? false,
    appCalls: rolePerms.appCalls ?? false,
    appCallsMenu: rolePerms.appCallsMenu ?? false,
    recipeImport: rolePerms.recipeImport ?? false,
    deleteRating: rolePerms.deleteRating ?? false,
    sortCarousel: rolePerms.sortCarousel ?? false,
    tagesmenuTestmode: rolePerms.tagesmenuTestmode ?? false,
    themeToggle: rolePerms.themeToggle ?? false,
    printRecipe: rolePerms.printRecipe ?? true,
    recipeIndex: rolePerms.recipeIndex ?? ROLE_PERMISSIONS_DEFAULT[user.role]?.recipeIndex ?? false,
    startseite: rolePerms.startseite ?? false,
    kuecheFab: rolePerms.kuecheFab ?? false,
    onboardingTestmode: rolePerms.onboardingTestmode ?? false,
  };
}

/**
 * Determines the initial top-level view after authentication state is known
 * and role permissions have been applied to the user object.
 */
function getInitialViewForUser(user) {
  return user?.startseite ? 'startseite' : 'recipes';
}

function getBottomNavActiveKey(currentView) {
  if (currentView === 'startseite') return 'home';
  if (currentView === 'menus') return 'menus';
  if (currentView === 'tagesmenu' || currentView === 'atelierCategorySelection' || currentView === 'groups') return 'atelier';
  if (currentView === 'kueche' || currentView === 'appCalls' || currentView === 'meineKuechenstars') return 'chef';
  return 'recipes';
}

function getBottomNavBehavior(currentView) {
  if (currentView === 'atelierCategorySelection' || currentView === 'events') return 'hidden';
  return 'visible';
}

function App() {
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [pendingReviewRecipes, setPendingReviewRecipes] = useState([]);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState('recipes');
  const [groupsOpenedFromStartseite, setGroupsOpenedFromStartseite] = useState(false);
  const [menus, setMenus] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [pendingEventDetailRequest, setPendingEventDetailRequest] = useState(null);
  const [menuBeforeEventDetail, setMenuBeforeEventDetail] = useState(null);
  const [isMenuFormOpen, setIsMenuFormOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [isPrivateListSettingsTabOpen, setIsPrivateListSettingsTabOpen] = useState(false);
  const [publicGroupId, setPublicGroupId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  // Whether the Startseite's own carousels (Meine Kochideen, Im Trend) have
  // finished loading their data, reported back via onCarouselsLoadedChange.
  const [startseiteCarouselsLoaded, setStartseiteCarouselsLoaded] = useState(false);
  // Latches to true the first time everything the initial "startseite" view
  // needs (groups, recipes, its own carousels) has loaded, and never resets —
  // used to keep the splash screen up through that first load without
  // bringing it back on later visits to the start page.
  const [initialStartseiteReady, setInitialStartseiteReady] = useState(false);
  // Mirrors initialStartseiteReady but latches one animation frame later, so the
  // splash screen keeps rendering (with the --exiting class) for the duration of
  // its fade/scale-out transition instead of being unmounted mid-animation. See
  // SPLASH_EXIT_DURATION_MS below and splash-screen--exiting in SplashScreen.css.
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [headerVisible, setHeaderVisible] = useState(true);
  const headerRef = useRef(null);
  const [kuecheOpenPersonalData, setKuecheOpenPersonalData] = useState(false);
  const [appCallsActiveTab, setAppCallsActiveTab] = useState('app');
  const [appCallsVisibleTabs, setAppCallsVisibleTabs] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showSeasonalOnly, setShowSeasonalOnly] = useState(false);
  const [cuisineGroups, setCuisineGroups] = useState([]);
  const [cuisineTypes, setCuisineTypes] = useState([]);
  const [mealCategories, setMealCategories] = useState([]);
  const [seasonMatrixEntries, setSeasonMatrixEntries] = useState([]);
  const [nutritionReferenceRows, setNutritionReferenceRows] = useState([]);
  const [cookDatesMap, setCookDatesMap] = useState(new Map());
  const [recipeFilters, setRecipeFilters] = useState({
    showDrafts: 'all',
    selectedCuisines: [],
    selectedCategories: [],
    selectedAuthors: [],
    selectedPrivateLists: [],
    selectedGroup: ''
  });
  const recipeCountsInitialized = useRef(false);
  const recipeListScrollPositionRef = useRef(0);
  const shouldRestoreRecipeListScrollRef = useRef(false);
  // Ids of temp-review recipes whose confirm/discard has already been kicked
  // off locally but may not have round-tripped through the Firestore
  // listener yet, so they can still briefly linger in pendingReviewRecipes —
  // see the auto-review effect below.
  const handledTempReviewIdsRef = useRef(new Set());
  // Tracks whether the previous render was already sitting idle on the
  // recipe overview (no form/detail/menu/settings open) — see the auto-review
  // effect below, which only acts on the transition into that state.
  const wasIdleRecipesOverviewRef = useRef(false);
  const [sharedData, setSharedData] = useState({ images: [], title: '', text: '', url: '' });
  const [showUniversalImport, setShowUniversalImport] = useState(false);
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true);
  const [webimportDeeplink, setWebimportDeeplink] = useState('');
  const [webimportAuthorId, setWebimportAuthorId] = useState('');
  const [isKuechePersonalDataOpen, setIsKuechePersonalDataOpen] = useState(false);
  const [showAtelierOnboarding, setShowAtelierOnboarding] = useState(false);
  const [showAtelierSwipeTrainer, setShowAtelierSwipeTrainer] = useState(false);
  const [showAtelierTasteIntro, setShowAtelierTasteIntro] = useState(false);
  const [atelierSelectedCategories, setAtelierSelectedCategories] = useState([]);
  const [onboardingTestmodeActive, setOnboardingTestmodeActive] = useState(false);
  // Capture the webimportAuthor URL param synchronously on mount (alongside pendingWebimportUrl)
  const initialWebimportAuthorRef = useRef('');
  // Store pending webimport URL read synchronously on mount, before Firebase loads the user
  const [pendingWebimportUrl, setPendingWebimportUrl] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let webimportUrl = urlParams.get('webimport');
    let webimportAuthor = urlParams.get('webimportAuthor') || '';
    if (webimportUrl) {
      initialWebimportAuthorRef.current = webimportAuthor;
      try {
        sessionStorage.setItem(PENDING_WEBIMPORT_URL_STORAGE_KEY, webimportUrl);
        if (webimportAuthor) {
          sessionStorage.setItem(PENDING_WEBIMPORT_AUTHOR_STORAGE_KEY, webimportAuthor);
        } else {
          sessionStorage.removeItem(PENDING_WEBIMPORT_AUTHOR_STORAGE_KEY);
        }
      } catch {
        // Ignore storage errors (e.g. restricted environments)
      }
      // Clean the URL immediately so it doesn't persist in browser history
      urlParams.delete('webimport');
      urlParams.delete('webimportAuthor');
      const remainingSearch = urlParams.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (remainingSearch ? '?' + remainingSearch : '') + window.location.hash
      );
      return webimportUrl;
    }
    try {
      webimportUrl = sessionStorage.getItem(PENDING_WEBIMPORT_URL_STORAGE_KEY);
      webimportAuthor = sessionStorage.getItem(PENDING_WEBIMPORT_AUTHOR_STORAGE_KEY) || '';
    } catch {
      webimportUrl = null;
      webimportAuthor = '';
    }
    if (webimportUrl) {
      initialWebimportAuthorRef.current = webimportAuthor;
      return webimportUrl;
    }
    return null;
  });

  // Store a pending event-reminder deep link (from a consumption-reminder push
  // notification tap) read synchronously on mount, before Firebase loads the user.
  const [pendingEventReminderId, setPendingEventReminderId] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const eventReminderId = urlParams.get('eventReminder');
    if (eventReminderId) {
      try {
        sessionStorage.setItem(PENDING_EVENT_REMINDER_STORAGE_KEY, eventReminderId);
      } catch {
        // Ignore storage errors (e.g. restricted environments)
      }
      urlParams.delete('eventReminder');
      const remainingSearch = urlParams.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (remainingSearch ? '?' + remainingSearch : '') + window.location.hash
      );
      return eventReminderId;
    }
    try {
      return sessionStorage.getItem(PENDING_EVENT_REMINDER_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Store a pending "reviewImport" deep link (from a background-import-ready
  // push notification tap, see public/firebase-messaging-sw.js) read
  // synchronously on mount, before Firebase loads the user.
  const [pendingReviewImport, setPendingReviewImport] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reviewImportFlag = urlParams.get('reviewImport');
    if (reviewImportFlag) {
      try {
        sessionStorage.setItem(PENDING_REVIEW_IMPORT_STORAGE_KEY, reviewImportFlag);
      } catch {
        // Ignore storage errors (e.g. restricted environments)
      }
      urlParams.delete('reviewImport');
      const remainingSearch = urlParams.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (remainingSearch ? '?' + remainingSearch : '') + window.location.hash
      );
      return reviewImportFlag;
    }
    try {
      return sessionStorage.getItem(PENDING_REVIEW_IMPORT_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // IDs of groups the current user belongs to – used to filter group-scoped recipes
  const userGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);

  // Private lists the current user can manage recipes in
  const privateListsForUser = useMemo(() => groups.filter(
    g => g.type === 'private' && (g.ownerId === currentUser?.id || (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id)))
  ), [groups, currentUser?.id]);

  // Name of the currently selected private list filter (if any).
  // Falls back to the single selectedPrivateList from the search overlay when no group filter is set.
  const activePrivateListName = useMemo(() => {
    if (recipeFilters.selectedGroup) {
      return groups.find(g => g.id === recipeFilters.selectedGroup)?.name;
    }
    if (recipeFilters.selectedPrivateLists.length === 1) {
      return groups.find(g => g.id === recipeFilters.selectedPrivateLists[0])?.name;
    }
    return undefined;
  }, [groups, recipeFilters.selectedGroup, recipeFilters.selectedPrivateLists]);

  const bottomNavActiveKey = useMemo(() => getBottomNavActiveKey(currentView), [currentView]);
  const bottomNavBehavior = useMemo(() => getBottomNavBehavior(currentView), [currentView]);
  const showBottomNav = Boolean(currentUser?.startseite)
    && !isFormOpen
    && !isMenuFormOpen
    && !isPrivateListSettingsTabOpen
    && !selectedRecipe
    && !selectedMenu
    && !isKuechePersonalDataOpen;
  const bottomNavTabs = useMemo(
    () => BOTTOM_NAV_TABS.filter((tab) => tab.view !== 'startseite' || currentUser?.startseite),
    [currentUser?.startseite]
  );
  const bottomNavBadgeCounts = useMemo(
    () => ({ recipes: pendingReviewRecipes.length }),
    [pendingReviewRecipes.length]
  );

  // Mirrors the pending-review-imports count onto the installed app's home
  // screen/taskbar icon via the Badging API, so it's visible even when the
  // app isn't open (see AppReviewRecipesSync above for how pendingReviewRecipes
  // is populated from the import queue).
  useEffect(() => {
    updateAppBadge(pendingReviewRecipes.length);
  }, [pendingReviewRecipes.length]);
  const appBottomNavStyle = useMemo(() => ({
    '--bottom-nav-offset': showBottomNav && isBottomNavVisible ? 'var(--bottom-nav-height)' : '0px',
    '--bottom-spacing': showBottomNav && isBottomNavVisible ? 'calc(var(--bottom-nav-height) + 16px)' : '0px',
  }), [showBottomNav, isBottomNavVisible]);

  // Recipes belonging to the currently selected group before cuisine/author/list filters
  const selectedGroupUnfilteredRecipes = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.type === 'public') {
      // Public group shows recipes explicitly assigned to it, recipes with no group,
      // or recipes that have been published to the public list
      return recipes.filter((r) => r.groupId === selectedGroup.id || !r.groupId || r.publishedToPublic);
    }

    const groupRecipeIds = Array.isArray(selectedGroup.recipeIds) ? selectedGroup.recipeIds : [];
    const groupFilteredRecipes = recipes.filter((r) => r.groupId === selectedGroup.id || groupRecipeIds.includes(r.id));

    return groupFilteredRecipes.filter((recipe) =>
      matchesDraftFilter(recipe, recipeFilters.showDrafts)
    );
  }, [recipes, selectedGroup, recipeFilters.showDrafts]);

  // Recipes belonging to the currently selected group
  const selectedGroupRecipes = useMemo(() => {
    if (!selectedGroup) return [];

    return selectedGroupUnfilteredRecipes.filter((recipe) =>
      matchesCuisineFilter(recipe, recipeFilters.selectedCuisines, cuisineGroups) &&
      matchesMealCategoryFilter(recipe, recipeFilters.selectedCategories) &&
      matchesAuthorFilter(recipe, recipeFilters.selectedAuthors) &&
      matchesSeasonalFilter(recipe, showSeasonalOnly, seasonMatrixEntries, nutritionReferenceRows) &&
      (
        selectedGroup.type === 'private' ||
        matchesPrivateListsFilter(recipe, recipeFilters.selectedPrivateLists, groups)
      )
    );
  }, [selectedGroupUnfilteredRecipes, selectedGroup, recipeFilters.selectedCuisines, recipeFilters.selectedCategories, recipeFilters.selectedAuthors, recipeFilters.selectedPrivateLists, cuisineGroups, groups, showSeasonalOnly, seasonMatrixEntries, nutritionReferenceRows]);

  // Detect share URL: #share/:shareId or /share/:shareId (pathname)
  const getShareIdFromHash = () => {
    const hash = window.location.hash;
    const hashMatch = hash.match(/^#share\/(.+)$/);
    if (hashMatch) return hashMatch[1];
    const pathMatch = window.location.pathname.match(/^\/share\/(.+)$/);
    return pathMatch ? pathMatch[1] : null;
  };

  const [sharePageId, setSharePageId] = useState(() => getShareIdFromHash());

  // Detect menu share URL: #menu-share/:shareId or /menu-share/:shareId (pathname)
  const getMenuShareIdFromHash = () => {
    const hash = window.location.hash;
    const hashMatch = hash.match(/^#menu-share\/(.+)$/);
    if (hashMatch) return hashMatch[1];
    const pathMatch = window.location.pathname.match(/^\/menu-share\/(.+)$/);
    return pathMatch ? pathMatch[1] : null;
  };

  const [menuSharePageId, setMenuSharePageId] = useState(() => getMenuShareIdFromHash());

  useEffect(() => {
    const handleHashChange = () => {
      setSharePageId(getShareIdFromHash());
      setMenuSharePageId(getMenuShareIdFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Set up Firebase auth state observer
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChange((user) => {
      const applyAuthState = async () => {
        if (cancelled) return;

        if (!user) {
          setCurrentUser(null);
          setCurrentView(getInitialViewForUser(null));
          setAuthLoading(false);
          return;
        }

        let effectiveUser = user;
        try {
          const permissionsMap = await getRolePermissions();
          if (cancelled) return;
          effectiveUser = applyRolePermissionsToUser(user, permissionsMap);
        } catch (error) {
          console.error('Error loading role permissions during auth initialization:', error);
        }

        if (cancelled) return;
        setCurrentUser(effectiveUser);
        setCurrentView(getInitialViewForUser(effectiveUser));
        if (effectiveUser.requiresPasswordChange) {
          setRequiresPasswordChange(true);
        }
        setAuthView('login');
        setAuthLoading(false);
      };

      applyAuthState();
    });
    
    // Cleanup subscription on unmount
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Load all users when current user is authenticated (for admin features)
  useEffect(() => {
    if (currentUser) {
      const loadUsers = async () => {
        const users = await getUsers();
        setAllUsers(users);
      };
      loadUsers();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) {
      setSeasonMatrixEntries([]);
      return undefined;
    }
    let cancelled = false;
    getSeasonMatrixOnce().then((entries) => {
      if (!cancelled) setSeasonMatrixEntries(entries);
    }).catch(() => {
      if (!cancelled) setSeasonMatrixEntries([]);
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Load all cook dates for the current user once on login
  useEffect(() => {
    if (!currentUser?.id) {
      setCookDatesMap(new Map());
      return;
    }
    let cancelled = false;
    getAllCookDatesForUser(currentUser.id).then((map) => {
      if (!cancelled) setCookDatesMap(map);
    }).catch(() => {
      if (!cancelled) setCookDatesMap(new Map());
    });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Load role permissions and apply effective fotoscan/webimport to currentUser
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    const applyRolePermissions = async () => {
      const perms = await getRolePermissions();
      if (cancelled) return;
      setCurrentUser(prev => {
        if (!prev || prev.id !== currentUser.id) return prev;
        return applyRolePermissionsToUser(prev, perms);
      });
    };
    applyRolePermissions();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    let cancelled = false;
    const loadOnboardingSettings = async () => {
      const active = await getOnboardingTestmodeActive();
      if (!cancelled) setOnboardingTestmodeActive(active);
    };
    loadOnboardingSettings();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  // Apply favicon settings on mount
  useEffect(() => {
    if (!currentUser) return;
    const loadFavicon = async () => {
      await applyFaviconSettings();
    };
    loadFavicon();
  }, [currentUser]);

  // Initialise push notification permission and register FCM token for the
  // current user.  Runs once when a real (non-guest) user logs in.
  useEffect(() => {
    if (!currentUser?.id || currentUser.isGuest) return;
    let foregroundUnsubscribe = () => {};
    const initPush = async () => {
      try {
        const token = await requestNotificationPermission();
        if (token) {
          await saveFcmToken(currentUser.id, token);
        }
        foregroundUnsubscribe = setupForegroundMessageListener();
      } catch (err) {
        // Push notifications are optional – never break the main app
        console.warn('pushNotifications: init failed', err);
      }
    };
    initPush();
    return () => foregroundUnsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Apply tile size preference on mount
  useEffect(() => {
    applyTileSizePreference();
  }, []);

  // Apply dark mode preference on mount
  useEffect(() => {
    applyDarkModePreference();
  }, []);

  // Load cuisine groups for hierarchical filter expansion
  useEffect(() => {
    getCustomLists().then(lists => {
      setCuisineGroups(lists.cuisineGroups || []);
      setCuisineTypes(lists.cuisineTypes || []);
      setMealCategories(lists.mealCategories || []);
    }).catch(() => {
      setCuisineGroups([]);
      setCuisineTypes([]);
      setMealCategories([]);
    });
  }, []);

  // Detect Web Share Target: read shared data from IndexedDB when URL param is present
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('share-target')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      readSharedDataFromDB().then((data) => {
        const hasContent = data.images.length > 0 || data.title || data.text || data.url;
        if (hasContent) {
          setSharedData(data);
        }
      });
    }
  }, []);

  // Show Universal Import Modal once user is authenticated and shared data is available
  useEffect(() => {
    const hasContent = sharedData.images.length > 0 || sharedData.title || sharedData.text || sharedData.url;
    if (currentUser && hasContent) {
      setShowUniversalImport(true);
    }
  }, [currentUser, sharedData]);

  // Once currentUser is loaded, process pending webimport URL
  useEffect(() => {
    if (!pendingWebimportUrl) return;
    if (!currentUser) return; // wait for login

    if (currentUser.webimport) {
      // User has webimport permission: open form with WebImport modal
      setWebimportDeeplink(pendingWebimportUrl);
    }
    if (initialWebimportAuthorRef.current) {
      setWebimportAuthorId(initialWebimportAuthorRef.current);
      initialWebimportAuthorRef.current = '';
    }
    // Always open the form (webimport URL is shown in modal if permission exists)
    try {
      sessionStorage.removeItem(PENDING_WEBIMPORT_URL_STORAGE_KEY);
      sessionStorage.removeItem(PENDING_WEBIMPORT_AUTHOR_STORAGE_KEY);
    } catch {
      // Ignore storage errors (e.g. restricted environments)
    }
    setPendingWebimportUrl(null); // consume it so it doesn't trigger again
    setEditingRecipe(null);
    setSelectedRecipe(null);
    setIsCreatingVersion(false);
    setIsFormOpen(true);
  }, [currentUser, pendingWebimportUrl]);

  // Once currentUser is loaded, jump to the Events view so the pending
  // event-reminder ID (read on mount) can be resolved to the consumption form.
  useEffect(() => {
    if (!pendingEventReminderId) return;
    if (!currentUser) return; // wait for login
    setCurrentView('events');
  }, [currentUser, pendingEventReminderId]);

  // Once currentUser and the pending-review queue are loaded, jump straight
  // to the recipe review triggered by tapping a background-import-ready push
  // notification (see public/firebase-messaging-sw.js).
  useEffect(() => {
    if (!pendingReviewImport) return;
    if (!currentUser) return; // wait for login
    if (pendingReviewRecipes.length === 0) return; // wait for the queue to load
    handleNavigateToRecipesOverview();
    setPendingReviewImport(null);
    try {
      sessionStorage.removeItem(PENDING_REVIEW_IMPORT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, pendingReviewImport, pendingReviewRecipes]);

  // Ensure the system-wide public group exists and store its ID
  useEffect(() => {
    if (!currentUser) return;
    ensurePublicGroup().then((id) => setPublicGroupId(id)).catch((err) => {
      console.error('Error ensuring public group:', err);
    });
  }, [currentUser]);

  // Set up real-time listener for recipes from Firestore.
  // Re-subscribes when userGroupIds changes so group-scoped recipe visibility stays current.
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToRecipes(
      currentUser.id,
      currentUser.isAdmin || false,
      (recipesFromFirestore) => {
        setRecipes(recipesFromFirestore);
        setRecipesLoaded(true);
        
        // Seed sample recipes if collection is empty (only for first user)
        if (recipesFromFirestore.length === 0 && currentUser) {
          seedSampleRecipes(currentUser.id);
        }
      },
      userGroupIds
    );

    return () => unsubscribe();
  }, [currentUser, userGroupIds]);

  // Migrate old global favorites to user-specific favorites (one-time migration)
  useEffect(() => {
    if (currentUser && recipesLoaded && recipes.length > 0) {
      migrateGlobalFavorites(currentUser.id, recipes);
    }
  }, [currentUser, recipesLoaded, recipes]);

  // Keep selectedRecipe in sync with Firestore updates (e.g. background nutrition calculation)
  // selectedRecipe is intentionally omitted from deps to avoid infinite loops:
  // the effect reads selectedRecipe only to compare IDs and is driven by recipes changes.
  useEffect(() => {
    if (selectedRecipe) {
      const updated = recipes.find(r => r.id === selectedRecipe.id);
      if (updated) {
        setSelectedRecipe(updated);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipes]);

  // Initialize recipe counts for all users once after recipes are loaded
  useEffect(() => {
    if (currentUser && recipesLoaded && !recipeCountsInitialized.current) {
      recipeCountsInitialized.current = true;
      initializeRecipeCounts().catch((err) => {
        console.error('Error initializing recipe counts:', err);
        recipeCountsInitialized.current = false;
      });
    }
  }, [currentUser, recipesLoaded]);

  // Set up real-time listener for menus from Firestore
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToMenus(
      currentUser.id,
      currentUser.role === 'admin',
      (menusFromFirestore) => {
        setMenus(menusFromFirestore);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Set up real-time listener for groups from Firestore
  useEffect(() => {
    setGroupsLoading(true);
    if (!currentUser) return;

    const unsubscribe = subscribeToGroups(currentUser.id, (groupsFromFirestore) => {
      setGroups(groupsFromFirestore);
      setGroupsLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleStartseiteCarouselsLoadedChange = useCallback((ready) => {
    setStartseiteCarouselsLoaded(ready);
  }, []);

  // Latch initialStartseiteReady once, the first time everything the initial
  // "startseite" landing view needs has finished loading. Users who don't
  // land on the start page (currentUser.startseite is off), and cases where
  // something else (a deep link into the recipe form, an event reminder,
  // settings, ...) takes over before Startseite ever finishes loading, latch
  // it immediately instead — there's nothing left to wait for in that case.
  useEffect(() => {
    if (initialStartseiteReady || !currentUser) return;
    const startseiteVisible = currentView === 'startseite'
      && !isSettingsOpen && !selectedRecipe && !isFormOpen && !selectedMenu && !isMenuFormOpen;
    if (!currentUser.startseite || !startseiteVisible) {
      setInitialStartseiteReady(true);
      return;
    }
    if (!groupsLoading && recipesLoaded && startseiteCarouselsLoaded) {
      setInitialStartseiteReady(true);
    }
  }, [
    currentUser, currentView, isSettingsOpen, selectedRecipe, isFormOpen, selectedMenu, isMenuFormOpen,
    groupsLoading, recipesLoaded, startseiteCarouselsLoaded, initialStartseiteReady,
  ]);

  // Keep the splash screen mounted just long enough to play its exit
  // transition (fade + slight scale-out) once initialStartseiteReady latches,
  // instead of cutting it away instantly. Duration matches the CSS transition
  // on .splash-screen in SplashScreen.css.
  useEffect(() => {
    if (!initialStartseiteReady || splashDismissed) return undefined;
    const SPLASH_EXIT_DURATION_MS = 380;
    const timer = setTimeout(() => setSplashDismissed(true), SPLASH_EXIT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [initialStartseiteReady, splashDismissed]);

  const handleSelectRecipe = (recipe) => {
    // Save scroll position when opening a recipe from the recipe list (not from a menu)
    if (!selectedMenu) {
      recipeListScrollPositionRef.current = window.scrollY;
      shouldRestoreRecipeListScrollRef.current = true;
    }
    setSelectedRecipe(recipe);
    if (recipe && currentUser) {
      logRecipeCall(currentUser, recipe);
    }
  };

  const handleBackFromRecipeDetail = () => {
    // Clear selected recipe to go back to either MenuDetail or RecipeList
    setSelectedRecipe(null);
    // selectedMenu state is preserved, so if it's set, we'll return to MenuDetail
  };

  // Restore recipe list scroll position after returning from recipe detail.
  // Skip restoration when isFormOpen is true: this happens when handleEditRecipe
  // calls setSelectedRecipe(null) while simultaneously opening the form, and we
  // must not clear the saved position in that case so it can still be restored
  // once the user fully returns to the recipe list.
  useEffect(() => {
    if (!selectedRecipe && !isFormOpen && shouldRestoreRecipeListScrollRef.current) {
      shouldRestoreRecipeListScrollRef.current = false;
      const savedPosition = recipeListScrollPositionRef.current;
      // Double rAF ensures the RecipeList has fully re-rendered before
      // the scroll position is restored (one frame for React to commit the
      // DOM, a second for the browser to apply layout).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, savedPosition);
        });
      });
    }
  }, [selectedRecipe, isFormOpen]);

  const handleAddRecipe = (groupId = null) => {
    setActiveGroupId(groupId);
    setEditingRecipe(null);
    setIsCreatingVersion(false);
    setIsFormOpen(true);
  };

  const handleEditRecipe = (recipe) => {
    setActiveGroupId(null);
    setEditingRecipe(recipe);
    setIsCreatingVersion(false);
    setIsFormOpen(true);
    setSelectedRecipe(null);
    // Always start the edit form at the top of the page, regardless of the
    // previous scroll position in the recipe list or recipe detail view.
    window.scrollTo(0, 0);
  };

  const handleReviewTempRecipe = (tempRecipe) => {
    // Load a pending background import into the form for full review;
    // handleSaveRecipe/handleCancelForm branch on editingRecipe.isTemp to
    // confirm (clear the flag) or discard (delete the document) it.
    setActiveGroupId(null);
    setEditingRecipe(tempRecipe);
    setIsCreatingVersion(false);
    setIsFormOpen(true);
  };

  // Whenever the recipe overview is showing (no form/detail/menu/settings open)
  // and finished background imports are waiting for review, load them into the
  // "Neues Rezept hinzufügen" form one after another — the effect re-fires once
  // handleSaveRecipe/handleCancelForm close the form again, picking up the next
  // pending recipe until none are left.
  useEffect(() => {
    const handledIds = handledTempReviewIdsRef.current;
    // Confirming/discarding a temp review closes the form (isFormOpen: false)
    // before the Firestore listener has necessarily caught up, so the just-
    // handled recipe can still be sitting in pendingReviewRecipes for one more
    // render. Skip ids we already told Firestore to confirm/delete, and drop
    // them from the tracking set once the listener catches up and removes
    // them for real, so it doesn't grow unbounded.
    for (const id of handledIds) {
      if (!pendingReviewRecipes.some((r) => r.id === id)) {
        handledIds.delete(id);
      }
    }

    const isIdleRecipesOverview =
      currentView === 'recipes' &&
      !isFormOpen &&
      !selectedRecipe &&
      !selectedMenu &&
      !isSettingsOpen;

    // Only act on the transition into the idle overview (navigating in, or
    // closing the form/detail/menu/settings), not merely on pendingReviewRecipes
    // changing while the user is already sitting there — otherwise a background
    // import finishing mid-browse would yank them into the add-recipe form.
    // The next time they actually (re-)enter the overview, this fires again
    // and picks up whatever is pending then.
    if (isIdleRecipesOverview && !wasIdleRecipesOverviewRef.current) {
      const nextPending = pendingReviewRecipes.find((r) => !handledIds.has(r.id));
      if (nextPending) {
        handleReviewTempRecipe(nextPending);
      }
    }
    wasIdleRecipesOverviewRef.current = isIdleRecipesOverview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, isFormOpen, selectedRecipe, selectedMenu, isSettingsOpen, pendingReviewRecipes]);

  const handleCreateVersion = (recipe) => {
    setEditingRecipe(recipe);
    setIsCreatingVersion(true);
    setIsFormOpen(true);
    setSelectedRecipe(null);
    // Start the new-version form at the top of the page.
    window.scrollTo(0, 0);
  };

  const handleSaveRecipe = async (recipe) => {
    if (!currentUser) return;

    try {
      if (editingRecipe && editingRecipe.id !== undefined && !isCreatingVersion) {
        // Update existing recipe (direct edit) — also covers confirming a
        // pending background import (isTemp), which just clears the flag.
        const wasTempReview = Boolean(editingRecipe.isTemp);
        if (wasTempReview) {
          handledTempReviewIdsRef.current.add(editingRecipe.id);
        }
        const { id, selectedGroupId, ...updates } = recipe;

        // Automatically clear WhatsApp thumbnail when the default image changes,
        // so it gets regenerated from the new default image on the next share.
        const shouldClearThumbnail = Boolean(updates.image) && updates.image !== editingRecipe.image && Boolean(editingRecipe.imageThumbnail);
        if (shouldClearThumbnail) {
          await deleteRecipeThumbnail(editingRecipe.imageThumbnail);
        }

        // Confirming a pending background import used to go through the "Add
        // new recipe" branch below (it had no id yet), which is where group
        // assignment and the share link were applied. Now that the temp doc
        // already carries an id, this branch runs instead — so re-apply the
        // same group resolution and auto-share here for a confirmed import.
        let importGroupType;
        let importGroupId;
        const importGroupUpdates = {};
        if (wasTempReview) {
          const resolved = resolveRecipeGroupContext({
            selectedGroupId, activeGroupId, groups, publicGroupId, isCreatingVersion: false,
          });
          importGroupId = resolved.groupId;
          importGroupType = resolved.groupType;
          if (importGroupId) {
            importGroupUpdates.groupId = importGroupId;
            importGroupUpdates.groupType = importGroupType;
            if (resolved.autoPublish) {
              importGroupUpdates.publishedToPublic = true;
            }
          }
        }

        await updateRecipeInFirestore(
          id,
          {
            ...updates,
            ...importGroupUpdates,
            ...(shouldClearThumbnail ? { imageThumbnail: deleteField() } : {}),
            ...(editingRecipe.isTemp ? { isTemp: deleteField() } : {}),
          },
          editingRecipe.authorId
        );

        if (wasTempReview) {
          // Auto-share a confirmed import to generate the share link immediately,
          // mirroring "Add new recipe" — imports never go through the manual
          // sharing toggle.
          try {
            await enableRecipeSharing(id);
          } catch (shareError) {
            console.error('Error generating share link:', shareError);
          }
          if (importGroupType === 'private' && importGroupId) {
            notifyPrivateListMembers(importGroupId, id, currentUser.id, 'created');
          }
        } else {
          // Build local state: exclude Firestore sentinels so they don't end up in React state
          const nextSelectedRecipe = { ...editingRecipe, ...updates };
          if (shouldClearThumbnail) {
            delete nextSelectedRecipe.imageThumbnail;
          }
          delete nextSelectedRecipe.isTemp;
          // Navigate back to the recipe detail view after a successful update
          setSelectedRecipe(nextSelectedRecipe);
        }
        // Confirming a pending background import instead returns to the recipe
        // overview, so the next queued import (if any) loads straight into the
        // form — see the auto-review effect above.
      } else {
        // Add new recipe or new version; attach groupId if created from within a group,
        // otherwise fall back to the public group (from state or from the groups subscription)
        const { selectedGroupId, ...recipeWithoutMeta } = recipe;
        const { groupId: safeGroupId, groupType, autoPublish } = resolveRecipeGroupContext({
          selectedGroupId, activeGroupId, groups, publicGroupId, isCreatingVersion,
        });
        const recipeWithGroup = safeGroupId
          ? { ...recipeWithoutMeta, groupId: safeGroupId, groupType, ...(autoPublish ? { publishedToPublic: true } : {}) }
          : recipeWithoutMeta;
        const savedRecipe = await addRecipeToFirestore(recipeWithGroup, currentUser.id);

        // Auto-share the new recipe to generate the share link immediately
        let savedRecipeWithShare = savedRecipe;
        if (savedRecipe && savedRecipe.id) {
          try {
            const shareId = await enableRecipeSharing(savedRecipe.id);
            savedRecipeWithShare = { ...savedRecipe, shareId };
          } catch (shareError) {
            console.error('Error generating share link:', shareError);
          }
        }

        // Notify other members when the recipe was created directly in a private list
        if (savedRecipe?.id && groupType === 'private' && safeGroupId) {
          notifyPrivateListMembers(safeGroupId, savedRecipe.id, currentUser.id, 'created');
        }

        setSelectedRecipe(savedRecipeWithShare);
      }
      setIsFormOpen(false);
      setEditingRecipe(null);
      setIsCreatingVersion(false);
      setActiveGroupId(null);
      setWebimportDeeplink('');
    } catch (error) {
      console.error('Error saving recipe:', error);
      alert('Fehler beim Speichern des Rezepts. Bitte versuchen Sie es erneut.');
    }
  };

  const handleBulkImportRecipes = async (recipes) => {
    if (!currentUser) return;

    try {
      let successCount = 0;
      const errors = [];

      for (const recipe of recipes) {
        try {
          await addRecipeToFirestore(recipe, currentUser.id);
          successCount++;
        } catch (error) {
          console.error('Error importing recipe:', recipe.title, error);
          errors.push({ title: recipe.title, error: error.message });
        }
      }

      setIsFormOpen(false);
      setEditingRecipe(null);
      setIsCreatingVersion(false);

      // Show success message with details
      if (errors.length === 0) {
        alert(`✓ ${successCount} Rezept(e) erfolgreich importiert!`);
      } else {
        const failedRecipes = errors.map(e => `- ${e.title}: ${e.error}`).join('\n');
        alert(
          `Import abgeschlossen:\n\n` +
          `✓ ${successCount} Rezept(e) erfolgreich importiert\n` +
          `✗ ${errors.length} fehlgeschlagen:\n\n${failedRecipes}`
        );
      }
    } catch (error) {
      console.error('Error bulk importing recipes:', error);
      alert('Fehler beim Importieren der Rezepte. Bitte versuchen Sie es erneut.');
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (!currentUser) return;

    try {
      await deleteRecipeFromFirestore(recipeId);
      setSelectedRecipe(null);
    } catch (error) {
      console.error('Error deleting recipe:', error);
      alert('Fehler beim Löschen des Rezepts. Bitte versuchen Sie es erneut.');
    }
  };

  const handlePublishRecipe = async (recipeId) => {
    if (!currentUser) return;

    try {
      await updateRecipeInFirestore(recipeId, { publishedToPublic: true, publishedAt: serverTimestamp() });
      if (selectedRecipe && selectedRecipe.id === recipeId) {
        setSelectedRecipe({ ...selectedRecipe, publishedToPublic: true });
      }
    } catch (error) {
      console.error('Error publishing recipe:', error);
      alert('Fehler beim Veröffentlichen des Rezepts. Bitte versuchen Sie es erneut.');
    }
  };

  const handleCancelForm = () => {
    if (editingRecipe?.isTemp) {
      // Discarding a pending background import deletes the recipe document
      // entirely (it only ever existed as a TEMP draft), so confirm first —
      // same rule as deleting any other recipe with content.
      if (!window.confirm(`Möchten Sie den Import "${editingRecipe.title || 'Unbenanntes Rezept'}" wirklich verwerfen?`)) {
        return;
      }
      handledTempReviewIdsRef.current.add(editingRecipe.id);
      deleteRecipeFromFirestore(editingRecipe.id).catch((error) => {
        console.error('Error discarding temp recipe:', error);
      });
    }
    setIsFormOpen(false);
    if (!editingRecipe?.isTemp && editingRecipe && editingRecipe.id !== undefined && !isCreatingVersion) {
      // Return to recipe detail view when canceling an edit of an existing recipe
      const recipe = recipes.find(r => r.id === editingRecipe.id) || editingRecipe;
      setSelectedRecipe(recipe);
    }
    setEditingRecipe(null);
    setIsCreatingVersion(false);
    setActiveGroupId(null);
    setWebimportDeeplink('');
    setWebimportAuthorId('');
  };

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
    setSelectedRecipe(null);
    setIsFormOpen(false);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  const handleToggleFavorite = async (recipeId) => {
    if (!currentUser) return;
    
    try {
      // Toggle in user-specific favorites storage in Firestore
      await toggleFavorite(currentUser.id, recipeId);
      
      // Trigger a re-render by updating state
      setRecipes([...recipes]);
      
      // Update selectedRecipe to trigger re-render if it's the one being toggled
      if (selectedRecipe && selectedRecipe.id === recipeId) {
        setSelectedRecipe({ ...selectedRecipe });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleViewChange = (view, options = {}) => {
    if (view === 'appCalls') {
      setAppCallsVisibleTabs(Array.isArray(options.visibleTabs) ? options.visibleTabs : null);
      setAppCallsActiveTab(options.activeTab || 'app');
    } else if (currentView === 'appCalls') {
      setAppCallsVisibleTabs(null);
      setAppCallsActiveTab('app');
    }
    if (view === 'groups') {
      setGroupsOpenedFromStartseite(currentView === 'startseite');
    } else {
      setGroupsOpenedFromStartseite(false);
    }
    setCurrentView(view);
    setSelectedRecipe(null);
    setSelectedMenu(null);
    setSelectedGroup(null);
    setIsFormOpen(false);
    setIsMenuFormOpen(false);
    setIsSettingsOpen(false);
    setIsPrivateListSettingsTabOpen(false);
    setIsKuechePersonalDataOpen(false);
    // Reset filters when switching views
    setCategoryFilter('');
  };

  // Used specifically by the bottom nav "Kochbuch" tab and the hamburger
  // menu's "Kochbuch" item: if the user has finished background imports
  // waiting for review, jump straight into the add-recipe form (which
  // surfaces that pending-imports list) instead of the plain recipe list.
  // pendingReviewRecipes only contains imports that have finished
  // processing (see AppReviewRecipesSync / RecipeImportQueueContext's
  // reviewRecipes) — imports still queued/processing/erroring don't count,
  // since there's nothing to review yet. Other paths that navigate to the
  // recipe view (private-list links, "back" buttons) keep calling
  // handleViewChange directly and are unaffected.
  const handleNavigateToRecipesOverview = () => {
    handleViewChange('recipes');
    if (pendingReviewRecipes.length > 0) {
      // Load the pending review recipe directly instead of handleAddRecipe():
      // isFormOpen is set false (by handleViewChange above) and true (below)
      // within the same batched update, so it never actually renders as
      // false in between — the effect that swaps an empty add-form for the
      // next pending review (triggered by isFormOpen going false) would
      // never fire, leaving an empty "Rezept hinzufügen" form open until the
      // user cancels it.
      handleReviewTempRecipe(pendingReviewRecipes[0]);
    }
  };

  const handleChefkochClick = () => {
    handleViewChange('kueche');
    setKuecheOpenPersonalData(true);
  };

  useEffect(() => {
    if (!showBottomNav) return;
    setIsBottomNavVisible(bottomNavBehavior !== 'hidden');
  }, [bottomNavBehavior, showBottomNav]);

  const handleBottomNavSelect = (tab) => {
    if (!tab) return;

    const onboardingSeen = localStorage.getItem(ATELIER_ONBOARDING_KEY);
    if (
      tab.key === 'atelier'
      && (onboardingTestmodeActive || !onboardingSeen)
      && shouldShowOnboardingOverlay(currentUser, onboardingTestmodeActive)
    ) {
      setShowAtelierOnboarding(true);
      return;
    }

    if (tab.key === bottomNavActiveKey) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsBottomNavVisible(true);
      return;
    }

    setIsBottomNavVisible(getBottomNavBehavior(tab.view) !== 'hidden');
    if (tab.view === 'recipes') {
      handleNavigateToRecipesOverview();
    } else {
      handleViewChange(tab.view);
    }
    window.scrollTo(0, 0);
  };

  const handleAtelierOnboardingConfirm = () => {
    setShowAtelierOnboarding(false);
    handleOpenAtelierCategorySelection();
  };

  const handleAtelierCategorySelectionContinue = () => {
    setShowAtelierSwipeTrainer(true);
  };

  const handleOpenAtelier = () => {
    const atelierTab = BOTTOM_NAV_TABS.find((t) => t.key === 'atelier');
    const atelierView = atelierTab?.view || 'tagesmenu';
    setIsBottomNavVisible(getBottomNavBehavior(atelierView) !== 'hidden');
    handleViewChange(atelierView);
    window.scrollTo(0, 0);
  };

  const handleOpenAtelierCategorySelection = () => {
    const atelierSelectionView = 'atelierCategorySelection';
    setIsBottomNavVisible(getBottomNavBehavior(atelierSelectionView) !== 'hidden');
    handleViewChange(atelierSelectionView);
    window.scrollTo(0, 0);
  };

  const handleAtelierSwipeTrainerComplete = (direction) => {
    localStorage.setItem(ATELIER_ONBOARDING_KEY, 'true');
    setShowAtelierSwipeTrainer(false);
    handleOpenAtelier();
    if (direction === 'u') {
      setShowAtelierTasteIntro(true);
    }
  };

  const handleAtelierTasteIntroContinue = () => {
    setShowAtelierTasteIntro(false);
  };

  const handleOpenPrivateListRecipes = (groupId) => {
    handleViewChange('recipes');
    setRecipeFilters({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedCategories: [],
      selectedAuthors: [],
      selectedPrivateLists: [],
      selectedGroup: groupId || ''
    });
  };

  const handleOpenSeasonalRecipes = () => {
    handleViewChange('seasonalRecipes');
    setRecipeFilters({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedCategories: [],
      selectedAuthors: [],
      selectedPrivateLists: [],
      selectedGroup: ''
    });
    setShowFavoritesOnly(false);
    setShowSeasonalOnly(false);
    handleClearSearch();
  };

  const handleCategoryFilterChange = (category) => {
    setCategoryFilter(category);
  };

  // Menu handlers
  const handleSelectMenu = (menu) => {
    setSelectedMenu(menu);
    // Always open the menu detail view at the top, regardless of how far
    // the menu overview had been scrolled.
    window.scrollTo(0, 0);
  };

  const handleBackToMenuList = () => {
    setSelectedMenu(null);
  };

  const handleOpenMenuEvent = (eventOwnerId, eventId) => {
    if (!eventId) return;
    setMenuBeforeEventDetail(selectedMenu);
    setPendingEventDetailRequest({ ownerId: eventOwnerId, eventId });
    handleViewChange('events');
  };

  // Closing the event card that was opened from a menu's Drinks section should
  // return to that menu instead of the events overview.
  const handleCloseLinkedEventDetail = () => {
    if (!menuBeforeEventDetail) return;
    setSelectedMenu(menuBeforeEventDetail);
    setMenuBeforeEventDetail(null);
  };

  const handleAddMenu = () => {
    setEditingMenu(null);
    setIsMenuFormOpen(true);
  };

  const handleEditMenu = (menu) => {
    if (!canEditMenu(currentUser, menu)) {
      alert('Sie haben keine Berechtigung, dieses Menü zu bearbeiten.');
      return;
    }
    setEditingMenu(menu);
    setIsMenuFormOpen(true);
    setSelectedMenu(null);
  };

  const handleSaveMenu = async (menu) => {
    if (!currentUser) return;

    try {
      if (editingMenu) {
        // Update existing menu
        const { id, ...updates } = menu;
        await updateMenuInFirestore(id, updates);
      } else {
        // Add new menu
        await addMenuToFirestore(menu, currentUser.id);
      }
      setIsMenuFormOpen(false);
      setEditingMenu(null);
    } catch (error) {
      console.error('Error saving menu:', error);
      alert('Fehler beim Speichern des Menüs. Bitte versuchen Sie es erneut.');
    }
  };

  const handleDeleteMenu = async (menuId) => {
    if (!currentUser) return;

    const menu = menus.find(m => m.id === menuId);
    if (!canDeleteMenu(currentUser, menu)) {
      alert('Sie haben keine Berechtigung, dieses Menü zu löschen.');
      return;
    }

    try {
      await deleteMenuFromFirestore(menuId);
      setSelectedMenu(null);
    } catch (error) {
      console.error('Error deleting menu:', error);
      alert('Fehler beim Löschen des Menüs. Bitte versuchen Sie es erneut.');
    }
  };

  const handlePublishMenu = async (menuId) => {
    if (!currentUser) return;

    const menu = menus.find(m => m.id === menuId);
    if (!canEditMenu(currentUser, menu)) {
      alert('Sie haben keine Berechtigung, dieses Menü freizugeben.');
      return;
    }

    try {
      await updateMenuInFirestore(menuId, { privat: false });
      if (selectedMenu && selectedMenu.id === menuId) {
        setSelectedMenu({ ...selectedMenu, privat: false });
      }
    } catch (error) {
      console.error('Error publishing menu:', error);
      alert('Fehler beim Freigeben des Menüs. Bitte versuchen Sie es erneut.');
    }
  };

  const handleCancelMenuForm = () => {
    setIsMenuFormOpen(false);
    setEditingMenu(null);
  };

  const handleToggleMenuFavorite = async (menuId) => {
    if (!currentUser) return;
    
    try {
      // Toggle in menu-specific favorites storage in Firestore
      await toggleMenuFavorite(currentUser.id, menuId);
      
      // Force re-render by updating state
      setMenus(prevMenus => [...prevMenus]);
      
      // Update selectedMenu if it's the one being toggled
      if (selectedMenu && selectedMenu.id === menuId) {
        setSelectedMenu({ ...selectedMenu });
      }
    } catch (error) {
      console.error('Error toggling menu favorite:', error);
    }
  };

  const handleMenuPortionCountChange = async (recipeId, portionCount) => {
    if (!selectedMenu) return;
    try {
      await updateMenuPortionCount(selectedMenu.id, recipeId, portionCount);
      setSelectedMenu(prev => ({
        ...prev,
        portionCounts: {
          ...(prev.portionCounts || {}),
          [recipeId]: portionCount
        }
      }));
    } catch (error) {
      console.error('Error updating menu portion count:', error);
    }
  };

  // Group handlers
  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
  };

  const handleBackToGroupList = () => {
    setSelectedGroup(null);
    setIsPrivateListSettingsTabOpen(false);
  };

  const handleCreateGroup = async (groupData) => {
    if (!currentUser) return;
    try {
      let targetListId = groupData.targetListId;

      // When creating an interactive list with a new target list, first create the target list
      if (groupData.listKind === 'interactive' && groupData.newTargetListName) {
        const newTargetList = await addGroupToFirestore(
          {
            name: groupData.newTargetListName,
            memberIds: groupData.memberIds,
            memberRoles: {},
            listKind: 'classic',
          },
          currentUser.id
        );
        targetListId = newTargetList.id;
      }

      // Build the interactive list data, linking it to the target list
      const interactiveListData = { ...groupData };
      delete interactiveListData.newTargetListName;
      delete interactiveListData.selfTargetList;
      if (targetListId) {
        interactiveListData.targetListId = targetListId;
      }

      const newGroup = await addGroupToFirestore(interactiveListData, currentUser.id);

      // When the list itself is chosen as its own target, update targetListId after creation
      if (groupData.listKind === 'interactive' && groupData.selfTargetList) {
        await updateGroupInFirestore(newGroup.id, { targetListId: newGroup.id });
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Fehler beim Erstellen der Gruppe. Bitte versuchen Sie es erneut.');
    }
  };

  const handleCreateInspirationList = async () => {
    if (!currentUser) return;
    try {
      // Load configurable names from settings
      const inspirationSettings = await getInspirationListSettings();
      const targetListName = inspirationSettings.inspirationTargetListName;
      const targetListDescription = inspirationSettings.inspirationTargetListDescription;
      const inspirationListName = inspirationSettings.inspirationListName;
      const inspirationListDescription = inspirationSettings.inspirationListDescription;

      // 1. Create classic target list
      const targetList = await addGroupToFirestore(
        {
          name: targetListName,
          ...(targetListDescription ? { description: targetListDescription } : {}),
          memberIds: [currentUser.id],
          memberRoles: {},
          listKind: 'classic',
        },
        currentUser.id
      );

      // 2. Create interactive list linked to target list
      const inspirationList = await addGroupToFirestore(
        {
          name: inspirationListName,
          ...(inspirationListDescription ? { description: inspirationListDescription } : {}),
          memberIds: [currentUser.id],
          memberRoles: {},
          listKind: 'interactive',
          targetListId: targetList.id,
        },
        currentUser.id
      );

      // 3. Set the new interactive list as the default web import list
      const result = await updateUserProfile(currentUser.id, {
        vorname: currentUser.vorname,
        nachname: currentUser.nachname,
        email: currentUser.email,
        signatureSatz: currentUser.signatureSatz || '',
        defaultWebImportListId: inspirationList.id,
        defaultEverydayClassicsListId: currentUser.defaultEverydayClassicsListId || '',
      });

      if (result.success) {
        setCurrentUser(prev => ({ ...prev, defaultWebImportListId: inspirationList.id }));
      }
    } catch (error) {
      console.error('Error creating inspiration list:', error);
      alert('Fehler beim Anlegen der Inspirationssammlung. Bitte versuchen Sie es erneut.');
    }
  };

  const handleSelectExistingInspirationList = async (listId) => {
    if (!currentUser) return;
    try {
      // Find the selected interactive list
      const selectedList = groups.find((g) => g.id === listId);

      // Determine if the user is a member of the target list
      let everydayClassicsListId = currentUser.defaultEverydayClassicsListId || '';
      if (selectedList?.targetListId) {
        const targetList = groups.find((g) => g.id === selectedList.targetListId);
        if (targetList) {
          const targetMemberIds = Array.isArray(targetList.memberIds) ? targetList.memberIds : [];
          const allTargetMemberIds = targetList.ownerId
            ? [...new Set([targetList.ownerId, ...targetMemberIds])]
            : targetMemberIds;
          everydayClassicsListId = allTargetMemberIds.includes(currentUser.id)
            ? targetList.id
            : '';
        } else {
          everydayClassicsListId = '';
        }
      }

      const result = await updateUserProfile(currentUser.id, {
        vorname: currentUser.vorname,
        nachname: currentUser.nachname,
        email: currentUser.email,
        signatureSatz: currentUser.signatureSatz || '',
        defaultWebImportListId: listId,
        defaultEverydayClassicsListId: everydayClassicsListId,
      });

      if (result.success) {
        setCurrentUser(prev => ({
          ...prev,
          defaultWebImportListId: listId,
          defaultEverydayClassicsListId: everydayClassicsListId,
        }));
      }
    } catch (error) {
      console.error('Error selecting existing inspiration list:', error);
      alert('Fehler beim Hinterlegen der Inspirationssammlung. Bitte versuchen Sie es erneut.');
    }
  };

  const handleAssignEverydayClassicsList = async (listId) => {
    if (!currentUser) return false;
    try {
      const result = await updateUserProfile(currentUser.id, {
        vorname: currentUser.vorname,
        nachname: currentUser.nachname,
        email: currentUser.email,
        signatureSatz: currentUser.signatureSatz || '',
        defaultWebImportListId: currentUser.defaultWebImportListId || '',
        defaultEverydayClassicsListId: listId || '',
      });
      if (result.success) {
        setCurrentUser(prev => ({ ...prev, defaultEverydayClassicsListId: listId || '' }));
        return true;
      }
    } catch (error) {
      console.error('Error assigning everyday classics list:', error);
    }
    return false;
  };

  const handleUpdateGroup = async (groupId, updates) => {
    try {
      await updateGroupInFirestore(groupId, updates);
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Fehler beim Aktualisieren der Gruppe. Bitte versuchen Sie es erneut.');
    }
  };

  const handleEditGroupProperties = async (groupId, editData) => {
    if (!currentUser) return;
    try {
      let targetListId = editData.targetListId;

      // When changing to interactive list with a new target list, first create the target list
      if (editData.listKind === 'interactive' && editData.newTargetListName) {
        const group = groups.find((g) => g.id === groupId);
        const newTargetList = await addGroupToFirestore(
          {
            name: editData.newTargetListName,
            memberIds: group ? group.memberIds : [currentUser.id],
            memberRoles: {},
            listKind: 'classic',
          },
          currentUser.id
        );
        targetListId = newTargetList.id;
      }

      const updates = { name: editData.name, listKind: editData.listKind };
      if (Object.prototype.hasOwnProperty.call(editData, 'description')) {
        updates.description = editData.description;
      }
      if (editData.listKind === 'interactive' && targetListId) {
        updates.targetListId = targetListId;
      } else {
        updates.targetListId = null;
      }
      await updateGroupInFirestore(groupId, updates);
      setSelectedGroup(prev => (prev?.id === groupId ? { ...prev, ...updates } : prev));
      setGroups(prev => prev.map(g => (g.id === groupId ? { ...g, ...updates } : g)));
    } catch (error) {
      console.error('Error editing group properties:', error);
      alert('Fehler beim Bearbeiten der Liste. Bitte versuchen Sie es erneut.');
    }
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      await deleteGroupFromFirestore(groupId);
      setSelectedGroup(null);
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('Fehler beim Löschen der Gruppe. Bitte versuchen Sie es erneut.');
    }
  };

  const handleAddRecipeToPrivateList = async (groupId, recipeId) => {
    try {
      await addRecipeToGroupInFirestore(groupId, recipeId);
      // Notify other members of the private list about the newly added recipe
      if (currentUser?.id) {
        notifyPrivateListMembers(groupId, recipeId, currentUser.id, 'added');
      }
    } catch (error) {
      console.error('Error adding recipe to private list:', error);
    }
  };

  const handleRemoveRecipeFromPrivateList = async (groupId, recipeId) => {
    try {
      await removeRecipeFromGroupInFirestore(groupId, recipeId);
    } catch (error) {
      console.error('Error removing recipe from private list:', error);
    }
  };

  const handleMoveRecipeToPublic = async (recipeId) => {
    if (!currentUser || !publicGroupId) return;

    try {
      await updateRecipeInFirestore(recipeId, {
        groupId: publicGroupId,
        publishedToPublic: true,
        publishedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error moving recipe to public group:', error);
    }
  };

  // User authentication handlers
  const handleLogin = async (email, password) => {
    const result = await loginUser(email, password);
    if (result.success) {
      // User state will be updated by onAuthStateChange observer
      if (result.requiresPasswordChange) {
        setRequiresPasswordChange(true);
      }
    }
    return result;
  };

  const handlePasswordChanged = () => {
    setRequiresPasswordChange(false);
    // User state will be updated by onAuthStateChange observer
  };

  const handleLogout = async () => {
    await logoutUser();
    // User state will be updated by onAuthStateChange observer
    setRequiresPasswordChange(false);
  };

  const handleRegister = async (userData) => {
    const result = await registerUser(userData);
    return result;
  };

  const handleSwitchToLogin = () => {
    setAuthView('login');
  };

  const handleSwitchToRegister = () => {
    setAuthView('register');
  };

  const handleGuestLogin = async () => {
    const result = await loginAsGuest();
    // User state will be updated by onAuthStateChange observer
    return result;
  };

  const handleResetPassword = async (email) => {
    return await sendPasswordResetEmail(email);
  };

  const handleHeaderVisibilityChange = (visible) => {
    setHeaderVisible(visible);
  };

  const handleSearchChange = (term) => {
    setSearchTerm(term);
  };

  const handleApplySearch = (term) => {
    setSearchTerm(term);
    setIsMobileSearchOpen(false);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  const handleOpenSearch = () => {
    // On mobile (≤768px) open the fullscreen overlay; on desktop use the header search
    if (window.innerWidth <= 768) {
      setIsMobileSearchOpen(true);
    } else {
      headerRef.current?.openSearch();
    }
  };

  const handleClearAllFilters = () => {
    setRecipeFilters({
      showDrafts: 'all',
      selectedCuisines: [],
      selectedCategories: [],
      selectedAuthors: [],
      selectedPrivateLists: [],
      selectedGroup: ''
    });
    setShowFavoritesOnly(false);
    setShowSeasonalOnly(false);
    handleClearSearch();
  };

  const handleClearCuisineFilter = () => {
    setRecipeFilters(prev => ({ ...prev, selectedCuisines: [] }));
  };

  const handleCuisineFilterChangeFromSearch = (newSelectedCuisines) => {
    setRecipeFilters(prev => ({ ...prev, selectedCuisines: newSelectedCuisines }));
  };

  const handleMealCategoryFilterChangeFromSearch = (newSelectedCategories) => {
    setRecipeFilters(prev => ({ ...prev, selectedCategories: newSelectedCategories }));
  };

  const handleAuthorFilterChangeFromSearch = (newSelectedAuthors) => {
    setRecipeFilters(prev => ({ ...prev, selectedAuthors: newSelectedAuthors }));
  };

  const handlePrivateListFilterChangeFromSearch = (newSelectedPrivateLists) => {
    setRecipeFilters(prev => ({ ...prev, selectedPrivateLists: newSelectedPrivateLists }));
  };

  const privateListsForSearch = useMemo(
    () => groups.filter(
      (g) =>
        g.type === 'private' &&
        (g.ownerId === currentUser?.id ||
          (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id)))
    ),
    [groups, currentUser]
  );
  const isPrivateListSearchContext = currentView === 'groups' && selectedGroup?.type === 'private';
  const isSeasonalRecipesView = currentView === 'seasonalRecipes';
  const seasonalTaggedRecipes = useMemo(
    () => recipes.filter((recipe) => hasHauptsaisonIngredient(recipe, seasonMatrixEntries, undefined, nutritionReferenceRows)),
    [recipes, seasonMatrixEntries, nutritionReferenceRows]
  );
  const overlayRecipes = isPrivateListSearchContext
    ? selectedGroupUnfilteredRecipes
    : isSeasonalRecipesView
      ? seasonalTaggedRecipes
      : recipes;
  const overlayAvailableAuthors = useMemo(
    () => allUsers
      .filter((u) => !u.versteckt && overlayRecipes.some((r) => r.authorId === u.id))
      .map((u) => ({ id: u.id, name: u.vorname })),
    [allUsers, overlayRecipes]
  );
  const overlayCuisineTypes = useMemo(() => {
    if (!isPrivateListSearchContext) return cuisineTypes;

    const availableTypes = new Set();
    overlayRecipes.forEach((recipe) => {
      const kulinarik = Array.isArray(recipe.kulinarik)
        ? recipe.kulinarik
        : recipe.kulinarik
          ? [recipe.kulinarik]
          : [];
      kulinarik.forEach((type) => availableTypes.add(type));
    });

    return cuisineTypes.filter((type) => availableTypes.has(type));
  }, [isPrivateListSearchContext, cuisineTypes, overlayRecipes]);
  const overlayMealCategories = useMemo(() => {
    if (!isPrivateListSearchContext) return mealCategories;

    const availableCategories = new Set();
    overlayRecipes.forEach((recipe) => {
      const speisekategorie = Array.isArray(recipe.speisekategorie)
        ? recipe.speisekategorie
        : recipe.speisekategorie
          ? [recipe.speisekategorie]
          : [];
      speisekategorie.forEach((category) => availableCategories.add(category));
    });

    return mealCategories.filter((category) => availableCategories.has(category));
  }, [isPrivateListSearchContext, mealCategories, overlayRecipes]);
  const overlayCuisineGroups = useMemo(() => {
    if (!isPrivateListSearchContext) return cuisineGroups;

    const availableTypes = new Set(overlayCuisineTypes);
    return (cuisineGroups || [])
      .map((group) => {
        const children = (group.children || []).filter((child) => availableTypes.has(child));
        return { ...group, children };
      })
      .filter((group) => availableTypes.has(group.name) || group.children.length > 0);
  }, [isPrivateListSearchContext, cuisineGroups, overlayCuisineTypes]);

  // Interactive lists are private groups with listKind === 'interactive' that the
  // current user owns or is a member of.
  const interactiveLists = useMemo(
    () => groups.filter(
      (g) =>
        g.type === 'private' &&
        g.listKind === 'interactive' &&
        (g.ownerId === currentUser?.id ||
          (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id)))
    ),
    [groups, currentUser]
  );
  const atelierCategoryOptions = useMemo(
    () => getAtelierMealCategories(interactiveLists, recipes),
    [interactiveLists, recipes]
  );

  useEffect(() => {
    setAtelierSelectedCategories((previous) =>
      previous.filter((category) => atelierCategoryOptions.includes(category))
    );
  }, [atelierCategoryOptions]);

  const handleUniversalImportCancel = () => {
    setShowUniversalImport(false);
    setSharedData({ images: [], title: '', text: '', url: '' });
    clearSharedDataFromDB();
  };

  // Show splash screen while checking auth. It is always rendered as the
  // first child of the same top-level fragment across every branch below
  // (never as the entire return value on its own) so that React keeps
  // reconciling it at the same tree position instead of unmounting and
  // remounting it — and replaying its enter animations — when the branch
  // taken by the rest of the render changes (e.g. authLoading flips to
  // false right into the "still loading startseite data" branch further
  // down). See splash-screen-logo-in / splash-screen-fade-up in
  // SplashScreen.css for the animations this avoids re-triggering.
  if (authLoading) {
    return (
      <>
        <SplashScreen />
      </>
    );
  }

  // If accessing a share URL, show SharePage (no login required)
  if (sharePageId) {
    const handleSharePageClose = () => {
      if (window.location.pathname.match(/^\/share\//)) {
        window.history.pushState({}, '', '/');
        setSharePageId(null);
      } else {
        window.location.hash = '';
      }
      setCurrentView('recipes');
    };
    return (
      <>
        {null}
        <NutritionReferenceProvider>
          <RecipeImportQueueProvider userId={currentUser?.id}>
            <div className="App" style={appBottomNavStyle}>
              <Header />
              <Suspense fallback={<ViewLoadingFallback />}>
                <SharePage
                  shareId={sharePageId}
                  currentUser={currentUser}
                  onClose={handleSharePageClose}
                />
              </Suspense>
            </div>
          </RecipeImportQueueProvider>
        </NutritionReferenceProvider>
      </>
    );
  }

  // If accessing a menu share URL, show MenuSharePage (no login required)
  if (menuSharePageId) {
    const handleMenuSharePageClose = () => {
      if (window.location.pathname.match(/^\/menu-share\//)) {
        window.history.pushState({}, '', '/');
        setMenuSharePageId(null);
      } else {
        window.location.hash = '';
      }
      setCurrentView('recipes');
    };
    return (
      <>
        {null}
        <NutritionReferenceProvider>
          <RecipeImportQueueProvider userId={currentUser?.id}>
            <div className="App" style={appBottomNavStyle}>
              <Header />
              <Suspense fallback={<ViewLoadingFallback />}>
                <MenuSharePage
                  shareId={menuSharePageId}
                  currentUser={currentUser}
                  onClose={handleMenuSharePageClose}
                />
              </Suspense>
            </div>
          </RecipeImportQueueProvider>
        </NutritionReferenceProvider>
      </>
    );
  }

  // If user is not logged in, show login/register view
  if (!currentUser) {
    return (
      <>
        {null}
        <div className="App">
          <Header />
        {pendingWebimportUrl && (
          <div style={{
            background: '#E3F2FD',
            borderLeft: '4px solid #2196F3',
            padding: '0.75rem 1rem',
            margin: '1rem',
            borderRadius: '4px',
            fontSize: '0.95rem',
            color: '#1565C0'
          }}>
            Bitte melde dich an, um das Rezept zu importieren.
          </div>
        )}
        {authView === 'login' ? (
          <Login
            onLogin={handleLogin}
            onSwitchToRegister={handleSwitchToRegister}
            onGuestLogin={handleGuestLogin}
            onResetPassword={handleResetPassword}
          />
        ) : (
          <Suspense fallback={<ViewLoadingFallback />}>
            <Register
              onRegister={handleRegister}
              onSwitchToLogin={handleSwitchToLogin}
            />
          </Suspense>
        )}
      </div>
      </>
    );
  }

  return (
    <>
      {!splashDismissed && <SplashScreen exiting={initialStartseiteReady} />}
      <NutritionReferenceProvider enabled={!!currentUser}>
    <RecipeImportQueueProvider userId={currentUser?.id}>
      <AppNutritionRowsSync onRows={setNutritionReferenceRows} />
      <AppReviewRecipesSync onReviewRecipes={setPendingReviewRecipes} />
      <div className="App" style={appBottomNavStyle}>
        <Header
          ref={headerRef}
          onSettingsClick={handleOpenSettings}
          currentView={currentView}
          onViewChange={(view) => (view === 'recipes' ? handleNavigateToRecipesOverview() : handleViewChange(view))}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={handleCategoryFilterChange}
          currentUser={currentUser}
          onLogout={handleLogout}
          visible={headerVisible}
          onSearchChange={handleSearchChange}
          interactiveLists={interactiveLists}
          startseiteEnabled={!!currentUser?.startseite}
          onChefkochClick={currentUser ? handleChefkochClick : undefined}
          onProfileUpdated={(updatedUser) => setCurrentUser(prev => ({ ...prev, ...updatedUser }))}
        />
        <Suspense fallback={<ViewLoadingFallback />}>
        {isSettingsOpen ? (
          <Settings onBack={handleCloseSettings} currentUser={currentUser} allUsers={allUsers} allRecipes={recipes} onUpdateRecipe={(id, updates) => updateRecipeInFirestore(id, updates)} />
        ) : selectedRecipe ? (
        // Recipe detail view - shown regardless of currentView
        <RecipeDetail
          recipe={selectedRecipe}
          onBack={handleBackFromRecipeDetail}
          onEdit={handleEditRecipe}
          onDelete={handleDeleteRecipe}
          onPublish={handlePublishRecipe}
          onToggleFavorite={handleToggleFavorite}
          onCreateVersion={handleCreateVersion}
          currentUser={currentUser}
          allRecipes={recipes}
          allUsers={allUsers}
          onHeaderVisibilityChange={handleHeaderVisibilityChange}
          publicGroupId={publicGroupId}
          menuPortionCount={selectedMenu ? (selectedMenu.portionCounts?.[selectedRecipe?.id] ?? null) : null}
          onPortionCountChange={selectedMenu ? handleMenuPortionCountChange : undefined}
        />
        ) : isFormOpen ? (
        // Recipe form - shown with priority over menu/recipe detail
        <RecipeForm
          recipe={editingRecipe}
          onSave={handleSaveRecipe}
          onBulkImport={handleBulkImportRecipes}
          onCancel={handleCancelForm}
          currentUser={currentUser}
          isCreatingVersion={isCreatingVersion}
          allRecipes={recipes}
          activeGroupId={activeGroupId}
          groups={groups}
          publicGroupId={publicGroupId}
          privateLists={groups.filter(g => g.type === 'private' && (g.ownerId === currentUser?.id || (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id))))}
          initialWebImportUrl={webimportDeeplink}
          initialWebImportAuthorId={webimportAuthorId}
          onSelectTempRecipe={handleReviewTempRecipe}
        />
        ) : selectedMenu ? (
        // Menu detail view - shown regardless of currentView
        <MenuDetail
          menu={selectedMenu}
          recipes={recipes}
          onBack={handleBackToMenuList}
          onEdit={handleEditMenu}
          onDelete={handleDeleteMenu}
          onPublish={handlePublishMenu}
          onSelectRecipe={handleSelectRecipe}
          onToggleMenuFavorite={handleToggleMenuFavorite}
          onOpenEvent={handleOpenMenuEvent}
          currentUser={currentUser}
          allUsers={allUsers}
        />
        ) : isMenuFormOpen ? (
        // Menu form - shown regardless of currentView (e.g. when editing from Kueche/Timeline)
        <MenuForm
          menu={editingMenu}
          recipes={recipes}
          onSave={handleSaveMenu}
          onCancel={handleCancelMenuForm}
          currentUser={currentUser}
          allUsers={allUsers}
        />
        ) : currentView === 'appCalls' ? (
        <AppCallsPage
          onBack={() => handleViewChange('kueche')}
          currentUser={currentUser}
          recipes={recipes}
          onUpdateRecipe={(id, updates) => updateRecipeInFirestore(id, updates)}
          onSelectRecipe={handleSelectRecipe}
          activeTab={appCallsActiveTab}
          onActiveTabChange={setAppCallsActiveTab}
          visibleTabs={appCallsVisibleTabs}
        />
        ) : currentView === 'meineKuechenstars' ? (
        <MeineKuechenstarsPage
          onBack={() => handleViewChange('kueche')}
          currentUser={currentUser}
          recipes={recipes}
        />
        ) : currentView === 'events' ? (
        <EventsPage
          onBack={() => handleViewChange('recipes')}
          currentUser={currentUser}
          recipes={recipes}
          pendingEventReminderId={pendingEventReminderId}
          onPendingEventReminderHandled={() => {
            setPendingEventReminderId(null);
            try {
              sessionStorage.removeItem(PENDING_EVENT_REMINDER_STORAGE_KEY);
            } catch {
              // Ignore storage errors (e.g. restricted environments)
            }
          }}
          pendingEventDetailRequest={pendingEventDetailRequest}
          onPendingEventDetailRequestHandled={() => setPendingEventDetailRequest(null)}
          onCloseLinkedEventDetail={handleCloseLinkedEventDetail}
        />
        ) : currentView === 'tagesmenu' ? (
        <Tagesmenu
          interactiveLists={interactiveLists}
          recipes={recipes}
          allUsers={allUsers}
          onSelectRecipe={handleSelectRecipe}
          currentUser={currentUser}
          selectedCategories={atelierSelectedCategories}
          onSelectedCategoriesChange={setAtelierSelectedCategories}
        />
        ) : currentView === 'atelierCategorySelection' ? (
        <AtelierCategorySelectionPage
          categoryOptions={atelierCategoryOptions}
          selectedCategories={atelierSelectedCategories}
          onSelectedCategoriesChange={setAtelierSelectedCategories}
          onContinue={handleAtelierCategorySelectionContinue}
        />
        ) : currentView === 'kueche' ? (
        <Kueche
          recipes={recipes}
          menus={menus}
          groups={groups}
          onSelectRecipe={handleSelectRecipe}
          onSelectMenu={handleSelectMenu}
          allUsers={allUsers}
          currentUser={currentUser}
          onProfileUpdated={(updatedUser) => setCurrentUser(prev => ({ ...prev, ...updatedUser }))}
          onViewChange={handleViewChange}
          openPersonalData={kuecheOpenPersonalData}
          onPersonalDataOpened={() => setKuecheOpenPersonalData(false)}
          onPersonalDataVisibilityChange={setIsKuechePersonalDataOpen}
        />
        ) : currentView === 'groups' ? (
        selectedGroup ? (
          <GroupDetail
            group={selectedGroup}
            allUsers={allUsers}
            currentUser={currentUser}
            onBack={handleBackToGroupList}
            onUpdateGroup={handleUpdateGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddRecipe={handleAddRecipe}
            recipes={selectedGroupRecipes}
            onSelectRecipe={handleSelectRecipe}
            privateLists={privateListsForUser}
            onEditGroupProperties={handleEditGroupProperties}
            searchTerm={searchTerm}
            onOpenSearch={handleOpenSearch}
            onClearAllFilters={handleClearAllFilters}
            activeFilters={recipeFilters}
            showFavoritesOnly={showFavoritesOnly}
            showSeasonalOnly={showSeasonalOnly}
            onActiveTabChange={(tab) => setIsPrivateListSettingsTabOpen(tab === 'einstellungen')}
            onAddToPrivateList={handleAddRecipeToPrivateList}
            onRemoveFromPrivateList={handleRemoveRecipeFromPrivateList}
            publicGroupId={publicGroupId}
            onMoveRecipeToPublic={handleMoveRecipeToPublic}
          />
        ) : (
          <GroupList
            groups={groups}
            allUsers={allUsers}
            currentUser={currentUser}
            onSelectGroup={handleSelectGroup}
            onCreateGroup={handleCreateGroup}
            onBack={() => handleViewChange(groupsOpenedFromStartseite ? 'startseite' : 'kueche')}
          />
        )
        ) : currentView === 'menus' ? (
        // Menu views
        <MenuList
          menus={menus}
          recipes={recipes}
          onSelectMenu={handleSelectMenu}
          onAddMenu={handleAddMenu}
          onToggleMenuFavorite={handleToggleMenuFavorite}
          currentUser={currentUser}
          allUsers={allUsers}
        />
        ) : currentView === 'startseite' ? (
        <Startseite currentUser={currentUser} onViewChange={handleViewChange} onSelectRecipe={handleSelectRecipe} recipes={recipes} groups={groups} groupsLoading={groupsLoading} onCreateInspirationList={handleCreateInspirationList} onSelectExistingInspirationList={handleSelectExistingInspirationList} onAssignEverydayClassicsList={handleAssignEverydayClassicsList} onOpenPrivateListRecipes={handleOpenPrivateListRecipes} onOpenSeasonalRecipes={handleOpenSeasonalRecipes} onAddRecipe={handleAddRecipe} onCarouselsLoadedChange={handleStartseiteCarouselsLoadedChange} />
        ) : (
        // Recipe views
        <div className="recipe-overview-layout">
          <RecipeFilterSidebar
            recipes={overlayRecipes}
            currentUser={currentUser}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            showFavoritesOnly={showFavoritesOnly}
            onFavoritesToggle={setShowFavoritesOnly}
            showSeasonalOnly={showSeasonalOnly}
            onSeasonalToggle={setShowSeasonalOnly}
            cuisineTypes={overlayCuisineTypes}
            cuisineGroups={overlayCuisineGroups}
            selectedCuisines={recipeFilters.selectedCuisines}
            onCuisineFilterChange={handleCuisineFilterChangeFromSearch}
            mealCategories={overlayMealCategories}
            selectedCategories={recipeFilters.selectedCategories}
            onMealCategoryFilterChange={handleMealCategoryFilterChangeFromSearch}
            availableAuthors={overlayAvailableAuthors}
            selectedAuthors={recipeFilters.selectedAuthors}
            onAuthorFilterChange={handleAuthorFilterChangeFromSearch}
            privateLists={isPrivateListSearchContext ? [] : privateListsForSearch}
            selectedPrivateLists={isPrivateListSearchContext ? [] : recipeFilters.selectedPrivateLists}
            onPrivateListFilterChange={isPrivateListSearchContext ? emptyPrivateListFilterHandler : handlePrivateListFilterChangeFromSearch}
            showPrivateListFilters={!isPrivateListSearchContext}
            onClearAllFilters={handleClearAllFilters}
            onAddRecipe={handleAddRecipe}
            activePrivateListId={recipeFilters.selectedGroup || (recipeFilters.selectedPrivateLists.length === 1 ? recipeFilters.selectedPrivateLists[0] : null)}
          />
          <div className="recipe-overview-main">
            <RecipeList
              recipes={(isSeasonalRecipesView ? seasonalTaggedRecipes : recipes).filter(recipe =>
                matchesCategoryFilter(recipe, categoryFilter) &&
                matchesDraftFilter(recipe, recipeFilters.showDrafts) &&
                matchesCuisineFilter(recipe, recipeFilters.selectedCuisines, cuisineGroups) &&
                matchesMealCategoryFilter(recipe, recipeFilters.selectedCategories) &&
                matchesAuthorFilter(recipe, recipeFilters.selectedAuthors) &&
                matchesGroupFilter(recipe, recipeFilters.selectedGroup, groups) &&
                matchesPrivateListsFilter(recipe, recipeFilters.selectedPrivateLists, groups) &&
                matchesSeasonalFilter(recipe, showSeasonalOnly, seasonMatrixEntries, nutritionReferenceRows)
              )}
              onSelectRecipe={handleSelectRecipe}
              onAddRecipe={handleAddRecipe}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={handleCategoryFilterChange}
              currentUser={currentUser}
              searchTerm={searchTerm}
              onOpenSearch={handleOpenSearch}
              onClearSearch={handleClearSearch}
              activePrivateListName={isSeasonalRecipesView ? 'Saisonale Rezepte' : activePrivateListName}
              activePrivateListId={recipeFilters.selectedGroup || (recipeFilters.selectedPrivateLists.length === 1 ? recipeFilters.selectedPrivateLists[0] : null)}
              activeFilters={recipeFilters}
              onClearCuisineFilter={handleClearCuisineFilter}
              onClearAllFilters={handleClearAllFilters}
              showFavoritesOnly={showFavoritesOnly}
              showSeasonalOnly={showSeasonalOnly}
              onShowFavoritesOnlyChange={setShowFavoritesOnly}
              privateLists={privateListsForUser}
              onAddToPrivateList={handleAddRecipeToPrivateList}
              onRemoveFromPrivateList={handleRemoveRecipeFromPrivateList}
              publicGroupId={publicGroupId}
              onMoveRecipeToPublic={handleMoveRecipeToPublic}
              cookDatesMap={cookDatesMap}
              seasonMatrixEntries={seasonMatrixEntries}
            />
          </div>
        </div>
        )}
        </Suspense>
        {requiresPasswordChange && currentUser && (
          <Suspense fallback={null}>
            <PasswordChangeModal
              user={currentUser}
              onPasswordChanged={handlePasswordChanged}
            />
          </Suspense>
        )}
        {showUniversalImport && (
          <Suspense fallback={null}>
            <UniversalImportModal
              initialImages={sharedData.images}
              initialTitle={sharedData.title}
              initialText={sharedData.text}
              initialUrl={sharedData.url}
              onCancel={handleUniversalImportCancel}
              userId={currentUser?.id}
              importContext={resolveImportGroupContext({ activeGroupId, groups, publicGroupId })}
              webImportPinEnabled={currentUser?.webImportPinEnabled || false}
            />
          </Suspense>
        )}
        <MobileSearchOverlay
          isOpen={isMobileSearchOpen}
          onClose={() => setIsMobileSearchOpen(false)}
          recipes={overlayRecipes}
          currentUser={currentUser}
          onSelectRecipe={(recipe) => {
            setIsMobileSearchOpen(false);
            handleSelectRecipe(recipe);
          }}
          onSearch={handleApplySearch}
          onClearSearch={handleClearSearch}
          searchTerm={searchTerm}
          showFavoritesOnly={showFavoritesOnly}
          showSeasonalOnly={showSeasonalOnly}
          onFavoritesToggle={setShowFavoritesOnly}
          onSeasonalToggle={setShowSeasonalOnly}
          seasonMatrixEntries={seasonMatrixEntries}
          cuisineTypes={overlayCuisineTypes}
          cuisineGroups={overlayCuisineGroups}
          onCuisineFilterChange={handleCuisineFilterChangeFromSearch}
          selectedCuisines={recipeFilters.selectedCuisines}
          mealCategories={overlayMealCategories}
          onMealCategoryFilterChange={handleMealCategoryFilterChangeFromSearch}
          selectedCategories={recipeFilters.selectedCategories}
          availableAuthors={overlayAvailableAuthors}
          onAuthorFilterChange={handleAuthorFilterChangeFromSearch}
          selectedAuthors={recipeFilters.selectedAuthors}
          privateLists={isPrivateListSearchContext ? [] : privateListsForSearch}
          onPrivateListFilterChange={isPrivateListSearchContext ? emptyPrivateListFilterHandler : handlePrivateListFilterChangeFromSearch}
          selectedPrivateLists={isPrivateListSearchContext ? [] : recipeFilters.selectedPrivateLists}
          showPrivateListFilters={!isPrivateListSearchContext}
        />
        {showBottomNav && (
          <BottomNavigation
            tabs={bottomNavTabs}
            activeKey={bottomNavActiveKey}
            isVisible={isBottomNavVisible}
            onSelect={handleBottomNavSelect}
            badgeCounts={bottomNavBadgeCounts}
          />
        )}
        {showAtelierOnboarding && (
          <Suspense fallback={null}>
            <AtelierOnboardingOverlay onConfirm={handleAtelierOnboardingConfirm} />
          </Suspense>
        )}
        {showAtelierSwipeTrainer && (
          <Suspense fallback={null}>
            <AtelierSwipeTrainerOverlay onComplete={handleAtelierSwipeTrainerComplete} />
          </Suspense>
        )}
        {showAtelierTasteIntro && (
          <Suspense fallback={null}>
            <AtelierTasteIntroOverlay onContinue={handleAtelierTasteIntroContinue} />
          </Suspense>
        )}
      </div>
    </RecipeImportQueueProvider>
    </NutritionReferenceProvider>
    </>
  );
}

export default App;
