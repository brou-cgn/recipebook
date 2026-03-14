import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

function SplashScreen({ visible }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [gone, setGone] = useState(false);

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
          src="/logo192.png"
          alt="brouBook Logo"
          className="splash-logo"
        />
        <h1 className="splash-title">brouBook</h1>
        <p className="splash-slogan">Unsere besten Momente</p>
      </div>
    </div>
  );
}

export default SplashScreen;
