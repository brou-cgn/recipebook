import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PersonalDataPage from './PersonalDataPage';
import { updateUserProfile, changePassword, saveFcmToken, setUserSprache } from '../utils/userManagement';
import { renderWithProviders } from '../test-utils';

jest.mock('../utils/userManagement', () => ({
  updateUserProfile: jest.fn(),
  changePassword: jest.fn(),
  saveFcmToken: jest.fn(),
  setUserSprache: jest.fn(),
  setBackgroundUpdatesEnabled: jest.fn(),
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

jest.mock('../utils/pushNotifications', () => ({
  requestNotificationPermission: jest.fn(),
  getMessagingServiceWorkerVersion: () => mockGetMessagingServiceWorkerVersion(),
}));

const mockGetMessagingServiceWorkerVersion = jest.fn();
jest.mock('../utils/pushTapHandoff', () => ({
  readPushLog: () => Promise.resolve([]),
  clearPushLog: () => Promise.resolve(),
}));

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });
});

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

  test('zeigt im Kopf Initialen und Namen, „Zurück“ ruft onBack', () => {
    const onBack = jest.fn();
    const { container } = render(<PersonalDataPage currentUser={mockUser} onBack={onBack} />);

    expect(container.querySelector('.personal-data-avatar')).toHaveTextContent('JD');
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(onBack).toHaveBeenCalled();
  });

  test('Speichern des Formulars meldet ohne Zusatz – „Chefkoch & mehr“ schließt dann die Seite', async () => {
    const onProfileUpdated = jest.fn();
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} onProfileUpdated={onProfileUpdated} />);

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(onProfileUpdated).toHaveBeenCalledTimes(1));
    expect(onProfileUpdated.mock.calls[0]).toHaveLength(1);
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
        defaultEverydayClassicsListId: '',
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

