/**
 * Wichteln: Organisator-Callable, Teilnehmer-Callable und der geplante Versand der
 * Neuigkeiten- und Erinnerungs-Mails. Logik und Geheimhaltung in ../wichteln.js; alle Daten
 * unter wichtelRunden/ sind für Clients gesperrt.
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const wichteln = require('../wichteln');
const {absender} = require('../wichtelMail');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom} = require('../shared/secrets');

const SMTP_SECRETS = [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom];

/**
 * SMTP-Versand für Wichtel-Mails (Einladungen, Neuigkeiten, Erinnerungen). Liest die Secrets erst, wenn eine
 * Mail rausgehen soll, und lädt nodemailer erst dann (Kaltstart, AGENTS.md). Ein kleiner Pool
 * verschickt alle Mails eines Aufrufs über wenige Verbindungen; kurze Timeouts, damit ein
 * hängender Mailserver den Aufruf nicht bis zum Function-Timeout aufhält.
 * @return {{senden: function(object): Promise<object>, schliessen: function(): void}|null}
 *   null, wenn die SMTP-Secrets nicht vollständig sind (Versand nicht eingerichtet)
 */
function smtpMailer() {
  const host = smtpHost.value();
  const user = smtpUser.value();
  const pass = smtpPassword.value();
  const from = smtpFrom.value();
  if (!host || !user || !pass || !from) {
    console.warn('wichteln: SMTP secrets not fully configured – no emails');
    return null;
  }
  const port = parseInt(smtpPort.value() || '587', 10);
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {user, pass},
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  return {
    senden: ({absenderName, ...mail}) => transporter.sendMail({from: absender(from, absenderName), ...mail}),
    schliessen: () => transporter.close(),
  };
}

/**
 * Cloud Function: Wichtel-Runden verwalten (anlegen, Teilnehmer, auslosen, zurücksetzen,
 * löschen, Einladung per Mail). Nur angemeldete Mitglieder ab Rolle edit, nur eigene Runden.
 * Input: { aktion, ...daten }. Die Antwort enthält nie, wer wen gezogen hat.
 */
exports.wichtelVerwalten = onCall(
    // invoker public: sonst weist Cloud Run Browser-Aufrufe vor der Auth-Prüfung ab;
    // die Autorisierung liegt im Handler. 120 s: Beim Auslosen gehen die Einladungen an
    // alle Gäste mit E-Mail-Adresse im selben Aufruf raus.
    {
      maxInstances: 10,
      invoker: 'public',
      timeoutSeconds: 120,
      secrets: SMTP_SECRETS,
    },
    (request) => wichteln.verwalten(admin, admin.firestore(), HttpsError, {
      auth: request.auth,
      daten: request.data,
      mailer: smtpMailer,
    }),
);

/**
 * Cloud Function: Teilnehmerseite per persönlichem Link, ohne Login. Das geheime Token
 * aus dem Link ist die Berechtigung. Input: { aktion, rundeId, token, ...daten }.
 */
exports.wichtelTeilnahme = onCall(
    {region: 'us-central1', cors: ALLOWED_ORIGINS, invoker: 'public', maxInstances: 10},
    (request) => wichteln.teilnahme(admin, admin.firestore(), HttpsError, {
      daten: request.data,
    }),
);

/**
 * Alle 15 Minuten: fällige Neuigkeiten-Mails an Schenker verschicken (neue Wünsche ihres
 * Empfängers oder neue Ideen anderer Gäste für ihn), gebündelt und höchstens eine am Tag je
 * Schenker. Ohne fällige Vormerker endet ein Lauf nach einer Abfrage.
 */
exports.wichtelNeuigkeitenVersenden = onSchedule(
    {
      schedule: '*/15 * * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 300,
      maxInstances: 1,
      retryCount: 0,
      secrets: SMTP_SECRETS,
    },
    async () => {
      const ergebnis = await wichteln.versendeNeuigkeiten(admin, admin.firestore(), {mailer: smtpMailer});
      if (ergebnis.gesendet || ergebnis.verworfen || ergebnis.verschoben) {
        console.log('wichtelNeuigkeitenVersenden:', JSON.stringify(ergebnis));
      }
    },
);

/**
 * Stündlich von 9 bis 20 Uhr: fällige Erinnerungen an Gäste verschicken, die noch keinen Wunsch
 * eingetragen haben (drei Tage nach der Einladung, danach wöchentlich, höchstens dreimal). Nachts
 * geht keine raus; was dann fällig wird, folgt um 9 Uhr. Ohne fällige Vormerker endet ein Lauf
 * nach einer Abfrage.
 */
exports.wichtelErinnerungenVersenden = onSchedule(
    {
      schedule: '0 9-20 * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 300,
      maxInstances: 1,
      retryCount: 0,
      secrets: SMTP_SECRETS,
    },
    async () => {
      const ergebnis = await wichteln.versendeErinnerungen(admin, admin.firestore(), {mailer: smtpMailer});
      if (ergebnis.gesendet || ergebnis.verworfen || ergebnis.verschoben) {
        console.log('wichtelErinnerungenVersenden:', JSON.stringify(ergebnis));
      }
    },
);
