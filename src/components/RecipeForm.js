import React, { useState, useEffect } from 'react';
import './RecipeForm.css';

function RecipeForm({ recipe, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [portionen, setPortionen] = useState(4);
  const [kulinarik, setKulinarik] = useState('');
  const [schwierigkeit, setSchwierigkeit] = useState(3);
  const [kochdauer, setKochdauer] = useState(30);
  const [speisekategorie, setSpeisekategorie] = useState('');
  const [ingredients, setIngredients] = useState(['']);
  const [steps, setSteps] = useState(['']);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (recipe) {
      setTitle(recipe.title || '');
      setImage(recipe.image || '');
      setPortionen(recipe.portionen || 4);
      setKulinarik(recipe.kulinarik || '');
      setSchwierigkeit(recipe.schwierigkeit || 3);
      setKochdauer(recipe.kochdauer || 30);
      setSpeisekategorie(recipe.speisekategorie || '');
      setIngredients(recipe.ingredients?.length > 0 ? recipe.ingredients : ['']);
      setSteps(recipe.steps?.length > 0 ? recipe.steps : ['']);
    }
  }, [recipe]);

  useEffect(() => {
    setImageError(false);
  }, [image]);

  const handleAddIngredient = () => {
    setIngredients([...ingredients, '']);
  };

  const handleRemoveIngredient = (index) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const handleIngredientChange = (index, value) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const handleAddStep = () => {
    setSteps([...steps, '']);
  };

  const handleRemoveStep = (index) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index));
    }
  };

  const handleStepChange = (index, value) => {
    const newSteps = [...steps];
    newSteps[index] = value;
    setSteps(newSteps);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Please enter a recipe title');
      return;
    }

    const recipeData = {
      id: recipe?.id,
      title: title.trim(),
      image: image.trim(),
      portionen: parseInt(portionen) || 4,
      kulinarik: kulinarik.trim(),
      schwierigkeit: parseInt(schwierigkeit) || 3,
      kochdauer: parseInt(kochdauer) || 30,
      speisekategorie: speisekategorie.trim(),
      ingredients: ingredients.filter(i => i.trim() !== ''),
      steps: steps.filter(s => s.trim() !== '')
    };

    onSave(recipeData);
  };

  return (
    <div className="recipe-form-container">
      <div className="recipe-form-header">
        <h2>{recipe ? 'Edit Recipe' : 'Add New Recipe'}</h2>
      </div>

      <form className="recipe-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Recipe Title *</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Spaghetti Carbonara"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="image">Image URL (optional)</label>
          <input
            type="url"
            id="image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
          {image && !imageError && (
            <div className="image-preview">
              <img src={image} alt="Preview" onError={() => setImageError(true)} />
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="portionen">Servings (Portionen)</label>
            <input
              type="number"
              id="portionen"
              value={portionen}
              onChange={(e) => setPortionen(e.target.value)}
              min="1"
              max="100"
              placeholder="4"
            />
          </div>

          <div className="form-group">
            <label htmlFor="kochdauer">Cooking Time (minutes)</label>
            <input
              type="number"
              id="kochdauer"
              value={kochdauer}
              onChange={(e) => setKochdauer(e.target.value)}
              min="1"
              max="1000"
              placeholder="30"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="kulinarik">Cuisine Type</label>
            <select
              id="kulinarik"
              value={kulinarik}
              onChange={(e) => setKulinarik(e.target.value)}
            >
              <option value="">Select cuisine...</option>
              <option value="Italian">Italian</option>
              <option value="Thai">Thai</option>
              <option value="Chinese">Chinese</option>
              <option value="Japanese">Japanese</option>
              <option value="Indian">Indian</option>
              <option value="Mexican">Mexican</option>
              <option value="French">French</option>
              <option value="German">German</option>
              <option value="American">American</option>
              <option value="Mediterranean">Mediterranean</option>
              <option value="Vegetarian">Vegetarian</option>
              <option value="Vegan">Vegan</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="speisekategorie">Meal Category</label>
            <select
              id="speisekategorie"
              value={speisekategorie}
              onChange={(e) => setSpeisekategorie(e.target.value)}
            >
              <option value="">Select category...</option>
              <option value="Appetizer">Appetizer</option>
              <option value="Main Course">Main Course</option>
              <option value="Dessert">Dessert</option>
              <option value="Soup">Soup</option>
              <option value="Salad">Salad</option>
              <option value="Snack">Snack</option>
              <option value="Beverage">Beverage</option>
              <option value="Side Dish">Side Dish</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="schwierigkeit">Difficulty Level</label>
          <div className="difficulty-selector">
            {[1, 2, 3, 4, 5].map((level) => (
              <label key={level} className="difficulty-option">
                <input
                  type="radio"
                  name="schwierigkeit"
                  value={level}
                  checked={schwierigkeit === level}
                  onChange={(e) => setSchwierigkeit(parseInt(e.target.value))}
                />
                <span className="star-rating">
                  {'⭐'.repeat(level)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h3>🥘 Ingredients</h3>
          {ingredients.map((ingredient, index) => (
            <div key={index} className="form-list-item">
              <input
                type="text"
                value={ingredient}
                onChange={(e) => handleIngredientChange(index, e.target.value)}
                placeholder={`Ingredient ${index + 1}`}
              />
              {ingredients.length > 1 && (
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => handleRemoveIngredient(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className="add-item-button" onClick={handleAddIngredient}>
            + Add Ingredient
          </button>
        </div>

        <div className="form-section">
          <h3>📝 Preparation Steps</h3>
          {steps.map((step, index) => (
            <div key={index} className="form-list-item">
              <span className="step-number">{index + 1}.</span>
              <textarea
                value={step}
                onChange={(e) => handleStepChange(index, e.target.value)}
                placeholder={`Step ${index + 1}`}
                rows="2"
              />
              {steps.length > 1 && (
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => handleRemoveStep(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" className="add-item-button" onClick={handleAddStep}>
            + Add Step
          </button>
        </div>

        <div className="form-actions">
          <button type="button" className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="save-button">
            {recipe ? 'Update Recipe' : 'Save Recipe'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default RecipeForm;
