import React, { useState, useEffect, useMemo, useRef } from 'react';
import './MenuForm.css';
import './EventsPage.css';
import { getUserFavorites } from '../utils/userFavorites';
import { getSavedSections, saveSectionNames, createMenuSection } from '../utils/menuSections';
import { fuzzyFilter } from '../utils/fuzzySearch';
import { fileToBase64, compressImage, selectMenuGridImages, buildMenuGridImage, isBase64Image } from '../utils/imageUtils';
import { uploadMenuGridImage, uploadMenuGridImageDark, deleteMenuGridImage, deleteMenuGridImageDark, isStorageUrl } from '../utils/storageUtils';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getButtonIcons } from '../utils/customLists';
import { getCategoryImages } from '../utils/categoryImages';
import { getEvent, subscribeToEvents, getCustomDrinks, subscribeToCustomDrinks } from '../utils/eventsFirestore';
import { mergePredefinedDrinks } from '../utils/drinkCategories';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import EventForm from './EventForm';
import DrinkManagementPage from './DrinkManagementPage';
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

// Sortable Section Component for drag & drop reordering of menu sections
function SortableSection({
  id, section, sectionIndex, recipes, favoriteIds, searchQueries, sensors, closeIcon,
  onRemoveSection, onDragEndRecipes, onRemoveRecipeFromSection,
  onSearchChange, onAddRecipeToSection, getFilteredRecipes,
  isDrinksSection, drinkSearchQueries, onDrinkSearchChange, onAddDrinkToSection,
  onAddRecipeToDrinksSection, onRemoveDrinkFromSection, getFilteredDrinkSectionOptions,
  getDrinkDisplayName,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
            className="remove-section-button"
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
        {section.recipeIds.length > 0 && (
          <div className="selected-recipes">
            <h5>Ausgewählte Rezepte:</h5>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => onDragEndRecipes(sectionIndex, event)}
            >
              <SortableContext
                items={section.recipeIds}
                strategy={verticalListSortingStrategy}
              >
                {section.recipeIds.map(recipeId => {
                  const recipe = recipes.find(r => r.id === recipeId);
                  if (!recipe) return null;
                  const isFavorite = favoriteIds.includes(recipe.id);
                  return (
                    <SortableRecipeItem
                      key={recipe.id}
                      id={recipe.id}
                      recipe={recipe}
                      isFavorite={isFavorite}
                      sectionIndex={sectionIndex}
                      onRemove={onRemoveRecipeFromSection}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
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
          {(section.drinkIds || []).length > 0 && (
            <div className="selected-recipes">
              <h5>Manuell hinzugefügte Getränke:</h5>
              {(section.drinkIds || []).map(drinkId => (
                <div key={drinkId} className="selected-recipe-item">
                  <span className="recipe-name">{getDrinkDisplayName(drinkId)}</span>
                  <button
                    type="button"
                    className="remove-recipe-button"
                    onClick={() => onRemoveDrinkFromSection(sectionIndex, drinkId)}
                    title="Getränk entfernen"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

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
        </div>
      )}
      <div className="section-summary">
        {section.recipeIds.length} Rezept{section.recipeIds.length !== 1 ? 'e' : ''}
        {isDrinksSection && (section.drinkIds || []).length > 0
          ? `, ${section.drinkIds.length} Getränk${section.drinkIds.length !== 1 ? 'e' : ''}`
          : ''}
      </div>
    </div>
  );
}

// Sortable Recipe Item Component for menu sections
function SortableRecipeItem({ id, recipe, isFavorite, onRemove, sectionIndex }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`selected-recipe-item ${isDragging ? 'dragging' : ''}`}
    >
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Rezept verschieben"
      >
        ⋮⋮
      </button>
      <span className="recipe-name">
        {recipe.title}
        {isFavorite && <span className="favorite-indicator">★</span>}
      </span>
      <button
        type="button"
        className="remove-recipe-button"
        onClick={() => onRemove(sectionIndex, recipe.id)}
        title="Rezept entfernen"
      >
        ×
      </button>
    </div>
  );
}

function MenuForm({ menu, recipes, onSave, onCancel, currentUser }) {
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
  const [availableEvents, setAvailableEvents] = useState([]);
  const [userCustomDrinks, setUserCustomDrinks] = useState([]);
  const [drinkSearchQueries, setDrinkSearchQueries] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
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

  // Load the name and drinks of the currently linked event, if any.
  useEffect(() => {
    if (!eventId || !eventOwnerId) {
      setLinkedEvent(null);
      setLinkedEventCustomDrinks([]);
      return undefined;
    }
    let cancelled = false;
    setLinkedEventLoading(true);
    Promise.all([
      getEvent(eventOwnerId, eventId),
      getCustomDrinks(eventOwnerId),
    ]).then(([event, customDrinks]) => {
      if (cancelled) return;
      setLinkedEvent(event);
      setLinkedEventCustomDrinks(customDrinks);
    }).finally(() => {
      if (!cancelled) setLinkedEventLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, eventOwnerId]);

  // Names of the drinks assigned via the linked event, for a plain-text
  // list display (no drink tiles here, unlike the menu detail view).
  const eventDrinkNames = useMemo(() => {
    if (!linkedEvent) return [];
    const allDrinks = mergePredefinedDrinks(linkedEventCustomDrinks);
    const ids = Array.isArray(linkedEvent.customDrinkIds) ? linkedEvent.customDrinkIds : [];
    return ids.map((drinkId) => {
      const drink = allDrinks.find((d) => d.id === drinkId);
      return resolveDrinkDisplay(drink || drinkId, recipes).displayName || drinkId;
    });
  }, [linkedEvent, linkedEventCustomDrinks, recipes]);

  // Load the current user's events while the "Event verknüpfen" picker is open.
  useEffect(() => {
    if (formSubView !== 'linkPicker' || !currentUser?.id) return undefined;
    const unsubscribe = subscribeToEvents(currentUser.id, setAvailableEvents);
    return unsubscribe;
  }, [formSubView, currentUser?.id]);

  // Load the current user's drink catalog (custom + predefined) so drinks from
  // the event area can be manually added to the menu's "Drinks" section.
  useEffect(() => {
    if (!currentUser?.id) {
      setUserCustomDrinks([]);
      return undefined;
    }
    const unsubscribe = subscribeToCustomDrinks(currentUser.id, setUserCustomDrinks);
    return unsubscribe;
  }, [currentUser?.id]);

  const allDrinks = useMemo(() => mergePredefinedDrinks(userCustomDrinks), [userCustomDrinks]);

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
  };

  const handleRemoveDrinkFromSection = (sectionIndex, drinkId) => {
    setSections((prevSections) => prevSections.map((s, i) => {
      if (i !== sectionIndex) return s;
      return { ...s, drinkIds: (s.drinkIds || []).filter((id) => id !== drinkId) };
    }));
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
      .map((drink) => ({ type: 'drink', id: drink.id, drink, searchLabel: resolveDrinkDisplay(drink, recipes).displayName }));

    const combinedOptions = [...recipeOptions, ...drinkOptions];

    if (!query.trim()) {
      return combinedOptions;
    }

    return fuzzyFilter(combinedOptions, query, (option) => option.searchLabel);
  };

  // Manually added drinks in the "Drinks" section, used to pre-fill a newly
  // created event's drink selection so nothing has to be re-entered there.
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

  const handleLinkEvent = (id) => {
    setEventId(id);
    setEventOwnerId(currentUser.id);
    setFormSubView('main');
  };

  const handleUnlinkEvent = () => {
    setEventId(null);
    setEventOwnerId(null);
  };

  useEffect(() => {
    // Load available section names
    setAvailableSections(getSavedSections());

    if (menu) {
      setName(menu.name || '');
      setDescription(menu.description || '');
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
          console.log('[MenuForm:handleSubmit] Calling buildMenuGridImage...');
          const tGrid = performance.now();
          const gridImageBase64 = await buildMenuGridImage(selectedUrls, {
            width: 600,
            height: 300,
            gap: 0,
            quality: 0.8
          });
          console.log('[MenuForm:handleSubmit] buildMenuGridImage() done in %.1fms → gridImage generated: %s',
            performance.now() - tGrid, Boolean(gridImageBase64));

          if (gridImageBase64) {
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
              gridImage = await uploadMenuGridImage(gridImageBase64, uploadMenuId);
              console.log('[MenuForm:handleSubmit] Grid image uploaded in %.1fms → URL: %s',
                performance.now() - tUpload, gridImage.substring(0, 80));
            } catch (uploadErr) {
              console.error('[MenuForm:handleSubmit] Failed to upload grid image:', uploadErr);
              // Fall back to null if upload fails — don't block menu save
              gridImage = null;
            }
          }

          // Dark variant
          const gridImageDarkBase64 = await buildMenuGridImage(selectedUrls, {
            width: 600,
            height: 300,
            gap: 0,
            quality: 0.8,
            backgroundColor: '#1e1e1e',
            placeholderColor: '#2a2a2a',
          });

          if (gridImageDarkBase64) {
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
              gridImageDark = await uploadMenuGridImageDark(gridImageDarkBase64, uploadMenuId);
              console.log('[MenuForm:handleSubmit] Dark grid image uploaded in %.1fms → URL: %s',
                performance.now() - tUploadDark, gridImageDark.substring(0, 80));
            } catch (uploadErr) {
              console.error('[MenuForm:handleSubmit] Failed to upload dark grid image:', uploadErr);
              gridImageDark = null;
            }
          }
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
      console.log('=== [MenuForm:handleSubmit] END (%.1fms) ===', performance.now() - t0);

      onSave(menuData);
    } finally {
      setSavingMenu(false);
    }
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

  const handleRemoveRecipeFromSection = (sectionIndex, recipeId) => {
    const newSections = [...sections];
    newSections[sectionIndex].recipeIds = newSections[sectionIndex].recipeIds.filter(id => id !== recipeId);
    setSections(newSections);
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
        initialEvent={{ eventName: name.trim(), date: menuDate, customDrinkIds: drinksSectionManualDrinkIds }}
        onCancel={() => setFormSubView('main')}
        onSaved={(newEventId) => {
          setEventId(newEventId);
          setEventOwnerId(currentUser.id);
          setFormSubView('main');
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
      />
    );
  }

  if (formSubView === 'linkPicker') {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>Event verknüpfen</h2>
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
      </div>
    );
  }

  return (
    <div className="menu-form-container">
      <div className="menu-form-header">
        <h2>{menu ? 'Menü bearbeiten' : 'Neues Menü erstellen'}</h2>
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
          <textarea
            id="menuDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Sag etwas über dein Menü."
            rows="3"
          />
        </div>

        <div className="form-group">
          <label htmlFor="menuDate">Datum</label>
          <input
            type="date"
            id="menuDate"
            value={menuDate}
            onChange={(e) => setMenuDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Menüfoto (optional)</label>
          {menuImage ? (
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
          ) : (
            <label htmlFor="menuImageFile" className="menu-image-upload-label">
              {uploadingMenuImage ? 'Hochladen...' : 'Foto hochladen'}
            </label>
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

        <div className="form-group">
          <label>Event (für Getränke)</label>
          {eventId ? (
            <div className="menu-event-linked">
              <p className="menu-event-linked-name">
                {linkedEventLoading ? 'Lädt …' : (linkedEvent?.eventName || 'Verknüpftes Event konnte nicht geladen werden.')}
              </p>
              {eventDrinkNames.length > 0 && (
                <ul className="menu-event-drinks-list">
                  {eventDrinkNames.map((drinkName, index) => (
                    <li key={`${drinkName}-${index}`} className="menu-event-drinks-item">{drinkName}</li>
                  ))}
                </ul>
              )}
              <div className="menu-drinks-link-actions">
                <button type="button" className="menu-drinks-link-btn" onClick={() => setFormSubView('linkPicker')}>
                  Event ändern
                </button>
                <button type="button" className="menu-drinks-link-btn" onClick={handleUnlinkEvent}>
                  Verknüpfung entfernen
                </button>
              </div>
            </div>
          ) : (
            <div className="menu-drinks-link-actions">
              <button type="button" className="menu-drinks-link-btn" onClick={() => setFormSubView('linkPicker')}>
                Event verknüpfen
              </button>
              <button type="button" className="menu-drinks-link-btn" onClick={() => setFormSubView('newEvent')}>
                Event erstellen
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
                  sensors={sensors}
                  closeIcon={getEffectiveIcon(buttonIcons, 'menuCloseButton', isDarkMode)}
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
        {isBase64Image(getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)
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
    </div>
  );
}

export default MenuForm;