describe('PersonalDataPage - Standard-Liste für Webimport', () => {
  const mockUser = {
    id: 'user-1',
    vorname: 'John',
    nachname: 'Doe',
    email: 'john@example.com',
    signatureSatz: '',
  };

  const privateLists = [
    { id: 'list-1', name: 'Meine Favoriten' },
    { id: 'list-2', name: 'Wochenplan' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    updateUserProfile.mockResolvedValue({ success: true, message: 'Profil erfolgreich aktualisiert.' });
  });

  test('renders Standard-Liste row with chevron when privateLists are provided', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={privateLists} />);

    expect(screen.getByText('Inspirationssammlung')).toBeInTheDocument();
    expect(screen.getByText('Alltagsklassiker')).toBeInTheDocument();
    expect(screen.getAllByText('– Keine Vorauswahl –').length).toBeGreaterThan(0);
  });

  test('does not render Standard-Liste row when privateLists is empty', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={[]} />);

    expect(screen.queryByText('Inspirationssammlung')).not.toBeInTheDocument();
    expect(screen.queryByText('Alltagsklassiker')).not.toBeInTheDocument();
  });

  test('shows current selection in the row when defaultWebImportListId is set', () => {
    const userWithList = { ...mockUser, defaultWebImportListId: 'list-1' };
    render(<PersonalDataPage currentUser={userWithList} onBack={() => {}} privateLists={privateLists} />);

    expect(screen.getByText('Meine Favoriten')).toBeInTheDocument();
  });

  test('opens web import list picker when row is clicked', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));

    expect(screen.getByRole('heading', { name: 'Inspirationssammlung' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Keine Vorauswahl/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Meine Favoriten/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Wochenplan/i })).toBeInTheDocument();
  });

  test('no-preselection option shows checkmark by default', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));

    const noListOption = screen.getByRole('option', { name: /Keine Vorauswahl/i });
    expect(noListOption).toHaveAttribute('aria-selected', 'true');
    const list1Option = screen.getByRole('option', { name: /Meine Favoriten/i });
    expect(list1Option).toHaveAttribute('aria-selected', 'false');
  });

  test('selected list shows checkmark in picker', () => {
    const userWithList = { ...mockUser, defaultWebImportListId: 'list-1' };
    render(<PersonalDataPage currentUser={userWithList} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));

    const list1Option = screen.getByRole('option', { name: /Meine Favoriten/i });
    expect(list1Option).toHaveAttribute('aria-selected', 'true');
    const noListOption = screen.getByRole('option', { name: /Keine Vorauswahl/i });
    expect(noListOption).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a list in picker saves profile immediately and updates the row', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));
    fireEvent.click(screen.getByRole('option', { name: /Meine Favoriten/i }));

    await waitFor(() => {
      expect(updateUserProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
        defaultWebImportListId: 'list-1',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.getByText('Meine Favoriten')).toBeInTheDocument();
  });

  test('clicking no-preselection option clears the selection', async () => {
    const userWithList = { ...mockUser, defaultWebImportListId: 'list-1' };
    render(<PersonalDataPage currentUser={userWithList} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));
    fireEvent.click(screen.getByRole('option', { name: /Keine Vorauswahl/i }));

    await waitFor(() => {
      expect(updateUserProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
        defaultWebImportListId: '',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.getAllByText('– Keine Vorauswahl –').length).toBeGreaterThan(0);
  });

  test('calls onProfileUpdated when list is selected', async () => {
    const onProfileUpdated = jest.fn();
    render(
      <PersonalDataPage
        currentUser={mockUser}
        onBack={() => {}}
        onProfileUpdated={onProfileUpdated}
        privateLists={privateLists}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));
    fireEvent.click(screen.getByRole('option', { name: /Wochenplan/i }));

    await waitFor(() => {
      expect(onProfileUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ defaultWebImportListId: 'list-2' }),
        { schliessen: false }
      );
    });
  });

  test('back button in picker returns to main page', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Inspirationssammlung/i }));
    expect(screen.getByRole('heading', { name: 'Inspirationssammlung' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Zurück/i }));
    expect(screen.queryByRole('heading', { name: 'Inspirationssammlung' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chefkoch' })).toBeInTheDocument();
  });

  test('opens alltagsklassiker picker and saves selected list', async () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} privateLists={privateLists} />);

    fireEvent.click(screen.getByRole('button', { name: /Alltagsklassiker/i }));
    expect(screen.getByRole('heading', { name: 'Alltagsklassiker' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Wochenplan/i }));

    await waitFor(() => {
      expect(updateUserProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
        defaultEverydayClassicsListId: 'list-2',
      }));
    });
  });
});

describe('PersonalDataPage - Erscheinungsbild (Auswahl direkt in der Zeile)', () => {
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

  const gruppe = () => screen.getByRole('radiogroup', { name: 'Erscheinungsbild' });

  test('zeigt die drei Möglichkeiten ohne Unterseite, die gespeicherte ist gewählt', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    const optionen = within(gruppe()).getAllByRole('radio');
    expect(optionen.map((o) => o.textContent)).toEqual(['Hell', 'Dunkel', 'Automatisch']);
    expect(within(gruppe()).getByRole('radio', { name: 'Automatisch' })).toHaveAttribute('aria-checked', 'true');
    expect(within(gruppe()).getByRole('radio', { name: 'Hell' })).toHaveAttribute('aria-checked', 'false');
  });

  test.each([
    ['Hell', 'light'],
    ['Dunkel', 'dark'],
  ])('Tipp auf %s speichert und wendet den Modus %s sofort an', (name, modus) => {
    const { saveDarkModePreference, applyDarkModePreference } = jest.requireMock('../utils/customLists');
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(within(gruppe()).getByRole('radio', { name }));

    expect(saveDarkModePreference).toHaveBeenCalledWith(modus);
    expect(applyDarkModePreference).toHaveBeenCalledWith(modus);
    expect(within(gruppe()).getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
  });

  test('Pfeiltasten wechseln die Auswahl wie bei Radioknöpfen, Tab erreicht nur die gewählte', () => {
    const { saveDarkModePreference } = jest.requireMock('../utils/customLists');
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    const auto = within(gruppe()).getByRole('radio', { name: 'Automatisch' });
    expect(auto).toHaveAttribute('tabindex', '0');
    expect(within(gruppe()).getByRole('radio', { name: 'Hell' })).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(auto, { key: 'ArrowRight' });
    expect(saveDarkModePreference).toHaveBeenLastCalledWith('light');
    expect(within(gruppe()).getByRole('radio', { name: 'Hell' })).toHaveFocus();

    fireEvent.keyDown(within(gruppe()).getByRole('radio', { name: 'Hell' }), { key: 'ArrowLeft' });
    expect(saveDarkModePreference).toHaveBeenLastCalledWith('auto');
  });
});

