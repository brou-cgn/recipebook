import React, { useState, useEffect } from 'react';
import './Kueche.css';
import RecipeTimeline from './RecipeTimeline';
import PersonalDataPage from './PersonalDataPage';
import { getTimelineBubbleIcon, getTimelineMenuBubbleIcon, getTimelineMenuDefaultImage } from '../utils/customLists';
import { getCategoryImages } from '../utils/categoryImages';

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
            className={`kueche-bar-chart__bar${isCurrentMonth ? ' kueche-bar-chart__bar--current' : ''}`}
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}

function Kueche({ recipes, menus = [], onSelectRecipe, onSelectMenu, allUsers, currentUser, onProfileUpdated, onViewChange }) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [timelineMenuBubbleIcon, setTimelineMenuBubbleIcon] = useState(null);
  const [categoryImages, setCategoryImages] = useState([]);
  const [timelineMenuDefaultImage, setTimelineMenuDefaultImage] = useState(null);
  const [showPersonalData, setShowPersonalData] = useState(false);

  useEffect(() => {
    Promise.all([
      getTimelineBubbleIcon(),
      getTimelineMenuBubbleIcon(),
      getCategoryImages(),
      getTimelineMenuDefaultImage(),
    ]).then(([icon, menuIcon, catImages, menuImg]) => {
      setTimelineBubbleIcon(icon);
      setTimelineMenuBubbleIcon(menuIcon);
      setCategoryImages(catImages);
      setTimelineMenuDefaultImage(menuImg);
    }).catch(() => {});
  }, []);

  const filteredRecipes = currentUser
    ? recipes.filter(r => r.authorId === currentUser.id)
    : recipes;

  const filteredMenus = currentUser
    ? menus.filter(m => (m.authorId || m.createdBy) === currentUser.id)
    : menus;

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

  const combinedItems = [...filteredRecipes, ...menuTimelineItems];

  const handleSelectItem = (item) => {
    if (item.itemType === 'menu') {
      const menu = filteredMenus.find(m => m.id === item.id);
      if (menu && onSelectMenu) onSelectMenu(menu);
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
            className="kueche-tile"
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
          <div
            className="kueche-tile kueche-tile--mise-en-place"
            onClick={handleMiseEnPlaceClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleMiseEnPlaceClick(); } }}
            role="button"
            tabIndex={0}
            aria-label="Meine Mise en Place – Berechtigungsgruppen öffnen"
          >
            <div className="kueche-tile-content">
              <h3>Meine Mise en Place</h3>
            </div>
          </div>
          {showTimeline && (
            <RecipeTimeline
              recipes={combinedItems}
              onSelectRecipe={handleSelectItem}
              allUsers={allUsers}
              timelineBubbleIcon={timelineBubbleIcon}
              timelineMenuBubbleIcon={timelineMenuBubbleIcon}
              categoryImages={categoryImages}
              defaultImage={timelineMenuDefaultImage}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Kueche;
