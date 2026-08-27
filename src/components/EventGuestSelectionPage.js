import React, { useState, useEffect, useRef } from 'react';
import './EventsPage.css';
import { subscribeToGuestProfiles } from '../utils/eventsFirestore';
import { getGuestDisplayName } from '../utils/guestPreferences';
import { DEFAULT_BUTTON_ICONS, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import DeleteRowButton from './DeleteRowButton';
import useUndoableDelete from '../hooks/useUndoableDelete';

function GuestRow({
  fullName,
  isDriver,
  isDeleteVisible,
  onToggleDriver,
  onRemove,
  onSwipeDeleteVisible,
  onSwipeDeleteHidden,
  swipeDeleteIcon,
}) {
  const { offset, reset, handlers } = useSwipeToDelete({
    isDeleteVisible,
    onDeleteVisibleChange: (visible) => (visible ? onSwipeDeleteVisible() : onSwipeDeleteHidden()),
  });

  const handleSwipeDeleteClick = () => {
    onRemove();
    reset();
  };

  const swipeContentStyle = {
    transform: `translateX(${offset}px)`,
    transition: 'transform 0.15s ease',
  };

  return (
    <div className={`events-guest-row${offset < 0 ? ' swipe-delete-active' : ''}`}>
      <div className="events-guest-row-swipe-background" aria-hidden={!isDeleteVisible}>
        {isDeleteVisible && (
          <button
            type="button"
            className="events-guest-row-swipe-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${fullName} entfernen`}
          >
            {isBase64Image(swipeDeleteIcon) ? (
              <img src={swipeDeleteIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
            ) : (
              <span className="swipe-delete-icon-text">{swipeDeleteIcon || '🗑'}</span>
            )}
          </button>
        )}
      </div>
      <div
        className="events-guest-row-content"
        style={swipeContentStyle}
        {...handlers}
      >
        <div className="events-guest-row-header delete-row-hover-target">
          <div className="events-guest-row-name">{fullName}</div>
          <DeleteRowButton
            className="events-guest-row-delete-btn"
            itemName={fullName}
            onClick={onRemove}
          />
        </div>
        <label className="events-guest-row-driver">
          <input
            type="checkbox"
            role="switch"
            className="events-driver-checkbox"
            checked={isDriver}
            onChange={onToggleDriver}
            aria-label={`${fullName} als Fahrer markieren`}
          />
          <span>Fahrer</span>
        </label>
      </div>
    </div>
  );
}

function EventGuestSelectionPage({
  currentUser,
  ownerId,
  selectedGuestIds: initialSelectedGuestIds,
  driverGuestIds: initialDriverGuestIds,
  onSave,
  onBack,
  buttonIcons,
  isDarkMode,
}) {
  const [guests, setGuests] = useState([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState(initialSelectedGuestIds ?? []);
  const [driverGuestIds, setDriverGuestIds] = useState(initialDriverGuestIds ?? []);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [fabPressed, setFabPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);
  const [swipeDeleteVisibleId, setSwipeDeleteVisibleId] = useState(null);
  const { banners: deleteBanners, pendingKeys: pendingDeleteKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const effectiveButtonIcons = buttonIcons || DEFAULT_BUTTON_ICONS;
  const effectiveOwnerId = ownerId || currentUser?.id;
  const swipeDeleteIcon = getEffectiveIcon(effectiveButtonIcons, 'swipeDelete', isDarkMode) || '🗑';

  useEffect(() => {
    if (!effectiveOwnerId) return undefined;
    const unsubGuests = subscribeToGuestProfiles(effectiveOwnerId, setGuests);
    return unsubGuests;
  }, [effectiveOwnerId]);

  useEffect(() => {
    setDriverGuestIds((prev) => prev.filter((guestId) => selectedGuestIds.includes(guestId)));
  }, [selectedGuestIds]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleGuest = (guestId) => {
    setSelectedGuestIds((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]
    );
  };

  const handleRemoveGuest = (guest) => {
    const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
    scheduleDelete({
      key: guest.id,
      message: `"${fullName}" entfernt.`,
      onConfirm: () => toggleGuest(guest.id),
      onUndo: () => {},
    });
  };

  const toggleDriverGuest = (guestId) => {
    if (!selectedGuestIds.includes(guestId)) return;
    setDriverGuestIds((prev) =>
      prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]
    );
  };

  const handleSave = () => {
    // Guests still pending an undoable swipe-delete haven't actually been removed from
    // selectedGuestIds yet (see handleRemoveGuest), but should be saved as removed since
    // they're already hidden from view.
    const guestIdsToSave = selectedGuestIds.filter((id) => !pendingDeleteKeys.has(id));
    onSave(guestIdsToSave, driverGuestIds.filter((id) => guestIdsToSave.includes(id)));
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setIsDropdownOpen(e.target.value.trim().length > 0);
  };

  const handleSelectGuest = (guestId) => {
    setSelectedGuestIds((prev) => (prev.includes(guestId) ? prev : [...prev, guestId]));
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredGuests = normalizedQuery
    ? guests.filter((guest) => {
        const fullName = (getGuestDisplayName(guest) || 'Unbenannter Gast').toLowerCase();
        return fullName.includes(normalizedQuery) && !selectedGuestIds.includes(guest.id);
      })
    : [];

  const effectiveSelectedGuestIds = selectedGuestIds.filter((id) => !pendingDeleteKeys.has(id));
  const effectiveDriverGuestIds = driverGuestIds.filter((id) => !pendingDeleteKeys.has(id));
  const selectedGuests = guests.filter((g) => selectedGuestIds.includes(g.id) && !pendingDeleteKeys.has(g.id));

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Gäste</h2>
      </div>

      <div className="events-form">
        <div className="events-form-field">
          <div className="events-guest-typeahead">
            <input
              ref={searchRef}
              type="text"
              className="events-guest-search-input"
              placeholder="Gast suchen..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => {
                if (searchQuery.trim().length > 0) setIsDropdownOpen(true);
              }}
              aria-label="Gast suchen"
              aria-autocomplete="list"
              aria-expanded={isDropdownOpen}
              role="combobox"
              aria-controls="guest-typeahead-list"
            />
            {isDropdownOpen && (
              <ul
                id="guest-typeahead-list"
                ref={dropdownRef}
                className="events-guest-typeahead-list"
                role="listbox"
              >
                {filteredGuests.length === 0 ? (
                  <li className="events-guest-typeahead-empty">Keine Gäste gefunden.</li>
                ) : (
                  filteredGuests.map((guest) => {
                    const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                    return (
                      <li
                        key={guest.id}
                        role="option"
                        aria-selected={false}
                        className="events-guest-typeahead-option"
                        onMouseDown={() => handleSelectGuest(guest.id)}
                      >
                        {fullName}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>

          {selectedGuests.length > 0 && (
            <div className="events-guest-list">
              {selectedGuests.map((guest) => {
                const fullName = getGuestDisplayName(guest) || 'Unbenannter Gast';
                const isDeleteVisible = swipeDeleteVisibleId === guest.id;
                return (
                  <GuestRow
                    key={guest.id}
                    fullName={fullName}
                    isDriver={driverGuestIds.includes(guest.id)}
                    isDeleteVisible={isDeleteVisible}
                    onToggleDriver={() => toggleDriverGuest(guest.id)}
                    onRemove={() => handleRemoveGuest(guest)}
                    onSwipeDeleteVisible={() => setSwipeDeleteVisibleId(guest.id)}
                    onSwipeDeleteHidden={() =>
                      setSwipeDeleteVisibleId((prev) => (prev === guest.id ? null : prev))
                    }
                    swipeDeleteIcon={swipeDeleteIcon}
                  />
                );
              })}
            </div>
          )}
          {deleteBanners.map((banner) => (
            <div key={banner.id} className="undo-snackbar" role="status">
              <span>{banner.message}</span>
              <button type="button" className="undo-snackbar-btn" onClick={() => undoDelete(banner.id)}>
                Rückgängig
              </button>
            </div>
          ))}

          <div className="events-guest-summary-badges">
            <span className="events-summary-badge">
              {effectiveSelectedGuestIds.length} {effectiveSelectedGuestIds.length === 1 ? 'Gast' : 'Gäste'} ausgewählt.
            </span>
            <span className="events-summary-badge">
              {effectiveDriverGuestIds.length} Fahrer markiert.
            </span>
          </div>
        </div>
        <div className="events-form-actions">
          <button
            type="button"
            className="events-secondary-btn events-save-desktop-only"
            onClick={onBack}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="events-primary-btn events-form-actions-save"
            onClick={handleSave}
          >
            Speichern
          </button>
        </div>
      </div>

      {/* FAB Save button - mobile only */}
      <button
        type="button"
        className={`events-save-fab-button${fabPressed ? ' pressed' : ''}`}
        onClick={handleSave}
        onMouseDown={() => setFabPressed(true)}
        onMouseUp={() => setFabPressed(false)}
        onMouseLeave={() => setFabPressed(false)}
        onTouchStart={() => setFabPressed(true)}
        onTouchEnd={() => setFabPressed(false)}
        aria-label="Gästeliste speichern"
        title="Speichern"
      >
        {isBase64Image(getEffectiveIcon(effectiveButtonIcons, 'saveRecipe', isDarkMode)) ? (
          <img src={getEffectiveIcon(effectiveButtonIcons, 'saveRecipe', isDarkMode)} alt="Speichern" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(effectiveButtonIcons, 'saveRecipe', isDarkMode)
        )}
      </button>

      {/* Cancel FAB button - positioned at bottom-left, mobile only */}
      <button
        type="button"
        className={`events-cancel-fab-button ${cancelPressed ? 'pressed' : ''}`}
        onClick={onBack}
        onTouchStart={() => setCancelPressed(true)}
        onTouchEnd={() => setCancelPressed(false)}
        onTouchCancel={() => setCancelPressed(false)}
        onMouseDown={() => setCancelPressed(true)}
        onMouseUp={() => setCancelPressed(false)}
        onMouseLeave={() => setCancelPressed(false)}
        title="Abbrechen"
        aria-label="Gästeauswahl abbrechen"
      >
        {isBase64Image(getEffectiveIcon(effectiveButtonIcons, 'closeButtonDefaultImg', isDarkMode)) ? (
          <img src={getEffectiveIcon(effectiveButtonIcons, 'closeButtonDefaultImg', isDarkMode)} alt="Abbrechen" className="button-icon-image" draggable="false" />
        ) : (
          getEffectiveIcon(effectiveButtonIcons, 'closeButtonDefaultImg', isDarkMode)
        )}
      </button>
    </div>
  );
}

export default EventGuestSelectionPage;
