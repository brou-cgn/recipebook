import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GuestManagementPage from './GuestManagementPage';

const mockSubscribeToGuestProfiles = jest.fn();
const mockSubscribeToAllGuestProfiles = jest.fn();
const mockSubscribeToAllCustomDrinks = jest.fn();
const mockSaveGuestProfile = jest.fn();
const mockDeleteGuestProfile = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToGuestProfiles: (...args) => mockSubscribeToGuestProfiles(...args),
  subscribeToAllGuestProfiles: (...args) => mockSubscribeToAllGuestProfiles(...args),
  subscribeToAllCustomDrinks: (...args) => mockSubscribeToAllCustomDrinks(...args),
  saveGuestProfile: (...args) => mockSaveGuestProfile(...args),
  deleteGuestProfile: (...args) => mockDeleteGuestProfile(...args),
}));

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: () => true,
  getUsers: () => Promise.resolve([]),
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

const CATEGORY_LABELS = { wasser: 'Wasser', bier: 'Bier', wein: 'Wein' };

describe('GuestManagementPage – Bevorzugte Getränke', () => {
  const currentUser = { id: 'u1' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([]);
      return jest.fn();
    });
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([]);
      return jest.fn();
    });
    mockSaveGuestProfile.mockResolvedValue(undefined);
  });

  function openNewGuestForm() {
    render(<GuestManagementPage currentUser={currentUser} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ersten Gast anlegen' }));
  }

  test('preferred drinks list is initially empty when creating a new guest', () => {
    openNewGuestForm();
    // The chips list should not be present (no drinks selected)
    expect(screen.queryByLabelText(/entfernen/)).not.toBeInTheDocument();
  });

  test('shows a dropdown to select drinks – standard categories are not listed in the drinks dropdown', () => {
    openNewGuestForm();
    const drinkSelect = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    expect(drinkSelect).toBeInTheDocument();
    // Standard categories should NOT appear in the custom drinks dropdown
    expect(within(drinkSelect).queryByRole('option', { name: 'Wasser' })).not.toBeInTheDocument();
    expect(within(drinkSelect).queryByRole('option', { name: 'Bier' })).not.toBeInTheDocument();
    expect(within(drinkSelect).queryByRole('option', { name: 'Wein' })).not.toBeInTheDocument();
  });

  test('Hinzufügen button is disabled when no drink is selected in dropdown', () => {
    openNewGuestForm();
    const addButtons = screen.getAllByRole('button', { name: 'Hinzufügen' });
    expect(addButtons[0]).toBeDisabled();
  });

  test('adding a drink creates a chip and removes it from the dropdown', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'mineral-wasser', name: 'Mineral Wasser' }]);
      return jest.fn();
    });
    openNewGuestForm();
    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    fireEvent.change(select, { target: { value: 'mineral-wasser' } });

    const addButtons = screen.getAllByRole('button', { name: 'Hinzufügen' });
    const addBtn = addButtons[0];
    expect(addBtn).not.toBeDisabled();
    fireEvent.click(addBtn);

    // Chip for Mineral Wasser should now be visible
    expect(screen.getByLabelText('Mineral Wasser entfernen')).toBeInTheDocument();
    // Mineral Wasser should no longer appear in dropdown options
    expect(screen.queryByRole('option', { name: 'Mineral Wasser' })).not.toBeInTheDocument();
    // Dropdown should reset to empty
    expect(select.value).toBe('');
  });

  test('removing a chip via × button makes drink available in dropdown again', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'craft-bier', name: 'Craft Bier' }]);
      return jest.fn();
    });
    openNewGuestForm();
    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    fireEvent.change(select, { target: { value: 'craft-bier' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Hinzufügen' })[0]);

    // Remove the chip
    fireEvent.click(screen.getByLabelText('Craft Bier entfernen'));

    // Chip should be gone
    expect(screen.queryByLabelText('Craft Bier entfernen')).not.toBeInTheDocument();
    // Craft Bier should be back in dropdown
    expect(screen.getByRole('option', { name: 'Craft Bier' })).toBeInTheDocument();
  });

  test('editing an existing guest shows pre-selected custom drinks as chips', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'hauswein', name: 'Hauswein' }]);
      return jest.fn();
    });
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        {
          id: 'g1',
          vorname: 'Max',
          nachname: 'Mustermann',
          alkoholischeGetränke: true,
          bevorzugteGetränke: ['hauswein'],
          präferenzFaktor: 0.5,
        },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);
    fireEvent.click(screen.getByText('Max Mustermann'));

    // Hauswein chip should be present
    expect(screen.getByLabelText('Hauswein entfernen')).toBeInTheDocument();
    // Hauswein should not appear in dropdown options
    expect(screen.queryByRole('option', { name: 'Hauswein' })).not.toBeInTheDocument();
  });

  test('custom drinks appear in the dropdown', () => {
    mockSubscribeToAllCustomDrinks.mockImplementation((cb) => {
      cb([{ id: 'craft-ipa', name: 'Craft IPA' }]);
      return jest.fn();
    });

    openNewGuestForm();
    expect(screen.getByRole('option', { name: 'Craft IPA' })).toBeInTheDocument();
  });

  test('renders the mobile add FAB even in the empty state and opens the create form', () => {
    render(<GuestManagementPage currentUser={currentUser} />);

    const fabButton = screen.getByRole('button', { name: 'Gast anlegen' });
    expect(fabButton).toBeInTheDocument();

    fireEvent.click(fabButton);
    expect(screen.getByRole('heading', { level: 2, name: 'Neuen Gast erfassen' })).toBeInTheDocument();
  });

  test('saves the Kind flag for a guest profile', async () => {
    openNewGuestForm();

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Lena' } });
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Beispiel' } });
    fireEvent.click(screen.getByLabelText('Kind'));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(mockSaveGuestProfile).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          vorname: 'Lena',
          nachname: 'Beispiel',
          kind: true,
        }),
        undefined,
      );
    });
  });

  test('shows a category dropdown with standard drink categories', () => {
    openNewGuestForm();
    const categorySelect = screen.getByRole('combobox', { name: 'Getränkekategorie auswählen' });
    expect(categorySelect).toBeInTheDocument();
    expect(within(categorySelect).getByRole('option', { name: 'Wasser' })).toBeInTheDocument();
    expect(within(categorySelect).getByRole('option', { name: 'Wein' })).toBeInTheDocument();
    expect(within(categorySelect).getByRole('option', { name: 'Rotwein' })).toBeInTheDocument();
  });

  test('adding a category creates a chip and removes it from the dropdown', () => {
    openNewGuestForm();
    const categorySelect = screen.getByRole('combobox', { name: 'Getränkekategorie auswählen' });
    fireEvent.change(categorySelect, { target: { value: 'wein_rotwein' } });

    // Find the Hinzufügen button next to the category select
    const addButtons = screen.getAllByRole('button', { name: 'Hinzufügen' });
    const categoryAddBtn = addButtons[1]; // second Hinzufügen button is for categories
    expect(categoryAddBtn).not.toBeDisabled();
    fireEvent.click(categoryAddBtn);

    expect(screen.getByLabelText('Rotwein entfernen')).toBeInTheDocument();
    expect(categorySelect.value).toBe('');
  });

  test('removing a category chip makes the category available in the dropdown again', () => {
    openNewGuestForm();
    const categorySelect = screen.getByRole('combobox', { name: 'Getränkekategorie auswählen' });
    fireEvent.change(categorySelect, { target: { value: 'wein_rotwein' } });
    const addButtons = screen.getAllByRole('button', { name: 'Hinzufügen' });
    fireEvent.click(addButtons[1]);

    // Remove the chip
    fireEvent.click(screen.getByLabelText('Rotwein entfernen'));

    expect(screen.queryByLabelText('Rotwein entfernen')).not.toBeInTheDocument();
    expect(within(categorySelect).getByRole('option', { name: 'Rotwein' })).toBeInTheDocument();
  });

  test('editing a guest loads pre-selected categories as chips', () => {
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        {
          id: 'g2',
          vorname: 'Erika',
          nachname: 'Muster',
          alkoholischeGetränke: true,
          bevorzugteGetränke: [],
          bevorzugteKategorien: ['wein_rotwein'],
          präferenzFaktor: 0.5,
        },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);
    fireEvent.click(screen.getByText('Erika Muster'));

    expect(screen.getByLabelText('Rotwein entfernen')).toBeInTheDocument();
  });

  test('guest overview card shows preferred drink categories', () => {
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        {
          id: 'g3',
          vorname: 'Petra',
          nachname: 'Beispiel',
          alkoholischeGetränke: true,
          bevorzugteGetränke: [],
          bevorzugteKategorien: ['wein_rotwein', 'bier'],
          präferenzFaktor: 0.5,
        },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);

    expect(screen.getByText('Bevorzugt: Rotwein, Bier')).toBeInTheDocument();
  });

  test('guest overview card shows no preference line when no categories are set', () => {
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        {
          id: 'g4',
          vorname: 'Otto',
          nachname: 'Beispiel',
          alkoholischeGetränke: true,
          bevorzugteGetränke: [],
          bevorzugteKategorien: [],
          präferenzFaktor: 0.5,
        },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);

    expect(screen.queryByText(/Bevorzugt:/)).not.toBeInTheDocument();
  });

  test('guest overview is sorted by nachname then vorname ascending', () => {
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        { id: 'g1', vorname: 'Bernd', nachname: 'Zimmer', alkoholischeGetränke: true, bevorzugteGetränke: [], bevorzugteKategorien: [], präferenzFaktor: 0.5 },
        { id: 'g2', vorname: 'Zora', nachname: 'Adler', alkoholischeGetränke: true, bevorzugteGetränke: [], bevorzugteKategorien: [], präferenzFaktor: 0.5 },
        { id: 'g3', vorname: 'Anna', nachname: 'Adler', alkoholischeGetränke: true, bevorzugteGetränke: [], bevorzugteKategorien: [], präferenzFaktor: 0.5 },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Anna Adler', 'Zora Adler', 'Bernd Zimmer']);
  });

  test('clicking the delete button on a guest card deletes the guest without opening the edit form', () => {
    window.confirm = jest.fn(() => true);
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        { id: 'g1', vorname: 'Anna', nachname: 'Adler', alkoholischeGetränke: true, bevorzugteGetränke: [], bevorzugteKategorien: [], präferenzFaktor: 0.5 },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Anna Adler löschen' }));

    expect(window.confirm).toHaveBeenCalledWith('Möchtest du "Anna Adler" wirklich löschen?');
    expect(mockDeleteGuestProfile).toHaveBeenCalledWith('u1', 'g1');
  });

  test('delete button click does not trigger the edit form to open', () => {
    window.confirm = jest.fn(() => true);
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb([
        { id: 'g1', vorname: 'Anna', nachname: 'Adler', alkoholischeGetränke: true, bevorzugteGetränke: [], bevorzugteKategorien: [], präferenzFaktor: 0.5 },
      ]);
      return jest.fn();
    });

    render(<GuestManagementPage currentUser={currentUser} />);

    fireEvent.click(screen.getByRole('button', { name: 'Anna Adler löschen' }));

    expect(screen.queryByRole('heading', { name: 'Gast bearbeiten' })).not.toBeInTheDocument();
  });

  describe('admin cross-user guest visibility', () => {
    const adminUser = { id: 'admin1', isAdmin: true };

    test('non-admins do not see the "Alle Anwender" toggle', () => {
      render(<GuestManagementPage currentUser={currentUser} />);
      expect(screen.queryByRole('button', { name: 'Alle Anwender' })).not.toBeInTheDocument();
    });

    test('admin can switch to "Alle Anwender" and edit/delete another user\'s guest', async () => {
      window.confirm = jest.fn(() => true);
      mockSubscribeToAllGuestProfiles.mockImplementation((cb) => {
        cb([
          {
            id: 'g1',
            vorname: 'Ben',
            nachname: 'Beispiel',
            ownerId: 'other-user',
            alkoholischeGetränke: true,
            bevorzugteGetränke: [],
            bevorzugteKategorien: [],
            präferenzFaktor: 0.5,
          },
        ]);
        return jest.fn();
      });

      render(<GuestManagementPage currentUser={adminUser} />);

      fireEvent.click(screen.getByRole('button', { name: 'Alle Anwender' }));

      expect(await screen.findByText('Ben Beispiel')).toBeInTheDocument();

      const deleteBtn = screen.getByRole('button', { name: 'Ben Beispiel löschen' });
      expect(deleteBtn).toBeInTheDocument();

      // Clicking the card opens the edit form for the other user's guest.
      fireEvent.click(screen.getByText('Ben Beispiel'));
      expect(screen.getByRole('heading', { level: 2, name: 'Gast bearbeiten' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Benjamin' } });
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

      await waitFor(() => {
        expect(mockSaveGuestProfile).toHaveBeenCalledWith(
          adminUser.id,
          expect.objectContaining({ vorname: 'Benjamin' }),
          'g1',
          'other-user',
        );
      });
    });

    test('admin deleting another user\'s guest passes the owner id through', () => {
      window.confirm = jest.fn(() => true);
      mockSubscribeToAllGuestProfiles.mockImplementation((cb) => {
        cb([
          { id: 'g1', vorname: 'Ben', nachname: 'Beispiel', ownerId: 'other-user' },
        ]);
        return jest.fn();
      });

      render(<GuestManagementPage currentUser={adminUser} />);
      fireEvent.click(screen.getByRole('button', { name: 'Alle Anwender' }));

      fireEvent.click(screen.getByRole('button', { name: 'Ben Beispiel löschen' }));

      expect(mockDeleteGuestProfile).toHaveBeenCalledWith(adminUser.id, 'g1', 'other-user');
    });
  });
});
