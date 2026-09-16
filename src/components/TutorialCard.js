import React, { useState, useRef, useEffect } from 'react';
import './TutorialCard.css';
import TutorialVideoModal from './TutorialVideoModal';
import { TUTORIAL_CATEGORIES } from '../utils/tutorialsFirestore';
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getYouTubeFrameUrls } from '../utils/youtubeUtils';

// Same timings as the long-press on the "Rezept hinzufügen" button in
// RecipeList.js, so both gestures feel identical.
const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_CLICK_SUPPRESSION_MS = 500;

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
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M6 18L16.5 7.5C17.5 6.5 19 6.5 19.8 7.3C20.6 8.1 20.6 9.6 19.6 10.6L9.5 20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 15.5L4.5 19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'sauce':
      return (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <rect x="6" y="10" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <ellipse cx="12" cy="9" rx="6" ry="1.3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'teig':
      return (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="10.3" width="16" height="3.4" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="3" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="21" cy="12" r="1.3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'garen':
      return (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M12 20C8.5 20 6.5 17.5 6.5 14.5C6.5 11 9 9 9.5 6C9.5 6 13 7.5 13 11C13 11 15 9.5 15 7C16.5 9 17.5 11.5 17.5 14C17.5 17.7 15.5 20 12 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'anrichten':
    default:
      return (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
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
// Display-only - no delete affordance lives here.
//
// YouTube links get a real thumbnail (img.youtube.com, no API key needed)
// and play inline via TutorialVideoModal instead of leaving the app. Any
// other video source (Instagram, TikTok, …) falls back to the previous
// behavior - a plain external link - since those platforms don't offer an
// unauthenticated thumbnail/embed the same way.
//
// A long press opens the tutorial in TutorialForm for editing (onEdit) -
// the counterpart to the long press on "Rezept hinzufügen" that creates one.
// A short press keeps playing the video, so the gesture adds an entry point
// without taking one away.
function TutorialCard({ tutorial, onEdit }) {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const longPressTimer = useRef(null);
  const longPressed = useRef(false);
  const longPressJustFired = useRef(false);
  const videoId = extractYouTubeVideoId(tutorial.videoUrl);
  const thumbnailUrl = tutorial.thumbFrame != null
    ? getYouTubeFrameUrls(videoId)[tutorial.thumbFrame]
    : getYouTubeThumbnailUrl(videoId);
  const thumbZoom = tutorial.thumbZoom || 1;
  const thumbPosX = tutorial.thumbPosX ?? 0.5;
  const thumbPosY = tutorial.thumbPosY ?? 0.5;

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const cancelLongPress = () => {
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    longPressed.current = false;
  };

  // Pointer events cover touch and mouse in one go. The press is only
  // classified as "long" here; onEdit fires on release - same order as the
  // touchstart/touchend long press in RecipeList.js. The click that follows
  // the release is swallowed by the flag in handleClick, since neither
  // pointerup nor contextmenu can suppress it.
  const handlePointerDown = (e) => {
    if (!onEdit) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    longPressed.current = false;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressed.current = true;
    }, LONG_PRESS_DELAY_MS);
  };

  const handlePointerUp = () => {
    const wasLongPress = longPressed.current;
    cancelLongPress();
    if (!wasLongPress || !onEdit) return;
    longPressJustFired.current = true;
    setTimeout(() => { longPressJustFired.current = false; }, LONG_PRESS_CLICK_SUPPRESSION_MS);
    onEdit(tutorial);
  };

  const handleClick = (e) => {
    if (longPressJustFired.current) {
      longPressJustFired.current = false;
      e.preventDefault();
      return;
    }
    if (videoId) {
      e.preventDefault();
      setIsPlayerOpen(true);
    }
  };

  const ContentTag = videoId ? 'button' : 'a';
  const contentTagProps = videoId
    ? { type: 'button', 'aria-label': `Video „${tutorial.title}“ abspielen` }
    : { href: tutorial.videoUrl, target: '_blank', rel: 'noopener noreferrer' };

  return (
    <div className="tutorial-card">
      <ContentTag
        className="tutorial-card-content"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onContextMenu={onEdit ? (e) => e.preventDefault() : undefined}
        title={onEdit ? `${tutorial.title} (lang drücken zum Bearbeiten)` : undefined}
        {...contentTagProps}
      >
        <div className="tutorial-card-thumb">
          {thumbnailUrl && !thumbFailed ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="tutorial-card-thumb-image"
              draggable="false"
              onError={() => setThumbFailed(true)}
              style={{
                width: `${thumbZoom * 100}%`,
                height: `${thumbZoom * 100}%`,
                left: `${-(thumbZoom - 1) * 100 * thumbPosX}%`,
                top: `${-(thumbZoom - 1) * 100 * thumbPosY}%`
              }}
            />
          ) : (
            <CategoryIcon category={tutorial.category} />
          )}
          <div className="tutorial-card-play">
            <span className="tutorial-card-play-circle">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 7L17 12L9 17V7Z" fill="#DF7A00" /></svg>
            </span>
          </div>
        </div>
        <div className="tutorial-card-body">
          <div className="tutorial-card-text">
            <h3>{tutorial.title}</h3>
            <span className="kulinarik-tag">{CATEGORY_LABELS[tutorial.category] || 'Tutorial'}</span>
          </div>
        </div>
      </ContentTag>
      {isPlayerOpen && (
        <TutorialVideoModal
          videoId={videoId}
          title={tutorial.title}
          onClose={() => setIsPlayerOpen(false)}
        />
      )}
    </div>
  );
}

export default TutorialCard;
