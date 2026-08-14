import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventForm from './EventForm';

const mockCalculateEventDrinks = jest.fn();
const mockSubscribeToGuestProfiles = jest.fn();
const mockSubscribeToCustomDrinks = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  EVENT_TYPES: ['party'],
  deriveSeason: jest.fn(() => 'sommer'),
  calculateEventDrinks: (...args) => mockCalculateEventDrinks(...args),
  subscribeToGuestProfiles: (...args) => mockSubscribeToGuestProfiles(...args),
  subscribeToCustomDrinks: (...args) => mockSubscribeToCustomDrinks(...args),
}));

jest.mock('./EventGuestSelectionPage', () => function MockEventGuestSelectionPage({ onSave, onBack }) {
  return (
    <div>
      <button type="button" onClick={() => onSave(['g1'], ['g1'])}>Gäste speichern</button>
      <button type="button" onClick={() => onSave(['g1', 'g2'], ['g1'])}>Gäste mit Kind speichern</button>
      <button type="button" onClick={onBack}>Gäste abbrechen</button>
    </div>
  );
});

jest.mock('./EventDrinkSelectionPage', () => function MockEventDrinkSelectionPage({ onSave, onBack }) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onSave(['custom-wasser'], { 'custom-wasser': 1.4 })}
      >
        Getränke speichern
      </button>
      <button type="button" onClick={onBack}>Getränke abbrechen</button>
    </div>
  );
});

