import React from 'react';
import './Header.css';

function Header({ onSettingsClick, currentView, onViewChange }) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-title">
          <h1>🍳 RecipeBook</h1>
          <p className="tagline">Your Digital Recipe Collection</p>
        </div>
        <div className="header-actions">
          {onViewChange && (
            <div className="view-toggle">
              <button
                className={`toggle-btn ${currentView === 'recipes' ? 'active' : ''}`}
                onClick={() => onViewChange('recipes')}
              >
                Recipes
              </button>
              <button
                className={`toggle-btn ${currentView === 'menus' ? 'active' : ''}`}
                onClick={() => onViewChange('menus')}
              >
                Menus
              </button>
            </div>
          )}
          {onSettingsClick && (
            <button className="settings-btn" onClick={onSettingsClick} title="Settings">
              ⚙️ Settings
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
