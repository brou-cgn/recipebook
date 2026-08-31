import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import MenuForm from './MenuForm';

const mockSubscribeToCustomDrinks = jest.fn();
const mockSubscribeToEvent = jest.fn();
const mockSaveCustomDrink = jest.fn();
const mockCalculateEventDrinks = jest.fn();
const mockGetEvent = jest.fn();
const mockUpdateMenu = jest.fn();

jest.mock('../utils/userFavorites', () => ({
  getUserFavorites: () => Promise.resolve([]),
}));

jest.mock('../utils/menuSections', () => {
  const actual = jest.requireActual('../utils/menuSections');
  return {
    ...actual,
    getSavedSections: () => actual.getDefaultSections(),
    saveSectionNames: jest.fn(),
  };
});

jest.mock('../utils/imageUtils', () => ({
  fileToBase64: jest.fn(),
  compressImage: jest.fn(),
  selectMenuGridImages: jest.fn(() => []),
  buildMenuGridImage: jest.fn(() => Promise.resolve(null)),
  isBase64Image: jest.fn(() => false),
}));

jest.mock('../utils/storageUtils', () => ({
  uploadMenuGridImage: jest.fn(() => Promise.resolve('')),
  uploadMenuGridImageDark: jest.fn(() => Promise.resolve('')),
  deleteMenuGridImage: jest.fn(() => Promise.resolve()),
  deleteMenuGridImageDark: jest.fn(() => Promise.resolve()),
  isStorageUrl: jest.fn(() => false),
}));

jest.mock('../utils/customLists', () => ({
  DEFAULT_BUTTON_ICONS: {},
  getEffectiveIcon: (icons, key) => (icons && icons[key]) || '',
  getDarkModePreference: () => false,
  getButtonIcons: () => Promise.resolve({}),
}));

jest.mock('../utils/categoryImages', () => ({
  getCategoryImages: () => Promise.resolve([]),
}));

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToEvent: (...args) => mockSubscribeToEvent(...args),
  subscribeToCustomDrinks: (...args) => mockSubscribeToCustomDrinks(...args),
  saveCustomDrink: (...args) => mockSaveCustomDrink(...args),
  calculateEventDrinks: (...args) => mockCalculateEventDrinks(...args),
  getEvent: (...args) => mockGetEvent(...args),
}));

jest.mock('../utils/menuFirestore', () => ({
  updateMenu: (...args) => mockUpdateMenu(...args),
}));

jest.mock('./DrinkManagementPage', () => function MockDrinkManagementPage() {
  return <div>Getränkeverwaltung</div>;
});

jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: jest.fn(),
  PointerSensor: jest.fn(),
  TouchSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}));

const mockSortableContextItemsCalls = [];
jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children, items }) => {
    mockSortableContextItemsCalls.push(items);
    return <div>{children}</div>;
  },
  arrayMove: jest.fn((array, oldIndex, newIndex) => {
    const newArray = [...array];
    const [item] = newArray.splice(oldIndex, 1);
    newArray.splice(newIndex, 0, item);
    return newArray;
  }),
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

let capturedEventFormProps = null;
jest.mock('./EventForm', () => function MockEventForm(props) {
  capturedEventFormProps = props;
  return <div>Neues Event Formular</div>;
});

const currentUser = { id: 'user-1' };

const customDrinks = [
  { id: 'drink-cola', name: 'Cola', kategorie: 'softdrinks', einheiten: [{ einheitsgroesse: 0.5 }] },
  { id: 'drink-apfelsaft', name: 'Apfelsaft', kategorie: 'saft', einheiten: [{ einheitsgroesse: 1 }] },
];

const recipes = [
  { id: 'recipe-1', title: 'Nudelsalat', portionen: 4, ingredients: [] },
  { id: 'recipe-2', title: 'Mojito', portionen: 1, ingredients: [], speisekategorie: ['Drinks'] },
];

