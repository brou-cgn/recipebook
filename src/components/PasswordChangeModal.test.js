import { screen, fireEvent } from '@testing-library/react';
import PasswordChangeModal from './PasswordChangeModal';
import { changePassword } from '../utils/userManagement';
import { renderWithProviders } from '../test-utils';

// Nur changePassword ersetzen; validatePassword prüft wie in der App (Mehrsprachigkeit PR 6l)
jest.mock('../utils/userManagement', () => ({
  ...jest.requireActual('../utils/userManagement'),
  changePassword: jest.fn(),
}));

const nutzer = { id: 'user-1', vorname: 'Anna', nachname: 'Beispiel' };

function zeige(sprache, onPasswordChanged = jest.fn()) {
  renderWithProviders(<PasswordChangeModal user={nutzer} onPasswordChanged={onPasswordChanged} />, { sprache });
  return onPasswordChanged;
}

function eingeben(neu, bestaetigt) {
  fireEvent.change(document.getElementById('newPassword'), { target: { value: neu } });
  fireEvent.change(document.getElementById('confirmPassword'), { target: { value: bestaetigt } });
  fireEvent.submit(document.querySelector('form'));
}

describe('PasswordChangeModal', () => {
  test('Deutsch: duzt und nennt die richtige Mindestlänge (12 statt bisher 6 Zeichen)', () => {
    zeige('de');
    expect(screen.getByRole('heading', { name: 'Passwort ändern erforderlich' })).toBeInTheDocument();
    expect(screen.getByText('Du hast dich mit einem temporären Passwort angemeldet. Bitte vergib jetzt ein neues Passwort.')).toBeInTheDocument();
    expect(screen.getByLabelText('Neues Passwort')).toHaveAttribute('placeholder', 'Mindestens 12 Zeichen');
  });

  test('ruft nach erfolgreichem Wechsel onPasswordChanged auf', async () => {
    changePassword.mockResolvedValue({ success: true, schluessel: 'passwortGeaendert', message: 'Passwort erfolgreich geändert.' });
    const onPasswordChanged = zeige('de');
    eingeben('SecurePass12!', 'SecurePass12!');
    await screen.findByRole('button', { name: 'Passwort ändern' });
    expect(changePassword).toHaveBeenCalledWith('user-1', 'SecurePass12!');
    expect(onPasswordChanged).toHaveBeenCalled();
  });

  test('Englisch: unterschiedliche Passwörter und Meldung von changePassword über ihren Schlüssel', async () => {
    changePassword.mockResolvedValue({ success: false, schluessel: 'fehlerErneutAnmelden', message: 'Für diese Aktion musst du dich erneut anmelden.' });
    zeige('en');
    expect(screen.getByRole('heading', { name: 'Password change required' })).toBeInTheDocument();

    eingeben('SecurePass12!', 'SecurePass13!');
    expect(screen.getByText('The passwords don’t match.')).toBeInTheDocument();

    eingeben('SecurePass12!', 'SecurePass12!');
    expect(await screen.findByText('You need to sign in again for this action.')).toBeInTheDocument();
  });

  test('Französisch: Prüfung des Passworts in der Sprache', () => {
    zeige('fr');
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('placeholder', '12 caractères minimum');
    eingeben('court1', 'court1');
    expect(screen.getByText('Le mot de passe doit contenir au moins 12 caractères.')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });
});
