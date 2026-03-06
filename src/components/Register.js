import React, { useState } from 'react';
import './Register.css';
import { validatePassword } from '../utils/userManagement';

/**
 * Client-side registration attempt tracker using localStorage.
 * Limits to 5 attempts per hour per browser to provide a fast-path
 * defense before the server-side rate limit is hit.
 */
const REGISTRATION_CLIENT_LIMIT = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REGISTRATION_STORAGE_KEY = 'registrationAttempts';

function getClientRateLimitStatus() {
  try {
    const stored = localStorage.getItem(REGISTRATION_STORAGE_KEY);
    const attempts = stored ? JSON.parse(stored) : [];
    const now = Date.now();
    const recent = attempts.filter((ts) => now - ts < REGISTRATION_WINDOW_MS);
    if (recent.length >= REGISTRATION_CLIENT_LIMIT) {
      const oldestTs = Math.min(...recent);
      const retryAfterMs = REGISTRATION_WINDOW_MS - (now - oldestTs);
      return { allowed: false, retryAfterMs };
    }
    return { allowed: true, retryAfterMs: 0 };
  } catch {
    return { allowed: true, retryAfterMs: 0 };
  }
}

function recordClientRegistrationAttempt() {
  try {
    const stored = localStorage.getItem(REGISTRATION_STORAGE_KEY);
    const attempts = stored ? JSON.parse(stored) : [];
    const now = Date.now();
    const recent = attempts.filter((ts) => now - ts < REGISTRATION_WINDOW_MS);
    recent.push(now);
    localStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // Ignore storage errors
  }
}

function Register({ onRegister, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    vorname: '',
    nachname: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);
    
    try {
      // Client-side rate limit check (fast-path before hitting the server)
      const clientLimit = getClientRateLimitStatus();
      if (!clientLimit.allowed) {
        const minutes = Math.ceil(clientLimit.retryAfterMs / 60000);
        setError(`Zu viele Registrierungsversuche. Bitte in ${minutes} Minute(n) erneut versuchen.`);
        setIsLoading(false);
        return;
      }

      // Trim name/email fields only; passwords must not be trimmed to preserve user-intended characters
      const password = formData.password || '';
      const confirmPassword = formData.confirmPassword || '';
      
      // Validate passwords match
      if (password !== confirmPassword) {
        setError('Passwörter stimmen nicht überein.');
        setIsLoading(false);
        return;
      }
      
      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        setError(passwordValidation.message);
        setIsLoading(false);
        return;
      }
      
      // Record the attempt before calling the server (counts toward the hourly limit)
      recordClientRegistrationAttempt();

      const result = await onRegister({
        vorname: (formData.vorname || '').trim(),
        nachname: (formData.nachname || '').trim(),
        email: (formData.email || '').trim(),
        password: password
      });
      
      if (result.success) {
        setSuccess(result.message);
        // Reset form
        setFormData({
          vorname: '',
          nachname: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
        // Automatically switch to login after 2 seconds
        setTimeout(() => {
          onSwitchToLogin();
        }, 2000);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-box">
        <h2>Registrierung</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="vorname">Vorname *</label>
              <input
                type="text"
                id="vorname"
                name="vorname"
                value={formData.vorname}
                onChange={handleChange}
                autoComplete="given-name"
                required
                disabled={isLoading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="nachname">Nachname *</label>
              <input
                type="text"
                id="nachname"
                name="nachname"
                value={formData.nachname}
                onChange={handleChange}
                autoComplete="family-name"
                required
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="email">E-Mail-Adresse *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Passwort * (mind. 12 Zeichen, Zahl oder Sonderzeichen)</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
              minLength="12"
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Passwort bestätigen *</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
              minLength="12"
              disabled={isLoading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? 'Registrierung läuft...' : 'Registrieren'}
          </button>
        </form>
        <div className="register-footer">
          <p>Bereits ein Konto?</p>
          <button 
            type="button" 
            className="switch-btn"
            onClick={onSwitchToLogin}
            disabled={isLoading}
          >
            Jetzt anmelden
          </button>
        </div>
      </div>
    </div>
  );
}

export default Register;
