import React, { useState } from 'react';
import Button from './Button';
import { EmailIcon, LockIcon } from './LoginInputIcons';
import './Login.css';
import { useTexte } from '../contexts/SpracheContext';
import { ergebnisText } from '../i18n/texte';
import anmeldungTexte from '../i18n/texte/anmeldung';

function Login({ onLogin, onSwitchToRegister, onGuestLogin, onResetPassword }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  // Texte der Anmeldung (Mehrsprachigkeit PR 6l); ohne Anmeldung gilt die Sprache des Browsers
  const t = useTexte(anmeldungTexte);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Trim email only; password must not be trimmed to preserve user-intended characters
      const result = await onLogin((email || '').trim(), password || '');
      if (!result.success) {
        setError(ergebnisText(result, t));
      }
    } catch (err) {
      setError(t('fehlerUnerwartet'));
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
        setError(t('fehlerGast'));
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
        setResetMessage(ergebnisText(result, t));
      } else {
        setResetError(ergebnisText(result, t));
      }
    } catch (err) {
      setResetError(t('fehlerUnerwartet'));
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
          <h2 className="login-title">{t('passwortZuruecksetzen')}</h2>
          {resetMessage ? (
            <div className="login-success">{resetMessage}</div>
          ) : (
            <form onSubmit={handleResetPassword}>
              <p className="login-reset-info">
                {t('resetHinweis')}
              </p>
              <div className="login-field">
                <label htmlFor="reset-email" className="login-label">{t('emailLabel')}</label>
                <div className="login-input-wrap">
                  <EmailIcon />
                  <input
                    type="email"
                    id="reset-email"
                    className="login-input"
                    placeholder={t('emailBeispiel')}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    autoComplete="email"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>
              {resetError && <div className="login-error">{resetError}</div>}
              <Button variant="primary" type="submit" fullWidth loading={isLoading} className="login-cta">
                {isLoading ? t('wirdGesendet') : t('emailSenden')}
              </Button>
            </form>
          )}
          <div className="login-footer">
            <button
              type="button"
              className="login-back-link"
              onClick={handleBackToLogin}
              disabled={isLoading}
            >
              {t('zurueckZurAnmeldung')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">{t('anmelden')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="email" className="login-label">{t('emailLabel')}</label>
            <div className="login-input-wrap">
              <EmailIcon />
              <input
                type="email"
                id="email"
                className="login-input"
                placeholder={t('emailBeispiel')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="password" className="login-label">{t('passwortLabel')}</label>
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
                {t('passwortVergessen')}
              </button>
            )}
          </div>
          {error && <div className="login-error">{error}</div>}
          <Button variant="primary" type="submit" fullWidth loading={isLoading} className="login-cta">
            {isLoading ? t('anmeldungLaeuft') : t('anmelden')}
          </Button>
        </form>

        {onGuestLogin && (
          <>
            <div className="login-divider">
              <span></span>
              <span>{t('oder')}</span>
              <span></span>
            </div>
            <Button
              fullWidth
              onClick={handleGuestLogin}
              disabled={isLoading}
            >
              {t('alsGastAnmelden')}
            </Button>
          </>
        )}

        <div className="login-footer">
          <p>
            {t('nochKeinKonto')}{' '}
            <button
              type="button"
              className="login-register-link"
              onClick={onSwitchToRegister}
              disabled={isLoading}
            >
              {t('jetztRegistrieren')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
