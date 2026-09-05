import React, { useState, useEffect, useMemo, useRef } from 'react';
import './MenuForm.css';
import './EventsPage.css';
import { getUserFavorites } from '../utils/userFavorites';
import { getSavedSections, saveSectionNames, createMenuSection, applyItemOrder } from '../utils/menuSections';
import { fuzzyFilter } from '../utils/fuzzySearch';
import { fileToBase64, compressImage, selectMenuGridImages, buildMenuGridImage, convertImageUrlsToBase64, isBase64Image } from '../utils/imageUtils';
import { uploadMenuGridImage, uploadMenuGridImageDark, deleteMenuGridImage, deleteMenuGridImageDark, isStorageUrl } from '../utils/storageUtils';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getButtonIcons } from '../utils/customLists';
import { getCategoryImages } from '../utils/categoryImages';
import { getEvent, subscribeToEvent, subscribeToCustomDrinks, saveCustomDrink, calculateEventDrinks } from '../utils/eventsFirestore';
import { updateMenu } from '../utils/menuFirestore';
import { getGuestDisplayName, computeGuestPreferenceMultipliers } from '../utils/guestPreferences';
import { pushGuestIdsToLinkedEvent, resolveGuestLinkChoice } from '../utils/guestLinkSync';
import { mergePredefinedDrinks, getDrinkParentCategoryId, categoryHasOwnBudget } from '../utils/drinkCategories';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import { encodeRecipeLink, decodeRecipeLink } from '../utils/recipeLinks';
import SavingOverlay from './SavingOverlay';
import { sumRecipeIngredientAmountsInMl } from '../utils/ingredientUtils';
import EventForm from './EventForm';
import DrinkManagementPage from './DrinkManagementPage';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import GuestLinkConflictDialog from './GuestLinkConflictDialog';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const MOBILE_BREAKPOINT = 768;

const formatEventDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('de-DE');
  } catch {
    return dateStr;
  }
};

// A recipe is selectable in the menu's "Drinks" section only if it's tagged
// with the "Drinks" Speisekategorie.
const recipeHasDrinksCategory = (recipe) => {
  const categories = Array.isArray(recipe?.speisekategorie)
    ? recipe.speisekategorie
    : (recipe?.speisekategorie ? [recipe.speisekategorie] : []);
  return categories.some((cat) => typeof cat === 'string' && cat.trim().toLowerCase() === 'drinks');
};

// Builds the merged, freely-orderable list of items (recipes + event-linked
// drinks + manually added drinks) shown in a menu section's "Drinks" list, so
// both the section's render and the drag-end handler compute the exact same
// composite order. Recipes and drinks can be interleaved in any order; the
// persisted section.itemOrder is reconciled against the current items via
// applyItemOrder, falling back to "recipes, then event drinks, then manual
// drinks" for sections that don't have a saved order yet.
const getDrinksSectionItems = (section, recipes, eventDrinksForSection, getDrinkDisplayName) => {
  const renderableRecipeIds = (section.recipeIds || []).filter((recipeId) => recipes.some((r) => r.id === recipeId));
  const dedupedEventDrinks = eventDrinksForSection.filter((drink) => !drink.recipeId || !section.recipeIds.includes(drink.recipeId));
  const eventDrinkIds = dedupedEventDrinks.map((drink) => drink.id);
  const manualDrinkIds = (section.drinkIds || []).filter((drinkId) => !eventDrinkIds.includes(drinkId));
  const baseItems = [
    ...renderableRecipeIds.map((recipeId) => ({
      compositeId: `recipe:${recipeId}`,
      type: 'recipe',
      id: recipeId,
      displayName: recipes.find((r) => r.id === recipeId)?.title || recipeId,
    })),
    ...dedupedEventDrinks.map((drink) => ({ compositeId: `event:${drink.id}`, type: 'event', id: drink.id, displayName: drink.displayName })),
    ...manualDrinkIds.map((drinkId) => ({ compositeId: `manual:${drinkId}`, type: 'manual', id: drinkId, displayName: getDrinkDisplayName(drinkId) })),
  ];
  const items = applyItemOrder(section.itemOrder, baseItems, (item) => item.compositeId);
  return { renderableRecipeIds, dedupedEventDrinks, manualDrinkIds, items };
};

