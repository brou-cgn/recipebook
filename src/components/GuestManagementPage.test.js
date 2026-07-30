import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GuestManagementPage from './GuestManagementPage';

const mockSubscribeToGuestProfiles = jest.fn();
const mockSubscribeToCustomDrinks = jest.fn();
const mockSaveGuestProfile = jest.fn();
const mockDeleteGuestProfile = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToGuestProfiles: (...args) => mockSubscribeToGuestProfiles(...args),
  subscribeToCustomDrinks: (...args) => mockSubscribeToCustomDrinks(...args),
  saveGuestProfile: (...args) => mockSaveGuestProfile(...args),
  deleteGuestProfile: (...args) => mockDeleteGuestProfile(...args),
}));

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: () => true,
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
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
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

  test('shows a dropdown to select drinks – standard categories are not listed', () => {
    openNewGuestForm();
    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    expect(select).toBeInTheDocument();
    // Standard categories should NOT appear – only custom drinks are listed
    expect(screen.queryByRole('option', { name: 'Wasser' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Wein' })).not.toBeInTheDocument();
  });

  test('Hinzufügen button is disabled when no drink is selected in dropdown', () => {
    openNewGuestForm();
    const addBtn = screen.getByRole('button', { name: 'Hinzufügen' });
    expect(addBtn).toBeDisabled();
  });

  test('adding a drink creates a chip and removes it from the dropdown', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{ id: 'mineral-wasser', name: 'Mineral Wasser' }]);
      return jest.fn();
    });
    openNewGuestForm();
    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    fireEvent.change(select, { target: { value: 'mineral-wasser' } });

    const addBtn = screen.getByRole('button', { name: 'Hinzufügen' });
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
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{ id: 'craft-bier', name: 'Craft Bier' }]);
      return jest.fn();
    });
    openNewGuestForm();
    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    fireEvent.change(select, { target: { value: 'craft-bier' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    // Remove the chip
    fireEvent.click(screen.getByLabelText('Craft Bier entfernen'));

    // Chip should be gone
    expect(screen.queryByLabelText('Craft Bier entfernen')).not.toBeInTheDocument();
    // Craft Bier should be back in dropdown
    expect(screen.getByRole('option', { name: 'Craft Bier' })).toBeInTheDocument();
  });

  test('editing an existing guest shows pre-selected custom drinks as chips', () => {
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
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
    mockSubscribeToCustomDrinks.mockImplementation((_uid, cb) => {
      cb([{ id: 'craft-ipa', name: 'Craft IPA' }]);
      return jest.fn();
    });

    openNewGuestForm();
    expect(screen.getByRole('option', { name: 'Craft IPA' })).toBeInTheDocument();
  });
});
