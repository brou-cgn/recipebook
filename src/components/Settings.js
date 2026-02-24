import React, { useState, useEffect } from 'react';
import './Settings.css';
import { getCustomLists, saveCustomLists, resetCustomLists, getHeaderSlogan, saveHeaderSlogan, getFaviconImage, saveFaviconImage, getFaviconText, saveFaviconText, getAppLogoImage, saveAppLogoImage, getButtonIcons, saveButtonIcons, DEFAULT_BUTTON_ICONS, getTimelineBubbleIcon, saveTimelineBubbleIcon, getTimelineMenuBubbleIcon, saveTimelineMenuBubbleIcon, getTimelineMenuDefaultImage, saveTimelineMenuDefaultImage, getAIRecipePrompt, saveAIRecipePrompt, resetAIRecipePrompt, DEFAULT_AI_RECIPE_PROMPT } from '../utils/customLists';
import { isCurrentUserAdmin } from '../utils/userManagement';
import UserManagement from './UserManagement';
import { getCategoryImages, addCategoryImage, updateCategoryImage, removeCategoryImage, getAlreadyAssignedCategories } from '../utils/categoryImages';
import { fileToBase64, isBase64Image, compressImage } from '../utils/imageUtils';
import { updateFavicon, updatePageTitle, updateAppLogo } from '../utils/faviconUtils';
import { addFaq, updateFaq, deleteFaq, subscribeToFaqs, importFaqsFromMarkdown } from '../utils/faqFirestore';
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

const DRAGGING_OPACITY = 0.5;

function getSortableItemStyle(transform, transition, isDragging) {
  return {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? DRAGGING_OPACITY : 1,
  };
}

