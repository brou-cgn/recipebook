import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Register from './Register';

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
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'password456' } });
    
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

    expect(screen.getByText(/mindestens 6 Zeichen/i)).toBeInTheDocument();
    expect(mockOnRegister).not.toHaveBeenCalled();
  });

  test('calls onRegister with correct data on valid submission', () => {
    mockOnRegister.mockReturnValue({ success: true, message: 'Registrierung erfolgreich!' });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    expect(mockOnRegister).toHaveBeenCalledWith({
      vorname: 'Max',
      nachname: 'Mustermann',
      email: 'max@example.com',
      password: 'password123'
    });
  });

  test('displays success message and switches to login after successful registration', () => {
    mockOnRegister.mockReturnValue({ success: true, message: 'Registrierung erfolgreich!' });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'max@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    expect(screen.getByText(/Registrierung erfolgreich!/i)).toBeInTheDocument();
    
    // Fast-forward time by 2 seconds
    jest.advanceTimersByTime(2000);
    
    expect(mockOnSwitchToLogin).toHaveBeenCalled();
  });

  test('displays error message on failed registration', () => {
    mockOnRegister.mockReturnValue({ 
      success: false, 
      message: 'Diese E-Mail-Adresse ist bereits registriert.' 
    });

    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    fireEvent.change(screen.getByLabelText(/Vorname/i), { target: { value: 'Max' } });
    fireEvent.change(screen.getByLabelText(/Nachname/i), { target: { value: 'Mustermann' } });
    fireEvent.change(screen.getByLabelText(/E-Mail-Adresse/i), { target: { value: 'existing@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passwort \* \(mind/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Registrieren/i }));

    expect(screen.getByText(/bereits registriert/i)).toBeInTheDocument();
  });

  test('switches to login view when login button is clicked', () => {
    render(<Register onRegister={mockOnRegister} onSwitchToLogin={mockOnSwitchToLogin} />);
    
    const loginButton = screen.getByRole('button', { name: /Jetzt anmelden/i });
    fireEvent.click(loginButton);

    expect(mockOnSwitchToLogin).toHaveBeenCalled();
  });
});
