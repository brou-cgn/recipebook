import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EventsPage from './EventsPage';

const mockDeleteEvent = jest.fn();
const mockGetEvent = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
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
  DEFAULT_BUTTON_ICONS: { addRecipe: 'Menü+', editRecipe: 'Edit' },
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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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
        events={[otherEvent]}
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
    const onCloseLinkedEventDetail = jest.fn();

    render(<EventsPage currentUser={currentUser} events={[event]} onCloseLinkedEventDetail={onCloseLinkedEventDetail} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

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

    render(<EventsPage currentUser={currentUser} events={[event]} />);

    fireEvent.click(screen.getByText('Bierfest'));

    expect(screen.getAllByText('Craft Bier')).toHaveLength(2);
    expect(screen.getByText('15,5 l')).toBeInTheDocument();
  });

  describe('admin cross-user event visibility', () => {
    const adminUser = { id: 'admin1', isAdmin: true };

    test('non-admins do not see events from other users, even if allEvents is populated', () => {
      render(
        <EventsPage
          currentUser={currentUser}
          allEvents={[{ id: 'x', eventName: 'Fremdes Fest', ownerId: 'other-user' }]}
        />
      );
      expect(screen.queryByText('Fremdes Fest')).not.toBeInTheDocument();
    });

    test('admins always see all users\' events and can edit another user\'s event', async () => {
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

      render(<EventsPage currentUser={adminUser} allEvents={[othersEvent]} />);

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

  describe('swipe-delete', () => {
    const createTouchEvent = (clientX, clientY) => ({
      touches: [{ clientX, clientY }],
      cancelable: false,
      preventDefault: jest.fn(),
    });

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

    test('swipe-delete button appears after swiping an event card left', async () => {
      render(<EventsPage currentUser={currentUser} events={[event]} />);

      const eventCardContent = screen.getByText('Sommerfest').closest('.events-card-swipe-content');
      expect(eventCardContent).toBeInTheDocument();

      fireEvent.touchStart(eventCardContent, createTouchEvent(200, 100));
      fireEvent.touchMove(eventCardContent, createTouchEvent(130, 100));
      fireEvent.touchEnd(eventCardContent, {});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sommerfest löschen' })).toBeInTheDocument();
      });
    });

    test('clicking swipe-delete button hides the event immediately and shows an undo banner, without calling deleteEvent yet', async () => {
      mockDeleteEvent.mockResolvedValue(undefined);

      render(<EventsPage currentUser={currentUser} events={[event]} />);

      const eventCardContent = screen.getByText('Sommerfest').closest('.events-card-swipe-content');
      fireEvent.touchStart(eventCardContent, createTouchEvent(200, 100));
      fireEvent.touchMove(eventCardContent, createTouchEvent(130, 100));
      fireEvent.touchEnd(eventCardContent, {});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sommerfest löschen' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Sommerfest löschen' }));

      expect(screen.queryByText('Sommerfest')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('"Sommerfest" gelöscht.');
      expect(mockDeleteEvent).not.toHaveBeenCalled();
    });

    test('deletes the event only after the undo window passes without a click on "Rückgängig"', async () => {
      jest.useFakeTimers();
      try {
        mockDeleteEvent.mockResolvedValue(undefined);

        render(<EventsPage currentUser={currentUser} events={[event]} />);

        const eventCardContent = screen.getByText('Sommerfest').closest('.events-card-swipe-content');
        fireEvent.touchStart(eventCardContent, createTouchEvent(200, 100));
        fireEvent.touchMove(eventCardContent, createTouchEvent(130, 100));
        fireEvent.touchEnd(eventCardContent, {});
        fireEvent.click(screen.getByRole('button', { name: 'Sommerfest löschen' }));

        expect(mockDeleteEvent).not.toHaveBeenCalled();

        await act(async () => {
          jest.advanceTimersByTime(6000);
        });

        expect(mockDeleteEvent).toHaveBeenCalledWith(currentUser.id, 'e1');
      } finally {
        jest.useRealTimers();
      }
    });

    test('clicking "Rückgängig" restores the event and never calls deleteEvent', async () => {
      jest.useFakeTimers();
      try {
        mockDeleteEvent.mockResolvedValue(undefined);

        render(<EventsPage currentUser={currentUser} events={[event]} />);

        const eventCardContent = screen.getByText('Sommerfest').closest('.events-card-swipe-content');
        fireEvent.touchStart(eventCardContent, createTouchEvent(200, 100));
        fireEvent.touchMove(eventCardContent, createTouchEvent(130, 100));
        fireEvent.touchEnd(eventCardContent, {});
        fireEvent.click(screen.getByRole('button', { name: 'Sommerfest löschen' }));

        fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));

        expect(screen.getByText('Sommerfest')).toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        await act(async () => {
          jest.advanceTimersByTime(6000);
        });

        expect(mockDeleteEvent).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
