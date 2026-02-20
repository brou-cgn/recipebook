import React, { useState, useEffect } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import { getTimelineBubbleIcon, getTimelineMenuBubbleIcon, getTimelineMenuDefaultImage } from '../utils/customLists';
import { getCategoryImages } from '../utils/categoryImages';

function Kueche({ recipes, menus = [], onSelectRecipe, onSelectMenu, allUsers, currentUser }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineMenuBubbleIcon, setTimelineMenuBubbleIcon] = useState(null);
  const [categoryImages, setCategoryImages] = useState([]);
  const [timelineMenuDefaultImage, setTimelineMenuDefaultImage] = useState(null);

  useEffect(() => {
    Promise.all([
      getTimelineBubbleIcon(),
      getTimelineMenuBubbleIcon(),
      getCategoryImages(),
      getTimelineMenuDefaultImage(),
    ]).then(([icon, menuIcon, catImages, menuImg]) => {
      setTimelineBubbleIcon(icon);
      setTimelineMenuBubbleIcon(menuIcon);
      setCategoryImages(catImages);
      setTimelineMenuDefaultImage(menuImg);
    }).catch(() => {});
  }, []);

  const filteredRecipes = currentUser
    ? recipes.filter(r => r.authorId === currentUser.id)
    : recipes;

  const filteredMenus = currentUser
    ? menus.filter(m => (m.authorId || m.createdBy) === currentUser.id)
    : menus;

  // Transform menus into the shape expected by RecipeTimeline
  const menuTimelineItems = filteredMenus.map(menu => ({
    id: menu.id,
    title: menu.name,
    createdAt: menu.menuDate ? new Date(menu.menuDate) : menu.createdAt,
    ingredients: menu.recipeIds || [],
    steps: [],
    authorId: menu.authorId || menu.createdBy,
    itemType: 'menu',
  }));

  const combinedItems = [...filteredRecipes, ...menuTimelineItems];

  const handleSelectItem = (item) => {
    if (item.itemType === 'menu') {
      const menu = filteredMenus.find(m => m.id === item.id);
      if (menu && onSelectMenu) onSelectMenu(menu);
    } else {
      if (onSelectRecipe) onSelectRecipe(item);
    }
  };

  return (
    <div className="kueche-container">
      <div className="kueche-header">
        <h2>Küche</h2>
      </div>
      <div
        className="kueche-tile"
        onClick={() => setShowTimeline(prev => !prev)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowTimeline(prev => !prev); } }}
        role="button"
        tabIndex={0}
        aria-expanded={showTimeline}
        aria-label="Toggle Meine Küche timeline"
      >
        <div className="kueche-tile-content">
          <h3>Mein Kochbuch</h3>
          <div className="kueche-tile-meta">
            <span className="meta-text">
              <strong>{filteredRecipes.length}</strong>
              <span>{filteredRecipes.length === 1 ? 'Rezept' : 'Rezepte'}</span>
            </span>
            <span className="meta-text">
              <strong>{filteredMenus.length}</strong>
              <span>{filteredMenus.length === 1 ? 'Menü' : 'Menüs'}</span>
            </span>
          </div>
        </div>
      </div>
      {showTimeline && (
        <RecipeTimeline
          recipes={combinedItems}
          onSelectRecipe={handleSelectItem}
          allUsers={allUsers}
          timelineBubbleIcon={timelineBubbleIcon}
          timelineMenuBubbleIcon={timelineMenuBubbleIcon}
          categoryImages={categoryImages}
          defaultImage={timelineMenuDefaultImage}
        />
      )}
    </div>
  );
}

export default Kueche;
