import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MenuForm from './MenuForm';

const mockSubscribeToCustomDrinks = jest.fn();
const mockSubscribeToEvents = jest.fn();
const mockGetEvent = jest.fn();
const mockGetCustomDrinks = jest.fn();
const mockSaveCustomDrink = jest.fn();

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
  getEvent: (...args) => mockGetEvent(...args),
  subscribeToEvents: (...args) => mockSubscribeToEvents(...args),
  getCustomDrinks: (...args) => mockGetCustomDrinks(...args),
  subscribeToCustomDrinks: (...args) => mockSubscribeToCustomDrinks(...args),
  saveCustomDrink: (...args) => mockSaveCustomDrink(...args),
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

jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }) => <div>{children}</div>,
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

beforeEach(() => {
  jest.clearAllMocks();
  capturedEventFormProps = null;
  mockSubscribeToCustomDrinks.mockImplementation((uid, callback) => {
    callback(customDrinks);
    return () => {};
  });
  mockSubscribeToEvents.mockImplementation(() => () => {});
  mockSaveCustomDrink.mockResolvedValue('drink-new-mojito');
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
      />
    );

    fireEvent.click(screen.getByText('+ Abschnitt hinzufügen'));
    fireEvent.click(await screen.findByRole('button', { name: 'Drinks' }));

    const drinkInput = await screen.findByPlaceholderText('Rezept oder Getränk suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });
    fireEvent.click(await screen.findByText('Cola'));

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Getränk entfernen'));

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
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-cola']);
  });

  test('creates a linked drink for a drink recipe without one yet, and carries it over to a new event', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
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
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-new-mojito']);
  });

  test('reuses an existing linked drink for a drink recipe instead of creating a duplicate', async () => {
    const existingLinkedDrink = {
      id: 'drink-existing-mojito',
      name: '#recipe:recipe-2:Mojito',
      kategorie: null,
      einheiten: [{ einheitsgroesse: 0.3 }],
    };
    mockSubscribeToCustomDrinks.mockImplementation((uid, callback) => {
      callback([...customDrinks, existingLinkedDrink]);
      return () => {};
    });

    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
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
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-existing-mojito']);
    expect(mockSaveCustomDrink).not.toHaveBeenCalled();
  });

  test('merged search offers Drinks-category recipes and event drinks, but not other recipes', async () => {
    render(
      <MenuForm
        menu={null}
        recipes={recipes}
        onSave={jest.fn()}
        onCancel={jest.fn()}
        currentUser={currentUser}
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
    mockGetEvent.mockResolvedValue({ id: 'event-1', eventName: 'Testparty', customDrinkIds: ['drink-cola'] });
    mockGetCustomDrinks.mockResolvedValue(customDrinks);

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
      />
    );

    const linkedEventBlock = (await screen.findByText('Testparty')).closest('.menu-event-linked');
    expect(linkedEventBlock.querySelector('ul')).not.toBeInTheDocument();

    expect(await screen.findByText('Ausgewählte Rezepte & Getränke:')).toBeInTheDocument();
    expect(screen.getAllByText('Cola').length).toBeGreaterThan(0);
  });
});
