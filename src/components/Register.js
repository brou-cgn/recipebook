import React, { useState, useRef } from 'react';
import Button from './Button';
import { EmailIcon, LockIcon } from './LoginInputIcons';
// Registrierung nutzt die Gestaltung der Anmeldung (Tech-Check P12); Login.css hier selbst laden,
// weil die Registrierung als eigener Teil nachgeladen wird
import './Login.css';
import './Register.css';
import { validatePassword } from '../utils/userManagement';
import { useTexte } from '../contexts/SpracheContext';
import { ergebnisText } from '../i18n/texte';
import anmeldungTexte from '../i18n/texte/anmeldung';

// Minimum seconds that must elapse between registration attempts
const SUBMIT_COOLDOWN_SECONDS = 30;

function Register({ onRegister, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    vorname: '',
    nachname: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const lastSubmitRef = useRef(null);
  // Texte der Registrierung (Mehrsprachigkeit PR 6l); ohne Anmeldung gilt die Sprache des Browsers
  const t = useTexte(anmeldungTexte);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side cooldown: prevent rapid repeated submission attempts
    const now = Date.now();
    if (lastSubmitRef.current !== null) {
      const elapsed = (now - lastSubmitRef.current) / 1000;
      if (elapsed < SUBMIT_COOLDOWN_SECONDS) {
        const remaining = Math.ceil(SUBMIT_COOLDOWN_SECONDS - elapsed);
        setError(t('wartenSekunden', { anzahl: remaining }));
        return;
      }
    }

    setIsLoading(true);
    lastSubmitRef.current = now;
    try {
      // Trim name/email fields only; passwords must not be trimmed to preserve user-intended characters
      const password = formData.password || '';
      const confirmPassword = formData.confirmPassword || '';
      
      // Validate passwords match
      if (password !== confirmPassword) {
        setError(t('passwoerterUngleich'));
        setIsLoading(false);
        return;
      }
      
      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        setError(ergebnisText(passwordValidation, t));
        setIsLoading(false);
        return;
      }
      
      const result = await onRegister({
        vorname: (formData.vorname || '').trim(),
        nachname: (formData.nachname || '').trim(),
        email: (formData.email || '').trim(),
        password: password
      });
      
      if (result.success) {
        // Redirect to login immediately – no automatic login after registration
        onSwitchToLogin();
      } else {
        setError(ergebnisText(result, t));
      }
    } catch (err) {
      setError(t('fehlerUnerwartet'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">{t('registrierung')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="register-name-row">
            <div className="login-field">
              <label htmlFor="vorname" className="login-label">{t('vornameLabel')}</label>
              <input
                type="text"
                id="vorname"
                name="vorname"
                className="login-input login-input--plain"
                value={formData.vorname}
                onChange={handleChange}
                autoComplete="given-name"
                required
                disabled={isLoading}
              />
            </div>
            <div className="login-field">
              <label htmlFor="nachname" className="login-label">{t('nachnameLabel')}</label>
              <input
                type="text"
                id="nachname"
                name="nachname"
                className="login-input login-input--plain"
                value={formData.nachname}
                onChange={handleChange}
                autoComplete="family-name"
                required
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="email" className="login-label">{t('emailLabelPflicht')}</label>
            <div className="login-input-wrap">
              <EmailIcon />
              <input
                type="email"
                id="email"
                name="email"
                className="login-input"
                placeholder={t('emailBeispiel')}
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="password" className="login-label">
              {t('passwortLabelPflicht')} <span className="login-label-hint">{t('passwortRegel')}</span>
            </label>
            <div className="login-input-wrap">
              <LockIcon />
              <input
                type="password"
                id="password"
                name="password"
                className="login-input"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                required
                minLength="12"
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="confirmPassword" className="login-label">{t('passwortBestaetigenLabel')}</label>
            <div className="login-input-wrap">
              <LockIcon />
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                className="login-input"
                value={formData.confirmPassword}
                onChange={handleChange}
                autoComplete="new-password"
                required
                minLength="12"
                disabled={isLoading}
              />
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          <Button variant="primary" type="submit" fullWidth loading={isLoading} className="login-cta">
            {isLoading ? t('registrierungLaeuft') : t('registrieren')}
          </Button>
        </form>
        <div className="login-footer">
          <p>
            {t('bereitsKonto')}{' '}
            <button
              type="button"
              className="login-register-link"
              onClick={onSwitchToLogin}
              disabled={isLoading}
            >
              {t('jetztAnmelden')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