const guests = [
  { id: 'guest-1', vorname: 'Anna', nachname: 'Adler' },
  { id: 'guest-2', vorname: 'Ben', nachname: 'Beispiel' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockSortableContextItemsCalls.length = 0;
  capturedEventFormProps = null;
  mockSubscribeToCustomDrinks.mockImplementation((uid, callback) => {
    callback(customDrinks);
    return () => {};
  });
  mockSubscribeToEvent.mockImplementation(() => () => {});
  mockSaveCustomDrink.mockResolvedValue('drink-new-mojito');
  mockUpdateMenu.mockResolvedValue();
  mockGetEvent.mockResolvedValue(null);
});

describe('MenuForm - description field guest pills', () => {
  test('lets the user tag a guest from the Event module as a pill via typeahead search', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });

    fireEvent.click(await screen.findByText('Anna Adler'));

    expect(screen.getByText('Anna Adler')).toBeInTheDocument();
    // Selected guests drop out of further search results.
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    expect(screen.getByText('Keine Gäste gefunden')).toBeInTheDocument();
  });

  test('removes a tagged guest pill immediately, with an undo snackbar', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Ben' } });
    fireEvent.click(await screen.findByText('Ben Beispiel'));

    fireEvent.click(screen.getByTitle('Ben Beispiel entfernen'));

    expect(screen.queryByText('Ben Beispiel')).not.toBeInTheDocument();
    expect(screen.getByText('Rückgängig')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Rückgängig'));
    expect(screen.getByText('Ben Beispiel')).toBeInTheDocument();
  });

  test('admins resolve guest pill names from allGuestProfiles when the guest belongs to another user', () => {
    const otherUsersGuest = { id: 'guest-3', vorname: 'Clara', nachname: 'Fremd' };
    render(
      <MenuForm
        menu={{ id: 'menu-1', descriptionGuestIds: ['guest-3'] }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={{ id: 'user-1', isAdmin: true }}
        guestProfiles={guests}
        allGuestProfiles={[...guests, otherUsersGuest]}
        allGuestProfilesLoaded
        customDrinks={customDrinks}
      />
    );

    expect(screen.getByText('Clara Fremd')).toBeInTheDocument();
    expect(screen.queryByText('Unbenannter Gast')).not.toBeInTheDocument();
  });

  test('non-admins still see "Unbenannter Gast" for a pill they cannot resolve', () => {
    render(
      <MenuForm
        menu={{ id: 'menu-1', descriptionGuestIds: ['guest-3'] }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        allGuestProfiles={[]}
        allGuestProfilesLoaded={false}
        customDrinks={customDrinks}
      />
    );

    expect(screen.getByText('Unbenannter Gast')).toBeInTheDocument();
  });
});

