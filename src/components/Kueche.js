import React, { useState, useEffect, useMemo } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import PersonalDataPage from './PersonalDataPage';
import { getTimelineBubbleIcon, getTimelineMenuBubbleIcon, getTimelineMenuDefaultImage, getTimelineCookEventBubbleIcon, getTimelineCookEventDefaultImage } from '../utils/customLists';
import { getAllCookDates } from '../utils/recipeCookDates';
import { getCategoryImages } from '../utils/categoryImages';
import { getAppCalls } from '../utils/appCallsFirestore';
import { getRecipeCalls } from '../utils/recipeCallsFirestore';

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

function Kueche({ recipes, menus = [], groups = [], onSelectRecipe, onSelectMenu, allUsers, currentUser, onProfileUpdated, onViewChange }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineMenuBubbleIcon, setTimelineMenuBubbleIcon] = useState(null);
  const [timelineCookEventBubbleIcon, setTimelineCookEventBubbleIcon] = useState(null);
  const [categoryImages, setCategoryImages] = useState([]);
  const [timelineMenuDefaultImage, setTimelineMenuDefaultImage] = useState(null);
  const [timelineCookEventDefaultImage, setTimelineCookEventDefaultImage] = useState(null);
  const [showPersonalData, setShowPersonalData] = useState(false);
  const [appCalls, setAppCalls] = useState([]);
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [cookDates, setCookDates] = useState([]);

  useEffect(() => {
    Promise.all([
      getTimelineBubbleIcon(),
      getTimelineMenuBubbleIcon(),
      getCategoryImages(),
      getTimelineMenuDefaultImage(),
      getTimelineCookEventBubbleIcon(),
      getTimelineCookEventDefaultImage(),
    ]).then(([icon, menuIcon, catImages, menuImg, cookEventIcon, cookEventImg]) => {
      setTimelineBubbleIcon(icon);
      setTimelineMenuBubbleIcon(menuIcon);
      setCategoryImages(catImages);
      setTimelineMenuDefaultImage(menuImg);
      setTimelineCookEventBubbleIcon(cookEventIcon);
      setTimelineCookEventDefaultImage(cookEventImg);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentUser?.appCalls) return;
    getAppCalls().then(calls => setAppCalls(calls)).catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    getRecipeCalls().then(calls => setRecipeCalls(calls)).catch(() => {});
  }, [currentUser]);

  const filteredRecipes = useMemo(
    () => currentUser ? recipes.filter(r => r.authorId === currentUser.id) : recipes,
    [currentUser, recipes]
  );

  useEffect(() => {
    if (!currentUser || !filteredRecipes.length) {
      setCookDates([]);
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
  }));

  // Transform cookDates into the shape expected by RecipeTimeline
  const cookDateTimelineItems = cookDates
    .filter(cd => currentUser ? cd.userId === currentUser.id : true)
    .map(cookDate => ({
      id: `cookdate-${cookDate.id}`,
      title: filteredRecipes.find(r => r.id === cookDate.recipeId)?.title || 'Unbekanntes Rezept',
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

  const chefkochName = currentUser
    ? [currentUser.vorname, currentUser.nachname].filter(Boolean).join(' ')
    : null;

  return (
    <div className="kueche-container">
      {showPersonalData ? (
        <PersonalDataPage
          currentUser={currentUser}
          onBack={() => setShowPersonalData(false)}
          onProfileUpdated={(updatedUser) => {
            setShowPersonalData(false);
            if (onProfileUpdated) onProfileUpdated(updatedUser);
          }}
          privateLists={groups.filter(g => g.type === 'private' && (g.ownerId === currentUser?.id || (Array.isArray(g.memberIds) && g.memberIds.includes(currentUser?.id))))}
        />
      ) : (
        <>
          <div className="kueche-header">
            <h2>Küche</h2>
          </div>
          <div
            className="kueche-tile kueche-tile--chefkoch"
            onClick={() => setShowPersonalData(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowPersonalData(true); } }}
            role="button"
            tabIndex={0}
            aria-label="Chefkoch persönliche Daten öffnen"
          >
            <div className="kueche-tile-content">
              <h3>Chefkoch</h3>
              {chefkochName && (
                <div className="kueche-tile-meta">
                  <span className="meta-text">{chefkochName}</span>
                </div>
              )}
            </div>
          </div>
          <div
            className="kueche-tile kueche-tile--mise-en-place"
            data-testid="mise-en-place-tile"
            onClick={handleMiseEnPlaceClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMiseEnPlaceClick(); } }}
            role="button"
            tabIndex={0}
            aria-label="Meine Mise en Place – Berechtigungsgruppen öffnen"
          >
            <div className="kueche-tile-content">
              <h3>Meine Mise en Place</h3>
              <div className="kueche-tile-meta">
                <span className="meta-text">
                  <strong>{privateListCount}</strong>
                  <span>{privateListCount === 1 ? 'private Liste' : 'private Listen'}</span>
                </span>
              </div>
            </div>
          </div>
          {currentUser?.appCalls && (
            <div
              className="kueche-tile kueche-tile--appaufrufe"
              onClick={() => onViewChange && onViewChange('appCalls')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewChange && onViewChange('appCalls'); } }}
              role="button"
              tabIndex={0}
              aria-label="Küchenbetrieb Statistik öffnen"
            >
              <div className="kueche-tile-content">
                <h3>Küchenbetrieb</h3>
                <div className="kueche-tile-meta">
                  <span className="meta-text">
                    <strong>{todayCallsCount}</strong>
                    <span>{todayCallsCount === 1 ? 'Aufruf heute' : 'Aufrufe heute'}</span>
                  </span>
                </div>
                <AppCallsBarChart appCalls={appCalls} />
              </div>
            </div>
          )}
          {currentUser && (
            <div
              className="kueche-tile kueche-tile--meine-kuechenstars"
              onClick={() => onViewChange && onViewChange('meineKuechenstars')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewChange && onViewChange('meineKuechenstars'); } }}
              role="button"
              tabIndex={0}
              aria-label="Meine Küchenstars Top Rezepte öffnen"
            >
              <div className="kueche-tile-content">
                <h3>Meine Küchenstars</h3>
                {mostViewedRecipe && (
                  <div className="kueche-tile-meta">
                    <span className="meta-text">
                      <strong>{mostViewedRecipe.count}</strong>
                      <span>{mostViewedRecipe.recipe.title}</span>
                    </span>
                  </div>
                )}
                <RecipeCallsBarChart recipeCalls={ownRecipeCalls} />
              </div>
            </div>
          )}
          <div
            className="kueche-tile kueche-tile--meinkochbuch"
            onClick={() => setShowTimeline(prev => !prev)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowTimeline(prev => !prev); } }}
            role="button"
            tabIndex={0}
            aria-expanded={showTimeline}
            aria-label="Toggle Meine Küche timeline"
          >
            <div className="kueche-tile-content">
              <h3>Mein Kochbuch</h3>
              <div className="kueche-tile-meta">
                <span className="meta-text">
                  <strong>{filteredRecipes.length}</strong>
                  <span>{filteredRecipes.length === 1 ? 'Rezept' : 'Rezepte'}</span>
                </span>
                <span className="meta-text">
                  <strong>{filteredMenus.length}</strong>
                  <span>{filteredMenus.length === 1 ? 'Menü' : 'Menüs'}</span>
                </span>
              </div>
              <RecipeBarChart recipes={filteredRecipes} />
            </div>
          </div>
          {showTimeline && (
            <RecipeTimeline
              recipes={combinedItems}
              onSelectRecipe={handleSelectItem}
              allUsers={allUsers}
              timelineBubbleIcon={timelineBubbleIcon}
              timelineMenuBubbleIcon={timelineMenuBubbleIcon}
              timelineCookEventBubbleIcon={timelineCookEventBubbleIcon}
              categoryImages={categoryImages}
              defaultImage={timelineMenuDefaultImage}
              timelineCookEventDefaultImage={timelineCookEventDefaultImage}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Kueche;
