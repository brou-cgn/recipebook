import React, { useState, useEffect, useId } from 'react';
import './PersonalDataPage.css';
import Button from './Button';
import AuswahlGruppe from './AuswahlGruppe';
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

// Zweites Argument für onProfileUpdated: Eine Einstellung wurde gespeichert, die Seite bleibt
// offen. Ohne dieses Argument (Speichern des Formulars) schließt „Chefkoch & mehr“ die Seite.
const SEITE_BLEIBT_OFFEN = { schliessen: false };

/**
 * Profilseite „Chefkoch“: persönliche Daten und Einstellungen. Aufbau nach Variante B des
 * Designvorschlags (https://claude.ai/artifact/5S6yBvMf7j4JvfHLCzwQU2): Kopf mit Person (mittig, ohne Box),
 * darunter gruppierte Abschnitte. Erscheinungsbild und Sprache wählt man direkt in der Zeile,
 * Inspirationssammlung, Alltagsklassiker und Alarmton klappen in der Zeile auf (immer nur eine).
 * Keine Unterseiten.
 */
function PersonalDataPage({ currentUser, onBack, onProfileUpdated, privateLists = [] }) {
  const t = useTexte(persoenlicheDatenTexte);
  const tA = useTexte(allgemeinTexte);
  const tB = useTexte(bereicheTexte);
  const tPin = useTexte(webimportPinTexte);
  const { sprache } = useSprache();
  const idBasis = useId();
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
  const gespeicherteSprache = istSprache(currentUser?.sprache) ? currentUser.sprache : STANDARD_SPRACHE;
  // Die getippte Sprache zeigt die Auswahl sofort; schlägt das Speichern fehl, springt sie zurück.
  const [spracheAuswahl, setSpracheAuswahl] = useState(null);
  const [spracheSpeichert, setSpracheSpeichert] = useState(false);
  const [spracheFehler, setSpracheFehler] = useState(null);
  const angezeigteSprache = spracheAuswahl || gespeicherteSprache;
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
  // Welche Zeile aufgeklappt ist: 'inspiration' | 'alltag' | 'alarm' | null
  const [aufgeklappt, setAufgeklappt] = useState(null);
  const [listenFehler, setListenFehler] = useState(null);

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

  // Kommt eine andere Sprache von außen (Profil neu geladen), gilt wieder die gespeicherte.
  useEffect(() => {
    setSpracheAuswahl(null);
  }, [currentUser?.sprache]);

  const handleDarkModeSelect = (mode) => {
    setDarkMode(mode);
    saveDarkModePreference(mode);
    applyDarkModePreference(mode);
  };

  // Antippen wählt den Ton und spielt ihn an – auch den schon gewählten, zum Nachhören.
  const handleAlarmSelect = (key) => {
    setAlarmSoundKey(key);
    saveAlarmSoundPreference(key);
    previewAlarmSound(key);
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
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, backgroundUpdatesEnabled: nextValue }, SEITE_BLEIBT_OFFEN);
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

  // Standardlisten speichern sofort; scheitert es, springt die Auswahl zurück.
  const speichereStandardlisten = async (neu) => {
    const vorher = { defaultWebImportListId, defaultEverydayClassicsListId };
    setDefaultWebImportListId(neu.defaultWebImportListId);
    setDefaultEverydayClassicsListId(neu.defaultEverydayClassicsListId);
    setListenFehler(null);
    let result;
    try {
      result = await updateUserProfile(currentUser.id, {
        vorname: currentUser.vorname,
        nachname: currentUser.nachname,
        email: currentUser.email,
        signatureSatz: currentUser.signatureSatz,
        ...neu,
      });
    } catch (err) {
      console.warn('Fehler beim Speichern der Standardliste:', err);
    }
    if (result?.success) {
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, ...neu }, SEITE_BLEIBT_OFFEN);
      return;
    }
    setDefaultWebImportListId(vorher.defaultWebImportListId);
    setDefaultEverydayClassicsListId(vorher.defaultEverydayClassicsListId);
    setListenFehler(t('aenderungNichtGespeichert'));
  };

  const handleWebImportListSelect = (listId) => {
    if (listId === defaultWebImportListId) return;
    speichereStandardlisten({ defaultWebImportListId: listId, defaultEverydayClassicsListId });
  };

  const handleEverydayClassicsListSelect = (listId) => {
    if (listId === defaultEverydayClassicsListId) return;
    speichereStandardlisten({ defaultWebImportListId, defaultEverydayClassicsListId: listId });
  };

  const handleSpracheSelect = async (id) => {
    if (id === angezeigteSprache || spracheSpeichert) return;
    setSpracheFehler(null);
    setSpracheAuswahl(id);
    setSpracheSpeichert(true);
    try {
      await setUserSprache(currentUser.id, id);
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, sprache: id }, SEITE_BLEIBT_OFFEN);
    } catch (err) {
      console.warn('Fehler beim Speichern der Sprache:', err);
      setSpracheAuswahl(null);
      setSpracheFehler(t('aenderungNichtGespeichert'));
    } finally {
      setSpracheSpeichert(false);
    }
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
      if (onProfileUpdated) onProfileUpdated({ ...currentUser, webImportPinEnabled: true }, SEITE_BLEIBT_OFFEN);
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
          if (onProfileUpdated) onProfileUpdated({ ...currentUser, webImportPinEnabled: false }, SEITE_BLEIBT_OFFEN);
        } catch (err) {
          setPinRemovedLocally(false);
          setPinMessage({ success: false, text: err.message });
        }
      },
      onUndo: () => setPinRemovedLocally(false),
    });
  };

  const anzeigeName = [currentUser?.vorname, currentUser?.nachname]
    .map((teil) => (teil || '').trim())
    .filter(Boolean)
    .join(' ');
  const initialen = [currentUser?.vorname, currentUser?.nachname]
    .map((teil) => (teil || '').trim().charAt(0))
    .join('')
    .toUpperCase();
  const themaOptionen = THEME_MODES.map((mode) => ({ wert: mode.key, label: t(mode.textKey) }));
  const spracheOptionen = SPRACHEN.map((eintrag) => ({ wert: eintrag.id, label: eintrag.name, lang: eintrag.id }));
  const alarmOptionen = ALARM_SOUNDS.map((sound) => ({ wert: sound.key, label: alarmName(sound.key) }));
  const listenOptionen = [NO_LIST_OPTION, ...privateLists].map((list) => ({ wert: list.id, label: list.name }));
  const listenName = (id) => privateLists.find((list) => list.id === id)?.name || NO_LIST_OPTION.name;
  const themaLabelId = `${idBasis}-thema`;
  const spracheLabelId = `${idBasis}-sprache`;

  // Zeile, die ihre Auswahl darunter aufklappt (Standardlisten, Alarmton). Es ist immer nur eine offen.
  const aufklappZeile = ({ schluessel, label, wertName, listenLabel, optionen, wert, onWaehlen }) => {
    const offen = aufgeklappt === schluessel;
    const listeId = `${idBasis}-${schluessel}`;
    return (
      <React.Fragment key={schluessel}>
        <button
          type="button"
          className="settings-row"
          aria-expanded={offen}
          aria-controls={offen ? listeId : undefined}
          onClick={() => setAufgeklappt(offen ? null : schluessel)}
        >
          <span className="settings-row-label">{label}</span>
          <span className="settings-row-right">
            <span className="settings-row-value">{wertName}</span>
            <span className={`settings-row-chevron${offen ? ' settings-row-chevron--offen' : ''}`} aria-hidden="true">›</span>
          </span>
        </button>
        {offen && (
          <AuswahlGruppe
            id={listeId}
            darstellung="liste"
            aria-label={listenLabel}
            optionen={optionen}
            wert={wert}
            onWaehlen={onWaehlen}
          />
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="personal-data-page">
      <div className="personal-data-main">
      <header className="personal-data-kopf">
        {onBack && (
          <button type="button" className="personal-data-kopf-zurueck" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {tA('zurueck')}
          </button>
        )}
        <div className="personal-data-kopf-person">
          {initialen && <span className="personal-data-avatar" aria-hidden="true">{initialen}</span>}
          <h2>{tB('chefkoch')}</h2>
          {anzeigeName && <p className="personal-data-kopf-name">{anzeigeName}</p>}
        </div>
      </header>

      <section className="personal-data-abschnitt">
        <h3 className="personal-data-section-title">{t('persoenlicheDaten')}</h3>
        <form className="personal-data-form" onSubmit={handleSubmit}>
          <div className="personal-data-felder">
            <div className="personal-data-felder-paar">
              <div className="personal-data-field">
                <label htmlFor="vorname">{t('vorname')}</label>
                <input
                  id="vorname"
                  type="text"
                  value={vorname}
                  onChange={(e) => setVorname(e.target.value)}
                  required
                  autoComplete="given-name"
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
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className="personal-data-field">
              <label htmlFor="email">{t('email')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="personal-data-field">
              <label htmlFor="signatureSatz">{t('signatureSatz')}</label>
              <textarea
                id="signatureSatz"
                value={signatureSatz}
                onChange={(e) => setSignatureSatz(e.target.value)}
                placeholder={t('signatureHinweis')}
                rows={2}
              />
            </div>
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
      </section>

      <section className="personal-data-abschnitt personal-data-settings-section">
        <h3 className="personal-data-section-title">{t('einstellungen')}</h3>
        {privateLists.length > 0 && (
          <div className="personal-data-gruppe">
            {aufklappZeile({
              schluessel: 'inspiration',
              label: t('inspirationssammlung'),
              wertName: listenName(defaultWebImportListId),
              listenLabel: t('inspirationssammlungWaehlen'),
              optionen: listenOptionen,
              wert: defaultWebImportListId,
              onWaehlen: handleWebImportListSelect,
            })}
            {aufklappZeile({
              schluessel: 'alltag',
              label: t('alltagsklassiker'),
              wertName: listenName(defaultEverydayClassicsListId),
              listenLabel: t('alltagsklassikerWaehlen'),
              optionen: listenOptionen,
              wert: defaultEverydayClassicsListId,
              onWaehlen: handleEverydayClassicsListSelect,
            })}
          </div>
        )}
        {listenFehler && (
          <p className="pwa-notification-hint pwa-notification-hint--warning" role="alert">{listenFehler}</p>
        )}
        <div className="personal-data-gruppe">
          <div className="settings-row settings-row--stapel">
            <span className="settings-row-label" id={themaLabelId}>{t('erscheinungsbild')}</span>
            <AuswahlGruppe
              aria-labelledby={themaLabelId}
              optionen={themaOptionen}
              wert={darkMode}
              onWaehlen={handleDarkModeSelect}
            />
          </div>
          {darfSprachwahl && (
            <div className="settings-row settings-row--stapel">
              <span className="settings-row-label" id={spracheLabelId}>{t('sprache')}</span>
              <AuswahlGruppe
                aria-labelledby={spracheLabelId}
                optionen={spracheOptionen}
                wert={angezeigteSprache}
                onWaehlen={handleSpracheSelect}
              />
              {spracheFehler && (
                <p className="pwa-notification-hint pwa-notification-hint--warning" role="alert">{spracheFehler}</p>
              )}
            </div>
          )}
          {aufklappZeile({
            schluessel: 'alarm',
            label: t('alarmton'),
            wertName: alarmName(alarmSoundKey),
            listenLabel: t('alarmtonWaehlen'),
            optionen: alarmOptionen,
            wert: alarmSoundKey,
            onWaehlen: handleAlarmSelect,
          })}
        </div>
        {aufgeklappt === 'alarm' && <p className="personal-data-password-hint">{t('alarmtonHinweis')}</p>}
      </section>

      <section className="personal-data-abschnitt personal-data-notifications-section">
        <h3 className="personal-data-section-title">{t('pwaMitteilungen')}</h3>
        <p className="personal-data-password-hint">
          {t('mitteilungenHinweis')}
        </p>
        {isIosDevice && (
          <p className="personal-data-password-hint">
            {t('mitteilungenIos')}
          </p>
        )}
        <div className="personal-data-gruppe">
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
          <button
            type="button"
            role="switch"
            aria-checked={backgroundUpdatesEnabled}
            className="settings-row"
            onClick={handleToggleBackgroundUpdates}
            disabled={togglingBackgroundUpdates || (!backgroundUpdatesEnabled && !notificationSupported)}
          >
            <span className="settings-row-label">{t('hintergrund')}</span>
            <span className="settings-row-right">
              {togglingBackgroundUpdates ? (
                <span className="settings-row-value">{t('wirdGeaendert')}</span>
              ) : (
                <span className="personal-data-schalter" aria-hidden="true" />
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
        {backgroundUpdatesMessage && (
          <p className="pwa-notification-hint pwa-notification-hint--warning">
            {backgroundUpdatesMessage}
          </p>
        )}
        <p className="personal-data-password-hint">
          {t('hintergrundHinweis')}
        </p>
        <div className="personal-data-gruppe">
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
            <div className="personal-data-protokoll">
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
            </div>
          )}
          {pushLog !== null && pushLog.length > 0 && (
            <button type="button" className="settings-row" onClick={handleClearPushLog}>
              <span className="settings-row-label">{t('protokollLeeren')}</span>
            </button>
          )}
        </div>
      </section>

      <section className="personal-data-abschnitt personal-data-password-section">
        <h3 className="personal-data-section-title">{t('passwortAendern')}</h3>
        <p className="personal-data-password-hint">
          {t('passwortHinweis')}
        </p>
        <form className="personal-data-form" onSubmit={handlePasswordSubmit}>
          <div className="personal-data-felder">
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

      <section className="personal-data-abschnitt personal-data-webimport-pin-section">
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
          <div className="personal-data-gruppe">
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
          <div className="personal-data-felder">
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
