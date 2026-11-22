import React, { useState, useEffect } from 'react';
import './PersonalDataPage.css';
import Button from './Button';
import { updateUserProfile, changePassword, saveFcmToken, setBackgroundUpdatesEnabled, setUserSprache } from '../utils/userManagement';
import { ALARM_SOUNDS, getAlarmSoundPreference, saveAlarmSoundPreference, getDarkModeMode, saveDarkModePreference, applyDarkModePreference } from '../utils/customLists';
import { previewAlarmSound } from '../utils/alarmAudioUtils';
import { requestNotificationPermission, getMessagingServiceWorkerVersion } from '../utils/pushNotifications';
import { readPushLog, clearPushLog } from '../utils/pushTapHandoff';
import { setWebImportPin, clearWebImportPin } from '../utils/webImportPin';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import useUndoableDelete from '../hooks/useUndoableDelete';
import { useSprache, useTexte } from '../contexts/SpracheContext';
import { SPRACHEN, STANDARD_SPRACHE, istSprache } from '../i18n/sprachen';
import { formatiereDatum } from '../i18n/format';
import allgemeinTexte from '../i18n/texte/allgemein';
import bereicheTexte from '../i18n/texte/bereiche';
import persoenlicheDatenTexte from '../i18n/texte/persoenlicheDaten';
import webimportPinTexte from '../i18n/texte/webimportPin';

const PIN_PATTERN = /^\d{4,8}$/;

const PUSH_LOG_ZEIT = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };

const THEME_MODES = [
  { key: 'light', textKey: 'themaHell' },
  { key: 'dark', textKey: 'themaDunkel' },
  { key: 'auto', textKey: 'themaAutomatisch' },
];

const spracheName = (id) => SPRACHEN.find((eintrag) => eintrag.id === id)?.name || id;

