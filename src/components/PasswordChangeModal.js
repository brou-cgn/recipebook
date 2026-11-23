import React, { useState } from 'react';
import './PasswordChangeModal.css';
import Button from './Button';
import { changePassword, validatePassword } from '../utils/userManagement';
import { useTexte } from '../contexts/SpracheContext';
import { ergebnisText } from '../i18n/texte';
import anmeldungTexte from '../i18n/texte/anmeldung';

function PasswordChangeModal({ user, onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Texte des Passwortwechsels (Mehrsprachigkeit PR 6l)
  const t = useTexte(anmeldungTexte);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        setError(t('passwoerterUngleich'));
        setIsLoading(false);
        return;
      }

      // Validate password strength
      const validation = validatePassword(newPassword);
      if (!validation.valid) {
        setError(ergebnisText(validation, t));
        setIsLoading(false);
        return;
      }

      // Change password
      const result = await changePassword(user.id, newPassword);
      
      if (result.success) {
        onPasswordChanged();
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
    <div className="password-change-overlay">
      <div className="password-change-modal">
        <h2>{t('passwortAendernNoetig')}</h2>
        <p className="password-change-info">
          {t('temporaerHinweis')}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="newPassword">{t('neuesPasswort')}</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('mindestensZeichen')}
              required
              autoFocus
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">{t('passwortBestaetigen')}</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('passwortWiederholen')}
              required
              disabled={isLoading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <Button variant="primary" type="submit" fullWidth loading={isLoading}>
            {isLoading ? t('passwortWirdGeaendert') : t('passwortAendern')}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default PasswordChangeModal;
