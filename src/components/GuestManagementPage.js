import React, { useState, useEffect, useMemo } from 'react';
import './EventsPage.css';
import OverviewAddFab from './OverviewAddFab';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import useUndoableDelete from '../hooks/useUndoableDelete';
import {
  subscribeToGuestProfiles,
  subscribeToAllGuestProfiles,
  saveGuestProfile,
  deleteGuestProfile,
  subscribeToAllCustomDrinks,
} from '../utils/eventsFirestore';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import { getGuestDisplayName, normalizePreferenceFactor } from '../utils/guestPreferences';
import { DRINK_CATEGORIES, getDrinkCategoryLabel } from '../utils/drinkCategories';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';

const emptyForm = () => ({
  vorname: '',
  nachname: '',
  email: '',
  kind: false,
  alkoholischeGetraenke: true,
  bevorzugteGetraenke: [],
  bevorzugteKategorien: [],
  praeferenzFaktor: 0.5,
});

const getPreferenceLabel = (factor) => {
  if (factor === 1) return 'trinkt nur diese Getränke';
  if (factor === 0.75) return 'trinkt vorwiegend diese Getränke';
  if (factor === 0.5) return 'trinkt diese Getränke gerne';
  if (factor === 0.25) return 'mag diese Getränke';
  return 'wird nicht berücksichtigt';
};

// Matches the "Zutat löschen" swipe-to-delete gesture from the recipe edit page
// (see SortableIngredient in RecipeForm.js): swiping left reveals the delete
// button on the right. On desktop the static button next to the card stays
// visible instead (no touch events to trigger the swipe).
const SWIPE_DELETE_THRESHOLD = 56;
const SWIPE_DELETE_MAX_OFFSET = 96;
const SWIPE_DIRECTION_LOCK_THRESHOLD = 6;

