import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PersonalDataPage from './PersonalDataPage';
import { updateUserProfile, changePassword } from '../utils/userManagement';

jest.mock('../utils/userManagement', () => ({
  updateUserProfile: jest.fn(),
  changePassword: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  ALARM_SOUNDS: [
    { key: 'radar', label: 'Radar' },
    { key: 'chime', label: 'Chime' },
  ],
  getAlarmSoundPreference: jest.fn(() => 'radar'),
  saveAlarmSoundPreference: jest.fn(),
  getDarkModeMode: jest.fn(() => 'auto'),
  saveDarkModePreference: jest.fn(),
  applyDarkModePreference: jest.fn(),
}));

jest.mock('../utils/alarmAudioUtils', () => ({
  previewAlarmSound: jest.fn(),
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
    changePassword.mockResolvedValue({ success: true, message: 'Passwort erfolgreich geändert.' });
  });

  test('renders page with title "Chefkoch"', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Chefkoch' })).toBeInTheDocument();
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
        defaultWebImportListId: '',
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

  test('renders password change section with required fields', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByLabelText('Aktuelles Passwort')).toBeInTheDocument();
    expect(screen.getByLabelText('Neues Passwort')).toBeInTheDocument();
    expect(screen.getByLabelText('Neues Passwort bestätigen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Passwort ändern/i })).toBeInTheDocument();
  });

  test('shows error when new passwords do not match', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'DifferentPass!' } });

    fireEvent.click(screen.getByRole('button', { name: /Passwort ändern/i }));

    await waitFor(() => {
      expect(screen.getByText('Die neuen Passwörter stimmen nicht überein.')).toBeInTheDocument();
    });
    expect(changePassword).not.toHaveBeenCalled();
  });

  test('calls changePassword with correct arguments on valid submit', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'NewPass456!' } });

    fireEvent.click(screen.getByRole('button', { name: /Passwort ändern/i }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith('user-1', 'NewPass456!', 'OldPass123!');
    });
  });

  test('shows success message after password change', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'NewPass456!' } });

    fireEvent.click(screen.getByRole('button', { name: /Passwort ändern/i }));

    await waitFor(() => {
      expect(screen.getByText('Passwort erfolgreich geändert.')).toBeInTheDocument();
    });
  });

  test('clears password fields after successful password change', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'NewPass456!' } });

    fireEvent.click(screen.getByRole('button', { name: /Passwort ändern/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Aktuelles Passwort').value).toBe('');
      expect(screen.getByLabelText('Neues Passwort').value).toBe('');
      expect(screen.getByLabelText('Neues Passwort bestätigen').value).toBe('');
    });
  });

  test('shows error message when password change fails', async () => {
    changePassword.mockResolvedValue({ success: false, message: 'Das aktuelle Passwort ist nicht korrekt.' });

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'WrongPass!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'NewPass456!' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), { target: { value: 'NewPass456!' } });

    fireEvent.click(screen.getByRole('button', { name: /Passwort ändern/i }));

    await waitFor(() => {
      expect(screen.getByText('Das aktuelle Passwort ist nicht korrekt.')).toBeInTheDocument();
    });
  });

  test('displays password requirements hint', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText(/Mindestanforderungen/i)).toBeInTheDocument();
  });
});

