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

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Trim all inputs to prevent whitespace issues (especially on mobile)
    const trimmedPassword = (formData.password || '').trim();
    const trimmedConfirmPassword = (formData.confirmPassword || '').trim();
    
    // Validate passwords match
    if (trimmedPassword !== trimmedConfirmPassword) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }
    
    // Validate password length
    if (trimmedPassword.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }
    
    const result = onRegister({
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
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          <button type="submit" className="submit-btn">Registrieren</button>
        </form>
        <div className="register-footer">
          <p>Bereits ein Konto?</p>
          <button 
            type="button" 
            className="switch-btn"
            onClick={onSwitchToLogin}
          >
            Jetzt anmelden
          </button>
        </div>
      </div>
    </div>
  );
}

export default Register;
