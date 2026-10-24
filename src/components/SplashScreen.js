import React, { useState } from 'react';
import './SplashScreen.css';
import { consumeSwUpdateReloadFlag } from '../utils/swUpdateReloadFlag';
import { isRecoveryNavigation } from '../utils/navigationType';

// iOS-PWA: beim Kaltstart ist der Layout-Viewport kurz kleiner als das Display
// (vh/dvh/inset liefern dann zu wenig Höhe), bis iOS ihn nachträglich vergrößert.
// screen.height ist von Anfang an korrekt, daher im Hochformat als feste Höhe nutzen.
const getInitialHeight = () => {
  if (typeof window === 'undefined' || !window.navigator?.standalone) return undefined;
  if (window.innerHeight <= window.innerWidth) return undefined;
  const { width, height } = window.screen || {};
  return Math.max(width || 0, height || 0) || undefined;
};

const SplashScreen = ({ exiting = false }) => {
  // Skip the logo/tagline entrance animations on a reload we forced
  // ourselves (a new service worker version taking over) or one we didn't
  // (iOS restoring the app after killing it in the background - see
  // utils/navigationType.js) - either way the user isn't freshly opening the
  // app, so replaying the entrance would read as a glitch rather than a
  // continuation.
  const [skipEnterAnimation] = useState(() => consumeSwUpdateReloadFlag() || isRecoveryNavigation());

  const [height] = useState(getInitialHeight);

  return (
    <div
      className={`splash-screen${exiting ? ' splash-screen--exiting' : ''}${
        skipEnterAnimation ? ' splash-screen--instant' : ''
      }`}
      style={height ? { height: `${height}px` } : undefined}
    >
      <div className="splash-screen__content">
        <img
          className="splash-screen__logo"
          src={`${process.env.PUBLIC_URL}/logo512.png`}
          alt="brouBook Logo"
        />
        <div className="splash-screen__tagline">Unsere besten Momente</div>
      </div>
      <div className="splash-screen__hairline">
        <div className="splash-screen__sweep" />
      </div>
    </div>
  );
};

export default SplashScreen;