describe('EventForm', () => {
  const getInlineCalculateButton = () => document.querySelector('.events-form-actions .events-primary-btn');

  beforeEach(() => {
    jest.clearAllMocks();
    mockCalculateEventDrinks.mockResolvedValue({ eventId: 'event-1' });
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        {
          id: 'g1',
          vorname: 'Anna',
          nachname: 'Beispiel',
          alkoholischeGetränke: true,
          bevorzugteGetränke: ['custom-wasser'],
          präferenzFaktor: 1,
        },
        {
          id: 'g2',
          vorname: 'Tom',
          nachname: 'Kind',
          kind: true,
          alkoholischeGetränke: false,
          bevorzugteGetränke: [],
          präferenzFaktor: 0,
        },
      ]);
      return jest.fn();
    });
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([
        { id: 'custom-wasser', name: 'Wasser (eigen)', kategorie: 'wasser' },
        { id: 'custom-bier', name: 'Bier (eigen)', kategorie: 'bier_alkoholfrei' },
      ]);
      return jest.fn();
    });
  });

  test('submits selected guests, drivers and preference multipliers', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });

    // Open the guest selection sub-page via the manage button
    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));

    // The mock sub-page saves g1 as selected guest and driver
    fireEvent.click(screen.getByRole('button', { name: 'Gäste speichern' }));

    // Submit the main form
    fireEvent.click(getInlineCalculateButton());

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.selectedGuestIds).toEqual(['g1']);
    expect(event.driverGuestIds).toEqual(['g1']);
    expect(event.guestNamesById).toEqual({ g1: 'Anna Beispiel' });
    expect(event.guests.adults).toBe(1);
    expect(event.guestPreferenceMultipliers.perGuest).toHaveLength(1);
    expect(event.guestPreferenceMultipliers.perGuest[0].preferredDrinkIds).toContain('custom-wasser');
    expect(event.guestPreferenceMultipliers.perGuest[0].preferenceFactor).toBe(1);
    expect(event.guestPreferenceMultipliers.perGuest[0].allowsAlcohol).toBe(false);
    expect(onSaved).toHaveBeenCalledWith('event-1');
  });

  test('shows "Gäste verwalten" button when guests are available', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.getByRole('button', { name: 'Gäste verwalten' })).toBeInTheDocument();
  });

  test('shows guest selection sub-page when manage button is clicked', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));

    expect(screen.getByRole('button', { name: 'Gäste speichern' })).toBeInTheDocument();
    expect(getInlineCalculateButton()).not.toBeInTheDocument();
  });

  test('returns to main form when guest sub-page is cancelled', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gäste abbrechen' }));

    expect(getInlineCalculateButton()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gäste speichern' })).not.toBeInTheDocument();
  });

  test('shows guest count summary after selecting guests', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gäste speichern' }));

    expect(screen.getByText(/1 Gast ausgewählt/)).toBeInTheDocument();
    expect(screen.getByText(/1 Fahrer markiert/)).toBeInTheDocument();
  });

  test('counts child guests separately from adults after guest assignment', async () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gäste mit Kind speichern' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Erwachsene')).toHaveValue(1);
      expect(screen.getByLabelText('Kinder')).toHaveValue(1);
    });
  });

  test('submits child guests in the children count instead of adult count', async () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Familienfest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gäste mit Kind speichern' }));
    fireEvent.click(getInlineCalculateButton());

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.guests).toEqual({ adults: 1, children: 1 });
  });

  test('shows only Eigene Getränke section, no Standardkategorien', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.getByText('Eigene Getränke')).toBeInTheDocument();
    expect(screen.queryByText('Standardkategorien')).not.toBeInTheDocument();
  });

  test('shows Getränke verwalten link when no custom drinks and onManageDrinks is provided', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    const onManageDrinks = jest.fn();
    render(
      <EventForm
        onSaved={jest.fn()}
        onCancel={jest.fn()}
        currentUser={{ id: 'u1' }}
        onManageDrinks={onManageDrinks}
      />,
    );

    const manageBtn = screen.getByRole('button', { name: 'Getränke verwalten' });
    expect(manageBtn).toBeInTheDocument();
    fireEvent.click(manageBtn);
    expect(onManageDrinks).toHaveBeenCalledTimes(1);
  });

  test('auto-selects only Mineralwasser on load for new events', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });
    fireEvent.click(getInlineCalculateButton());

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.customDrinkIds).toEqual(['predefined_mineralwasser']);
    expect(event.categories).toEqual(['wasser']);
    expect(event.drinkDistributionFactors).toEqual({});
  });

  test('does not show Getränke verwalten link when onManageDrinks is not provided', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.queryByRole('button', { name: 'Getränke verwalten' })).not.toBeInTheDocument();
  });

  test('uses 25 percent as default puffer for new events', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.getByLabelText('Puffer (%)')).toHaveValue(25);
  });

  test('shows mobile FAB buttons on the new event page', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(document.querySelector('.event-save-fab-button[aria-label="Einkaufsliste berechnen"]')).toBeInTheDocument();
    expect(document.querySelector('.events-cancel-fab-button[aria-label="Neues Event abbrechen"]')).toBeInTheDocument();
  });

  test('new event cancel FAB calls onCancel', () => {
    const onCancel = jest.fn();
    render(<EventForm onSaved={jest.fn()} onCancel={onCancel} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Neues Event abbrechen' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('shows "Event bearbeiten" title and "Berechnung aktualisieren" button when initialEvent is provided', () => {
    const initialEvent = {
      id: 'event-42',
      eventName: 'Geburtstag',
      date: '2025-06-15',
      durationHours: 5,
      guests: { adults: 8, children: 2 },
      eventType: 'party',
      customDrinkIds: ['custom-wasser'],
      selectedGuestIds: [],
      pufferProzent: 10,
    };
    render(
      <EventForm
        onSaved={jest.fn()}
        onCancel={jest.fn()}
        currentUser={{ id: 'u1' }}
        initialEvent={initialEvent}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Event bearbeiten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Berechnung aktualisieren' })).toBeInTheDocument();
  });

  test('shows delete button on the edit page and calls onDelete', () => {
    const onDelete = jest.fn();
    const initialEvent = {
      id: 'event-42',
      eventName: 'Geburtstag',
      date: '2025-06-15',
      durationHours: 5,
      guests: { adults: 8, children: 2 },
      eventType: 'party',
      customDrinkIds: ['custom-wasser'],
      selectedGuestIds: [],
      pufferProzent: 10,
    };
    render(
      <EventForm
        onSaved={jest.fn()}
        onCancel={jest.fn()}
        onDelete={onDelete}
        currentUser={{ id: 'u1' }}
        initialEvent={initialEvent}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('does not show delete button for new events', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
  });

  test('pre-populates form fields from initialEvent', () => {
    const initialEvent = {
      id: 'event-42',
      eventName: 'Geburtstag',
      date: '2025-06-15',
      startTime: '14:30',
      durationHours: 5,
      guests: { adults: 8, children: 2 },
      eventType: 'party',
      customDrinkIds: ['custom-wasser'],
      selectedGuestIds: [],
      pufferProzent: 10,
    };
    render(
      <EventForm
        onSaved={jest.fn()}
        onCancel={jest.fn()}
        currentUser={{ id: 'u1' }}
        initialEvent={initialEvent}
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Geburtstag');
    expect(screen.getByLabelText('Dauer (Stunden)')).toHaveValue(5);
    expect(screen.getByLabelText('Startuhrzeit')).toHaveValue('14:30');
    expect(screen.getByLabelText('Erwachsene')).toHaveValue(8);
    expect(screen.getByLabelText('Kinder')).toHaveValue(2);
    expect(screen.getByLabelText('Puffer (%)')).toHaveValue(10);
  });

  test('passes eventId to calculateEventDrinks when editing', async () => {
    const onSaved = jest.fn();
    const initialEvent = {
      id: 'event-42',
      eventName: 'Geburtstag',
      date: '2025-06-15',
      durationHours: 5,
      guests: { adults: 8, children: 2 },
      eventType: 'party',
      customDrinkIds: ['custom-wasser'],
      selectedGuestIds: [],
      pufferProzent: 10,
    };
    mockCalculateEventDrinks.mockResolvedValue({ eventId: 'event-42' });
    render(
      <EventForm
        onSaved={onSaved}
        onCancel={jest.fn()}
        currentUser={{ id: 'u1' }}
        initialEvent={initialEvent}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Berechnung aktualisieren' }));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [, eventId] = mockCalculateEventDrinks.mock.calls[0];
    expect(eventId).toBe('event-42');
    expect(onSaved).toHaveBeenCalledWith('event-42');
  });

  test('passes startTime to calculateEventDrinks when provided', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nachmittagsfest' } });
    fireEvent.change(screen.getByLabelText('Startuhrzeit'), { target: { value: '14:00' } });
    fireEvent.click(getInlineCalculateButton());

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.startTime).toBe('14:00');
  });

  test('omits startTime from event when not provided', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });
    fireEvent.click(getInlineCalculateButton());

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.startTime).toBeUndefined();
  });


  test('does not auto-select all drinks when editing (respects initialEvent customDrinkIds)', async () => {
    const onSaved = jest.fn();
    const initialEvent = {
      id: 'event-42',
      eventName: 'Geburtstag',
      date: '2025-06-15',
      durationHours: 5,
      guests: { adults: 8, children: 2 },
      eventType: 'party',
      customDrinkIds: ['custom-wasser'],
      selectedGuestIds: [],
      pufferProzent: 10,
    };
    mockCalculateEventDrinks.mockResolvedValue({ eventId: 'event-42' });
    render(
      <EventForm
        onSaved={onSaved}
        onCancel={jest.fn()}
        currentUser={{ id: 'u1' }}
        initialEvent={initialEvent}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Berechnung aktualisieren' }));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    // Only the drink from initialEvent should be selected, not all available drinks
    expect(event.customDrinkIds).toEqual(['custom-wasser']);
    expect(event.categories).toEqual(['wasser']);
  });

  test('shows Anlass field directly after Name field', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    const formFields = Array.from(document.querySelectorAll('.events-form-field, .events-form-row'));
    const nameIndex = formFields.findIndex((el) => el.querySelector('input[type="text"]'));
    const anlassIndex = formFields.findIndex((el) => el.querySelector('select'));
    expect(anlassIndex).toBe(nameIndex + 1);
  });

  test('shows "Getränke verwalten" button when custom drinks are available', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.getByRole('button', { name: 'Getränke verwalten' })).toBeInTheDocument();
  });

  test('shows drink selection sub-page when Getränke verwalten button is clicked', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränke verwalten' }));

    expect(screen.getByRole('button', { name: 'Getränke speichern' })).toBeInTheDocument();
    expect(getInlineCalculateButton()).not.toBeInTheDocument();
  });

  test('returns to main form when drink sub-page is cancelled', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränke verwalten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Getränke abbrechen' }));

    expect(getInlineCalculateButton()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Getränke speichern' })).not.toBeInTheDocument();
  });

  test('updates selected drinks when drink sub-page is saved', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränke verwalten' }));
    // Mock sub-page saves only custom-wasser
    fireEvent.click(screen.getByRole('button', { name: 'Getränke speichern' }));

    // Now submit the form - should use the saved drink ids
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });
    fireEvent.click(getInlineCalculateButton());

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.customDrinkIds).toEqual(['custom-wasser']);
    expect(event.drinkDistributionFactors).toEqual({ 'custom-wasser': 1.4 });
  });

  test('does not show "Getränke nach Gästewunsch filtern" button', () => {
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.queryByRole('button', { name: /Getränke nach Gästewunsch/ })).not.toBeInTheDocument();
  });
});
