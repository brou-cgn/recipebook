import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DrinkManagementPage from './DrinkManagementPage';

const mockSubscribeToCustomDrinks = jest.fn();
const mockSaveCustomDrink = jest.fn();
const mockDeleteCustomDrink = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToCustomDrinks: (...args) => mockSubscribeToCustomDrinks(...args),
  saveCustomDrink: (...args) => mockSaveCustomDrink(...args),
  deleteCustomDrink: (...args) => mockDeleteCustomDrink(...args),
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

describe('DrinkManagementPage', () => {
  const currentUser = { id: 'u1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
  });

  test('renders the mobile add FAB even in the empty state and opens the create form', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    const fabButton = screen.getByRole('button', { name: 'Getränk anlegen' });
    expect(fabButton).toBeInTheDocument();

    fireEvent.click(fabButton);
    expect(screen.getByRole('heading', { level: 2, name: 'Neues Getränk' })).toBeInTheDocument();
  });
});
