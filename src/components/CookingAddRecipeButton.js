import React, { useState } from 'react';
import { isBase64Image } from '../utils/imageUtils';
import { useTexte } from '../contexts/SpracheContext';
import kochmodusTexte from '../i18n/texte/kochmodus';
import './CookingAddRecipeButton.css';

/**
 * Knopf „Rezept dazunehmen“ in der Titelzeile des Kochmodus (Vorhaben „Parallel kochen“).
 * Formatierung und Animation wie die FAB-Buttons (.edit-fab-button, .kueche-fab-button):
 * runde Fläche mit Rand und Schatten, beim Drücken wächst er mit einer federnden Animation.
 * Der Druckzustand liegt hier und nicht in RecipeDetail (Tech-Check A1: kein weiterer State
 * in der Gottkomponente). Das Icon ist das einrichtbare Button-Icon `cookingAddRecipe`; wie
 * bei den FABs bleibt der Knopf unsichtbar, bis die Button-Icons geladen sind.
 */
function CookingAddRecipeButton({ icon, loaded = true, onClick }) {
  const t = useTexte(kochmodusTexte);
  const [pressed, setPressed] = useState(false);
  const press = () => setPressed(true);
  const release = () => setPressed(false);

  return (
    <button
      type="button"
      className={`cooking-mode-add-recipe${pressed ? ' pressed' : ''}`}
      style={{ visibility: loaded ? 'visible' : 'hidden' }}
      onClick={onClick}
      onTouchStart={press}
      onTouchEnd={release}
      onTouchCancel={release}
      onMouseDown={press}
      onMouseUp={release}
      onMouseLeave={release}
      aria-label={t('weiteresDazunehmen')}
      title={t('weiteresDazunehmen')}
    >
      <span className="cooking-mode-add-recipe-icon" aria-hidden="true">
        {isBase64Image(icon)
          ? <img src={icon} alt="" className="button-icon-image" draggable="false" />
          : icon}
      </span>
    </button>
  );
}

export default CookingAddRecipeButton;
