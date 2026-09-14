import React from 'react';
import './RecipeList.css';
import DeleteRowButton from './DeleteRowButton';
import { TUTORIAL_CATEGORIES } from '../utils/tutorialsFirestore';

// Card for a linked technique-video tutorial, rendered inline in the same
// recipe-grid as RecipeCard (see RecipeList.js). Reuses the recipe-card/
// recipe-card-content/kulinarik-tag classes for visual consistency, adding
// only the tutorial-specific thumbnail and delete affordance.
function TutorialCard({ tutorial, canDelete, onDelete }) {
  const categoryLabel = TUTORIAL_CATEGORIES.find(c => c.id === tutorial.category)?.label || tutorial.category;

  const handleOpen = () => {
    if (tutorial.videoUrl) {
      window.open(tutorial.videoUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  };

  return (
    <div
      className="recipe-card tutorial-card"
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="tutorial-card-thumb">
        <span className="tutorial-card-play-icon" aria-hidden="true">▶</span>
        <span className="tutorial-card-badge">Tutorial</span>
      </div>
      <div className="recipe-card-content">
        <div className="tutorial-card-header delete-row-hover-target">
          <h3>{tutorial.title}</h3>
          {canDelete && (
            <DeleteRowButton
              itemName={tutorial.title}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(tutorial);
              }}
            />
          )}
        </div>
        {categoryLabel && (
          <div className="recipe-kulinarik">
            <span className="kulinarik-tag">{categoryLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TutorialCard;
