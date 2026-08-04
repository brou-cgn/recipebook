import React, { useState, useEffect, useMemo } from 'react';
import './EventsPage.css';
import { subscribeToEvents, deleteEvent, getEvent } from '../utils/eventsFirestore';
import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from './EventForm';
import EventForm from './EventForm';
import ConsumptionForm from './ConsumptionForm';
import DrinkManagementPage from './DrinkManagementPage';
import GuestManagementPage from './GuestManagementPage';
import OverviewAddFab from './OverviewAddFab';
import { canEditRecipes } from '../utils/userManagement';
import { DEFAULT_BUTTON_ICONS, getButtonIcons, getDarkModePreference, getEffectiveIcon } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';

const STATUS_LABELS = {
  geplant: 'Geplant',
  berechnet: 'Berechnet',
  verbrauchErfasst: 'Verbrauch erfasst',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('de-DE');
  } catch {
    return dateStr;
  }
};

const formatDrinkSummary = (berechnung) => {
  const ergebnis = berechnung?.ergebnis;
  if (!ergebnis || ergebnis.length === 0) return null;
  return ergebnis
    .filter((row) => row.isCustomDrink)
    .map((row) => {
      const label = row.drinkLabel || row.kategorie;
      return `~${row.literMitPuffer}L ${label}`;
    })
    .join(', ');
};

