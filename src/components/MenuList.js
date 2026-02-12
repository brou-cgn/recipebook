import React from 'react';
import './MenuList.css';

function MenuList({ menus, recipes, onSelectMenu, onAddMenu }) {
  const getRecipeCount = (menu) => {
    return menu.recipeIds?.length || 0;
  };

  return (
    <div className="menu-list-container">
      <div className="menu-list-header">
        <h2>My Menus</h2>
        <button className="add-menu-button" onClick={onAddMenu}>
          + Create Menu
        </button>
      </div>
      
      {menus.length === 0 ? (
        <div className="empty-state">
          <p>No menus yet!</p>
          <p className="empty-hint">Tap "Create Menu" to organize your recipes into menus</p>
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
                  <span>📋 {getRecipeCount(menu)} recipes</span>
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
