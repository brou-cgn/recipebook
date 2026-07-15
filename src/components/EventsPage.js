import React, { useState, useEffect, useMemo } from 'react';
import './EventsPage.css';
import { subscribeToEvents, deleteEvent, getEvent } from '../utils/eventsFirestore';
import { CATEGORY_LABELS, EVENT_TYPE_LABELS } from './EventForm';
import EventForm from './EventForm';
import ConsumptionForm from './ConsumptionForm';

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

function EventsPage({ onBack, currentUser, pendingEventReminderId, onPendingEventReminderHandled }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState('list'); // list | new | detail | consumption
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [fallbackEvent, setFallbackEvent] = useState(null); // used right after calculation, before onSnapshot syncs

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

  if (subView === 'new') {
    return (
      <EventForm
        onSaved={handleEventSaved}
        onCancel={() => setSubView('list')}
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
          </div>

          {berechnung?.warnungen?.length > 0 && (
            <div className="events-warnings">
              {berechnung.warnungen.map((warnung, idx) => (
                <p key={idx} className="events-warning-text">{warnung}</p>
              ))}
            </div>
          )}

          <h3>Einkaufsliste</h3>
          <div className="events-table-container">
            <table className="events-table">
              <thead>
                <tr>
                  <th>Kategorie</th>
                  <th>Liter</th>
                  <th>Gebinde</th>
                  <th>Anzahl</th>
                </tr>
              </thead>
              <tbody>
                {(berechnung?.ergebnis || []).map((row) => (
                  <tr key={row.kategorie}>
                    <td>{CATEGORY_LABELS[row.kategorie] || row.kategorie}</td>
                    <td>{row.literMitPuffer} L</td>
                    <td>{row.gebinde || '-'}</td>
                    <td>{row.anzahlGebinde ?? '-'}</td>
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
                      <th>Kategorie</th>
                      <th>Liter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selectedEvent.istVerbrauch).map(([kategorie, liter]) => (
                      <tr key={kategorie}>
                        <td>{CATEGORY_LABELS[kategorie] || kategorie}</td>
                        <td>{liter} L</td>
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
            <button
              type="button"
              className="events-secondary-btn events-delete-btn"
              onClick={() => handleDelete(selectedEvent)}
            >
              Löschen
            </button>
          </div>
        </div>
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
        <>
          <div className="events-list">
            {events.map((event) => (
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
            ))}
          </div>
          <button
            className="events-add-fab-button"
            onClick={() => setSubView('new')}
            title="Event erstellen"
            aria-label="Event erstellen"
          >
            +
          </button>
        </>
      )}
    </div>
  );
}

export default EventsPage;
