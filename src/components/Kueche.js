import React, { useState, useEffect } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import { getTimelineBubbleIcon, getTimelineRecipeDefaultImage, getTimelineMenuDefaultImage } from '../utils/customLists';

function Kueche({ recipes, menus = [], onSelectRecipe, onSelectMenu, allUsers, currentUser }) {
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineRecipeDefaultImage, setTimelineRecipeDefaultImage] = useState(null);
  const [timelineMenuDefaultImage, setTimelineMenuDefaultImage] = useState(null);

  useEffect(() => {
    Promise.all([
      getTimelineBubbleIcon(),
      getTimelineRecipeDefaultImage(),
      getTimelineMenuDefaultImage(),
    ]).then(([icon, recipeImg, menuImg]) => {
      setTimelineBubbleIcon(icon);
      setTimelineRecipeDefaultImage(recipeImg);
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
    createdAt: menu.createdAt,
    ingredients: menu.recipeIds || [],
    steps: [],
    authorId: menu.authorId || menu.createdBy,
    itemType: 'menu',
    _defaultImage: timelineMenuDefaultImage,
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
      <RecipeTimeline
        recipes={combinedItems}
        onSelectRecipe={handleSelectItem}
        allUsers={allUsers}
        timelineBubbleIcon={timelineBubbleIcon}
        defaultImage={timelineRecipeDefaultImage}
      />
    </div>
  );
}

export default Kueche;
