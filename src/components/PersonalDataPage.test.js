import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonalDataPage from './PersonalDataPage';
import { updateUserProfile } from '../utils/userManagement';

jest.mock('../utils/userManagement', () => ({
  updateUserProfile: jest.fn(),
}));

describe('PersonalDataPage', () => {
  const mockUser = {
    id: 'user-1',
    vorname: 'John',
    nachname: 'Doe',
    email: 'john@example.com',
    signatureSatz: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    updateUserProfile.mockResolvedValue({ success: true, message: 'Profil erfolgreich aktualisiert.' });
  });

  test('renders personal data form with pre-filled user data', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument();
  });

  test('calls onBack when cancel button is clicked', () => {
    const onBack = jest.fn();
    render(<PersonalDataPage currentUser={mockUser} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /Abbrechen/i }));
    expect(onBack).toHaveBeenCalled();
  });

  test('saves updated profile on form submit', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/Signature-Satz/i), { target: { value: 'Guten Appetit!' } });

    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(updateUserProfile).toHaveBeenCalledWith('user-1', {
        vorname: 'Max',
        nachname: 'Mustermann',
        email: 'john@example.com',
        signatureSatz: 'Guten Appetit!',
      });
    });
  });

  test('shows success message after successful save', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(screen.getByText('Profil erfolgreich aktualisiert.')).toBeInTheDocument();
    });
  });

  test('shows error message when save fails', async () => {
    updateUserProfile.mockResolvedValue({ success: false, message: 'Fehler beim Aktualisieren.' });

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(screen.getByText('Fehler beim Aktualisieren.')).toBeInTheDocument();
    });
  });

  test('calls onProfileUpdated with updated user data on successful save', async () => {
    const onProfileUpdated = jest.fn();
    render(
      <PersonalDataPage
        currentUser={mockUser}
        onBack={() => {}}
        onProfileUpdated={onProfileUpdated}
      />
    );

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Hans' } });
    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(onProfileUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ vorname: 'Hans' })
      );
    });
  });

  test('renders signature sentence textarea with existing value', () => {
    const userWithSignature = { ...mockUser, signatureSatz: 'Mein Signature-Satz' };
    render(<PersonalDataPage currentUser={userWithSignature} onBack={() => {}} />);

    expect(screen.getByDisplayValue('Mein Signature-Satz')).toBeInTheDocument();
  });
});
