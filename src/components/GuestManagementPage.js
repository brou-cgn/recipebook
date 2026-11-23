import React, { useState, useEffect, useMemo } from 'react';
import TrashIcon from './icons/TrashIcon';
import './EventsPage.css';
import OverviewAddFab from './OverviewAddFab';
import DeleteRowButton from './DeleteRowButton';
import useUndoableDelete from '../hooks/useUndoableDelete';
import {
  saveGuestProfile,
  deleteGuestProfile,
} from '../utils/eventsFirestore';
import { canEditRecipes, getUsers } from '../utils/userManagement';
import {
  DEFAULT_GUEST_LANGUAGE,
  GUEST_LANGUAGES,
  getGuestDisplayName,
  normalizeGuestLanguage,
  normalizePreferenceFactor,
} from '../utils/guestPreferences';
import { DRINK_CATEGORIES, getraenkKategorieAnzeige } from '../utils/drinkCategories';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import { resolveDrinkDisplay } from '../utils/drinkDisplay';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import Button from './Button';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { formatiereZahl } from '../i18n/format';
import gaesteTexte from '../i18n/texte/gaeste';
import getraenkeTexte from '../i18n/texte/getraenke';
import kopfzeileTexte from '../i18n/texte/kopfzeile';
import allgemeinTexte from '../i18n/texte/allgemein';

const emptyForm = () => ({
  vorname: '',
  nachname: '',
  email: '',
  sprache: DEFAULT_GUEST_LANGUAGE,
  kind: false,
  alkoholischeGetraenke: true,
  bevorzugteGetraenke: [],
  bevorzugteKategorien: [],
  praeferenzFaktor: 0.5,
});

// Beschreibung des Präferenzfaktors in der geltenden Sprache (Mehrsprachigkeit PR 6k)
const getPreferenceLabel = (factor, t) => {
  if (factor === 1) return t('praeferenzNur');
  if (factor === 0.75) return t('praeferenzVorwiegend');
  if (factor === 0.5) return t('praeferenzGerne');
  if (factor === 0.25) return t('praeferenzMag');
  return t('praeferenzKeine');
};

// Name der Einladungssprache in der geltenden Sprache (sprachnameDe … in kopfzeile.js)
const sprachnameSchluessel = (id) => `sprachname${id.charAt(0).toUpperCase()}${id.slice(1)}`;

