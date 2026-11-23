import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Register from './Register';
import { renderWithProviders } from '../test-utils';

describe('Register Component', () => {
  const mockOnRegister = jest.fn();
  const mockOnSwitchToLogin = jest.fn();

  beforeEach(() => {
    mockOnRegister.mockClear();
    mockOnSwitchToLogin.mockClear();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders registration form', () => {
    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    expect(screen.getByText('Registrierung')).toBeInTheDocument();
    expect(screen.getByLabelText(/Vorname/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nachname/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/E-Mail-Adresse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passwort \* \(mind/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passwort bestätigen/i)).toBeInTheDocument();
  });

  test('displays error when passwords do not match', () => {
    mockOnRegister.mockReturnValue({ success: true });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'SecurePass12!' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'SecurePass45!' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    expect(screen.getByText(/Passwörter stimmen nicht überein/i)).toBeInTheDocument();
    expect(mockOnRegister).not.toHaveBeenCalled();
  });

  test('displays error when password is too short', () => {
    mockOnRegister.mockReturnValue({ success: true });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: '12345' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    expect(screen.getByText(/mindestens 12 Zeichen/i)).toBeInTheDocument();
    expect(mockOnRegister).not.toHaveBeenCalled();
  });

  test('calls onRegister with correct data on valid submission', () => {
    mockOnRegister.mockReturnValue({ success: true, message: 'Registrierung erfolgreich!' });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'SecurePass12!' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'SecurePass12!' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    expect(mockOnRegister).toHaveBeenCalledWith({
      vorname: 'Max',
      nachname: 'Mustermann',
      email: 'max@example.com',
      password: 'SecurePass12!'
    });
  });

  test('switches to login immediately after successful registration', async () => {
    mockOnRegister.mockResolvedValue({ success: true, message: 'Registrierung erfolgreich! Bitte melden Sie sich an.' });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'SecurePass12!' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'SecurePass12!' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    // onSwitchToLogin must be called immediately after successful registration
    await waitFor(() => expect(mockOnSwitchToLogin).toHaveBeenCalled());
  });

  test('displays error message on failed registration', async () => {
    mockOnRegister.mockResolvedValue({ 
      success: false, 
      message: 'Diese E-Mail-Adresse ist bereits registriert.' 
    });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'existing@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'SecurePass12!' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'SecurePass12!' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    await waitFor(() => expect(screen.getByText(/bereits registriert/i)).toBeInTheDocument());
  });

  test('switches to login view when login button is clicked', () => {
    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    const loginButton = screen.getByRole('button', { name: /Jetzt anmelden/i });
    fireEvent.click(loginButton);

    expect(mockOnSwitchToLogin).toHaveBeenCalled();
  });

  test('trims whitespace from name and email but preserves password whitespace before registration', () => {
    mockOnRegister.mockReturnValue({ success: true, message: 'Registrierung erfolgreich!' });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    // Test with leading and trailing whitespace
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: '  Max  ' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: '  Mustermann  ' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: '  max@example.com  ' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: '  SecurePass12!  ' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: '  SecurePass12!  ' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    // Name and email should be trimmed; password must NOT be trimmed (NIST SP 800-63B)
    expect(mockOnRegister).toHaveBeenCalledWith({
      vorname: 'Max',
      nachname: 'Mustermann',
      email: 'max@example.com',
      password: '  SecurePass12!  '
    });
  });
});

describe('Register in anderer Sprache (Mehrsprachigkeit PR 6l)', () => {
  const formular = () => document.querySelector('form');

  // Wie oben mit Fake-Timern: React übernimmt beim ersten Rendern dieser Datei die Timer-Funktionen
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Englisch: Prüfung des Passworts und Wartezeit in der Mehrzahl', async () => {
    renderWithProviders(<Register onRegister={jest.fn()} onSwitchToLogin={jest.fn()} />, { sprache: 'en' });

    expect(screen.getByRole('heading', { name: 'Sign up' })).toBeInTheDocument();
    expect(screen.getByText('(at least 12 characters, a number or special character)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('FIRST NAME *'), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText('LAST NAME *'), { target: { value: 'Muster' } });
    fireEvent.change(screen.getByLabelText('EMAIL ADDRESS *'), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/^PASSWORD \*/), { target: { value: 'kurz1' } });
    fireEvent.change(screen.getByLabelText('CONFIRM PASSWORD *'), { target: { value: 'kurz1' } });

    fireEvent.submit(formular());
    expect(await screen.findByText('The password must be at least 12 characters long.')).toBeInTheDocument();

    // Zweiter Versuch sofort danach: Wartezeit (30 Sekunden)
    fireEvent.submit(formular());
    expect(screen.getByText('Please wait 30 more seconds before trying to sign up again.')).toBeInTheDocument();
  });

  test('Französisch: Meldung der Registrierung über ihren Schlüssel', async () => {
    const onRegister = jest.fn().mockResolvedValue({ success: false, schluessel: 'fehlerEmailVergeben', message: 'Diese E-Mail-Adresse ist bereits registriert.' });
    renderWithProviders(<Register onRegister={onRegister} onSwitchToLogin={jest.fn()} />, { sprache: 'fr' });

    expect(screen.getByRole('heading', { name: 'Inscription' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('PRÉNOM *'), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText('NOM *'), { target: { value: 'Muster' } });
    fireEvent.change(screen.getByLabelText('ADRESSE E-MAIL *'), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/^MOT DE PASSE \*/), { target: { value: 'SecurePass12!' } });
    fireEvent.change(screen.getByLabelText('CONFIRMER LE MOT DE PASSE *'), { target: { value: 'SecurePass12!' } });

    fireEvent.submit(formular());
    expect(await screen.findByText('Cette adresse e-mail est déjà enregistrée.')).toBeInTheDocument();
    expect(screen.getByText('Tu as déjà un compte ?')).toBeInTheDocument();
  });
});
