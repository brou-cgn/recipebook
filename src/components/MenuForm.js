import React, { useState, useEffect } from 'react';
import './MenuForm.css';

function MenuForm({ menu, recipes, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRecipes, setSelectedRecipes] = useState([]);

  useEffect(() => {
    if (menu) {
      setName(menu.name || '');
      setDescription(menu.description || '');
      setSelectedRecipes(menu.recipeIds || []);
    }
  }, [menu]);

  const handleToggleRecipe = (recipeId) => {
    if (selectedRecipes.includes(recipeId)) {
      setSelectedRecipes(selectedRecipes.filter(id => id !== recipeId));
    } else {
      setSelectedRecipes([...selectedRecipes, recipeId]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      alert('Please enter a menu name');
      return;
    }

    if (selectedRecipes.length === 0) {
      alert('Please select at least one recipe');
      return;
    }

    const menuData = {
      id: menu?.id,
      name: name.trim(),
      description: description.trim(),
      recipeIds: selectedRecipes
    };

    onSave(menuData);
  };

  return (
    <div className="menu-form-container">
      <div className="menu-form-header">
        <h2>{menu ? 'Edit Menu' : 'Create New Menu'}</h2>
      </div>

      <form className="menu-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="menuName">Menu Name *</label>
          <input
            type="text"
            id="menuName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Sunday Dinner, Holiday Feast"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="menuDescription">Description (optional)</label>
          <textarea
            id="menuDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe this menu..."
            rows="3"
          />
        </div>

        <div className="form-section">
          <h3>Select Recipes</h3>
          {recipes.length === 0 ? (
            <p className="no-recipes">No recipes available. Please create some recipes first.</p>
          ) : (
            <div className="recipe-selection">
              {recipes.map((recipe) => (
                <label key={recipe.id} className="recipe-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRecipes.includes(recipe.id)}
                    onChange={() => handleToggleRecipe(recipe.id)}
                  />
                  <span className="recipe-name">{recipe.title}</span>
                  {recipe.isFavorite && <span className="favorite-indicator">★</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="save-button">
            {menu ? 'Update Menu' : 'Create Menu'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default MenuForm;
