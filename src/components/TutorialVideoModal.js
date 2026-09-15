import React, { useEffect, useRef } from 'react';
import './TutorialVideoModal.css';

// Inline YouTube playback for a tutorial, opened from TutorialCard instead of
// navigating away to youtube.com. Same overlay/dialog anatomy as
// RatingModal.js (escape-to-close, click-outside-to-close, focus the close
// button on open) plus a scroll lock like NutritionModal.js, since a
// video should not scroll away mid-playback.
function TutorialVideoModal({ videoId, title, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  return (
    <div className="tutorial-video-modal-overlay" onClick={onClose}>
      <div
        className="tutorial-video-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="tutorial-video-modal-header">
          <h2 className="tutorial-video-modal-title">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="tutorial-video-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="tutorial-video-modal-player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}

export default TutorialVideoModal;
