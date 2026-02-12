import React, { useState, useEffect } from 'react';
import './Settings.css';
import { getCustomLists, saveCustomLists, resetCustomLists } from '../utils/customLists';

function Settings({ onBack }) {
  const [lists, setLists] = useState({
    cuisineTypes: [],
    mealCategories: [],
    units: []
  });
  const [newCuisine, setNewCuisine] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');

  useEffect(() => {
    setLists(getCustomLists());
  }, []);

  const handleSave = () => {
    saveCustomLists(lists);
    alert('Settings saved successfully!');
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all lists to defaults?')) {
      const defaultLists = resetCustomLists();
      setLists(defaultLists);
      alert('Lists reset to defaults!');
    }
  };

  const addCuisine = () => {
    if (newCuisine.trim() && !lists.cuisineTypes.includes(newCuisine.trim())) {
      setLists({
        ...lists,
        cuisineTypes: [...lists.cuisineTypes, newCuisine.trim()]
      });
      setNewCuisine('');
    }
  };

  const removeCuisine = (cuisine) => {
    setLists({
      ...lists,
      cuisineTypes: lists.cuisineTypes.filter(c => c !== cuisine)
    });
  };

  const addCategory = () => {
    if (newCategory.trim() && !lists.mealCategories.includes(newCategory.trim())) {
      setLists({
        ...lists,
        mealCategories: [...lists.mealCategories, newCategory.trim()]
      });
      setNewCategory('');
    }
  };

  const removeCategory = (category) => {
    setLists({
      ...lists,
      mealCategories: lists.mealCategories.filter(c => c !== category)
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

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        <h2>⚙️ Settings</h2>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>Cuisine Types</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCuisine()}
              placeholder="Add new cuisine type..."
            />
            <button onClick={addCuisine}>Add</button>
          </div>
          <div className="list-items">
            {lists.cuisineTypes.map((cuisine) => (
              <div key={cuisine} className="list-item">
                <span>{cuisine}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeCuisine(cuisine)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Meal Categories</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Add new meal category..."
            />
            <button onClick={addCategory}>Add</button>
          </div>
          <div className="list-items">
            {lists.mealCategories.map((category) => (
              <div key={category} className="list-item">
                <span>{category}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeCategory(category)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Measurement Units</h3>
          <div className="list-input">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addUnit()}
              placeholder="Add new unit..."
            />
            <button onClick={addUnit}>Add</button>
          </div>
          <div className="list-items">
            {lists.units.map((unit) => (
              <div key={unit} className="list-item">
                <span>{unit}</span>
                <button
                  className="remove-btn"
                  onClick={() => removeUnit(unit)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button className="reset-button" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button className="save-button" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
