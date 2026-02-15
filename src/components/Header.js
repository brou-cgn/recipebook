import React, { useState, useEffect, useRef } from 'react';
import './Header.css';
import { getHeaderSlogan } from '../utils/customLists';
import SearchIcon from './icons/SearchIcon';

function Header({ 
  onSettingsClick, 
  currentView, 
  onViewChange,
  categoryFilter,
  onCategoryFilterChange,
  currentUser,
  onLogout,
  onUserManagement,
  visible = true,
  onSearchChange
}) {
  const [headerSlogan, setHeaderSlogan] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  
  useEffect(() => {
    const loadHeaderData = async () => {
      const slogan = await getHeaderSlogan();
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
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    if (menuOpen || searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen, searchOpen]);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
    if (!searchOpen) {
      // Focus the search input when opening (delay allows animation to complete)
      const SEARCH_FOCUS_DELAY = 100;
      setTimeout(() => {
        searchRef.current?.querySelector('input')?.focus();
      }, SEARCH_FOCUS_DELAY);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  const handleSearchClear = () => {
    setSearchTerm('');
    if (onSearchChange) {
      onSearchChange('');
    }
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
          {onSettingsClick && currentUser?.isAdmin && (
            <button className="settings-btn" onClick={onSettingsClick} title="Einstellungen">
              Einstellungen
            </button>
          )}
          {currentUser && currentView === 'recipes' && (
            <>
              <div className="search-container" ref={searchRef}>
                <button 
                  className="search-btn" 
                  onClick={toggleSearch}
                  aria-label="Suche"
                  title="Suche"
                >
                  <SearchIcon color="white" size={20} />
                </button>
                {searchOpen && (
                  <div className="search-input-container">
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Rezepte durchsuchen..."
                      value={searchTerm}
                      onChange={handleSearchChange}
                    />
                    {searchTerm && (
                      <button 
                        className="search-clear-btn"
                        onClick={handleSearchClear}
                        aria-label="Suche löschen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
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
                    {onSettingsClick && currentUser?.isAdmin && (
                      <button className="menu-item mobile-only-item" onClick={() => {
                        onSettingsClick();
                        setMenuOpen(false);
                      }}>
                        Einstellungen
                      </button>
                    )}
                    {onLogout && (
                      <button className="menu-item logout-item" onClick={handleLogoutInternal}>
                        Abmelden
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
