import React, { useEffect, useRef, useState } from 'react';
import './BottomNavigation.css';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

function NavIcon({ children, className }) {
  return (
    <span className={`bottom-navigation__icon${className ? ` ${className}` : ''}`} aria-hidden="true">
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

function KitchenIcon(props) {
  return (
    <NavIcon {...props}>
      <path d="M4 5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.5 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 12H17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="8.75" y="7.75" width="6.5" height="9.5" rx="1.25" stroke="currentColor" strokeWidth="1.8" />
    </NavIcon>
  );
}

function BookIcon(props) {
  return (
    <NavIcon {...props}>
      <path d="M7 5.5H16.5C17.3284 5.5 18 6.17157 18 7V18.5H8.5C7.67157 18.5 7 17.8284 7 17V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 7.5H16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 18.5V7C8.5 6.17157 7.82843 5.5 7 5.5H6.5C5.67157 5.5 5 6.17157 5 7V17C5 17.8284 5.67157 18.5 6.5 18.5H8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </NavIcon>
  );
}

function TableIcon(props) {
  return (
    <NavIcon {...props}>
      <path d="M12 4.5V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 6.25V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 6.25V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="9.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 13H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </NavIcon>
  );
}

function AtelierIcon(props) {
  return (
    <NavIcon {...props}>
      <rect x="6" y="5" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="3" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" opacity="0.8" />
      <path d="M10 11.75L11.75 13.5L15 9.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </NavIcon>
  );
}

function ProfileIcon(props) {
  return (
    <NavIcon {...props}>
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

const NAV_ICON_KEYS_ACTIVE = {
  home: 'bottomNavHomeActive',
  recipes: 'bottomNavRecipesActive',
  menus: 'bottomNavMenusActive',
  atelier: 'bottomNavAtelierActive',
  chef: 'bottomNavChefActive',
};

// Tabs shown in the compact pill/carousel representation instead of the full bar.
const PILL_TAB_KEYS = ['recipes', 'menus', 'atelier'];

function resolveTabIcon(tab, isActive, buttonIcons, isDarkMode) {
  const Icon = ICONS[tab.key];
  const iconKey = NAV_ICON_KEYS[tab.key];
  const activeIconKey = NAV_ICON_KEYS_ACTIVE[tab.key];
  const normalIconValue = iconKey ? getEffectiveIcon(buttonIcons, iconKey, isDarkMode) : '';
  const activeIconValue = isActive && activeIconKey
    ? getEffectiveIcon(buttonIcons, activeIconKey, isDarkMode)
    : '';
  return { Icon, iconValue: activeIconValue || normalIconValue };
}

function TabIcon({ tab, isActive, buttonIcons, isDarkMode, iconClassName }) {
  const { Icon, iconValue } = resolveTabIcon(tab, isActive, buttonIcons, isDarkMode);

  if (isBase64Image(iconValue)) {
    return (
      <span className={`bottom-navigation__icon${iconClassName ? ` ${iconClassName}` : ''}`} aria-hidden="true">
        <img src={iconValue} alt="" className="bottom-navigation__icon-image" draggable="false" />
      </span>
    );
  }
  if (iconValue) {
    return (
      <span className={`bottom-navigation__icon bottom-navigation__icon-text${iconClassName ? ` ${iconClassName}` : ''}`} aria-hidden="true">
        {iconValue}
      </span>
    );
  }
  return Icon ? <Icon className={iconClassName} /> : null;
}

function BottomNavigation({ tabs, activeKey, isVisible, onSelect }) {
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const railRef = useRef(null);

  const isPillMode = PILL_TAB_KEYS.includes(activeKey);

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

  useEffect(() => {
    if (!isPillMode) return;
    const rail = railRef.current;
    if (!rail) return;
    const pillTabs = tabs.filter((tab) => PILL_TAB_KEYS.includes(tab.key));
    const index = pillTabs.findIndex((tab) => tab.key === activeKey);
    if (index < 0) return;
    const itemWidth = rail.clientWidth / pillTabs.length;
    if (typeof rail.scrollTo === 'function') {
      rail.scrollTo({ left: Math.max(0, (index - 1) * itemWidth), behavior: 'smooth' });
    }
  }, [activeKey, tabs, isPillMode]);

  const navStateClass = !isVisible
    ? ' bottom-navigation--hidden'
    : isPillMode
      ? ' bottom-navigation--crossfaded'
      : '';
  const pillStateClass = !isVisible
    ? ' bottom-navigation-pill--hidden'
    : !isPillMode
      ? ' bottom-navigation-pill--crossfaded'
      : '';

  return (
    <>
      <nav
        className={`bottom-navigation${navStateClass}`}
        role="navigation"
        aria-label="Hauptnavigation"
        data-visible={isVisible ? 'true' : 'false'}
      >
        {tabs.map((tab) => {
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
              <TabIcon tab={tab} isActive={isActive} buttonIcons={buttonIcons} isDarkMode={isDarkMode} />
              <span className="bottom-navigation__label">{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <div
        className={`bottom-navigation-pill${pillStateClass}`}
        data-visible={isPillMode && isVisible ? 'true' : 'false'}
      >
        <div
          className="bottom-navigation-pill__rail"
          ref={railRef}
          role="navigation"
          aria-label="Hauptnavigation (kompakt)"
        >
          {tabs.filter((tab) => PILL_TAB_KEYS.includes(tab.key)).map((tab) => {
            const isActive = tab.key === activeKey;
            return (
              <button
                key={tab.key}
                type="button"
                className={`bottom-navigation-pill__item${isActive ? ' bottom-navigation-pill__item--active' : ''}`}
                onClick={() => onSelect(tab)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <TabIcon
                  tab={tab}
                  isActive={isActive}
                  buttonIcons={buttonIcons}
                  isDarkMode={isDarkMode}
                  iconClassName="bottom-navigation-pill__icon"
                />
                <span className="bottom-navigation-pill__label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default BottomNavigation;