function GuestCard({ fullName, deleteIcon, onOpenEdit, onDelete, children }) {
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete();
  const t = useTexte(gaesteTexte);
  const deleteLabel = t('nameLoeschen', { name: fullName || t('gast') });

  const handleContentClick = () => {
    if (isDeleteVisible) {
      reset();
      return;
    }
    onOpenEdit();
  };

  const handleSwipeDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
    reset();
  };

  return (
    <div className={`events-card events-guest-card${isDeleteVisible ? ' swipe-delete-active' : ''}`}>
      <div className="swipe-delete-background" aria-hidden={!isDeleteVisible && offset === 0}>
        <button
          type="button"
          className="swipe-delete-action"
          onClick={handleSwipeDeleteClick}
          aria-label={deleteLabel}
          tabIndex={isDeleteVisible ? 0 : -1}
        >
          {isBase64Image(deleteIcon) ? (
            <img src={deleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
          ) : (
            <span className="swipe-delete-icon-text">{deleteIcon || <TrashIcon />}</span>
          )}
        </button>
      </div>
      <div
        className="events-guest-card-content"
        style={{ transform: `translateX(${offset}px)`, transition: 'transform 0.15s ease' }}
        onClick={handleContentClick}
        {...handlers}
      >
        {children}
        <DeleteRowButton
          className="events-guest-delete-btn"
          itemName={fullName || t('gast')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        />
      </div>
    </div>
  );
}

function profileToForm(profile) {
  return {
    vorname: profile.vorname || '',
    nachname: profile.nachname || '',
    email: profile.email || '',
    sprache: normalizeGuestLanguage(profile.sprache),
    kind: profile.kind === true,
    alkoholischeGetraenke: profile.alkoholischeGetränke !== false,
    bevorzugteGetraenke: Array.isArray(profile.bevorzugteGetränke) ? profile.bevorzugteGetränke : [],
    bevorzugteKategorien: Array.isArray(profile.bevorzugteKategorien) ? profile.bevorzugteKategorien : [],
    praeferenzFaktor: normalizePreferenceFactor(profile.präferenzFaktor),
  };
}

function GuestManagementPage({
  onBack, currentUser, recipes,
  guestProfiles: profiles = [], guestProfilesLoaded = true,
  allGuestProfiles: allProfiles = [], allGuestProfilesLoaded = true,
  customDrinks = [],
  // Direkt einen Gast bearbeiten (z. B. aus dem Wichteln): Formular öffnet sofort,
  // Speichern/Abbrechen meldet sich über onEditClose(gespeicherteDaten | null) zurück.
  editGuest = null, onEditClose = null,
  // Nur Vorname, Nachname, E-Mail und Sprache zeigen (z. B. aus dem Wichteln).
  // Ausgeblendete Felder behalten beim Speichern ihren gespeicherten Wert.
  basicFieldsOnly = false,
}) {
  const loading = !guestProfilesLoaded;
  // Texte der Gäste-Verwaltung (Mehrsprachigkeit PR 6k); Namen sind Inhalt
  const t = useTexte(gaesteTexte);
  const tGetraenke = useTexte(getraenkeTexte);
  const tKopfzeile = useTexte(kopfzeileTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const { sprache } = useSprache();
  const kategorieName = (id) => getraenkKategorieAnzeige(id, tGetraenke);
  const [showForm, setShowForm] = useState(Boolean(editGuest));
  const [editId, setEditId] = useState(editGuest?.id || null);
  const [editOwnerId, setEditOwnerId] = useState(editGuest?.ownerId || null);
  const [form, setForm] = useState(() => (editGuest ? profileToForm(editGuest) : emptyForm()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [drinkToAdd, setDrinkToAdd] = useState('');
  const [categoryToAdd, setCategoryToAdd] = useState('');
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const formRef = React.useRef(null);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();

  const canManageGuests = canEditRecipes(currentUser);
  const closeIcon = getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode) || getEffectiveIcon(buttonIcons, 'closeButton', isDarkMode);

  // Admin: always browse all users' guest profiles instead of just the current user's own.
  const isAdmin = currentUser?.role === 'admin';
  const allProfilesLoading = !allGuestProfilesLoaded;
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    getUsers().then(setAllUsers).catch(() => setAllUsers([]));
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

  const availableDrinks = useMemo(() => {
    // Predefined drinks can be overridden per-owner but share the same fixed
    // id, so when drinks from multiple owners are present, only keep the
    // current user's own entry for a given id to avoid duplicate options.
    const byId = new Map();
    customDrinks.forEach((drink) => {
      if (!byId.has(drink.id) || drink.ownerId === currentUser?.id) byId.set(drink.id, drink);
    });
    return [...byId.values()].map((drink) => ({ id: drink.id, label: resolveDrinkDisplay(drink, recipes, tGetraenke).displayName || drink.id }));
  }, [customDrinks, recipes, currentUser?.id, tGetraenke]);

  const sortByName = (list) => {
    return [...list].sort((a, b) => {
      const nachnameDiff = (a.nachname || '').localeCompare(b.nachname || '', 'de', { sensitivity: 'base' });
      if (nachnameDiff !== 0) return nachnameDiff;
      return (a.vorname || '').localeCompare(b.vorname || '', 'de', { sensitivity: 'base' });
    });
  };

  const getProfileKey = (profile) => `${profile.ownerId || currentUser?.id}_${profile.id}`;
  const sortedProfiles = useMemo(
    () => sortByName(profiles).filter((p) => !pendingDeleteKeys.has(`${p.ownerId || currentUser?.id}_${p.id}`)),
    [profiles, pendingDeleteKeys, currentUser?.id]
  );
  const sortedAllProfiles = useMemo(
    () => sortByName(allProfiles).filter((p) => !pendingDeleteKeys.has(`${p.ownerId || currentUser?.id}_${p.id}`)),
    [allProfiles, pendingDeleteKeys, currentUser?.id]
  );

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
    setForm(profileToForm(profile));
    setDrinkToAdd('');
    setCategoryToAdd('');
    setError('');
    setShowForm(true);
  };

  const closeForm = (saved) => {
    if (onEditClose) onEditClose(saved);
    else setShowForm(false);
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
      setError(t('keineBerechtigung'));
      return;
    }
    if (!form.vorname.trim() || !form.nachname.trim()) {
      setError(t('fehlerName'));
      return;
    }
    if (!validateEmail(form.email.trim())) {
      setError(t('fehlerEmail'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        vorname: form.vorname.trim(),
        nachname: form.nachname.trim(),
        email: form.email.trim(),
        sprache: normalizeGuestLanguage(form.sprache),
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
      closeForm(payload);
    } catch (err) {
      console.error('Error saving guest profile:', err);
      setError(t('fehlerSpeichern'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (profile) => {
    if (!canManageGuests) return;
    const name = getGuestDisplayName(profile) || t('diesenGast');
    scheduleDelete({
      key: getProfileKey(profile),
      message: t('gastGeloescht', { name }),
      onConfirm: async () => {
        try {
          // Admin deleting another user's guest: pass their ownerId through.
          if (profile.ownerId && profile.ownerId !== currentUser.id) {
            await deleteGuestProfile(currentUser.id, profile.id, profile.ownerId);
          } else {
            await deleteGuestProfile(currentUser.id, profile.id);
          }
        } catch (err) {
          console.error('Error deleting guest profile:', err);
        }
      },
      onUndo: () => {},
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
          <h2>{t('gaesteVerwalten')}</h2>
          {onBack && (
            <button
              className="app-close-button"
              onClick={onBack}
              aria-label={t('gaesteVerwaltenSchliessen')}
              title={t('gaesteVerwaltenSchliessen')}
            >
              {isBase64Image(closeIcon) ? (
                <img src={closeIcon} alt={t('gaesteVerwaltenSchliessen')} className="app-close-button-icon-img" />
              ) : (
                closeIcon || '×'
              )}
            </button>
          )}
        </div>
        <div className="events-empty-state">
          {t('nurRolleEdit')}
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{editId ? t('gastBearbeiten') : t('neuerGast')}</h2>
        </div>
        <form className="events-form" onSubmit={handleSave} ref={formRef}>
          <div className="events-form-row">
            <label className="events-form-field">
              <span>{t('vorname')}</span>
              <input
                type="text"
                value={form.vorname}
                onChange={(e) => setForm((f) => ({ ...f, vorname: e.target.value }))}
                required
              />
            </label>
            <label className="events-form-field">
              <span>{t('nachname')}</span>
              <input
                type="text"
                value={form.nachname}
                onChange={(e) => setForm((f) => ({ ...f, nachname: e.target.value }))}
                required
              />
            </label>
          </div>

          <label className="events-form-field">
            <span>{t('email')}</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={t('emailBeispiel')}
            />
          </label>

          <label className="events-form-field">
            <span>{t('spracheEinladungen')}</span>
            <select
              value={form.sprache}
              onChange={(e) => setForm((f) => ({ ...f, sprache: e.target.value }))}
            >
              {GUEST_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>{tKopfzeile(sprachnameSchluessel(language.id))}</option>
              ))}
            </select>
          </label>

          {!basicFieldsOnly && (
            <>
            <label className="events-category-checkbox">
              <input
                type="checkbox"
                role="switch"
                checked={form.kind}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((f) => ({
                    ...f,
                    kind: checked,
                    alkoholischeGetraenke: checked ? false : f.alkoholischeGetraenke,
                  }));
                }}
              />
              <span>{t('kind')}</span>
            </label>

            <label className="events-category-checkbox">
              <input
                type="checkbox"
                role="switch"
                checked={form.alkoholischeGetraenke}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((f) => ({
                    ...f,
                    alkoholischeGetraenke: checked,
                    kind: checked ? false : f.kind,
                  }));
                }}
              />
              <span>{t('alkoholisch')}</span>
            </label>

            <div className="events-form-field">
              <span>{t('bevorzugteGetraenke')}</span>
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
                          aria-label={tAllgemein('nameEntfernen', { name: drink ? drink.label : drinkId })}
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
                  aria-label={t('getraenkAuswaehlen')}
                >
                  <option value="">{t('getraenkAuswaehlenOption')}</option>
                  {availableDrinks
                    .filter((d) => !form.bevorzugteGetraenke.includes(d.id))
                    .map((drink) => (
                      <option key={drink.id} value={drink.id}>{drink.label}</option>
                    ))}
                </select>
                <Button
                  onClick={() => {
                    if (drinkToAdd) {
                      togglePreferredDrink(drinkToAdd);
                      setDrinkToAdd('');
                    }
                  }}
                  disabled={!drinkToAdd}
                >
                  {tAllgemein('hinzufuegen')}
                </Button>
              </div>
            </div>

            <div className="events-form-field">
              <span>{t('bevorzugteKategorien')}</span>
              {form.bevorzugteKategorien.length > 0 && (
                <div className="events-preferred-drinks-list">
                  {form.bevorzugteKategorien.map((catId) => (
                    <span key={catId} className="events-drink-chip">
                      {kategorieName(catId)}
                      <button
                        type="button"
                        className="events-drink-chip-remove"
                        onClick={() => togglePreferredCategory(catId)}
                        aria-label={tAllgemein('nameEntfernen', { name: kategorieName(catId) })}
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
                  aria-label={t('kategorieAuswaehlen')}
                >
                  <option value="">{t('kategorieAuswaehlenOption')}</option>
                  {DRINK_CATEGORIES.map((cat) =>
                    cat.subcategories ? (
                      <optgroup key={cat.id} label={kategorieName(cat.id)}>
                        {!form.bevorzugteKategorien.includes(cat.id) && (
                          <option value={cat.id}>{kategorieName(cat.id)}</option>
                        )}
                        {cat.subcategories
                          .filter((sub) => !form.bevorzugteKategorien.includes(sub.id))
                          .map((sub) => (
                            <option key={sub.id} value={sub.id}>{kategorieName(sub.id)}</option>
                          ))}
                      </optgroup>
                    ) : (
                      !form.bevorzugteKategorien.includes(cat.id) && (
                        <option key={cat.id} value={cat.id}>{kategorieName(cat.id)}</option>
                      )
                    )
                  )}
                </select>
                <Button
                  onClick={() => {
                    if (categoryToAdd) {
                      togglePreferredCategory(categoryToAdd);
                      setCategoryToAdd('');
                    }
                  }}
                  disabled={!categoryToAdd}
                >
                  {tAllgemein('hinzufuegen')}
                </Button>
              </div>
            </div>

            <label className="events-form-field">
              <span>{t('praeferenzfaktor', { faktor: formatiereZahl(Number(form.praeferenzFaktor), sprache, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), beschreibung: getPreferenceLabel(Number(form.praeferenzFaktor), t) })}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.25"
                value={form.praeferenzFaktor}
                onChange={(e) => setForm((f) => ({ ...f, praeferenzFaktor: Number(e.target.value) }))}
              />
            </label>
            </>
          )}

          {error && <p className="events-error-text">{error}</p>}

          <div className="events-form-actions">
            <Button className="events-save-desktop-only" onClick={() => closeForm(null)} disabled={saving}>
              {tAllgemein('abbrechen')}
            </Button>
            <Button variant="primary" type="submit" className="events-form-actions-save" loading={saving}>
              {saving ? t('speichert') : tAllgemein('speichern')}
            </Button>
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
          aria-label={editId ? t('gastAktualisieren') : t('gastSpeichern')}
          title={editId ? t('gastAktualisieren') : t('gastSpeichern')}
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)} alt={tAllgemein('speichern')} className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'saveRecipe', isDarkMode)
          )}
        </button>

        {/* Cancel FAB button - positioned at bottom-left */}
        <button
          className={`events-cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
          onClick={() => closeForm(null)}
          onTouchStart={() => setCancelPressed(true)}
          onTouchEnd={() => setCancelPressed(false)}
          onTouchCancel={() => setCancelPressed(false)}
          onMouseDown={() => setCancelPressed(true)}
          onMouseUp={() => setCancelPressed(false)}
          onMouseLeave={() => setCancelPressed(false)}
          disabled={saving}
          title={tAllgemein('abbrechen')}
          aria-label={t('gastBearbeitenAbbrechen')}
        >
          {isBase64Image(getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
            <img src={getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)} alt={tAllgemein('abbrechen')} className="button-icon-image" draggable="false" />
          ) : (
            getEffectiveIcon(buttonIcons, 'closeButtonDefaultImg', isDarkMode)
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>{t('gaesteVerwalten')}</h2>
        <div className="events-page-header-actions">
          <Button
            className="events-header-add-btn"
            onClick={openNew}
            aria-label={t('neuenGastAnlegen')}
          >
            {t('plusGast')}
          </Button>
          {onBack && (
            <button
              className="app-close-button"
              onClick={onBack}
              aria-label={t('gaesteVerwaltenSchliessen')}
              title={t('gaesteVerwaltenSchliessen')}
            >
              {isBase64Image(closeIcon) ? (
                <img src={closeIcon} alt={t('gaesteVerwaltenSchliessen')} className="app-close-button-icon-img" />
              ) : (
                closeIcon || '×'
              )}
            </button>
          )}
        </div>
      </div>

      {isAdmin ? (
        allProfilesLoading ? (
          <div className="events-empty-state">{t('laden')}</div>
        ) : sortedAllProfiles.length === 0 ? (
          <div className="events-empty-state">
            <p>{t('keineGaeste')}</p>
          </div>
        ) : (
          <div className="events-list">
            {sortedAllProfiles.map((profile) => {
              const fullName = getGuestDisplayName(profile);
              const ownerName = getOwnerFirstName(profile.ownerId);
              const guestDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode);
              return (
                <GuestCard
                  key={`${profile.ownerId}_${profile.id}`}
                  fullName={fullName}
                  deleteIcon={guestDeleteIcon}
                  onOpenEdit={() => openEdit(profile)}
                  onDelete={() => handleDelete(profile)}
                >
                  <div className="events-card-main">
                    <h3>{fullName || t('unbenannterGast')}</h3>
                    {profile.kind === true && <p className="events-info-text">{t('kind')}</p>}
                    {ownerName && (
                      <p className="events-card-meta">{t('von', { name: ownerName })}</p>
                    )}
                  </div>
                </GuestCard>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="events-empty-state">{t('laden')}</div>
      ) : profiles.length === 0 ? (
        <div className="events-empty-state">
          <p>{t('nochKeineGaeste')}</p>
          <Button variant="primary" onClick={openNew}>
            {t('ersterGast')}
          </Button>
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
              ? profile.bevorzugteKategorien.map(kategorieName)
              : [];
            const preferredSummary = [...preferredDrinkNames, ...preferredCategoryNames];
            const guestDeleteIcon = getEffectiveIcon(buttonIcons, 'swipeDelete', isDarkMode);
            return (
              <GuestCard
                key={profile.id}
                fullName={fullName}
                deleteIcon={guestDeleteIcon}
                onOpenEdit={() => openEdit(profile)}
                onDelete={() => handleDelete(profile)}
              >
                <div className="events-card-main">
                  <h3>{fullName || t('unbenannterGast')}</h3>
                  {profile.kind === true && <p className="events-info-text">{t('kind')}</p>}
                  {preferredSummary.length > 0 && (
                    <p className="events-card-drink-summary">
                      {t('bevorzugt', { liste: preferredSummary.join(', ') })}
                    </p>
                  )}
                </div>
              </GuestCard>
            );
          })}
        </div>
      )}
      {deleteBanners.map((banner) => (
        <div key={banner.id} className="undo-snackbar" role="status">
          <span>{banner.message}</span>
          <button type="button" className="undo-snackbar-btn" onClick={() => undoDelete(banner.id)}>
            {tAllgemein('rueckgaengig')}
          </button>
        </div>
      ))}
      <OverviewAddFab onClick={openNew} title={t('gastAnlegen')} ariaLabel={t('gastAnlegen')} />
    </div>
  );
}

export default GuestManagementPage;
