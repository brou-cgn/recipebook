import React, { useState, useEffect } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import { getTimelineBubbleIcon } from '../utils/customLists';

function Kueche({ recipes, onSelectRecipe, allUsers }) {
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);

  useEffect(() => {
    getTimelineBubbleIcon().then(setTimelineBubbleIcon).catch(() => {});
  }, []);

  return (
    <div className="kueche-container">
      <div className="kueche-header">
        <h2>Küche</h2>
      </div>
      <RecipeTimeline
        recipes={recipes}
        onSelectRecipe={onSelectRecipe}
        allUsers={allUsers}
        timelineBubbleIcon={timelineBubbleIcon}
      />
    </div>
  );
}

export default Kueche;