function EventsPage({ onBack, currentUser, pendingEventReminderId, onPendingEventReminderHandled }) {
  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768);
  const [editFabPressed, setEditFabPressed] = useState(false);
  const [buttonIcons, setButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState('list'); // list | new | edit | detail | consumption | drinks | guests
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [fallbackEvent, setFallbackEvent] = useState(null); // used right after calculation, before onSnapshot syncs

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const loadButtonIcons = async () => {
      try {
        const icons = await getButtonIcons();
        setButtonIcons(icons);
      } catch (error) {
        console.error('Error loading button icons:', error);
      }
    };
    loadButtonIcons();
  }, []);

  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const unsubscribe = subscribeToEvents(currentUser.id, (loadedEvents) => {
      setEvents(loadedEvents);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser?.id]);

  // Deep link from a push notification: jump straight to the consumption form.
  useEffect(() => {
    if (!pendingEventReminderId || !currentUser?.id) return;
    let cancelled = false;
    getEvent(currentUser.id, pendingEventReminderId).then((event) => {
      if (cancelled || !event) return;
      setFallbackEvent(event);
      setSelectedEventId(event.id);
      setSubView('consumption');
    });
    onPendingEventReminderHandled?.();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEventReminderId, currentUser?.id]);

  const selectedEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || fallbackEvent || null;
  }, [events, selectedEventId, fallbackEvent]);
  const editEventIcon = getEffectiveIcon(buttonIcons, 'editRecipe', isDarkMode);

  const handleSelectEvent = (event) => {
    setSelectedEventId(event.id);
    setFallbackEvent(event);
    setSubView('detail');
  };

  const handleEventSaved = (eventId) => {
    setSelectedEventId(eventId);
    setFallbackEvent(null);
    setSubView('detail');
  };

  const handleDelete = async (event) => {
    if (!window.confirm(`Möchtest du "${event.eventName}" wirklich löschen?`)) return;
    try {
      await deleteEvent(currentUser.id, event.id);
      setSubView('list');
      setSelectedEventId(null);
      setFallbackEvent(null);
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  if (subView === 'drinks') {
    return (
      <DrinkManagementPage
        onBack={() => setSubView('list')}
        currentUser={currentUser}
      />
    );
  }

  if (subView === 'guests') {
    return (
      <GuestManagementPage
        onBack={() => setSubView('list')}
        currentUser={currentUser}
      />
    );
  }

  if (subView === 'new') {
    return (
      <EventForm
        onSaved={handleEventSaved}
        onCancel={() => setSubView('list')}
        currentUser={currentUser}
        onManageDrinks={() => setSubView('drinks')}
      />
    );
  }

  if (subView === 'edit' && selectedEvent) {
    return (
      <EventForm
        onSaved={handleEventSaved}
        onCancel={() => setSubView('detail')}
        onDelete={() => handleDelete(selectedEvent)}
        currentUser={currentUser}
        onManageDrinks={() => setSubView('drinks')}
        initialEvent={selectedEvent}
      />
    );
  }

  if (subView === 'consumption' && selectedEvent) {
    return (
      <ConsumptionForm
        event={selectedEvent}
        onDone={(eventId) => {
          setSelectedEventId(eventId);
          setFallbackEvent(null);
          setSubView('detail');
        }}
        onCancel={() => setSubView('detail')}
      />
    );
  }

  if (subView === 'detail' && selectedEvent) {
    const berechnung = selectedEvent.berechnung;
    const driverGuestIds = Array.isArray(selectedEvent.driverGuestIds) ? selectedEvent.driverGuestIds : [];
    const driverNames = driverGuestIds
      .map((guestId) => selectedEvent.guestNamesById?.[guestId] || guestId)
      .filter(Boolean);
    return (
      <div className="events-page-container">
        <div className="events-page-header">
          <h2>{selectedEvent.eventName}</h2>
          <button
            className="events-close-btn"
            onClick={() => { setSubView('list'); setSelectedEventId(null); setFallbackEvent(null); }}
            aria-label="Zurück zur Liste"
            title="Zurück zur Liste"
          >
            ×
          </button>
        </div>

        <div className="events-result-card">
          <div className="events-detail-meta">
            <span className={`events-status-badge events-status-${selectedEvent.status}`}>
              {STATUS_LABELS[selectedEvent.status] || selectedEvent.status}
            </span>
            <span>{formatDate(selectedEvent.date)}</span>
            <span>{selectedEvent.durationHours} Std.</span>
            <span>{EVENT_TYPE_LABELS[selectedEvent.eventType] || selectedEvent.eventType}</span>
            <span>
              {selectedEvent.guests?.adults ?? 0} Erw. / {selectedEvent.guests?.children ?? 0} Kinder
            </span>
            {driverGuestIds.length > 0 && (
              <span>Fahrer: {driverNames.join(', ')}</span>
            )}
          </div>

          {berechnung?.warnungen?.length > 0 && (
            <div className="events-warnings">
              {berechnung.warnungen.map((warnung, idx) => (
                <p key={idx} className="events-warning-text">{warnung}</p>
              ))}
            </div>
          )}

          <h3>Getränke</h3>
          <div className="events-table-container">
            <table className="events-table">
              <thead>
                <tr>
                  <th>Getränk</th>
                  <th>Menge</th>
                </tr>
              </thead>
              <tbody>
                {(berechnung?.ergebnis || [])
                  .filter((row) => row.isCustomDrink || !row.hasCustomDrinkCoverage)
                  .map((row) => (
                    <tr key={row.kategorie}>
                      <td>{row.isCustomDrink && row.drinkLabel ? row.drinkLabel : (CATEGORY_LABELS[row.kategorie] || row.kategorie)}</td>
                      <td>{row.literMitPuffer} l</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {selectedEvent.status === 'verbrauchErfasst' && selectedEvent.istVerbrauch && (
            <>
              <h3>Tatsächlicher Verbrauch</h3>
              <div className="events-table-container">
                <table className="events-table">
                  <thead>
                    <tr>
                      <th>Getränk</th>
                      <th>Menge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selectedEvent.istVerbrauch).map(([kategorie, liter]) => (
                      <tr key={kategorie}>
                        <td>{CATEGORY_LABELS[kategorie] || kategorie}</td>
                        <td>{liter} l</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="events-form-actions">
            {selectedEvent.status === 'berechnet' && (
              <button
                type="button"
                className="events-primary-btn"
                onClick={() => setSubView('consumption')}
              >
                Verbrauch nachtragen
              </button>
            )}
            {!isMobileView && (
              <button
                type="button"
                className="events-secondary-btn"
                onClick={() => setSubView('edit')}
              >
                Bearbeiten
              </button>
            )}
          </div>
        </div>
        {isMobileView && (
          <button
            type="button"
            className={`edit-fab-button events-edit-fab-button${editFabPressed ? ' pressed' : ''}`}
            onClick={() => setSubView('edit')}
            onTouchStart={() => setEditFabPressed(true)}
            onTouchEnd={() => setEditFabPressed(false)}
            onTouchCancel={() => setEditFabPressed(false)}
            onMouseDown={() => setEditFabPressed(true)}
            onMouseUp={() => setEditFabPressed(false)}
            onMouseLeave={() => setEditFabPressed(false)}
            title="Event bearbeiten"
            aria-label="Event bearbeiten"
          >
            {isBase64Image(editEventIcon) ? (
              <img src={editEventIcon} alt="Bearbeiten" className="button-icon-image" draggable="false" />
            ) : (
              editEventIcon
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="events-page-container">
      <div className="events-page-header">
        <h2>Events</h2>
        {onBack && (
          <button
            className="events-close-btn"
            onClick={onBack}
            aria-label="Schließen"
            title="Schließen"
          >
            ×
          </button>
        )}
      </div>

      <div className="events-manage-links">
        <button type="button" className="events-manage-link-btn" onClick={() => setSubView('drinks')}>
          Getränke verwalten
        </button>
        {canEditRecipes(currentUser) && (
          <button type="button" className="events-manage-link-btn" onClick={() => setSubView('guests')}>
            Gäste verwalten
          </button>
        )}
      </div>

      {loading ? (
        <div className="events-empty-state">Laden...</div>
      ) : events.length === 0 ? (
        <div className="events-empty-state">
          <p>Noch keine Events geplant.</p>
          <button type="button" className="events-primary-btn" onClick={() => setSubView('new')}>
            Erstes Event anlegen
          </button>
        </div>
      ) : (
        <div className="events-list">
          {events.map((event) => {
            return (
              <div key={event.id} className="events-card" onClick={() => handleSelectEvent(event)}>
                <div className="events-card-main">
                  <h3>{event.eventName}</h3>
                  <p className="events-card-meta">
                    {formatDate(event.date)} · {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                  </p>
                </div>
                <span className={`events-status-badge events-status-${event.status}`}>
                  {STATUS_LABELS[event.status] || event.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <OverviewAddFab onClick={() => setSubView('new')} title="Event erstellen" ariaLabel="Event erstellen" />
    </div>
  );
}

export default EventsPage;
