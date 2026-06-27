import React from 'react';
import './BottomNavigation.css';

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
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 18.5C4.45674 15.9163 6.92914 14 9.85 14H10.15C13.0709 14 15.5433 15.9163 16.5 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </NavIcon>
  );
}

const ICONS = {
  startseite: KitchenIcon,
  recipes: BookIcon,
  menus: TableIcon,
  atelier: AtelierIcon,
  kueche: ProfileIcon,
};

function BottomNavigation({ tabs, activeKey, isVisible, onSelect }) {
  return (
    <nav
      className={`bottom-navigation${isVisible ? '' : ' bottom-navigation--hidden'}`}
      role="navigation"
      aria-label="Hauptnavigation"
      data-visible={isVisible ? 'true' : 'false'}
    >
      {tabs.map((tab) => {
        const Icon = ICONS[tab.key];
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
            <Icon />
            <span className="bottom-navigation__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNavigation;
