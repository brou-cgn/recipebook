import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

function SplashScreen({ visible, logoUrl, appTitle, slogan }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [gone, setGone] = useState(false);

  const logoSrc = logoUrl || '/logo192.png';
  /*const titleText = appTitle || 'brouBook';*/
  const sloganText = slogan || 'Unsere besten Momente';

  useEffect(() => {
    if (!visible) {
      setFadingOut(true);
      // Fallback: remove the element after the CSS transition duration (0.5s) plus a small buffer,
      // in case onTransitionEnd is not fired by the browser.
      const timer = setTimeout(() => setGone(true), 700);
      return () => clearTimeout(timer);
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
          alt={`${titleText} Logo`}
          className="splash-logo"
        />
        /*<h1 className="splash-title">{titleText}</h1>*/
        <p className="splash-slogan">{sloganText}</p>
      </div>
    </div>
  );
}

export default SplashScreen;
