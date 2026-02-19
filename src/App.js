import React, { useState, useEffect } from 'react';
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
import { 
  loginUser, 
  logoutUser, 
  registerUser,
  loginAsGuest,
  getUsers,
  onAuthStateChange
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
  seedSampleRecipes
} from './utils/recipeFirestore';
import {
  subscribeToMenus,
  addMenu as addMenuToFirestore,
  updateMenu as updateMenuInFirestore,
  deleteMenu as deleteMenuFromFirestore
} from './utils/menuFirestore';

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
    showDrafts: 'all'
  });

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
    const loadFavicon = async () => {
      await applyFaviconSettings();
    };
    loadFavicon();
  }, []);

  // Set up real-time listener for recipes from Firestore
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
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Migrate old global favorites to user-specific favorites (one-time migration)
  useEffect(() => {
    if (currentUser && recipesLoaded && recipes.length > 0) {
      migrateGlobalFavorites(currentUser.id, recipes);
    }
  }, [currentUser, recipesLoaded, recipes]);

  // Set up real-time listener for menus from Firestore
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToMenus(currentUser.id, (menusFromFirestore) => {
      setMenus(menusFromFirestore);
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

  const handleAddRecipe = () => {
    setEditingRecipe(null);
    setIsCreatingVersion(false);
    setIsFormOpen(true);
  };

  const handleEditRecipe = (recipe) => {
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
        await updateRecipeInFirestore(id, updates);
      } else {
        // Add new recipe or new version
        await addRecipeToFirestore(recipe, currentUser.id);
      }
      setIsFormOpen(false);
      setEditingRecipe(null);
      setIsCreatingVersion(false);
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

  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingRecipe(null);
    setIsCreatingVersion(false);
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
          onToggleFavorite={handleToggleFavorite}
          onCreateVersion={handleCreateVersion}
          currentUser={currentUser}
          allRecipes={recipes}
          allUsers={allUsers}
          onHeaderVisibilityChange={handleHeaderVisibilityChange}
        />
      ) : currentView === 'menus' ? (
        // Menu views
        isMenuFormOpen ? (
          <MenuForm
            menu={editingMenu}
            recipes={recipes}
            onSave={handleSaveMenu}
            onCancel={handleCancelMenuForm}
            currentUser={currentUser}
          />
        ) : selectedMenu ? (
          <MenuDetail
            menu={selectedMenu}
            recipes={recipes}
            onBack={handleBackToMenuList}
            onEdit={handleEditMenu}
            onDelete={handleDeleteMenu}
            onSelectRecipe={handleSelectRecipe}
            onToggleMenuFavorite={handleToggleMenuFavorite}
            currentUser={currentUser}
          />
        ) : (
          <MenuList
            menus={menus}
            recipes={recipes}
            onSelectMenu={handleSelectMenu}
            onAddMenu={handleAddMenu}
            onToggleMenuFavorite={handleToggleMenuFavorite}
            currentUser={currentUser}
          />
        )
      ) : (
        // Recipe views
        isFormOpen ? (
          <RecipeForm
            recipe={editingRecipe}
            onSave={handleSaveRecipe}
            onBulkImport={handleBulkImportRecipes}
            onCancel={handleCancelForm}
            currentUser={currentUser}
            isCreatingVersion={isCreatingVersion}
            allRecipes={recipes}
          />
        ) : (
          <RecipeList
            recipes={recipes.filter(recipe => 
              matchesCategoryFilter(recipe, categoryFilter) && 
              matchesDraftFilter(recipe, recipeFilters.showDrafts)
            )}
            onSelectRecipe={handleSelectRecipe}
            onAddRecipe={handleAddRecipe}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={handleCategoryFilterChange}
            currentUser={currentUser}
            searchTerm={searchTerm}
            onOpenFilterPage={handleOpenFilterPage}
          />
        )
      ) : currentView === 'recipes' && isFilterPageOpen ? (
        <FilterPage
          currentFilters={recipeFilters}
          onApply={handleApplyFilters}
          onCancel={handleCancelFilterPage}
        />
      ) : null}
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
