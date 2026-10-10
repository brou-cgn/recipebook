import React from 'react';
import './StartseitenKarussell.css';
import './FuerDichEntdecktKachel.css';

const COLLAGE_MAX = 3;

const getRecipeImageUrl = (recipe) => (
  Array.isArray(recipe.images) && recipe.images.length > 0
    ? (recipe.images.find((img) => img.isDefault) || recipe.images[0])?.url || null
    : recipe.image || null
);

/**
 * FuerDichEntdecktKachel – Startseiten-Kachel "Für dich entdeckt".
 *
 * Einstieg in den Swipestapel der persönlichen Liste "Für dich entdeckt"
 * (siehe utils/fuerDichEntdeckt.js), ähnlich den Rückblicken der Fotos-App.
 * Die Beschreibung der Liste dient als Thementitel; solange die Liste leer ist,
 * zeigt die Kachel einen Hinweis und ist nicht antippbar.
 *
 * Props:
 *   list     {Object}   die Liste "Für dich entdeckt"
 *   recipes  {Array}    Rezepte der Liste
 *   onOpen   {Function} (listId) => void – öffnet den Swipestapel
 */
function FuerDichEntdecktKachel({ list, recipes = [], onOpen }) {
  if (!list) return null;

  const count = recipes.length;
  const collage = recipes.slice(0, COLLAGE_MAX).map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    imageUrl: getRecipeImageUrl(recipe),
  }));
  const themeTitle = (typeof list.description === 'string' && list.description.trim()) || 'Rezepte zu wechselnden Themen';
  const meta = count === 1 ? '1 Rezept' : `${count} Rezepte`;

  return (
    <section className="startseite-trending-section fuer-dich-entdeckt">
      <div className="startseite-section-header">
        <h2 className="startseite-section-title">{list.name}</h2>
      </div>
      {count === 0 ? (
        <div className="fuer-dich-entdeckt-card fuer-dich-entdeckt-card--empty">
          <p className="fuer-dich-entdeckt-empty-text">
            Hier tauchen bald Rezepte zu wechselnden Themen auf.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="fuer-dich-entdeckt-card"
          onClick={() => onOpen?.(list.id)}
          aria-label={`${themeTitle}, ${meta} – Swipestapel öffnen`}
        >
          <span className={`fuer-dich-entdeckt-collage fuer-dich-entdeckt-collage--${collage.length}`} aria-hidden="true">
            {collage.map((item) => (
              <span key={item.id} className="fuer-dich-entdeckt-collage-cell">
                {item.imageUrl && <img src={item.imageUrl} alt="" draggable="false" />}
              </span>
            ))}
          </span>
          <span className="fuer-dich-entdeckt-caption">
            <span className="fuer-dich-entdeckt-title">{themeTitle}</span>
            <span className="fuer-dich-entdeckt-meta">{meta}</span>
          </span>
        </button>
      )}
    </section>
  );
}

export default FuerDichEntdecktKachel;
