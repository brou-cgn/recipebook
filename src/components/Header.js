import React from 'react';
import './Header.css';
import { getCustomLists } from '../utils/customLists';

function Header({ 
  onSettingsClick, 
  currentView, 
  onViewChange,
  categoryFilter,
  onCategoryFilterChange,
  currentUser,
  onLogout,
  onUserManagement
}) {
  const customLists = getCustomLists();
  
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-title">
          <h1>DishBook</h1>
          <p className="tagline">Unsere Besten</p>
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
            </div>
          )}
          {onSettingsClick && currentUser?.isAdmin && (
            <button className="settings-btn" onClick={onSettingsClick} title="Einstellungen">
              Einstellungen
            </button>
          )}
          {currentUser && (
            <div className="user-info">
              <span className="user-name">
                {currentUser.vorname} {currentUser.nachname}
                {currentUser.isAdmin && <span className="admin-badge">Admin</span>}
              </span>
              {onLogout && (
                <button className="logout-btn" onClick={onLogout} title="Abmelden">
                  Abmelden
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
