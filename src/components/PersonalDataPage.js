import React, { useState } from 'react';
import './PersonalDataPage.css';
import { updateUserProfile, changePassword } from '../utils/userManagement';
import { ALARM_SOUNDS, getAlarmSoundPreference, saveAlarmSoundPreference, getDarkModeMode, saveDarkModePreference, applyDarkModePreference } from '../utils/customLists';
import { previewAlarmSound } from '../utils/alarmAudioUtils';

const THEME_MODES = [
  { key: 'light', label: 'Hell', icon: '☀️' },
  { key: 'dark', label: 'Dunkel', icon: '🌙' },
  { key: 'auto', label: 'Automatisch', icon: '⚙️' },
];

function PersonalDataPage({ currentUser, onBack, onProfileUpdated, privateLists = [] }) {
  const [vorname, setVorname] = useState(currentUser?.vorname || '');
  const [nachname, setNachname] = useState(currentUser?.nachname || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [signatureSatz, setSignatureSatz] = useState(currentUser?.signatureSatz || '');
  const [defaultWebImportListId, setDefaultWebImportListId] = useState(currentUser?.defaultWebImportListId || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const [alarmSoundKey, setAlarmSoundKey] = useState(() => getAlarmSoundPreference());
  const [darkMode, setDarkMode] = useState(getDarkModeMode);
  const [showAlarmPicker, setShowAlarmPicker] = useState(false);
  const [showAppearancePicker, setShowAppearancePicker] = useState(false);

  const handleDarkModeSelect = (mode) => {
    setDarkMode(mode);
    saveDarkModePreference(mode);
    applyDarkModePreference(mode);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const result = await updateUserProfile(currentUser.id, {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      email: email.trim(),
      signatureSatz: signatureSatz.trim(),
      defaultWebImportListId: defaultWebImportListId
    });

    setSaving(false);
    setMessage({ success: result.success, text: result.message });

    if (result.success && onProfileUpdated) {
      onProfileUpdated({
        ...currentUser,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        signatureSatz: signatureSatz.trim(),
        defaultWebImportListId: defaultWebImportListId
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
      {showAlarmPicker && (
        <div className="alarm-sound-picker-page">
          <div className="alarm-sound-picker-header">
            <button
              type="button"
              className="alarm-sound-picker-back-btn"
              onClick={() => setShowAlarmPicker(false)}
              aria-label="Zurück"
            >
              ‹ Zurück
            </button>
            <h2 className="alarm-sound-picker-title">Alarmton</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label="Alarmton auswählen">
            {ALARM_SOUNDS.map(sound => (
              <li key={sound.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={alarmSoundKey === sound.key}
                  className={`alarm-sound-picker-item${alarmSoundKey === sound.key ? ' selected' : ''}`}
                  onClick={() => {
                    setAlarmSoundKey(sound.key);
                    saveAlarmSoundPreference(sound.key);
                    previewAlarmSound(sound.key);
                  }}
                >
                  <span className="alarm-sound-picker-checkmark" aria-hidden="true">
                    {alarmSoundKey === sound.key ? '✓' : ''}
                  </span>
                  <span className="alarm-sound-picker-name">{sound.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showAppearancePicker && (
        <div className="alarm-sound-picker-page">
          <div className="alarm-sound-picker-header">
            <button
              type="button"
              className="alarm-sound-picker-back-btn"
              onClick={() => setShowAppearancePicker(false)}
              aria-label="Zurück"
            >
              ‹ Zurück
            </button>
            <h2 className="alarm-sound-picker-title">Erscheinungsbild</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label="Erscheinungsbild auswählen">
            {THEME_MODES.map(mode => (
              <li key={mode.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={darkMode === mode.key}
                  className={`alarm-sound-picker-item${darkMode === mode.key ? ' selected' : ''}`}
                  onClick={() => handleDarkModeSelect(mode.key)}
                >
                  <span className="alarm-sound-picker-checkmark" aria-hidden="true">
                    {darkMode === mode.key ? '✓' : ''}
                  </span>
                  <span className="alarm-sound-picker-icon" aria-hidden="true">{mode.icon}</span>
                  <span className="alarm-sound-picker-name">{mode.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`personal-data-main${showAlarmPicker || showAppearancePicker ? ' personal-data-main--hidden' : ''}`}>
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
        {privateLists.length > 0 && (
          <div className="personal-data-field">
            <label htmlFor="defaultWebImportList">Standard-Liste für Webimport (optional)</label>
            <select
              id="defaultWebImportList"
              value={defaultWebImportListId}
              onChange={(e) => setDefaultWebImportListId(e.target.value)}
            >
              <option value="">– Keine Vorauswahl –</option>
              {privateLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {message && (
          <div className={`personal-data-message ${message.success ? 'success' : 'error'}`}>
            {message.text}
          </div>
        )}
        <div className="personal-data-section-divider" />
        <section className="personal-data-preferences-section">
          <div className="preferences-group">
            <button
              type="button"
              className="alarm-sound-row"
              onClick={() => setShowAlarmPicker(true)}
              aria-label={`Alarmton: ${ALARM_SOUNDS.find(s => s.key === alarmSoundKey)?.label || alarmSoundKey}. Zum Ändern klicken.`}
            >
              <span className="alarm-sound-row-label">Alarmton</span>
              <span className="alarm-sound-row-right">
                <span className="alarm-sound-row-value">
                  {ALARM_SOUNDS.find(s => s.key === alarmSoundKey)?.label || alarmSoundKey}
                </span>
                <span className="alarm-sound-row-chevron" aria-hidden="true">›</span>
              </span>
            </button>
            <div className="preferences-group-divider" />
            <button
              type="button"
              className="alarm-sound-row"
              onClick={() => setShowAppearancePicker(true)}
              aria-label={`Erscheinungsbild: ${THEME_MODES.find(m => m.key === darkMode)?.label || darkMode}. Zum Ändern klicken.`}
            >
              <span className="alarm-sound-row-label">Erscheinungsbild</span>
              <span className="alarm-sound-row-right">
                <span className="alarm-sound-row-value">
                  {THEME_MODES.find(m => m.key === darkMode)?.label || darkMode}
                </span>
                <span className="alarm-sound-row-chevron" aria-hidden="true">›</span>
              </span>
            </button>
          </div>
        </section>
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
    </div>
  );
}

export default PersonalDataPage;
