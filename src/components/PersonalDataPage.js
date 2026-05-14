import React, { useState, useEffect } from 'react';
import './PersonalDataPage.css';
import { updateUserProfile, changePassword, saveFcmToken } from '../utils/userManagement';
import { ALARM_SOUNDS, getAlarmSoundPreference, saveAlarmSoundPreference, getDarkModeMode, saveDarkModePreference, applyDarkModePreference } from '../utils/customLists';
import { previewAlarmSound } from '../utils/alarmAudioUtils';
import { requestNotificationPermission } from '../utils/pushNotifications';

const NO_LIST_OPTION = { id: '', name: '– Keine Vorauswahl –' };

const THEME_MODES = [
  { key: 'light', label: 'Hell' },
  { key: 'dark', label: 'Dunkel' },
  { key: 'auto', label: 'Automatisch' },
];

function PersonalDataPage({ currentUser, onBack, onProfileUpdated, privateLists = [] }) {
  const isIosDevice = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);
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
  const [showWebImportListPicker, setShowWebImportListPicker] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [requestingNotification, setRequestingNotification] = useState(false);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setNotificationSupported(false);
      return;
    }
    setNotificationSupported(true);
    setNotificationPermission(Notification.permission);
  }, []);

  const handleDarkModeSelect = (mode) => {
    setDarkMode(mode);
    saveDarkModePreference(mode);
    applyDarkModePreference(mode);
  };

  const handleEnableNotifications = async () => {
    if (requestingNotification || notificationPermission === 'granted') return;
    setRequestingNotification(true);
    try {
      const token = await requestNotificationPermission();
      if (token && currentUser?.id) {
        await saveFcmToken(currentUser.id, token);
      }
      if (typeof Notification !== 'undefined') {
        setNotificationPermission(Notification.permission);
      }
    } catch (err) {
      console.warn('Fehler beim Anfordern der Benachrichtigungserlaubnis:', err);
    } finally {
      setRequestingNotification(false);
    }
  };

  const handleWebImportListSelect = async (listId) => {
    setDefaultWebImportListId(listId);
    const result = await updateUserProfile(currentUser.id, {
      vorname: currentUser.vorname,
      nachname: currentUser.nachname,
      email: currentUser.email,
      signatureSatz: currentUser.signatureSatz,
      defaultWebImportListId: listId,
    });
    if (result.success && onProfileUpdated) {
      onProfileUpdated({ ...currentUser, defaultWebImportListId: listId });
    }
  };

  useEffect(() => {
    if (showAlarmPicker || showAppearancePicker || showWebImportListPicker) {
      window.scrollTo(0, 0);
    }
  }, [showAlarmPicker, showAppearancePicker, showWebImportListPicker]);

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
      {showWebImportListPicker && (
        <div className="alarm-sound-picker-page">
          <div className="alarm-sound-picker-header">
            <button
              type="button"
              className="alarm-sound-picker-back-btn"
              onClick={() => setShowWebImportListPicker(false)}
              aria-label="Zurück"
            >
              ‹ Zurück
            </button>
            <h2 className="alarm-sound-picker-title">Inspirationssammlung</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label="Inspirationssammlung auswählen">
            {[NO_LIST_OPTION, ...privateLists].map(list => (
              <li key={list.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={defaultWebImportListId === list.id}
                  className={`alarm-sound-picker-item${defaultWebImportListId === list.id ? ' selected' : ''}`}
                  onClick={() => handleWebImportListSelect(list.id)}
                >
                  <span className="alarm-sound-picker-checkmark" aria-hidden="true">
                    {defaultWebImportListId === list.id ? '✓' : ''}
                  </span>
                  <span className="alarm-sound-picker-name">{list.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
                  <span className="alarm-sound-picker-name">{mode.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`personal-data-main${showAlarmPicker || showAppearancePicker || showWebImportListPicker ? ' personal-data-main--hidden' : ''}`}>
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

      <section className="personal-data-settings-section">
        <h3 className="personal-data-section-title">Einstellungen</h3>
        <div className="preferences-group">
          {privateLists.length > 0 && (
            <>
              <button
                type="button"
                className="settings-row"
                onClick={() => setShowWebImportListPicker(true)}
                aria-label={`Inspirationssammlung: ${privateLists.find(l => l.id === defaultWebImportListId)?.name || NO_LIST_OPTION.name}. Zum Ändern klicken.`}
              >
                <span className="settings-row-label">Inspirationssammlung</span>
                <span className="settings-row-right">
                  <span className="settings-row-value">
                    {privateLists.find(l => l.id === defaultWebImportListId)?.name || NO_LIST_OPTION.name}
                  </span>
                  <span className="settings-row-chevron" aria-hidden="true">›</span>
                </span>
              </button>
              <div className="preferences-group-divider" />
            </>
          )}
          <button
            type="button"
            className="settings-row"
            onClick={() => setShowAppearancePicker(true)}
            aria-label={`Erscheinungsbild: ${THEME_MODES.find(m => m.key === darkMode)?.label || darkMode}. Zum Ändern klicken.`}
          >
            <span className="settings-row-label">Erscheinungsbild</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {THEME_MODES.find(m => m.key === darkMode)?.label || darkMode}
              </span>
              <span className="settings-row-chevron" aria-hidden="true">›</span>
            </span>
          </button>
          <div className="preferences-group-divider" />
          <button
            type="button"
            className="settings-row"
            onClick={() => setShowAlarmPicker(true)}
            aria-label={`Alarmton: ${ALARM_SOUNDS.find(s => s.key === alarmSoundKey)?.label || alarmSoundKey}. Zum Ändern klicken.`}
          >
            <span className="settings-row-label">Alarmton</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {ALARM_SOUNDS.find(s => s.key === alarmSoundKey)?.label || alarmSoundKey}
              </span>
              <span className="settings-row-chevron" aria-hidden="true">›</span>
            </span>
          </button>
        </div>
      </section>

      <div className="personal-data-section-divider" />

      <section className="personal-data-notifications-section">
        <h3 className="personal-data-section-title">PWA-Mitteilungen</h3>
        <p className="personal-data-password-hint">
          Erhalten Sie Benachrichtigungen über neue Rezepte und Aktivitäten in Ihren Listen – auch wenn brouBook gerade nicht geöffnet ist.
        </p>
        {isIosDevice && (
          <p className="personal-data-password-hint">
            Auf iPhone/iPad funktionieren Mitteilungen nur ab iOS 16.4+, wenn brouBook über „Zum Home-Bildschirm hinzufügen“ installiert wurde.
          </p>
        )}
        <div className="preferences-group">
          <button
            type="button"
            className="settings-row"
            onClick={notificationSupported && notificationPermission === 'default' ? handleEnableNotifications : undefined}
            disabled={!notificationSupported || notificationPermission !== 'default' || requestingNotification}
            aria-label={
              !notificationSupported
                ? 'Mitteilungen: Nicht verfügbar'
                : `Mitteilungen: ${
                    notificationPermission === 'granted' ? 'Aktiv' :
                    notificationPermission === 'denied' ? 'Deaktiviert' :
                    requestingNotification ? 'Wird aktiviert…' : 'Aktivieren. Zum Aktivieren klicken.'
                  }`
            }
          >
            <span className="settings-row-label">Mitteilungen</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {!notificationSupported ? 'Nicht verfügbar' :
                 requestingNotification ? 'Wird aktiviert…' :
                 notificationPermission === 'granted' ? 'Aktiv' :
                 notificationPermission === 'denied' ? 'Deaktiviert' :
                 'Aktivieren'}
              </span>
              {notificationSupported && notificationPermission === 'default' && !requestingNotification && (
                <span className="settings-row-chevron" aria-hidden="true">›</span>
              )}
            </span>
          </button>
        </div>
        {!notificationSupported && (
          <p className="pwa-notification-hint pwa-notification-hint--info">
            Ihr Browser oder Gerät unterstützt keine PWA-Mitteilungen. Auf iOS müssen Sie brouBook zunächst zum Home-Bildschirm hinzufügen (Safari → Teilen → Zum Startbildschirm).
          </p>
        )}
        {notificationSupported && notificationPermission === 'denied' && (
          <p className="pwa-notification-hint pwa-notification-hint--warning">
            Mitteilungen wurden abgelehnt. Um sie zu aktivieren, erlauben Sie brouBook in Ihren Browsereinstellungen den Zugriff auf Benachrichtigungen.
          </p>
        )}
      </section>

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
