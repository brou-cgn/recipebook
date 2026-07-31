import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  test('category select contains Wein subcategories inside an optgroup', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    const selects = screen.getAllByRole('combobox');
    // The category select is the one that contains "Keine Kategorie"
    const select = selects.find((s) => s.querySelector('option[value=""]'));
    expect(select).toBeTruthy();

    const weinGroup = select.querySelector('optgroup[label="Wein"]');
    expect(weinGroup).not.toBeNull();

    const weinOptions = within(weinGroup).getAllByRole('option');
    const weinOptionValues = weinOptions.map((o) => o.value);
    expect(weinOptionValues).toContain('wein');
    expect(weinOptionValues).toContain('wein_weisswein');
    expect(weinOptionValues).toContain('wein_rose');
    expect(weinOptionValues).toContain('wein_rotwein');
  });

  test('category select contains Bier subcategories inside an optgroup', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    const selects = screen.getAllByRole('combobox');
    const select = selects.find((s) => s.querySelector('option[value=""]'));
    expect(select).toBeTruthy();

    const bierGroup = select.querySelector('optgroup[label="Bier"]');
    expect(bierGroup).not.toBeNull();

    const bierOptions = within(bierGroup).getAllByRole('option');
    const bierOptionValues = bierOptions.map((o) => o.value);
    expect(bierOptionValues).toContain('bier');
    expect(bierOptionValues).toContain('bier_koelsch');
    expect(bierOptionValues).toContain('bier_pils');
    expect(bierOptionValues).toContain('bier_weizen');
    expect(bierOptionValues).toContain('bier_alkoholfrei');
  });

  test('displays Weißwein subcategory label in drink list', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{ id: 'd1', name: 'Riesling', kategorie: 'wein_weisswein', anteilTrinker: 1.0 }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Weißwein')).toBeInTheDocument();
  });

  test('displays Kölsch subcategory label in drink list', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{ id: 'd2', name: 'Dom Kölsch', kategorie: 'bier_koelsch', anteilTrinker: 1.0 }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Kölsch')).toBeInTheDocument();
  });

  test('unit size select contains the configurable accepted sizes', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    const selects = screen.getAllByRole('combobox');
    const select = selects.find((s) => s.querySelector('option[value="10"]'));
    expect(select).toBeTruthy();

    const unitLabels = within(select).getAllByRole('option').map((option) => option.textContent);
    expect(unitLabels).toEqual([
      '200 ml',
      '330 ml',
      '500 ml',
      '750 ml',
      '1,0 l',
      '1,5 l',
      '2,0 l',
      '5,0 l (Pittermännchen)',
      '10,0 l (Fässchen)',
    ]);
  });

  test('saves configured unit labels in the normalized display format', async () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Party-Fass' } });

    const selects = screen.getAllByRole('combobox');
    const unitSelect = selects.find((s) => s.querySelector('option[value="10"]'));
    expect(unitSelect).toBeTruthy();

    fireEvent.change(unitSelect, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith(
        currentUser.id,
        expect.objectContaining({
          name: 'Party-Fass',
          gebindeLiter: 10,
          gebindeName: '10,0 l (Fässchen)',
        }),
        undefined,
      );
    });
  });
});
