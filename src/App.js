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

function App() {
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState('recipes');
  const [menus, setMenus] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [isMenuFormOpen, setIsMenuFormOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Load recipes from localStorage on mount
  useEffect(() => {
    const savedRecipes = localStorage.getItem('recipes');
    if (savedRecipes) {
      setRecipes(JSON.parse(savedRecipes));
    } else {
      // Load sample recipes if none exist
      setRecipes(getSampleRecipes());
    }
  }, []);

  // Save recipes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('recipes', JSON.stringify(recipes));
  }, [recipes]);

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
    setIsFormOpen(true);
  };

  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setIsFormOpen(true);
    setSelectedRecipe(null);
  };

  const handleSaveRecipe = (recipe) => {
    if (editingRecipe) {
      // Update existing recipe
      setRecipes(recipes.map(r => r.id === recipe.id ? recipe : r));
    } else {
      // Add new recipe
      const newRecipe = {
        ...recipe,
        id: Date.now().toString()
      };
      setRecipes([...recipes, newRecipe]);
    }
    setIsFormOpen(false);
    setEditingRecipe(null);
  };

  const handleDeleteRecipe = (recipeId) => {
    setRecipes(recipes.filter(r => r.id !== recipeId));
    setSelectedRecipe(null);
  };

  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingRecipe(null);
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
    setRecipes(recipes.map(r => 
      r.id === recipeId ? { ...r, isFavorite: !r.isFavorite } : r
    ));
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
      />
      {isSettingsOpen ? (
        <Settings onBack={handleCloseSettings} />
      ) : currentView === 'menus' ? (
        // Menu views
        isMenuFormOpen ? (
          <MenuForm
            menu={editingMenu}
            recipes={recipes}
            onSave={handleSaveMenu}
            onCancel={handleCancelMenuForm}
          />
        ) : selectedMenu ? (
          <MenuDetail
            menu={selectedMenu}
            recipes={recipes}
            onBack={handleBackToMenuList}
            onEdit={handleEditMenu}
            onDelete={handleDeleteMenu}
            onSelectRecipe={handleSelectRecipe}
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
          />
        ) : selectedRecipe ? (
          <RecipeDetail
            recipe={selectedRecipe}
            onBack={handleBackToList}
            onEdit={handleEditRecipe}
            onDelete={handleDeleteRecipe}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : (
          <RecipeList
            recipes={recipes.filter(recipe => {
              // Apply category filter
              if (categoryFilter && recipe.speisekategorie !== categoryFilter) {
                return false;
              }
              // Apply favorites filter
              if (showFavoritesOnly && !recipe.isFavorite) {
                return false;
              }
              return true;
            })}
            onSelectRecipe={handleSelectRecipe}
            onAddRecipe={handleAddRecipe}
          />
        )
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
