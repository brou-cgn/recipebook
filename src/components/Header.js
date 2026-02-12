import React from 'react';
import './Header.css';
import { getCustomLists } from '../utils/customLists';

function Header({ 
  onSettingsClick, 
  currentView, 
  onViewChange,
  categoryFilter,
  onCategoryFilterChange,
  showFavoritesOnly,
  onToggleFavoritesFilter
}) {
  const customLists = getCustomLists();
  
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-title">
          <h1>RecipeBook</h1>
          <p className="tagline">Ihre digitale Rezeptsammlung</p>
        </div>
        <div className="header-actions">
          {onViewChange && (
            <div className="view-toggle">
              <button
                className={`toggle-btn ${currentView === 'recipes' ? 'active' : ''}`}
                onClick={() => onViewChange('recipes')}
              >
                Rezepte
              </button>
              <button
                className={`toggle-btn ${currentView === 'menus' ? 'active' : ''}`}
                onClick={() => onViewChange('menus')}
              >
                Menüs
              </button>
            </div>
          )}
          {currentView === 'recipes' && onCategoryFilterChange && (
            <div className="filter-controls">
              <select
                className="category-filter"
                value={categoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
                title="Nach Kategorie filtern"
              >
                <option value="">Alle Kategorien</option>
                {customLists.mealCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <button
                className={`favorites-filter ${showFavoritesOnly ? 'active' : ''}`}
                onClick={onToggleFavoritesFilter}
                title={showFavoritesOnly ? 'Alle anzeigen' : 'Nur Favoriten anzeigen'}
              >
                ★ Favoriten
              </button>
            </div>
          )}
          {onSettingsClick && (
            <button className="settings-btn" onClick={onSettingsClick} title="Einstellungen">
              Einstellungen
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
