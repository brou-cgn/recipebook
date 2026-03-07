import React, { useState } from 'react';
import './PersonalDataPage.css';
import { updateUserProfile, changePassword } from '../utils/userManagement';

function PersonalDataPage({ currentUser, onBack, onProfileUpdated }) {
  const [vorname, setVorname] = useState(currentUser?.vorname || '');
  const [nachname, setNachname] = useState(currentUser?.nachname || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [signatureSatz, setSignatureSatz] = useState(currentUser?.signatureSatz || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const result = await updateUserProfile(currentUser.id, {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      email: email.trim(),
      signatureSatz: signatureSatz.trim()
    });

    setSaving(false);
    setMessage({ success: result.success, text: result.message });

    if (result.success && onProfileUpdated) {
      onProfileUpdated({
        ...currentUser,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        signatureSatz: signatureSatz.trim()
      });
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ success: false, text: 'Die neuen Passwörter stimmen nicht überein.' });
      return;
    }

    setSavingPassword(true);
    const result = await changePassword(currentUser.id, newPassword, currentPassword);
    setSavingPassword(false);
    setPasswordMessage({ success: result.success, text: result.message });

    if (result.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <div className="personal-data-page">
      <div className="personal-data-header">
        <h2>Chefkoch</h2>
      </div>
      <form className="personal-data-form" onSubmit={handleSubmit}>
        <div className="personal-data-field">
          <label htmlFor="vorname">Vorname</label>
          <input
            id="vorname"
            type="text"
            value={vorname}
            onChange={(e) => setVorname(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="nachname">Nachname</label>
          <input
            id="nachname"
            type="text"
            value={nachname}
            onChange={(e) => setNachname(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="email">E-Mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="signatureSatz">Signature-Satz (optional)</label>
          <textarea
            id="signatureSatz"
            value={signatureSatz}
            onChange={(e) => setSignatureSatz(e.target.value)}
            placeholder="Wird als letzter Zubereitungsschritt bei neuen Rezepten übernommen"
            rows={3}
          />
        </div>
        {message && (
          <div className={`personal-data-message ${message.success ? 'success' : 'error'}`}>
            {message.text}
          </div>
        )}
        <div className="personal-data-actions">
          <button type="button" className="personal-data-cancel-btn" onClick={onBack}>
            Abbrechen
          </button>
          <button type="submit" className="personal-data-save-btn" disabled={saving}>
            {saving ? 'Wird gespeichert…' : 'Speichern'}
          </button>
        </div>
      </form>

      <div className="personal-data-section-divider" />

      <section className="personal-data-password-section">
        <h3 className="personal-data-section-title">Passwort ändern</h3>
        <p className="personal-data-password-hint">
          Mindestanforderungen: 12 Zeichen, mindestens eine Zahl oder ein Sonderzeichen.
        </p>
        <form className="personal-data-form" onSubmit={handlePasswordSubmit}>
          <div className="personal-data-field">
            <label htmlFor="currentPassword">Aktuelles Passwort</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="personal-data-field">
            <label htmlFor="newPassword">Neues Passwort</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="personal-data-field">
            <label htmlFor="confirmPassword">Neues Passwort bestätigen</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {passwordMessage && (
            <div className={`personal-data-message ${passwordMessage.success ? 'success' : 'error'}`}>
              {passwordMessage.text}
            </div>
          )}
          <div className="personal-data-actions">
            <button type="submit" className="personal-data-save-btn" disabled={savingPassword}>
              {savingPassword ? 'Wird geändert…' : 'Passwort ändern'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default PersonalDataPage;
