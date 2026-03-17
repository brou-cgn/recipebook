import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

function SplashScreen({ visible, logoUrl, slogan }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [gone, setGone] = useState(false);

  const logoSrc = logoUrl || '/logo192.png';
  const sloganText = slogan || 'Unsere besten Momente';

  useEffect(() => {
    if (!visible) {
      setFadingOut(true);
    }
  }, [visible]);

  const handleTransitionEnd = () => {
    if (fadingOut) {
      setGone(true);
    }
  };

  if (gone) return null;

  return (
    <div
      className={`splash-screen${fadingOut ? ' splash-screen--fade-out' : ''}`}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="splash-content">
        <img
          src={logoSrc}
          alt="App Logo"
          className="splash-logo"
        />
        <p className="splash-slogan">{sloganText}</p>
      </div>
    </div>
  );
}

export default SplashScreen;
