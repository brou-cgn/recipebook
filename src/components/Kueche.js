import React, { useState, useEffect, useMemo, useId } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import PersonalDataPage from './PersonalDataPage';
import NetworkPage from './NetworkPage';
import WeinbegleitungSeite from './WeinbegleitungSeite';
import { alleStile, alleQuellen } from '../utils/weinbegleitung/wissensbasis';
import {
  getTimelineBubbleIcon,
  getTimelineMenuBubbleIcon,
  getTimelineCookEventBubbleIcon,
  getTimelineCookEventDefaultImage,
  getButtonIcons,
  DEFAULT_BUTTON_ICONS,
  getEffectiveIcon,
  getDarkModePreference,
} from '../utils/customLists';
import { getAllCookDates } from '../utils/recipeCookDates';
import { getCategoryImages } from '../utils/categoryImages';
import { getRecentAppCalls } from '../utils/appCallsFirestore';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import { isBase64Image } from '../utils/imageUtils';
import { useNutritionReference } from '../contexts/NutritionReferenceContext';
import { getCuisineProposals } from '../utils/cuisineProposalsFirestore';
import { getKuechenbetriebFabConfig } from '../utils/kuechenbetriebTabs';
import { isFuerDichEntdecktList } from '../utils/fuerDichEntdeckt';
import { getKalibrierungsSnapshotsOnce } from '../utils/drinkWeightsFirestore';
import { countSnapshotsByMonth } from '../utils/kalibrierungsAuswertung';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereZahl } from '../i18n/format';
import bereicheTexte from '../i18n/texte/bereiche';
import chefkochTexte from '../i18n/texte/chefkochUndMehr';
import allgemeinTexte from '../i18n/texte/allgemein';

function getLastSixMonthsRecipeCounts(recipes) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), count: 0 });
  }
  recipes.forEach(recipe => {
    let date;
    if (recipe.createdAt && typeof recipe.createdAt.toDate === 'function') {
      date = recipe.createdAt.toDate();
    } else if (recipe.createdAt instanceof Date) {
      date = recipe.createdAt;
    } else if (recipe.createdAt) {
      date = new Date(recipe.createdAt);
    }
    if (!date || isNaN(date.getTime())) return;
    const entry = months.find(m => m.year === date.getFullYear() && m.month === date.getMonth());
    if (entry) entry.count++;
  });
  return months;
}

const MIN_BAR_HEIGHT_PERCENT = 16;

function parseCallTimestamp(call) {
  if (call.timestamp && typeof call.timestamp.toDate === 'function') {
    return call.timestamp.toDate();
  } else if (call.timestamp instanceof Date) {
    return call.timestamp;
  } else if (call.timestamp) {
    return new Date(call.timestamp);
  }
  return null;
}

function getLastSevenDaysAppCallCounts(appCalls) {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), count: 0 });
  }
  appCalls.forEach(call => {
    const date = parseCallTimestamp(call);
    if (!date || isNaN(date.getTime())) return;
    const entry = days.find(d => d.year === date.getFullYear() && d.month === date.getMonth() && d.day === date.getDate());
    if (entry) entry.count++;
  });
  return days;
}

function getLastSevenDaysRecipeCallCounts(recipeCalls) {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), count: 0 });
  }
  recipeCalls.forEach(call => {
    const date = parseCallTimestamp(call);
    if (!date || isNaN(date.getTime())) return;
    const entry = days.find(d => d.year === date.getFullYear() && d.month === date.getMonth() && d.day === date.getDate());
    if (entry) entry.count++;
  });
  return days;
}

