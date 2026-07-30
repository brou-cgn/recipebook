import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EventsPage from './EventsPage';

const mockSubscribeToEvents = jest.fn();
const mockDeleteEvent = jest.fn();
const mockGetEvent = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToEvents: (...args) => mockSubscribeToEvents(...args),
  deleteEvent: (...args) => mockDeleteEvent(...args),
  getEvent: (...args) => mockGetEvent(...args),
}));

jest.mock('./EventForm', () => function MockEventForm() {
  return <div>EventForm geöffnet</div>;
});

jest.mock('./ConsumptionForm', () => function MockConsumptionForm() {
  return <div>ConsumptionForm geöffnet</div>;
});

jest.mock('./DrinkManagementPage', () => function MockDrinkManagementPage() {
  return <div>DrinkManagementPage geöffnet</div>;
});

jest.mock('./GuestManagementPage', () => function MockGuestManagementPage() {
  return <div>GuestManagementPage geöffnet</div>;
});

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: () => true,
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ addMenu: 'Menü+' }),
  DEFAULT_BUTTON_ICONS: { addMenu: 'Menü+' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: () => false,
}));

describe('EventsPage', () => {
  const currentUser = { id: 'u1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    mockGetEvent.mockResolvedValue(null);
  });

  test('renders the mobile add FAB in the empty state and opens the event form', () => {
    render(<EventsPage currentUser={currentUser} />);

    const fabButton = screen.getByRole('button', { name: 'Event erstellen' });
    expect(fabButton).toBeInTheDocument();

    fireEvent.click(fabButton);
    expect(screen.getByText('EventForm geöffnet')).toBeInTheDocument();
  });
});
