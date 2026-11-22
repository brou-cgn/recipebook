import React, { useEffect, useMemo, useState } from 'react';
import { getMenuRecipeIds } from '../utils/menuSections';
import { getRecentlyCookedRecipeIds } from '../utils/recipeCookDates';
import { getRecipeThumbnail } from '../utils/recipeThumbnail';
import useModalScrollLock from '../hooks/useModalScrollLock';
import useFadeOutClose from '../hooks/useFadeOutClose';
import { useRezeptTitel, useTexte } from '../contexts/SpracheContext';
import kochmodusTexte from '../i18n/texte/kochmodus';
import allgemeinTexte from '../i18n/texte/allgemein';
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
  const t = useTexte(kochmodusTexte);
  const titel = useRezeptTitel()(recipe);
  const thumbnail = getRecipeThumbnail(recipe);
  return (
    <li>
      <button
        type="button"
        className="add-recipe-sheet-row"
        onClick={() => onSelect(recipe)}
        aria-label={t('dazunehmen', { titel })}
      >
        {thumbnail ? (
          <img className="add-recipe-sheet-thumb" src={thumbnail} alt="" />
        ) : (
          <span className="add-recipe-sheet-thumb add-recipe-sheet-thumb--empty" aria-hidden="true" />
        )}
        <span className="add-recipe-sheet-title">{titel}</span>
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
  onClose: onCloseProp,
}) {
  const t = useTexte(kochmodusTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  // Titel in der geltenden Sprache (Mehrsprachigkeit PR 6a); die Suche findet Original und Übersetzung
  const zeigeTitel = useRezeptTitel();
  // Wie die Einkaufsliste: Seite dahinter gesperrt, Overlay blendet aus
  useModalScrollLock();
  const [closing, onClose] = useFadeOutClose(onCloseProp);
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
    const passt = (r) => normalize(r.title).includes(q) || normalize(zeigeTitel(r)).includes(q);
    const beginnt = (r) => normalize(zeigeTitel(r)).startsWith(q) || normalize(r.title).startsWith(q);
    return allRecipes
      .filter((r) => r && !excluded.has(r.id) && passt(r))
      .sort((a, b) =>
        (beginnt(b) - beginnt(a))
        || (zeigeTitel(a) || '').localeCompare(zeigeTitel(b) || '', 'de'))
      .slice(0, MAX_RESULTS);
  }, [trimmedQuery, allRecipes, excluded, zeigeTitel]);

  return (
    <div className={`add-recipe-sheet-root${closing ? ' add-recipe-sheet-root--closing' : ''}`}>
      <button
        type="button"
        className="add-recipe-sheet-scrim"
        aria-label={tAllgemein('schliessen')}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="add-recipe-sheet" role="dialog" aria-modal="true" aria-labelledby="add-recipe-sheet-heading">
        <div className="add-recipe-sheet-grabber" aria-hidden="true" />
        <div className="add-recipe-sheet-header">
          <h2 className="add-recipe-sheet-heading" id="add-recipe-sheet-heading">{t('wasKochstDu')}</h2>
          <button type="button" className="add-recipe-sheet-close" onClick={onClose}>
            {tAllgemein('abbrechen')}
          </button>
        </div>
        {isFull ? (
          <p className="add-recipe-sheet-hint">{t('sitzungVoll')}</p>
        ) : (
          <>
            <p className="add-recipe-sheet-subtitle">{t('laeuftWeiter', { titel: zeigeTitel(currentRecipe) })}</p>
            <label className="add-recipe-sheet-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
              <input
                type="search"
                className="add-recipe-sheet-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('rezeptSuchen')}
                aria-label={t('rezeptSuchen')}
              />
            </label>
            <div className="add-recipe-sheet-body">
              {trimmedQuery ? (
                results.length > 0 ? (
                  <SuggestionSection title={t('suchergebnisse')} recipes={results} onSelect={onSelect} />
                ) : (
                  <p className="add-recipe-sheet-hint">{t('keinRezeptGefunden')}</p>
                )
              ) : (
                <>
                  <SuggestionSection
                    title={menu?.name ? t('ausFesttafelName', { name: menu.name }) : t('ausFesttafel')}
                    recipes={menuSuggestions}
                    onSelect={onSelect}
                  />
                  <SuggestionSection title={t('verknuepfteRezepte')} recipes={linkedSuggestions} onSelect={onSelect} />
                  <SuggestionSection title={t('zuletztGekocht')} recipes={recentSuggestions} onSelect={onSelect} />
                  {menuSuggestions.length === 0 && linkedSuggestions.length === 0 && recentSuggestions.length === 0 && (
                    <p className="add-recipe-sheet-hint">{t('suchHinweis')}</p>
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
