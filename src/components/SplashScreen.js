import React, { useState } from 'react';
import './SplashScreen.css';
import { consumeSwUpdateReloadFlag } from '../utils/swUpdateReloadFlag';

const SplashScreen = ({ exiting = false }) => {
  // If this mount is the result of the reload we force after a new service
  // worker version takes over, skip the logo/tagline entrance animations —
  // otherwise the tagline visibly flashes and re-animates right after the
  // user just saw it, which reads as a glitch rather than an update.
  const [skipEnterAnimation] = useState(consumeSwUpdateReloadFlag);

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
