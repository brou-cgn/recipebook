import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DrinkManagementPage from './DrinkManagementPage';

const mockSubscribeToCustomDrinks = jest.fn();
const mockSaveCustomDrink = jest.fn();
const mockDeleteCustomDrink = jest.fn();
const mockGetCustomLists = jest.fn();

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
  getCustomLists: (...args) => mockGetCustomLists(...args),
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
    mockGetCustomLists.mockResolvedValue({ packageUnits: [] });
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
      cb([{ id: 'd1', name: 'Riesling', kategorie: 'wein_weisswein' }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Weißwein')).toBeInTheDocument();
  });

  test('displays Kölsch subcategory label in drink list', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{ id: 'd2', name: 'Dom Kölsch', kategorie: 'bier_koelsch' }]);
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

  test('form does not contain removed calculation fields', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    expect(screen.queryByText(/Berechnungsmodus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Erwachsene \(L\/Person/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kinder \(L\/Person/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Anteil Trinker/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Distributionsfaktor/i)).not.toBeInTheDocument();
  });

  test('form contains new unit fields (Einheitsgröße, Gebindeinheit, Einheiten pro Gebinde)', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    expect(screen.getByText('Einheitsgröße')).toBeInTheDocument();
    expect(screen.getByText('Gebindeinheit')).toBeInTheDocument();
    expect(screen.getByText('Einheiten pro Gebinde')).toBeInTheDocument();
  });

  test('saves drink with einheiten payload', async () => {
    mockSaveCustomDrink.mockResolvedValue('new-drink-id');
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: 'Craft-Bier' } });

    // Fill the Gebindeinheit field
    const gebindeinheitInput = screen.getByPlaceholderText('z. B. Flasche, Dose, Kasten');
    fireEvent.change(gebindeinheitInput, { target: { value: 'Flasche' } });

    // Fill the Einheiten pro Gebinde field
    const einheitenProGebindeInput = screen.getByRole('spinbutton', { name: /Einheiten pro Gebinde/i });
    fireEvent.change(einheitenProGebindeInput, { target: { value: '24' } });

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith(
        currentUser.id,
        expect.objectContaining({
          name: 'Craft-Bier',
          einheiten: [
            expect.objectContaining({
              einheitsgroesse: 0.5,
              gebindeinheit: 'Flasche',
              einheitenProGebinde: 24,
            }),
          ],
        }),
        undefined,
      );
    });
  });

  test('allows adding multiple units to a drink', async () => {
    mockSaveCustomDrink.mockResolvedValue('new-drink-id');
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: 'Party-Bier' } });

    // Fill first einheit
    const firstGebindeinheit = screen.getByPlaceholderText('z. B. Flasche, Dose, Kasten');
    fireEvent.change(firstGebindeinheit, { target: { value: 'Flasche' } });
    const firstEinheitenProGebinde = screen.getByRole('spinbutton', { name: /Einheiten pro Gebinde/i });
    fireEvent.change(firstEinheitenProGebinde, { target: { value: '1' } });

    // Add a second einheit
    fireEvent.click(screen.getByRole('button', { name: 'Einheit hinzufügen' }));

    // Now there should be two Gebindeinheit inputs
    const gebindeinheitInputs = screen.getAllByPlaceholderText('z. B. Flasche, Dose, Kasten');
    expect(gebindeinheitInputs).toHaveLength(2);

    // Fill second einheit
    fireEvent.change(gebindeinheitInputs[1], { target: { value: 'Kasten' } });
    const einheitenProGebindeInputs = screen.getAllByRole('spinbutton', { name: /Einheiten pro Gebinde/i });
    fireEvent.change(einheitenProGebindeInputs[1], { target: { value: '24' } });

    // Change unit size for second einheit
    const unitSelects = screen.getAllByRole('combobox');
    const sizeSelects = unitSelects.filter((s) => s.querySelector('option[value="10"]'));
    fireEvent.change(sizeSelects[1], { target: { value: '0.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith(
        currentUser.id,
        expect.objectContaining({
          name: 'Party-Bier',
          einheiten: expect.arrayContaining([
            expect.objectContaining({ gebindeinheit: 'Flasche', einheitenProGebinde: 1 }),
            expect.objectContaining({ gebindeinheit: 'Kasten', einheitenProGebinde: 24 }),
          ]),
        }),
        undefined,
      );
    });
    expect(mockSaveCustomDrink.mock.calls[0][1].einheiten).toHaveLength(2);
  });

  test('gebindeinheit and einheitenProGebinde are optional – saving without them succeeds', async () => {
    mockSaveCustomDrink.mockResolvedValue('new-drink-id');
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: 'Test-Getränk' } });

    // Don't fill Gebindeinheit or Einheiten pro Gebinde
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith(
        currentUser.id,
        expect.objectContaining({ name: 'Test-Getränk' }),
        undefined,
      );
    });
    expect(screen.queryByText('Bitte alle Felder pro Einheit ausfüllen.')).not.toBeInTheDocument();
  });

  test('displays einheiten info in the drink list card', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{
        id: 'd1',
        name: 'Craft-Bier',
        kategorie: 'bier_koelsch',
        einheiten: [{ einheitsgroesse: 0.5, gebindeinheit: 'Flasche', einheitenProGebinde: 24 }],
      }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Craft-Bier')).toBeInTheDocument();
    // The card meta should show "Kölsch · 500 ml Flasche"
    expect(screen.getByText(/500 ml Flasche/)).toBeInTheDocument();
  });

  test('shows gebindeinheit as select when packageUnits are configured', async () => {
    mockGetCustomLists.mockResolvedValue({
      packageUnits: [
        { id: 'flasche', singular: 'Flasche', plural: 'Flaschen' },
        { id: 'dose', singular: 'Dose', plural: 'Dosen' },
        { id: 'kasten', singular: 'Kasten', plural: 'Kästen' },
      ],
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      const gebindeinheitSelect = selects.find((s) =>
        s.querySelector('option[value="Flasche"]')
      );
      expect(gebindeinheitSelect).toBeTruthy();
      const options = within(gebindeinheitSelect).getAllByRole('option').map((o) => o.textContent);
      expect(options).toContain('Flasche');
      expect(options).toContain('Dose');
      expect(options).toContain('Kasten');
    });

    // Text input should not be visible when select is shown
    expect(screen.queryByPlaceholderText('z. B. Flasche, Dose, Kasten')).not.toBeInTheDocument();
  });

  test('shows gebindeinheit as text input when no packageUnits are configured', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    expect(screen.getByPlaceholderText('z. B. Flasche, Dose, Kasten')).toBeInTheDocument();
  });

  test('renders the FAB save button in the edit form', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    const fabButton = screen.getByRole('button', { name: 'Getränk speichern' });
    expect(fabButton).toBeInTheDocument();
    expect(fabButton).toHaveClass('drink-save-fab-button');
  });

  test('predefined drink "Mineralwasser" is always shown in the list', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Mineralwasser')).toBeInTheDocument();
  });

  test('predefined drink shows category label "Wasser"', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Wasser')).toBeInTheDocument();
  });

  test('predefined drink name field is disabled in edit form', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Mineralwasser'));

    const nameInput = screen.getByRole('textbox', { name: /Name/i });
    expect(nameInput).toBeDisabled();
    expect(nameInput.value).toBe('Mineralwasser');
  });

  test('predefined drink category field is disabled in edit form', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Mineralwasser'));

    const selects = screen.getAllByRole('combobox');
    const categorySelect = selects.find((s) => s.querySelector('option[value="wasser"]'));
    expect(categorySelect).toBeTruthy();
    expect(categorySelect).toBeDisabled();
  });

  test('saving predefined drink only updates einheiten', async () => {
    mockSaveCustomDrink.mockResolvedValue(undefined);
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Mineralwasser'));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith(
        currentUser.id,
        expect.not.objectContaining({ name: expect.anything() }),
        'predefined_mineralwasser',
      );
    });
  });
});
