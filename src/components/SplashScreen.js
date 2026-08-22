import React from 'react';
import './SplashScreen.css';

const SplashScreen = () => (
  <div className="splash-screen">
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