describe('MenuForm - Drinks section manual drink selection', () => {
  test('lets the user add a drink from the event catalog to the "Drinks" section', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    // Default section is "Hauptspeise" - switch to a Drinks section via quick-select
    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const drinkInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });

    const option = await screen.findByText('Cola');
    fireEvent.click(option);

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
    expect(screen.getAllByText('Cola').length).toBeGreaterThan(0);
  });

  test('lets the user remove a manually added drink again', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const drinkInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });
    fireEvent.click(await screen.findByText('Cola'));

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Cola entfernen'));

    await waitFor(() => {
      expect(screen.queryByText('Ausgewählte Rezepte & Getränke:')).not.toBeInTheDocument();
    });
  });

  test('carries manually added drinks over to a newly created event', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const drinkInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });
    fireEvent.click(await screen.findByText('Cola'));

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-cola', 'predefined_mineralwasser']);
  });

  test('carries the menu\'s tagged guests over to a newly created event', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.selectedGuestIds).toEqual(['guest-1']);
  });

  test('re-syncs the menu\'s guest pills to whatever the new event was actually saved with', async () => {
    // The embedded EventForm was seeded with guest-1, but the user could add
    // guest-2 there (via its own "Gäste verwalten") before saving - the menu
    // needs to end up with the event's actual final list, not the seed.
    mockGetEvent.mockResolvedValue({ id: 'event-new', selectedGuestIds: ['guest-1', 'guest-2'] });

    render(
      <MenuForm
        menu={{ id: 'menu-1', name: 'Testmenü', sections: [] }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));
    await waitFor(() => expect(capturedEventFormProps).not.toBeNull());

    await act(async () => {
      await capturedEventFormProps.onSaved('event-new');
    });

    expect(mockGetEvent).toHaveBeenCalledWith('user-1', 'event-new');
    expect(mockUpdateMenu).toHaveBeenCalledWith('menu-1', { descriptionGuestIds: ['guest-1', 'guest-2'] });
    expect(await screen.findByText('Ben Beispiel')).toBeInTheDocument();
  });

  test('adds the predefined Mineralwasser drink to both the new event and the menu\'s Drinks section when missing', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const drinkInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });
    fireEvent.click(await screen.findByText('Cola'));

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toContain('predefined_mineralwasser');

    // Also reflected in the menu's own "Drinks" section, not just the event -
    // back out of the (mocked) EventForm to see the menu's section state.
    act(() => {
      capturedEventFormProps.onCancel();
    });
    expect(await screen.findAllByText('Mineralwasser')).not.toHaveLength(0);
  });

  test('does not duplicate the predefined Mineralwasser drink when the menu already has it', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const drinkInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Mineralwasser' } });
    fireEvent.click(await screen.findByText('Mineralwasser'));

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['predefined_mineralwasser']);
  });

  test('creates a linked drink for a drink recipe without one yet, and carries it over to a new event', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const searchInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(searchInput, { target: { value: 'Mojito' } });
    fireEvent.click(await screen.findByText('Mojito'));

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith('user-1', {
        name: '#recipe:recipe-2:Mojito',
        kategorie: null,
        einheiten: [{ einheitsgroesse: 0.5 }],
      });
    });

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-new-mojito', 'predefined_mineralwasser']);
  });

  test('reuses an existing linked drink for a drink recipe instead of creating a duplicate', async () => {
    const existingLinkedDrink = {
      id: 'drink-existing-mojito',
      name: '#recipe:recipe-2:Mojito',
      kategorie: null,
      einheiten: [{ einheitsgroesse: 0.3 }],
    };
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={[...customDrinks, existingLinkedDrink]}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const searchInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(searchInput, { target: { value: 'Mojito' } });
    // Both the "Mojito" recipe and its already-linked drink match the query;
    // the recipe option (added via handleAddRecipeToDrinksSection) is listed first.
    const [recipeOption] = await screen.findAllByText('Mojito');
    fireEvent.click(recipeOption);

    fireEvent.click(screen.getByText('Neue Kalkulation erstellen'));

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-existing-mojito', 'predefined_mineralwasser']);
    expect(mockSaveCustomDrink).not.toHaveBeenCalled();
  });

  test('does not list a drink linked to a recipe separately from that recipe (avoids duplicates)', async () => {
    const existingLinkedDrink = {
      id: 'drink-existing-mojito',
      name: '#recipe:recipe-2:Mojito',
      kategorie: null,
      einheiten: [{ einheitsgroesse: 0.3 }],
    };
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={[...customDrinks, existingLinkedDrink]}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const searchInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(searchInput, { target: { value: 'Mojito' } });

    // The recipe "Mojito" and the drink linked to it via "#recipe:..." would
    // otherwise both match - only the recipe should be listed.
    expect(await screen.findAllByText('Mojito')).toHaveLength(1);
  });

  test('merged search offers Drinks-category recipes and event drinks, but not other recipes', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    // The Drinks section renders a single merged search field, not two.
    const searchInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');

    fireEvent.change(searchInput, { target: { value: 'Mojito' } });
    expect(await screen.findByText('Mojito')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Nudelsalat' } });
    expect(screen.queryByText('Nudelsalat')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Cola' } });
    expect(await screen.findByText('Cola')).toBeInTheDocument();

    // Selecting the recipe option adds it to the section's recipe list.
    fireEvent.change(searchInput, { target: { value: 'Mojito' } });
    fireEvent.click(await screen.findByText('Mojito'));
    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
  });
});

