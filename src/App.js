import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';
import RecipeList from './components/RecipeList';
import RecipeDetail from './components/RecipeDetail';
import RecipeForm from './components/RecipeForm';
import Header from './components/Header';
import Settings from './components/Settings';
import MenuList from './components/MenuList';
import MenuDetail from './components/MenuDetail';
import MenuForm from './components/MenuForm';
import Login from './components/Login';
import Register from './components/Register';
import PasswordChangeModal from './components/PasswordChangeModal';
import FilterPage from './components/FilterPage';
import Kueche from './components/Kueche';
import SharePage from './components/SharePage';
import MenuSharePage from './components/MenuSharePage';
import GroupList from './components/GroupList';
import GroupDetail from './components/GroupDetail';
import { 
  loginUser, 
  logoutUser, 
  registerUser,
  loginAsGuest,
  getUsers,
  onAuthStateChange,
  canEditMenu,
  canDeleteMenu
} from './utils/userManagement';
import { 
  toggleFavorite,
  migrateGlobalFavorites
} from './utils/userFavorites';
import { toggleMenuFavorite } from './utils/menuFavorites';
import { applyFaviconSettings } from './utils/faviconUtils';
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
  ensurePublicGroup
} from './utils/groupFirestore';

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

// Helper function to check if a recipe matches the cuisine (Kulinarik) filter
function matchesCuisineFilter(recipe, selectedCuisines) {
  if (!selectedCuisines || selectedCuisines.length === 0) return true;
  if (Array.isArray(recipe.speisekategorie)) {
    return selectedCuisines.some(c => recipe.speisekategorie.includes(c));
  }
  return selectedCuisines.includes(recipe.speisekategorie);
}

// Helper function to check if a recipe matches the author filter
function matchesAuthorFilter(recipe, selectedAuthors) {
  if (!selectedAuthors || selectedAuthors.length === 0) return true;
  return selectedAuthors.includes(recipe.authorId);
}

// Helper function to check if a recipe matches the private group filter
function matchesGroupFilter(recipe, selectedGroup) {
  if (!selectedGroup) return true;
  return recipe.groupId === selectedGroup;
}