function RecipeCallsBarChart({ recipeCalls }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const dailyData = getLastSevenDaysRecipeCallCounts(recipeCalls);
  const maxCount = Math.max(...dailyData.map(d => d.count), 1);

  return (
    <div className="kueche-bar-chart" data-testid="recipe-calls-bar-chart" aria-hidden="true">
      {dailyData.map((d, i) => {
        const isToday = d.year === currentYear && d.month === currentMonth && d.day === currentDay;
        const heightPercent = Math.max(MIN_BAR_HEIGHT_PERCENT, Math.round((d.count / maxCount) * 100));
        return (
          <div
            key={i}
            className={`kueche-bar-chart__bar${isToday ? ' kueche-bar-chart__bar--meine-kuechenstars' : ''}`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}

function AppCallsBarChart({ appCalls }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const dailyData = getLastSevenDaysAppCallCounts(appCalls);
  const maxCount = Math.max(...dailyData.map(d => d.count), 1);

  return (
    <div className="kueche-bar-chart" data-testid="app-calls-bar-chart" aria-hidden="true">
      {dailyData.map((d, i) => {
        const isToday = d.year === currentYear && d.month === currentMonth && d.day === currentDay;
        const heightPercent = Math.max(MIN_BAR_HEIGHT_PERCENT, Math.round((d.count / maxCount) * 100));
        return (
          <div
            key={i}
            className={`kueche-bar-chart__bar${isToday ? ' kueche-bar-chart__bar--appaufrufe' : ''}`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}

function RecipeBarChart({ recipes }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthlyData = getLastSixMonthsRecipeCounts(recipes);
  const maxCount = Math.max(...monthlyData.map(m => m.count), 1);

  return (
    <div className="kueche-bar-chart" data-testid="recipe-bar-chart" aria-hidden="true">
      {monthlyData.map((m, i) => {
        const isCurrentMonth = m.year === currentYear && m.month === currentMonth;
        const heightPercent = Math.max(MIN_BAR_HEIGHT_PERCENT, Math.round((m.count / maxCount) * 100));
        return (
          <div
            key={i}
            className={`kueche-bar-chart__bar${isCurrentMonth ? ' kueche-bar-chart__bar--meinkochbuch' : ''}`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}

function EventCalibrationBarChart({ snapshots }) {
  const now = new Date();
  const monthlyData = countSnapshotsByMonth(snapshots, 6, now);
  const maxCount = Math.max(...monthlyData.map(m => m.count), 1);

  return (
    <div className="kueche-bar-chart" data-testid="eventplanung-bar-chart" aria-hidden="true">
      {monthlyData.map((m, i) => {
        const isCurrentMonth = m.year === now.getFullYear() && m.month === now.getMonth();
        const heightPercent = Math.max(MIN_BAR_HEIGHT_PERCENT, Math.round((m.count / maxCount) * 100));
        return (
          <div
            key={i}
            className={`kueche-bar-chart__bar${isCurrentMonth ? ' kueche-bar-chart__bar--eventplanung' : ''}`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Kachel auf „Chefkoch & mehr“ (Variante A, Bento). Der Titel ist ein echter Knopf in der
 * Überschrift; sein Klickbereich deckt per ::after die ganze Kachel ab. Der Inhalt (Zahlen)
 * beschreibt den Knopf (aria-describedby), Diagramme sind nur Schmuck.
 */
function Kachel({ art, titel, onOeffnen, testId, breit = false, ausgeklappt, steuert, zusatz, children }) {
  const inhaltId = useId();
  return (
    <div className={`kueche-tile kueche-tile--${art}${breit ? ' kueche-tile--breit' : ''}`} data-testid={testId}>
      <div className="kueche-tile__kopf">
        <h3 className="kueche-tile__titel">
          <button
            type="button"
            className="kueche-tile__knopf"
            onClick={onOeffnen}
            aria-expanded={ausgeklappt}
            aria-controls={steuert}
            aria-describedby={children ? inhaltId : undefined}
          >
            {titel}
          </button>
        </h3>
        {zusatz}
      </div>
      {children && <div className="kueche-tile__inhalt" id={inhaltId}>{children}</div>}
    </div>
  );
}

/** Große Zahl mit ihrer Bezeichnung darunter. */
function Kennzahl({ wert, label }) {
  return (
    <span className="meta-text">
      <strong>{wert}</strong>
      <span>{label}</span>
    </span>
  );
}

function Kueche({ followRequestCount = 0, recipes, menus = [], groups = [], onSelectRecipe, onSelectMenu, allUsers, currentUser, onProfileUpdated, onViewChange, openPersonalData, onPersonalDataOpened, openNetwork, onNetworkOpened, onPersonalDataVisibilityChange }) {
  const { rows: nutritionReferenceRows } = useNutritionReference();
  const t = useTexte(chefkochTexte);
  const tB = useTexte(bereicheTexte);
  const tA = useTexte(allgemeinTexte);
  const { sprache } = useSprache();
  const zahl = (wert) => formatiereZahl(wert, sprache);
  const profilInhaltId = useId();
  const zeitleisteId = useId();
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineMenuBubbleIcon, setTimelineMenuBubbleIcon] = useState(null);
  const [timelineCookEventBubbleIcon, setTimelineCookEventBubbleIcon] = useState(null);
  const [categoryImages, setCategoryImages] = useState([]);
  const [timelineCookEventDefaultImage, setTimelineCookEventDefaultImage] = useState(null);
  const [showPersonalData, setShowPersonalData] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [showWeinbegleitung, setShowWeinbegleitung] = useState(false);
  const canUseFollow = Boolean(currentUser?.follow) && !currentUser?.isGuest;
  const [appCalls, setAppCalls] = useState([]);
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [cookDates, setCookDates] = useState([]);
  const prevOpenPersonalData = React.useRef(false);
  const kuecheScrollPositionRef = React.useRef(0);
  const hadPersonalDataOpenRef = React.useRef(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(() => getDarkModePreference());
  const [fabPressed, setFabPressed] = useState(false);
  const [cuisineProposals, setCuisineProposals] = useState([]);
  const [kalibrierungsSnapshots, setKalibrierungsSnapshots] = useState([]);
  const personalDataVisibilityChangeRef = React.useRef(onPersonalDataVisibilityChange);

  useEffect(() => {
    if (showPersonalData) {
      kuecheScrollPositionRef.current = window.scrollY;
      hadPersonalDataOpenRef.current = true;
      window.scrollTo(0, 0);
    } else if (hadPersonalDataOpenRef.current) {
      const savedPos = kuecheScrollPositionRef.current;
      hadPersonalDataOpenRef.current = false;
      requestAnimationFrame(() => window.scrollTo(0, savedPos));
    }
  }, [showPersonalData]);

  useEffect(() => {
    if (openPersonalData && !prevOpenPersonalData.current) {
      setShowPersonalData(true);
      if (onPersonalDataOpened) onPersonalDataOpened();
    }
    prevOpenPersonalData.current = openPersonalData;
  }, [openPersonalData, onPersonalDataOpened]);

  useEffect(() => {
    if (!openNetwork) return;
    if (canUseFollow) {
      setShowPersonalData(false);
      setShowNetwork(true);
    }
    if (onNetworkOpened) onNetworkOpened();
  }, [openNetwork, canUseFollow, onNetworkOpened]);

  useEffect(() => {
    personalDataVisibilityChangeRef.current = onPersonalDataVisibilityChange;
  }, [onPersonalDataVisibilityChange]);

  useEffect(() => {
    personalDataVisibilityChangeRef.current?.(showPersonalData);
  }, [showPersonalData]);

  useEffect(() => {
    return () => {
      personalDataVisibilityChangeRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      getTimelineBubbleIcon(),
      getTimelineMenuBubbleIcon(),
      getCategoryImages(),
      getTimelineCookEventBubbleIcon(),
      getTimelineCookEventDefaultImage(),
    ]).then(([icon, menuIcon, catImages, cookEventIcon, cookEventImg]) => {
      setTimelineBubbleIcon(icon);
      setTimelineMenuBubbleIcon(menuIcon);
      setCategoryImages(catImages);
      setTimelineCookEventBubbleIcon(cookEventIcon);
      setTimelineCookEventDefaultImage(cookEventImg);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getButtonIcons().then((icons) => {
      setButtonIcons(icons);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    if (!currentUser?.appCalls) return;
    // Diagramm und „Aufrufe heute“ brauchen nur die letzten 7 Tage (Tech-Check K2).
    getRecentAppCalls(7).then(calls => setAppCalls(calls)).catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    getRecentRecipeCalls(14).then(calls => setRecipeCalls(calls)).catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.kuecheFab) {
      setCuisineProposals([]);
      return;
    }
    getCuisineProposals().then((proposals) => {
      setCuisineProposals(proposals);
    }).catch(() => {
      setCuisineProposals([]);
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.eventplanung) {
      setKalibrierungsSnapshots([]);
      return;
    }
    let active = true;
    getKalibrierungsSnapshotsOnce()
      .then((data) => { if (active) setKalibrierungsSnapshots(data || []); })
      .catch(() => {});
    return () => { active = false; };
  }, [currentUser]);

  const filteredRecipes = useMemo(
    () => currentUser ? recipes.filter(r => r.authorId === currentUser.id) : recipes,
    [currentUser, recipes]
  );

  useEffect(() => {
    if (!currentUser) {
      setCookDates([]);
      return;
    }
    if (!filteredRecipes.length) {
      // Recipes not yet loaded or user has none – don't clear immediately
      return;
    }
    Promise.all(filteredRecipes.map(r => getAllCookDates(r.id)))
      .then(results => setCookDates(results.flat()))
      .catch(() => setCookDates([]));
  }, [currentUser, filteredRecipes]);

  const filteredMenus = currentUser
    ? menus.filter(m => (m.authorId || m.createdBy) === currentUser.id)
    : menus;

  const privateListCount = currentUser
    ? groups.filter(g => g.type === 'private' && (g.ownerId === currentUser.id || (g.memberIds && g.memberIds.includes(currentUser.id)))).length
    : 0;

  const todayCallsCount = (() => {
    const now = new Date();
    return appCalls.filter(call => {
      const date = parseCallTimestamp(call);
      if (!date || isNaN(date.getTime())) return false;
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    }).length;
  })();

  const ownRecipeCalls = recipeCalls.filter(call => filteredRecipes.some(r => r.id === call.recipeId));

  const mostViewedRecipe = (() => {
    if (!filteredRecipes.length) return null;
    const counts = filteredRecipes.map(recipe => ({
      recipe,
      count: recipeCalls.filter(call => call.recipeId === recipe.id).length,
    })).sort((a, b) => b.count - a.count);
    return counts[0] && counts[0].count > 0 ? counts[0] : null;
  })();

  // Transform menus into the shape expected by RecipeTimeline
  const menuTimelineItems = filteredMenus.map(menu => ({
    id: menu.id,
    title: menu.name,
    createdAt: menu.menuDate ? new Date(menu.menuDate) : menu.createdAt,
    ingredients: menu.recipeIds || [],
    steps: [],
    authorId: menu.authorId || menu.createdBy,
    itemType: 'menu',
    image: menu.image || null,
  }));

  // Transform cookDates into the shape expected by RecipeTimeline
  const cookDateTimelineItems = cookDates
    .map(cookDate => ({
      id: `cookdate-${cookDate.id}`,
      title: filteredRecipes.find(r => r.id === cookDate.recipeId)?.title || t('unbekanntesRezept'),
      recipeId: cookDate.recipeId,
      createdAt: cookDate.date,
      authorId: cookDate.userId,
      itemType: 'cookEvent',
      originalRecipe: filteredRecipes.find(r => r.id === cookDate.recipeId),
    }));

  const combinedItems = [...filteredRecipes, ...menuTimelineItems, ...cookDateTimelineItems];

  const handleSelectItem = (item) => {
    if (item.itemType === 'menu') {
      const menu = filteredMenus.find(m => m.id === item.id);
      if (menu && onSelectMenu) onSelectMenu(menu);
    } else if (item.itemType === 'cookEvent') {
      const recipe = filteredRecipes.find(r => r.id === item.recipeId);
      if (recipe && onSelectRecipe) onSelectRecipe(recipe);
    } else {
      if (onSelectRecipe) onSelectRecipe(item);
    }
  };

  const handleMiseEnPlaceClick = () => {
    if (onViewChange) onViewChange('groups');
  };

  // Gäste heißen in der geltenden Sprache „Gast“ (gespeichert bleibt vorname 'Gast')
  const namensteile = currentUser?.isGuest ? [tA('gast')] : [currentUser?.vorname, currentUser?.nachname];
  const chefkochName = currentUser ? namensteile.filter(Boolean).join(' ') : null;
  const initialen = namensteile
    .map((teil) => (teil || '').trim().charAt(0))
    .join('')
    .toUpperCase();
  const signatur = (currentUser?.signatureSatz || '').trim();
  const zeigtVerwaltung = Boolean(currentUser?.appCalls || currentUser?.eventplanung);

  const kuechenbetriebFabConfig = useMemo(
    () => getKuechenbetriebFabConfig({ recipes, nutritionReferenceRows, cuisineProposals }),
    [recipes, nutritionReferenceRows, cuisineProposals]
  );

  const handleKuecheFabClick = () => {
    if (!kuechenbetriebFabConfig.showFab || !kuechenbetriebFabConfig.activeTab) return;
    onViewChange?.('appCalls', {
      visibleTabs: kuechenbetriebFabConfig.visibleTabs,
      activeTab: kuechenbetriebFabConfig.activeTab,
    });
  };

  return (
    <div className="kueche-container">
      {showWeinbegleitung ? (
        <WeinbegleitungSeite currentUser={currentUser} onBack={() => setShowWeinbegleitung(false)} />
      ) : showNetwork ? (
        <NetworkPage currentUser={currentUser} onBack={() => setShowNetwork(false)} />
      ) : showPersonalData ? (
        <PersonalDataPage
          currentUser={currentUser}
          onBack={() => setShowPersonalData(false)}
          // Speichern des Formulars schließt die Seite; eine geänderte Einstellung (Sprache,
          // Liste, Hintergrundaktualisierung, PIN) meldet { schliessen: false } und bleibt.
          onProfileUpdated={(updatedUser, { schliessen = true } = {}) => {
            if (schliessen) setShowPersonalData(false);
            if (onProfileUpdated) onProfileUpdated(updatedUser);
          }}
          privateLists={groups.filter(g => g.type === 'private' && !isFuerDichEntdecktList(g) && (g.ownerId === currentUser?.id || (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id))))}
        />
      ) : (
        <>
          <div className="kueche-header">
            <h2>{tB('chefkochUndMehr')}</h2>
          </div>
          <div className="kueche-raster">
            <div className="kueche-tile kueche-tile--chefkoch kueche-profil">
              {initialen && <span className="kueche-profil__avatar" aria-hidden="true">{initialen}</span>}
              <div className="kueche-profil__text">
                <h3 className="kueche-tile__titel kueche-profil__rolle">
                  <button
                    type="button"
                    className="kueche-tile__knopf"
                    onClick={() => setShowPersonalData(true)}
                    aria-describedby={chefkochName || signatur ? profilInhaltId : undefined}
                  >
                    {tB('chefkoch')}
                  </button>
                </h3>
                {(chefkochName || signatur) && (
                  <div id={profilInhaltId}>
                    {chefkochName && <p className="kueche-profil__name">{chefkochName}</p>}
                    {signatur && <p className="kueche-profil__signatur">{signatur}</p>}
                  </div>
                )}
              </div>
              <span className="kueche-profil__pfeil" aria-hidden="true">›</span>
            </div>

            <Kachel
              art="meinkochbuch"
              breit
              titel={t('meinKochbuch')}
              onOeffnen={() => setShowTimeline(prev => !prev)}
              ausgeklappt={showTimeline}
              steuert={showTimeline ? zeitleisteId : undefined}
              zusatz={(
                <span className={`kueche-tile__aktion${showTimeline ? ' kueche-tile__aktion--offen' : ''}`} aria-hidden="true">
                  {t('zeitleiste')} ›
                </span>
              )}
            >
              <span className="kueche-tile-meta">
                <Kennzahl wert={zahl(filteredRecipes.length)} label={t('rezepte', { anzahl: filteredRecipes.length })} />
                <Kennzahl wert={zahl(filteredMenus.length)} label={t('menues', { anzahl: filteredMenus.length })} />
              </span>
              <RecipeBarChart recipes={filteredRecipes} />
            </Kachel>

            {showTimeline && (
              <div className="kueche-zeitleiste" id={zeitleisteId}>
                <RecipeTimeline
                  recipes={combinedItems}
                  onSelectRecipe={handleSelectItem}
                  allUsers={allUsers}
                  timelineBubbleIcon={timelineBubbleIcon}
                  timelineMenuBubbleIcon={timelineMenuBubbleIcon}
                  timelineCookEventBubbleIcon={timelineCookEventBubbleIcon}
                  categoryImages={categoryImages}
                  defaultImage={getEffectiveIcon(buttonIcons, 'timelineMenuDefaultImg', isDarkMode) || null}
                  timelineCookEventDefaultImage={timelineCookEventDefaultImage}
                />
              </div>
            )}

            {currentUser && (
              <Kachel
                art="meine-kuechenstars"
                titel={t('kuechenstars')}
                onOeffnen={() => onViewChange && onViewChange('meineKuechenstars')}
              >
                <span className="kueche-tile-meta">
                  {mostViewedRecipe ? (
                    <Kennzahl wert={zahl(mostViewedRecipe.count)} label={mostViewedRecipe.recipe.title} />
                  ) : (
                    <span className="kueche-tile-leer">{t('keineAufrufe')}</span>
                  )}
                </span>
                <RecipeCallsBarChart recipeCalls={ownRecipeCalls} />
              </Kachel>
            )}

            {canUseFollow && (
              <Kachel
                art="netzwerk"
                testId="netzwerk-tile"
                titel={t('meinNetzwerk')}
                onOeffnen={() => setShowNetwork(true)}
                zusatz={followRequestCount > 0 ? <span className="kueche-tile__punkt" aria-hidden="true" /> : null}
              >
                <span className="kueche-tile-meta">
                  <Kennzahl wert={zahl(followRequestCount)} label={t('offeneAnfragen', { anzahl: followRequestCount })} />
                </span>
              </Kachel>
            )}

            <Kachel
              art="mise-en-place"
              testId="mise-en-place-tile"
              titel={t('miseEnPlace')}
              onOeffnen={handleMiseEnPlaceClick}
            >
              <span className="kueche-tile-meta">
                <Kennzahl wert={zahl(privateListCount)} label={t('privateListen', { anzahl: privateListCount })} />
              </span>
            </Kachel>

            {currentUser && (
              <Kachel
                art="weinbegleitung"
                testId="weinbegleitung-tile"
                titel={t('weinbegleitung')}
                onOeffnen={() => setShowWeinbegleitung(true)}
              >
                <span className="kueche-tile-meta">
                  <Kennzahl wert={zahl(alleStile().length)} label={t('weinstile', { anzahl: alleStile().length })} />
                  <Kennzahl wert={zahl(alleQuellen().length)} label={t('quellen', { anzahl: alleQuellen().length })} />
                </span>
              </Kachel>
            )}
          </div>

          {zeigtVerwaltung && (
            <section className="kueche-verwaltung">
              <h3 className="kueche-abschnitt-titel">{t('verwaltung')}</h3>
              <div className="kueche-raster">
                {currentUser?.appCalls && (
                  <Kachel
                    art="appaufrufe"
                    titel={t('kuechenbetrieb')}
                    onOeffnen={() => onViewChange && onViewChange('appCalls')}
                  >
                    <span className="kueche-tile-meta">
                      <Kennzahl wert={zahl(todayCallsCount)} label={t('aufrufeHeute', { anzahl: todayCallsCount })} />
                    </span>
                    <AppCallsBarChart appCalls={appCalls} />
                  </Kachel>
                )}
                {currentUser?.eventplanung && (
                  <Kachel
                    art="eventplanung"
                    testId="eventplanung-tile"
                    titel={t('eventplanung')}
                    onOeffnen={() => onViewChange && onViewChange('eventplanung')}
                  >
                    <span className="kueche-tile-meta">
                      <Kennzahl wert={zahl(kalibrierungsSnapshots.length)} label={t('events', { anzahl: kalibrierungsSnapshots.length })} />
                    </span>
                    <EventCalibrationBarChart snapshots={kalibrierungsSnapshots} />
                  </Kachel>
                )}
              </div>
            </section>
          )}

          {currentUser?.kuecheFab && kuechenbetriebFabConfig.showFab && (
            <button
              className={`kueche-fab-button${fabPressed ? ' pressed' : ''}`}
              onClick={handleKuecheFabClick}
              onTouchStart={() => setFabPressed(true)}
              onTouchEnd={() => setFabPressed(false)}
              onTouchCancel={() => setFabPressed(false)}
              onMouseDown={() => setFabPressed(true)}
              onMouseUp={() => setFabPressed(false)}
              onMouseLeave={() => setFabPressed(false)}
              title={t('kuecheAktion')}
              aria-label={t('kuecheAktion')}
            >
              {isBase64Image(getEffectiveIcon(buttonIcons, 'kuecheFab', isDarkMode)) ? (
                <img src={getEffectiveIcon(buttonIcons, 'kuecheFab', isDarkMode)} alt={t('kuecheAktion')} className="kueche-fab-button__icon" draggable="false" />
              ) : (
                getEffectiveIcon(buttonIcons, 'kuecheFab', isDarkMode)
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default Kueche;
