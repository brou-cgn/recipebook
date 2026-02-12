import React from 'react';
import './Header.css';

function Header({ onSettingsClick, currentView, onViewChange }) {
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
