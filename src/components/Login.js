import React, { useState } from 'react';
import './Login.css';

function Login({ onLogin, onSwitchToRegister, onGuestLogin, onResetPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // Trim email and password to prevent whitespace issues (especially on mobile)
      const result = await onLogin((email || '').trim(), (password || '').trim());
      if (!result.success) {
        setError(result.message);
      }
    } catch (err) {
      setError('Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (onGuestLogin) {
      setIsLoading(true);
      setError('');
      try {
        await onGuestLogin();
      } catch (err) {
        setError('Gast-Anmeldung fehlgeschlagen.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetMessage('');
    setIsLoading(true);

    try {
      const result = await onResetPassword((resetEmail || '').trim());
      if (result.success) {
        setResetMessage(result.message);
      } else {
        setResetError(result.message);
      }
    } catch (err) {
      setResetError('Ein unerwarteter Fehler ist aufgetreten.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowResetForm(false);
    setResetEmail('');
    setResetMessage('');
    setResetError('');
  };

  if (showResetForm) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h2>Passwort zurücksetzen</h2>
          {resetMessage ? (
            <div className="success-message">{resetMessage}</div>
          ) : (
            <form onSubmit={handleResetPassword}>
              <p className="reset-info">
                Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.
              </p>
              <div className="form-group">
                <label htmlFor="reset-email">E-Mail-Adresse</label>
                <input
                  type="email"
                  id="reset-email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={isLoading}
                />
              </div>
              {resetError && <div className="error-message">{resetError}</div>}
              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? 'Wird gesendet...' : 'E-Mail senden'}
              </button>
            </form>
          )}
          <div className="login-footer">
            <button
              type="button"
              className="switch-btn"
              onClick={handleBackToLogin}
              disabled={isLoading}
            >
              Zurück zur Anmeldung
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Anmelden</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isLoading}
            />
            {onResetPassword && (
              <button
                type="button"
                className="forgot-password-btn"
                onClick={() => setShowResetForm(true)}
                disabled={isLoading}
              >
                Passwort vergessen?
              </button>
            )}
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? 'Anmeldung läuft...' : 'Anmelden'}
          </button>
        </form>
        <div className="login-footer">
          <p>Noch kein Konto?</p>
          <button 
            type="button" 
            className="switch-btn"
            onClick={onSwitchToRegister}
            disabled={isLoading}
          >
            Jetzt registrieren
          </button>
          {onGuestLogin && (
            <>
              <p className="or-divider">oder</p>
              <button 
                type="button" 
                className="guest-btn"
                onClick={handleGuestLogin}
                disabled={isLoading}
              >
                Als Gast anmelden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
