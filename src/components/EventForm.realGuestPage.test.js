import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EventForm from './EventForm';

// Integration test using the REAL EventGuestSelectionPage (unlike
// EventForm.test.js, which mocks it out) - to catch bugs at the seam between
// its own undoable-delete staging and EventForm's guest-sync push, which a
// mocked sub-page can't exercise.

const mockCalculateEventDrinks = jest.fn();
const mockSubscribeToGuestProfiles = jest.fn();
const mockSubscribeToAllCustomDrinks = jest.fn();
const mockGetMenusByEventId = jest.fn();
const mockUpdateMenu = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  EVENT_TYPES: ['party'],
  deriveSeason: jest.fn(() => 'sommer'),
  calculateEventDrinks: (...args) => mockCalculateEventDrinks(...args),
  subscribeToGuestProfiles: (...args) => mockSubscribeToGuestProfiles(...args),
  subscribeToAllCustomDrinks: (...args) => mockSubscribeToAllCustomDrinks(...args),
}));

jest.mock('../utils/menuFirestore', () => ({
  getMenusByEventId: (...args) => mockGetMenusByEventId(...args),
  updateMenu: (...args) => mockUpdateMenu(...args),
}));

jest.mock('./EventDrinkSelectionPage', () => function MockEventDrinkSelectionPage() {
  return <div>Getränkeauswahl</div>;
});

describe('EventForm + real EventGuestSelectionPage - guest removal sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCalculateEventDrinks.mockResolvedValue({ eventId: 'event-42' });
    mockGetMenusByEventId.mockResolvedValue([
      { id: 'menu-1', sections: [], descriptionGuestIds: ['g1', 'g2'] },
    ]);
    mockUpdateMenu.mockResolvedValue();
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        { id: 'g1', vorname: 'Anna', nachname: 'Beispiel' },
        { id: 'g2', vorname: 'Ben', nachname: 'Muster' },
      ]);
      return jest.fn();
    });
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([]);
      return jest.fn();
    });
  });

  test('removing a guest via the desktop delete button and saving the sub-page pushes the removal to linked menus immediately', async () => {
    const initialEvent = {
      id: 'event-42',
      eventName: 'Geburtstag',
      date: '2025-06-15',
      durationHours: 5,
      guests: { adults: 2, children: 0 },
      eventType: 'party',
      customDrinkIds: [],
      selectedGuestIds: ['g1', 'g2'],
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

    fireEvent.click(screen.getByRole('button', { name: 'Gäste verwalten' }));

    // Real sub-page: remove Anna via the always-visible desktop delete button.
    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Anna Beispiel entfernen'));
    expect(screen.queryByText('Anna Beispiel', { selector: '.events-guest-row-name' })).not.toBeInTheDocument();

    // Save the sub-page's own form immediately (within the 6s undo window).
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(mockUpdateMenu).toHaveBeenCalled());
    expect(mockGetMenusByEventId).toHaveBeenCalledWith('u1', 'event-42');
    const [menuId, updates] = mockUpdateMenu.mock.calls[0];
    expect(menuId).toBe('menu-1');
    expect(updates.descriptionGuestIds).toEqual(['g2']);
    expect(mockCalculateEventDrinks).not.toHaveBeenCalled();
  });
});
