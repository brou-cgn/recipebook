import React, { useState } from 'react';
import './MenuFilterSidebar.css';

const COLLAPSED_STORAGE_KEY = 'menuFilterSidebar_collapsed';

function getStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persistent left-hand navigation for the menu overview, mirroring
 * RecipeFilterSidebar's layout (add button + collapsible pill filters)
 * but scoped to the single Favoriten quick filter menus offer.
 */
function MenuFilterSidebar({ onAddMenu, showFavoritesOnly = false, onFavoritesToggle }) {
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  return (
    <nav
      className={`menu-filter-sidebar${collapsed ? ' menu-filter-sidebar--collapsed' : ''}`}
      aria-label="Menüfilter"
    >
      <div className="menu-filter-sidebar-header">
        {!collapsed && (
          <button
            type="button"
            className="menu-filter-sidebar-add-button"
            onClick={onAddMenu}
            title="Menü hinzufügen"
            aria-label="Menü hinzufügen"
          >
            + Menü
          </button>
        )}
        <button
          type="button"
          className="menu-filter-sidebar-toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Filter einblenden' : 'Filter ausblenden'}
          title={collapsed ? 'Filter einblenden' : 'Filter ausblenden'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <polyline points="9 6 15 12 9 18" /> : <polyline points="15 6 9 12 15 18" />}
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="menu-filter-sidebar-section menu-filter-sidebar-quickfilters">
          <button
            type="button"
            className={`menu-filter-sidebar-pill menu-filter-sidebar-pill--quick${showFavoritesOnly ? ' active' : ''}`}
            onClick={() => onFavoritesToggle?.(!showFavoritesOnly)}
            aria-pressed={showFavoritesOnly}
            title={showFavoritesOnly ? 'Alle Festtafeln anzeigen' : 'Nur Favoriten anzeigen'}
          >
            ★ Favoriten
          </button>
        </div>
      )}
    </nav>
  );
}

export default MenuFilterSidebar;
