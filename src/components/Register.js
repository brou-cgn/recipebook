import React, { useState } from 'react';
import './Register.css';

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
      // Trim all inputs to prevent whitespace issues (especially on mobile)
      const trimmedPassword = (formData.password || '').trim();
      const trimmedConfirmPassword = (formData.confirmPassword || '').trim();
      
      // Validate passwords match
      if (trimmedPassword !== trimmedConfirmPassword) {
        setError('Passwörter stimmen nicht überein.');
        setIsLoading(false);
        return;
      }
      
      // Validate password length
      if (trimmedPassword.length < 6) {
        setError('Passwort muss mindestens 6 Zeichen lang sein.');
        setIsLoading(false);
        return;
      }
      
      const result = await onRegister({
        vorname: (formData.vorname || '').trim(),
        nachname: (formData.nachname || '').trim(),
        email: (formData.email || '').trim(),
        password: trimmedPassword
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
            <label htmlFor="password">Passwort * (mind. 6 Zeichen)</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
              minLength="6"
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
              minLength="6"
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
