import React from 'react';
import { isBase64Image } from '../utils/imageUtils';
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

function TrendingCard({ recipe, onSelectRecipe, difficultyIcon = null, timeIcon = null }) {
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
          {recipe.schwierigkeit && (
            <span className="trending-card-meta-left">
              {difficultyIcon && (
                isBase64Image(difficultyIcon) ? (
                  <img src={difficultyIcon} alt="" className="trending-card-meta-icon-img" />
                ) : (
                  <span className="trending-card-meta-icon">{difficultyIcon}</span>
                )
              )}
              {renderDifficultyStars(recipe.schwierigkeit)}
            </span>
          )}
          {recipe.kochdauer && (
            <span className="trending-card-time">
              {timeIcon && (
                isBase64Image(timeIcon) ? (
                  <img src={timeIcon} alt="" className="trending-card-meta-icon-img" />
                ) : (
                  <span className="trending-card-meta-icon">{timeIcon}</span>
                )
              )}
              {recipe.kochdauer} Min.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrendingCard;