describe('MenuForm - linked event drinks display', () => {
  test('shows the linked event\'s planned drinks in the Drinks section, not in the header', async () => {
    mockSubscribeToEvent.mockImplementation((uid, eventId, callback) => {
      callback({ id: 'event-1', eventName: 'Testparty', customDrinkIds: ['drink-cola'] });
      return () => {};
    });

    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: [], drinkIds: [] }],
          eventId: 'event-1',
          eventOwnerId: 'user-1',
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    const linkedEventBlock = (await screen.findByText('Testparty')).closest('.menu-event-linked');
    expect(linkedEventBlock.querySelector('ul')).not.toBeInTheDocument();

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
    expect(screen.getAllByText('Cola').length).toBeGreaterThan(0);
  });

  test('does not show a drink recipe twice when its linked drink was carried over into the event', async () => {
    // Mirrors what handleStartNewEvent does when creating an event from a menu:
    // a drink recipe already in the "Drinks" section gets a matching custom
    // drink (linked via "#recipe:id:name") added to the event's customDrinkIds.
    const linkedDrink = { id: 'drink-mojito-link', name: '#recipe:recipe-2:Mojito', kategorie: null, einheiten: [{ einheitsgroesse: 0.5 }] };
    mockSubscribeToEvent.mockImplementation((uid, eventId, callback) => {
      callback({ id: 'event-1', eventName: 'Testparty', customDrinkIds: [linkedDrink.id] });
      return () => {};
    });
    mockSubscribeToCustomDrinks.mockImplementation((uid, callback) => {
      callback([linkedDrink]);
      return () => {};
    });

    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: ['recipe-2'], drinkIds: [] }],
          eventId: 'event-1',
          eventOwnerId: 'user-1',
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
    expect(screen.getAllByText('Mojito')).toHaveLength(1);
  });

  test('removing a drink recipe deduped against a linked event drink removes it in one click, not two', async () => {
    // Same setup as above: the recipe's linked drink is deduped away, so
    // only the recipe's own "x" is shown. Clicking it used to just drop the
    // recipe, leaving the now-undeduped event drink behind as a second
    // entry with its own "x" - requiring a second click to fully remove it.
    const linkedDrink = { id: 'drink-mojito-link', name: '#recipe:recipe-2:Mojito', kategorie: null, einheiten: [{ einheitsgroesse: 0.5 }] };
    mockSubscribeToEvent.mockImplementation((uid, eventId, callback) => {
      callback({ id: 'event-1', eventName: 'Testparty', customDrinkIds: [linkedDrink.id] });
      return () => {};
    });
    mockSubscribeToCustomDrinks.mockImplementation((uid, callback) => {
      callback([linkedDrink]);
      return () => {};
    });

    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: ['recipe-2'], drinkIds: [] }],
          eventId: 'event-1',
          eventOwnerId: 'user-1',
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
    expect(screen.getAllByTitle('Mojito entfernen')).toHaveLength(1);

    fireEvent.click(screen.getByTitle('Mojito entfernen'));

    expect(screen.queryByText('Mojito')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Mojito entfernen')).not.toBeInTheDocument();
  });

  test('removing a drink that is both manually added and in the linked event removes it in one click, not two', async () => {
    // The same drinkId ("drink-cola") sits both in the section's own
    // drinkIds (manually added) and in the linked event's customDrinkIds.
    // manualDrinkIds dedupes it away by id, so only the merged event-drink
    // entry (and its "Getränk aus Event entfernen" x) is shown. Clicking it
    // used to only stage removal from the event, leaving the untouched
    // section.drinkIds entry to resurface as its own manual entry - with its
    // own "x" - requiring a second click to fully remove it.
    mockSubscribeToEvent.mockImplementation((uid, eventId, callback) => {
      callback({ id: 'event-1', eventName: 'Testparty', customDrinkIds: ['drink-cola'] });
      return () => {};
    });

    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: [], drinkIds: ['drink-cola'] }],
          eventId: 'event-1',
          eventOwnerId: 'user-1',
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
    expect(screen.getAllByText('Cola')).toHaveLength(1);
    expect(screen.getAllByTitle('Cola entfernen')).toHaveLength(1);

    fireEvent.click(screen.getByTitle('Cola entfernen'));

    expect(screen.queryByText('Cola')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Cola entfernen')).not.toBeInTheDocument();
  });
});