function PersonalDataPage({ currentUser, onBack, onProfileUpdated, privateLists = [] }) {
  const t = useTexte(persoenlicheDatenTexte);
  const tA = useTexte(allgemeinTexte);
  const tB = useTexte(bereicheTexte);
  const tPin = useTexte(webimportPinTexte);
  const { sprache } = useSprache();
  const NO_LIST_OPTION = { id: '', name: t('keineVorauswahl') };
  const formatPushLogTime = (at) => formatiereDatum(at, sprache, PUSH_LOG_ZEIT);
  // Name eines Alarmtons; ein Ton ohne Übersetzung behält seinen deutschen Namen.
  const alarmName = (key) => {
    const schluessel = `alarm_${key}`;
    const name = t(schluessel);
    return name === schluessel ? (ALARM_SOUNDS.find((s) => s.key === key)?.label || key) : name;
  };
  // Sprachwahl (Vorhaben Mehrsprachigkeit): nur mit der Berechtigung sprachwahl.
  const darfSprachwahl = Boolean(currentUser?.sprachwahl);
  const gewaehlteSprache = istSprache(currentUser?.sprache) ? currentUser.sprache : STANDARD_SPRACHE;
  const [showSprachePicker, setShowSprachePicker] = useState(false);
  const [spracheFehler, setSpracheFehler] = useState(null);
  const isIosDevice = typeof navigator !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent);
  const [vorname, setVorname] = useState(currentUser?.vorname || '');
  const [nachname, setNachname] = useState(currentUser?.nachname || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [signatureSatz, setSignatureSatz] = useState(currentUser?.signatureSatz || '');
  const [defaultWebImportListId, setDefaultWebImportListId] = useState(currentUser?.defaultWebImportListId || '');
  const [defaultEverydayClassicsListId, setDefaultEverydayClassicsListId] = useState(currentUser?.defaultEverydayClassicsListId || '');
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
  const [showEverydayClassicsListPicker, setShowEverydayClassicsListPicker] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState('default');
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [requestingNotification, setRequestingNotification] = useState(false);

  const [backgroundUpdatesEnabled, setBackgroundUpdatesEnabledState] = useState(Boolean(currentUser?.backgroundUpdatesEnabled));
  const [togglingBackgroundUpdates, setTogglingBackgroundUpdates] = useState(false);
  const [backgroundUpdatesMessage, setBackgroundUpdatesMessage] = useState(null);

  const [webImportPinEnabled, setWebImportPinEnabledState] = useState(Boolean(currentUser?.webImportPinEnabled));
  const [pinRemovedLocally, setPinRemovedLocally] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState(null);
  const { banners: pinBanners, scheduleDelete: schedulePinDelete, undoDelete: undoPinDelete } = useUndoableDelete();
  const pinActive = webImportPinEnabled && !pinRemovedLocally;

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

  const handleToggleBackgroundUpdates = async () => {
    if (togglingBackgroundUpdates) return;
    const nextValue = !backgroundUpdatesEnabled;
    setTogglingBackgroundUpdates(true);
    setBackgroundUpdatesMessage(null);
    try {
      if (nextValue) {
        // Background updates arrive as push messages, so they need
        // notification permission and a saved FCM token first.
        let permission = notificationPermission;
        if (permission !== 'granted') {
          const token = await requestNotificationPermission();
          if (token && currentUser?.id) {
            await saveFcmToken(currentUser.id, token);
          }
          permission = typeof Notification !== 'undefined' ? Notification.permission : permission;
          setNotificationPermission(permission);
        }
        if (permission !== 'granted') {
          setBackgroundUpdatesMessage(t('hintergrundBrauchtErlaubnis'));
          return;
        }
      }
      await setBackgroundUpdatesEnabled(currentUser.id, nextValue);
      setBackgroundUpdatesEnabledState(nextValue);
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, backgroundUpdatesEnabled: nextValue });
    } catch (err) {
      console.warn('Fehler beim Umschalten der Hintergrundaktualisierung:', err);
      setBackgroundUpdatesMessage(t('aenderungNichtGespeichert'));
    } finally {
      setTogglingBackgroundUpdates(false);
    }
  };

  // Diagnose für den Tipp auf „Rezept bereit zur Prüfung" (Tech-Check M8):
  // null = ausgeblendet.
  const [pushLog, setPushLog] = useState(null);
  const [messagingSwVersion, setMessagingSwVersion] = useState(undefined);
  const handleTogglePushLog = async () => {
    if (pushLog !== null) {
      setPushLog(null);
      return;
    }
    setMessagingSwVersion(undefined);
    setPushLog(await readPushLog());
    setMessagingSwVersion(await getMessagingServiceWorkerVersion().catch(() => null));
  };
  const messagingSwVersionLabel = messagingSwVersion === undefined ? t('workerWirdGeprueft') :
    messagingSwVersion === 'none' ? t('workerNichtRegistriert') :
    messagingSwVersion === null ? t('workerAlt') :
    messagingSwVersion;
  const handleClearPushLog = async () => {
    await clearPushLog();
    setPushLog([]);
  };

  const handleWebImportListSelect = async (listId) => {
    setDefaultWebImportListId(listId);
    const result = await updateUserProfile(currentUser.id, {
      vorname: currentUser.vorname,
      nachname: currentUser.nachname,
      email: currentUser.email,
      signatureSatz: currentUser.signatureSatz,
      defaultWebImportListId: listId,
      defaultEverydayClassicsListId,
    });
    if (result.success && onProfileUpdated) {
      onProfileUpdated({ ...currentUser, defaultWebImportListId: listId, defaultEverydayClassicsListId });
    }
  };

  const handleEverydayClassicsListSelect = async (listId) => {
    setDefaultEverydayClassicsListId(listId);
    const result = await updateUserProfile(currentUser.id, {
      vorname: currentUser.vorname,
      nachname: currentUser.nachname,
      email: currentUser.email,
      signatureSatz: currentUser.signatureSatz,
      defaultWebImportListId,
      defaultEverydayClassicsListId: listId,
    });
    if (result.success && onProfileUpdated) {
      onProfileUpdated({ ...currentUser, defaultWebImportListId, defaultEverydayClassicsListId: listId });
    }
  };

  const handleSpracheSelect = async (id) => {
    setSpracheFehler(null);
    try {
      await setUserSprache(currentUser.id, id);
      setShowSprachePicker(false);
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, sprache: id });
    } catch (err) {
      console.warn('Fehler beim Speichern der Sprache:', err);
      setSpracheFehler(t('aenderungNichtGespeichert'));
    }
  };

  const pickerOffen = showAlarmPicker || showAppearancePicker || showWebImportListPicker
    || showEverydayClassicsListPicker || showSprachePicker;

  useEffect(() => {
    if (pickerOffen) {
      window.scrollTo(0, 0);
    }
  }, [pickerOffen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const result = await updateUserProfile(currentUser.id, {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      email: email.trim(),
      signatureSatz: signatureSatz.trim(),
      defaultWebImportListId: defaultWebImportListId,
      defaultEverydayClassicsListId: defaultEverydayClassicsListId
    });

    setSaving(false);
    setMessage({ success: result.success, text: result.success ? t('profilGespeichert') : result.message });

    if (result.success && onProfileUpdated) {
      onProfileUpdated({
        ...currentUser,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        email: email.trim(),
        signatureSatz: signatureSatz.trim(),
        defaultWebImportListId: defaultWebImportListId,
        defaultEverydayClassicsListId: defaultEverydayClassicsListId
      });
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ success: false, text: t('passwoerterUngleich') });
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

  const handleSetPin = async (e) => {
    e.preventDefault();
    setPinMessage(null);

    if (!PIN_PATTERN.test(newPin)) {
      setPinMessage({ success: false, text: tPin('fehlerFormat') });
      return;
    }
    if (newPin !== confirmPin) {
      setPinMessage({ success: false, text: tPin('fehlerUngleich') });
      return;
    }

    setSavingPin(true);
    try {
      await setWebImportPin(newPin);
      setWebImportPinEnabledState(true);
      setPinRemovedLocally(false);
      setNewPin('');
      setConfirmPin('');
      setPinMessage({ success: true, text: t('pinGespeichert') });
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, webImportPinEnabled: true });
    } catch (err) {
      setPinMessage({ success: false, text: err.message });
    } finally {
      setSavingPin(false);
    }
  };

  const handleRemovePin = () => {
    setPinRemovedLocally(true);
    schedulePinDelete({
      key: 'webImportPin',
      message: t('pinEntfernt', { name: tPin('name') }),
      onConfirm: async () => {
        try {
          await clearWebImportPin();
          setWebImportPinEnabledState(false);
          if (onProfileUpdated) onProfileUpdated({ ...currentUser, webImportPinEnabled: false });
        } catch (err) {
          setPinRemovedLocally(false);
          setPinMessage({ success: false, text: err.message });
        }
      },
      onUndo: () => setPinRemovedLocally(false),
    });
  };

  const themaModus = THEME_MODES.find(m => m.key === darkMode);
  const themaName = themaModus ? t(themaModus.textKey) : darkMode;

  return (
    <div className="personal-data-page">
      {showWebImportListPicker && (
        <div className="alarm-sound-picker-page">
          <div className="alarm-sound-picker-header">
            <button
              type="button"
              className="alarm-sound-picker-back-btn"
              onClick={() => setShowWebImportListPicker(false)}
              aria-label={tA('zurueck')}
            >
              ‹ {tA('zurueck')}
            </button>
            <h2 className="alarm-sound-picker-title">{t('inspirationssammlung')}</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label={t('inspirationssammlungWaehlen')}>
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
              aria-label={tA('zurueck')}
            >
              ‹ {tA('zurueck')}
            </button>
            <h2 className="alarm-sound-picker-title">{t('alarmton')}</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label={t('alarmtonWaehlen')}>
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
                  <span className="alarm-sound-picker-name">{alarmName(sound.key)}</span>
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
              aria-label={tA('zurueck')}
            >
              ‹ {tA('zurueck')}
            </button>
            <h2 className="alarm-sound-picker-title">{t('erscheinungsbild')}</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label={t('erscheinungsbildWaehlen')}>
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
                  <span className="alarm-sound-picker-name">{t(mode.textKey)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showEverydayClassicsListPicker && (
        <div className="alarm-sound-picker-page">
          <div className="alarm-sound-picker-header">
            <button
              type="button"
              className="alarm-sound-picker-back-btn"
              onClick={() => setShowEverydayClassicsListPicker(false)}
              aria-label={tA('zurueck')}
            >
              ‹ {tA('zurueck')}
            </button>
            <h2 className="alarm-sound-picker-title">{t('alltagsklassiker')}</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label={t('alltagsklassikerWaehlen')}>
            {[NO_LIST_OPTION, ...privateLists].map(list => (
              <li key={list.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={defaultEverydayClassicsListId === list.id}
                  className={`alarm-sound-picker-item${defaultEverydayClassicsListId === list.id ? ' selected' : ''}`}
                  onClick={() => handleEverydayClassicsListSelect(list.id)}
                >
                  <span className="alarm-sound-picker-checkmark" aria-hidden="true">
                    {defaultEverydayClassicsListId === list.id ? '✓' : ''}
                  </span>
                  <span className="alarm-sound-picker-name">{list.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showSprachePicker && (
        <div className="alarm-sound-picker-page">
          <div className="alarm-sound-picker-header">
            <button
              type="button"
              className="alarm-sound-picker-back-btn"
              onClick={() => setShowSprachePicker(false)}
              aria-label={tA('zurueck')}
            >
              ‹ {tA('zurueck')}
            </button>
            <h2 className="alarm-sound-picker-title">{t('sprache')}</h2>
          </div>
          <ul className="alarm-sound-picker-list" aria-label={t('spracheWaehlen')}>
            {SPRACHEN.map(eintrag => (
              <li key={eintrag.id}>
                <button
                  type="button"
                  role="option"
                  lang={eintrag.id}
                  aria-selected={gewaehlteSprache === eintrag.id}
                  className={`alarm-sound-picker-item${gewaehlteSprache === eintrag.id ? ' selected' : ''}`}
                  onClick={() => handleSpracheSelect(eintrag.id)}
                >
                  <span className="alarm-sound-picker-checkmark" aria-hidden="true">
                    {gewaehlteSprache === eintrag.id ? '✓' : ''}
                  </span>
                  <span className="alarm-sound-picker-name">{eintrag.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {spracheFehler && (
            <p className="pwa-notification-hint pwa-notification-hint--warning">{spracheFehler}</p>
          )}
        </div>
      )}
      <div className={`personal-data-main${pickerOffen ? ' personal-data-main--hidden' : ''}`}>
      <div className="personal-data-header">
        <h2>{tB('chefkoch')}</h2>
      </div>
      <form className="personal-data-form" onSubmit={handleSubmit}>
        <div className="personal-data-field">
          <label htmlFor="vorname">{t('vorname')}</label>
          <input
            id="vorname"
            type="text"
            value={vorname}
            onChange={(e) => setVorname(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="nachname">{t('nachname')}</label>
          <input
            id="nachname"
            type="text"
            value={nachname}
            onChange={(e) => setNachname(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="email">{t('email')}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="personal-data-field">
          <label htmlFor="signatureSatz">{t('signatureSatz')}</label>
          <textarea
            id="signatureSatz"
            value={signatureSatz}
            onChange={(e) => setSignatureSatz(e.target.value)}
            placeholder={t('signatureHinweis')}
            rows={3}
          />
        </div>
        {message && (
          <div className={`personal-data-message ${message.success ? 'success' : 'error'}`}>
            {message.text}
          </div>
        )}
        <div className="personal-data-actions">
          <Button variant="secondary" onClick={onBack}>
            {tA('abbrechen')}
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            {saving ? tA('speichernLaeuft') : tA('speichern')}
          </Button>
        </div>
      </form>

      <div className="personal-data-section-divider" />

      <section className="personal-data-settings-section">
        <h3 className="personal-data-section-title">{t('einstellungen')}</h3>
        <div className="preferences-group">
          {privateLists.length > 0 && (
            <>
              <button
                type="button"
                className="settings-row"
                onClick={() => setShowWebImportListPicker(true)}
                aria-label={t('zumAendern', { name: t('inspirationssammlung'), wert: privateLists.find(l => l.id === defaultWebImportListId)?.name || NO_LIST_OPTION.name })}
              >
                <span className="settings-row-label">{t('inspirationssammlung')}</span>
                <span className="settings-row-right">
                  <span className="settings-row-value">
                    {privateLists.find(l => l.id === defaultWebImportListId)?.name || NO_LIST_OPTION.name}
                  </span>
                  <span className="settings-row-chevron" aria-hidden="true">›</span>
                </span>
              </button>
              <div className="preferences-group-divider" />
              <button
                type="button"
                className="settings-row"
                onClick={() => setShowEverydayClassicsListPicker(true)}
                aria-label={t('zumAendern', { name: t('alltagsklassiker'), wert: privateLists.find(l => l.id === defaultEverydayClassicsListId)?.name || NO_LIST_OPTION.name })}
              >
                <span className="settings-row-label">{t('alltagsklassiker')}</span>
                <span className="settings-row-right">
                  <span className="settings-row-value">
                    {privateLists.find(l => l.id === defaultEverydayClassicsListId)?.name || NO_LIST_OPTION.name}
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
            aria-label={t('zumAendern', { name: t('erscheinungsbild'), wert: themaName })}
          >
            <span className="settings-row-label">{t('erscheinungsbild')}</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {themaName}
              </span>
              <span className="settings-row-chevron" aria-hidden="true">›</span>
            </span>
          </button>
          <div className="preferences-group-divider" />
          <button
            type="button"
            className="settings-row"
            onClick={() => setShowAlarmPicker(true)}
            aria-label={t('zumAendern', { name: t('alarmton'), wert: alarmName(alarmSoundKey) })}
          >
            <span className="settings-row-label">{t('alarmton')}</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {alarmName(alarmSoundKey)}
              </span>
              <span className="settings-row-chevron" aria-hidden="true">›</span>
            </span>
          </button>
          {darfSprachwahl && (
            <>
              <div className="preferences-group-divider" />
              <button
                type="button"
                className="settings-row"
                onClick={() => setShowSprachePicker(true)}
                aria-label={t('zumAendern', { name: t('sprache'), wert: spracheName(gewaehlteSprache) })}
              >
                <span className="settings-row-label">{t('sprache')}</span>
                <span className="settings-row-right">
                  <span className="settings-row-value" lang={gewaehlteSprache}>
                    {spracheName(gewaehlteSprache)}
                  </span>
                  <span className="settings-row-chevron" aria-hidden="true">›</span>
                </span>
              </button>
            </>
          )}
        </div>
      </section>

      <div className="personal-data-section-divider" />

      <section className="personal-data-notifications-section">
        <h3 className="personal-data-section-title">{t('pwaMitteilungen')}</h3>
        <p className="personal-data-password-hint">
          {t('mitteilungenHinweis')}
        </p>
        {isIosDevice && (
          <p className="personal-data-password-hint">
            {t('mitteilungenIos')}
          </p>
        )}
        <div className="preferences-group">
          <button
            type="button"
            className="settings-row"
            onClick={notificationSupported && notificationPermission === 'default' ? handleEnableNotifications : undefined}
            disabled={!notificationSupported || notificationPermission !== 'default' || requestingNotification}
            aria-label={t('zustand', {
              name: t('mitteilungen'),
              wert: !notificationSupported ? t('nichtVerfuegbar') :
                notificationPermission === 'granted' ? t('aktiv') :
                notificationPermission === 'denied' ? t('deaktiviert') :
                requestingNotification ? t('wirdAktiviert') : t('aktivierenKlicken'),
            })}
          >
            <span className="settings-row-label">{t('mitteilungen')}</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {!notificationSupported ? t('nichtVerfuegbar') :
                 requestingNotification ? t('wirdAktiviert') :
                 notificationPermission === 'granted' ? t('aktiv') :
                 notificationPermission === 'denied' ? t('deaktiviert') :
                 t('aktivieren')}
              </span>
              {notificationSupported && notificationPermission === 'default' && !requestingNotification && (
                <span className="settings-row-chevron" aria-hidden="true">›</span>
              )}
            </span>
          </button>
        </div>
        {!notificationSupported && (
          <p className="pwa-notification-hint pwa-notification-hint--info">
            {t('mitteilungenNichtUnterstuetzt')}
          </p>
        )}
        {notificationSupported && notificationPermission === 'denied' && (
          <p className="pwa-notification-hint pwa-notification-hint--warning">
            {t('mitteilungenAbgelehnt')}
          </p>
        )}

        <p className="personal-data-password-hint">
          {t('hintergrundHinweis')}
        </p>
        <div className="preferences-group">
          <button
            type="button"
            className="settings-row"
            onClick={handleToggleBackgroundUpdates}
            disabled={togglingBackgroundUpdates || (!backgroundUpdatesEnabled && !notificationSupported)}
            aria-label={t(backgroundUpdatesEnabled ? 'hintergrundAktivAria' : 'hintergrundAusAria', { name: t('hintergrund') })}
          >
            <span className="settings-row-label">{t('hintergrund')}</span>
            <span className="settings-row-right">
              <span className="settings-row-value">
                {togglingBackgroundUpdates ? t('wirdGeaendert') : backgroundUpdatesEnabled ? t('aktiv') : t('aus')}
              </span>
            </span>
          </button>
        </div>
        {backgroundUpdatesMessage && (
          <p className="pwa-notification-hint pwa-notification-hint--warning">
            {backgroundUpdatesMessage}
          </p>
        )}
        <div className="preferences-group">
          <button
            type="button"
            className="settings-row"
            onClick={handleTogglePushLog}
            aria-expanded={pushLog !== null}
          >
            <span className="settings-row-label">{t('protokoll')}</span>
            <span className="settings-row-right">
              <span className="settings-row-value">{pushLog !== null ? t('ausblenden') : t('anzeigen')}</span>
            </span>
          </button>
          {pushLog !== null && (
            <>
              <p className="personal-data-password-hint">
                {t('protokollKopf', { app: process.env.REACT_APP_VERSION || '–', worker: messagingSwVersionLabel })}
              </p>
              {pushLog.length === 0 ? (
                <p className="personal-data-password-hint">{t('keineEintraege')}</p>
              ) : (
                <ol className="push-tap-log">
                  {[...pushLog].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      <span className="push-tap-log-time">{formatPushLogTime(entry.at)}</span>
                      {entry.by === 'sw' ? t('quelleWorker') : t('quelleApp')}: {entry.step}
                      {entry.detail ? ` – ${entry.detail}` : ''}
                    </li>
                  ))}
                </ol>
              )}
              {pushLog.length > 0 && (
                <button type="button" className="settings-row" onClick={handleClearPushLog}>
                  <span className="settings-row-label">{t('protokollLeeren')}</span>
                </button>
              )}
            </>
          )}
        </div>
      </section>

      <div className="personal-data-section-divider" />

      <section className="personal-data-password-section">
        <h3 className="personal-data-section-title">{t('passwortAendern')}</h3>
        <p className="personal-data-password-hint">
          {t('passwortHinweis')}
        </p>
        <form className="personal-data-form" onSubmit={handlePasswordSubmit}>
          <div className="personal-data-field">
            <label htmlFor="currentPassword">{t('aktuellesPasswort')}</label>
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
            <label htmlFor="newPassword">{t('neuesPasswort')}</label>
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
            <label htmlFor="confirmPassword">{t('neuesPasswortBestaetigen')}</label>
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
            <Button variant="primary" type="submit" loading={savingPassword}>
              {savingPassword ? t('wirdGeaendert') : t('passwortAendern')}
            </Button>
          </div>
        </form>
      </section>

      <div className="personal-data-section-divider" />

      <section className="personal-data-webimport-pin-section">
        <h3 className="personal-data-section-title">{tPin('name')}</h3>
        <p className="personal-data-password-hint">
          {t('pinHinweis')}
        </p>
        {pinActive && (
          <p className="personal-data-password-hint">
            {t('pinKurzbefehlHinweis')}
          </p>
        )}

        {pinActive ? (
          <div className="preferences-group">
            <div className="settings-row settings-row--static delete-row-hover-target">
              <span className="settings-row-label">{t('pinAktiv')}</span>
              <span className="settings-row-right">
                <DeleteRowButton itemName={tPin('name')} onClick={handleRemovePin} />
              </span>
            </div>
          </div>
        ) : (
          <p className="personal-data-password-hint">{t('keinPin')}</p>
        )}

        <form className="personal-data-form" onSubmit={handleSetPin}>
          <div className="personal-data-field">
            <label htmlFor="newPin">{pinActive ? tPin('feldNeu') : tPin('feld')}</label>
            <input
              id="newPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              required
            />
          </div>
          <div className="personal-data-field">
            <label htmlFor="confirmPin">{tPin('bestaetigen')}</label>
            <input
              id="confirmPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              required
            />
          </div>
          {pinMessage && (
            <div className={`personal-data-message ${pinMessage.success ? 'success' : 'error'}`}>
              {pinMessage.text}
            </div>
          )}
          <div className="personal-data-actions">
            <Button variant="primary" type="submit" loading={savingPin}>
              {savingPin ? tA('speichernLaeuft') : pinActive ? t('pinAendern') : t('pinSetzen')}
            </Button>
          </div>
        </form>
      </section>
      </div>
      {pinBanners.length > 0 && (
        <UndoSnackbar itemName={tPin('name')} onUndo={() => undoPinDelete(pinBanners[0].id)} />
      )}
    </div>
  );
}

export default PersonalDataPage;
