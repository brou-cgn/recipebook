import React from 'react';
import './TrendingCard.css';

function renderDifficultyStars(level) {
  return (
    <span className="trending-card-stars" aria-label={`Schwierigkeit ${level} von 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`trending-card-star ${level >= i ? 'filled' : 'empty'}`}
        >
          {level >= i ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

function TrendingCard({ recipe, onSelectRecipe }) {
  if (!recipe) return null;

  const imageUrl =
    Array.isArray(recipe.images) && recipe.images.length > 0
      ? (recipe.images.find((img) => img.isDefault) || recipe.images[0])?.url || null
      : recipe.image || null;

  const handleClick = () => {
    onSelectRecipe?.(recipe);
  };

  return (
    <div className="trending-card" onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    >
      <div className="trending-card-image">
        {imageUrl ? (
          <img src={imageUrl} alt={recipe.title} />
        ) : (
          <div className="trending-card-image-placeholder" />
        )}
      </div>
      <div className="trending-card-content">
        <h3 className="trending-card-title">{recipe.title}</h3>
        <div className="trending-card-meta">
          {recipe.schwierigkeit && renderDifficultyStars(recipe.schwierigkeit)}
          {recipe.kochdauer && (
            <span className="trending-card-time">{recipe.kochdauer} Min.</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrendingCard;
