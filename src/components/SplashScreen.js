import React from 'react';
import './SplashScreen.css';

const SplashScreen = ({ exiting = false }) => (
  <div className={`splash-screen${exiting ? ' splash-screen--exiting' : ''}`}>
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

export default SplashScreen;
