import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from './Login';

describe('Login Component', () => {
  const mockOnLogin = jest.fn();
  const mockOnSwitchToRegister = jest.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
    mockOnSwitchToRegister.mockClear();
  });

  test('renders login form', () => {
    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    expect(screen.getByRole('heading', { name: /Anmelden/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/E-Mail-Adresse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passwort/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anmelden/i })).toBeInTheDocument();
  });

  test('displays error message on failed login', () => {
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
    expect(screen.getByText(/Ungültige E-Mail oder Passwort/i)).toBeInTheDocument();
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

  test('trims whitespace from email and password before login', () => {
    mockOnLogin.mockReturnValue({ success: true });

    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    const emailInput = screen.getByLabelText(/E-Mail-Adresse/i);
    const passwordInput = screen.getByLabelText(/Passwort/i);
    const submitButton = screen.getByRole('button', { name: /Anmelden/i });

    // Test with leading and trailing whitespace
    fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } });
    fireEvent.change(passwordInput, { target: { value: '  password123  ' } });
    fireEvent.click(submitButton);

    // Should be called with trimmed values
    expect(mockOnLogin).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  test('switches to register view when register button is clicked', () => {
    render(<Login onLogin={mockOnLogin} onSwitchToRegister={mockOnSwitchToRegister} />);
    
    const registerButton = screen.getByRole('button', { name: /Jetzt registrieren/i });
    fireEvent.click(registerButton);

    expect(mockOnSwitchToRegister).toHaveBeenCalled();
  });
});