function App() {
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState('recipes');
  const [menus, setMenus] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [isMenuFormOpen, setIsMenuFormOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [publicGroupId, setPublicGroupId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterPageOpen, setIsFilterPageOpen] = useState(false);
  const [recipeFilters, setRecipeFilters] = useState({
    showDrafts: 'all',
    selectedCuisines: [],
    selectedAuthors: [],
    selectedGroup: ''
  });
  const recipeCountsInitialized = useRef(false);

  // IDs of groups the current user belongs to – used to filter group-scoped recipes
  const userGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);

  // Name of the currently selected private list filter (if any)
  const activePrivateListName = useMemo(() => {
    if (!recipeFilters.selectedGroup) return undefined;
    return groups.find(g => g.id === recipeFilters.selectedGroup)?.name;
  }, [groups, recipeFilters.selectedGroup]);

  // Recipes belonging to the currently selected group
  const selectedGroupRecipes = useMemo(() => {
    if (!selectedGroup) return [];
    if (selectedGroup.type === 'public') {
      // Public group shows recipes explicitly assigned to it, recipes with no group,
      // or recipes that have been published to the public list
      return recipes.filter((r) => r.groupId === selectedGroup.id || !r.groupId || r.publishedToPublic);
    }
    return recipes.filter((r) => r.groupId === selectedGroup.id);
  }, [recipes, selectedGroup]);

  // Detect share URL: #share/:shareId
  const getShareIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/^#share\/(.+)$/);
    return match ? match[1] : null;
  };

  const [sharePageId, setSharePageId] = useState(() => getShareIdFromHash());

  // Detect menu share URL: #menu-share/:shareId
  const getMenuShareIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/^#menu-share\/(.+)$/);
    return match ? match[1] : null;
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
    const unsubscribe = onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user && user.requiresPasswordChange) {
        setRequiresPasswordChange(true);
      }
      setAuthLoading(false);
    });
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
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

  // Apply favicon settings on mount
  useEffect(() => {
    if (!currentUser) return;
    const loadFavicon = async () => {
      await applyFaviconSettings();
    };
    loadFavicon();
  }, [currentUser]);

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

    const unsubscribe = subscribeToMenus((menusFromFirestore) => {
      setMenus(menusFromFirestore);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Set up real-time listener for groups from Firestore
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToGroups(currentUser.id, (groupsFromFirestore) => {
      setGroups(groupsFromFirestore);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleBackFromRecipeDetail = () => {
    // Clear selected recipe to go back to either MenuDetail or RecipeList
    setSelectedRecipe(null);
    // selectedMenu state is preserved, so if it's set, we'll return to MenuDetail
  };

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
  };

  const handleCreateVersion = (recipe) => {
    setEditingRecipe(recipe);
    setIsCreatingVersion(true);
    setIsFormOpen(true);
    setSelectedRecipe(null);
  };

  const handleSaveRecipe = async (recipe) => {
    if (!currentUser) return;

    try {
      if (editingRecipe && !isCreatingVersion) {
        // Update existing recipe (direct edit)
        const { id, ...updates } = recipe;
        await updateRecipeInFirestore(id, updates, editingRecipe.authorId);
      } else {
        // Add new recipe or new version; attach groupId if created from within a group,
        // otherwise fall back to the public group (from state or from the groups subscription)
        const resolvedPublicGroupId = publicGroupId || groups.find(g => g.type === 'public')?.id;
        const safeGroupId = activeGroupId
          ? (typeof activeGroupId === 'string' ? activeGroupId : activeGroupId.id ?? String(activeGroupId))
          : resolvedPublicGroupId;
        // Auto-publish when creating via "Rezept hinzufügen" (no active private group)
        const autoPublish = !activeGroupId && !isCreatingVersion;
        const activeGroup = groups.find(g => g.id === safeGroupId);
        const groupType = activeGroup?.type ?? 'public';
        const recipeWithGroup = safeGroupId
          ? { ...recipe, groupId: safeGroupId, groupType, ...(autoPublish ? { publishedToPublic: true } : {}) }
          : recipe;
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

        setSelectedRecipe(savedRecipeWithShare);
      }
      setIsFormOpen(false);
      setEditingRecipe(null);
      setIsCreatingVersion(false);
      setActiveGroupId(null);
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
      const resolvedPublicGroupId = publicGroupId || groups.find(g => g.type === 'public')?.id;
      await updateRecipeInFirestore(recipeId, {
        publishedToPublic: true,
        groupId: resolvedPublicGroupId,
        groupType: 'public'
      });
    } catch (error) {
      console.error('Error publishing recipe:', error);
      alert('Fehler beim Veröffentlichen des Rezepts. Bitte versuchen Sie es erneut.');
    }
  };

  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingRecipe(null);
    setIsCreatingVersion(false);
    setActiveGroupId(null);
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

  const handleViewChange = (view) => {
    setCurrentView(view);
    setSelectedRecipe(null);
    setSelectedMenu(null);
    setSelectedGroup(null);
    setIsFormOpen(false);
    setIsMenuFormOpen(false);
    setIsSettingsOpen(false);
    // Reset filters when switching views
    setCategoryFilter('');
  };

  const handleCategoryFilterChange = (category) => {
    setCategoryFilter(category);
  };

  // Menu handlers
  const handleSelectMenu = (menu) => {
    setSelectedMenu(menu);
  };

  const handleBackToMenuList = () => {
    setSelectedMenu(null);
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
  };

  const handleCreateGroup = async (groupData) => {
    if (!currentUser) return;
    try {
      await addGroupToFirestore(groupData, currentUser.id);
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Fehler beim Erstellen der Gruppe. Bitte versuchen Sie es erneut.');
    }
  };

  const handleUpdateGroup = async (groupId, updates) => {
    try {
      await updateGroupInFirestore(groupId, updates);
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Fehler beim Aktualisieren der Gruppe. Bitte versuchen Sie es erneut.');
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

  const handleHeaderVisibilityChange = (visible) => {
    setHeaderVisible(visible);
  };

  const handleSearchChange = (term) => {
    setSearchTerm(term);
  };

  const handleOpenFilterPage = () => {
    setIsFilterPageOpen(true);
  };

  const handleApplyFilters = (filters) => {
    setRecipeFilters(filters);
    setIsFilterPageOpen(false);
  };

  const handleCancelFilterPage = () => {
    setIsFilterPageOpen(false);
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="App">
        <Header />
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Laden...
        </div>
      </div>
    );
  }

  // If accessing a share URL, show SharePage (no login required)
  if (sharePageId) {
    return (
      <div className="App">
        <Header />
        <SharePage
          shareId={sharePageId}
          currentUser={currentUser}
        />
      </div>
    );
  }

  // If accessing a menu share URL, show MenuSharePage (no login required)
  if (menuSharePageId) {
    return (
      <div className="App">
        <Header />
        <MenuSharePage
          shareId={menuSharePageId}
          currentUser={currentUser}
        />
      </div>
    );
  }

  // If user is not logged in, show login/register view
  if (!currentUser) {
    return (
      <div className="App">
        <Header />
        {authView === 'login' ? (
          <Login 
            onLogin={handleLogin}
            onSwitchToRegister={handleSwitchToRegister}
            onGuestLogin={handleGuestLogin}
          />
        ) : (
          <Register 
            onRegister={handleRegister}
            onSwitchToLogin={handleSwitchToLogin}
          />
        )}
      </div>
    );
  }

  return (
    <div className="App">
      <Header 
        onSettingsClick={handleOpenSettings}
        currentView={currentView}
        onViewChange={handleViewChange}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={handleCategoryFilterChange}
        currentUser={currentUser}
        onLogout={handleLogout}
        visible={headerVisible}
        onSearchChange={handleSearchChange}
      />
      {isSettingsOpen ? (
        <Settings onBack={handleCloseSettings} currentUser={currentUser} />
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
        />
      ) : selectedMenu ? (
        // Menu detail view - shown regardless of currentView
        <MenuDetail
          menu={selectedMenu}
          recipes={recipes}
          onBack={handleBackToMenuList}
          onEdit={handleEditMenu}
          onDelete={handleDeleteMenu}
          onSelectRecipe={handleSelectRecipe}
          onToggleMenuFavorite={handleToggleMenuFavorite}
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
          />
        ) : (
          <GroupList
            groups={groups}
            allUsers={allUsers}
            currentUser={currentUser}
            onSelectGroup={handleSelectGroup}
            onCreateGroup={handleCreateGroup}
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
      ) : (
        // Recipe views
        <>
          {isFilterPageOpen && (
            <FilterPage
              currentFilters={recipeFilters}
              onApply={handleApplyFilters}
              onCancel={handleCancelFilterPage}
              availableAuthors={allUsers.filter(u => (u.recipe_count ?? 0) > 0).map(u => ({ id: u.id, name: u.vorname }))}
              isAdmin={currentUser?.isAdmin || false}
              privateGroups={groups.filter(g => g.type === 'private')}
            />
          )}
          <RecipeList
            recipes={recipes.filter(recipe => 
              matchesCategoryFilter(recipe, categoryFilter) && 
              matchesDraftFilter(recipe, recipeFilters.showDrafts) &&
              matchesCuisineFilter(recipe, recipeFilters.selectedCuisines) &&
              matchesAuthorFilter(recipe, recipeFilters.selectedAuthors) &&
              matchesGroupFilter(recipe, recipeFilters.selectedGroup)
            )}
            onSelectRecipe={handleSelectRecipe}
            onAddRecipe={handleAddRecipe}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={handleCategoryFilterChange}
            currentUser={currentUser}
            searchTerm={searchTerm}
            onOpenFilterPage={handleOpenFilterPage}
            activePrivateListName={activePrivateListName}
            activePrivateListId={recipeFilters.selectedGroup || null}
          />
        </>
      )}
      {requiresPasswordChange && currentUser && (
        <PasswordChangeModal 
          user={currentUser}
          onPasswordChanged={handlePasswordChanged}
        />
      )}
    </div>
  );
}

export default App;
