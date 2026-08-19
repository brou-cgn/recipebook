import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DrinkManagementPage from './DrinkManagementPage';

const mockSubscribeToAllCustomDrinks = jest.fn();
const mockSaveCustomDrink = jest.fn();
const mockDeleteCustomDrink = jest.fn();
const mockGetCustomLists = jest.fn();
const mockUpdateRecipe = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToAllCustomDrinks: (...args) => mockSubscribeToAllCustomDrinks(...args),
  saveCustomDrink: (...args) => mockSaveCustomDrink(...args),
  deleteCustomDrink: (...args) => mockDeleteCustomDrink(...args),
}));

jest.mock('../utils/userManagement', () => ({
  getUsers: () => Promise.resolve([]),
}));

jest.mock('../utils/recipeFirestore', () => ({
  updateRecipe: (...args) => mockUpdateRecipe(...args),
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
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([]);
      return jest.fn();
    });
    mockGetCustomLists.mockResolvedValue({ packageUnits: [] });
    mockUpdateRecipe.mockResolvedValue(undefined);
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
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'd1', name: 'Riesling', kategorie: 'wein_weisswein' }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getAllByText('Weißwein').length).toBeGreaterThan(0);
  });

  test('displays Kölsch subcategory label in drink list', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'd2', name: 'Dom Kölsch', kategorie: 'bier_koelsch' }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getAllByText('Kölsch').length).toBeGreaterThan(0);
  });

  test('drink list is grouped by category and sorted by name within each group', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([
        { id: 'd1', name: 'Cola', kategorie: 'softdrinks' },
        { id: 'd2', name: 'Rotwein Trocken', kategorie: 'wein_rotwein' },
        { id: 'd3', name: 'Apfelschorle', kategorie: 'softdrinks' },
      ]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    const list = screen.getByText('Getränke verwalten').closest('.events-page-container').querySelector('.events-list');
    const headers = within(list).getAllByRole('heading', { level: 3, name: /Wasser|Softdrinks|Rotwein/ });
    const headerTexts = headers.map((h) => h.textContent);
    // "Wasser" (predefined Mineralwasser) comes before "Softdrinks", which comes before "Rotwein"
    // per the DRINK_CATEGORIES order.
    expect(headerTexts.indexOf('Wasser')).toBeLessThan(headerTexts.indexOf('Softdrinks'));
    expect(headerTexts.indexOf('Softdrinks')).toBeLessThan(headerTexts.indexOf('Rotwein'));

    const softdrinksHeader = screen.getByRole('heading', { level: 3, name: 'Softdrinks' });
    const softdrinksGroup = softdrinksHeader.closest('.drink-category-group');
    const namesInGroup = within(softdrinksGroup).getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
      .filter((text) => text !== 'Softdrinks');
    expect(namesInGroup).toEqual(['Apfelschorle', 'Cola']);
  });

  test('drinks without a category are grouped under "Ohne Kategorie"', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'd1', name: 'Mystery Drink', kategorie: '' }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Ohne Kategorie' })).toBeInTheDocument();
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
      '5,0 l',
      '10,0 l',
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

  test('form contains new unit fields (Einheitsgröße, Einheit, Gebindeinheit, Menge/Gebinde)', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    expect(screen.getByText('Einheitsgröße')).toBeInTheDocument();
    expect(screen.getByText('Einheit')).toBeInTheDocument();
    expect(screen.getByText('Gebindeinheit')).toBeInTheDocument();
    expect(screen.getByText('Menge/Gebinde')).toBeInTheDocument();
  });

  test('saves drink with einheiten payload', async () => {
    mockSaveCustomDrink.mockResolvedValue('new-drink-id');
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: 'Craft-Bier' } });

    // Fill the Einheit field
    const einheitInput = screen.getByPlaceholderText('z. B. Glas, Flasche, Dose');
    fireEvent.change(einheitInput, { target: { value: 'Glas' } });

    // Fill the Gebindeinheit field
    const gebindeinheitInput = screen.getByPlaceholderText('z. B. Flasche, Dose, Kasten');
    fireEvent.change(gebindeinheitInput, { target: { value: 'Flasche' } });

    // Fill the Menge/Gebinde field
    const einheitenProGebindeInput = screen.getByRole('spinbutton', { name: /Menge\/Gebinde/i });
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
              einheit: 'Glas',
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
    const firstEinheitenProGebinde = screen.getByRole('spinbutton', { name: /Menge\/Gebinde/i });
    fireEvent.change(firstEinheitenProGebinde, { target: { value: '1' } });

    // Add a second einheit
    fireEvent.click(screen.getByRole('button', { name: 'Einheit hinzufügen' }));

    // Now there should be two Gebindeinheit inputs
    const gebindeinheitInputs = screen.getAllByPlaceholderText('z. B. Flasche, Dose, Kasten');
    expect(gebindeinheitInputs).toHaveLength(2);

    // Fill second einheit
    fireEvent.change(gebindeinheitInputs[1], { target: { value: 'Kasten' } });
    const einheitenProGebindeInputs = screen.getAllByRole('spinbutton', { name: /Menge\/Gebinde/i });
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

    // Don't fill Gebindeinheit or Menge/Gebinde
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
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
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
    // The card meta should show "Kölsch · 500 ml" (gebindeinheit is hidden in the overview)
    expect(screen.getByText(/500 ml/)).toBeInTheDocument();
    expect(screen.queryByText(/Flasche/)).not.toBeInTheDocument();
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

  test('shows einheit as select when drinkUnits are configured', async () => {
    mockGetCustomLists.mockResolvedValue({
      packageUnits: [],
      drinkUnits: [
        { id: 'glas', singular: 'Glas', plural: 'Gläser' },
        { id: 'flasche', singular: 'Flasche', plural: 'Flaschen' },
        { id: 'dose', singular: 'Dose', plural: 'Dosen' },
      ],
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      const einheitSelect = selects.find((s) =>
        s.querySelector('option[value="Glas"]')
      );
      expect(einheitSelect).toBeTruthy();
      const options = within(einheitSelect).getAllByRole('option').map((o) => o.textContent);
      expect(options).toContain('Glas');
      expect(options).toContain('Flasche');
      expect(options).toContain('Dose');
    });

    // Text input should not be visible when select is shown
    expect(screen.queryByPlaceholderText('z. B. Glas, Flasche, Dose')).not.toBeInTheDocument();
  });

  test('shows einheit as text input when no drinkUnits are configured', () => {
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

    expect(screen.getByPlaceholderText('z. B. Glas, Flasche, Dose')).toBeInTheDocument();
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

    expect(screen.getAllByText('Wasser').length).toBeGreaterThan(0);
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

  test('saving predefined drink persists name/category and updates einheiten', async () => {
    mockSaveCustomDrink.mockResolvedValue(undefined);
    render(<DrinkManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByText('Mineralwasser'));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveCustomDrink).toHaveBeenCalledWith(
        currentUser.id,
        expect.objectContaining({
          name: 'Mineralwasser',
          kategorie: 'wasser',
          predefined: true,
        }),
        'predefined_mineralwasser',
      );
    });
  });

  test('predefined Mineralwasser row uses persisted data when a custom document exists', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{
        id: 'predefined_mineralwasser',
        name: 'Mineralwasser',
        kategorie: 'wasser',
        predefined: true,
        einheiten: [{
          einheitsgroesse: 1.5,
          einheit: 'Flasche',
          gebindeinheit: 'Kasten',
          einheitenProGebinde: 12,
        }],
      }]);
      return jest.fn();
    });

    render(<DrinkManagementPage currentUser={currentUser} />);

    expect(screen.getAllByText('Mineralwasser')).toHaveLength(1);
    fireEvent.click(screen.getByText('Mineralwasser'));

    expect(screen.getByPlaceholderText('z. B. Glas, Flasche, Dose')).toHaveValue('Flasche');
    expect(screen.getByPlaceholderText('z. B. Flasche, Dose, Kasten')).toHaveValue('Kasten');
    expect(screen.getByRole('spinbutton', { name: /Menge\/Gebinde/i })).toHaveValue(12);
  });

  describe('recipe linking in the name field', () => {
    const recipes = [
      { id: 'r1', title: 'Mojito', speisekategorie: ['Drinks'] },
      { id: 'r2', title: 'Aperol Spritz', speisekategorie: ['Drinks'] },
      { id: 'r3', title: 'Tomatensoße', speisekategorie: ['Hauptspeisen'] },
    ];

    test('typing # in the name field opens the recipe typeahead with only Drinks-category recipes', () => {
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));
      fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: '#' } });

      expect(screen.getByPlaceholderText('Rezept suchen...')).toBeInTheDocument();
      expect(screen.getByText('Mojito')).toBeInTheDocument();
      expect(screen.getByText('Aperol Spritz')).toBeInTheDocument();
      expect(screen.queryByText('Tomatensoße')).not.toBeInTheDocument();
    });

    test('selecting a recipe from the typeahead links it and shows the recipe name', () => {
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));
      fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: '#Mojito' } });

      fireEvent.click(screen.getByText('Mojito'));

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      expect(nameInput.value).toBe('Mojito');
      expect(nameInput).toHaveAttribute('readonly');
      expect(screen.queryByPlaceholderText('Rezept suchen...')).not.toBeInTheDocument();
    });

    test('saving a linked drink stores the encoded recipe link as the name', async () => {
      mockSaveCustomDrink.mockResolvedValue('new-drink-id');
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));
      fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: '#Mojito' } });
      fireEvent.click(screen.getByText('Mojito'));

      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

      await waitFor(() => {
        expect(mockSaveCustomDrink).toHaveBeenCalledWith(
          currentUser.id,
          expect.objectContaining({ name: '#recipe:r1:Mojito' }),
          undefined,
        );
      });
    });

    test('clearing a linked recipe name makes the field editable again', () => {
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));
      fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: '#Mojito' } });
      fireEvent.click(screen.getByText('Mojito'));

      fireEvent.click(screen.getByRole('button', { name: 'Verknüpfung entfernen' }));

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      expect(nameInput.value).toBe('');
      expect(nameInput).not.toHaveAttribute('readonly');
    });

    test('shows a free-form ml input for Einheitsgröße instead of the dropdown when the drink is linked to a recipe', () => {
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));
      fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: '#Mojito' } });
      fireEvent.click(screen.getByText('Mojito'));

      expect(screen.getByText('Einheitsgröße (ml)')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: 'Einheitsgröße (ml)' })).toBeInTheDocument();
      expect(screen.queryByText('Einheitsgröße')).not.toBeInTheDocument();
    });

    test('saving a recipe-linked drink converts the entered ml value to liters', async () => {
      mockSaveCustomDrink.mockResolvedValue('new-drink-id');
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));
      fireEvent.change(screen.getByRole('textbox', { name: /Name/i }), { target: { value: '#Mojito' } });
      fireEvent.click(screen.getByText('Mojito'));

      fireEvent.change(screen.getByRole('spinbutton', { name: 'Einheitsgröße (ml)' }), { target: { value: '250' } });
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

      await waitFor(() => {
        expect(mockSaveCustomDrink).toHaveBeenCalledWith(
          currentUser.id,
          expect.objectContaining({
            einheiten: [expect.objectContaining({ einheitsgroesse: 0.25 })],
          }),
          undefined,
        );
      });
    });

    test('keeps the Einheitsgröße dropdown for drinks that are not linked to a recipe', () => {
      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      fireEvent.click(screen.getByRole('button', { name: 'Getränk anlegen' }));

      expect(screen.getByText('Einheitsgröße')).toBeInTheDocument();
      expect(screen.queryByText('Einheitsgröße (ml)')).not.toBeInTheDocument();
    });

    test('the drink list shows the linked recipe name instead of the raw link', () => {
      mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
        cb([{ id: 'd1', name: '#recipe:r1:Mojito', kategorie: 'longdrink', einheiten: [] }]);
        return jest.fn();
      });

      render(<DrinkManagementPage currentUser={currentUser} recipes={recipes} />);

      expect(screen.getByText('Mojito')).toBeInTheDocument();
      expect(screen.queryByText('#recipe:r1:Mojito')).not.toBeInTheDocument();
    });

    describe('ingredient list on the edit page', () => {
      const recipesWithIngredients = [
        {
          id: 'r1',
          title: 'Mojito',
          speisekategorie: ['Drinks'],
          ingredients: [
            { type: 'ingredient', text: '50 ml Rum' },
            { type: 'ingredient', text: '2 EL Zucker', includedInCalculation: false },
            { type: 'heading', text: 'Deko' },
          ],
        },
      ];

      test('shows the ingredients of the linked recipe with amount and unit', () => {
        mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
          cb([{ id: 'd1', name: '#recipe:r1:Mojito', kategorie: 'longdrink', einheiten: [] }]);
          return jest.fn();
        });

        render(<DrinkManagementPage currentUser={currentUser} recipes={recipesWithIngredients} />);

        fireEvent.click(screen.getByText('Mojito'));

        expect(screen.getByText('Rum')).toBeInTheDocument();
        expect(screen.getByText('50 ml')).toBeInTheDocument();
        expect(screen.getByText('Zucker')).toBeInTheDocument();
        expect(screen.getByText('2 EL')).toBeInTheDocument();
        // Headings are not rendered as ingredient rows
        expect(screen.queryByText('Deko')).not.toBeInTheDocument();
      });

      test('does not show an ingredient list for a normal (non-recipe) drink', () => {
        mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
          cb([{ id: 'd1', name: 'Craft-Bier', kategorie: 'bier', einheiten: [] }]);
          return jest.fn();
        });

        render(<DrinkManagementPage currentUser={currentUser} recipes={recipesWithIngredients} />);

        fireEvent.click(screen.getByText('Craft-Bier'));

        expect(screen.queryByText('Rum')).not.toBeInTheDocument();
      });

      test('toggling an ingredient persists includedInCalculation on the recipe document', async () => {
        mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
          cb([{ id: 'd1', name: '#recipe:r1:Mojito', kategorie: 'longdrink', einheiten: [] }]);
          return jest.fn();
        });

        render(<DrinkManagementPage currentUser={currentUser} recipes={recipesWithIngredients} />);

        fireEvent.click(screen.getByText('Mojito'));

        const rumToggle = screen.getByRole('checkbox', { name: 'Rum in Kalkulation berücksichtigen' });
        expect(rumToggle).toBeChecked();
        fireEvent.click(rumToggle);

        await waitFor(() => {
          expect(mockUpdateRecipe).toHaveBeenCalledWith('r1', {
            ingredients: [
              { type: 'ingredient', text: '50 ml Rum', includedInCalculation: false },
              { type: 'ingredient', text: '2 EL Zucker', includedInCalculation: false },
              { type: 'heading', text: 'Deko' },
            ],
          });
        });

        const zuckerToggle = screen.getByRole('checkbox', { name: 'Zucker in Kalkulation berücksichtigen' });
        expect(zuckerToggle).not.toBeChecked();
        fireEvent.click(zuckerToggle);

        await waitFor(() => {
          expect(mockUpdateRecipe).toHaveBeenLastCalledWith('r1', {
            ingredients: [
              { type: 'ingredient', text: '50 ml Rum' },
              { type: 'ingredient', text: '2 EL Zucker', includedInCalculation: true },
              { type: 'heading', text: 'Deko' },
            ],
          });
        });
      });
    });
  });

  describe('swipe-delete', () => {
    const createTouchEvent = (type, clientX, clientY) => ({
      touches: [{ clientX, clientY }],
      cancelable: false,
      preventDefault: jest.fn(),
    });

    test('swipe-delete button appears after swiping a custom drink left', async () => {
      mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
        cb([{ id: 'd1', name: 'Craft-Bier', kategorie: 'bier', einheiten: [] }]);
        return jest.fn();
      });

      render(<DrinkManagementPage currentUser={currentUser} />);

      const drinkContent = screen.getByText('Craft-Bier').closest('.drink-swipe-content');
      expect(drinkContent).toBeInTheDocument();

      fireEvent.touchStart(drinkContent, createTouchEvent('touchstart', 200, 100));
      fireEvent.touchMove(drinkContent, createTouchEvent('touchmove', 130, 100));
      fireEvent.touchEnd(drinkContent, {});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Craft-Bier löschen' })).toBeInTheDocument();
      });
    });

    test('clicking swipe-delete button calls deleteCustomDrink', async () => {
      mockDeleteCustomDrink.mockResolvedValue(undefined);
      mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
        cb([{ id: 'd1', name: 'Craft-Bier', kategorie: 'bier', einheiten: [] }]);
        return jest.fn();
      });

      render(<DrinkManagementPage currentUser={currentUser} />);

      const drinkContent = screen.getByText('Craft-Bier').closest('.drink-swipe-content');
      fireEvent.touchStart(drinkContent, createTouchEvent('touchstart', 200, 100));
      fireEvent.touchMove(drinkContent, createTouchEvent('touchmove', 130, 100));
      fireEvent.touchEnd(drinkContent, {});

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Craft-Bier löschen' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Craft-Bier löschen' }));

      await waitFor(() => {
        expect(mockDeleteCustomDrink).toHaveBeenCalledWith(currentUser.id, 'd1');
      });
    });

    test('undo snackbar appears after deleting a drink', async () => {
      mockDeleteCustomDrink.mockResolvedValue(undefined);
      mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
        cb([{ id: 'd1', name: 'Craft-Bier', kategorie: 'bier', einheiten: [] }]);
        return jest.fn();
      });

      render(<DrinkManagementPage currentUser={currentUser} />);

      const drinkContent = screen.getByText('Craft-Bier').closest('.drink-swipe-content');
      fireEvent.touchStart(drinkContent, createTouchEvent('touchstart', 200, 100));
      fireEvent.touchMove(drinkContent, createTouchEvent('touchmove', 130, 100));
      fireEvent.touchEnd(drinkContent, {});

      await waitFor(() => screen.getByRole('button', { name: 'Craft-Bier löschen' }));
      fireEvent.click(screen.getByRole('button', { name: 'Craft-Bier löschen' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('„Craft-Bier" entfernt');
      });
    });

    test('predefined drinks do not show swipe-delete button', () => {
      render(<DrinkManagementPage currentUser={currentUser} />);

      expect(screen.queryByRole('button', { name: /Mineralwasser löschen/i })).not.toBeInTheDocument();
    });
  });

  describe('shared library across users', () => {
    const mockOtherUsersDrinks = () => {
      mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
        cb([
          { id: 'd1', name: 'Eigenes Bier', kategorie: 'bier', einheiten: [], ownerId: 'u1' },
          { id: 'd2', name: 'Papas Wein', kategorie: 'wein', einheiten: [], ownerId: 'u2' },
        ]);
        return jest.fn();
      });
    };

    test('"Eigene Getränke" is enabled by default and hides other users\' drinks', () => {
      mockOtherUsersDrinks();

      render(<DrinkManagementPage currentUser={currentUser} />);

      expect(screen.getByRole('checkbox', { name: 'Nur eigene Getränke anzeigen' })).toBeChecked();
      expect(screen.getByText('Eigenes Bier')).toBeInTheDocument();
      expect(screen.queryByText('Papas Wein')).not.toBeInTheDocument();
    });

    test('disabling "Eigene Getränke" shows drinks from other users but does not allow editing or deleting them', () => {
      mockOtherUsersDrinks();

      render(<DrinkManagementPage currentUser={currentUser} />);

      fireEvent.click(screen.getByRole('checkbox', { name: 'Nur eigene Getränke anzeigen' }));

      expect(screen.getByText('Eigenes Bier')).toBeInTheDocument();
      expect(screen.getByText('Papas Wein')).toBeInTheDocument();

      // Own drink stays editable.
      fireEvent.click(screen.getByText('Eigenes Bier'));
      expect(screen.getByRole('heading', { level: 2, name: 'Getränk bearbeiten' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

      // Someone else's drink is not clickable into the edit form.
      fireEvent.click(screen.getByText('Papas Wein'));
      expect(screen.queryByRole('heading', { level: 2, name: 'Getränk bearbeiten' })).not.toBeInTheDocument();

      // Someone else's drink can't be swiped open for deletion either.
      const othersDrinkContent = screen.getByText('Papas Wein').closest('.drink-swipe-content');
      fireEvent.touchStart(othersDrinkContent, { touches: [{ clientX: 200, clientY: 100 }], cancelable: false, preventDefault: jest.fn() });
      fireEvent.touchMove(othersDrinkContent, { touches: [{ clientX: 130, clientY: 100 }], cancelable: false, preventDefault: jest.fn() });
      fireEvent.touchEnd(othersDrinkContent, {});
      expect(screen.queryByRole('button', { name: 'Papas Wein löschen' })).not.toBeInTheDocument();
    });

    test('predefined drinks stay visible while "Eigene Getränke" is enabled', () => {
      mockOtherUsersDrinks();

      render(<DrinkManagementPage currentUser={currentUser} />);

      expect(screen.getByText('Mineralwasser')).toBeInTheDocument();
    });
  });
});