describe('PersonalDataPage - Alarmton (klappt in der Zeile auf)', () => {
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

  const zeile = () => screen.getByRole('button', { name: /Alarmton/ });

  test('zeigt den gewählten Ton in der Zeile, zugeklappt', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(zeile()).toHaveTextContent('Radar');
    expect(zeile()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup', { name: 'Alarmton auswählen' })).not.toBeInTheDocument();
  });

  test('Tipp auf die Zeile klappt die Töne auf und wieder zu, ohne Unterseite', () => {
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(zeile());
    expect(zeile()).toHaveAttribute('aria-expanded', 'true');
    const liste = screen.getByRole('radiogroup', { name: 'Alarmton auswählen' });
    expect(within(liste).getByRole('radio', { name: 'Radar' })).toHaveAttribute('aria-checked', 'true');
    expect(within(liste).getByRole('radio', { name: 'Chime' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('heading', { name: 'Chefkoch' })).toBeInTheDocument();

    fireEvent.click(zeile());
    expect(screen.queryByRole('radiogroup', { name: 'Alarmton auswählen' })).not.toBeInTheDocument();
  });

  test('Tipp auf einen Ton speichert ihn, spielt ihn an und zeigt ihn in der Zeile', () => {
    const { saveAlarmSoundPreference } = jest.requireMock('../utils/customLists');
    const { previewAlarmSound } = jest.requireMock('../utils/alarmAudioUtils');
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(zeile());
    fireEvent.click(screen.getByRole('radio', { name: 'Chime' }));

    expect(saveAlarmSoundPreference).toHaveBeenCalledWith('chime');
    expect(previewAlarmSound).toHaveBeenCalledWith('chime');
    expect(zeile()).toHaveTextContent('Chime');
    expect(screen.getByRole('radio', { name: 'Chime' })).toHaveAttribute('aria-checked', 'true');
  });

  test('der schon gewählte Ton spielt beim Antippen noch einmal an', () => {
    const { previewAlarmSound } = jest.requireMock('../utils/alarmAudioUtils');
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(zeile());
    fireEvent.click(screen.getByRole('radio', { name: 'Radar' }));

    expect(previewAlarmSound).toHaveBeenCalledWith('radar');
  });
});

describe('PersonalDataPage - PWA-Mitteilungen', () => {
  const mockUser = {
    id: 'user-1',
    vorname: 'John',
    nachname: 'Doe',
    email: 'john@example.com',
    signatureSatz: '',
  };

  const { requestNotificationPermission } = require('../utils/pushNotifications');

  beforeEach(() => {
    jest.clearAllMocks();
    requestNotificationPermission.mockResolvedValue(null);
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64)',
      configurable: true,
    });
  });

  afterEach(() => {
    delete global.Notification;
  });

  test('renders PWA-Mitteilungen section heading and description', () => {
    global.Notification = { permission: 'default' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByRole('heading', { name: 'PWA-Mitteilungen' })).toBeInTheDocument();
    expect(screen.getByText(/Erhalte Benachrichtigungen/i)).toBeInTheDocument();
  });

  test('shows "Aktivieren" status and chevron when permission is default', () => {
    global.Notification = { permission: 'default' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText('Aktivieren')).toBeInTheDocument();
    // Button is enabled and clickable
    const btn = screen.getByRole('button', { name: /Mitteilungen.*Aktivieren/i });
    expect(btn).not.toBeDisabled();
  });

  test('shows "Aktiv" and disabled button when permission is granted', () => {
    global.Notification = { permission: 'granted' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText('Aktiv')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Mitteilungen.*Aktiv/i });
    expect(btn).toBeDisabled();
  });

  test('shows "Deaktiviert" and disabled button when permission is denied', () => {
    global.Notification = { permission: 'denied' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText('Deaktiviert')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Mitteilungen.*Deaktiviert/i });
    expect(btn).toBeDisabled();
  });

  test('shows warning hint when permission is denied', () => {
    global.Notification = { permission: 'denied' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText(/Mitteilungen wurden abgelehnt/i)).toBeInTheDocument();
  });

  test('shows "Nicht verfügbar" and info hint when Notification API is not available', () => {
    // No global.Notification set
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText('Nicht verfügbar')).toBeInTheDocument();
    expect(screen.getByText(/Dein Browser oder Gerät unterstützt keine PWA-Mitteilungen/i)).toBeInTheDocument();
  });

  test('calls requestNotificationPermission when "Aktivieren" button is clicked', async () => {
    global.Notification = { permission: 'default' };
    requestNotificationPermission.mockResolvedValue('some-token');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    const btn = screen.getByRole('button', { name: /Mitteilungen.*Aktivieren/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    });
  });

  test('saves returned FCM token when "Aktivieren" is clicked', async () => {
    global.Notification = { permission: 'default' };
    requestNotificationPermission.mockResolvedValue('some-token');

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Mitteilungen.*Aktivieren/i }));

    await waitFor(() => {
      expect(saveFcmToken).toHaveBeenCalledWith('user-1', 'some-token');
    });
  });

  test('does not save FCM token when permission request returns null', async () => {
    global.Notification = { permission: 'default' };
    requestNotificationPermission.mockResolvedValue(null);

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Mitteilungen.*Aktivieren/i }));

    await waitFor(() => {
      expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    });
    expect(saveFcmToken).not.toHaveBeenCalled();
  });

  test('updates status to "Aktiv" after permission is granted', async () => {
    global.Notification = { permission: 'default' };
    requestNotificationPermission.mockImplementation(async () => {
      global.Notification = { permission: 'granted' };
      return 'some-token';
    });

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Mitteilungen.*Aktivieren/i }));

    await waitFor(() => {
      expect(screen.getByText('Aktiv')).toBeInTheDocument();
    });
  });

  test('does not show warning or info hints when permission is default', () => {
    global.Notification = { permission: 'default' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.queryByText(/Mitteilungen wurden abgelehnt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dein Browser oder Gerät unterstützt keine PWA-Mitteilungen/i)).not.toBeInTheDocument();
  });

  test('does not show warning hint when permission is granted', () => {
    global.Notification = { permission: 'granted' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.queryByText(/Mitteilungen wurden abgelehnt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dein Browser oder Gerät unterstützt keine PWA-Mitteilungen/i)).not.toBeInTheDocument();
  });

  test('shows the iOS install hint on iPhone/iPad user agents', () => {
    global.Notification = { permission: 'default' };
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    });

    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.getByText(/iOS 16\.4\+/i)).toBeInTheDocument();
    expect(screen.getByText(/Zum Home-Bildschirm hinzufügen/i)).toBeInTheDocument();
  });

  test('does not show the iOS install hint on non-iOS user agents', () => {
    global.Notification = { permission: 'default' };
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    expect(screen.queryByText(/iOS 16\.4\+/i)).not.toBeInTheDocument();
  });

  test('Hintergrundaktualisierung ist ein Schalter und bleibt nach dem Umschalten auf der Seite', async () => {
    global.Notification = { permission: 'granted' };
    const { setBackgroundUpdatesEnabled } = require('../utils/userManagement');
    setBackgroundUpdatesEnabled.mockResolvedValue(undefined);
    const onProfileUpdated = jest.fn();
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} onProfileUpdated={onProfileUpdated} />);

    const schalter = screen.getByRole('switch', { name: 'Hintergrundaktualisierung' });
    expect(schalter).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(schalter);

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Hintergrundaktualisierung' })).toHaveAttribute('aria-checked', 'true'));
    expect(setBackgroundUpdatesEnabled).toHaveBeenCalledWith('user-1', true);
    expect(onProfileUpdated).toHaveBeenCalledWith({ ...mockUser, backgroundUpdatesEnabled: true }, { schliessen: false });
  });

  test('Protokoll Push-Tipps zeigt, welche Fassung des Mitteilungs-Workers läuft', async () => {
    mockGetMessagingServiceWorkerVersion.mockResolvedValue(null);
    render(<PersonalDataPage currentUser={mockUser} onBack={() => {}} />);

    fireEvent.click(screen.getByText('Protokoll Push-Tipps'));

    expect(await screen.findByText(/Mitteilungs-Worker ältere Fassung/)).toBeInTheDocument();
    expect(screen.getByText('Noch keine Einträge.')).toBeInTheDocument();
  });
});

