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

  test('submits selected guests and preference multipliers', async () => {
    const onSaved = jest.fn();
    render(<EventForm onSaved={onSaved} onCancel={jest.fn()} currentUser={{ id: 'u1' }} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sommerfest' } });
    fireEvent.click(screen.getByLabelText('Anna Beispiel'));
    fireEvent.click(screen.getByRole('button', { name: 'Einkaufsliste berechnen' }));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalledTimes(1));
    const [event] = mockCalculateEventDrinks.mock.calls[0];
    expect(event.selectedGuestIds).toEqual(['g1']);
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
});
