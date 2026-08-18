import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import EventsPage from './EventsPage';

const mockSubscribeToEvents = jest.fn();
const mockSubscribeToAllEvents = jest.fn();
const mockDeleteEvent = jest.fn();
const mockGetEvent = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToEvents: (...args) => mockSubscribeToEvents(...args),
  subscribeToAllEvents: (...args) => mockSubscribeToAllEvents(...args),
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
  getUsers: () => Promise.resolve([]),
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
    mockSubscribeToAllEvents.mockImplementation((cb) => {
      cb([]);
      return jest.fn();
    });
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

  test('pendingEventDetailRequest opens the linked event directly, without flashing the events overview', async () => {
    const otherEvent = {
      id: 'other',
      eventName: 'Anderes Event',
      date: '2025-08-01',
      durationHours: 2,
      eventType: 'party',
      status: 'geplant',
      guests: { adults: 1, children: 0 },
      berechnung: { ergebnis: [] },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([otherEvent]);
      return jest.fn();
    });
    const linkedEvent = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 10, children: 0 },
      berechnung: { ergebnis: [] },
    };
    let resolveGetEvent;
    mockGetEvent.mockImplementation(() => new Promise((resolve) => { resolveGetEvent = resolve; }));

    render(
      <EventsPage
        currentUser={currentUser}
        pendingEventDetailRequest={{ ownerId: 'owner-1', eventId: 'e1' }}
        onPendingEventDetailRequestHandled={() => {}}
      />
    );

    // While the linked event is still loading, the full events overview (list of
    // all events, "Getränke verwalten" links, ...) must not be shown.
    expect(screen.queryByRole('heading', { name: 'Events' })).toBeNull();
    expect(screen.queryByText('Getränke verwalten')).toBeNull();
    expect(screen.queryByText('Anderes Event')).toBeNull();

    await act(async () => {
      resolveGetEvent(linkedEvent);
      await Promise.resolve();
    });

    expect(await screen.findByRole('heading', { name: 'Sommerfest' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Events' })).toBeNull();
    expect(screen.queryByText('Anderes Event')).toBeNull();
  });

  test('pendingEventDetailRequest still resolves when the parent clears the request immediately (like App.js does), instead of getting stuck on "Laden..."', async () => {
    const linkedEvent = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 10, children: 0 },
      berechnung: { ergebnis: [] },
    };
    let resolveGetEvent;
    mockGetEvent.mockImplementation(() => new Promise((resolve) => { resolveGetEvent = resolve; }));

    // Mirrors App.js: onPendingEventDetailRequestHandled synchronously clears
    // pendingEventDetailRequest, which changes the prop EventsPage receives.
    function Wrapper() {
      const [pendingEventDetailRequest, setPendingEventDetailRequest] = React.useState({ ownerId: 'owner-1', eventId: 'e1' });
      return (
        <EventsPage
          currentUser={currentUser}
          pendingEventDetailRequest={pendingEventDetailRequest}
          onPendingEventDetailRequestHandled={() => setPendingEventDetailRequest(null)}
        />
      );
    }

    render(<Wrapper />);

    expect(screen.getByText('Laden...')).toBeInTheDocument();

    await act(async () => {
      resolveGetEvent(linkedEvent);
      await Promise.resolve();
    });

    // Must resolve to the linked event's detail card, not stay stuck on "Laden...".
    expect(await screen.findByRole('heading', { name: 'Sommerfest' })).toBeInTheDocument();
    expect(screen.queryByText('Laden...')).toBeNull();
  });

  test('closing an event opened via pendingEventDetailRequest calls onCloseLinkedEventDetail instead of showing the events list', async () => {
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    const linkedEvent = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 10, children: 0 },
      berechnung: { ergebnis: [] },
    };
    mockGetEvent.mockResolvedValue(linkedEvent);
    const onCloseLinkedEventDetail = jest.fn();

    render(
      <EventsPage
        currentUser={currentUser}
        pendingEventDetailRequest={{ ownerId: 'owner-1', eventId: 'e1' }}
        onPendingEventDetailRequestHandled={() => {}}
        onCloseLinkedEventDetail={onCloseLinkedEventDetail}
      />
    );

    expect(await screen.findByRole('heading', { name: 'Sommerfest' })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zum Menü'));

    expect(onCloseLinkedEventDetail).toHaveBeenCalledTimes(1);
    // The events overview must not appear after closing back to the menu.
    expect(screen.queryByRole('heading', { name: 'Events' })).toBeNull();
  });

  test('closing an event opened from the list falls back to the events overview, not onCloseLinkedEventDetail', () => {
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
    const onCloseLinkedEventDetail = jest.fn();

    render(<EventsPage currentUser={currentUser} onCloseLinkedEventDetail={onCloseLinkedEventDetail} />);

    fireEvent.click(screen.getByText('Sommerfest'));
    expect(screen.getByTitle('Zurück zur Liste')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zur Liste'));

    expect(onCloseLinkedEventDetail).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
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

  test('shows the "Eingekauft" status badge and the Einkauf & Verbrauch button for status eingekauft', () => {
    const event = {
      id: 'e1',
      eventName: 'Sommerfest',
      date: '2025-07-01',
      durationHours: 4,
      eventType: 'party',
      status: 'eingekauft',
      guests: { adults: 10, children: 0 },
      berechnung: { ergebnis: [] },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    expect(screen.getByText('Eingekauft')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Sommerfest'));

    expect(screen.getByRole('button', { name: 'Einkauf & Verbrauch' })).toBeInTheDocument();
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

  test('shows Bedarf only once per drink in detail view, even when multiple Einheiten are selected', () => {
    const event = {
      id: 'e7',
      eventName: 'Bierfest',
      date: '2026-01-10',
      durationHours: 3,
      eventType: 'party',
      status: 'berechnet',
      guests: { adults: 20, children: 0 },
      berechnung: {
        ergebnis: [
          {
            kategorie: 'custom_1:0',
            drinkId: 'custom_1',
            drinkLabel: 'Craft Bier',
            literMitPuffer: 24,
            isCustomDrink: true,
            einheitIdx: 0,
          },
          {
            kategorie: 'custom_1:1',
            drinkId: 'custom_1',
            drinkLabel: 'Craft Bier',
            literMitPuffer: 24,
            isCustomDrink: true,
            einheitIdx: 1,
          },
        ],
      },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Bierfest'));

    expect(screen.getAllByText('Craft Bier')).toHaveLength(1);
    expect(screen.getAllByText(/24,0 l/)).toHaveLength(1);
  });

  test('shows tatsächlicher Verbrauch table with resolved custom drink names when status is verbrauchErfasst', () => {
    const event = {
      id: 'e8',
      eventName: 'Gartenparty',
      date: '2026-06-01',
      durationHours: 6,
      eventType: 'party',
      status: 'verbrauchErfasst',
      guests: { adults: 8, children: 0 },
      berechnung: {
        ergebnis: [
          {
            kategorie: 'custom_2',
            drinkId: 'custom_2',
            drinkLabel: 'Mineralwasser',
            literMitPuffer: 7.1,
            isCustomDrink: true,
            gebindeGroesseLiter: 1.5,
          },
        ],
      },
      istVerbrauch: { custom_2: 6.75 },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Gartenparty'));

    expect(screen.getByText('Tatsächlicher Verbrauch')).toBeInTheDocument();
    expect(screen.getAllByText('Mineralwasser')).toHaveLength(2);
    expect(screen.getByText('6,8 l')).toBeInTheDocument();
  });

  test('consolidates tatsächlicher Verbrauch per Getränk, even when multiple Einheiten wurden erfasst', () => {
    const event = {
      id: 'e9',
      eventName: 'Bierfest',
      date: '2026-01-10',
      durationHours: 3,
      eventType: 'party',
      status: 'verbrauchErfasst',
      guests: { adults: 20, children: 0 },
      berechnung: {
        ergebnis: [
          {
            kategorie: 'custom_1:0',
            drinkId: 'custom_1',
            drinkLabel: 'Craft Bier',
            literMitPuffer: 24,
            isCustomDrink: true,
            einheitIdx: 0,
          },
          {
            kategorie: 'custom_1:1',
            drinkId: 'custom_1',
            drinkLabel: 'Craft Bier',
            literMitPuffer: 24,
            isCustomDrink: true,
            einheitIdx: 1,
          },
        ],
      },
      istVerbrauch: { 'custom_1:0': 10, 'custom_1:1': 5.5 },
    };
    mockSubscribeToEvents.mockImplementation((_uid, cb) => {
      cb([event]);
      return jest.fn();
    });

    render(<EventsPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Bierfest'));

    expect(screen.getAllByText('Craft Bier')).toHaveLength(2);
    expect(screen.getByText('15,5 l')).toBeInTheDocument();
  });

  describe('admin cross-user event visibility', () => {
    const adminUser = { id: 'admin1', isAdmin: true };

    test('non-admins do not see the "Alle Anwender" toggle', () => {
      render(<EventsPage currentUser={currentUser} />);
      expect(screen.queryByRole('button', { name: 'Alle Anwender' })).not.toBeInTheDocument();
    });

    test('admin can switch to "Alle Anwender" and edit another user\'s event', async () => {
      const othersEvent = {
        id: 'e1',
        eventName: 'Fremdes Fest',
        date: '2025-07-01',
        durationHours: 4,
        eventType: 'party',
        status: 'berechnet',
        guests: { adults: 10, children: 0 },
        berechnung: { ergebnis: [] },
        ownerId: 'other-user',
      };
      mockSubscribeToAllEvents.mockImplementation((cb) => {
        cb([othersEvent]);
        return jest.fn();
      });

      render(<EventsPage currentUser={adminUser} />);

      fireEvent.click(screen.getByRole('button', { name: 'Alle Anwender' }));
      expect(await screen.findByText('Fremdes Fest')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Fremdes Fest'));

      expect(await screen.findByRole('heading', { name: 'Fremdes Fest' })).toBeInTheDocument();
      // Admins have full edit access to every user's events.
      const editButton = screen.getByRole('button', { name: 'Bearbeiten' });
      expect(editButton).toBeInTheDocument();

      fireEvent.click(editButton);
      expect(screen.getByText('EventForm geöffnet')).toBeInTheDocument();
    });
  });
});
