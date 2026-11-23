import React, { useState, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from 'react';
// Schrift des Slogans, selbst gehostet (nur Latin, mit Umlauten und Akzenten); landet im Offline-Cache.
import '@fontsource/reenie-beanie/latin-400.css';
import './Header.css';
import HandschriftText from './HandschriftText';
import SprachWahl from './SprachWahl';
import { getHeaderSlogan, getSloganUebersetzungen, getAppLogoImage, getFaviconText, DEFAULT_SLOGAN } from '../utils/customLists';
import { updatePageTitle } from '../utils/faviconUtils';
import { sloganInSprache } from '../i18n/slogan';
import { subscribeToFaqs } from '../utils/faqFirestore';
import SearchIcon from './icons/SearchIcon';
import ConfirmDialog from './ConfirmDialog';
import ImportProgressIndicator from './ImportProgressIndicator';
import ImportProgressDialog from './ImportProgressDialog';
import { createShortcutToken } from '../utils/shortcutToken';
import { useRecipeImportQueue } from '../contexts/RecipeImportQueueContext';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import bereicheTexte from '../i18n/texte/bereiche';
import kopfzeileTexte from '../i18n/texte/kopfzeile';
import allgemeinTexte from '../i18n/texte/allgemein';

const APP_NAME = 'brouBook';

const RECIPE_IMPORT_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/7825443f6ad640ccb3a626869ca501b9';

/**
 * Detects iPhone/iPad/Mac, the only platforms with a Shortcuts app that can
 * install a Kurzbefehl. iPadOS 13+ reports navigator.platform as "MacIntel"
 * like a Mac, so it's distinguished via touch support.
 */
function isAppleDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const isIOSUserAgent = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isMac = /^Mac/.test(platform) && !isIPadOS13Plus;
  return isIOSUserAgent || isIPadOS13Plus || isMac;
}

/**
 * Renders text with **bold** markdown syntax as <strong> elements.
 */
