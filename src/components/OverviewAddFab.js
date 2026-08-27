import React, { useEffect, useState } from 'react';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function OverviewAddFab({ onClick, title, ariaLabel }) {
  const [pressed, setPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  useEffect(() => {
    const loadButtonIcons = async () => {
      try {
        const icons = await getButtonIcons();
        setButtonIcons(icons);
      } catch (error) {
        console.error('Error loading button icons:', error);
      }
    };
    loadButtonIcons();
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  const icon = getEffectiveIcon(buttonIcons, 'addRecipe', isDarkMode);

  return (
    <button
      type="button"
      className={`events-add-fab-button ${pressed ? 'pressed' : ''}`}
      onClick={onClick}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onTouchCancel={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      title={title}
      aria-label={ariaLabel}
    >
      {isBase64Image(icon) ? (
        <img src={icon} alt={ariaLabel} className="button-icon-image" draggable="false" />
      ) : (
        icon
      )}
    </button>
  );
}

export default OverviewAddFab;
