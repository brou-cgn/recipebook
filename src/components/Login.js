import React, { useState } from 'react';
import './Login.css';

function EmailIcon() {
  return (
    <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3"></rect>
      <path d="M3 6.5l9 6 9-6"></path>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2.5"></rect>
      <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
    </svg>
  );
}

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
      // Trim email only; password must not be trimmed to preserve user-intended characters
      const result = await onLogin((email || '').trim(), password || '');
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
        <div className="login-card">
          <h2 className="login-title">Passwort zurücksetzen</h2>
          {resetMessage ? (
            <div className="login-success">{resetMessage}</div>
          ) : (
            <form onSubmit={handleResetPassword}>
              <p className="login-reset-info">
                Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.
              </p>
              <div className="login-field">
                <label htmlFor="reset-email" className="login-label">E-MAIL-ADRESSE</label>
                <div className="login-input-wrap">
                  <EmailIcon />
                  <input
                    type="email"
                    id="reset-email"
                    className="login-input"
                    placeholder="name@beispiel.de"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>
              {resetError && <div className="login-error">{resetError}</div>}
              <button type="submit" className="login-cta-btn" disabled={isLoading}>
                {isLoading ? 'Wird gesendet...' : 'E-Mail senden'}
              </button>
            </form>
          )}
          <div className="login-footer">
            <button
              type="button"
              className="login-back-link"
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
      <div className="login-card">
        <h2 className="login-title">Anmelden</h2>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="email" className="login-label">E-MAIL-ADRESSE</label>
            <div className="login-input-wrap">
              <EmailIcon />
              <input
                type="email"
                id="email"
                className="login-input"
                placeholder="name@beispiel.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="password" className="login-label">PASSWORT</label>
            <div className="login-input-wrap">
              <LockIcon />
              <input
                type="password"
                id="password"
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isLoading}
              />
            </div>
            {onResetPassword && (
              <button
                type="button"
                className="login-forgot-btn"
                onClick={() => setShowResetForm(true)}
                disabled={isLoading}
              >
                Passwort vergessen?
              </button>
            )}
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-cta-btn" disabled={isLoading}>
            {isLoading ? 'Anmeldung läuft...' : 'Anmelden'}
          </button>
        </form>

        {onGuestLogin && (
          <>
            <div className="login-divider">
              <span></span>
              <span>oder</span>
              <span></span>
            </div>
            <button
              type="button"
              className="login-ghost-btn"
              onClick={handleGuestLogin}
              disabled={isLoading}
            >
              Als Gast anmelden
            </button>
          </>
        )}

        <div className="login-footer">
          <p>
            Noch kein Konto?{' '}
            <button
              type="button"
              className="login-register-link"
              onClick={onSwitchToRegister}
              disabled={isLoading}
            >
              Jetzt registrieren
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
