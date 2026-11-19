/**
 * Follow between members (Vorhaben Follow). Split out of index.js (Tech-Check F2).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {getFirestore, FieldValue, Timestamp} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');
const follow = require('../follow');
const {sendFollowRequestPush} = require('../followPush');

/**
 * Cloud Function: Follow-Anfrage an ein anderes Mitglied (Vorhaben Follow, PR 2).
 * Prüft Rolle und Flag `follow` beider Seiten, Tageslimit und Sperren; Details
 * in follow.js. Bei einer neuen, dem Gefolgten gezeigten Anfrage geht ein Push raus
 * (followPush.js). Input: { followeeId }. Returns: { status: 'pending' | 'accepted' }.
 */
exports.requestFollow = onCall(
    {maxInstances: 10, invoker: 'public'},
    (request) => follow.requestFollow({FieldValue}, getFirestore(), HttpsError, {
      auth: request.auth,
      followeeId: request.data?.followeeId,
      onNewRequest: (info) => sendFollowRequestPush(getMessaging(), getFirestore(), info),
    }),
);

/**
 * Cloud Function: Antwort auf eine Follow-Anfrage (annehmen, still ablehnen,
 * blockieren). Input: { followerId, action: 'accept' | 'decline' | 'block' }.
 * Returns: { status: 'accepted' | 'declined' | 'blocked' }.
 */
exports.respondFollow = onCall(
    {maxInstances: 10, invoker: 'public'},
    (request) => follow.respondFollow({FieldValue, Timestamp}, getFirestore(), HttpsError, {
      auth: request.auth,
      followerId: request.data?.followerId,
      action: request.data?.action,
    }),
);
