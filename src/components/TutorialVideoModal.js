import React, { useEffect, useRef, useState } from 'react';
import './TutorialVideoModal.css';
import { getYouTubeThumbnailUrl } from '../utils/youtubeUtils';

// Inline YouTube playback for a tutorial, opened from TutorialCard instead of
// navigating away to youtube.com. Same overlay/dialog anatomy as
// RatingModal.js (escape-to-close, click-outside-to-close, focus the close
// button on open) plus a scroll lock, since a video should not scroll away
// mid-playback - but deliberately NOT the position:fixed variant used in
// NutritionModal.js; see the scroll-lock effect below for why.
function TutorialVideoModal({ videoId, title, onClose }) {
  const closeButtonRef = useRef(null);
  const iframeRef = useRef(null);
  const overlayRef = useRef(null);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // The YouTube iframe is only created once the user taps play, not just from
  // opening the modal: an embed is expensive (third-party frame, its own
  // player runtime) and most opens are a look at the thumbnail followed by a
  // close. Keeping it out of the DOM until playback is requested means the
  // common open-then-close-without-playing case costs nothing and has
  // nothing to tear down. This started out as a suspected fix for the iPhone
  // app-restart reports; diagnostics later showed a restart after an open
  // that never reached playback, so the embed was not the cause - the
  // facade is kept on its own merits.
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
  const requestClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const iframe = iframeRef.current;
    if (!iframe) {
      onCloseRef.current();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      onCloseRef.current();
    };
    iframe.addEventListener('load', finish, { once: true });
    iframe.src = 'about:blank';
    setTimeout(finish, 300);
  };

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

  // Scroll-Lock ohne Eingriff ins Layout.
  //
  // Vorher wurde hier der uebliche position:fixed-Trick verwendet: body auf
  // fixed, negatives top, beim Schliessen zurueck plus window.scrollTo(). Der
  // funktioniert, ist an dieser Stelle aber teuer erkauft. Dieser Dialog wird
  // - anders als jeder andere Dialog der App - mitten aus der vollstaendig
  // gerenderten Rezepteliste heraus geoeffnet (TutorialCard steckt im Grid).
  // body auf fixed zu setzen und wieder zurueck erzwingt zweimal ein
  // komplettes Re-Layout und Neuzeichnen dieses sehr langen Dokuments -
  // einmal beim Oeffnen, einmal beim Schliessen. Genau in diesem Moment
  // wurden die unfreiwilligen App-Neustarts auf dem iPhone beobachtet.
  //
  // Stattdessen: overflow:hidden (deckt Mausrad und Tastatur ab) und ein
  // nicht-passiver touchmove-Handler auf dem Overlay, der das Wegscrollen per
  // Geste unterbindet. Das Dokument bleibt dabei unangetastet, es gibt nichts
  // neu zu layouten. Der Handler muss nativ registriert werden - React haengt
  // touchmove am Root passiv ein, dort wirkt preventDefault() nicht.
  //
  // Beruehrungen innerhalb des YouTube-iframes erreichen uns nicht (cross
  // origin, die Events verlassen das iframe nicht), der Player laesst sich
  // also weiterhin normal bedienen.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const overlay = overlayRef.current;
    const blockTouchScroll = (e) => e.preventDefault();
    if (overlay) {
      overlay.addEventListener('touchmove', blockTouchScroll, { passive: false });
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      if (overlay) {
        overlay.removeEventListener('touchmove', blockTouchScroll);
      }
    };
  }, []);

  return (
    <div className="tutorial-video-modal-overlay" ref={overlayRef} onClick={requestClose}>
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
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
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
