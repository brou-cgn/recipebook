import React, { useState } from 'react';
import './PasswordChangeModal.css';
import { changePassword, validatePassword } from '../utils/userManagement';

function PasswordChangeModal({ user, onPasswordChanged }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        setError('Die Passwörter stimmen nicht überein.');
        setIsLoading(false);
        return;
      }

      // Validate password strength
      const validation = validatePassword(newPassword);
      if (!validation.valid) {
        setError(validation.message);
        setIsLoading(false);
        return;
      }

      // Change password
      const result = await changePassword(user.id, newPassword);
      
      if (result.success) {
        onPasswordChanged();
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
    <div className="password-change-overlay">
      <div className="password-change-modal">
        <h2>Passwort ändern erforderlich</h2>
        <p className="password-change-info">
          Sie haben sich mit einem temporären Passwort angemeldet. 
          Bitte vergeben Sie jetzt ein neues Passwort.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="newPassword">Neues Passwort</label>
            <input
              type="password"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mindestens 6 Zeichen"
              required
              autoFocus
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Passwort bestätigen</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Passwort wiederholen"
              required
              disabled={isLoading}
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? 'Passwort wird geändert...' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default PasswordChangeModal;