// Sortable Section Component for drag & drop reordering of menu sections
function SortableSection({
  id, section, sectionIndex, recipes, favoriteIds, searchQueries, closeIcon,
  onRemoveSection, onDragEndRecipes, onRemoveRecipeFromSection,
  onSearchChange, onAddRecipeToSection, getFilteredRecipes,
  isDrinksSection, drinkSearchQueries, onDrinkSearchChange, onAddDrinkToSection,
  onAddRecipeToDrinksSection, onRemoveDrinkFromSection, getFilteredDrinkSectionOptions,
  getDrinkDisplayName, eventDrinks = [], onRemoveEventDrink, onDragEndDrinks,
  showOwnDrinksOnly, onToggleShowOwnDrinksOnly, swipeDeleteIcon,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  // Own sensor instances for this section's recipe-reordering DndContext.
  // Sharing sensor instances with the outer, section-reordering DndContext
  // (an ancestor of this component) makes dnd-kit's two nested contexts
  // fight over the same PointerSensor/TouchSensor activation state, which
  // is what caused a section's own drag handle to render displaced with a
  // stray transform even at rest.
  const recipeSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // De-duplicate the event's planned drinks against recipes already listed
  // in this section (a drink recipe carried over into the event's
  // customDrinkIds links back to the same recipe) and against manually
  // added drinks, so the same drink never shows up twice in the merged list
  // below.
  const { dedupedEventDrinks, manualDrinkIds, items: drinkSectionItems } = getDrinksSectionItems(section, recipes, eventDrinks, getDrinkDisplayName);
  const hasSelectedRecipesOrDrinks = section.recipeIds.length > 0 || dedupedEventDrinks.length > 0 || manualDrinkIds.length > 0;

  // section.recipeIds can contain ids of recipes that no longer resolve (e.g.
  // deleted or no longer visible to this user); those are skipped below and
  // render nothing. SortableContext's `items` must match the actually
  // rendered nodes exactly, or dnd-kit's items.indexOf(id) lookups go out of
  // sync with real DOM order and every handle after the gap gets a wrong,
  // displaced transform even at rest.
  const renderableRecipeIds = section.recipeIds.filter(recipeId => recipes.some(r => r.id === recipeId));

  const selectedRecipesList = renderableRecipeIds.length > 0 && (
    <DndContext
      sensors={recipeSensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => onDragEndRecipes(sectionIndex, event)}
    >
      <SortableContext
        items={renderableRecipeIds}
        strategy={verticalListSortingStrategy}
      >
        {renderableRecipeIds.map(recipeId => {
          const recipe = recipes.find(r => r.id === recipeId);
          const isFavorite = favoriteIds.includes(recipe.id);
          return (
            <SortableRecipeItem
              key={recipe.id}
              id={recipe.id}
              recipe={recipe}
              isFavorite={isFavorite}
              sectionIndex={sectionIndex}
              onRemove={onRemoveRecipeFromSection}
              swipeDeleteIcon={swipeDeleteIcon}
            />
          );
        })}
      </SortableContext>
    </DndContext>
  );

  return (
    <div ref={setNodeRef} style={style} className={`section-block${isDragging ? ' dragging' : ''}`}>
      <div className="section-header">
        <button
          type="button"
          className="drag-handle section-drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Abschnitt verschieben"
        >
          ⋮⋮
        </button>
        <h4>{section.name}</h4>
        <div className="section-actions">
          <button
            type="button"
            className="app-close-button remove-section-button"
            onClick={() => onRemoveSection(sectionIndex)}
            title="Abschnitt löschen"
          >
            {isBase64Image(closeIcon) ? (
              <img src={closeIcon} alt="Löschen" className="button-icon-image" draggable="false" />
            ) : (
              closeIcon
            )}
          </button>
        </div>
      </div>
      <div className="recipe-selection">
        {isDrinksSection ? (
          hasSelectedRecipesOrDrinks && (
            <div className="selected-recipes">
              <h5>Ausgewählte Rezepte & Getränke:</h5>
              {drinkSectionItems.length > 0 && (
                <DndContext
                  sensors={recipeSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => onDragEndDrinks(sectionIndex, event)}
                >
                  <SortableContext
                    items={drinkSectionItems.map((item) => item.compositeId)}
                    strategy={verticalListSortingStrategy}
                  >
                    {drinkSectionItems.map((item) => (
                      <SortableDrinkItem
                        key={item.compositeId}
                        id={item.compositeId}
                        displayName={item.displayName}
                        isFavorite={item.type === 'recipe' && favoriteIds.includes(item.id)}
                        onRemove={() => {
                          if (item.type === 'recipe') onRemoveRecipeFromSection(sectionIndex, item.id, item.displayName);
                          else if (item.type === 'event') onRemoveEventDrink(item.id, item.displayName);
                          else onRemoveDrinkFromSection(sectionIndex, item.id, item.displayName);
                        }}
                        swipeDeleteIcon={swipeDeleteIcon}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )
        ) : (
          section.recipeIds.length > 0 && (
            <div className="selected-recipes">
              <h5>Ausgewählte Rezepte:</h5>
              {selectedRecipesList}
            </div>
          )
        )}

        {!isDrinksSection && (
          <div className="typeahead-container">
            <input
              type="text"
              className="typeahead-input"
              placeholder="Rezept suchen und hinzufügen..."
              value={searchQueries[sectionIndex] || ''}
              onChange={(e) => onSearchChange(sectionIndex, e.target.value)}
            />

            {searchQueries[sectionIndex] && searchQueries[sectionIndex].trim() && (
              <div className="typeahead-dropdown">
                {(() => {
                  const filteredRecipes = getFilteredRecipes(sectionIndex);
                  if (filteredRecipes.length === 0) {
                    return <div className="typeahead-no-results">Keine Rezepte gefunden</div>;
                  }
                  return filteredRecipes.slice(0, 10).map(recipe => {
                    const isFavorite = favoriteIds.includes(recipe.id);
                    return (
                      <div
                        key={recipe.id}
                        className="typeahead-item"
                        onClick={() => onAddRecipeToSection(sectionIndex, recipe.id)}
                      >
                        <span className="recipe-name">
                          {recipe.title}
                        </span>
                        {isFavorite && <span className="favorite-indicator">★</span>}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}
      </div>
      {isDrinksSection && (
        <div className="recipe-selection drink-selection">
          <div className="typeahead-container">
            <input
              type="text"
              className="typeahead-input"
              placeholder="Rezept oder Getränk suchen und hinzufügen..."
              value={drinkSearchQueries[sectionIndex] || ''}
              onChange={(e) => onDrinkSearchChange(sectionIndex, e.target.value)}
            />

            {drinkSearchQueries[sectionIndex] && drinkSearchQueries[sectionIndex].trim() && (
              <div className="typeahead-dropdown">
                {(() => {
                  const filteredOptions = getFilteredDrinkSectionOptions(sectionIndex);
                  if (filteredOptions.length === 0) {
                    return <div className="typeahead-no-results">Keine Rezepte oder Getränke gefunden</div>;
                  }
                  return filteredOptions.slice(0, 10).map(option => {
                    if (option.type === 'recipe') {
                      const isFavorite = favoriteIds.includes(option.recipe.id);
                      return (
                        <div
                          key={`recipe-${option.id}`}
                          className="typeahead-item"
                          onClick={() => onAddRecipeToDrinksSection(sectionIndex, option.id)}
                        >
                          <span className="recipe-name">{option.recipe.title}</span>
                          {isFavorite && <span className="favorite-indicator">★</span>}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`drink-${option.id}`}
                        className="typeahead-item"
                        onClick={() => onAddDrinkToSection(sectionIndex, option.id)}
                      >
                        <span className="recipe-name">{getDrinkDisplayName(option.id)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
          <div className="drink-own-filter-row">
            <label className="drink-own-filter-label">
              <span>Eigene Getränke</span>
              <span className="drink-own-filter-toggle drink-own-filter-toggle--brown">
                <input
                  type="checkbox"
                  checked={showOwnDrinksOnly}
                  onChange={(e) => onToggleShowOwnDrinksOnly(e.target.checked)}
                  aria-label="Nur eigene Getränke in der Suche anzeigen"
                />
                <span className="drink-own-filter-toggle-slider" aria-hidden="true" />
              </span>
            </label>
          </div>
        </div>
      )}
      <div className="section-summary">
        {section.recipeIds.length} Rezept{section.recipeIds.length !== 1 ? 'e' : ''}
        {isDrinksSection && (dedupedEventDrinks.length + manualDrinkIds.length) > 0
          ? `, ${dedupedEventDrinks.length + manualDrinkIds.length} Getränk${(dedupedEventDrinks.length + manualDrinkIds.length) !== 1 ? 'e' : ''}`
          : ''}
      </div>
    </div>
  );
}

// Sortable Recipe Item Component for menu sections
function SortableRecipeItem({ id, recipe, isFavorite, onRemove, sectionIndex, swipeDeleteIcon }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const swipeContentStyle = {
    transform: `translateX(${offset}px)`,
    transition: isDragging ? transition : 'transform 0.15s ease',
  };

  const handleSwipeDeleteClick = () => {
    onRemove(sectionIndex, recipe.id, recipe.title);
    reset();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`selected-recipe-item ${isDragging ? 'dragging' : ''}${offset < 0 ? ' swipe-delete-active' : ''}`}
    >
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible}>
        {(isDeleteVisible || offset < 0) && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${recipe.title} entfernen`}
          >
            {isBase64Image(swipeDeleteIcon) ? (
              <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
            ) : (
              <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
            )}
          </button>
        )}
      </div>
      <div className="selected-recipe-item-content delete-row-hover-target" style={swipeContentStyle}>
        <button
          type="button"
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Rezept verschieben"
        >
          ⋮⋮
        </button>
        <span className="recipe-name" {...handlers}>
          {recipe.title}
          {isFavorite && <span className="favorite-indicator">★</span>}
        </span>
        <DeleteRowButton
          itemName={recipe.title}
          className="selected-recipe-item-delete-btn"
          onClick={() => onRemove(sectionIndex, recipe.id, recipe.title)}
        />
      </div>
    </div>
  );
}

// Sortable item for the menu's "Drinks" section, which mixes drink recipes,
// event-linked drinks, and manually added drinks in a single freely
// reorderable list (see getDrinksSectionItems).
function SortableDrinkItem({ id, displayName, isFavorite, onRemove, swipeDeleteIcon }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const swipeContentStyle = {
    transform: `translateX(${offset}px)`,
    transition: isDragging ? transition : 'transform 0.15s ease',
  };

  const handleSwipeDeleteClick = () => {
    onRemove();
    reset();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`selected-recipe-item ${isDragging ? 'dragging' : ''}${offset < 0 ? ' swipe-delete-active' : ''}`}
    >
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible}>
        {(isDeleteVisible || offset < 0) && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${displayName} entfernen`}
          >
            {isBase64Image(swipeDeleteIcon) ? (
              <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
            ) : (
              <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
            )}
          </button>
        )}
      </div>
      <div className="selected-recipe-item-content delete-row-hover-target" style={swipeContentStyle}>
        <button
          type="button"
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Eintrag verschieben"
        >
          ⋮⋮
        </button>
        <span className="recipe-name" {...handlers}>
          {displayName}
          {isFavorite && <span className="favorite-indicator">★</span>}
        </span>
        <DeleteRowButton
          itemName={displayName}
          className="selected-recipe-item-delete-btn"
          onClick={onRemove}
        />
      </div>
    </div>
  );
}

function MenuForm({ menu, recipes, onSave, onCancel, currentUser, events: userEvents = [], guestProfiles = [], allGuestProfiles = [], allGuestProfilesLoaded = false, customDrinks: sharedCustomDrinks = [], customDrinksLoaded }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [menuDate, setMenuDate] = useState('');
  const [sections, setSections] = useState([]);
  const [availableSections, setAvailableSections] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [showSectionInput, setShowSectionInput] = useState(false);
  const [searchQueries, setSearchQueries] = useState({});
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [menuImage, setMenuImage] = useState('');
  const [uploadingMenuImage, setUploadingMenuImage] = useState(false);
  const [savingMenu, setSavingMenu] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const formRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [addSectionIcon, setAddSectionIcon] = useState('+');
  const [addSectionFabPressedIndex, setAddSectionFabPressedIndex] = useState(null);
  const [insertSectionAtIndex, setInsertSectionAtIndex] = useState(null);
  const [eventId, setEventId] = useState(null);
  const [eventOwnerId, setEventOwnerId] = useState(null);
  const [formSubView, setFormSubView] = useState('main'); // main | linkPicker | newEvent | manageDrinks
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [linkedEventLoading, setLinkedEventLoading] = useState(false);
  const [linkedEventCustomDrinks, setLinkedEventCustomDrinks] = useState([]);
  // Drinks the user removed from the linked event via this menu's "Drinks"
  // section, staged locally until the menu is saved (see handleSubmit).
  const [removedEventDrinkIds, setRemovedEventDrinkIds] = useState([]);
  const { notifyDeleted, undo, pendingName } = useUndoableDelete();
  // Drag-and-drop reordering of event-linked drinks, staged locally until the
  // menu is saved (see handleSubmit, which writes it back into the linked
  // event's customDrinkIds order).
  const [eventDrinkOrder, setEventDrinkOrder] = useState([]);
  // The current user's own events (for the "Bestehende Kalkulation verknüpfen"
  // picker) and drinks library are already subscribed once at App level.
  const availableEvents = userEvents;
  const userCustomDrinks = sharedCustomDrinks;
  const [drinkSearchQueries, setDrinkSearchQueries] = useState({});
  const [showOwnDrinksOnly, setShowOwnDrinksOnly] = useState(true);
  const [newEventDrinkIds, setNewEventDrinkIds] = useState([]);
  const [preparingNewEvent, setPreparingNewEvent] = useState(false);
  // Guests from the Event module that can be tagged as pills in the
  // description field (see the "menuDescription" form-group below); also
  // subscribed once at App level. Menus (unlike guest profiles) are shared
  // across all editors, so a menu's descriptionGuestIds may reference guest
  // profiles owned by a different user. Admins can read every user's guest
  // profiles (see GuestManagementPage), so fall back to allGuestProfiles for
  // them instead of just the current user's own guestProfiles.
  const guests = (currentUser?.isAdmin && allGuestProfilesLoaded) ? allGuestProfiles : guestProfiles;
  const [descriptionGuestIds, setDescriptionGuestIds] = useState([]);
  const [guestSearchQuery, setGuestSearchQuery] = useState('');
  // Set while linking to an existing event whose guest list conflicts with
  // this menu's own (both non-empty) - see handleLinkEvent/applyGuestLinkChoice.
  const [guestLinkConflict, setGuestLinkConflict] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load favorite IDs when user changes
  useEffect(() => {
    const loadFavorites = async () => {
      if (currentUser?.id) {
        const favorites = await getUserFavorites(currentUser.id);
        setFavoriteIds(favorites);
      } else {
        setFavoriteIds([]);
      }
    };
    loadFavorites();
  }, [currentUser?.id]);

  // Load button icons
  useEffect(() => {
    const loadIcons = async () => {
      const icons = await getButtonIcons();
      setButtonIcons(icons);
      setAddSectionIcon(getEffectiveIcon(icons, 'addSection', isDarkMode) || '+');
    };
    loadIcons();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-compute addSection icon when button icons or dark mode changes
  useEffect(() => {
    setAddSectionIcon(getEffectiveIcon(buttonIcons, 'addSection', isDarkMode) || '+');
  }, [buttonIcons, isDarkMode]);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  // Track mobile breakpoint
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live-track the name and drinks of the currently linked event, so any
  // change made on the event side (add/remove drink, recalculation) shows up
  // here immediately without having to reopen the menu.
  useEffect(() => {
    if (!eventId || !eventOwnerId) {
      setLinkedEvent(null);
      setLinkedEventCustomDrinks([]);
      return undefined;
    }
    setLinkedEventLoading(true);
    let firstEventSnapshot = true;
    let firstDrinksSnapshot = true;
    const unsubEvent = subscribeToEvent(eventOwnerId, eventId, (event) => {
      setLinkedEvent(event);
      if (firstEventSnapshot) {
        firstEventSnapshot = false;
        if (!firstDrinksSnapshot) setLinkedEventLoading(false);
      }
    });
    const unsubDrinks = subscribeToCustomDrinks(eventOwnerId, (drinks) => {
      setLinkedEventCustomDrinks(drinks);
      if (firstDrinksSnapshot) {
        firstDrinksSnapshot = false;
        if (!firstEventSnapshot) setLinkedEventLoading(false);
      }
    });
    return () => {
      unsubEvent();
      unsubDrinks();
    };
  }, [eventId, eventOwnerId]);

  // Discard any pending "remove drink from event" staging / reordering when
  // switching to a different (or no) linked event.
  useEffect(() => {
    setRemovedEventDrinkIds([]);
    setEventDrinkOrder([]);
  }, [eventId]);

  // Drinks assigned via the linked event, shown alongside the manually added
  // ones in the menu's "Drinks" section - draggable just like those, see
  // handleDragEndDrinks.
  const eventDrinks = useMemo(() => {
    if (!linkedEvent) return [];
    const allDrinks = mergePredefinedDrinks(linkedEventCustomDrinks);
    const ids = Array.isArray(linkedEvent.customDrinkIds) ? linkedEvent.customDrinkIds : [];
    return ids.map((drinkId) => {
      const drink = allDrinks.find((d) => d.id === drinkId);
      const resolved = resolveDrinkDisplay(drink || drinkId, recipes);
      return { id: drinkId, displayName: resolved.displayName || drinkId, recipeId: resolved.recipeId };
    });
  }, [linkedEvent, linkedEventCustomDrinks, recipes]);

  // Event drinks actually shown/saved: staged removals filtered out, staged
  // reordering (from dragging) applied on top.
  const visibleEventDrinks = useMemo(
    () => eventDrinks.filter((drink) => !removedEventDrinkIds.includes(drink.id)),
    [eventDrinks, removedEventDrinkIds]
  );
  const orderedEventDrinks = useMemo(
    () => applyItemOrder(eventDrinkOrder, visibleEventDrinks, (drink) => drink.id),
    [eventDrinkOrder, visibleEventDrinks]
  );

  // Ensure a "Drinks" section exists once an event is linked, so the event's
  // planned drinks have somewhere to display within "Abschnitte & Rezepte".
  useEffect(() => {
    if (!eventId) return;
    setSections((prevSections) => {
      const hasDrinksSection = prevSections.some((s) => s.name?.toLowerCase() === 'drinks');
      if (hasDrinksSection) return prevSections;
      return [...prevSections, createMenuSection('Drinks', [])];
    });
  }, [eventId]);

  const allDrinks = useMemo(
    () => mergePredefinedDrinks(userCustomDrinks, currentUser?.id),
    [userCustomDrinks, currentUser?.id]
  );

  const getDrinkDisplayName = (drinkId) => {
    const drink = allDrinks.find((d) => d.id === drinkId);
    return resolveDrinkDisplay(drink || drinkId, recipes).displayName || drinkId;
  };

  const handleDrinkSearchChange = (sectionIndex, query) => {
    setDrinkSearchQueries({
      ...drinkSearchQueries,
      [sectionIndex]: query
    });
  };

  const handleAddDrinkToSection = (sectionIndex, drinkId) => {
    setSections((prevSections) => prevSections.map((s, i) => {
      if (i !== sectionIndex) return s;
      const existingDrinkIds = s.drinkIds || [];
      if (existingDrinkIds.includes(drinkId)) return s;
      return { ...s, drinkIds: [...existingDrinkIds, drinkId] };
    }));
    setDrinkSearchQueries({
      ...drinkSearchQueries,
      [sectionIndex]: ''
    });
    // Re-adding a drink that was staged for removal from the event cancels
    // that removal.
    setRemovedEventDrinkIds((prev) => prev.filter((id) => id !== drinkId));
  };

  const handleRemoveDrinkFromSection = (sectionIndex, drinkId, displayName) => {
    const index = (sections[sectionIndex]?.drinkIds || []).indexOf(drinkId);
    setSections((prevSections) => prevSections.map((s, i) => {
      if (i !== sectionIndex) return s;
      return { ...s, drinkIds: (s.drinkIds || []).filter((id) => id !== drinkId) };
    }));
    notifyDeleted({
      id: `drink:${sectionIndex}:${drinkId}`,
      name: displayName || drinkId,
      undo: () => {
        setSections((prev) => prev.map((s, i) => {
          if (i !== sectionIndex) return s;
          const ids = s.drinkIds || [];
          if (ids.includes(drinkId)) return s;
          const next = [...ids];
          next.splice(Math.min(index, next.length), 0, drinkId);
          return { ...s, drinkIds: next };
        }));
      },
    });
  };

  // Stages the removal of one of the linked event's drinks; it's actually
  // removed from the event (and the event's Getränkeverteilung recalculated)
  // once the menu is saved, see handleSubmit.
  const handleRemoveEventDrink = (drinkId, displayName) => {
    setRemovedEventDrinkIds((prev) => (prev.includes(drinkId) ? prev : [...prev, drinkId]));
    // The same drink can also sit in a section's own drinkIds (manualDrinkIds
    // is deduped by id against the event drinks, so only the merged
    // event-drink entry was visible). Leaving it there would make it
    // resurface as its own manual entry - with its own "x" - as soon as this
    // one is filtered out, needing a second click to actually remove it, and
    // would re-add it to the event's customDrinkIds on save via
    // drinksSectionManualDrinkIds. Strip it from every section too.
    setSections((prevSections) => prevSections.map((s) => (
      (s.drinkIds || []).includes(drinkId)
        ? { ...s, drinkIds: s.drinkIds.filter((id) => id !== drinkId) }
        : s
    )));
    notifyDeleted({
      id: `event:${drinkId}`,
      name: displayName || drinkId,
      undo: () => setRemovedEventDrinkIds((prev) => prev.filter((id) => id !== drinkId)),
    });
  };

  // Merged search results for the Drinks section's single search field:
  // recipes tagged with the "Drinks" Speisekategorie, plus drinks from the
  // event area (custom + predefined), ranked together by match quality.
  const getFilteredDrinkSectionOptions = (sectionIndex) => {
    const query = drinkSearchQueries[sectionIndex] || '';
    const section = sections[sectionIndex];
    const selectedRecipeIds = section?.recipeIds || [];
    const selectedDrinkIds = section?.drinkIds || [];

    const recipeOptions = recipes
      .filter(recipeHasDrinksCategory)
      .filter((recipe) => !selectedRecipeIds.includes(recipe.id))
      .map((recipe) => ({ type: 'recipe', id: recipe.id, recipe, searchLabel: recipe.title }));

    const drinkOptions = allDrinks
      .filter((drink) => !selectedDrinkIds.includes(drink.id))
      // Drinks linked to a recipe (via "#recipe:id:name") are already
      // offered as their underlying recipe in recipeOptions above - listing
      // both would show the same name twice.
      .filter((drink) => !decodeRecipeLink(drink.name))
      .filter((drink) => !showOwnDrinksOnly || !drink.ownerId || drink.ownerId === currentUser?.id)
      .map((drink) => ({ type: 'drink', id: drink.id, drink, searchLabel: resolveDrinkDisplay(drink, recipes).displayName }));

    const combinedOptions = [...recipeOptions, ...drinkOptions];

    if (!query.trim()) {
      return combinedOptions;
    }

    return fuzzyFilter(combinedOptions, query, (option) => option.searchLabel);
  };

  // Manually added drinks in the "Drinks" section. Used both to pre-fill a
  // newly created event's drink selection and, on every save, to sync this
  // menu's drinks into an already-linked event (see handleSubmit).
  const drinksSectionManualDrinkIds = useMemo(() => {
    const ids = [];
    sections.forEach((s) => {
      if (s.name?.toLowerCase() === 'drinks') {
        (s.drinkIds || []).forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
      }
    });
    return ids;
  }, [sections]);

  // Drink recipes (recipes tagged with the "Drinks" Speisekategorie) added to
  // the "Drinks" section. Used to pre-fill a newly created event's drink
  // selection alongside the manually added drinks above, and (via
  // ensureDrinkForRecipe) synced into an already-linked event on every save.
  const drinksSectionRecipeIds = useMemo(() => {
    const ids = [];
    sections.forEach((s) => {
      if (s.name?.toLowerCase() === 'drinks') {
        (s.recipeIds || []).forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
      }
    });
    return ids;
  }, [sections]);

  // Find (or, if none exists yet, create) the custom drink linked via
  // "#recipe:id:name" to the given recipe, so drink recipes selected in the
  // menu's Drinks section can be carried over when creating a new event.
  const ensureDrinkForRecipe = async (recipeId) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return null;
    const existing = userCustomDrinks.find((drink) => decodeRecipeLink(drink.name)?.recipeId === recipeId);
    if (existing) return existing.id;
    // Getränke aus einem Rezept: Kategorie immer Longdrinks, Einheitsgröße als
    // Summe der Zutatenmengen (in l) geteilt durch die Rezeptportionen,
    // Einheit immer "Drink".
    const totalMl = sumRecipeIngredientAmountsInMl(recipe.ingredients);
    const portionen = recipe.portionen || 4;
    return saveCustomDrink(currentUser.id, {
      name: encodeRecipeLink(recipe.id, recipe.title),
      kategorie: 'longdrinks',
      einheiten: [{ einheitsgroesse: totalMl > 0 ? totalMl / 1000 / portionen : 0.5, einheit: 'Drink' }],
    });
  };

  // Opens the "new event" form, first making sure every drink recipe in the
  // menu's Drinks section has a matching custom drink so it's pre-selected
  // alongside the manually added drinks instead of being left out.
  const handleStartNewEvent = async () => {
    setPreparingNewEvent(true);
    try {
      const recipeDrinkIds = await Promise.all(drinksSectionRecipeIds.map(ensureDrinkForRecipe));
      const combinedIds = [...drinksSectionManualDrinkIds];
      recipeDrinkIds.forEach((id) => {
        if (id && !combinedIds.includes(id)) combinedIds.push(id);
      });

      // Unless the menu already has it, the predefined Mineralwasser drink is
      // added here to both the new event and this menu's own "Drinks" section.
      if (!combinedIds.includes('predefined_mineralwasser')) {
        combinedIds.push('predefined_mineralwasser');
        setSections((prevSections) => {
          const drinksSectionIndex = prevSections.findIndex((s) => s.name?.toLowerCase() === 'drinks');
          if (drinksSectionIndex === -1) {
            return [...prevSections, createMenuSection('Drinks', [], ['predefined_mineralwasser'])];
          }
          return prevSections.map((s, i) => (
            i === drinksSectionIndex
              ? { ...s, drinkIds: [...(s.drinkIds || []), 'predefined_mineralwasser'] }
              : s
          ));
        });
      }

      setNewEventDrinkIds(combinedIds);
      setFormSubView('newEvent');
    } finally {
      setPreparingNewEvent(false);
    }
  };

  // Immediately mirrors a guest-pill add/remove into the linked event, so the
  // two lists never depend on the menu's own "Speichern" being clicked
  // afterwards (mirrors how the pill itself disappears/appears immediately).
  // `targetEventId`/`targetOwnerId`/`eventDoc` are passed explicitly rather
  // than read from `eventId`/`eventOwnerId`/`linkedEvent` state, since right
  // after linking a new event those haven't propagated/loaded yet.
  const pushGuestsToEvent = (targetEventId, targetOwnerId, nextGuestIds, eventDoc) => {
    if (!targetEventId || !targetOwnerId) return;
    pushGuestIdsToLinkedEvent({
      ownerId: targetOwnerId,
      eventId: targetEventId,
      guestIds: nextGuestIds,
      guests,
      customDrinks: linkedEventCustomDrinks,
      eventDoc,
    });
  };

  // Persists the menu <-> event link on the menu document itself right away,
  // instead of waiting for this menu's own "Speichern": the event->menu
  // guest sync (EventForm's pushGuestsToLinkedMenus) looks up linked menus
  // by querying menus whose eventId/eventOwnerId are already saved in
  // Firestore, so without this it silently finds nothing until the menu
  // happens to be saved once after linking.
  const persistEventLink = (nextEventId, nextEventOwnerId) => {
    if (!menu?.id) return;
    updateMenu(menu.id, { eventId: nextEventId, eventOwnerId: nextEventOwnerId }).catch((err) => {
      console.error('[MenuForm] Fehler beim Speichern der Event-Verknüpfung:', err);
    });
  };

  const completeLinkEvent = (id, finalMenuGuestIds, eventPushGuestIds, targetEvent) => {
    setEventId(id);
    setEventOwnerId(currentUser.id);
    setDescriptionGuestIds(finalMenuGuestIds);
    setFormSubView('main');
    persistEventLink(id, currentUser.id);
    if (eventPushGuestIds) {
      pushGuestsToEvent(id, currentUser.id, eventPushGuestIds, targetEvent);
    }
  };

  // Linking to an existing event: if only one side already has guests, that
  // list simply wins on both sides. If BOTH sides already have guests, ask
  // the user which list to keep (see GuestLinkConflictDialog / applyGuestLinkChoice).
  const handleLinkEvent = (id) => {
    const targetEvent = availableEvents.find((event) => event.id === id);
    const eventGuestIds = Array.isArray(targetEvent?.selectedGuestIds) ? targetEvent.selectedGuestIds : [];
    const menuGuestIds = descriptionGuestIds;

    if (eventGuestIds.length > 0 && menuGuestIds.length > 0) {
      setGuestLinkConflict({ eventId: id, targetEvent, eventGuestIds, menuGuestIds });
      return;
    }
    if (eventGuestIds.length > 0) {
      // Only the event has guests - adopt them onto the menu.
      completeLinkEvent(id, eventGuestIds, null, targetEvent);
    } else if (menuGuestIds.length > 0) {
      // Only the menu has guests - push them onto the event.
      completeLinkEvent(id, menuGuestIds, menuGuestIds, targetEvent);
    } else {
      completeLinkEvent(id, [], null, targetEvent);
    }
  };

  const applyGuestLinkChoice = (choice) => {
    if (!guestLinkConflict) return;
    const { eventId: targetEventId, targetEvent, eventGuestIds, menuGuestIds } = guestLinkConflict;
    const resolved = resolveGuestLinkChoice(choice, eventGuestIds, menuGuestIds);
    // 'event' keeps the event's list as-is, so nothing needs pushing back to it.
    const eventPushGuestIds = choice === 'event' ? null : resolved.eventGuestIds;
    completeLinkEvent(targetEventId, resolved.menuGuestIds, eventPushGuestIds, targetEvent);
    setGuestLinkConflict(null);
  };

  const handleUnlinkEvent = () => {
    setEventId(null);
    setEventOwnerId(null);
    persistEventLink(null, null);
  };

  useEffect(() => {
    // Load available section names
    setAvailableSections(getSavedSections());

    if (menu) {
      setName(menu.name || '');
      setDescription(menu.description || '');
      setDescriptionGuestIds(menu.descriptionGuestIds || []);
      setMenuImage(menu.image || '');
      setEventId(menu.eventId || null);
      setEventOwnerId(menu.eventOwnerId || null);
      // Initialize menuDate: use existing menuDate, or fall back to createdAt, or today
      if (menu.menuDate) {
        setMenuDate(menu.menuDate);
      } else if (menu.createdAt) {
        let date;
        if (menu.createdAt?.toDate) {
          date = menu.createdAt.toDate();
        } else if (typeof menu.createdAt === 'string') {
          date = new Date(menu.createdAt);
        } else if (menu.createdAt instanceof Date) {
          date = menu.createdAt;
        }
        if (date) {
          setMenuDate(date.toISOString().slice(0, 10));
        } else {
          setMenuDate(new Date().toISOString().slice(0, 10));
        }
      } else {
        setMenuDate(new Date().toISOString().slice(0, 10));
      }
      
      // Load existing sections or create a default one
      if (menu.sections && menu.sections.length > 0) {
        setSections(menu.sections);
      } else {
        // Migrate old menu format (recipeIds directly on menu) to sections
        if (menu.recipeIds && menu.recipeIds.length > 0) {
          setSections([createMenuSection('Alle Rezepte', menu.recipeIds)]);
        } else {
          setSections([createMenuSection('Hauptspeise', [])]);
        }
      }
    } else {
      // New menu - create default section
      setSections([createMenuSection('Hauptspeise', [])]);
      setMenuDate(new Date().toISOString().slice(0, 10));
      setEventId(null);
      setEventOwnerId(null);
      setDescriptionGuestIds([]);
    }
  }, [menu]);

  const handleFabClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const createSyntheticEvent = () => ({
      preventDefault: () => {},
      target: formRef.current,
    });
    if (formRef.current) {
      try {
        if (typeof formRef.current.requestSubmit === 'function') {
          formRef.current.requestSubmit();
        } else {
          handleSubmit(createSyntheticEvent());
        }
      } catch (error) {
        console.error('Error submitting form:', error);
        handleSubmit(createSyntheticEvent());
      }
    }
  };

  const handleFabMouseDown = () => setFabPressed(true);
  const handleFabMouseUp = () => setFabPressed(false);

  const handleAddSection = (sectionName = null) => {
    const name = sectionName || newSectionName.trim();
    if (!name) {
      alert('Bitte geben Sie einen Abschnittsnamen ein');
      return;
    }

    // Check if section already exists
    if (sections.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert('Ein Abschnitt mit diesem Namen existiert bereits');
      return;
    }

    const newSection = createMenuSection(name, []);
    if (insertSectionAtIndex !== null) {
      const newSections = [...sections];
      newSections.splice(insertSectionAtIndex, 0, newSection);
      setSections(newSections);
    } else {
      setSections([...sections, newSection]);
    }
    setNewSectionName('');
    setShowSectionInput(false);
    setInsertSectionAtIndex(null);

    // Save new section name for future use
    saveSectionNames([name]);
    if (!availableSections.includes(name)) {
      setAvailableSections([...availableSections, name]);
    }
  };

  const handleRemoveSection = (index) => {
    if (sections.length === 1) {
      alert('Ein Menü muss mindestens einen Abschnitt haben');
      return;
    }

    if (sections[index].recipeIds.length > 0 || (sections[index].drinkIds?.length || 0) > 0) {
      if (!window.confirm('Dieser Abschnitt enthält Rezepte oder Getränke. Wirklich löschen?')) {
        return;
      }
    }

    setSections(sections.filter((_, i) => i !== index));
  };

  const handleToggleRecipeInSection = (sectionIndex, recipeId) => {
    const newSections = [...sections];
    const section = newSections[sectionIndex];

    if (section.recipeIds.includes(recipeId)) {
      // Remove recipe from this section
      section.recipeIds = section.recipeIds.filter(id => id !== recipeId);
    } else {
      // Add recipe to this section (and remove from other sections)
      newSections.forEach((s, i) => {
        if (i === sectionIndex) {
          s.recipeIds = [...s.recipeIds, recipeId];
        } else {
          s.recipeIds = s.recipeIds.filter(id => id !== recipeId);
        }
      });
    }

    setSections(newSections);
  };

  const handleDragEndSections = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prevSections) => {
        const oldIndex = prevSections.findIndex(s => s.name === active.id);
        const newIndex = prevSections.findIndex(s => s.name === over.id);
        if (oldIndex === -1 || newIndex === -1) return prevSections;
        return arrayMove(prevSections, oldIndex, newIndex);
      });
    }
  };

  const handleMenuImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingMenuImage(true);
    try {
      const base64 = await fileToBase64(file);
      const compressed = await compressImage(base64);
      setMenuImage(compressed);
    } catch (error) {
      alert('Fehler beim Hochladen des Bildes. Bitte versuchen Sie es erneut.');
    } finally {
      setUploadingMenuImage(false);
    }
  };

  const handleRemoveMenuImage = () => {
    setMenuImage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (savingMenu) {
      console.warn('[MenuForm:handleSubmit] Already saving - ignoring duplicate call');
      return;
    }

    console.log('=== [MenuForm:handleSubmit] START ===');
    const t0 = performance.now();

    if (!name.trim()) {
      alert('Bitte geben Sie einen Menü-Namen ein');
      return;
    }

    // Check if at least one recipe or manually added drink is selected
    const totalRecipes = sections.reduce((sum, section) => sum + section.recipeIds.length, 0);
    const totalDrinks = sections.reduce((sum, section) => sum + (section.drinkIds?.length || 0), 0);
    if (totalRecipes === 0 && totalDrinks === 0) {
      alert('Bitte wählen Sie mindestens ein Rezept oder Getränk aus');
      return;
    }

    console.log('[MenuForm:handleSubmit] Sections (%d):', sections.length,
      sections.map(s => ({ name: s.name, recipeIds: s.recipeIds })));
    console.log('[MenuForm:handleSubmit] Total recipes across sections:', totalRecipes);

    const allRecipeIds = sections.reduce((ids, section) => [...ids, ...section.recipeIds], []);
    console.log('[MenuForm:handleSubmit] All recipe IDs:', allRecipeIds);

    const recipeImageMap = {};
    for (const id of allRecipeIds) {
      const r = recipes.find(rec => rec.id === id);
      if (r) {
        const img = r.images?.[0]?.url || r.image || null;
        recipeImageMap[id] = img ? img.substring(0, 80) : '(no image)';
      } else {
        recipeImageMap[id] = '(recipe not found)';
      }
    }
    console.log('[MenuForm:handleSubmit] Recipe ID → Image mapping:', recipeImageMap);

    setSavingMenu(true);
    try {
      // ALWAYS auto-generate a grid image from recipe title images to ensure changes are reflected.
      // Note: menu.image (manual upload) is preserved separately and takes precedence in display.
      let gridImage = null;
      let gridImageDark = null;
      try {
        console.log('[MenuForm:handleSubmit] Fetching category images...');
        const tCat = performance.now();
        const categoryImages = await getCategoryImages();
        console.log('[MenuForm:handleSubmit] getCategoryImages() done in %.1fms → %d images',
          performance.now() - tCat, categoryImages.length);

        console.log('[MenuForm:handleSubmit] Calling selectMenuGridImages...');
        const tSel = performance.now();
        const selectedUrls = selectMenuGridImages(sections, recipes, categoryImages);
        console.log('[MenuForm:handleSubmit] selectMenuGridImages() done in %.1fms → %d URLs',
          performance.now() - tSel, selectedUrls.length,
          selectedUrls.map((u, i) => `[${i}] ${u.substring(0, 60)}`));

        // Use existing menu ID or generate temporary ID for new menus (shared for both uploads)
        const uploadMenuId = menu?.id || `temp-${Date.now()}`;

        if (selectedUrls.length > 0) {
          // Fetch each source image over the network once and reuse the
          // converted Base64 for both the light and dark variant below,
          // instead of every buildMenuGridImage() call re-fetching them.
          console.log('[MenuForm:handleSubmit] Converting source images to Base64...');
          const tConvert = performance.now();
          const convertedUrls = await convertImageUrlsToBase64(selectedUrls);
          console.log('[MenuForm:handleSubmit] convertImageUrlsToBase64() done in %.1fms',
            performance.now() - tConvert);

          console.log('[MenuForm:handleSubmit] Calling buildMenuGridImage (light + dark, in parallel)...');
          const tGrid = performance.now();
          const [gridImageBase64, gridImageDarkBase64] = await Promise.all([
            buildMenuGridImage(convertedUrls, {
              width: 600,
              height: 300,
              gap: 0,
              quality: 0.8
            }),
            buildMenuGridImage(convertedUrls, {
              width: 600,
              height: 300,
              gap: 0,
              quality: 0.8,
              backgroundColor: '#1e1e1e',
              placeholderColor: '#2a2a2a',
            }),
          ]);
          console.log('[MenuForm:handleSubmit] buildMenuGridImage() done in %.1fms → light: %s, dark: %s',
            performance.now() - tGrid, Boolean(gridImageBase64), Boolean(gridImageDarkBase64));

          // Delete-old+upload-new for the light and dark variants are
          // independent Firebase Storage operations, so run them in parallel
          // rather than waiting on one before starting the other.
          [gridImage, gridImageDark] = await Promise.all([
            (async () => {
              if (!gridImageBase64) return null;
              // Delete old grid image from Firebase Storage if updating an existing menu
              if (menu?.gridImage && isStorageUrl(menu.gridImage)) {
                try {
                  await deleteMenuGridImage(menu.gridImage);
                } catch (err) {
                  console.warn('[MenuForm:handleSubmit] Could not delete old grid image:', err);
                }
              }
              // Upload grid image to Firebase Storage
              try {
                console.log('[MenuForm:handleSubmit] Uploading grid image to Firebase Storage...');
                const tUpload = performance.now();
                const url = await uploadMenuGridImage(gridImageBase64, uploadMenuId);
                console.log('[MenuForm:handleSubmit] Grid image uploaded in %.1fms → URL: %s',
                  performance.now() - tUpload, url.substring(0, 80));
                return url;
              } catch (uploadErr) {
                console.error('[MenuForm:handleSubmit] Failed to upload grid image:', uploadErr);
                // Fall back to null if upload fails — don't block menu save
                return null;
              }
            })(),
            (async () => {
              if (!gridImageDarkBase64) return null;
              // Delete old dark grid image from Firebase Storage if updating an existing menu
              if (menu?.gridImageDark && isStorageUrl(menu.gridImageDark)) {
                try {
                  await deleteMenuGridImageDark(menu.gridImageDark);
                } catch (err) {
                  console.warn('[MenuForm:handleSubmit] Could not delete old dark grid image:', err);
                }
              }
              // Upload dark grid image to Firebase Storage
              try {
                console.log('[MenuForm:handleSubmit] Uploading dark grid image to Firebase Storage...');
                const tUploadDark = performance.now();
                const url = await uploadMenuGridImageDark(gridImageDarkBase64, uploadMenuId);
                console.log('[MenuForm:handleSubmit] Dark grid image uploaded in %.1fms → URL: %s',
                  performance.now() - tUploadDark, url.substring(0, 80));
                return url;
              } catch (uploadErr) {
                console.error('[MenuForm:handleSubmit] Failed to upload dark grid image:', uploadErr);
                return null;
              }
            })(),
          ]);
        } else {
          console.warn('[MenuForm:handleSubmit] No URLs selected — skipping grid generation');
        }
      } catch (err) {
        console.error('[MenuForm:handleSubmit] Fehler beim Erstellen des Menü-Rasterbilds:', err.message || err, err);
      }

      const menuData = {
        id: menu?.id,
        name: name.trim(),
        description: description.trim(),
        descriptionGuestIds,
        menuDate: menuDate,
        image: menuImage,
        gridImage: gridImage || null,
        gridImageDark: gridImageDark || null,
        createdBy: menu?.createdBy || currentUser?.id,
        sections: sections,
        recipeIds: allRecipeIds, // Keep for backward compatibility
        eventId: eventId || null,
        eventOwnerId: eventId ? eventOwnerId : null,
      };

      console.log('[MenuForm:handleSubmit] Final menuData:', {
        id: menuData.id,
        name: menuData.name,
        hasImage: Boolean(menuData.image),
        hasGridImage: Boolean(menuData.gridImage),
        hasGridImageDark: Boolean(menuData.gridImageDark),
        sectionsCount: menuData.sections.length,
        recipeIdsCount: menuData.recipeIds.length,
      });

      // Keep the linked event's drinks in sync with this menu's "Drinks"
      // section: every manually added/removed drink (and every drink recipe)
      // here is mirrored into the event's customDrinkIds, and its
      // Getränkeverteilung is recalculated to match. Drinks that live only on
      // the event side (never touched from the menu) are left untouched.
      // Only possible when the current user owns the linked event, since the
      // calculateEventDrinks Cloud Function only ever writes to the caller's
      // own events collection.
      if (eventId && linkedEvent && eventOwnerId === currentUser?.id) {
        try {
          const recipeDrinkIds = await Promise.all(drinksSectionRecipeIds.map(ensureDrinkForRecipe));
          const existingEventDrinkIds = Array.isArray(linkedEvent.customDrinkIds) ? linkedEvent.customDrinkIds : [];
          const survivingEventDrinkIds = existingEventDrinkIds.filter((id) => !removedEventDrinkIds.includes(id));
          // Apply any drag-and-drop reordering staged locally (see
          // handleDragEndDrinks) before appending newly added drinks, so the
          // saved order matches what was shown in the menu form.
          const targetDrinkIds = eventDrinkOrder.length
            ? [
                ...eventDrinkOrder.filter((id) => survivingEventDrinkIds.includes(id)),
                ...survivingEventDrinkIds.filter((id) => !eventDrinkOrder.includes(id)),
              ]
            : survivingEventDrinkIds;
          [...drinksSectionManualDrinkIds, ...recipeDrinkIds].forEach((id) => {
            if (id && !targetDrinkIds.includes(id)) targetDrinkIds.push(id);
          });

          const drinksChanged =
            targetDrinkIds.length !== existingEventDrinkIds.length ||
            targetDrinkIds.some((id, index) => id !== existingEventDrinkIds[index]);

          // Keep the linked event's guest list mirrored to this menu's guest
          // pills too: once linked, the two lists always stay in sync, in
          // both directions (see EventForm's handleSubmit for the reverse).
          const existingEventGuestIds = Array.isArray(linkedEvent.selectedGuestIds) ? linkedEvent.selectedGuestIds : [];
          const guestsChanged =
            descriptionGuestIds.length !== existingEventGuestIds.length ||
            descriptionGuestIds.some((id) => !existingEventGuestIds.includes(id)) ||
            existingEventGuestIds.some((id) => !descriptionGuestIds.includes(id));

          if (drinksChanged || guestsChanged) {
            const drinkDistributionFactors = { ...(linkedEvent.drinkDistributionFactors || {}) };
            const drinkSelectedEinheiten = { ...(linkedEvent.drinkSelectedEinheiten || {}) };
            Object.keys(drinkDistributionFactors).forEach((id) => {
              if (!targetDrinkIds.includes(id)) delete drinkDistributionFactors[id];
            });
            Object.keys(drinkSelectedEinheiten).forEach((id) => {
              if (!targetDrinkIds.includes(id)) delete drinkSelectedEinheiten[id];
            });

            const { id: _linkedEventId, berechnung: _berechnung, ...eventFields } = linkedEvent;
            const allEventDrinks = mergePredefinedDrinks(linkedEventCustomDrinks);
            const categories = [...new Set(
              targetDrinkIds
                .map((drinkId) => allEventDrinks.find((d) => d.id === drinkId)?.kategorie)
                .filter(Boolean)
                .map((categoryId) => (categoryHasOwnBudget(categoryId) ? categoryId : getDrinkParentCategoryId(categoryId) || categoryId))
            )];
            const targetDriverGuestIds = (linkedEvent.driverGuestIds || []).filter((id) => descriptionGuestIds.includes(id));
            const selectedGuestObjs = guests.filter((guest) => descriptionGuestIds.includes(guest.id));
            const guestNamesById = selectedGuestObjs.reduce((acc, guest) => {
              acc[guest.id] = getGuestDisplayName(guest) || 'Unbenannter Gast';
              return acc;
            }, {});
            const guestPreferenceMultipliers = computeGuestPreferenceMultipliers(selectedGuestObjs, allEventDrinks, targetDriverGuestIds);
            console.log('[MenuForm:handleSubmit] Syncing drinks/guests to linked event and recalculating Getränkeverteilung:', targetDrinkIds, descriptionGuestIds);
            await calculateEventDrinks({
              ...eventFields,
              customDrinkIds: targetDrinkIds,
              drinkDistributionFactors,
              drinkSelectedEinheiten,
              categories,
              selectedGuestIds: descriptionGuestIds,
              driverGuestIds: targetDriverGuestIds,
              guestNamesById,
              guestPreferenceMultipliers,
            }, eventId);
          }
        } catch (err) {
          console.error('[MenuForm:handleSubmit] Fehler beim Synchronisieren der Event-Getränke:', err);
        }
      }

      console.log('=== [MenuForm:handleSubmit] END (%.1fms) ===', performance.now() - t0);

      // Await the parent's save (Firestore write + closing the form) so the
      // "saving" state - and the re-entrancy guard at the top of this
      // function - stays active until the menu is actually persisted and the
      // form is about to close. Without this, savingMenu flips back to false
      // as soon as onSave is merely *called*, re-enabling "Speichern" while
      // the real save is still in flight: an impatient click during that
      // window starts a second, fully redundant submit (redoing the grid
      // image work above) and can leave the user back on this edit screen
      // instead of wherever the completed save should have taken them.
      await onSave(menuData);
    } finally {
      setSavingMenu(false);
    }
  };

  // Guests tagged as pills in the description field (see the "menuDescription"
  // form-group below). Mirrors the recipe/drink search handlers above.
  const handleAddDescriptionGuest = (guestId) => {
    if (descriptionGuestIds.includes(guestId)) {
      setGuestSearchQuery('');
      return;
    }
    const next = [...descriptionGuestIds, guestId];
    setDescriptionGuestIds(next);
    if (eventId && linkedEvent && eventOwnerId === currentUser?.id) {
      pushGuestsToEvent(eventId, eventOwnerId, next, linkedEvent);
    }
    setGuestSearchQuery('');
  };

  const handleRemoveDescriptionGuest = (guestId, displayName) => {
    const index = descriptionGuestIds.indexOf(guestId);
    const canSyncToEvent = eventId && linkedEvent && eventOwnerId === currentUser?.id;
    const next = descriptionGuestIds.filter((id) => id !== guestId);
    setDescriptionGuestIds(next);
    if (canSyncToEvent) pushGuestsToEvent(eventId, eventOwnerId, next, linkedEvent);
    notifyDeleted({
      id: `description-guest:${guestId}`,
      name: displayName || 'Gast',
      undo: () => {
        // Kept side-effect-free (the sync push happens after, not inside the
        // updater) so React StrictMode's double-invoke of updater functions
        // can't fire the network call twice.
        let restored = null;
        setDescriptionGuestIds((prev) => {
          if (prev.includes(guestId)) {
            restored = prev;
            return prev;
          }
          const nextIds = [...prev];
          nextIds.splice(Math.min(index, nextIds.length), 0, guestId);
          restored = nextIds;
          return nextIds;
        });
        if (canSyncToEvent && restored) pushGuestsToEvent(eventId, eventOwnerId, restored, linkedEvent);
      },
    });
  };

  const getFilteredDescriptionGuests = () => {
    const availableGuests = guests.filter((guest) => !descriptionGuestIds.includes(guest.id));
    if (!guestSearchQuery.trim()) return availableGuests;
    return fuzzyFilter(availableGuests, guestSearchQuery, (guest) => getGuestDisplayName(guest) || '');
  };

  const handleSearchChange = (sectionIndex, query) => {
    setSearchQueries({
      ...searchQueries,
      [sectionIndex]: query
    });
  };

  const handleAddRecipeToSection = (sectionIndex, recipeId) => {
    handleToggleRecipeInSection(sectionIndex, recipeId);
    // Clear search after adding
    setSearchQueries({
      ...searchQueries,
      [sectionIndex]: ''
    });
  };

  // Same as handleAddRecipeToSection, but for the Drinks section's merged
  // search field, which clears the drink search query instead.
  const handleAddRecipeToDrinksSection = (sectionIndex, recipeId) => {
    handleToggleRecipeInSection(sectionIndex, recipeId);
    setDrinkSearchQueries({
      ...drinkSearchQueries,
      [sectionIndex]: ''
    });
  };

  const handleRemoveRecipeFromSection = (sectionIndex, recipeId, displayName) => {
    // If this recipe is a drink recipe deduped against a linked event drink
    // (see the `eventDrinks` useMemo above), removing it here would only
    // hide the recipe entry - the event drink would then reappear as its
    // own entry (dedup no longer applies) and need a second click to
    // actually go away. Stage its removal too so both disappear together.
    const section = sections[sectionIndex];
    const index = section ? section.recipeIds.indexOf(recipeId) : -1;
    let linkedEventDrinkId = null;
    if (section?.name?.toLowerCase() === 'drinks') {
      const linkedEventDrink = eventDrinks.find((drink) => drink.recipeId === recipeId);
      if (linkedEventDrink) {
        linkedEventDrinkId = linkedEventDrink.id;
        setRemovedEventDrinkIds((prev) => (prev.includes(linkedEventDrink.id) ? prev : [...prev, linkedEventDrink.id]));
      }
    }
    setSections((prevSections) => prevSections.map((s, i) => (
      i === sectionIndex ? { ...s, recipeIds: s.recipeIds.filter((id) => id !== recipeId) } : s
    )));
    notifyDeleted({
      id: `recipe:${sectionIndex}:${recipeId}`,
      name: displayName || 'Rezept',
      undo: () => {
        setSections((prev) => prev.map((s, i) => {
          if (i !== sectionIndex || s.recipeIds.includes(recipeId)) return s;
          const next = [...s.recipeIds];
          next.splice(Math.min(index, next.length), 0, recipeId);
          return { ...s, recipeIds: next };
        }));
        if (linkedEventDrinkId) {
          setRemovedEventDrinkIds((prev) => prev.filter((id) => id !== linkedEventDrinkId));
        }
      },
    });
  };

  const handleDragEndRecipes = (sectionIndex, event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSections((prevSections) => {
        const newSections = prevSections.map((section, idx) => {
          if (idx !== sectionIndex) return section;
          const oldIndex = section.recipeIds.indexOf(active.id);
          const newIndex = section.recipeIds.indexOf(over.id);
          return { ...section, recipeIds: arrayMove(section.recipeIds, oldIndex, newIndex) };
        });
        return newSections;
      });
    }
  };

  // Freely reorders the merged "Drinks" list - drink recipes, event-linked
  // drinks, and manually added drinks together - via drag & drop, so any of
  // the three can be interleaved in any order instead of recipes always
  // sitting above drinks. The resulting composite order is split back into
  // section.recipeIds (recipes), section.drinkIds (manual), and
  // eventDrinkOrder (event-linked, persisted into the linked event's
  // customDrinkIds on save - see handleSubmit), and also saved in full as
  // section.itemOrder so the exact interleaving persists and is reused by
  // MenuDetail's read-only view.
  const handleDragEndDrinks = (sectionIndex, event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const section = sections[sectionIndex];
    if (!section) return;

    const sectionEventDrinks = section.name?.toLowerCase() === 'drinks' ? orderedEventDrinks : [];
    const { items } = getDrinksSectionItems(section, recipes, sectionEventDrinks, getDrinkDisplayName);
    const currentOrder = items.map((item) => item.compositeId);
    const oldIndex = currentOrder.indexOf(active.id);
    const newIndex = currentOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);

    setEventDrinkOrder(
      newOrder.filter((compositeId) => compositeId.startsWith('event:')).map((compositeId) => compositeId.slice('event:'.length))
    );
    setSections((prevSections) => prevSections.map((s, i) => {
      if (i !== sectionIndex) return s;
      // Recipe IDs that don't currently resolve to a visible recipe aren't
      // part of `items`/`newOrder` (see renderableRecipeIds in
      // getDrinksSectionItems), so they'd otherwise be silently dropped here;
      // keep them around, just not reflected in the visible order.
      const unresolvedRecipeIds = (s.recipeIds || []).filter((id) => !recipes.some((r) => r.id === id));
      return {
        ...s,
        recipeIds: [
          ...newOrder.filter((compositeId) => compositeId.startsWith('recipe:')).map((compositeId) => compositeId.slice('recipe:'.length)),
          ...unresolvedRecipeIds,
        ],
        drinkIds: newOrder.filter((compositeId) => compositeId.startsWith('manual:')).map((compositeId) => compositeId.slice('manual:'.length)),
        itemOrder: newOrder,
      };
    }));
  };

  const getFilteredRecipes = (sectionIndex) => {
    const query = searchQueries[sectionIndex] || '';
    const section = sections[sectionIndex];
    
    // Filter out recipes already in this section
    const availableRecipes = recipes.filter(recipe => !section.recipeIds.includes(recipe.id));
    
    if (!query.trim()) {
      return availableRecipes;
    }
    
    // Use fuzzy search
    return fuzzyFilter(availableRecipes, query, recipe => recipe.title);
  };

  const handleAddSectionFabPressStart = (index) => setAddSectionFabPressedIndex(index);
  const handleAddSectionFabPressEnd = () => setAddSectionFabPressedIndex(null);

  if (formSubView === 'newEvent') {
    return (
      <EventForm
        currentUser={currentUser}
        recipes={recipes}
        guestProfiles={guestProfiles}
        customDrinks={sharedCustomDrinks}
        initialEvent={{ eventName: name.trim(), date: menuDate, customDrinkIds: newEventDrinkIds, selectedGuestIds: descriptionGuestIds }}
        onCancel={() => setFormSubView('main')}
        onSaved={async (newEventId) => {
          setEventId(newEventId);
          setEventOwnerId(currentUser.id);
          setFormSubView('main');
          persistEventLink(newEventId, currentUser.id);
          // The embedded EventForm was seeded with this menu's guests, but
          // its own "Gäste verwalten" may have changed the list further
          // before the event was created - re-read the event as actually
          // saved so the menu ends up with the same final guest list.
          const createdEvent = await getEvent(currentUser.id, newEventId);
          const finalGuestIds = Array.isArray(createdEvent?.selectedGuestIds)
            ? createdEvent.selectedGuestIds
            : descriptionGuestIds;
          setDescriptionGuestIds(finalGuestIds);
          if (menu?.id) updateMenu(menu.id, { descriptionGuestIds: finalGuestIds });
        }}
        onManageDrinks={() => setFormSubView('manageDrinks')}
      />
    );
  }

  if (formSubView === 'manageDrinks') {
    return (
      <DrinkManagementPage
        onBack={() => setFormSubView('newEvent')}
        currentUser={currentUser}
        recipes={recipes}
        customDrinks={sharedCustomDrinks}
        customDrinksLoaded={customDrinksLoaded}
      />
    );
  }

  if (formSubView === 'linkPicker') {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>Bestehende Kalkulation verknüpfen</h2>
          <button
            className="events-close-btn"
            onClick={() => setFormSubView('main')}
            aria-label="Abbrechen"
            title="Abbrechen"
          >
            ×
          </button>
        </div>
        {availableEvents.length === 0 ? (
          <div className="events-empty-state">
            <p>Noch keine Events vorhanden.</p>
          </div>
        ) : (
          <div className="events-list">
            {availableEvents.map((event) => (
              <div key={event.id} className="events-card" onClick={() => handleLinkEvent(event.id)}>
                <div className="events-card-main">
                  <h3>{event.eventName}</h3>
                  <p className="events-card-meta">{formatEventDate(event.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {guestLinkConflict && (
          <GuestLinkConflictDialog
            eventGuestCount={guestLinkConflict.eventGuestIds.length}
            menuGuestCount={guestLinkConflict.menuGuestIds.length}
            onChoose={applyGuestLinkChoice}
            onCancel={() => setGuestLinkConflict(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="menu-form-container">
      <div className="menu-form-header">
        <h2 className="menu-form-header-title">{menu ? 'Menü bearbeiten' : 'Neues Menü erstellen'}</h2>
        <div className="menu-form-header-actions">
          <button
            type="button"
            className="menu-form-header-cancel"
            onClick={onCancel}
            disabled={savingMenu}
            title="Abbrechen"
            aria-label="Menübearbeitung abbrechen"
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="menu-form-header-save"
            onClick={handleFabClick}
            disabled={savingMenu}
            title={menu ? 'Menü aktualisieren' : 'Menü speichern'}
            aria-label={menu ? 'Menü aktualisieren' : 'Menü speichern'}
          >
            {savingMenu ? '…' : (menu ? 'Aktualisieren' : 'Speichern')}
          </button>
        </div>
      </div>

      <form ref={formRef} className="menu-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="menuName">Menü-Name *</label>
          <input
            type="text"
            id="menuName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Sonntagsessen, Festtagsmenü"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="menuDescription">Beschreibung (optional)</label>
          <div className="menu-description-field">
            {descriptionGuestIds.length > 0 && (
              <div className="menu-description-guest-pills">
                {descriptionGuestIds.map((guestId) => {
                  const guest = guests.find((g) => g.id === guestId);
                  const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                  return (
                    <span key={guestId} className="menu-description-guest-pill delete-row-hover-target">
                      {fullName}
                      <DeleteRowButton
                        itemName={fullName}
                        className="menu-description-guest-pill-delete"
                        onClick={() => handleRemoveDescriptionGuest(guestId, fullName)}
                      />
                    </span>
                  );
                })}
              </div>
            )}

            <div className="typeahead-container menu-description-guest-search">
              <input
                type="text"
                className="typeahead-input menu-description-guest-search-input"
                placeholder="Suche Gäste und füge sie hinzu"
                value={guestSearchQuery}
                onChange={(e) => setGuestSearchQuery(e.target.value)}
              />

              {guestSearchQuery.trim() && (
                <div className="typeahead-dropdown">
                  {(() => {
                    const filteredGuests = getFilteredDescriptionGuests();
                    if (filteredGuests.length === 0) {
                      return <div className="typeahead-no-results">Keine Gäste gefunden</div>;
                    }
                    return filteredGuests.slice(0, 10).map((guest) => (
                      <div
                        key={guest.id}
                        className="typeahead-item"
                        onClick={() => handleAddDescriptionGuest(guest.id)}
                      >
                        <span className="recipe-name">{getGuestDisplayName(guest) || 'Unbenannter Gast'}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            <textarea
              id="menuDescription"
              className="menu-description-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sag etwas über dein Menü."
              rows="3"
            />
          </div>
        </div>

        <div className="form-group menu-date-row">
          <div className="menu-date-field">
            <label htmlFor="menuDate">Datum</label>
            <input
              type="date"
              id="menuDate"
              value={menuDate}
              onChange={(e) => setMenuDate(e.target.value)}
            />
          </div>
          {!menuImage && (
            <div className="menu-photo-upload-wrap">
              <label
                htmlFor="menuImageFile"
                className="menu-photo-upload-btn"
                title={uploadingMenuImage ? 'Hochladen...' : 'Foto hochladen'}
              >
                {isBase64Image(getEffectiveIcon(buttonIcons, 'addImage', isDarkMode)) ? (
                  <img
                    src={getEffectiveIcon(buttonIcons, 'addImage', isDarkMode)}
                    alt="Foto hochladen"
                    className="button-icon-img menu-photo-upload-icon-img"
                  />
                ) : (
                  getEffectiveIcon(buttonIcons, 'addImage', isDarkMode)
                )}
              </label>
            </div>
          )}
          <input
            type="file"
            id="menuImageFile"
            accept="image/*"
            onChange={handleMenuImageUpload}
            style={{ display: 'none' }}
            disabled={uploadingMenuImage}
          />
        </div>

        {menuImage && (
          <div className="form-group">
            <div className="menu-image-preview">
              <img src={menuImage} alt="Menüfoto" />
              <div className="menu-image-actions">
                <label htmlFor="menuImageFile" className="menu-image-change-btn">
                  {uploadingMenuImage ? 'Hochladen...' : 'Ändern'}
                </label>
                <button
                  type="button"
                  className="menu-image-remove-btn"
                  onClick={handleRemoveMenuImage}
                  disabled={uploadingMenuImage}
                >
                  × Entfernen
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Mengenkalkulation (für Getränke)</label>
          {eventId ? (
            <div className="menu-event-linked">
              <p className="menu-event-linked-name">
                {linkedEventLoading ? 'Lädt …' : (linkedEvent?.eventName || 'Verknüpftes Event konnte nicht geladen werden.')}
              </p>
              <div className="menu-drinks-link-actions">
                <button type="button" className="menu-drinks-link-btn" onClick={() => setFormSubView('linkPicker')}>
                  Kalkulation ändern
                </button>
                <button type="button" className="menu-drinks-link-btn" onClick={handleUnlinkEvent}>
                  Kalkulation entfernen
                </button>
              </div>
            </div>
          ) : (
            <div className="menu-drinks-link-actions">
              <button type="button" className="menu-drinks-link-btn" onClick={() => setFormSubView('linkPicker')}>
                Bestehende Kalkulation verknüpfen
              </button>
              <button
                type="button"
                className="menu-drinks-link-btn"
                onClick={handleStartNewEvent}
                disabled={preparingNewEvent}
              >
                {preparingNewEvent ? 'Wird vorbereitet …' : 'Neue Kalkulation erstellen'}
              </button>
            </div>
          )}
        </div>

        <div className="form-section sections-management">
          <div className="sections-header">
            <h3>Abschnitte & Rezepte</h3>
            {!isMobile && (
              <button 
                type="button" 
                className="add-section-button"
                onClick={() => { setInsertSectionAtIndex(null); setShowSectionInput(!showSectionInput); }}
              >
                + Abschnitt hinzufügen
              </button>
            )}
          </div>

          {showSectionInput && (
            <div className="new-section-input">
              <div className="section-quick-select">
                <label>Vordefinierte Abschnitte:</label>
                <div className="quick-select-buttons">
                  {availableSections.map(sectionName => (
                    <button
                      key={sectionName}
                      type="button"
                      className="quick-select-button"
                      onClick={() => handleAddSection(sectionName)}
                      disabled={sections.some(s => s.name === sectionName)}
                    >
                      {sectionName}
                    </button>
                  ))}
                </div>
              </div>
              <div className="custom-section-input">
                <label>Oder eigenen Namen eingeben:</label>
                <div className="input-with-button">
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="z.B. Fingerfood, Amuse-Bouche"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSection();
                      }
                    }}
                  />
                  <button type="button" onClick={() => handleAddSection()}>
                    Hinzufügen
                  </button>
                </div>
              </div>
            </div>
          )}

          {recipes.length === 0 ? (
            <p className="no-recipes">Keine Rezepte verfügbar. Bitte erstellen Sie zuerst einige Rezepte.</p>
          ) : (
            <div className="sections-list">
              {isMobile && (
                <div className="add-section-gap">
                  <button
                    type="button"
                    className={`add-section-fab-button${addSectionFabPressedIndex === 0 ? ' pressed' : ''}`}
                    onClick={() => { setInsertSectionAtIndex(0); setShowSectionInput(!showSectionInput); }}
                    onTouchStart={() => handleAddSectionFabPressStart(0)}
                    onTouchEnd={handleAddSectionFabPressEnd}
                    onTouchCancel={handleAddSectionFabPressEnd}
                    onMouseDown={() => handleAddSectionFabPressStart(0)}
                    onMouseUp={handleAddSectionFabPressEnd}
                    onMouseLeave={handleAddSectionFabPressEnd}
                    title="Abschnitt hinzufügen"
                    aria-label="Abschnitt hinzufügen"
                  >
                    {isBase64Image(addSectionIcon) ? (
                      <img src={addSectionIcon} alt="Abschnitt hinzufügen" className="button-icon-image" draggable="false" />
                    ) : (
                      addSectionIcon
                    )}
                  </button>
                </div>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndSections}
              >
                <SortableContext
                  items={sections.map(s => s.name)}
                  strategy={verticalListSortingStrategy}
                >
              {sections.map((section, sectionIndex) => (
                <React.Fragment key={section.name}>
                <SortableSection
                  id={section.name}
                  section={section}
                  sectionIndex={sectionIndex}
                  recipes={recipes}
                  favoriteIds={favoriteIds}
                  searchQueries={searchQueries}
                  closeIcon={getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode) || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode)}
                  swipeDeleteIcon={getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode) || '🗑'}
                  onRemoveSection={handleRemoveSection}
                  onDragEndRecipes={handleDragEndRecipes}
                  onRemoveRecipeFromSection={handleRemoveRecipeFromSection}
                  onSearchChange={handleSearchChange}
                  onAddRecipeToSection={handleAddRecipeToSection}
                  getFilteredRecipes={getFilteredRecipes}
                  isDrinksSection={section.name?.toLowerCase() === 'drinks'}
                  drinkSearchQueries={drinkSearchQueries}
                  onDrinkSearchChange={handleDrinkSearchChange}
                  onAddDrinkToSection={handleAddDrinkToSection}
                  onAddRecipeToDrinksSection={handleAddRecipeToDrinksSection}
                  onRemoveDrinkFromSection={handleRemoveDrinkFromSection}
                  getFilteredDrinkSectionOptions={getFilteredDrinkSectionOptions}
                  getDrinkDisplayName={getDrinkDisplayName}
                  eventDrinks={section.name?.toLowerCase() === 'drinks' ? orderedEventDrinks : []}
                  onRemoveEventDrink={handleRemoveEventDrink}
                  onDragEndDrinks={handleDragEndDrinks}
                  showOwnDrinksOnly={showOwnDrinksOnly}
                  onToggleShowOwnDrinksOnly={setShowOwnDrinksOnly}
                />
                {isMobile && (
                  <div className="add-section-gap">
                    <button
                      type="button"
                      className={`add-section-fab-button${addSectionFabPressedIndex === sectionIndex + 1 ? ' pressed' : ''}`}
                      onClick={() => { setInsertSectionAtIndex(sectionIndex + 1); setShowSectionInput(!showSectionInput); }}
                      onTouchStart={() => handleAddSectionFabPressStart(sectionIndex + 1)}
                      onTouchEnd={handleAddSectionFabPressEnd}
                      onTouchCancel={handleAddSectionFabPressEnd}
                      onMouseDown={() => handleAddSectionFabPressStart(sectionIndex + 1)}
                      onMouseUp={handleAddSectionFabPressEnd}
                      onMouseLeave={handleAddSectionFabPressEnd}
                      title="Abschnitt hinzufügen"
                      aria-label="Abschnitt hinzufügen"
                    >
                      {isBase64Image(addSectionIcon) ? (
                        <img src={addSectionIcon} alt="Abschnitt hinzufügen" className="button-icon-image" draggable="false" />
                      ) : (
                        addSectionIcon
                      )}
                    </button>
                  </div>
                )}
                </React.Fragment>
              ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </form>

      {/* Cancel FAB button - positioned at bottom-left */}
      <button
        className={`cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
        onClick={onCancel}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        disabled={savingMenu}
        title="Abbrechen"
        aria-label="Menübearbeitung abbrechen"
      >
        {isBase64Image(getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
        )}
      </button>

      {/* FAB Save Button */}
      <button
        type="button"
        className={`save-fab-button ${fabPressed ? 'pressed' : ''}`}
        onClick={handleFabClick}
        onMouseDown={handleFabMouseDown}
        onMouseUp={handleFabMouseUp}
        onMouseLeave={handleFabMouseUp}
        onTouchStart={handleFabMouseDown}
        onTouchEnd={handleFabMouseUp}
        disabled={savingMenu}
        aria-label={menu ? 'Menü aktualisieren' : 'Menü speichern'}
        title={menu ? 'Menü aktualisieren' : 'Menü speichern'}
      >
        {isBase64Image(getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)} alt="Speichern" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)
        )}
      </button>
      {savingMenu && <SavingOverlay label="Menü wird gespeichert" />}
      <UndoSnackbar itemName={pendingName} onUndo={undo} />
    </div>
  );
}

export default MenuForm;
