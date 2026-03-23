import React from 'react';
import './RecipeList.css';
import RecipeImageCarousel from './RecipeImageCarousel';
import RecipeRating from './RecipeRating';

const MAX_KULINARIK_TAGS = 5;

function renderKulinarikTags(kulinarik) {
  if (!Array.isArray(kulinarik)) {
    return <span className="kulinarik-tag">{kulinarik}</span>;
  }
  const displayed = kulinarik.slice(0, MAX_KULINARIK_TAGS);
  const remaining = kulinarik.length - MAX_KULINARIK_TAGS;
  return (
    <>
      {displayed.map((k) => (
        <span key={k} className="kulinarik-tag">{k}</span>
      ))}
      {remaining > 0 && (
        <span className="kulinarik-tag kulinarik-tag-more">+{remaining} weitere</span>
      )}
    </>
  );
}

function RecipeCard({ recipe, onClick, isFavorite, isNew, authorName, versionCount, currentUser }) {
  const allImages = Array.isArray(recipe.images) && recipe.images.length > 0
    ? recipe.images
    : recipe.image
    ? [{ url: recipe.image, isDefault: true }]
    : [];
  const orderedImages = [
    ...allImages.filter(img => img.isDefault),
    ...allImages.filter(img => !img.isDefault),
  ];
  const hasImages = orderedImages.length > 0;

  return (
    <div className="recipe-card" onClick={onClick}>
      {isFavorite && (
        <div className="recipe-favorite-badge">★</div>
      )}
      {isNew && (
        <div className="new-badge">Neu</div>
      )}
      {hasImages && (
        <div className="recipe-image" onClick={(e) => e.stopPropagation()}>
          <RecipeImageCarousel
            images={orderedImages}
            altText={recipe.title}
            onImageClick={onClick}
          />
        </div>
      )}
      <div className="recipe-card-content">
        <h3>{recipe.title}</h3>
        {recipe.kulinarik && (Array.isArray(recipe.kulinarik) ? recipe.kulinarik.length > 0 : recipe.kulinarik.trim().length > 0) && (
          <div className="recipe-kulinarik">
            {Array.isArray(recipe.kulinarik)
              ? renderKulinarikTags(recipe.kulinarik)
              : <span className="kulinarik-tag">{recipe.kulinarik}</span>
            }
          </div>
        )}
        <div className="recipe-footer">
          {authorName && (
            <div className="recipe-author">{authorName}</div>
          )}
          {versionCount && versionCount > 1 && (
            <div className="version-count">
              {versionCount} Versionen
            </div>
          )}
          <RecipeRating
            recipeId={recipe.id}
            ratingAvg={recipe.ratingAvg}
            ratingCount={recipe.ratingCount}
            currentUser={currentUser}
          />
        </div>
      </div>
    </div>
  );
}

export default RecipeCard;
