/**
 * Wichteln: Organisator-Callable und Teilnehmer-Callable. Logik und Geheimhaltung
 * in ../wichteln.js; alle Daten unter wichtelRunden/ sind für Clients gesperrt.
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const wichteln = require('../wichteln');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom} = require('../shared/secrets');

/**
 * SMTP-Versand für Wichtel-Einladungen. Liest die Secrets erst, wenn eine Mail rausgehen
 * soll, und lädt nodemailer erst dann (Kaltstart, AGENTS.md). Ein kleiner Pool verschickt
 * alle Mails eines Aufrufs über wenige Verbindungen; kurze Timeouts, damit ein hängender
 * Mailserver den Aufruf nicht bis zum Function-Timeout aufhält.
 * @return {{senden: function(object): Promise<object>, schliessen: function(): void}|null}
 *   null, wenn die SMTP-Secrets nicht vollständig sind (Versand nicht eingerichtet)
 */
function smtpMailer() {
  const host = smtpHost.value();
  const user = smtpUser.value();
  const pass = smtpPassword.value();
  const from = smtpFrom.value();
  if (!host || !user || !pass || !from) {
    console.warn('wichtelVerwalten: SMTP secrets not fully configured – no invitation emails');
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
    senden: (mail) => transporter.sendMail({from, ...mail}),
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
    // die Autorisierung liegt im Handler. 120 s: Beim Eintragen vieler Gäste mit
    // E-Mail-Adresse gehen alle Einladungen im selben Aufruf raus.
    {
      maxInstances: 10,
      invoker: 'public',
      timeoutSeconds: 120,
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
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
