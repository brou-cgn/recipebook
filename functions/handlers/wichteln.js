/**
 * Wichteln: Organisator-Callable und Teilnehmer-Callable. Logik und Geheimhaltung
 * in ../wichteln.js; alle Daten unter wichtelRunden/ sind für Clients gesperrt.
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const wichteln = require('../wichteln');
const {ALLOWED_ORIGINS} = require('../shared/common');

/**
 * Cloud Function: Wichtel-Runden verwalten (anlegen, Teilnehmer, auslosen, zurücksetzen,
 * löschen). Nur angemeldete Mitglieder ab Rolle edit, nur eigene Runden.
 * Input: { aktion, ...daten }. Die Antwort enthält nie, wer wen gezogen hat.
 */
exports.wichtelVerwalten = onCall(
    // invoker public: sonst weist Cloud Run Browser-Aufrufe vor der Auth-Prüfung ab;
    // die Autorisierung liegt im Handler.
    {maxInstances: 10, invoker: 'public'},
    (request) => wichteln.verwalten(admin, admin.firestore(), HttpsError, {
      auth: request.auth,
      daten: request.data,
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
