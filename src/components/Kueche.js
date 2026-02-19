import React from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';

function Kueche({ recipes, onSelectRecipe, allUsers }) {
  return (
    <div className="kueche-container">
      <div className="kueche-header">
        <h2>Küche</h2>
      </div>
      <RecipeTimeline
        recipes={recipes}
        onSelectRecipe={onSelectRecipe}
        allUsers={allUsers}
      />
    </div>
  );
}

export default Kueche;
