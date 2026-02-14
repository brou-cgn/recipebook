import React, { useState } from 'react';
import './Login.css';

function Login({ onLogin, onSwitchToRegister, onGuestLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
