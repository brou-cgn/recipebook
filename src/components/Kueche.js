import React, { useState, useEffect } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import { getTimelineBubbleIcon } from '../utils/customLists';

function Kueche({ recipes, onSelectRecipe, allUsers, currentUser }) {
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);

  useEffect(() => {
    getTimelineBubbleIcon().then(setTimelineBubbleIcon).catch(() => {});
  }, []);

  const filteredRecipes = currentUser
    ? recipes.filter(r => r.authorId === currentUser.id)
    : recipes;

  return (
    <div className="kueche-container">
      <div className="kueche-header">
        <h2>Küche</h2>
      </div>
      <RecipeTimeline
        recipes={filteredRecipes}
        onSelectRecipe={onSelectRecipe}
        allUsers={allUsers}
        timelineBubbleIcon={timelineBubbleIcon}
      />
    </div>
  );
}

export default Kueche;
