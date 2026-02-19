import React, { useMemo, useState } from 'react';
import './RecipeTimeline.css';
import { isBase64Image } from '../utils/imageUtils';

// Return a YYYY-MM-DD key for a Firestore timestamp or Date
function getDateKey(timestamp) {
  if (!timestamp) return 'unknown';
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().split('T')[0];
  } catch {
    return 'unknown';
  }
}

function RecipeTimeline({ recipes, onSelectRecipe, allUsers = [], timelineBubbleIcon = null }) {
  const [expandedDates, setExpandedDates] = useState({});

  // Sort recipes by createdAt in reverse chronological order (newest first)
  const sortedRecipes = useMemo(() => {
    return [...recipes].sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || a.createdAt || new Date(0);
      const dateB = b.createdAt?.toDate?.() || b.createdAt || new Date(0);
      return dateB - dateA; // Reverse chronological order
    });
  }, [recipes]);

  // Group recipes by calendar day (preserving reverse-chronological order)
  const groupedByDate = useMemo(() => {
    const groups = [];
    const seen = new Map();
    for (const recipe of sortedRecipes) {
      const key = getDateKey(recipe.createdAt);
      if (!seen.has(key)) {
        seen.set(key, []);
        groups.push({ dateKey: key, recipes: seen.get(key) });
      }
      seen.get(key).push(recipe);
    }
    return groups;
  }, [sortedRecipes]);

  // Helper function to format date
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unbekannt';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Unbekannt';
    }
  };

  // Helper function to get author name
  const getAuthorName = (authorId) => {
    if (!authorId) return null;
    const author = allUsers.find(u => u.id === authorId);
    if (!author) return null;
    return `${author.vorname} ${author.nachname}`;
  };

  const toggleExpand = (dateKey) => {
    setExpandedDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  const renderCard = (recipe) => (
    <div
      key={recipe.id}
      className="timeline-card"
      onClick={() => onSelectRecipe(recipe)}
    >
      {recipe.image && (
        <div className="timeline-image">
          <img src={recipe.image} alt={recipe.title} />
        </div>
      )}
      <div className="timeline-info">
        <h3 className="timeline-title">{recipe.title}</h3>
        <div className="timeline-meta">
          <span>{recipe.ingredients?.length || 0} Zutaten</span>
          <span>{recipe.steps?.length || 0} Schritte</span>
        </div>
        {getAuthorName(recipe.authorId) && (
          <div className="timeline-author">{getAuthorName(recipe.authorId)}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="recipe-timeline-container">
      <div className="timeline-line"></div>
      {groupedByDate.map(({ dateKey, recipes: dayRecipes }, groupIndex) => {
        const isExpanded = expandedDates[dateKey];
        const hasMultiple = dayRecipes.length > 1;
        const primaryRecipe = dayRecipes[0];

        return (
          <div
            key={dateKey}
            className="timeline-item"
            style={{ animationDelay: `${groupIndex * 0.05}s` }}
          >
            <div className="timeline-marker">
              {timelineBubbleIcon && (
                isBase64Image(timelineBubbleIcon) ? (
                  <img src={timelineBubbleIcon} alt="" className="timeline-marker-icon" />
                ) : (
                  <span className="timeline-marker-emoji">{timelineBubbleIcon}</span>
                )
              )}
            </div>
            <div className="timeline-content">
              <div className="timeline-date">
                {formatDate(primaryRecipe.createdAt)}
                {hasMultiple && (
                  <button
                    className="timeline-stack-toggle"
                    onClick={() => toggleExpand(dateKey)}
                    aria-label={isExpanded ? 'Stapel einklappen' : 'Stapel ausklappen'}
                  >
                    {isExpanded ? '▾' : '▸'} {dayRecipes.length} Rezepte
                  </button>
                )}
              </div>
              {hasMultiple && !isExpanded ? (
                // Stacked view – click anywhere on the stack to expand
                <div
                  className="timeline-stack"
                  onClick={() => toggleExpand(dateKey)}
                >
                  {dayRecipes.length > 2 && <div className="timeline-stack-bg timeline-stack-bg-2" />}
                  {dayRecipes.length > 1 && <div className="timeline-stack-bg timeline-stack-bg-1" />}
                  <div className="timeline-card timeline-stack-front">
                    {primaryRecipe.image && (
                      <div className="timeline-image">
                        <img src={primaryRecipe.image} alt={primaryRecipe.title} />
                      </div>
                    )}
                    <div className="timeline-info">
                      <h3 className="timeline-title">{primaryRecipe.title}</h3>
                      <div className="timeline-meta">
                        <span>{primaryRecipe.ingredients?.length || 0} Zutaten</span>
                        <span>{primaryRecipe.steps?.length || 0} Schritte</span>
                      </div>
                      {getAuthorName(primaryRecipe.authorId) && (
                        <div className="timeline-author">{getAuthorName(primaryRecipe.authorId)}</div>
                      )}
                    </div>
                  </div>
                  <div className="timeline-stack-badge">{dayRecipes.length}</div>
                </div>
              ) : (
                // Individual cards (single recipe or expanded stack)
                dayRecipes.map((recipe) => renderCard(recipe))
              )}
            </div>
          </div>
        );
      })}
      {sortedRecipes.length === 0 && (
        <div className="timeline-empty">
          <p>Keine Rezepte vorhanden</p>
        </div>
      )}
    </div>
  );
}

export default RecipeTimeline;
