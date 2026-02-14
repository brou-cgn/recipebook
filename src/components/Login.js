import React, { useState } from 'react';
import './Login.css';

function Login({ onLogin, onSwitchToRegister, onGuestLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    
    // Trim email and password to prevent whitespace issues (especially on mobile)
    const result = onLogin((email || '').trim(), (password || '').trim());
    if (!result.success) {
      setError(result.message);
    }
  };

  const handleGuestLogin = () => {
    if (onGuestLogin) {
      onGuestLogin();
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
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="submit-btn">Anmelden</button>
        </form>
        <div className="login-footer">
          <p>Noch kein Konto?</p>
          <button 
            type="button" 
            className="switch-btn"
            onClick={onSwitchToRegister}
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
