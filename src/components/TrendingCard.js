import React from 'react';
import StarIcon from './icons/StarIcon';
import { isBase64Image, getRecipeCardImageUrl } from '../utils/imageUtils';
import './TrendingCard.css';
import { useRezeptTitel, useTexte } from '../contexts/SpracheContext';
import startseiteTexte from '../i18n/texte/startseite';

function renderDifficultyStars(level, t) {
  return (
    <span className="trending-card-stars" aria-label={t('schwierigkeit', { stufe: level })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`trending-card-star ${level >= i ? 'filled' : 'empty'}`}
        >
          <StarIcon filled={level >= i} />
        </span>
      ))}
    </span>
  );
}

function TrendingCard({ recipe, onSelectRecipe, difficultyIcon = null, timeIcon = null }) {
  const t = useTexte(startseiteTexte);
  // Titel in der geltenden Sprache (Mehrsprachigkeit PR 3, hier seit PR 6e)
  const zeigeTitel = useRezeptTitel();
  if (!recipe) return null;
  const titel = zeigeTitel(recipe);

  const imageUrl = getRecipeCardImageUrl(recipe);

  const handleClick = () => {
    onSelectRecipe?.(recipe);
  };

  return (
    <div className="trending-card" onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    >
      <div className="trending-card-image">
        {imageUrl ? (
          <img src={imageUrl} alt={titel} loading="lazy" decoding="async" />
        ) : (
          <div className="trending-card-image-placeholder" />
        )}
      </div>
      <div className="trending-card-content">
        <h3 className="trending-card-title">{titel}</h3>
        <div className="trending-card-meta">
          {recipe.schwierigkeit && (
            <span className="trending-card-meta-left">
              {difficultyIcon !== null && difficultyIcon !== undefined && (
                isBase64Image(difficultyIcon) ? (
                  <img src={difficultyIcon} alt="" className="trending-card-meta-icon-img" />
                ) : (
                  <span className="trending-card-meta-icon">{difficultyIcon || <StarIcon />}</span>
                )
              )}
              {renderDifficultyStars(recipe.schwierigkeit, t)}
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
              {t('minuten', { anzahl: recipe.kochdauer })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrendingCard;