describe('MenuForm - linking an existing event merges guests', () => {
  test('merges the linked event\'s guests into this menu\'s guest pills without dropping ones already tagged', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', selectedGuestIds: ['guest-2'] }]}
      />
    );

    // Tag guest-1 on the menu before linking, so the merge shouldn't drop it.
    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    // Both the menu (Anna) and the event (guest-2) already have guests, so
    // linking asks which list to keep - pick "Alle Gäste" to merge both.
    fireEvent.click(await screen.findByText('Alle Gäste'));

    expect(await screen.findByText('Anna Adler')).toBeInTheDocument();
    expect(screen.getByText('Ben Beispiel')).toBeInTheDocument();
  });

  test('persists the eventId/eventOwnerId link on the menu document immediately, without needing "Speichern"', async () => {
    // Without this, EventForm's guest->menu sync (which looks up linked
    // menus by querying eventId/eventOwnerId in Firestore) finds nothing
    // until the menu happens to be saved once after linking.
    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: [], drinkIds: ['drink-cola'] }],
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 0, children: 0 }, selectedGuestIds: [] }]}
      />
    );

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    await waitFor(() => expect(mockUpdateMenu).toHaveBeenCalledWith('menu-1', { eventId: 'event-9', eventOwnerId: 'user-1' }));
  });

  test('pushes the merged guest list to the event immediately on link, without needing the menu\'s "Speichern"', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 1, children: 0 }, selectedGuestIds: ['guest-2'] }]}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    // Both sides already have guests - pick "Alle Gäste" to merge both.
    fireEvent.click(await screen.findByText('Alle Gäste'));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalled());
    const [event, eventId] = mockCalculateEventDrinks.mock.calls[0];
    expect(eventId).toBe('event-9');
    expect(event.selectedGuestIds).toEqual(expect.arrayContaining(['guest-1', 'guest-2']));
  });

  test('adopts the event\'s guests onto the menu with no prompt when only the event has guests', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 1, children: 0 }, selectedGuestIds: ['guest-2'] }]}
      />
    );

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    expect(screen.queryByText('Gästelisten zusammenführen')).not.toBeInTheDocument();
    expect(await screen.findByText('Ben Beispiel')).toBeInTheDocument();
    // The event already had exactly what it needs - no push back to it.
    expect(mockCalculateEventDrinks).not.toHaveBeenCalled();
  });

  test('pushes the menu\'s guests onto the event with no prompt when only the menu has guests', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 0, children: 0 }, selectedGuestIds: [] }]}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    expect(screen.queryByText('Gästelisten zusammenführen')).not.toBeInTheDocument();
    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalled());
    const [event, eventId] = mockCalculateEventDrinks.mock.calls[0];
    expect(eventId).toBe('event-9');
    expect(event.selectedGuestIds).toEqual(['guest-1']);
  });

  test('asks which list to keep when both sides already have guests, and "Gäste vom Event" discards the menu\'s own', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 1, children: 0 }, selectedGuestIds: ['guest-2'] }]}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    expect(await screen.findByText('Gästelisten zusammenführen')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Gäste vom Event'));

    // The menu now shows the event's guest (Ben), Anna is gone, and since
    // the event's own list didn't change, nothing gets pushed back to it.
    expect(await screen.findByText('Ben Beispiel')).toBeInTheDocument();
    expect(screen.queryByText('Anna Adler')).not.toBeInTheDocument();
    expect(mockCalculateEventDrinks).not.toHaveBeenCalled();
  });

  test('asks which list to keep when both sides already have guests, and "Gäste vom Menü" pushes the menu\'s list onto the event', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 1, children: 0 }, selectedGuestIds: ['guest-2'] }]}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    fireEvent.click(await screen.findByText('Gäste vom Menü'));

    expect(await screen.findByText('Anna Adler')).toBeInTheDocument();
    expect(screen.queryByText('Ben Beispiel')).not.toBeInTheDocument();
    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalled());
    const [event, eventId] = mockCalculateEventDrinks.mock.calls[0];
    expect(eventId).toBe('event-9');
    expect(event.selectedGuestIds).toEqual(['guest-1']);
  });

  test('cancelling the conflict dialog leaves the menu unlinked', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
        events={[{ id: 'event-9', eventName: 'Sommerfest', date: '2025-07-01', durationHours: 4, guests: { adults: 1, children: 0 }, selectedGuestIds: ['guest-2'] }]}
      />
    );

    const guestSearchInput = screen.getByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    fireEvent.click(screen.getByText('Bestehende Kalkulation verknüpfen'));
    fireEvent.click(await screen.findByText('Sommerfest'));

    fireEvent.click(await screen.findByText('Abbrechen'));

    expect(screen.queryByText('Gästelisten zusammenführen')).not.toBeInTheDocument();
    // Still on the link picker, nothing persisted.
    expect(await screen.findByText('Sommerfest')).toBeInTheDocument();
    expect(mockUpdateMenu).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventId: 'event-9' }));
    expect(mockCalculateEventDrinks).not.toHaveBeenCalled();
  });
});

