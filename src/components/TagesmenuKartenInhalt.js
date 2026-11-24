import React from 'react';
import { decodeRecipeLink } from '../utils/recipeLinks';
import useRezeptInhalt from '../hooks/useRezeptInhalt';

const itemText = (item) => (typeof item === 'string' ? item : item?.text);

/**
 * Zutaten und Zubereitung auf der Karte im Atelier. Zeigt sie in der geltenden Sprache, sobald
 * eine passende Übersetzung vorliegt (Mehrsprachigkeit, wie die Rezeptansicht), sonst das Original.
 * Ein eigener Baustein, weil der Hook je Karte laufen muss.
 */
export default function TagesmenuKartenInhalt({ recipe, recipes, t }) {
  const uebersetzung = useRezeptInhalt(recipe);
  const zutaten = uebersetzung ? uebersetzung.zutaten : recipe.ingredients;
  const schritte = uebersetzung ? uebersetzung.schritte : recipe.steps;

  return (
    <>
      {Array.isArray(zutaten) && zutaten.length > 0 && (
        <div className="tagesmenu-card-section">
          <h3 className="tagesmenu-card-section-title">{t('zutaten')}</h3>
          <ul className="tagesmenu-ingredients-list">
            {zutaten.map((item, i) => {
              if (typeof item === 'object' && item.type === 'heading') {
                return <li key={`h-${i}`} className="tagesmenu-ingredient-heading">{item.text}</li>;
              }
              const text = itemText(item);
              const recipeLink = decodeRecipeLink(text);
              if (recipeLink) {
                const linkedRecipe = recipes.find((r) => r.id === recipeLink.recipeId);
                const displayName = linkedRecipe ? linkedRecipe.title : recipeLink.recipeName;
                const displayText = recipeLink.quantityPrefix ? `${recipeLink.quantityPrefix} ${displayName}` : displayName;
                return <li key={`i-${i}`}>{displayText}</li>;
              }
              return <li key={`i-${i}`}>{text}</li>;
            })}
          </ul>
        </div>
      )}

      {Array.isArray(schritte) && schritte.length > 0 && (
        <div className="tagesmenu-card-section">
          <h3 className="tagesmenu-card-section-title">{t('zubereitung')}</h3>
          <ol className="tagesmenu-steps-list">
            {schritte.map((item, i) => {
              if (typeof item === 'object' && item.type === 'heading') {
                return <li key={`h-${i}`} className="tagesmenu-step-heading">{item.text}</li>;
              }
              return <li key={`s-${i}`}>{itemText(item)}</li>;
            })}
          </ol>
        </div>
      )}
    </>
  );
}
