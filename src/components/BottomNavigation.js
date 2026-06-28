import React, { useEffect, useState } from 'react';
import './BottomNavigation.css';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function NavIcon({ children }) {
  return (
    <span className="bottom-navigation__icon" aria-hidden="true">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {children}
      </svg>
    </span>
  );
}

function KitchenIcon() {
  return (
    <NavIcon>
      <path d="M4 5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.5 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 12H17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="8.75" y="7.75" width="6.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.8" />
    </NavIcon>
  );
}

function BookIcon() {
  return (
    <NavIcon>
      <path d="M7 5.5H16.5C17.3284 5.5 18 6.17157 18 7V18.5H8.5C7.67157 18.5 7 17.8284 7 17V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 7.5H16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 18.5V7C8.5 6.17157 7.82843 5.5 7 5.5H6.5C5.67157 5.5 5 6.17157 5 7V17C5 17.8284 5.67157 18.5 6.5 18.5H8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </NavIcon>
  );
}

function TableIcon() {
  return (
    <NavIcon>
      <path d="M12 4.5V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 6.25V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 6.25V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="9.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 13H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </NavIcon>
  );
}

function AtelierIcon() {
  return (
    <NavIcon>
      <rect x="6" y="5" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="3" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" opacity="0.8" />
      <path d="M10 11.75L11.75 13.5L15 9.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </NavIcon>
  );
}

function ProfileIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 18.5C6.05034 15.9462 8.53583 14.25 11.2975 14.25H12.7025C15.4642 14.25 17.9497 15.9462 19 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.25 6.25C18.2165 6.25 19 7.0335 19 8C19 8.9665 18.2165 9.75 17.25 9.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </NavIcon>
  );
}

const ICONS = {
  home: KitchenIcon,
  recipes: BookIcon,
  menus: TableIcon,
  atelier: AtelierIcon,
  chef: ProfileIcon,
};

const NAV_ICON_KEYS = {
  home: 'bottomNavHome',
  recipes: 'bottomNavRecipes',
  menus: 'bottomNavMenus',
  atelier: 'bottomNavAtelier',
  chef: 'bottomNavChef',
};

function BottomNavigation({ tabs, activeKey, isVisible, onSelect }) {
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  useEffect(() => {
    let cancelled = false;
    getButtonIcons()
      .then((icons) => {
        if (!cancelled) setButtonIcons(icons);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  return (
    <nav
      className={`bottom-navigation${isVisible ? '' : ' bottom-navigation--hidden'}`}
      role="navigation"
      aria-label="Hauptnavigation"
      data-visible={isVisible ? 'true' : 'false'}
    >
      {tabs.map((tab) => {
        const Icon = ICONS[tab.key];
        const iconKey = NAV_ICON_KEYS[tab.key];
        const iconValue = iconKey ? getEffectiveIcon(buttonIcons, iconKey, isDarkMode) : '';
        const isActive = tab.key === activeKey;

        return (
          <button
            key={tab.key}
            type="button"
            className={`bottom-navigation__tab${isActive ? ' bottom-navigation__tab--active' : ''}`}
            onClick={() => onSelect(tab)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {isBase64Image(iconValue) ? (
              <span className="bottom-navigation__icon" aria-hidden="true">
                <img src={iconValue} alt="" className="bottom-navigation__icon-image" draggable="false" />
              </span>
            ) : iconValue ? (
              <span className="bottom-navigation__icon bottom-navigation__icon-text" aria-hidden="true">{iconValue}</span>
            ) : (
              Icon ? <Icon /> : null
            )}
            <span className="bottom-navigation__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNavigation;
