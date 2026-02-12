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
import { 
  loginUser, 
  logoutUser, 
  getCurrentUser, 
  registerUser,
  loginAsGuest
} from './utils/userManagement';
import { 
  toggleFavorite,
  isRecipeFavorite,
  migrateGlobalFavorites
} from './utils/userFavorites';

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
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('login'); // 'login' or 'register'
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  // Check for existing user session on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  // Load recipes from localStorage on mount
  useEffect(() => {
    const savedRecipes = localStorage.getItem('recipes');
    if (savedRecipes) {
      setRecipes(JSON.parse(savedRecipes));
    } else {
      // Load sample recipes if none exist
      setRecipes(getSampleRecipes());
    }
    setRecipesLoaded(true);
  }, []);

  // Migrate old global favorites to user-specific favorites (one-time migration)
  useEffect(() => {
    if (currentUser && recipesLoaded && recipes.length > 0) {
      migrateGlobalFavorites(currentUser.id, recipes);
    }
  }, [currentUser, recipesLoaded, recipes]);

  // Save recipes to localStorage whenever they change (but only after initial load)
  useEffect(() => {
    if (recipesLoaded) {
      localStorage.setItem('recipes', JSON.stringify(recipes));
    }
  }, [recipes, recipesLoaded]);

  // Load menus from localStorage on mount
  useEffect(() => {
    const savedMenus = localStorage.getItem('menus');
    if (savedMenus) {
      setMenus(JSON.parse(savedMenus));
    }
  }, []);

  // Save menus to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('menus', JSON.stringify(menus));
  }, [menus]);

  const handleSelectRecipe = (recipe) => {
    setSelectedRecipe(recipe);
  };

  const handleBackToList = () => {
    setSelectedRecipe(null);
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

  const handleSaveRecipe = (recipe) => {
    if (editingRecipe && !isCreatingVersion) {
      // Update existing recipe (direct edit)
      setRecipes(recipes.map(r => r.id === recipe.id ? recipe : r));
    } else {
      // Add new recipe or new version
      const newRecipe = {
        ...recipe,
        id: Date.now().toString()
      };
      setRecipes([...recipes, newRecipe]);
    }
    setIsFormOpen(false);
    setEditingRecipe(null);
    setIsCreatingVersion(false);
  };

  const handleDeleteRecipe = (recipeId) => {
    setRecipes(recipes.filter(r => r.id !== recipeId));
    setSelectedRecipe(null);
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

  const handleToggleFavorite = (recipeId) => {
    if (!currentUser) return;
    
    // Toggle in user-specific favorites storage
    toggleFavorite(currentUser.id, recipeId);
    
    // Trigger a re-render by updating state (but we don't modify the recipe objects anymore)
    // Force update by setting state to a new array reference
    setRecipes([...recipes]);
    
    // Update selectedRecipe to trigger re-render if it's the one being toggled
    if (selectedRecipe && selectedRecipe.id === recipeId) {
      setSelectedRecipe({ ...selectedRecipe });
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
    setShowFavoritesOnly(false);
  };

  const handleCategoryFilterChange = (category) => {
    setCategoryFilter(category);
  };

  const handleToggleFavoritesFilter = () => {
    setShowFavoritesOnly(!showFavoritesOnly);
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

  const handleSaveMenu = (menu) => {
    if (editingMenu) {
      // Update existing menu
      setMenus(menus.map(m => m.id === menu.id ? menu : m));
    } else {
      // Add new menu
      const newMenu = {
        ...menu,
        id: Date.now().toString()
      };
      setMenus([...menus, newMenu]);
    }
    setIsMenuFormOpen(false);
    setEditingMenu(null);
  };

  const handleDeleteMenu = (menuId) => {
    setMenus(menus.filter(m => m.id !== menuId));
    setSelectedMenu(null);
  };

  const handleCancelMenuForm = () => {
    setIsMenuFormOpen(false);
    setEditingMenu(null);
  };

  // User authentication handlers
  const handleLogin = (email, password) => {
    const result = loginUser(email, password);
    if (result.success) {
      setCurrentUser(result.user);
      if (result.requiresPasswordChange) {
        setRequiresPasswordChange(true);
      }
    }
    return result;
  };

  const handlePasswordChanged = () => {
    setRequiresPasswordChange(false);
    // Refresh current user to update the requiresPasswordChange flag
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setRequiresPasswordChange(false);
  };

  const handleRegister = (userData) => {
    const result = registerUser(userData);
    return result;
  };

  const handleSwitchToLogin = () => {
    setAuthView('login');
  };

  const handleSwitchToRegister = () => {
    setAuthView('register');
  };

  const handleGuestLogin = () => {
    const result = loginAsGuest();
    if (result.success) {
      setCurrentUser(result.user);
    }
    return result;
  };

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
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavoritesFilter={handleToggleFavoritesFilter}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      {isSettingsOpen ? (
        <Settings onBack={handleCloseSettings} currentUser={currentUser} />
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
            currentUser={currentUser}
          />
        ) : (
          <MenuList
            menus={menus}
            recipes={recipes}
            onSelectMenu={handleSelectMenu}
            onAddMenu={handleAddMenu}
          />
        )
      ) : (
        // Recipe views
        isFormOpen ? (
          <RecipeForm
            recipe={editingRecipe}
            onSave={handleSaveRecipe}
            onCancel={handleCancelForm}
            currentUser={currentUser}
            isCreatingVersion={isCreatingVersion}
          />
        ) : selectedRecipe ? (
          <RecipeDetail
            recipe={selectedRecipe}
            onBack={handleBackToList}
            onEdit={handleEditRecipe}
            onDelete={handleDeleteRecipe}
            onToggleFavorite={handleToggleFavorite}
            onCreateVersion={handleCreateVersion}
            currentUser={currentUser}
            allRecipes={recipes}
          />
        ) : (
          <RecipeList
            recipes={recipes.filter(recipe => {
              // Apply category filter
              if (categoryFilter && recipe.speisekategorie !== categoryFilter) {
                return false;
              }
              // Apply favorites filter - check user-specific favorites
              if (showFavoritesOnly && !isRecipeFavorite(currentUser?.id, recipe.id)) {
                return false;
              }
              return true;
            })}
            onSelectRecipe={handleSelectRecipe}
            onAddRecipe={handleAddRecipe}
            categoryFilter={categoryFilter}
            showFavoritesOnly={showFavoritesOnly}
            currentUser={currentUser}
          />
        )
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

function getSampleRecipes() {
  return [
    {
      id: '1',
      title: 'Spaghetti Carbonara',
      image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400',
      portionen: 4,
      kulinarik: 'Italian',
      schwierigkeit: 3,
      kochdauer: 30,
      speisekategorie: 'Main Course',
      ingredients: [
        '400g Spaghetti',
        '200g Pancetta or Guanciale',
        '4 egg yolks',
        '100g Pecorino Romano cheese',
        'Black pepper',
        'Salt'
      ],
      steps: [
        'Cook spaghetti in salted boiling water according to package instructions.',
        'While pasta cooks, cut pancetta into small pieces and fry until crispy.',
        'In a bowl, mix egg yolks with grated Pecorino Romano and black pepper.',
        'Drain pasta, reserving 1 cup of pasta water.',
        'Add hot pasta to pancetta pan, remove from heat.',
        'Quickly mix in egg mixture, adding pasta water to create a creamy sauce.',
        'Serve immediately with extra cheese and black pepper.'
      ]
    },
    {
      id: '2',
      title: 'Classic Margherita Pizza',
      image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400',
      portionen: 2,
      kulinarik: 'Italian',
      schwierigkeit: 2,
      kochdauer: 25,
      speisekategorie: 'Main Course',
      ingredients: [
        '500g Pizza dough',
        '200g San Marzano tomatoes',
        '200g Fresh mozzarella',
        'Fresh basil leaves',
        '2 tbsp Olive oil',
        'Salt',
        'Oregano'
      ],
      steps: [
        'Preheat oven to 250°C (480°F).',
        'Roll out pizza dough to desired thickness.',
        'Crush tomatoes and spread evenly on dough, leaving a border.',
        'Season with salt and oregano.',
        'Tear mozzarella and distribute over the pizza.',
        'Drizzle with olive oil.',
        'Bake for 10-12 minutes until crust is golden.',
        'Top with fresh basil leaves before serving.'
      ]
    },
    {
      id: '3',
      title: 'Chocolate Chip Cookies',
      image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',
      portionen: 24,
      kulinarik: 'American',
      schwierigkeit: 1,
      kochdauer: 40,
      speisekategorie: 'Dessert',
      ingredients: [
        '200g Butter, softened',
        '150g Brown sugar',
        '100g White sugar',
        '2 Eggs',
        '2 tsp Vanilla extract',
        '300g All-purpose flour',
        '1 tsp Baking soda',
        '1/2 tsp Salt',
        '300g Chocolate chips'
      ],
      steps: [
        'Preheat oven to 180°C (350°F).',
        'Cream together butter and both sugars until fluffy.',
        'Beat in eggs and vanilla extract.',
        'In separate bowl, mix flour, baking soda, and salt.',
        'Gradually blend dry ingredients into wet mixture.',
        'Fold in chocolate chips.',
        'Drop spoonfuls of dough onto baking sheets.',
        'Bake for 10-12 minutes until edges are golden.',
        'Cool on baking sheet for 5 minutes before transferring.'
      ]
    }
  ];
}

export default App;
