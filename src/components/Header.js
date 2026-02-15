import React, { useState, useEffect, useRef } from 'react';
import './Header.css';
import { getCustomLists, getHeaderSlogan } from '../utils/customLists';

function Header({ 
  onSettingsClick, 
  currentView, 
  onViewChange,
  categoryFilter,
  onCategoryFilterChange,
  currentUser,
  onLogout,
  onUserManagement,
  visible = true
}) {
  const [customLists, setCustomLists] = useState({ mealCategories: [] });
  const [headerSlogan, setHeaderSlogan] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  
  useEffect(() => {
    const loadHeaderData = async () => {
      const lists = await getCustomLists();
      const slogan = await getHeaderSlogan();
      setCustomLists(lists);
      setHeaderSlogan(slogan);
    };
    loadHeaderData();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const handleViewChangeInternal = (view) => {
    if (onViewChange) {
      onViewChange(view);
    }
    setMenuOpen(false);
  };

  const handleLogoutInternal = () => {
    if (onLogout) {
      onLogout();
    }
    setMenuOpen(false);
  };
  
  return (
    <header className={`header ${!visible ? 'header-hidden' : ''}`}>
      <div className="header-content">
        <div className="header-title">
          <h1>DishBook</h1>
          <p className="tagline">{headerSlogan}</p>
        </div>
        <div className="header-actions">
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
            <div className="hamburger-menu-container" ref={menuRef}>
              <button 
                className="hamburger-btn" 
                onClick={toggleMenu}
                aria-label="Menü öffnen"
                aria-expanded={menuOpen}
              >
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
              </button>
              {menuOpen && (
                <div className="hamburger-dropdown">
                  {onViewChange && (
                    <div className="menu-section">
                      <div className="menu-section-title">Navigation</div>
                      <button
                        className={`menu-item ${currentView === 'recipes' ? 'active' : ''}`}
                        onClick={() => handleViewChangeInternal('recipes')}
                      >
                        Rezeptübersicht
                      </button>
                      <button
                        className={`menu-item ${currentView === 'menus' ? 'active' : ''}`}
                        onClick={() => handleViewChangeInternal('menus')}
                      >
                        Menüübersicht
                      </button>
                    </div>
                  )}
                  <div className="menu-section">
                    <div className="menu-section-title">Benutzer</div>
                    <div className="menu-user-info">
                      <span className="menu-user-name">
                        {currentUser.vorname} {currentUser.nachname}
                      </span>
                      {currentUser.isAdmin && (
                        <span className="admin-badge">Admin</span>
                      )}
                    </div>
                    {onLogout && (
                      <button className="menu-item logout-item" onClick={handleLogoutInternal}>
                        Abmelden
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