describe('PersonalDataPage – Sprache (Vorhaben Mehrsprachigkeit)', () => {
  const nutzer = {
    id: 'user-1',
    vorname: 'John',
    nachname: 'Doe',
    email: 'john@example.com',
    signatureSatz: '',
    sprachwahl: true,
  };
  const gruppe = () => screen.getByRole('radiogroup', { name: 'Sprache' });

  beforeEach(() => {
    jest.clearAllMocks();
    setUserSprache.mockResolvedValue(undefined);
  });

  it('zeigt die Sprachwahl nur mit der Berechtigung sprachwahl', () => {
    const { unmount } = render(<PersonalDataPage currentUser={{ ...nutzer, sprachwahl: false }} onBack={() => {}} />);
    expect(screen.queryByRole('radiogroup', { name: 'Sprache' })).not.toBeInTheDocument();
    unmount();
    render(<PersonalDataPage currentUser={nutzer} onBack={() => {}} />);
    expect(gruppe()).toBeInTheDocument();
  });

  it('zeigt die gespeicherte Sprache und bietet alle drei in ihrer eigenen Sprache an', () => {
    render(<PersonalDataPage currentUser={{ ...nutzer, sprache: 'fr' }} onBack={() => {}} />);
    const optionen = within(gruppe()).getAllByRole('radio');
    expect(optionen.map((option) => option.getAttribute('lang'))).toEqual(['de', 'en', 'fr']);
    expect(within(gruppe()).getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'false');
    expect(within(gruppe()).getByRole('radio', { name: 'Français' })).toHaveAttribute('aria-checked', 'true');
  });

  it('speichert die gewählte Sprache und meldet sie weiter, ohne die Seite zu schließen', async () => {
    const onProfileUpdated = jest.fn();
    render(<PersonalDataPage currentUser={nutzer} onBack={() => {}} onProfileUpdated={onProfileUpdated} />);
    fireEvent.click(within(gruppe()).getByRole('radio', { name: 'English' }));
    expect(within(gruppe()).getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(onProfileUpdated).toHaveBeenCalledWith({ ...nutzer, sprache: 'en' }, { schliessen: false }));
    expect(setUserSprache).toHaveBeenCalledWith('user-1', 'en');
  });

  it('speichert nichts, wenn die schon gewählte Sprache angetippt wird', () => {
    render(<PersonalDataPage currentUser={nutzer} onBack={() => {}} />);
    fireEvent.click(within(gruppe()).getByRole('radio', { name: 'Deutsch' }));
    expect(setUserSprache).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler beim Speichern und springt zur gespeicherten Sprache zurück', async () => {
    setUserSprache.mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onProfileUpdated = jest.fn();
    render(<PersonalDataPage currentUser={nutzer} onBack={() => {}} onProfileUpdated={onProfileUpdated} />);
    fireEvent.click(within(gruppe()).getByRole('radio', { name: 'Français' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Änderung konnte nicht gespeichert werden.');
    expect(within(gruppe()).getByRole('radio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true');
    expect(onProfileUpdated).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('erscheint auf Englisch und Französisch, wenn die Sprache gilt', () => {
    const { unmount } = renderWithProviders(<PersonalDataPage currentUser={nutzer} onBack={() => {}} />, { sprache: 'en' });
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Personal details' })).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('John');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeInTheDocument();
    unmount();

    renderWithProviders(<PersonalDataPage currentUser={nutzer} onBack={() => {}} />, { sprache: 'fr' });
    expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Données personnelles' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prénom')).toHaveValue('John');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });
});
