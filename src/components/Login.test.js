import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';
import { renderWithProviders } from '../test-utils';

describe('Login Component', () => {
  const mockOnLogin = jest.fn();
  const mockOnSwitchToRegister = jest.fn();
  const mockOnResetPassword = jest.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
    mockOnSwitchToRegister.mockClear();
    mockOnResetPassword.mockClear();
  });

  test('renders login form', () => {
    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    expect(screen.getByRole('heading', { name: /Anmelden/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-Mail-Adresse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passwort/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anmelden/i })).toBeInTheDocument();
  });

  test('displays error message on failed login', async () => {
    mockOnLogin.mockReturnValue({
      success: false,
      message: 'Ungültige E-Mail oder Passwort.'
    });

    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    const emailInput = screen.getByLabelText(/E-Mail-Adresse/i);
    const passwordInput = screen.getByLabelText(/Passwort/i);
    const submitButton = screen.getByRole('button', { name: /Anmelden/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);

    expect(mockOnLogin).toHaveBeenCalledWith('test@example.com', 'wrongpassword');
    await waitFor(() => {
      expect(screen.getByText(/Ungültige E-Mail oder Passwort/i)).toBeInTheDocument();
    });
  });

  test('calls onLogin with email and password on submit', () => {
    mockOnLogin.mockReturnValue({ success: true });

    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    const emailInput = screen.getByLabelText(/E-Mail-Adresse/i);
    const passwordInput = screen.getByLabelText(/Passwort/i);
    const submitButton = screen.getByRole('button', { name: /Anmelden/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    expect(mockOnLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  test('trims whitespace from email but preserves password whitespace before login', () => {
    mockOnLogin.mockReturnValue({ success: true });

    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    const emailInput = screen.getByLabelText(/E-Mail-Adresse/i);
    const passwordInput = screen.getByLabelText(/Passwort/i);
    const submitButton = screen.getByRole('button', { name: /Anmelden/i });

    // Test with leading and trailing whitespace
    fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } });
    fireEvent.change(passwordInput, { target: { value: '  password123  ' } });
    fireEvent.click(submitButton);

    // Email should be trimmed; password must NOT be trimmed (NIST SP 800-63B)
    expect(mockOnLogin).toHaveBeenCalledWith('test@example.com', '  password123  ');
  });

  test('switches to register view when register button is clicked', () => {
    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    const registerButton = screen.getByRole('button', { name: /Jetzt registrieren/i });
    fireEvent.click(registerButton);

    expect(mockOnSwitchToRegister).toHaveBeenCalled();
  });

  test('shows "Passwort vergessen?" link when onResetPassword is provided', () => {
    render(
      <Login
        onLogin={mockOnLogin}
        onSwitchToRegister={mockOnSwitchToRegister}
        onResetPassword={mockOnResetPassword}
      />
    );

    expect(screen.getByRole('button', { name: /Passwort vergessen\?/i })).toBeInTheDocument();
  });

  test('does not show "Passwort vergessen?" link when onResetPassword is not provided', () => {
    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);

    expect(screen.queryByRole('button', { name: /Passwort vergessen\?/i })).not.toBeInTheDocument();
  });

  test('shows password reset form when "Passwort vergessen?" is clicked', () => {
    render(
      <Login
        onLogin={mockOnLogin}
        onSwitchToRegister={mockOnSwitchToRegister}
        onResetPassword={mockOnResetPassword}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Passwort vergessen\?/i }));

    expect(screen.getByRole('heading', { name: /Passwort zurücksetzen/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-Mail-Adresse/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /E-Mail senden/i })).toBeInTheDocument();
  });

  test('calls onResetPassword with trimmed email on submit', async () => {
    mockOnResetPassword.mockResolvedValue({
      success: true,
      message: 'Eine E-Mail zum Zurücksetzen des Passworts wurde versendet.'
    });

    render(
      <Login
        onLogin={mockOnLogin}
        onSwitchToRegister={mockOnSwitchToRegister}
        onResetPassword={mockOnResetPassword}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Passwort vergessen\?/i }));

    const resetEmailInput = screen.getByLabelText(/E-Mail-Adresse/i);
    fireEvent.change(resetEmailInput, { target: { value: '  user@example.com  ' } });
    fireEvent.click(screen.getByRole('button', { name: /E-Mail senden/i }));

    expect(mockOnResetPassword).toHaveBeenCalledWith('user@example.com');
    await waitFor(() => {
      expect(screen.getByText(/Eine E-Mail zum Zurücksetzen/i)).toBeInTheDocument();
    });
  });

  test('shows error message when reset password fails', async () => {
    mockOnResetPassword.mockResolvedValue({
      success: false,
      message: 'Ungültige E-Mail-Adresse.'
    });

    render(
      <Login
        onLogin={mockOnLogin}
        onSwitchToRegister={mockOnSwitchToRegister}
        onResetPassword={mockOnResetPassword}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Passwort vergessen\?/i }));

    const resetEmailInput = screen.getByLabelText(/E-Mail-Adresse/i);
    fireEvent.change(resetEmailInput, { target: { value: 'invalid' } });
    // Formular direkt absenden: jsdom prüft seit Jest 29 (jsdom 20) wie ein
    // echter Browser type="email" und blockiert sonst den Klick, bevor
    // onResetPassword überhaupt aufgerufen wird.
    fireEvent.submit(screen.getByRole('button', { name: /E-Mail senden/i }).closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/Ungültige E-Mail-Adresse/i)).toBeInTheDocument();
    });
  });

  test('navigates back to login form when "Zurück zur Anmeldung" is clicked', () => {
    render(
      <Login
        onLogin={mockOnLogin}
        onSwitchToRegister={mockOnSwitchToRegister}
        onResetPassword={mockOnResetPassword}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Passwort vergessen\?/i }));
    expect(screen.getByRole('heading', { name: /Passwort zurücksetzen/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Zurück zur Anmeldung/i }));
    expect(screen.getByRole('heading', { name: /Anmelden/i })).toBeInTheDocument();
  });
});

