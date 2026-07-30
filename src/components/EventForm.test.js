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

describe('EventForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCalculateEventDrinks.mockResolvedValue({ eventId: 'event-1' });
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        {
          id: 'g1',
          vorname: 'Anna',
          nachname: 'Beispiel',
          alkoholischeGetränke: false,
          bevorzugteGetränke: ['custom-wasser'],
          präferenzFaktor: 1,
        },
      ]);
      return jest.fn();
    });
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([
        { id: 'custom-wasser', name: 'Wasser (eigen)' },
        { id: 'custom-bier', name: 'Bier (eigen)' },
      ]);
      return jest.fn();
    });
  });

  test('submits selected guests, drivers and preference multipliers', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });
    fireEvent.change(screen.getByLabelText('Gast auswählen'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gast hinzufügen' }));
    fireEvent.click(screen.getByLabelText('Anna Beispiel als Fahrer markieren'));
    fireEvent.click(screen.getByRole('button', { name: 'Einkaufsliste berechnen' }));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.selectedGuestIds).toEqual(['g1']);
    expect(event.driverGuestIds).toEqual(['g1']);
    expect(event.guestNamesById).toEqual({ g1: 'Anna Beispiel' });
    expect(event.guests.adults).toBe(1);
    expect(event.guestPreferenceMultipliers['custom-wasser']).toBe(1);
    expect(event.guestPreferenceMultipliers['custom-bier']).toBe(0);
    expect(onSaved).toHaveBeenCalledWith('event-1');
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

  test('auto-selects custom drinks on load', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einkaufsliste berechnen' }));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.customDrinkIds).toEqual(['custom-wasser', 'custom-bier']);
    expect(event.categories).toEqual([]);
  });

  test('does not show Getränke verwalten link when onManageDrinks is not provided', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    render(<EventForm onSaved={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    expect(screen.queryByRole('button', { name: 'Getränke verwalten' })).not.toBeInTheDocument();
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

  test('pre-populates form fields from initialEvent', () => {
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

    expect(screen.getByLabelText('Name')).toHaveValue('Geburtstag');
    expect(screen.getByLabelText('Dauer (Stunden)')).toHaveValue(5);
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
  });
});
