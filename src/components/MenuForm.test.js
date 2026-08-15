import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MenuForm from './MenuForm';

const mockSubscribeToCustomDrinks = jest.fn();
const mockSubscribeToEvents = jest.fn();
const mockGetEvent = jest.fn();
const mockGetCustomDrinks = jest.fn();

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
];

beforeEach(() => {
  jest.clearAllMocks();
  capturedEventFormProps = null;
  mockSubscribeToCustomDrinks.mockImplementation((uid, callback) => {
    callback(customDrinks);
    return () => {};
  });
  mockSubscribeToEvents.mockImplementation(() => () => {});
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

    const drinkInput = await screen.findByPlaceholderText('Getränk aus dem Eventbereich suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });

    const option = await screen.findByText('Cola');
    fireEvent.click(option);

    expect(await screen.findByText('Manuell hinzugefügte Getränke:')).toBeInTheDocument();
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

    const drinkInput = await screen.findByPlaceholderText('Getränk aus dem Eventbereich suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });
    fireEvent.click(await screen.findByText('Cola'));

    expect(await screen.findByText('Manuell hinzugefügte Getränke:')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Getränk entfernen'));

    await waitFor(() => {
      expect(screen.queryByText('Manuell hinzugefügte Getränke:')).not.toBeInTheDocument();
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

    const drinkInput = await screen.findByPlaceholderText('Getränk aus dem Eventbereich suchen und hinzufügen...');
    fireEvent.change(drinkInput, { target: { value: 'Cola' } });
    fireEvent.click(await screen.findByText('Cola'));

    fireEvent.click(screen.getByText('Event erstellen'));

    await waitFor(() => {
      expect(capturedEventFormProps).not.toBeNull();
    });
    expect(capturedEventFormProps.initialEvent.customDrinkIds).toEqual(['drink-cola']);
  });
});