function SortableListItem({ id, label, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = getSortableItemStyle(transform, transition, isDragging);

  return (
    <div ref={setNodeRef} style={style} className={`list-item ${isDragging ? 'dragging' : ''}`}>
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Verschieben"
      >
        ⋮⋮
      </button>
      <span>{label}</span>
      <button className="remove-btn" onClick={onRemove} title="Entfernen">✕</button>
    </div>
  );
}

function SortablePortionUnitItem({ id, unit, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = getSortableItemStyle(transform, transition, isDragging);

  return (
    <div ref={setNodeRef} style={style} className={`list-item ${isDragging ? 'dragging' : ''}`}>
      <button
        type="button"
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Verschieben"
      >
        ⋮⋮
      </button>
      <span>{unit.singular} / {unit.plural}</span>
      <button className="remove-btn" onClick={onRemove} title="Entfernen">✕</button>
    </div>
  );
}

const CATEGORY_ALREADY_ASSIGNED_ERROR = 'Die folgenden Kategorien sind bereits einem anderen Bild zugeordnet: {categories}\n\nBitte wählen Sie andere Kategorien.';

/**
 * Renders text with **bold** markdown syntax as <strong> elements.
 */
function renderBoldText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function Settings({ onBack, currentUser }) {
  const [lists, setLists] = useState({
    cuisineTypes: [],
    mealCategories: [],
    units: [],
    portionUnits: []
  });
  const [newCuisine, setNewCuisine] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newPortionSingular, setNewPortionSingular] = useState('');
  const [newPortionPlural, setNewPortionPlural] = useState('');
  const [headerSlogan, setHeaderSlogan] = useState('');
  const [activeTab, setActiveTab] = useState('general'); // 'general', 'lists', or 'users'
  const isAdmin = isCurrentUserAdmin();
  
  // Category images state
  const [categoryImages, setCategoryImages] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingImageId, setEditingImageId] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);

  // Favicon state
  const [faviconImage, setFaviconImage] = useState(null);
  const [faviconText, setFaviconText] = useState('');
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  // App logo state
  const [appLogoImage, setAppLogoImage] = useState(null);
  const [uploadingAppLogo, setUploadingAppLogo] = useState(false);

  // Button icons state
  const [buttonIcons, setButtonIcons] = useState({
    cookingMode: '👨‍🍳',
    importRecipe: '📥',
    scanImage: '📷',
    webImport: '🌐',
    closeButton: '✕',
    menuCloseButton: '✕',
    filterButton: '⚙',
    copyLink: '📋',
    nutritionEmpty: '➕',
    nutritionFilled: '🥦'
  });
  const [uploadingButtonIcon, setUploadingButtonIcon] = useState(null);

  // Timeline bubble icon state
  const [timelineBubbleIcon, setTimelineBubbleIcon] = useState(null);
  const [uploadingTimelineBubbleIcon, setUploadingTimelineBubbleIcon] = useState(false);

  // Timeline menu bubble icon state
  const [timelineMenuBubbleIcon, setTimelineMenuBubbleIcon] = useState(null);
  const [uploadingTimelineMenuBubbleIcon, setUploadingTimelineMenuBubbleIcon] = useState(false);

  // Timeline default images state
  const [timelineMenuDefaultImage, setTimelineMenuDefaultImage] = useState(null);
  const [uploadingTimelineMenuDefaultImage, setUploadingTimelineMenuDefaultImage] = useState(false);

  // AI recipe prompt state
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_RECIPE_PROMPT);

  // FAQ state
  const [faqs, setFaqs] = useState([]);
  const [faqForm, setFaqForm] = useState({ title: '', description: '', screenshot: null, level: 1, adminOnly: false });
  const [editingFaqId, setEditingFaqId] = useState(null);
  const [uploadingFaqScreenshot, setUploadingFaqScreenshot] = useState(false);
  const [savingFaq, setSavingFaq] = useState(false);
  const [importingFaq, setImportingFaq] = useState(false);
  const [faqSelectedIds, setFaqSelectedIds] = useState([]);

  // Cleanup timeout on unmount
  useEffect(() => {
    const loadSettings = async () => {
      const lists = await getCustomLists();
      const slogan = await getHeaderSlogan();
      const faviconImg = await getFaviconImage();
      const faviconTxt = await getFaviconText();
      const appLogoImg = await getAppLogoImage();
      const icons = await getButtonIcons();
      const catImages = await getCategoryImages();
      const timelineIcon = await getTimelineBubbleIcon();
      const timelineMenuIcon = await getTimelineMenuBubbleIcon();
      const timelineMenuImg = await getTimelineMenuDefaultImage();
      const aiRecipePrompt = await getAIRecipePrompt();
      
      setLists(lists);
      setHeaderSlogan(slogan);
      setCategoryImages(catImages);
      setFaviconImage(faviconImg);
      setFaviconText(faviconTxt);
      setAppLogoImage(appLogoImg);
      setButtonIcons({ ...DEFAULT_BUTTON_ICONS, ...icons });
      setTimelineBubbleIcon(timelineIcon);
      setTimelineMenuBubbleIcon(timelineMenuIcon);
      setTimelineMenuDefaultImage(timelineMenuImg);
      setAiPrompt(aiRecipePrompt);
    };
    loadSettings();
  }, []);

  // Subscribe to FAQs for real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToFaqs((faqList) => {
      setFaqs(faqList);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // FAQ handlers
  const handleFaqScreenshotUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFaqScreenshot(true);
    try {
      const base64 = await fileToBase64(file);
      const compressed = await compressImage(base64, 800, 600, 0.8);
      setFaqForm(prev => ({ ...prev, screenshot: compressed }));
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingFaqScreenshot(false);
    }
  };

  const handleSaveFaq = async () => {
    if (!faqForm.title.trim()) {
      alert('Bitte gib einen Titel für den Kochschule-Eintrag ein.');
      return;
    }
    setSavingFaq(true);
    try {
      if (editingFaqId) {
        await updateFaq(editingFaqId, {
          title: faqForm.title.trim(),
          description: faqForm.description.trim(),
          screenshot: faqForm.screenshot || null,
          level: faqForm.level ?? 1,
          adminOnly: faqForm.adminOnly ?? false
        });
      } else {
        await addFaq({
          title: faqForm.title.trim(),
          description: faqForm.description.trim(),
          screenshot: faqForm.screenshot || null,
          level: faqForm.level ?? 1,
          adminOnly: faqForm.adminOnly ?? false,
          order: faqs.length
        });
      }
      setFaqForm({ title: '', description: '', screenshot: null, level: 1, adminOnly: false });
      setEditingFaqId(null);
    } catch (error) {
      alert('Fehler beim Speichern des Kochschule-Eintrags: ' + error.message);
    } finally {
      setSavingFaq(false);
    }
  };

  const handleEditFaq = (faq) => {
    setEditingFaqId(faq.id);
    setFaqForm({ title: faq.title || '', description: faq.description || '', screenshot: faq.screenshot || null, level: faq.level ?? 1, adminOnly: faq.adminOnly ?? false });
  };

  const handleDeleteFaq = async (faqId) => {
    if (!window.confirm('Möchtest du diesen Kochschule-Eintrag wirklich löschen?')) return;
    try {
      await deleteFaq(faqId);
      if (editingFaqId === faqId) {
        setEditingFaqId(null);
        setFaqForm({ title: '', description: '', screenshot: null, level: 1, adminOnly: false });
      }
      setFaqSelectedIds(prev => prev.filter(id => id !== faqId));
    } catch (error) {
      alert('Fehler beim Löschen des Kochschule-Eintrags: ' + error.message);
    }
  };

  const handleCancelFaqEdit = () => {
    setEditingFaqId(null);
    setFaqForm({ title: '', description: '', screenshot: null, level: 1, adminOnly: false });
  };

  const handleFaqIndent = async (delta) => {
    const updates = faqSelectedIds.map(id => {
      const faq = faqs.find(f => f.id === id);
      if (!faq) return null;
      const newLevel = Math.max(0, (faq.level ?? 1) + delta);
      return updateFaq(id, { level: newLevel });
    }).filter(Boolean);
    await Promise.all(updates);
  };

  const handleImportFaqFromMd = async () => {
    if (!window.confirm('Möchtest du alle FAQ-Einträge aus der FAQ.md importieren? Bereits vorhandene Einträge bleiben erhalten.')) return;
    setImportingFaq(true);
    try {
      const response = await fetch(process.env.PUBLIC_URL + '/FAQ.md', { cache: 'no-cache' });
      if (!response.ok) throw new Error('FAQ.md konnte nicht geladen werden.');
      const text = await response.text();
      const count = await importFaqsFromMarkdown(text, faqs);
      alert(`${count} FAQ-Einträge erfolgreich importiert.`);
    } catch (error) {
      alert('Fehler beim Import: ' + error.message);
    } finally {
      setImportingFaq(false);
    }
  };

  const handleSave = () => {
    saveCustomLists(lists);
    saveHeaderSlogan(headerSlogan);
    saveFaviconImage(faviconImage);
    saveFaviconText(faviconText);
    saveAppLogoImage(appLogoImage);
    saveButtonIcons(buttonIcons);
    saveTimelineBubbleIcon(timelineBubbleIcon);
    saveTimelineMenuBubbleIcon(timelineMenuBubbleIcon);
    saveTimelineMenuDefaultImage(timelineMenuDefaultImage);
    
    // Apply favicon changes immediately
    updateFavicon(faviconImage);
    updatePageTitle(faviconText);
    updateAppLogo(appLogoImage);
    
    // Notify service worker about settings update for PWA manifest/icons
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'UPDATE_APP_SETTINGS',
        settings: {
          faviconText: faviconText,
          headerSlogan: headerSlogan,
          appLogoImage: appLogoImage
        }
      });
    }
    
    alert('Einstellungen erfolgreich gespeichert!');
  };

  const handleReset = () => {
    if (window.confirm('Möchten Sie wirklich alle Listen auf die Standardwerte zurücksetzen?')) {
      const defaultLists = resetCustomLists();
      setLists(defaultLists);
      alert('Listen auf Standardwerte zurückgesetzt!');
    }
  };

  const addCuisine = () => {
    if (newCuisine.trim() && !lists.cuisineTypes.includes(newCuisine.trim())) {
      setLists({
        ...lists,
        cuisineTypes: [...lists.cuisineTypes, newCuisine.trim()]
      });
      setNewCuisine('');
    }
  };

  const removeCuisine = (cuisine) => {
    setLists({
      ...lists,
      cuisineTypes: lists.cuisineTypes.filter(c => c !== cuisine)
    });
  };

  const addCategory = () => {
    if (newCategory.trim() && !lists.mealCategories.includes(newCategory.trim())) {
      setLists({
        ...lists,
        mealCategories: [...lists.mealCategories, newCategory.trim()]
      });
      setNewCategory('');
    }
  };

  const removeCategory = (category) => {
    setLists({
      ...lists,
      mealCategories: lists.mealCategories.filter(c => c !== category)
    });
  };

  const addUnit = () => {
    if (newUnit.trim() && !lists.units.includes(newUnit.trim())) {
      setLists({
        ...lists,
        units: [...lists.units, newUnit.trim()]
      });
      setNewUnit('');
    }
  };

  const removeUnit = (unit) => {
    setLists({
      ...lists,
      units: lists.units.filter(u => u !== unit)
    });
  };

  const addPortionUnit = () => {
    if (newPortionSingular.trim() && newPortionPlural.trim()) {
      const newId = newPortionSingular.toLowerCase().replace(/\s+/g, '-');
      const exists = lists.portionUnits.some(pu => pu.id === newId);
      
      if (!exists) {
        setLists({
          ...lists,
          portionUnits: [...lists.portionUnits, {
            id: newId,
            singular: newPortionSingular.trim(),
            plural: newPortionPlural.trim()
          }]
        });
        setNewPortionSingular('');
        setNewPortionPlural('');
      }
    }
  };

  const removePortionUnit = (unitId) => {
    setLists({
      ...lists,
      portionUnits: lists.portionUnits.filter(pu => pu.id !== unitId)
    });
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag and drop handlers
  const handleDragEndCuisineTypes = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.cuisineTypes.indexOf(active.id);
        const newIndex = prevLists.cuisineTypes.indexOf(over.id);
        return {
          ...prevLists,
          cuisineTypes: arrayMove(prevLists.cuisineTypes, oldIndex, newIndex)
        };
      });
    }
  };

  const handleDragEndMealCategories = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.mealCategories.indexOf(active.id);
        const newIndex = prevLists.mealCategories.indexOf(over.id);
        return {
          ...prevLists,
          mealCategories: arrayMove(prevLists.mealCategories, oldIndex, newIndex)
        };
      });
    }
  };

  const handleDragEndUnits = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.units.indexOf(active.id);
        const newIndex = prevLists.units.indexOf(over.id);
        return {
          ...prevLists,
          units: arrayMove(prevLists.units, oldIndex, newIndex)
        };
      });
    }
  };

  const handleDragEndPortionUnits = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLists((prevLists) => {
        const oldIndex = prevLists.portionUnits.findIndex(u => u.id === active.id);
        const newIndex = prevLists.portionUnits.findIndex(u => u.id === over.id);
        return {
          ...prevLists,
          portionUnits: arrayMove(prevLists.portionUnits, oldIndex, newIndex)
        };
      });
    }
  };

  // Category image handlers
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      
      if (editingImageId) {
        // Update existing image
        await updateCategoryImage(editingImageId, { image: compressedBase64 });
        const catImages = await getCategoryImages();
        setCategoryImages(catImages);
        setEditingImageId(null);
      } else {
        // Add new image with selected categories
        const alreadyAssigned = await getAlreadyAssignedCategories(selectedCategories);
        if (alreadyAssigned.length > 0) {
          alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
          setUploadingImage(false);
          return;
        }
        
        await addCategoryImage(compressedBase64, selectedCategories);
        const catImages = await getCategoryImages();
        setCategoryImages(catImages);
        setSelectedCategories([]);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const handleRemoveCategoryImage = async (imageId) => {
    if (window.confirm('Möchten Sie dieses Bild wirklich entfernen?')) {
      await removeCategoryImage(imageId);
      const catImages = await getCategoryImages();
      setCategoryImages(catImages);
    }
  };

  const handleEditImageCategories = (imageId) => {
    const image = categoryImages.find(img => img.id === imageId);
    if (image) {
      setEditingImageId(imageId);
      setSelectedCategories([...image.categories]);
    }
  };

  const handleSaveImageCategories = async () => {
    if (!editingImageId) return;

    const alreadyAssigned = await getAlreadyAssignedCategories(selectedCategories, editingImageId);
    if (alreadyAssigned.length > 0) {
      alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
      return;
    }

    await updateCategoryImage(editingImageId, { categories: selectedCategories });
    const catImages = await getCategoryImages();
    setCategoryImages(catImages);
    setEditingImageId(null);
    setSelectedCategories([]);
  };

  const handleCancelEditCategories = () => {
    setEditingImageId(null);
    setSelectedCategories([]);
  };

  // Favicon handlers
  const handleFaviconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFavicon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setFaviconImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleRemoveFavicon = () => {
    setFaviconImage(null);
  };

  // App logo handlers
  const handleAppLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAppLogo(true);

    try {
      const base64 = await fileToBase64(file);
      // Use larger dimensions for PWA icons and preserve transparency for PNG
      const isPNG = file.type === 'image/png';
      const compressedBase64 = await compressImage(base64, 512, 512, 0.9, isPNG);
      setAppLogoImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingAppLogo(false);
    }
  };

  const handleRemoveAppLogo = () => {
    setAppLogoImage(null);
  };

  // Button icon image handlers
  const handleButtonIconImageUpload = async (iconKey, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingButtonIcon(iconKey);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setButtonIcons({ ...buttonIcons, [iconKey]: compressedBase64 });
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingButtonIcon(null);
    }
  };

  const handleRemoveButtonIconImage = (iconKey) => {
    setButtonIcons({ ...buttonIcons, [iconKey]: DEFAULT_BUTTON_ICONS[iconKey] });
  };

  // Timeline bubble icon handlers
  const handleTimelineBubbleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineBubbleIcon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineBubbleIcon(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineBubbleIcon(false);
    }
  };

  const handleRemoveTimelineBubbleIcon = () => {
    setTimelineBubbleIcon(null);
  };

  // Timeline menu bubble icon handlers
  const handleTimelineMenuBubbleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineMenuBubbleIcon(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineMenuBubbleIcon(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineMenuBubbleIcon(false);
    }
  };

  const handleRemoveTimelineMenuBubbleIcon = () => {
    setTimelineMenuBubbleIcon(null);
  };

  // Timeline menu default image handlers
  const handleTimelineMenuDefaultImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingTimelineMenuDefaultImage(true);

    try {
      const base64 = await fileToBase64(file);
      const compressedBase64 = await compressImage(base64);
      setTimelineMenuDefaultImage(compressedBase64);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingTimelineMenuDefaultImage(false);
    }
  };

  const handleRemoveTimelineMenuDefaultImage = () => {
    setTimelineMenuDefaultImage(null);
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <button className="back-button" onClick={onBack}>
          ← Zurück
        </button>
        <h2>Einstellungen</h2>
      </div>

      {isAdmin && (
        <div className="settings-tabs">
          <button
            className={`tab-button ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            Allgemein
          </button>
          <button
            className={`tab-button ${activeTab === 'lists' ? 'active' : ''}`}
            onClick={() => setActiveTab('lists')}
          >
            Listen & Kategorien
          </button>
          <button
            className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Benutzerverwaltung
          </button>
          <button
            className={`tab-button ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            KI-Einstellungen
          </button>
          <button
            className={`tab-button ${activeTab === 'faq' ? 'active' : ''}`}
            onClick={() => setActiveTab('faq')}
          >
            Kochschule
          </button>
        </div>
      )}

      <div className="settings-content">
        {activeTab === 'general' ? (
          <>
            <div className="settings-section">
              <h3>Header-Slogan</h3>
              <p className="section-description">
                Passen Sie den Slogan an, der im Header unter "DishBook" angezeigt wird.
              </p>
              <div className="list-input">
                <input
                  type="text"
                  value={headerSlogan}
                  onChange={(e) => setHeaderSlogan(e.target.value)}
                  placeholder="Header-Slogan eingeben..."
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Favicon</h3>
              <p className="section-description">
                Personalisieren Sie das Favicon (Browser-Tab-Symbol) und den Titel Ihrer DishBook-Instanz.
              </p>
              
              {/* Favicon Text */}
              <div className="favicon-text-section">
                <label htmlFor="faviconText">Favicon-Text (Browser-Tab-Titel):</label>
                <div className="list-input">
                  <input
                    type="text"
                    id="faviconText"
                    value={faviconText}
                    onChange={(e) => setFaviconText(e.target.value)}
                    placeholder="z.B. DishBook"
                    maxLength={50}
                  />
                </div>
                <p className="input-hint">Maximale Länge: 50 Zeichen</p>
              </div>

              {/* Favicon Image */}
              <div className="favicon-image-section">
                <label>Logo für Browser-Tab und Social-Media:</label>
                {faviconImage ? (
                  <div className="favicon-preview">
                    <img src={faviconImage} alt="Favicon" style={{ width: '32px', height: '32px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="faviconImageFile" className="favicon-change-btn">
                        {uploadingFavicon ? 'Hochladen...' : '🔄 Ändern'}
                      </label>
                      <button 
                        className="favicon-remove-btn" 
                        onClick={handleRemoveFavicon}
                        disabled={uploadingFavicon}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="faviconImageFile" className="image-upload-label">
                      {uploadingFavicon ? 'Hochladen...' : '📷 Logo hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="faviconImageFile"
                  accept="image/*"
                  onChange={handleFaviconUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingFavicon}
                />
                <p className="input-hint">
                  Unterstützte Formate: JPEG, PNG, GIF, WebP. Maximale Größe: 5MB. 
                  Empfohlene Größe: 32x32, 64x64 oder 512x512 Pixel (quadratisch).
                  Wird verwendet für Browser-Favicon und Social-Media-Vorschauen (OpenGraph, Twitter).
                </p>
              </div>

              {/* App Logo Image */}
              <div className="favicon-image-section">
                <label>App-Logo für Header und Apple Touch Icon:</label>
                {appLogoImage ? (
                  <div className="favicon-preview">
                    <img src={appLogoImage} alt="App Logo" style={{ width: '64px', height: '64px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="appLogoImageFile" className="favicon-change-btn">
                        {uploadingAppLogo ? 'Hochladen...' : '🔄 Ändern'}
                      </label>
                      <button 
                        className="favicon-remove-btn" 
                        onClick={handleRemoveAppLogo}
                        disabled={uploadingAppLogo}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="appLogoImageFile" className="image-upload-label">
                      {uploadingAppLogo ? 'Hochladen...' : '📷 App-Logo hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="appLogoImageFile"
                  accept="image/*"
                  onChange={handleAppLogoUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingAppLogo}
                />
                <p className="input-hint">
                  <strong>Empfohlen: PNG mit transparentem Hintergrund</strong> für optimale Darstellung auf allen Plattformen. 
                  Unterstützte Formate: JPEG, PNG, GIF, WebP. Maximale Größe: 5MB. 
                  Empfohlene Größe: 192x192 oder 512x512 Pixel (quadratisch).
                  Wird verwendet für App-Header-Logo, Apple Touch Icon und PWA-Installation.
                  <br />
                  <em>Hinweis: Bei PWA-Icons werden transparente Bereiche ggf. rund/abgerundet angezeigt. 
                  Vermeiden Sie zu große transparente Ränder für optimale Skalierung.</em>
                </p>
              </div>
            </div>

            <div className="settings-section">
              <h3>Button-Icons</h3>
              <p className="section-description">
                Wählen Sie Icons für verschiedene Buttons. Sie können entweder Emojis/Text eingeben oder eigene Bilder hochladen.
              </p>
              
              <div className="button-icons-config">
                <div className="button-icon-item">
                  <label htmlFor="cookingModeIcon">Kochmodus-Button (Rezeptdetailansicht):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.cookingMode) ? (
                      <>
                        <input
                          type="text"
                          id="cookingModeIcon"
                          value={buttonIcons.cookingMode}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, cookingMode: e.target.value })}
                          placeholder="z.B. 👨‍🍳"
                          maxLength={10}
                        />
                        <label htmlFor="cookingModeIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'cookingMode' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="cookingModeIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('cookingMode', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'cookingMode'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('cookingMode')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, cookingMode: DEFAULT_BUTTON_ICONS.cookingMode })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.cookingMode) ? (
                        <img src={buttonIcons.cookingMode} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.cookingMode}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="importRecipeIcon">Import-Button (Neues Rezept):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.importRecipe) ? (
                      <>
                        <input
                          type="text"
                          id="importRecipeIcon"
                          value={buttonIcons.importRecipe}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, importRecipe: e.target.value })}
                          placeholder="z.B. 📥"
                          maxLength={10}
                        />
                        <label htmlFor="importRecipeIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'importRecipe' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="importRecipeIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('importRecipe', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'importRecipe'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('importRecipe')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, importRecipe: DEFAULT_BUTTON_ICONS.importRecipe })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.importRecipe) ? (
                        <img src={buttonIcons.importRecipe} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.importRecipe}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="scanImageIcon">Bild-scannen-Button (Neues Rezept):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.scanImage) ? (
                      <>
                        <input
                          type="text"
                          id="scanImageIcon"
                          value={buttonIcons.scanImage}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, scanImage: e.target.value })}
                          placeholder="z.B. 📷"
                          maxLength={10}
                        />
                        <label htmlFor="scanImageIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'scanImage' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="scanImageIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('scanImage', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'scanImage'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('scanImage')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, scanImage: DEFAULT_BUTTON_ICONS.scanImage })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.scanImage) ? (
                        <img src={buttonIcons.scanImage} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.scanImage}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="webImportIcon">Webimport-Button (Neues Rezept):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.webImport) ? (
                      <>
                        <input
                          type="text"
                          id="webImportIcon"
                          value={buttonIcons.webImport}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, webImport: e.target.value })}
                          placeholder="z.B. 🌐"
                          maxLength={10}
                        />
                        <label htmlFor="webImportIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'webImport' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="webImportIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('webImport', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'webImport'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('webImport')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, webImport: DEFAULT_BUTTON_ICONS.webImport })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.webImport) ? (
                        <img src={buttonIcons.webImport} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.webImport}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="closeButtonIcon">Schließen-Button (Rezeptdetailansicht):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.closeButton) ? (
                      <>
                        <input
                          type="text"
                          id="closeButtonIcon"
                          value={buttonIcons.closeButton}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, closeButton: e.target.value })}
                          placeholder="z.B. ✕"
                          maxLength={10}
                        />
                        <label htmlFor="closeButtonIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'closeButton' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="closeButtonIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('closeButton', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'closeButton'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('closeButton')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, closeButton: DEFAULT_BUTTON_ICONS.closeButton })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.closeButton) ? (
                        <img src={buttonIcons.closeButton} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.closeButton}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="menuCloseButtonIcon">Schließen-Button (Menüdetailansicht):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.menuCloseButton) ? (
                      <>
                        <input
                          type="text"
                          id="menuCloseButtonIcon"
                          value={buttonIcons.menuCloseButton}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, menuCloseButton: e.target.value })}
                          placeholder="z.B. ✕"
                          maxLength={10}
                        />
                        <label htmlFor="menuCloseButtonIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'menuCloseButton' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="menuCloseButtonIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('menuCloseButton', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'menuCloseButton'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('menuCloseButton')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, menuCloseButton: DEFAULT_BUTTON_ICONS.menuCloseButton })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.menuCloseButton) ? (
                        <img src={buttonIcons.menuCloseButton} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.menuCloseButton}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="filterButtonIcon">Filter-Button (Rezeptübersicht):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.filterButton) ? (
                      <>
                        <input
                          type="text"
                          id="filterButtonIcon"
                          value={buttonIcons.filterButton}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, filterButton: e.target.value })}
                          placeholder="z.B. ⚙"
                          maxLength={10}
                        />
                        <label htmlFor="filterButtonIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'filterButton' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="filterButtonIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('filterButton', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'filterButton'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('filterButton')}
                          title="Bild entfernen"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, filterButton: DEFAULT_BUTTON_ICONS.filterButton })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.filterButton) ? (
                        <img src={buttonIcons.filterButton} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.filterButton}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="copyLinkIcon">Link-kopieren-Button (Rezept teilen):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.copyLink) ? (
                      <>
                        <input
                          type="text"
                          id="copyLinkIcon"
                          value={buttonIcons.copyLink}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, copyLink: e.target.value })}
                          placeholder="z.B. 📋"
                          maxLength={10}
                        />
                        <label htmlFor="copyLinkIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'copyLink' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="copyLinkIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('copyLink', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'copyLink'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('copyLink')}
                          title="Bild entfernen"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, copyLink: DEFAULT_BUTTON_ICONS.copyLink })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.copyLink) ? (
                        <img src={buttonIcons.copyLink} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.copyLink}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="nutritionEmptyIcon">Nährwert-Icon (leer, keine Werte gespeichert):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.nutritionEmpty) ? (
                      <>
                        <input
                          type="text"
                          id="nutritionEmptyIcon"
                          value={buttonIcons.nutritionEmpty}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, nutritionEmpty: e.target.value })}
                          placeholder="z.B. ➕"
                          maxLength={10}
                        />
                        <label htmlFor="nutritionEmptyIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'nutritionEmpty' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="nutritionEmptyIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('nutritionEmpty', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'nutritionEmpty'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('nutritionEmpty')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, nutritionEmpty: DEFAULT_BUTTON_ICONS.nutritionEmpty })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.nutritionEmpty) ? (
                        <img src={buttonIcons.nutritionEmpty} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.nutritionEmpty}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>

                <div className="button-icon-item">
                  <label htmlFor="nutritionFilledIcon">Nährwert-Icon (gefüllt, Werte gespeichert):</label>
                  <div className="button-icon-input-group">
                    {!isBase64Image(buttonIcons.nutritionFilled) ? (
                      <>
                        <input
                          type="text"
                          id="nutritionFilledIcon"
                          value={buttonIcons.nutritionFilled}
                          onChange={(e) => setButtonIcons({ ...buttonIcons, nutritionFilled: e.target.value })}
                          placeholder="z.B. 🥦"
                          maxLength={10}
                        />
                        <label htmlFor="nutritionFilledIconFile" className="upload-icon-btn" title="Bild hochladen">
                          {uploadingButtonIcon === 'nutritionFilled' ? '⏳' : '📷'}
                        </label>
                        <input
                          type="file"
                          id="nutritionFilledIconFile"
                          accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                          onChange={(e) => handleButtonIconImageUpload('nutritionFilled', e)}
                          style={{ display: 'none' }}
                          disabled={uploadingButtonIcon === 'nutritionFilled'}
                        />
                      </>
                    ) : (
                      <>
                        <div className="icon-image-info">Bild hochgeladen</div>
                        <button
                          type="button"
                          className="remove-icon-btn"
                          onClick={() => handleRemoveButtonIconImage('nutritionFilled')}
                          title="Bild entfernen"
                        >
                          ✕ Entfernen
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="reset-icon-btn"
                      onClick={() => setButtonIcons({ ...buttonIcons, nutritionFilled: DEFAULT_BUTTON_ICONS.nutritionFilled })}
                      title="Auf Standard zurücksetzen"
                    >
                      ↻
                    </button>
                    <div className="icon-preview">
                      {isBase64Image(buttonIcons.nutritionFilled) ? (
                        <img src={buttonIcons.nutritionFilled} alt="Icon" className="icon-image" />
                      ) : (
                        <span>{buttonIcons.nutritionFilled}</span>
                      )}
                    </div>
                  </div>
                  <p className="input-hint">Emoji, kurzer Text (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5MB)</p>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Zeitleisten-Bubble-Icon (Rezepte)</h3>
              <p className="section-description">
                Optionales Icon, das in den orangen Bubbles der Zeitleiste für Rezepte angezeigt wird.
                Unterstützte Formate: JPEG, PNG, SVG. Empfohlen: quadratisches Bild.
              </p>
              <div className="favicon-image-section">
                {timelineBubbleIcon ? (
                  <div className="favicon-preview">
                    <img src={timelineBubbleIcon} alt="Zeitleisten-Icon" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'contain' }} />
                    <div className="favicon-actions">
                      <label htmlFor="timelineBubbleIconFile" className="favicon-change-btn">
                        {uploadingTimelineBubbleIcon ? 'Hochladen...' : '🔄 Ändern'}
                      </label>
                      <button
                        className="favicon-remove-btn"
                        onClick={handleRemoveTimelineBubbleIcon}
                        disabled={uploadingTimelineBubbleIcon}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="timelineBubbleIconFile" className="image-upload-label">
                      {uploadingTimelineBubbleIcon ? 'Hochladen...' : '📷 Icon hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="timelineBubbleIconFile"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleTimelineBubbleIconUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingTimelineBubbleIcon}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Zeitleisten-Bubble-Icon (Menüs)</h3>
              <p className="section-description">
                Optionales Icon, das in den Bubbles der Zeitleiste für Menüs angezeigt wird.
                Unterstützte Formate: JPEG, PNG, SVG. Empfohlen: quadratisches Bild.
              </p>
              <div className="favicon-image-section">
                {timelineMenuBubbleIcon ? (
                  <div className="favicon-preview">
                    <img src={timelineMenuBubbleIcon} alt="Menü-Zeitleisten-Icon" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'contain' }} />
                    <div className="favicon-actions">
                      <label htmlFor="timelineMenuBubbleIconFile" className="favicon-change-btn">
                        {uploadingTimelineMenuBubbleIcon ? 'Hochladen...' : '🔄 Ändern'}
                      </label>
                      <button
                        className="favicon-remove-btn"
                        onClick={handleRemoveTimelineMenuBubbleIcon}
                        disabled={uploadingTimelineMenuBubbleIcon}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="timelineMenuBubbleIconFile" className="image-upload-label">
                      {uploadingTimelineMenuBubbleIcon ? 'Hochladen...' : '📷 Icon hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="timelineMenuBubbleIconFile"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleTimelineMenuBubbleIconUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingTimelineMenuBubbleIcon}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Standardbild für Menüs in der Zeitleiste</h3>
              <p className="section-description">
                Dieses Bild wird ausschließlich für Menükarten in der Zeitleiste verwendet.
                Es wird nicht in der normalen Menüübersicht angezeigt.
                Unterstützte Formate: JPEG, PNG, WebP. Empfohlen: 16:9 oder quadratisches Format.
              </p>
              <div className="favicon-image-section">
                {timelineMenuDefaultImage ? (
                  <div className="favicon-preview">
                    <img src={timelineMenuDefaultImage} alt="Standardbild Menüs" style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div className="favicon-actions">
                      <label htmlFor="timelineMenuDefaultImageFile" className="favicon-change-btn">
                        {uploadingTimelineMenuDefaultImage ? 'Hochladen...' : '🔄 Ändern'}
                      </label>
                      <button
                        className="favicon-remove-btn"
                        onClick={handleRemoveTimelineMenuDefaultImage}
                        disabled={uploadingTimelineMenuDefaultImage}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="favicon-upload">
                    <label htmlFor="timelineMenuDefaultImageFile" className="image-upload-label">
                      {uploadingTimelineMenuDefaultImage ? 'Hochladen...' : '📷 Standardbild hochladen'}
                    </label>
                  </div>
                )}
                <input
                  type="file"
                  id="timelineMenuDefaultImageFile"
                  accept="image/*"
                  onChange={handleTimelineMenuDefaultImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingTimelineMenuDefaultImage}
                />
              </div>
            </div>

            <div className="settings-section">
              <h3>Kategoriebilder</h3>
              <p className="section-description">
                Laden Sie Bilder hoch und verknüpfen Sie diese mit Speisekategorien. 
                Diese Bilder werden als Platzhalter verwendet, wenn ein Rezept ohne Titelbild gespeichert wird.
                Jede Kategorie kann nur einem Bild zugeordnet werden.
              </p>
              
              {/* Upload new image section */}
              {!editingImageId && (
                <div className="category-image-upload">
                  <div className="category-selection">
                    <label>Wählen Sie Speisekategorien für das neue Bild:</label>
                    <div className="category-checkboxes">
                      {lists.mealCategories.map(category => {
                        const isAssigned = categoryImages.some(img => img.categories.includes(category));
                        const isSelected = selectedCategories.includes(category);
                        return (
                          <label 
                            key={category} 
                            className={`category-checkbox ${isAssigned && !isSelected ? 'disabled' : ''}`}
                            title={isAssigned && !isSelected ? 'Diese Kategorie ist bereits einem Bild zugeordnet' : ''}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleCategoryToggle(category)}
                              disabled={isAssigned && !isSelected}
                            />
                            <span>{category}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="image-upload-button-container">
                    <label htmlFor="categoryImageFile" className="image-upload-label">
                      {uploadingImage ? 'Hochladen...' : '📷 Neues Bild hochladen'}
                    </label>
                    <input
                      type="file"
                      id="categoryImageFile"
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                      disabled={uploadingImage || selectedCategories.length === 0}
                    />
                    {selectedCategories.length === 0 && (
                      <p className="upload-hint">Bitte wählen Sie mindestens eine Kategorie aus.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Existing images */}
              <div className="category-images-list">
                {categoryImages.map(img => (
                  <div key={img.id} className="category-image-item">
                    <div className="category-image-preview">
                      <img src={img.image} alt="Category" />
                      {editingImageId !== img.id && (
                        <button
                          className="category-image-remove-icon"
                          onClick={() => handleRemoveCategoryImage(img.id)}
                          title="Bild entfernen"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    {editingImageId === img.id ? (
                      <div className="category-image-edit">
                        <div className="category-selection">
                          <label>Kategorien bearbeiten:</label>
                          <div className="category-checkboxes">
                            {lists.mealCategories.map(category => {
                              const isAssignedToOther = categoryImages.some(
                                otherImg => otherImg.id !== img.id && otherImg.categories.includes(category)
                              );
                              const isSelected = selectedCategories.includes(category);
                              return (
                                <label 
                                  key={category} 
                                  className={`category-checkbox ${isAssignedToOther ? 'disabled' : ''}`}
                                  title={isAssignedToOther ? 'Diese Kategorie ist bereits einem anderen Bild zugeordnet' : ''}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleCategoryToggle(category)}
                                    disabled={isAssignedToOther}
                                  />
                                  <span>{category}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        <div className="category-image-actions">
                          <button 
                            className="save-categories-btn" 
                            onClick={handleSaveImageCategories}
                            disabled={selectedCategories.length === 0}
                          >
                            ✓ Speichern
                          </button>
                          <button 
                            className="cancel-edit-btn" 
                            onClick={handleCancelEditCategories}
                          >
                            ✕ Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="category-image-info">
                        <div className="category-image-categories">
                          {img.categories.length > 0 ? (
                            img.categories.map(cat => (
                              <span key={cat} className="category-badge">{cat}</span>
                            ))
                          ) : (
                            <span className="no-categories">Keine Kategorien zugeordnet</span>
                          )}
                        </div>
                        <div className="category-image-actions">
                          <button 
                            className="edit-categories-btn" 
                            onClick={() => handleEditImageCategories(img.id)}
                            title="Kategorien bearbeiten"
                          >
                            ✏️ Bearbeiten
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="settings-actions">
              <button className="save-button" onClick={handleSave}>
                Einstellungen speichern
              </button>
            </div>
          </>
        ) : activeTab === 'lists' ? (
          <>
            <div className="settings-section">
          <h3>Kulinarik-Typen</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCuisine()}
              placeholder="Neuen Kulinarik-Typ hinzufügen..."
            />
            <button onClick={addCuisine}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCuisineTypes}>
            <SortableContext items={lists.cuisineTypes} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.cuisineTypes.map((cuisine) => (
                  <SortableListItem key={cuisine} id={cuisine} label={cuisine} onRemove={() => removeCuisine(cuisine)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Speisekategorien</h3>
          <div className="list-input">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Neue Speisekategorie hinzufügen..."
            />
            <button onClick={addCategory}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndMealCategories}>
            <SortableContext items={lists.mealCategories} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.mealCategories.map((category) => (
                  <SortableListItem key={category} id={category} label={category} onRemove={() => removeCategory(category)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Maßeinheiten</h3>
          <div className="list-input">
            <input
              type="text"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addUnit()}
              placeholder="Neue Einheit hinzufügen..."
            />
            <button onClick={addUnit}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndUnits}>
            <SortableContext items={lists.units} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.units.map((unit) => (
                  <SortableListItem key={unit} id={unit} label={unit} onRemove={() => removeUnit(unit)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-section">
          <h3>Portionseinheiten</h3>
          <p className="section-description">
            Definieren Sie benutzerdefinierte Portionseinheiten mit Singular- und Pluralformen (z.B. Pizza/Pizzen, Drink/Drinks).
          </p>
          <div className="list-input portion-unit-input">
            <input
              type="text"
              value={newPortionSingular}
              onChange={(e) => setNewPortionSingular(e.target.value)}
              placeholder="Singular (z.B. Pizza)"
            />
            <input
              type="text"
              value={newPortionPlural}
              onChange={(e) => setNewPortionPlural(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addPortionUnit()}
              placeholder="Plural (z.B. Pizzen)"
            />
            <button onClick={addPortionUnit}>Hinzufügen</button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPortionUnits}>
            <SortableContext items={lists.portionUnits.map(u => u.id)} strategy={verticalListSortingStrategy}>
              <div className="list-items">
                {lists.portionUnits.map((unit) => (
                  <SortablePortionUnitItem key={unit.id} id={unit.id} unit={unit} onRemove={() => removePortionUnit(unit.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="settings-actions">
          <button className="reset-button" onClick={handleReset}>
            Auf Standard zurücksetzen
          </button>
          <button className="save-button" onClick={handleSave}>
            Einstellungen speichern
          </button>
        </div>
      </>
        ) : activeTab === 'ai' ? (
          <>
            <div className="settings-section">
              <h3>KI-Rezepterkennung (Prompt)</h3>
              <p className="prompt-help-text">
                Dieser Prompt wird für die KI-Rezepterkennung (Fotoscan &amp; Web-Import) verwendet. Änderungen werden sofort aktiv.
              </p>
              <textarea
                className="ai-prompt-textarea"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={15}
              />
              <div className="prompt-actions">
                <button
                  className="save-button"
                  onClick={async () => {
                    try {
                      await saveAIRecipePrompt(aiPrompt);
                      alert('KI-Prompt erfolgreich gespeichert!');
                    } catch (e) {
                      alert('Fehler beim Speichern: ' + e.message);
                    }
                  }}
                >
                  Speichern
                </button>
                <button
                  className="reset-button"
                  onClick={async () => {
                    if (window.confirm('Möchten Sie den KI-Prompt wirklich auf den Standard zurücksetzen?')) {
                      try {
                        const defaultPrompt = await resetAIRecipePrompt();
                        setAiPrompt(defaultPrompt);
                        alert('KI-Prompt auf Standard zurückgesetzt!');
                      } catch (e) {
                        alert('Fehler beim Zurücksetzen: ' + e.message);
                      }
                    }
                  }}
                >
                  Auf Standard zurücksetzen
                </button>
              </div>
            </div>
          </>
        ) : activeTab === 'faq' ? (
          <>
            <div className="settings-section">
              <h3>Kochschule-Einträge</h3>
              <p className="section-description">
                Hier kannst du Kochschule-Einträge anlegen und pflegen. Einträge können optional als „nur für Administratoren sichtbar" markiert werden.
              </p>

              {/* FAQ Import aus FAQ.md */}
              <div className="faq-import-section">
                <h4>FAQ aus FAQ.md importieren</h4>
                <p className="section-description">
                  Importiert alle Einträge aus der <code>FAQ.md</code>-Datei automatisch als FAQ-Einträge. Bereits vorhandene Einträge werden nicht gelöscht.
                </p>
                <button
                  className="save-button"
                  onClick={handleImportFaqFromMd}
                  disabled={importingFaq}
                >
                  {importingFaq ? 'Importiere...' : '📥 FAQ.md importieren'}
                </button>
              </div>

              {/* FAQ form */}
              <div className="faq-form">
                <h4>{editingFaqId ? 'Kochschule-Eintrag bearbeiten' : 'Neuen Kochschule-Eintrag hinzufügen'}</h4>
                <div className="list-input">
                  <input
                    type="text"
                    placeholder="Titel (z.B. Wie lege ich ein neues Rezept an?)"
                    value={faqForm.title}
                    onChange={(e) => setFaqForm(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="list-input">
                  <textarea
                    className="faq-description-input"
                    placeholder="Beschreibung – locker und verständlich formuliert (z.B. Klick auf das große Plus rechts unten und fülle die Felder aus. Fertig!)"
                    value={faqForm.description}
                    rows={4}
                    onChange={(e) => setFaqForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="faq-level-select">
                  <label htmlFor="faqLevelSelect">Ebene:</label>
                  <select
                    id="faqLevelSelect"
                    value={faqForm.level ?? 1}
                    onChange={(e) => setFaqForm(prev => ({ ...prev, level: Number(e.target.value) }))}
                  >
                    <option value={0}>0 – Abschnittsüberschrift</option>
                    <option value={1}>1 – Frage/Antwort</option>
                    <option value={2}>2 – Eingerückt</option>
                  </select>
                </div>
                <div className="faq-admin-only-section">
                  <label className="faq-admin-only-label">
                    <input
                      type="checkbox"
                      checked={faqForm.adminOnly ?? false}
                      onChange={(e) => setFaqForm(prev => ({ ...prev, adminOnly: e.target.checked }))}
                    />
                    Nur für Administratoren sichtbar
                  </label>
                </div>
                <div className="faq-screenshot-section">
                  <label>Screenshot (optional):</label>
                  {faqForm.screenshot ? (
                    <div className="faq-screenshot-preview">
                      <img src={faqForm.screenshot} alt="Screenshot" className="faq-screenshot-img" />
                      <button
                        type="button"
                        className="favicon-remove-btn"
                        onClick={() => setFaqForm(prev => ({ ...prev, screenshot: null }))}
                      >
                        ✕ Entfernen
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="faqScreenshotFile" className="image-upload-label">
                      {uploadingFaqScreenshot ? 'Hochladen...' : '📷 Screenshot hochladen'}
                    </label>
                  )}
                  <input
                    type="file"
                    id="faqScreenshotFile"
                    accept="image/*"
                    onChange={handleFaqScreenshotUpload}
                    style={{ display: 'none' }}
                    disabled={uploadingFaqScreenshot}
                  />
                </div>
                <div className="faq-form-actions">
                  <button
                    className="save-button"
                    onClick={handleSaveFaq}
                    disabled={savingFaq}
                  >
                    {savingFaq ? 'Speichern...' : editingFaqId ? 'Kochschule-Eintrag aktualisieren' : 'Kochschule-Eintrag hinzufügen'}
                  </button>
                  {editingFaqId && (
                    <button className="reset-button" onClick={handleCancelFaqEdit}>
                      Abbrechen
                    </button>
                  )}
                </div>
              </div>

              {/* FAQ list */}
              {faqs.length === 0 ? (
                <p className="section-description">Noch keine Kochschule-Einträge vorhanden. Füge oben den ersten Eintrag hinzu!</p>
              ) : (
                <>
                  {faqSelectedIds.length > 0 && (
                    <div className="faq-indent-toolbar">
                      <span className="faq-indent-toolbar-label">{faqSelectedIds.length} ausgewählt:</span>
                      <button
                        className="faq-indent-btn"
                        onClick={() => handleFaqIndent(-1)}
                        title="Ausrücken"
                      >
                        ← Ausrücken
                      </button>
                      <button
                        className="faq-indent-btn"
                        onClick={() => handleFaqIndent(1)}
                        title="Einrücken"
                      >
                        Einrücken →
                      </button>
                    </div>
                  )}
                  <div className="faq-list">
                    {faqs.map((faq) => {
                      const isSelected = faqSelectedIds.includes(faq.id);
                      return (
                        <div
                          key={faq.id}
                          className={`faq-list-item${faq.level === 0 ? ' faq-list-item--heading' : ''}${faq.level > 1 ? ' faq-list-item--indented' : ''}${isSelected ? ' faq-list-item--selected' : ''}`}
                        >
                          <div className="faq-list-item-header">
                            <input
                              type="checkbox"
                              className="faq-list-item-checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFaqSelectedIds(prev => [...prev, faq.id]);
                                } else {
                                  setFaqSelectedIds(prev => prev.filter(id => id !== faq.id));
                                }
                              }}
                              aria-label="Auswählen"
                            />
                            <strong className="faq-list-item-title">{renderBoldText(faq.title)}</strong>
                            <span className="faq-list-item-level">Ebene {faq.level ?? 1}</span>
                            {faq.adminOnly && (
                              <span className="faq-admin-badge" title="Nur für Administratoren sichtbar">🔒 Admin</span>
                            )}
                            <div className="faq-list-item-actions">
                              <button
                                className="faq-edit-btn"
                                onClick={() => handleEditFaq(faq)}
                                title="Bearbeiten"
                              >
                                ✏️
                              </button>
                              <button
                                className="faq-delete-btn"
                                onClick={() => handleDeleteFaq(faq.id)}
                                title="Löschen"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                          {faq.description && (
                            <p className="faq-list-item-description">{renderBoldText(faq.description)}</p>
                          )}
                          {faq.screenshot && (
                            <img src={faq.screenshot} alt="Screenshot" className="faq-list-screenshot" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <UserManagement onBack={() => setActiveTab('general')} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

export default Settings;
