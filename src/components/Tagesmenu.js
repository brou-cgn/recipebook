import React, { useState, useMemo } from 'react';
import './Tagesmenu.css';
import RecipeImageCarousel from './RecipeImageCarousel';

/**
 * Tagesmenü page – shows full-page recipe cards from interactive private lists.
 *
 * Behaviour:
 *  - If the user has multiple interactive lists, a tab bar lets them switch.
 *  - If the user has exactly one interactive list it is pre-selected without
 *    showing any tab bar.
 *  - Each recipe card occupies the full viewport height and snaps into place
 *    via CSS scroll-snap so the user can swipe / scroll through the dishes.
 *
 * @param {Object}   props
 * @param {Array}    props.interactiveLists  - Groups with listKind === 'interactive'
 * @param {Array}    props.recipes           - All recipes visible to the user
 * @param {Array}    props.allUsers          - All users (to resolve author names)
 * @param {Function} props.onSelectRecipe    - Called with a recipe when its card is tapped
 */
function Tagesmenu({ interactiveLists, recipes, allUsers, onSelectRecipe }) {
  const [selectedListId, setSelectedListId] = useState(
    interactiveLists.length > 0 ? interactiveLists[0].id : null
  );

  const selectedList = interactiveLists.find((l) => l.id === selectedListId) ?? null;

  const listRecipes = useMemo(() => {
    if (!selectedList) return [];
    const groupRecipeIds = Array.isArray(selectedList.recipeIds) ? selectedList.recipeIds : [];
    return recipes.filter(
      (r) => r.groupId === selectedList.id || groupRecipeIds.includes(r.id)
    );
  }, [recipes, selectedList]);

  const getAuthorName = (authorId) => {
    if (!authorId || !allUsers) return '';
    const user = allUsers.find((u) => u.id === authorId);
    return user ? user.vorname : '';
  };

  return (
    <div className="tagesmenu-container">
      {interactiveLists.length > 1 && (
        <div className="tagesmenu-list-selector">
          {interactiveLists.map((list) => (
            <button
              key={list.id}
              className={`tagesmenu-list-tab${list.id === selectedListId ? ' active' : ''}`}
              onClick={() => setSelectedListId(list.id)}
            >
              {list.name}
            </button>
          ))}
        </div>
      )}

      {listRecipes.length === 0 ? (
        <div className="tagesmenu-empty">
          <span className="tagesmenu-empty-icon">🍽️</span>
          <p>Diese Liste enthält noch keine Rezepte.</p>
        </div>
      ) : (
        <div className="tagesmenu-cards">
          {listRecipes.map((recipe) => {
            const allImages =
              Array.isArray(recipe.images) && recipe.images.length > 0
                ? recipe.images
                : recipe.image
                ? [{ url: recipe.image, isDefault: true }]
                : [];
            const orderedImages = [
              ...allImages.filter((img) => img.isDefault),
              ...allImages.filter((img) => !img.isDefault),
            ];
            const authorName = getAuthorName(recipe.authorId);

            return (
              <div
                key={recipe.id}
                className="tagesmenu-card"
                onClick={() => onSelectRecipe(recipe)}
              >
                {orderedImages.length > 0 ? (
                  <div
                    className="tagesmenu-card-image"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RecipeImageCarousel
                      images={orderedImages}
                      altText={recipe.title}
                      onImageClick={() => onSelectRecipe(recipe)}
                    />
                  </div>
                ) : (
                  <div className="tagesmenu-card-image tagesmenu-card-no-image">
                    <span>🍽️</span>
                  </div>
                )}
                <div className="tagesmenu-card-info">
                  <h2 className="tagesmenu-card-title">{recipe.title}</h2>
                  {authorName && (
                    <p className="tagesmenu-card-author">{authorName}</p>
                  )}
                  {recipe.kulinarik &&
                    (Array.isArray(recipe.kulinarik)
                      ? recipe.kulinarik.length > 0
                      : recipe.kulinarik.trim().length > 0) && (
                      <div className="tagesmenu-card-kulinarik">
                        {Array.isArray(recipe.kulinarik)
                          ? recipe.kulinarik.map((k, i) => (
                              <span key={i} className="tagesmenu-kulinarik-tag">
                                {k}
                              </span>
                            ))
                          : (
                              <span className="tagesmenu-kulinarik-tag">
                                {recipe.kulinarik}
                              </span>
                            )}
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Tagesmenu;
