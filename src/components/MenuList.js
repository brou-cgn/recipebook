import React from 'react';
import './MenuList.css';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu }) {
  const getRecipeCount = (menu) => {
    return menu.recipeIds?.length || 0;
  };

  return (
    <div className="menu-list-container">
      <div className="menu-list-header">
        <h2>Meine Menüs</h2>
        <button className="add-menu-button" onClick={onAddMenu}>
          + Menü erstellen
        </button>
      </div>
      
      {menus.length === 0 ? (
        <div className="empty-state">
          <p>Noch keine Menüs!</p>
          <p className="empty-hint">Tippen Sie auf "Menü erstellen", um Ihre Rezepte in Menüs zu organisieren</p>
        </div>
      ) : (
        <div className="menu-grid">
          {menus.map(menu => (
            <div
              key={menu.id}
              className="menu-card"
              onClick={() => onSelectMenu(menu)}
            >
              <div className="menu-card-content">
                <h3>{menu.name}</h3>
                {menu.description && (
                  <p className="menu-description">{menu.description}</p>
                )}
                <div className="menu-meta">
                  <span>{getRecipeCount(menu)} Rezepte</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MenuList;