function renderBoldText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const Header = forwardRef(function Header({ 
  onSettingsClick, 
  currentView, 
  onViewChange,
  categoryFilter,
  onCategoryFilterChange,
  currentUser,
  onLogout,
  onUserManagement,
  visible = true,
  onSearchChange,
  interactiveLists = [],
  startseiteEnabled = false,
  onChefkochClick,
  onProfileUpdated,
}, ref) {
  const t = useTexte(kopfzeileTexte);
  const tB = useTexte(bereicheTexte);
  const tA = useTexte(allgemeinTexte);
  // Sprache dieser Sitzung (Vorhaben Mehrsprachigkeit): Chip im Header (SprachWahl), nur mit der
  // Berechtigung sprachwahl. Solange seine Auswahl offen ist, liegt der Header wie beim Menü oben.
  const darfSprachwahl = Boolean(currentUser?.sprachwahl);
  const [sprachwahlOffen, setSprachwahlOffen] = useState(false);
  const [headerSlogan, setHeaderSlogan] = useState('');
  const [sloganUebersetzungen, setSloganUebersetzungen] = useState(null);
  const [seitenName, setSeitenName] = useState(null);
  const [appLogoImage, setAppLogoImage] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [faqs, setFaqs] = useState([]);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [expandedFaqId, setExpandedFaqId] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [isApple] = useState(isAppleDevice);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [shortcutHinweis, setShortcutHinweis] = useState(null);
  const [schluesselRueckfrage, setSchluesselRueckfrage] = useState(false);
  const menuRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);
  const {
    jobs: importJobs,
    deleteBanners: importDeleteBanners,
    dismissJob: dismissImportJob,
    restartJob: restartImportJob,
    cancelJob: cancelImportJob,
    undoDelete: undoImportDelete,
  } = useRecipeImportQueue();

  useImperativeHandle(ref, () => ({
    openSearch() {
      setSearchOpen(true);
      // Delay focus to allow the search input to render before focusing
      const SEARCH_FOCUS_DELAY = 100;
      setTimeout(() => {
        searchRef.current?.querySelector('input')?.focus();
      }, SEARCH_FOCUS_DELAY);
    }
  }));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const loadHeaderData = async () => {
      const slogan = await getHeaderSlogan();
      const uebersetzungen = await getSloganUebersetzungen();
      const logo = await getAppLogoImage();
      const name = await getFaviconText();
      setHeaderSlogan(slogan);
      setSloganUebersetzungen(uebersetzungen);
      setAppLogoImage(logo);
      setSeitenName(name);
    };
    loadHeaderData();
  }, [currentUser]);

  // Slogan in der geltenden Sprache (src/i18n/slogan.js): gepflegte Übersetzung, für den
  // Standard-Slogan die eingebaute, sonst das deutsche Original. Der Seitentitel folgt mit.
  const { sprache } = useSprache();
  const slogan = sloganInSprache({
    slogan: headerSlogan,
    uebersetzungen: sloganUebersetzungen,
    sprache,
    standard: { slogan: DEFAULT_SLOGAN, uebersetzung: t('standardSlogan') },
  });
  useEffect(() => {
    if (headerSlogan) updatePageTitle(seitenName, slogan);
  }, [headerSlogan, seitenName, slogan]);

  // Subscribe to FAQs for live display in the menu
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = subscribeToFaqs((faqList) => {
      setFaqs(faqList);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser]);

  const visibleFaqs = faqs.filter(faq => {
    if (faq.adminOnly && !currentUser?.role === 'admin') return false;
    if (isMobile && faq.showOnMobile === false) return false;
    if (!isMobile && faq.showOnDesktop === false) return false;
    return true;
  });

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    if (menuOpen || searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen, searchOpen]);

  // Das Dropdown darf nicht höher sein als der sichtbare Platz zwischen Header und
  // Bottom-Navigation – sonst sind die unteren Einträge (z. B. Abmelden) auf kleinen
  // Displays unerreichbar. Die Höhe wird gemessen, weil Header und Bottom-Nav je nach
  // Gerät (Safe Area, Slogan-Länge) unterschiedlich hoch sind; den Rest scrollt das Menü.
  useLayoutEffect(() => {
    if (!menuOpen) return undefined;
    const updateMaxHeight = () => {
      const dropdown = dropdownRef.current;
      if (!dropdown) return;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      let bottomLimit = viewportHeight;
      const bottomNav = document.querySelector('.bottom-navigation');
      if (bottomNav && window.getComputedStyle(bottomNav).display !== 'none') {
        const navTop = bottomNav.getBoundingClientRect().top;
        if (navTop > 0 && navTop < bottomLimit) bottomLimit = navTop;
      }
      const available = Math.floor(bottomLimit - dropdown.getBoundingClientRect().top - 8);
      dropdown.style.maxHeight = available > 0 ? `${available}px` : '';
    };
    updateMaxHeight();
    window.addEventListener('resize', updateMaxHeight);
    window.visualViewport?.addEventListener('resize', updateMaxHeight);
    return () => {
      window.removeEventListener('resize', updateMaxHeight);
      window.visualViewport?.removeEventListener('resize', updateMaxHeight);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
    if (!searchOpen) {
      // Focus the search input when opening (delay allows animation to complete)
      const SEARCH_FOCUS_DELAY = 100;
      setTimeout(() => {
        searchRef.current?.querySelector('input')?.focus();
      }, SEARCH_FOCUS_DELAY);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const handleSearchClear = () => {
    setSearchTerm('');
    if (onSearchChange) {
      onSearchChange('');
    }
  };

  const handleViewChangeInternal = (view) => {
    if (onViewChange) {
      onViewChange(view);
    }
    setMenuOpen(false);
  };

  const handleLogoutInternal = () => {
    if (onLogout) {
      onLogout();
    }
    setMenuOpen(false);
  };

  const handleChefkochClickInternal = () => {
    if (onChefkochClick) {
      onChefkochClick();
    }
    setMenuOpen(false);
  };

  const handleLogoClick = () => {
    if (onViewChange) {
      onViewChange('startseite');
    }
    setMenuOpen(false);
  };

  // Der Kurzbefehl braucht den persönlichen Schlüssel (Tech-Check S7). Beim Klick wird deshalb ein neuer
  // Schlüssel erzeugt (ein vorhandener gilt danach nicht mehr), in die Zwischenablage gelegt und der
  // Kurzbefehl geöffnet; dort wird er im ersten Textfeld eingesetzt. Fehlt die Zwischenablage oder
  // schlägt das Erzeugen fehl, öffnet sich der Kurzbefehl trotzdem, damit die Installation nicht hängt.
  // Gilt schon ein Schlüssel, wird vorher gefragt: Ein neuer macht den alten und damit bereits
  // installierte Kurzbefehle unbrauchbar.
  const handleInstallShortcutClick = () => {
    setMenuOpen(false);
    if (currentUser?.shortcutTokenEnabled) {
      setSchluesselRueckfrage(true);
      return;
    }
    installShortcut();
  };

  const installShortcut = async () => {
    setSchluesselRueckfrage(false);
    setShortcutHinweis(null);
    let hinweis;
    try {
      const token = await createShortcutToken();
      if (onProfileUpdated) {
        onProfileUpdated({ shortcutTokenEnabled: true, shortcutTokenCreatedAt: new Date() });
      }
      try {
        await navigator.clipboard.writeText(token);
        hinweis = 'kurzbefehlSchluesselKopiert';
      } catch {
        hinweis = 'kurzbefehlSchluesselNichtKopiert';
      }
    } catch {
      hinweis = 'kurzbefehlFehler';
    }
    setShortcutHinweis(hinweis);
    // Nach dem await zählt window.open in iOS-Safari nicht mehr als Nutzeraktion; eine Navigation schon
    window.location.assign(RECIPE_IMPORT_SHORTCUT_URL);
  };

  const headerTitleContent = (
    <>
      {appLogoImage && (
        <img src={appLogoImage} alt={t('logo')} className="header-logo" />
      )}
      <div className="header-title-text">
        <h1>{APP_NAME}</h1>
        <HandschriftText text={slogan} className="tagline" />
      </div>
    </>
  );

  return (
    <>
    <header className={`header ${!visible ? 'header-hidden' : ''} ${menuOpen || sprachwahlOffen ? 'header--menu-open' : ''}`}> 
      <div className="header-content">
        <div className="header-title">
          {onViewChange ? (
            <button
              type="button"
              className="header-title-link"
              onClick={handleLogoClick}
              aria-label={t('zurStartseite')}
            >
              {headerTitleContent}
            </button>
          ) : (
            headerTitleContent
          )}
        </div>
        <div className="header-actions">
          {currentUser && currentView === 'recipes' && (
              <div className="search-container" ref={searchRef}>
                <button 
                  className="search-btn" 
                  onClick={toggleSearch}
                  aria-label={t('suche')}
                  title={t('suche')}
                >
                  <SearchIcon color="#1a1a1a" size={20} />
                </button>
                {searchOpen && (
                  <div className="search-input-container">
                    <input
                      type="text"
                      className="search-input"
                      placeholder={t('suchePlatzhalter')}
                      value={searchTerm}
                      onChange={handleSearchChange}
                      onKeyDown={handleSearchKeyDown}
                    />
                    {searchTerm && (
                      <button 
                        className="search-clear-btn"
                        onClick={handleSearchClear}
                        aria-label={t('sucheLoeschen')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
          )}
          {currentUser && (
            <ImportProgressIndicator
              jobs={importJobs}
              onClick={() => setImportDialogOpen(true)}
            />
          )}
          {currentUser && darfSprachwahl && (
            <SprachWahl alsSheet={isMobile} onOffenChange={setSprachwahlOffen} />
          )}
          {currentUser && (
              <div className="hamburger-menu-container" ref={menuRef}>
              <button 
                className="hamburger-btn" 
                onClick={toggleMenu}
                aria-label={t('menueOeffnen')}
                aria-expanded={menuOpen}
              >
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
                <span className="hamburger-line"></span>
              </button>
              {menuOpen && (
                <div className="hamburger-dropdown" ref={dropdownRef}>
                  {onViewChange && (
                    <div className="menu-section">
                      <div className="menu-section-title">{t('navigation')}</div>
                      {startseiteEnabled && (
                        <button
                          className={`menu-item ${currentView === 'startseite' ? 'active' : ''}`}
                          onClick={() => handleViewChangeInternal('startseite')}
                        >
                          {tB('kueche')}
                        </button>
                      )}
                      <button
                        className={`menu-item ${currentView === 'recipes' ? 'active' : ''}`}
                        onClick={() => handleViewChangeInternal('recipes')}
                      >
                        {tB('kochbuch')}
                      </button>
                      <button
                        className={`menu-item ${currentView === 'menus' ? 'active' : ''}`}
                        onClick={() => handleViewChangeInternal('menus')}
                      >
                        {tB('festtafel')}
                      </button>
                      <button
                        className={`menu-item menu-item-events ${currentView === 'events' ? 'active' : ''}`}
                        onClick={() => handleViewChangeInternal('events')}
                      >
                        {tB('events')}
                      </button>
                      {interactiveLists.length > 0 && (
                        <button
                          className={`menu-item ${currentView === 'tagesmenu' ? 'active' : ''}`}
                          onClick={() => handleViewChangeInternal('tagesmenu')}
                        >
                          {tB('kochatelier')}
                        </button>
                      )}
                      <button
                        className={`menu-item ${currentView === 'kueche' ? 'active' : ''}`}
                        onClick={() => handleViewChangeInternal('kueche')}
                      >
                        {tB('chefkochUndMehr')}
                      </button>
                    </div>
                  )}
                  {(visibleFaqs.length > 0 || isApple) && (
                    <div className="menu-section">
                      <div className="menu-section-title">{t('hilfe')}</div>
                      {visibleFaqs.length > 0 && (
                        <button
                          className="menu-item"
                          onClick={() => {
                            setFaqModalOpen(true);
                            setExpandedFaqId(null);
                            setMenuOpen(false);
                          }}
                        >
                          {tB('kochschule')}
                        </button>
                      )}
                      {isApple && (
                        <button
                          className="menu-item"
                          onClick={handleInstallShortcutClick}
                        >
                          {t('kurzbefehlInstallieren')}
                        </button>
                      )}
                    </div>
                  )}
                  {onSettingsClick && (currentUser?.role === 'admin' || currentUser?.settingsAccess) && (
                    <div className="menu-section">
                      <div className="menu-section-title">{t('verwaltung')}</div>
                      <button className="menu-item" onClick={() => {
                        onSettingsClick();
                        setMenuOpen(false);
                      }}>
                        {t('einstellungen')}
                      </button>
                      {currentUser?.appCallsMenu && (
                        <button
                          className={`menu-item ${currentView === 'appCalls' ? 'active' : ''}`}
                          onClick={() => handleViewChangeInternal('appCalls')}
                        >
                          {t('appaufrufe')}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="menu-section">
                    <div className="menu-section-title">{t('benutzer')}</div>
                    <div className="menu-user-info">
                      <button
                        className={`menu-user-name${onChefkochClick ? ' menu-user-name--clickable' : ''}`}
                        onClick={onChefkochClick ? handleChefkochClickInternal : undefined}
                        disabled={!onChefkochClick}
                        aria-label={onChefkochClick ? t('seiteOeffnen', { name: tB('chefkoch') }) : undefined}
                      >
                        {currentUser.isGuest ? tA('gast') : <>{currentUser.vorname} {currentUser.nachname}</>}
                      </button>
                      {currentUser.role === 'admin' && (
                        <span className="admin-badge">{t('admin')}</span>
                      )}
                    </div>
                    {onLogout && (
                      <button className="menu-item logout-item" onClick={handleLogoutInternal}>
                        {t('abmelden')}
                      </button>
                    )}
                  </div>
                  <div className="menu-version">
                    v{process.env.REACT_APP_VERSION || '0.1.1'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>

      {faqModalOpen && (
        <div className="faq-modal-overlay" onClick={() => setFaqModalOpen(false)}>
          <div className="faq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="faq-modal-header">
              <h2 className="faq-modal-title">{tB('kochschule')}</h2>
              <button
                className="faq-modal-close"
                onClick={() => setFaqModalOpen(false)}
                aria-label={t('schliessen', { name: tB('kochschule') })}
              >
                ×
              </button>
            </div>
            <div className="faq-modal-body">
              {visibleFaqs.map((faq) => (
                faq.level === 0 ? (
                  <div key={faq.id} className="faq-section-heading">
                    {renderBoldText(faq.title)}
                    {faq.description && (
                      <p className="faq-section-description">{renderBoldText(faq.description)}</p>
                    )}
                  </div>
                ) : (
                <div key={faq.id} className={`faq-item${faq.level > 1 ? ' faq-item-indented' : ''}`}>
                  <button
                    className="faq-question-btn"
                    onClick={() => setExpandedFaqId(expandedFaqId === faq.id ? null : faq.id)}
                    aria-expanded={expandedFaqId === faq.id}
                  >
                    <span className="faq-question-text">{renderBoldText(faq.title)}</span>
                    <span className="faq-question-arrow">
                      {expandedFaqId === faq.id ? '▲' : '▼'}
                    </span>
                  </button>
                  {expandedFaqId === faq.id && (
                    <div className="faq-answer">
                      {faq.description && (
                        <p className="faq-answer-text">{renderBoldText(faq.description)}</p>
                      )}
                      {faq.screenshot && (
                        <img
                          src={faq.screenshot}
                          alt={t('screenshot')}
                          className="faq-answer-screenshot"
                        />
                      )}
                    </div>
                  )}
                </div>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {schluesselRueckfrage && (
        <ConfirmDialog
          title={t('kurzbefehlRueckfrageTitel')}
          message={t('kurzbefehlRueckfrageText')}
          confirmLabel={t('kurzbefehlRueckfrageWeiter')}
          confirmVariant="primary"
          onConfirm={installShortcut}
          onCancel={() => setSchluesselRueckfrage(false)}
        />
      )}

      {shortcutHinweis && (
        <div className="header-shortcut-hinweis" role="status">
          <span>{t(shortcutHinweis)}</span>
          <button type="button" onClick={() => setShortcutHinweis(null)} aria-label={t('hinweisSchliessen')}>{t('ok')}</button>
        </div>
      )}

      {importDialogOpen && (
        <ImportProgressDialog
          jobs={importJobs}
          deleteBanners={importDeleteBanners}
          onClose={() => setImportDialogOpen(false)}
          onDismissJob={dismissImportJob}
          onRestartJob={restartImportJob}
          onCancelJob={cancelImportJob}
          onUndoDelete={undoImportDelete}
        />
      )}
    </>
  );
});

export default Header;
