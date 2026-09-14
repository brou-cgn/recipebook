import React from 'react';
import './TutorialCard.css';
import DeleteRowButton from './DeleteRowButton';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import { isBase64Image } from '../utils/imageUtils';
import { TUTORIAL_CATEGORIES } from '../utils/tutorialsFirestore';

const CATEGORY_LABELS = TUTORIAL_CATEGORIES.reduce((map, c) => {
  map[c.id] = c.label;
  return map;
}, {});

// Small stroke-icon set matching the app's existing nav/BottomNavigation
// icon style (24px grid, ~1.6-1.8 stroke, currentColor).
function CategoryIcon({ category }) {
  switch (category) {
    case 'schneiden':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M6 18L16.5 7.5C17.5 6.5 19 6.5 19.8 7.3C20.6 8.1 20.6 9.6 19.6 10.6L9.5 20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 15.5L4.5 19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'sauce':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="6" y="10" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <ellipse cx="12" cy="9" rx="6" ry="1.3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'teig':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="10.3" width="16" height="3.4" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="3" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="21" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'garen':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 20C8.5 20 6.5 17.5 6.5 14.5C6.5 11 9 9 9.5 6C9.5 6 13 7.5 13 11C13 11 15 9.5 15 7C16.5 9 17.5 11.5 17.5 14C17.5 17.7 15.5 20 12 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'anrichten':
    default:
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}

// Compact row card for a linked technique video, mixed into the recipe grid
// (RecipeList.js). Deliberately much shorter than RecipeCard - a small
// 84x60 thumbnail on the left instead of a full-width image on top - so it
// reads as "a different kind of tile" while scrolling past recipe cards.
// Desktop delete affordance is DeleteRowButton; mobile uses the shared
// swipe-to-delete gesture (see CLAUDE.md).
function TutorialCard({ tutorial, canManage, onDelete, swipeDeleteIcon }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: !canManage });

  const handleClick = (e) => {
    if (isDeleteVisible) {
      e.preventDefault();
      reset();
    }
  };

  return (
    <div className={`tutorial-card${offset < 0 ? ' swipe-delete-active' : ''}`}>
      {canManage && (
        <div className="swipe-delete-background" aria-hidden={!isDeleteVisible}>
          {isDeleteVisible && (
            <button
              type="button"
              className="swipe-delete-action"
              onClick={() => { onDelete(tutorial); reset(); }}
              aria-label={`${tutorial.title} entfernen`}
            >
              {isBase64Image(swipeDeleteIcon) ? (
                <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
              ) : (
                <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
              )}
            </button>
          )}
        </div>
      )}
      <a
        className="tutorial-card-content"
        href={tutorial.videoUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ transform: `translateX(${offset}px)` }}
        onClick={handleClick}
        {...handlers}
      >
        <div className="tutorial-card-thumb">
          <CategoryIcon category={tutorial.category} />
          <div className="tutorial-card-play">
            <span className="tutorial-card-play-circle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 7L17 12L9 17V7Z" fill="#DF7A00" /></svg>
            </span>
          </div>
        </div>
        <div className="tutorial-card-body delete-row-hover-target">
          <div className="tutorial-card-text">
            <span className="kulinarik-tag">{CATEGORY_LABELS[tutorial.category] || 'Tutorial'}</span>
            <h3>{tutorial.title}</h3>
          </div>
          {canManage && (
            <DeleteRowButton
              itemName={tutorial.title}
              className="tutorial-card-delete-btn"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(tutorial); }}
            />
          )}
        </div>
      </a>
    </div>
  );
}

export default TutorialCard;
