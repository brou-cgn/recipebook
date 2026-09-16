import React, { useState } from 'react';
import './SplashScreen.css';
import { consumeSwUpdateReloadFlag } from '../utils/swUpdateReloadFlag';
import { isRecoveryNavigation } from '../utils/navigationType';

const SplashScreen = ({ exiting = false }) => {
  // Skip the logo/tagline entrance animations on a reload we forced
  // ourselves (a new service worker version taking over) or one we didn't
  // (iOS restoring the app after killing it in the background - see
  // utils/navigationType.js) - either way the user isn't freshly opening the
  // app, so replaying the entrance would read as a glitch rather than a
  // continuation.
  const [skipEnterAnimation] = useState(() => consumeSwUpdateReloadFlag() || isRecoveryNavigation());

  return (
    <div
      className={`splash-screen${exiting ? ' splash-screen--exiting' : ''}${
        skipEnterAnimation ? ' splash-screen--instant' : ''
      }`}
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
