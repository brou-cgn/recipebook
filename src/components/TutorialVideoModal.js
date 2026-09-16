import React, { useEffect, useRef, useState } from 'react';
import './TutorialVideoModal.css';
import { getYouTubeThumbnailUrl } from '../utils/youtubeUtils';
import { markCloseStart, markPagehideFired, markCloseDone } from '../utils/tutorialVideoCloseDebug';

// Inline YouTube playback for a tutorial, opened from TutorialCard instead of
// navigating away to youtube.com. Same overlay/dialog anatomy as
// RatingModal.js (escape-to-close, click-outside-to-close, focus the close
// button on open) plus a scroll lock like NutritionModal.js, since a
// video should not scroll away mid-playback.
function TutorialVideoModal({ videoId, title, onClose }) {
  const closeButtonRef = useRef(null);
  const iframeRef = useRef(null);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // The YouTube iframe is only created once the user taps play, not just from
  // opening the modal. iOS's WKWebView can crash - and silently relaunch the
  // whole standalone app, which reads as "the app restarted" - when a YouTube
  // embed is torn down, even one that never actually started playing (e.g.
  // YouTube's own "watch on YouTube" fallback card for a Short/restricted
  // video, which never enters a playing state at all). Not creating the
  // iframe until playback is requested means there's nothing to tear down on
  // close for the common open-then-close-without-playing case.
  const [isPlaying, setIsPlaying] = useState(false);
  const thumbnailUrl = getYouTubeThumbnailUrl(videoId);

  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  // When an iframe was created (playback was started), clear its src and
  // wait for that navigation to actually finish - not just a fixed delay -
  // before unmounting, since tearing the iframe out mid-navigation is what
  // could crash the WebView in the first place. The timeout is only a
  // fallback in case 'load' never fires.
  //
  // markCloseStart/markCloseDone are a temporary diagnostic breadcrumb (see
  // utils/tutorialVideoCloseDebug.js) for the still-unresolved iPhone
  // "app restarts on close" report - they persist through a real
  // crash/relaunch so the next app start can tell us how far the close
  // sequence actually got.
  const requestClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const iframe = iframeRef.current;
    markCloseStart({ hadIframe: !!iframe, isPlaying });
    if (!iframe) {
      markCloseDone();
      onCloseRef.current();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      markCloseDone();
      onCloseRef.current();
    };
    iframe.addEventListener('load', finish, { once: true });
    iframe.src = 'about:blank';
    setTimeout(finish, 300);
  };

  useEffect(() => {
    const handlePagehide = () => markPagehideFired();
    window.addEventListener('pagehide', handlePagehide);
    return () => window.removeEventListener('pagehide', handlePagehide);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        requestClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="tutorial-video-modal-overlay" onClick={requestClose}>
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
            onClick={requestClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="tutorial-video-modal-player">
          {isPlaying ? (
            <iframe
              ref={iframeRef}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className="tutorial-video-modal-facade"
              onClick={() => setIsPlaying(true)}
              aria-label={`Video „${title}“ abspielen`}
            >
              {thumbnailUrl && (
                <img src={thumbnailUrl} alt="" className="tutorial-video-modal-facade-image" />
              )}
              <span className="tutorial-video-modal-facade-play">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 7L17 12L9 17V7Z" fill="#DF7A00" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TutorialVideoModal;