function GuestCard({ fullName, deleteIcon, onOpenEdit, onDelete, children }) {
  const touchStartXRef = React.useRef(null);
  const touchStartYRef = React.useRef(null);
  const swipeDirectionLockedRef = React.useRef(null);
  const isSwipingRef = React.useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDeleteActionVisible, setIsDeleteActionVisible] = useState(false);

  const effectiveSwipeOffset = isDeleteActionVisible ? -SWIPE_DELETE_MAX_OFFSET : swipeOffset;
  const deleteLabel = `${fullName || 'Gast'} löschen`;

  const resetSwipe = ({ keepDeleteAction = false } = {}) => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
    setSwipeOffset(0);
    if (!keepDeleteAction) setIsDeleteActionVisible(false);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    if (isDeleteActionVisible) setIsDeleteActionVisible(false);
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    swipeDirectionLockedRef.current = null;
    isSwipingRef.current = false;
  };

  const handleTouchMove = (e) => {
    const touch = e.touches?.[0];
    if (!touch || touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!swipeDirectionLockedRef.current && (absX > SWIPE_DIRECTION_LOCK_THRESHOLD || absY > SWIPE_DIRECTION_LOCK_THRESHOLD)) {
      swipeDirectionLockedRef.current = absX > absY ? 'horizontal' : 'vertical';
    }

    if (swipeDirectionLockedRef.current === 'horizontal' && deltaX < 0) {
      isSwipingRef.current = true;
      setSwipeOffset(Math.max(deltaX, -SWIPE_DELETE_MAX_OFFSET));
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingRef.current && Math.abs(swipeOffset) >= SWIPE_DELETE_THRESHOLD) {
      setIsDeleteActionVisible(true);
      resetSwipe({ keepDeleteAction: true });
      return;
    }
    resetSwipe();
  };

  const handleContentClick = () => {
    if (isDeleteActionVisible) {
      resetSwipe();
      return;
    }
    onOpenEdit();
  };

  const handleSwipeDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
    resetSwipe();
  };

  return (
    <div className={`events-card events-guest-card${isDeleteActionVisible ? ' swipe-delete-active' : ''}`}>
      <div className="swipe-delete-background" aria-hidden={!isDeleteActionVisible && effectiveSwipeOffset === 0}>
        <button
          type="button"
          className="swipe-delete-action"
          onClick={handleSwipeDeleteClick}
          aria-label={deleteLabel}
          tabIndex={isDeleteActionVisible ? 0 : -1}
        >
          {isBase64Image(deleteIcon) ? (
            <img src={deleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
          ) : (
            <span className="swipe-delete-icon-text">{deleteIcon}</span>
          )}
        </button>
      </div>
      <div
        className="events-guest-card-content delete-row-hover-target"
        style={{ transform: `translateX(${effectiveSwipeOffset}px)`, transition: 'transform 0.15s ease' }}
        onClick={handleContentClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => resetSwipe()}
      >
        {children}
        <DeleteRowButton
          className="events-guest-delete-btn"
          itemName={fullName || 'Gast'}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}

function GuestManagementPage({ onBack, currentUser, recipes }) {
  const [profiles, setProfiles] = useState([]);
  const [customDrinks, setCustomDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editOwnerId, setEditOwnerId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [drinkToAdd, setDrinkToAdd] = useState('');
  const [categoryToAdd, setCategoryToAdd] = useState('');
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const formRef = React.useRef(null);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  const canManageGuests = canEditRecipes(currentUser);
  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode) || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode);

  // Admin: always browse all users' guest profiles instead of just the current user's own.
  const isAdmin = currentUser?.isAdmin === true;
  const [allProfiles, setAllProfiles] = useState([]);
  const [allProfilesLoading, setAllProfilesLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    getUsers().then(setAllUsers).catch(() => setAllUsers([]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const unsubscribe = subscribeToAllGuestProfiles((loaded) => {
      setAllProfiles(loaded);
      setAllProfilesLoading(false);
    });
    return unsubscribe;
  }, [isAdmin]);

  const getOwnerFirstName = (ownerId) => {
    if (!ownerId) return null;
    return allUsers.find((u) => u.id === ownerId)?.vorname || null;
  };

  useEffect(() => {
    const loadIcons = async () => {
      const icons = await getButtonIcons();
      setButtonIcons(icons);
    };
    loadIcons();
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubscribeProfiles = subscribeToGuestProfiles(currentUser.id, (loaded) => {
      setProfiles(loaded);
      setLoading(false);
    });
    const unsubscribeDrinks = subscribeToAllCustomDrinks(setCustomDrinks);
    return () => {
      unsubscribeProfiles();
      unsubscribeDrinks();
    };
  }, [currentUser?.id]);

  const availableDrinks = useMemo(() => {
    // Predefined drinks can be overridden per-owner but share the same fixed
    // id, so when drinks from multiple owners are present, only keep the
    // current user's own entry for a given id to avoid duplicate options.
    const byId = new Map();
    customDrinks.forEach((drink) => {
      if (!byId.has(drink.id) || drink.ownerId === currentUser?.id) byId.set(drink.id, drink);
    });
    return [...byId.values()].map((drink) => ({ id: drink.id, label: resolveDrinkDisplay(drink, recipes).displayName || drink.id }));
  }, [customDrinks, recipes, currentUser?.id]);

  const sortByName = (list) => {
    return [...list].sort((a, b) => {
      const nachnameDiff = (a.nachname || '').localeCompare(b.nachname || '', 'de', { sensitivity: 'base' });
      if (nachnameDiff !== 0) return nachnameDiff;
      return (a.vorname || '').localeCompare(b.vorname || '', 'de', { sensitivity: 'base' });
    });
  };

  const sortedProfiles = useMemo(() => sortByName(profiles), [profiles]);
  const sortedAllProfiles = useMemo(() => sortByName(allProfiles), [allProfiles]);

  const openNew = () => {
    setEditId(null);
    setEditOwnerId(null);
    setForm(emptyForm());
    setDrinkToAdd('');
    setCategoryToAdd('');
    setError('');
    setShowForm(true);
  };

  const openEdit = (profile) => {
    setEditId(profile.id);
    setEditOwnerId(profile.ownerId || null);
    setForm({
      vorname: profile.vorname || '',
      nachname: profile.nachname || '',
      email: profile.email || '',
      kind: profile.kind === true,
      alkoholischeGetraenke: profile.alkoholischeGetränke !== false,
      bevorzugteGetraenke: Array.isArray(profile.bevorzugteGetränke) ? profile.bevorzugteGetränke : [],
      bevorzugteKategorien: Array.isArray(profile.bevorzugteKategorien) ? profile.bevorzugteKategorien : [],
      praeferenzFaktor: normalizePreferenceFactor(profile.präferenzFaktor),
    });
    setDrinkToAdd('');
    setCategoryToAdd('');
    setError('');
    setShowForm(true);
  };

  const togglePreferredDrink = (drinkId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.bevorzugteGetraenke) ? prev.bevorzugteGetraenke : [];
      const next = current.includes(drinkId)
        ? current.filter((id) => id !== drinkId)
        : [...current, drinkId];
      return { ...prev, bevorzugteGetraenke: next };
    });
  };

  const togglePreferredCategory = (categoryId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.bevorzugteKategorien) ? prev.bevorzugteKategorien : [];
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];
      return { ...prev, bevorzugteKategorien: next };
    });
  };

  const validateEmail = (email) => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canManageGuests) {
      setError('Du hast keine Berechtigung, Gäste zu verwalten.');
      return;
    }
    if (!form.vorname.trim() || !form.nachname.trim()) {
      setError('Bitte Vorname und Nachname angeben.');
      return;
    }
    if (!validateEmail(form.email.trim())) {
      setError('Bitte eine gültige E-Mail-Adresse angeben.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        vorname: form.vorname.trim(),
        nachname: form.nachname.trim(),
        email: form.email.trim(),
        kind: form.kind === true,
        alkoholischeGetränke: form.alkoholischeGetraenke,
        bevorzugteGetränke: form.bevorzugteGetraenke,
        bevorzugteKategorien: form.bevorzugteKategorien,
        präferenzFaktor: normalizePreferenceFactor(form.praeferenzFaktor),
      };
      // Admin editing another user's guest: pass their ownerId through so the
      // manageGuestProfile Cloud Function writes to the right owner's profiles.
      if (editId && editOwnerId && editOwnerId !== currentUser.id) {
        await saveGuestProfile(currentUser.id, payload, editId, editOwnerId);
      } else {
        await saveGuestProfile(currentUser.id, payload, editId || undefined);
      }
      setShowForm(false);
    } catch (err) {
      console.error('Error saving guest profile:', err);
      setError('Das Gästeprofil konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setSaving(false);
    }
  };

  const { notifyDeleted, undo, pendingName } = useUndoableDelete();

  const handleDelete = async (profile) => {
    if (!canManageGuests) return;
    const name = getGuestDisplayName(profile) || 'diesen Gast';
    try {
      // Admin deleting another user's guest: pass their ownerId through.
      if (profile.ownerId && profile.ownerId !== currentUser.id) {
        await deleteGuestProfile(currentUser.id, profile.id, profile.ownerId);
      } else {
        await deleteGuestProfile(currentUser.id, profile.id);
      }
    } catch (err) {
      console.error('Error deleting guest profile:', err);
      return;
    }
    notifyDeleted({
      id: `${profile.ownerId || ''}_${profile.id}`,
      name,
      undo: async () => {
        // eslint-disable-next-line no-unused-vars
        const { id, ownerId, ...payload } = profile;
        try {
          if (profile.ownerId && profile.ownerId !== currentUser.id) {
            await saveGuestProfile(currentUser.id, payload, profile.id, profile.ownerId);
          } else {
            await saveGuestProfile(currentUser.id, payload, profile.id);
          }
        } catch (err) {
          console.error('Error restoring guest profile:', err);
        }
      },
    });
  };

  const handleFabClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (formRef.current) {
      if (typeof formRef.current.requestSubmit === 'function') {
        formRef.current.requestSubmit();
      } else {
        formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  };

  if (!canManageGuests) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>Gäste verwalten</h2>
          {onBack && (
            <button
              className="app-close-button"
              onClick={onBack}
              aria-label="Gäste verwalten schließen"
              title="Gäste verwalten schließen"
            >
              {isBase64Image(closeIcon) ? (
                <img src={closeIcon} alt="Gäste verwalten schließen" className="app-close-button-icon-img" />
              ) : (
                closeIcon || '×'
              )}
            </button>
          )}
        </div>
        <div className="events-empty-state">
          Nur Benutzer mit der Rolle „edit“ oder höher können Gäste verwalten.
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{editId ? 'Gast bearbeiten' : 'Neuen Gast erfassen'}</h2>
        </div>
        <form className="events-form" onSubmit={handleSave} ref={formRef}>
          <div className="events-form-row">
            <label className="events-form-field">
              <span>Vorname</span>
              <input
                type="text"
                value={form.vorname}
                onChange={(e) => setForm((f) => ({ ...f, vorname: e.target.value }))}
                required
              />
            </label>
            <label className="events-form-field">
              <span>Nachname</span>
              <input
                type="text"
                value={form.nachname}
                onChange={(e) => setForm((f) => ({ ...f, nachname: e.target.value }))}
                required
              />
            </label>
          </div>

          <label className="events-form-field">
            <span>E-Mail (optional)</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@beispiel.de"
            />
          </label>

          <label className="events-category-checkbox">
            <input
              type="checkbox"
              role="switch"
              checked={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.checked }))}
            />
            <span>Kind</span>
          </label>

          <label className="events-category-checkbox">
            <input
              type="checkbox"
              role="switch"
              checked={form.alkoholischeGetraenke}
              onChange={(e) => setForm((f) => ({ ...f, alkoholischeGetraenke: e.target.checked }))}
            />
            <span>Alkoholische Getränke</span>
          </label>

          <div className="events-form-field">
            <span>Bevorzugte Getränke</span>
            {form.bevorzugteGetraenke.length > 0 && (
              <div className="events-preferred-drinks-list">
                {form.bevorzugteGetraenke.map((drinkId) => {
                  const drink = availableDrinks.find((d) => d.id === drinkId);
                  return (
                    <span key={drinkId} className="events-drink-chip">
                      {drink ? drink.label : drinkId}
                      <button
                        type="button"
                        className="events-drink-chip-remove"
                        onClick={() => togglePreferredDrink(drinkId)}
                        aria-label={`${drink ? drink.label : drinkId} entfernen`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="events-drink-selector">
              <select
                value={drinkToAdd}
                onChange={(e) => setDrinkToAdd(e.target.value)}
                aria-label="Getränk auswählen"
              >
                <option value="">Getränk auswählen …</option>
                {availableDrinks
                  .filter((d) => !form.bevorzugteGetraenke.includes(d.id))
                  .map((drink) => (
                    <option key={drink.id} value={drink.id}>{drink.label}</option>
                  ))}
              </select>
              <button
                type="button"
                className="events-secondary-btn"
                onClick={() => {
                  if (drinkToAdd) {
                    togglePreferredDrink(drinkToAdd);
                    setDrinkToAdd('');
                  }
                }}
                disabled={!drinkToAdd}
              >
                Hinzufügen
              </button>
            </div>
          </div>

          <div className="events-form-field">
            <span>Bevorzugte Getränkekategorien</span>
            {form.bevorzugteKategorien.length > 0 && (
              <div className="events-preferred-drinks-list">
                {form.bevorzugteKategorien.map((catId) => (
                  <span key={catId} className="events-drink-chip">
                    {getDrinkCategoryLabel(catId)}
                    <button
                      type="button"
                      className="events-drink-chip-remove"
                      onClick={() => togglePreferredCategory(catId)}
                      aria-label={`${getDrinkCategoryLabel(catId)} entfernen`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="events-drink-selector">
              <select
                value={categoryToAdd}
                onChange={(e) => setCategoryToAdd(e.target.value)}
                aria-label="Getränkekategorie auswählen"
              >
                <option value="">Kategorie auswählen …</option>
                {DRINK_CATEGORIES.map((cat) =>
                  cat.subcategories ? (
                    <optgroup key={cat.id} label={cat.label}>
                      {!form.bevorzugteKategorien.includes(cat.id) && (
                        <option value={cat.id}>{cat.label}</option>
                      )}
                      {cat.subcategories
                        .filter((sub) => !form.bevorzugteKategorien.includes(sub.id))
                        .map((sub) => (
                          <option key={sub.id} value={sub.id}>{sub.label}</option>
                        ))}
                    </optgroup>
                  ) : (
                    !form.bevorzugteKategorien.includes(cat.id) && (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    )
                  )
                )}
              </select>
              <button
                type="button"
                className="events-secondary-btn"
                onClick={() => {
                  if (categoryToAdd) {
                    togglePreferredCategory(categoryToAdd);
                    setCategoryToAdd('');
                  }
                }}
                disabled={!categoryToAdd}
              >
                Hinzufügen
              </button>
            </div>
          </div>

          <label className="events-form-field">
            <span>Präferenzfaktor: {Number(form.praeferenzFaktor).toFixed(2)} ({getPreferenceLabel(Number(form.praeferenzFaktor))})</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.25"
              value={form.praeferenzFaktor}
              onChange={(e) => setForm((f) => ({ ...f, praeferenzFaktor: Number(e.target.value) }))}
            />
          </label>

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <button
              type="button"
              className="events-secondary-btn events-save-desktop-only"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" className="events-primary-btn events-form-actions-save" disabled={saving}>
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
          </div>
        </form>
        <button
          type="button"
          className={`events-save-fab-button${fabPressed ? ' pressed' : ''}`}
          onClick={handleFabClick}
          onMouseDown={() => setFabPressed(true)}
          onMouseUp={() => setFabPressed(false)}
          onMouseLeave={() => setFabPressed(false)}
          onTouchStart={() => setFabPressed(true)}
          onTouchEnd={() => setFabPressed(false)}
          disabled={saving}
          aria-label={editId ? 'Gast aktualisieren' : 'Gast speichern'}
          title={editId ? 'Gast aktualisieren' : 'Gast speichern'}
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)} alt="Speichern" className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)
          )}
        </button>

        {/* Cancel FAB button - positioned at bottom-left */}
        <button
          className={`cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
          onClick={() => setShowForm(false)}
          onTouchStart={() => setCancelPressed(true)}
          onTouchEnd={() => setCancelPressed(false)}
          onTouchCancel={() => setCancelPressed(false)}
          onMouseDown={() => setCancelPressed(true)}
          onMouseUp={() => setCancelPressed(false)}
          onMouseLeave={() => setCancelPressed(false)}
          disabled={saving}
          title="Abbrechen"
          aria-label="Gast bearbeiten abbrechen"
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'cancelRecipe', isDarkMode)
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Gäste verwalten</h2>
        <div className="events-page-header-actions">
          <button
            type="button"
            className="events-primary-btn events-header-add-btn"
            onClick={openNew}
            aria-label="Neuen Gast anlegen"
          >
            + Gast
          </button>
          {onBack && (
            <button
              className="app-close-button"
              onClick={onBack}
              aria-label="Gäste verwalten schließen"
              title="Gäste verwalten schließen"
            >
              {isBase64Image(closeIcon) ? (
                <img src={closeIcon} alt="Gäste verwalten schließen" className="app-close-button-icon-img" />
              ) : (
                closeIcon || '×'
              )}
            </button>
          )}
        </div>
      </div>

      {isAdmin ? (
        allProfilesLoading ? (
          <div className="events-empty-state">Laden...</div>
        ) : sortedAllProfiles.length === 0 ? (
          <div className="events-empty-state">
            <p>Keine Gäste vorhanden.</p>
          </div>
        ) : (
          <div className="events-list">
            {sortedAllProfiles.map((profile) => {
              const fullName = getGuestDisplayName(profile);
              const ownerName = getOwnerFirstName(profile.ownerId);
              const guestDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode) || '🗑';
              return (
                <GuestCard
                  key={`${profile.ownerId}_${profile.id}`}
                  fullName={fullName}
                  deleteIcon={guestDeleteIcon}
                  onOpenEdit={() => openEdit(profile)}
                  onDelete={() => handleDelete(profile)}
                >
                  <div className="events-card-main">
                    <h3>{fullName || 'Unbenannter Gast'}</h3>
                    {profile.kind === true && <p className="events-info-text">Kind</p>}
                    {ownerName && (
                      <p className="events-card-meta">von {ownerName}</p>
                    )}
                  </div>
                </GuestCard>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : profiles.length === 0 ? (
        <div className="events-empty-state">
          <p>Noch keine Gäste erfasst.</p>
          <button type="button" className="events-primary-btn" onClick={openNew}>
            Ersten Gast anlegen
          </button>
        </div>
      ) : (
        <div className="events-list">
          {sortedProfiles.map((profile) => {
            const fullName = getGuestDisplayName(profile);
            const preferredDrinkNames = Array.isArray(profile.bevorzugteGetränke)
              ? profile.bevorzugteGetränke.map(
                  (drinkId) => availableDrinks.find((d) => d.id === drinkId)?.label || drinkId
                )
              : [];
            const preferredCategoryNames = Array.isArray(profile.bevorzugteKategorien)
              ? profile.bevorzugteKategorien.map(getDrinkCategoryLabel)
              : [];
            const preferredSummary = [...preferredDrinkNames, ...preferredCategoryNames];
            const guestDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode) || '🗑';
            return (
              <GuestCard
                key={profile.id}
                fullName={fullName}
                deleteIcon={guestDeleteIcon}
                onOpenEdit={() => openEdit(profile)}
                onDelete={() => handleDelete(profile)}
              >
                <div className="events-card-main">
                  <h3>{fullName || 'Unbenannter Gast'}</h3>
                  {profile.kind === true && <p className="events-info-text">Kind</p>}
                  {preferredSummary.length > 0 && (
                    <p className="events-card-drink-summary">
                      Bevorzugt: {preferredSummary.join(', ')}
                    </p>
                  )}
                </div>
              </GuestCard>
            );
          })}
        </div>
      )}
      <OverviewAddFab onClick={openNew} title="Gast anlegen" ariaLabel="Gast anlegen" />
      <UndoSnackbar itemName={pendingName} onUndo={undo} />
    </div>
  );
}

export default GuestManagementPage;