describe('Login in anderer Sprache (Mehrsprachigkeit PR 6l)', () => {
  const NBSP = String.fromCharCode(160);
  const zeige = (sprache, props = {}) => renderWithProviders(
    <Login onLogin={jest.fn()} onSwitchToRegister={jest.fn()} onGuestLogin={jest.fn()} onResetPassword={jest.fn()} {...props} />,
    { sprache }
  );

  test('Englisch: Formular und Fehlermeldung über ihren Schlüssel', async () => {
    const onLogin = jest.fn().mockResolvedValue({ success: false, schluessel: 'fehlerAnmeldedaten', message: 'Ungültige E-Mail oder Passwort.' });
    zeige('en', { onLogin });

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Continue as guest')).toBeInTheDocument();
    expect(screen.getByText('No account yet?')).toBeInTheDocument();
    expect(screen.getByLabelText('EMAIL ADDRESS')).toHaveAttribute('placeholder', 'name@example.com');

    fireEvent.change(screen.getByLabelText('EMAIL ADDRESS'), { target: { value: 'anna@example.com' } });
    fireEvent.change(screen.getByLabelText('PASSWORD'), { target: { value: 'geheim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  test('Französisch: Passwort vergessen und Bestätigung des Versands', async () => {
    const onResetPassword = jest.fn().mockResolvedValue({ success: true, schluessel: 'resetVersendet', message: 'Eine E-Mail …' });
    zeige('fr', { onResetPassword });

    // getByText vergleicht mit normalisierten Leerzeichen, textContent prüft das geschützte
    const vergessen = screen.getByText('Mot de passe oublié ?');
    expect(vergessen.textContent).toBe(`Mot de passe oublié${NBSP}?`);
    fireEvent.click(vergessen);

    expect(screen.getByRole('heading', { name: 'Réinitialiser le mot de passe' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ADRESSE E-MAIL'), { target: { value: 'anna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer l’e-mail' }));

    expect(await screen.findByText('Si un compte existe avec cette adresse, un e-mail de réinitialisation du mot de passe a été envoyé.')).toBeInTheDocument();
    expect(screen.getByText('Retour à la connexion')).toBeInTheDocument();
  });
});