describe('PersonalDataPage - Erscheinungsbild', () => {
  const mockUser = {
    id: 'user-1',
    vorname: 'John',
    nachname: 'Doe',
    email: 'john@example.com',
    signatureSatz: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { getDarkModeMode } = jest.requireMock('../utils/customLists');
    getDarkModeMode.mockReturnValue('auto');
  });

  test('renders Erscheinungsbild row with current selection', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText('Erscheinungsbild')).toBeInTheDocument();
    expect(screen.getByText('Automatisch')).toBeInTheDocument();
  });

  test('opens appearance picker when Erscheinungsbild row is clicked', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));

    expect(screen.getByRole('heading', { name: 'Erscheinungsbild' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Hell/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Dunkel/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Automatisch/i })).toBeInTheDocument();
  });

  test('auto option shows checkmark in picker when darkMode is auto', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));

    const autoOption = screen.getByRole('option', { name: /Automatisch/i });
    expect(autoOption).toHaveAttribute('aria-selected', 'true');
    const lightOption = screen.getByRole('option', { name: /Hell/i });
    expect(lightOption).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking Hell option saves light mode', () => {
    const { saveDarkModePreference, applyDarkModePreference } = jest.requireMock('../utils/customLists');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));
    fireEvent.click(screen.getByRole('option', { name: /Hell/i }));

    expect(saveDarkModePreference).toHaveBeenCalledWith('light');
    expect(applyDarkModePreference).toHaveBeenCalledWith('light');
  });

  test('clicking Dunkel option saves dark mode', () => {
    const { saveDarkModePreference, applyDarkModePreference } = jest.requireMock('../utils/customLists');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));
    fireEvent.click(screen.getByRole('option', { name: /Dunkel/i }));

    expect(saveDarkModePreference).toHaveBeenCalledWith('dark');
    expect(applyDarkModePreference).toHaveBeenCalledWith('dark');
  });

  test('clicking Automatisch option saves auto mode', () => {
    const { saveDarkModePreference, applyDarkModePreference, getDarkModeMode } = jest.requireMock('../utils/customLists');
    getDarkModeMode.mockReturnValue('light');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));
    fireEvent.click(screen.getByRole('option', { name: /Automatisch/i }));

    expect(saveDarkModePreference).toHaveBeenCalledWith('auto');
    expect(applyDarkModePreference).toHaveBeenCalledWith('auto');
  });

  test('back button in picker returns to main page', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));
    expect(screen.getByRole('heading', { name: 'Erscheinungsbild' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.queryByRole('heading', { name: 'Erscheinungsbild' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chefkoch' })).toBeInTheDocument();
  });

  test('selecting an option updates the row value after closing picker', () => {
    const { getDarkModeMode } = jest.requireMock('../utils/customLists');
    getDarkModeMode.mockReturnValue('auto');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Erscheinungsbild/i }));
    fireEvent.click(screen.getByRole('option', { name: /Hell/i }));

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.getByText('Hell')).toBeInTheDocument();
  });
});

describe('PersonalDataPage - Alarmton', () => {
  const mockUser = {
    id: 'user-1',
    vorname: 'John',
    nachname: 'Doe',
    email: 'john@example.com',
    signatureSatz: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const { getAlarmSoundPreference } = jest.requireMock('../utils/customLists');
    getAlarmSoundPreference.mockReturnValue('radar');
  });

  test('renders Alarmton row with current selection and chevron', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText('Alarmton')).toBeInTheDocument();
    expect(screen.getByText('Radar')).toBeInTheDocument();
  });

  test('opens alarm sound picker when Alarmton row is clicked', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Alarmton/i }));

    expect(screen.getByRole('heading', { name: 'Alarmton' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Chime/i })).toBeInTheDocument();
  });

  test('selected sound shows checkmark in picker', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Alarmton/i }));

    const radarOption = screen.getByRole('option', { name: /Radar/i });
    expect(radarOption).toHaveAttribute('aria-selected', 'true');
    const chimeOption = screen.getByRole('option', { name: /Chime/i });
    expect(chimeOption).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a sound in picker saves and previews it, and updates the row', () => {
    const { saveAlarmSoundPreference } = jest.requireMock('../utils/customLists');
    const { previewAlarmSound } = jest.requireMock('../utils/alarmAudioUtils');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Alarmton/i }));
    fireEvent.click(screen.getByRole('option', { name: /Chime/i }));

    expect(saveAlarmSoundPreference).toHaveBeenCalledWith('chime');
    expect(previewAlarmSound).toHaveBeenCalledWith('chime');

    // Return to main page and verify row shows new selection
    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.getByText('Chime')).toBeInTheDocument();
  });

  test('back button in picker returns to main page', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Alarmton/i }));
    expect(screen.getByRole('heading', { name: 'Alarmton' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.queryByRole('heading', { name: 'Alarmton' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chefkoch' })).toBeInTheDocument();
  });
});
