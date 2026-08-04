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

jest.mock('./EventForm', () => {
  function MockEventForm() {
    return <div>EventForm geöffnet</div>;
  }
  MockEventForm.CATEGORY_LABELS = {};
  MockEventForm.EVENT_TYPE_LABELS = { party: 'Party' };
  return {
    __esModule: true,
    default: MockEventForm,
    CATEGORY_LABELS: {},
    EVENT_TYPE_LABELS: { party: 'Party' },
  };
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
  getButtonIcons: () => new Promise(() => {}),
  DEFAULT_BUTTON_ICONS: { addMenu: 'Menü+', editRecipe: 'Edit' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

jest.mock('../utils/imageUtils', () => ({
  isBase64Image: () => false,
}));

describe('EventsPage', () => {
  const currentUser = { id: 'u1' };
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    mockGetEvent.mockResolvedValue(null);
  });

  afterAll(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
  });

  test('renders the mobile add FAB in the empty state and opens the event form', () => {
    render(<EventsPage currentUser={currentUser} />);

    const fabButton = screen.getByRole('button', { name: 'Event erstellen' });
    expect(fabButton).toBeInTheDocument();

    fireEvent.click(fabButton);
    expect(screen.getByText('EventForm geöffnet')).toBeInTheDocument();
  });

  test('shows desktop Bearbeiten button in detail view and opens edit form', () => {
    const event = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 10, children: 0 },
      berechnung: { ergebnis: [] },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    // Click the event card to open detail view
    fireEvent.click(screen.getByText('Sommerfest'));

    expect(screen.getByRole('button', { name: 'Bearbeiten' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByText('EventForm geöffnet')).toBeInTheDocument();
  });

  test('shows mobile edit FAB in detail view and removes inline edit and delete buttons', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 480 });
    window.dispatchEvent(new Event('resize'));
    const event = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 10, children: 0 },
      berechnung: { ergebnis: [] },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Sommerfest'));

    expect(screen.getByRole('button', { name: 'Event bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Event bearbeiten' }));
    expect(screen.getByText('EventForm geöffnet')).toBeInTheDocument();
  });

  test('shows marked drivers on the event detail card', () => {
    const event = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 10, children: 0 },
      driverGuestIds: ['g1'],
      guestNamesById: { g1: 'Anna Beispiel' },
      berechnung: { ergebnis: [] },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Sommerfest'));

    expect(screen.getByText('Fahrer: Anna Beispiel')).toBeInTheDocument();
  });

  test('does not show drink summary on event card when status is berechnet but only categories are present', () => {
    const event = {
      id: 'e2',
      eventName: 'Grillfest',
      date: '2025-08-10',
      eventType: 'party',
      status: 'berechnet',
      berechnung: {
        ergebnis: [
          { kategorie: 'wasser', literMitPuffer: 50 },
          { kategorie: 'softdrinks', literMitPuffer: 30 },
        ],
      },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    expect(screen.queryByText(/~50L wasser/)).not.toBeInTheDocument();
    expect(screen.queryByText(/~30L softdrinks/)).not.toBeInTheDocument();
  });

  test('does not show drink summary on event card when status is verbrauchErfasst', () => {
    const event = {
      id: 'e3',
      eventName: 'Familienfeier',
      date: '2025-09-05',
      eventType: 'party',
      status: 'verbrauchErfasst',
      berechnung: {
        ergebnis: [
          { kategorie: 'bier', literMitPuffer: 20 },
          { kategorie: 'custom_1', literMitPuffer: 10, isCustomDrink: true, drinkLabel: 'Bitburger 0,0%' },
        ],
      },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    expect(screen.queryByText(/~10L Bitburger/)).not.toBeInTheDocument();
    expect(screen.queryByText(/~20L bier/)).not.toBeInTheDocument();
  });

  test('does not show drink summary on event card when status is geplant', () => {
    const event = {
      id: 'e4',
      eventName: 'Planungsparty',
      date: '2025-10-01',
      eventType: 'party',
      status: 'geplant',
      berechnung: {
        ergebnis: [
          { kategorie: 'wasser', literMitPuffer: 40 },
        ],
      },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    expect(screen.queryByText(/~40L/)).not.toBeInTheDocument();
  });

  test('does not show drink summary when berechnung has no ergebnis', () => {
    const event = {
      id: 'e5',
      eventName: 'Leeres Event',
      date: '2025-11-01',
      eventType: 'party',
      status: 'berechnet',
      berechnung: { ergebnis: [] },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    expect(screen.queryByText(/events-card-drink-summary/)).not.toBeInTheDocument();
    expect(screen.queryByText(/~.*L/)).not.toBeInTheDocument();
  });

  test('does not show custom drink label in summary on event card', () => {
    const event = {
      id: 'e6',
      eventName: 'Spezialparty',
      date: '2025-12-01',
      eventType: 'party',
      status: 'berechnet',
      berechnung: {
        ergebnis: [
          { kategorie: 'custom_1', literMitPuffer: 15, isCustomDrink: true, drinkLabel: 'Craft Bier' },
        ],
      },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    expect(screen.queryByText(/~15L Craft Bier/)).not.toBeInTheDocument();
  });
});