describe('MenuForm - immediate guest sync with a linked event', () => {
  test('removing a guest pill pushes the change to the linked event right away, before "Speichern" is clicked', async () => {
    mockSubscribeToEvent.mockImplementation((uid, eventId, callback) => {
      callback({ id: 'event-1', eventName: 'Testparty', customDrinkIds: [], durationHours: 4, guests: { adults: 1, children: 0 }, selectedGuestIds: ['guest-1'] });
      return () => {};
    });

    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: [], drinkIds: ['drink-cola'] }],
          descriptionGuestIds: ['guest-1'],
          eventId: 'event-1',
          eventOwnerId: 'user-1',
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    expect(await screen.findByText('Anna Adler')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Anna Adler entfernen'));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalled());
    const [event, eventId] = mockCalculateEventDrinks.mock.calls[0];
    expect(eventId).toBe('event-1');
    expect(event.selectedGuestIds).toEqual([]);
  });

  test('adding a guest pill pushes the change to the linked event right away', async () => {
    mockSubscribeToEvent.mockImplementation((uid, eventId, callback) => {
      callback({ id: 'event-1', eventName: 'Testparty', customDrinkIds: [], durationHours: 4, guests: { adults: 0, children: 0 }, selectedGuestIds: [] });
      return () => {};
    });

    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Drinks', recipeIds: [], drinkIds: ['drink-cola'] }],
          eventId: 'event-1',
          eventOwnerId: 'user-1',
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    const guestSearchInput = await screen.findByPlaceholderText('Gast suchen und als Pille hinzufügen...');
    fireEvent.change(guestSearchInput, { target: { value: 'Anna' } });
    fireEvent.click(await screen.findByText('Anna Adler'));

    await waitFor(() => expect(mockCalculateEventDrinks).toHaveBeenCalled());
    const [event, eventId] = mockCalculateEventDrinks.mock.calls[0];
    expect(eventId).toBe('event-1');
    expect(event.selectedGuestIds).toEqual(['guest-1']);
  });
});

describe('MenuForm - recipe drag-and-drop items', () => {
  test('excludes recipeIds with no matching recipe from the sortable items list, so dnd-kit\'s index lookups stay aligned with the rendered handles', async () => {
    render(
      <MenuForm
        menu={{
          id: 'menu-1',
          name: 'Testmenü',
          sections: [{ name: 'Hauptspeise', recipeIds: ['recipe-1', 'recipe-deleted'] }],
        }}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
        guestProfiles={guests}
        customDrinks={customDrinks}
      />
    );

    await screen.findByText('Nudelsalat');

    const recipeItemsCall = mockSortableContextItemsCalls.find(
      (items) => Array.isArray(items) && items.includes('recipe-1')
    );
    expect(recipeItemsCall).toEqual(['recipe-1']);
  });
});
