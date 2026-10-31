import React, { useEffect, useMemo, useState } from 'react';
import { getMenuRecipeIds } from '../utils/menuSections';
import { getRecentlyCookedRecipeIds } from '../utils/recipeCookDates';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import './CookingAddRecipeSheet.css';

/**
 * Bottom-Sheet „Was kochst du dazu?“ im Kochmodus (Vorhaben „Parallel kochen“, Entwurf V3):
 * Suche über die sichtbaren Rezepte und Vorschläge aus der Festtafel, aus der das Rezept
 * geöffnet wurde, aus den verknüpften Rezepten und aus dem, was der Nutzer zuletzt gekocht hat.
 * Die Wahl übergibt das Rezept an onSelect; parken und öffnen übernimmt die Kochsitzung.
 */

const MAX_RESULTS = 20;
// „Zuletzt gekocht“ zeigt höchstens so viele Rezepte
const MAX_RECENT = 5;

const normalize = (text) => (text || '').toLocaleLowerCase('de');

function RecipeRow({ recipe, onSelect }) {
  const thumbnail = getRecipeThumbnail(recipe);
  return (
    <li>
      <button
        type="button"
        className="add-recipe-sheet-row"
        onClick={() => onSelect(recipe)}
        aria-label={`${recipe.title} dazunehmen`}
      >
        {thumbnail ? (
          <img className="add-recipe-sheet-thumb" src={thumbnail} alt="" />
        ) : (
          <span className="add-recipe-sheet-thumb add-recipe-sheet-thumb--empty" aria-hidden="true" />
        )}
        <span className="add-recipe-sheet-title">{recipe.title}</span>
        <span className="add-recipe-sheet-plus" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
      </button>
    </li>
  );
}

function SuggestionSection({ title, recipes, onSelect }) {
  if (recipes.length === 0) return null;
  return (
    <section className="add-recipe-sheet-section" aria-label={title}>
      <h3 className="add-recipe-sheet-section-title">{title}</h3>
      <ul className="add-recipe-sheet-list">
        {recipes.map((recipe) => (
          <RecipeRow key={recipe.id} recipe={recipe} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}

function CookingAddRecipeSheet({
  currentRecipe,
  allRecipes = [],
  menu = null,
  linkedRecipes = [],
  excludedIds = [],
  userId = null,
  isFull = false,
  onSelect,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState([]);
  const trimmedQuery = query.trim();

  // Zuletzt gekocht: begrenzte Abfrage, erst wenn das Sheet offen ist
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    getRecentlyCookedRecipeIds(userId).then((ids) => {
      if (!cancelled) setRecentIds(ids);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Das Rezept vorn und alle schon in der Sitzung tauchen nicht als Vorschlag auf
  const excluded = useMemo(
    () => new Set([currentRecipe.id, ...excludedIds]),
    [currentRecipe.id, excludedIds]
  );

  const menuSuggestions = useMemo(
    () => getMenuRecipeIds(menu)
      .map((id) => allRecipes.find((r) => r.id === id))
      .filter((r) => r && !excluded.has(r.id)),
    [menu, allRecipes, excluded]
  );

  const linkedSuggestions = useMemo(
    () => linkedRecipes.filter((r) => !excluded.has(r.id) && !menuSuggestions.some((m) => m.id === r.id)),
    [linkedRecipes, excluded, menuSuggestions]
  );

  // Ohne Rezepte, die schon als Festtafel- oder verknüpfter Vorschlag dastehen
  const recentSuggestions = useMemo(() => {
    const shown = new Set([...menuSuggestions, ...linkedSuggestions].map((r) => r.id));
    return recentIds
      .map((id) => allRecipes.find((r) => r.id === id))
      .filter((r) => r && !excluded.has(r.id) && !shown.has(r.id))
      .slice(0, MAX_RECENT);
  }, [recentIds, allRecipes, excluded, menuSuggestions, linkedSuggestions]);

  const results = useMemo(() => {
    if (!trimmedQuery) return [];
    const q = normalize(trimmedQuery);
    return allRecipes
      .filter((r) => r && !excluded.has(r.id) && normalize(r.title).includes(q))
      .sort((a, b) =>
        (normalize(b.title).startsWith(q) - normalize(a.title).startsWith(q))
        || (a.title || '').localeCompare(b.title || '', 'de'))
      .slice(0, MAX_RESULTS);
  }, [trimmedQuery, allRecipes, excluded]);

  return (
    <div className="add-recipe-sheet-root">
      <button
        type="button"
        className="add-recipe-sheet-scrim"
        aria-label="Schließen"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="add-recipe-sheet" role="dialog" aria-modal="true" aria-labelledby="add-recipe-sheet-heading">
        <div className="add-recipe-sheet-grabber" aria-hidden="true" />
        <div className="add-recipe-sheet-header">
          <h2 className="add-recipe-sheet-heading" id="add-recipe-sheet-heading">Was kochst du dazu?</h2>
          <button type="button" className="add-recipe-sheet-close" onClick={onClose}>
            Abbrechen
          </button>
        </div>
        {isFull ? (
          <p className="add-recipe-sheet-hint">
            Es kochen schon vier Rezepte gleichzeitig. Beende eines im Kochmodus, bevor du ein weiteres dazunimmst.
          </p>
        ) : (
          <>
            <p className="add-recipe-sheet-subtitle">„{currentRecipe.title}“ läuft im Hintergrund weiter, samt Timer.</p>
            <label className="add-recipe-sheet-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rezept suchen"
                aria-label="Rezept suchen"
              />
            </label>
            <div className="add-recipe-sheet-body">
              {trimmedQuery ? (
                results.length > 0 ? (
                  <SuggestionSection title="Suchergebnisse" recipes={results} onSelect={onSelect} />
                ) : (
                  <p className="add-recipe-sheet-hint">Kein Rezept gefunden.</p>
                )
              ) : (
                <>
                  <SuggestionSection
                    title={menu?.name ? `Aus der Festtafel „${menu.name}“` : 'Aus der Festtafel'}
                    recipes={menuSuggestions}
                    onSelect={onSelect}
                  />
                  <SuggestionSection title="Verknüpfte Rezepte" recipes={linkedSuggestions} onSelect={onSelect} />
                  <SuggestionSection title="Zuletzt gekocht" recipes={recentSuggestions} onSelect={onSelect} />
                  {menuSuggestions.length === 0 && linkedSuggestions.length === 0 && recentSuggestions.length === 0 && (
                    <p className="add-recipe-sheet-hint">Such nach dem Rezept, das du dazunehmen willst.</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CookingAddRecipeSheet;
