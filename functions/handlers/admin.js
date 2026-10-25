/**
 * admin: aus index.js ausgelagert (Tech-Check F2).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom} = require('../shared/secrets');
const {requireAiCaller} = require('../shared/auth');
const {escapeHtml} = require('../shared/common');
const {cleanupFollowData} = require('../followCleanup');
const {deleteCookDatesOfUser, deleteNonPublicRecipesOfUser} = require('../accountCleanup');

/**
 * Maximum number of account registrations allowed per IP address per hour.
 */
const REGISTRATION_RATE_LIMIT = 5;

/**
 * Blacklist of commonly used weak passwords (all lowercase for case-insensitive comparison).
 */
const COMMON_PASSWORDS = [
  '123456', 'password', '12345678', 'qwerty', 'abc123', '111111',
  '123456789', '1234567890', 'iloveyou', 'admin123', 'letmein',
  'welcome', 'monkey', 'dragon', 'master', 'sunshine', 'princess',
  'qwerty123', 'superman', 'shadow', 'baseball', 'football',
  'charlie', 'donald', 'starwars', 'passw0rd', 'trustno1',
  'password123', 'password1234', 'password12345',
];

/**
 * Check and enforce the per-IP registration rate limit.
 * Stores counters in the `registrationLimits` Firestore collection, keyed by
 * IP address and the current UTC hour so the counter resets each hour.
 *
 * @param {string} ip - Normalised client IP address
 * @returns {Promise<{allowed: boolean, remaining: number}>}
 */
async function checkRegistrationRateLimit(ip) {
  const db = admin.firestore();
  // Bucket by UTC hour so the counter resets automatically each hour
  const hourKey = new Date().toISOString().slice(0, 13); // e.g. "2026-03-06T19"
  const docRef = db.collection('registrationLimits').doc(`${ip}_${hourKey}`);

  try {
    return await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);

      if (!snap.exists) {
        transaction.set(docRef, {
          ip,
          hourKey,
          count: 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return {allowed: true, remaining: REGISTRATION_RATE_LIMIT - 1};
      }

      const data = snap.data();
      if (data.count >= REGISTRATION_RATE_LIMIT) {
        return {allowed: false, remaining: 0};
      }

      transaction.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
      });
      return {allowed: true, remaining: REGISTRATION_RATE_LIMIT - data.count - 1};
    });
  } catch (error) {
    console.error('Registration rate limit check error:', error);
    // Fail open so a Firestore outage does not block all registrations
    return {allowed: true, remaining: REGISTRATION_RATE_LIMIT};
  }
}

/** Maximum invitation calls per sender and day (UTC). */
const INVITATION_DAILY_LIMIT = 20;

/**
 * Count one invitation call against the sender's daily limit and refuse the
 * call when the limit is used up. Counts every call (also for registered or
 * already invited addresses) so the limit cannot be bypassed by probing.
 * @param {string} uid - UID of the sender
 * @return {Promise<void>}
 */
async function consumeInvitationQuota(uid) {
  const db = admin.firestore();
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection('invitationLimits').doc(`${uid}_${day}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data().count || 0) : 0;
    if (count >= INVITATION_DAILY_LIMIT) {
      throw new HttpsError(
          'resource-exhausted',
          'Das Tageslimit für Einladungen ist erreicht. Bitte versuche es morgen erneut.'
      );
    }
    tx.set(ref, {uid, day, count: count + 1});
  });
}

/**
 * Cloud Function: Send an invitation email to a new email address added to a private list.
 * Checks whether the address is already registered or has already received an invitation.
 * If neither, sends an invitation email and records the sent invitation in Firestore.
 *
 * Only callers with the edit role or higher may invite, each sender is limited
 * to INVITATION_DAILY_LIMIT calls per day, and the response is identical whether
 * the address is registered, already invited or newly invited - so the function
 * neither works as a spam relay nor reveals which addresses are registered.
 *
 * Input data:
 * - email: The email address to invite
 *
 * Returns: { success: true }
 */
exports.sendGroupInvitationEmail = onCall(
    {
      maxInstances: 10,
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (request) => {
      const callerAuth = request.auth;
      if (!callerAuth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein, um Einladungen zu versenden.'
        );
      }

      await requireAiCaller(callerAuth).catch((err) => {
        if (err.code === 'permission-denied') {
          throw new HttpsError(
              'permission-denied',
              'Einladungen sind erst ab der Rolle „Bearbeiten“ möglich.'
          );
        }
        throw err;
      });

      const {email} = request.data;

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw new HttpsError('invalid-argument', 'Ungültige E-Mail-Adresse.');
      }

      await consumeInvitationQuota(callerAuth.uid);

      const normalizedEmail = email.trim().toLowerCase();
      const db = admin.firestore();

      // Check if the email address is already registered as a user
      try {
        await admin.auth().getUserByEmail(normalizedEmail);
        // User exists – no invitation needed; answer exactly like a sent invitation
        return {success: true};
      } catch (authError) {
        if (authError.code !== 'auth/user-not-found') {
          console.error('sendGroupInvitationEmail: error checking Firebase Auth:', authError);
          throw new HttpsError('internal', 'Fehler bei der Benutzerprüfung.');
        }
        // auth/user-not-found → proceed
      }

      // Check if an invitation has already been sent for this address
      const invitationRef = db.collection('invitations').doc(normalizedEmail);
      const invitationSnap = await invitationRef.get();
      if (invitationSnap.exists) {
        return {success: true};
      }

      // Send the invitation email
      const smtpHostVal = smtpHost.value();
      const smtpPortVal = smtpPort.value();
      const smtpUserVal = smtpUser.value();
      const smtpPasswordVal = smtpPassword.value();
      const smtpFromVal = smtpFrom.value();

      if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
        console.warn('sendGroupInvitationEmail: SMTP secrets not fully configured – skipping email');
        throw new HttpsError('unavailable', 'E-Mail-Versand ist momentan nicht konfiguriert.');
      }

      const registrationUrl = 'https://broubook.web.app/';

      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHostVal,
        port: parseInt(smtpPortVal || '587', 10),
        secure: parseInt(smtpPortVal || '587', 10) === 465,
        auth: {
          user: smtpUserVal,
          pass: smtpPasswordVal,
        },
      });

      const safeUrl = escapeHtml(registrationUrl);

      const mailOptions = {
        from: smtpFromVal,
        to: normalizedEmail,
        subject: 'Einladung zur Nutzung von Recipebook',
        text:
          `Hallo!\n\n` +
          `Du wurdest eingeladen, Recipebook zu nutzen. Bitte registriere dich über den folgenden Link, ` +
          `um Zugriff auf die private Liste zu erhalten.\n\n` +
          `${registrationUrl}\n\n` +
          `Bei Fragen antworte gerne auf diese Mail.\n\n` +
          `Viele Grüße,\n` +
          `Dein Recipebook-Team`,
        html:
          `<p>Hallo!</p>` +
          `<p>Du wurdest eingeladen, Recipebook zu nutzen. Bitte registriere dich über den folgenden Link, ` +
          `um Zugriff auf die private Liste zu erhalten.</p>` +
          `<p><a href="${safeUrl}">Registrierung starten</a></p>` +
          `<p>Bei Fragen antworte gerne auf diese Mail.</p>` +
          `<p>Viele Grüße,<br>Dein Recipebook-Team</p>`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`sendGroupInvitationEmail: invitation sent to ${normalizedEmail}`);
      } catch (mailError) {
        console.error('sendGroupInvitationEmail: error sending email:', mailError);
        throw new HttpsError('internal', 'Fehler beim Versenden der Einladungs-E-Mail.');
      }

      // Record the sent invitation so it is only sent once
      await invitationRef.set({
        email: normalizedEmail,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        sentBy: callerAuth.uid,
      });

      return {success: true};
    },
);

/**
 * Firestore trigger: automatically add a newly registered user to all private groups
 * they were previously invited to by email.
 * Triggered when a new document is created in the 'users' collection.
 */
exports.processGroupInvitationsOnUserRegistration = onDocumentCreated(
    {
      document: 'users/{userId}',
      region: 'us-central1',
    },
    async (event) => {
      const userId = event.params.userId;
      const newUser = event.data ? event.data.data() : null;
      if (!newUser) {
        console.error('processGroupInvitationsOnUserRegistration: no user data in event');
        return;
      }

      const userEmail = newUser.email;
      if (!userEmail) {
        console.log('processGroupInvitationsOnUserRegistration: user has no email, skipping');
        return;
      }

      const normalizedEmail = userEmail.trim().toLowerCase();
      const db = admin.firestore();

      // Find all groups where this email is listed in invitedEmails
      const groupsSnapshot = await db.collection('groups')
          .where('invitedEmails', 'array-contains', normalizedEmail)
          .get();

      if (groupsSnapshot.empty) {
        console.log(`processGroupInvitationsOnUserRegistration: no pending group invitations for ${normalizedEmail}`);
        return;
      }

      // Add the user to each group and remove the email from invitedEmails using a batch write
      const batch = db.batch();
      groupsSnapshot.forEach((groupDoc) => {
        const groupData = groupDoc.data();
        const updatedMemberIds = [...new Set([...(groupData.memberIds || []), userId])];
        const updatedInvitedEmails = (groupData.invitedEmails || []).filter(
            (e) => e.trim().toLowerCase() !== normalizedEmail
        );
        batch.update(groupDoc.ref, {
          memberIds: updatedMemberIds,
          invitedEmails: updatedInvitedEmails,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`processGroupInvitationsOnUserRegistration: adding user ${userId} to group ${groupDoc.id}`);
      });

      await batch.commit();
      console.log(`processGroupInvitationsOnUserRegistration: processed ${groupsSnapshot.size} group(s) for ${normalizedEmail}`);

      // Mark the invitation as processed if a corresponding record exists.
      // The 'invitations' collection tracks invitation emails sent to unregistered
      // addresses (one document per email, keyed by normalized email address).
      const invitationRef = db.collection('invitations').doc(normalizedEmail);
      const invitationSnap = await invitationRef.get();
      if (invitationSnap.exists) {
        await invitationRef.update({
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedUserId: userId,
        });
        console.log(`processGroupInvitationsOnUserRegistration: invitation marked as processed for ${normalizedEmail}`);
      }
    },
);

/**
 * Firestore trigger: send email notification to all admins when a new user registers.
 * Triggered when a new document is created in the 'users' collection.
 * Requires the following Firebase secrets to be set:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 */
exports.notifyAdminsOnUserRegistration = onDocumentCreated(
    {
      document: 'users/{userId}',
      region: 'us-central1',
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (event) => {
      const newUser = event.data ? event.data.data() : null;
      if (!newUser) {
        console.error('notifyAdminsOnUserRegistration: no user data in event');
        return;
      }

      // Skip notifications for the very first user (the initial admin)
      if (newUser.role === 'admin') {
        console.log('notifyAdminsOnUserRegistration: first user is admin, skipping self-notification');
        return;
      }

      const smtpHostVal = smtpHost.value();
      const smtpPortVal = smtpPort.value();
      const smtpUserVal = smtpUser.value();
      const smtpPasswordVal = smtpPassword.value();
      const smtpFromVal = smtpFrom.value();

      if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
        console.warn('notifyAdminsOnUserRegistration: SMTP secrets not fully configured – skipping email');
        return;
      }

      // Fetch all admin users from Firestore
      const db = admin.firestore();
      const usersSnapshot = await db.collection('users').where('role', '==', 'admin').get();

      if (usersSnapshot.empty) {
        console.log('notifyAdminsOnUserRegistration: no admin users found');
        return;
      }

      const adminEmails = [];
      usersSnapshot.forEach((doc) => {
        const adminData = doc.data();
        if (adminData.email) {
          adminEmails.push(adminData.email);
        }
      });

      if (adminEmails.length === 0) {
        console.log('notifyAdminsOnUserRegistration: no admin email addresses found');
        return;
      }

      // The transporter is created per invocation because Firebase secrets
      // are only accessible during function execution, not at module load time.
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHostVal,
        port: parseInt(smtpPortVal || '587', 10),
        secure: parseInt(smtpPortVal || '587', 10) === 465,
        auth: {
          user: smtpUserVal,
          pass: smtpPasswordVal,
        },
      });

      const registeredAt = newUser.createdAt ?
        new Date(newUser.createdAt).toLocaleString('de-DE', {timeZone: 'Europe/Berlin'}) :
        new Date().toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});

      const fullName = `${newUser.vorname || ''} ${newUser.nachname || ''}`.trim();
      const safeFullName = escapeHtml(fullName);
      const safeEmail = escapeHtml(newUser.email || '–');
      const safeRegisteredAt = escapeHtml(registeredAt);

      const mailOptions = {
        from: smtpFromVal,
        // Use BCC to avoid exposing admin email addresses to each other
        bcc: adminEmails.join(', '),
        subject: 'Neue Benutzerregistrierung im Rezeptbuch',
        text:
          `Ein neuer Benutzer hat sich registriert:\n\n` +
          `Name:          ${fullName}\n` +
          `E-Mail:        ${newUser.email || '–'}\n` +
          `Registriert:   ${registeredAt}\n\n` +
          `Bitte melden Sie sich an, um den neuen Benutzer zu verwalten.`,
        html:
          `<p>Ein neuer Benutzer hat sich registriert:</p>` +
          `<table style="border-collapse:collapse">` +
          `<tr><td style="padding:4px 12px 4px 0"><strong>Name</strong></td>` +
          `<td>${safeFullName}</td></tr>` +
          `<tr><td style="padding:4px 12px 4px 0"><strong>E-Mail</strong></td>` +
          `<td>${safeEmail}</td></tr>` +
          `<tr><td style="padding:4px 12px 4px 0"><strong>Registriert</strong></td>` +
          `<td>${safeRegisteredAt}</td></tr>` +
          `</table>` +
          `<p>Bitte melden Sie sich an, um den neuen Benutzer zu verwalten.</p>`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`notifyAdminsOnUserRegistration: email sent to ${adminEmails.length} admin(s)`);
      } catch (error) {
        console.error('notifyAdminsOnUserRegistration: error sending email:', error);
      }
    },
);

// Fields of users/{uid} that other users may see (author names, member
// pickers). Everything else - e-mail, FCM tokens, role, feature flags - stays
// in users/{uid}, which firestore.rules restricts to its owner and admins.
const PUBLIC_PROFILE_FIELDS = ['vorname', 'nachname', 'versteckt', 'recipe_count'];

/**
 * Pick the public subset of a user document for publicProfiles/{uid}.
 * @param {Object} data - users/{uid} document data
 * @return {Object} Public profile fields (missing ones omitted)
 */
function toPublicProfile(data) {
  const profile = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (data[field] !== undefined) profile[field] = data[field];
  }
  return profile;
}

/**
 * Firestore Trigger: Mirror the public part of users/{uid} into
 * publicProfiles/{uid} on every create, update and delete. On delete it also
 * removes the account's follow data, cook dates and non-public recipes.
 */
exports.syncPublicProfile = onDocumentWritten(
    // Löschen eines Kontos räumt Rezepte samt Bildern auf, das kann dauern.
    {document: 'users/{userId}', timeoutSeconds: 300},
    async (event) => {
      const ref = admin.firestore().collection('publicProfiles').doc(event.params.userId);
      const after = event.data?.after;
      if (!after || !after.exists) {
        await ref.delete();
        // Konto gelöscht: Follow-Daten mit entfernen (followCleanup.js). Hier statt in
        // einem eigenen Trigger, damit es keine zweite Invocation je Nutzer-Write gibt.
        await cleanupFollowData(admin, admin.firestore(), event.params.userId);
        await deleteCookDatesOfUser(admin.firestore(), event.params.userId);
        await deleteNonPublicRecipesOfUser(
            {db: admin.firestore(), bucket: admin.storage().bucket()}, event.params.userId);
        return;
      }
      // Written on every change, not only when a public field changed: users
      // that predate this function get their public profile on their next
      // write (e.g. the FCM token saved at login).
      await ref.set(toPublicProfile(after.data()));
    },
);

/**
 * Remove userEmail from every document of a call-log collection, in batches.
 * The call logs (appCalls, recipeCalls) no longer store e-mail addresses -
 * admins see them on the statistics page from the user profiles - so this
 * clears entries logged before that change. Idempotent: a second run finds
 * nothing.
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} collectionName - 'appCalls' or 'recipeCalls'
 * @return {Promise<number>} Number of documents updated
 */
async function stripLogEmailsCore(db, collectionName) {
  const BATCH_SIZE = 450;
  let updated = 0;
  // An inequality on the field matches exactly the documents that still
  // have it (Firestore skips documents where the field is missing).
  for (;;) {
    const snapshot = await db.collection(collectionName)
        .where('userEmail', '>=', '')
        .limit(BATCH_SIZE)
        .get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, {userEmail: admin.firestore.FieldValue.delete()});
    });
    await batch.commit();
    updated += snapshot.size;
  }
  return updated;
}

/**
 * Callable (admin only): one-time cleanup of e-mail addresses in appCalls
 * and recipeCalls. Triggered from the "Rezeptaufrufe" tab of the
 * Küchenbetrieb page.
 */
exports.stripCallLogEmails = onCall(
    {
      timeoutSeconds: 300,
      maxInstances: 1,
      invoker: 'public',
    },
    async (request) => {
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }
      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      const callerData = callerDoc.exists ? (callerDoc.data() || {}) : {};
      if (callerData.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin role required.');
      }

      const db = admin.firestore();
      const appCalls = await stripLogEmailsCore(db, 'appCalls');
      const recipeCalls = await stripLogEmailsCore(db, 'recipeCalls');
      console.log(
          `stripCallLogEmails: triggered by ${callerUid}, ` +
          `appCalls ${appCalls}, recipeCalls ${recipeCalls}`,
      );
      const total = appCalls + recipeCalls;
      return {
        appCalls,
        recipeCalls,
        message: total === 0 ?
          'Keine E-Mail-Adressen mehr in den Aufruf-Protokollen gefunden.' :
          `E-Mail-Adressen entfernt: ${appCalls} App-Aufruf${appCalls === 1 ? '' : 'e'}, ` +
          `${recipeCalls} Rezeptaufruf${recipeCalls === 1 ? '' : 'e'}.`,
      };
    },
);

/**
 * Cloud Function: Set a user's password (admin only)
 * Allows an admin to set a temporary password for another user via Firebase Admin SDK.
 *
 * Input data:
 * - targetUserId: The UID of the user whose password should be changed
 * - newPassword: The new password to set (min 6 characters)
 *
 * Returns: { success: true }
 */
exports.setUserPassword = onCall(
    {
      maxInstances: 10,
    },
    async (request) => {
      // Authentication check
      const auth = request.auth;
      if (!auth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein, um diese Aktion durchzuführen.'
        );
      }

      const {targetUserId, newPassword} = request.data;

      // Input validation
      if (!targetUserId || typeof targetUserId !== 'string') {
        throw new HttpsError('invalid-argument', 'Ungültige Benutzer-ID.');
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
        throw new HttpsError(
            'invalid-argument',
            'Das Passwort muss mindestens 12 Zeichen lang sein.'
        );
      }
      if (!/[0-9]/.test(newPassword) && !/[^a-zA-Z0-9]/.test(newPassword)) {
        throw new HttpsError(
            'invalid-argument',
            'Das Passwort muss mindestens eine Zahl oder ein Sonderzeichen enthalten.'
        );
      }
      if (COMMON_PASSWORDS.includes(newPassword.toLowerCase())) {
        throw new HttpsError(
            'invalid-argument',
            'Dieses Passwort ist zu häufig verwendet. Bitte wählen Sie ein sichereres Passwort.'
        );
      }

      // Verify that the calling user is an admin by checking Firestore
      const db = admin.firestore();
      const callerDoc = await db.collection('users').doc(auth.uid).get();
      if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new HttpsError(
            'permission-denied',
            'Nur Administratoren können Passwörter zurücksetzen.'
        );
      }

      try {
        // Update the target user's password via Firebase Admin SDK
        await admin.auth().updateUser(targetUserId, {password: newPassword});

        // Set requiresPasswordChange flag in Firestore (use set with merge to handle missing docs)
        await db.collection('users').doc(targetUserId).set(
            {requiresPasswordChange: true},
            {merge: true},
        );
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error setting password for user ${targetUserId}:`, err);
        if (err.code === 'auth/user-not-found') {
          throw new HttpsError(
              'not-found',
              'Benutzer nicht gefunden.',
          );
        }
        if (err.code === 'auth/invalid-password') {
          throw new HttpsError(
              'invalid-argument',
              'Das Passwort entspricht nicht den Anforderungen.',
          );
        }
        throw new HttpsError(
            'internal',
            'Fehler beim Setzen des Passworts. Bitte versuchen Sie es erneut.',
        );
      }

      console.log(`[${new Date().toISOString()}] Admin ${auth.uid} successfully set temporary password for user ${targetUserId}`);
      return {success: true};
    },
);

/**
 * Atomically create a user profile in Firestore after Firebase Auth registration.
 *
 * The caller must already be authenticated (Firebase Auth) as the new user.
 * The function uses a Firestore transaction to detect whether this is the very
 * first user and grants admin rights only in that case, eliminating the
 * client-side race condition.
 *
 * Expected request.data: { vorname, nachname, email }
 */
exports.createUserProfile = onCall(
    {
      maxInstances: 10,
      // Grants the Cloud Run "allUsers" invoker role so the callable SDK's
      // Firebase Auth ID token reaches request.auth below instead of being
      // rejected by Cloud Run's own IAM check first. Every other onCall/
      // onRequest function in this file sets this for the same reason.
      // Note: this alone is not sufficient if Identity-Aware Proxy (IAP) is
      // also enabled on the underlying Cloud Run service - IAP enforces its
      // own token check ahead of the IAM invoker check regardless of this
      // setting, and must be disabled separately (Cloud Run console -> this
      // service -> Security tab).
      invoker: 'public',
    },
    async (request) => {
      // Must be called by an authenticated user
      if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'Sie müssen angemeldet sein, um diese Aktion durchzuführen.',
        );
      }

      const {vorname, nachname, email} = request.data || {};
      const uid = request.auth.uid;

      // IP-based registration rate limiting
      const rawIp = (
        request.rawRequest.headers['x-forwarded-for'] ||
        request.rawRequest.ip ||
        'unknown'
      );
      const clientIp = rawIp.split(',')[0].trim();
      const rateLimitResult = await checkRegistrationRateLimit(clientIp);
      if (!rateLimitResult.allowed) {
        throw new HttpsError(
            'resource-exhausted',
            'Zu viele Registrierungsversuche. Bitte versuchen Sie es später erneut.',
        );
      }

      // Basic input validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (
        !vorname || typeof vorname !== 'string' || vorname.trim().length === 0 ||
        !nachname || typeof nachname !== 'string' || nachname.trim().length === 0 ||
        !email || typeof email !== 'string' || !emailRegex.test(email)
      ) {
        throw new HttpsError(
            'invalid-argument',
            'Ungültige Benutzerdaten. Vor- und Nachname sowie E-Mail sind erforderlich.',
        );
      }

      const db = admin.firestore();
      const userRef = db.collection('users').doc(uid);
      // Sentinel document used to atomically mark that the first user has been
      // registered. Stored in 'settings' because the Admin SDK bypasses rules.
      const sentinelRef = db.collection('settings').doc('_adminBootstrap');

      try {
        // Non-transactional pre-check: protects against migration edge case where
        // users already exist but the sentinel has not been set yet.
        const existingUsersSnap = await db.collection('users').limit(1).get();
        const usersAlreadyExist = !existingUsersSnap.empty;

        const isFirstUser = await db.runTransaction(async (transaction) => {
          // Check whether the profile already exists (idempotency)
          const existingDoc = await transaction.get(userRef);
          if (existingDoc.exists) {
            return null; // Signal: document already present, skip creation
          }

          // Read sentinel document to detect the first-user case atomically.
          // Firestore transactions guarantee that if two concurrent transactions
          // both attempt to write the sentinel, only one commits; the other
          // retries and sees the sentinel already set.
          const sentinelDoc = await transaction.get(sentinelRef);

          // A user is the "first" only if no users existed before AND no
          // sentinel has been written yet.
          const first = !usersAlreadyExist && !sentinelDoc.exists;

          const userProfile = {
            vorname: vorname.trim(),
            nachname: nachname.trim(),
            email: email.toLowerCase().trim(),
            role: first ? 'admin' : 'read',
            fotoscan: false,
            createdAt: new Date().toISOString(),
          };

          transaction.set(userRef, userProfile);
          if (first) {
            // Mark that the first admin has been registered
            transaction.set(sentinelRef, {createdAt: new Date().toISOString()});
          }
          // Return the profile so the caller can use it without an extra read
          return {first, userProfile};
        });

        if (isFirstUser === null) {
          // Profile already existed – return it without modification
          const existingDoc = await userRef.get();
          return {success: true, user: {id: uid, ...existingDoc.data()}};
        }

        console.log(
            `[${new Date().toISOString()}] createUserProfile: created profile for ${uid}` +
            ` (isFirstUser=${isFirstUser.first})`,
        );
        return {success: true, user: {id: uid, ...isFirstUser.userProfile}};
      } catch (err) {
        console.error(
            `[${new Date().toISOString()}] createUserProfile error for uid ${uid}:`,
            err,
        );
        throw new HttpsError(
            'internal',
            'Fehler beim Erstellen des Benutzerprofils. Bitte versuchen Sie es erneut.',
        );
      }
    },
);

/**
 * Backfills thumbnails for all existing recipes that have images but lack
 * a `thumbnailUrl` on one or more of their image entries.
 *
 * The function processes up to `batchSize` (default 50) recipes per invocation
 * to stay within Cloud Functions time limits. Call it multiple times if needed.
 *
 * For each image without a `thumbnailUrl`:
 *  1. Downloads the full image from Firebase Storage (or from a public URL).
 *  2. Resizes it to at most 400 × 300 px using sharp.
 *  3. Uploads the thumbnail to `thumbnails/recipe-thumb-{recipeId}-{idx}.jpg`.
 *  4. Updates the Firestore document with the new `thumbnailUrl` values.
 *
 * Only callable by admin users.
 */
exports.backfillRecipeThumbnails = onCall(
    {
      memory: '1GiB',
      timeoutSeconds: 540,
      maxInstances: 1,
    },
    async (request) => {
      // Only admins may trigger backfill
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }
      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin role required.');
      }

      const {batchSize = 50} = request.data || {};
      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      // Fetch recipes in batches
      const snapshot = await db.collection('recipes').limit(batchSize).get();
      const results = {processed: 0, updated: 0, skipped: 0, errors: []};

      for (const doc of snapshot.docs) {
        results.processed++;
        const data = doc.data();

        // Build images list from the `images` array or from the legacy `image` field
        const images = Array.isArray(data.images) && data.images.length > 0
          ? data.images
          : (data.image ? [{url: data.image, isDefault: true}] : []);

        if (images.length === 0) {
          results.skipped++;
          continue;
        }

        // Check if any image is missing a thumbnailUrl
        const needsUpdate = images.some(
            (img) => img.url && !img.thumbnailUrl,
        );
        if (!needsUpdate) {
          results.skipped++;
          continue;
        }

        try {
          const updatedImages = await Promise.all(
              images.map(async (img, idx) => {
                if (!img.url || img.thumbnailUrl) {
                  return img; // Already has thumbnail or has no URL
                }

                try {
                  let imageBuffer;

                  if (img.url.startsWith('data:image/')) {
                    const matches = img.url.match(/^data:image\/\w+;base64,(.+)$/s);
                    if (!matches) return img;
                    imageBuffer = Buffer.from(matches[1], 'base64');
                  } else {
                    const response = await fetch(img.url);
                    if (!response.ok) {
                      throw new Error(`HTTP ${response.status}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                  }

                  const sharp = require('sharp');
                  const thumbnailBuffer = await sharp(imageBuffer)
                      .resize(400, 300, {fit: 'inside', withoutEnlargement: true})
                      .jpeg({quality: 75})
                      .toBuffer();

                  const fileName =
                    `thumbnails/recipe-thumb-${doc.id}-${idx}.jpg`;
                  const file = bucket.file(fileName);

                  await file.save(thumbnailBuffer, {
                    metadata: {
                      contentType: 'image/jpeg',
                      cacheControl: 'public, max-age=31536000',
                    },
                  });
                  await file.makePublic();

                  const thumbnailUrl =
                    `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                  return {...img, thumbnailUrl};
                } catch (imgErr) {
                  console.warn(
                      `backfillRecipeThumbnails: failed for recipe ` +
                      `${doc.id} image ${idx}:`, imgErr.message,
                  );
                  return img; // Leave unchanged on error
                }
              }),
          );

          // Persist updates to Firestore
          const updatePayload = {images: updatedImages};
          // Also update top-level image if the default image gained a thumbnail
          const defaultImg = updatedImages.find((i) => i.isDefault) ||
            updatedImages[0];
          if (defaultImg?.thumbnailUrl && !data.imageThumbnail) {
            updatePayload.imageThumbnail = defaultImg.thumbnailUrl;
          }

          await doc.ref.update(updatePayload);
          results.updated++;
        } catch (docErr) {
          console.error(
              `backfillRecipeThumbnails: error processing recipe ${doc.id}:`,
              docErr,
          );
          results.errors.push({recipeId: doc.id, error: docErr.message});
        }
      }

      console.log('backfillRecipeThumbnails complete:', results);
      return results;
    },
);

/**
 * Scheduled Cloud Function: clean up expired calculated swipe flags across all
 * lists once per night.
 *
 * For every document in `recipeSwipeFlags` whose `calculatedExpiresAt` timestamp
 * is in the past the fields `flag` and `expiresAt` are reset to `null`, mirroring
 * the lazy cleanup performed by `cleanupExpiredCalculatedFlagsForList` on write.
 *
 * Schedule: every day at 01:00 Europe/Berlin (MEZ/MESZ).
 */
exports.nightlySwipeFlagsCleanup = onSchedule(
    {
      schedule: '0 1 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const snapshot = await db.collection('recipeSwipeFlags').get();

      if (snapshot.empty) {
        console.log('nightlySwipeFlagsCleanup: no documents found, nothing to clean up');
        return;
      }

      const now = Date.now();
      const expiredDocs = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const calculatedExpiresAt = data.calculatedExpiresAt;
        const calculatedExpiresAtMillis = calculatedExpiresAt?.toMillis?.();
        const isExpired =
          calculatedExpiresAt !== null &&
          calculatedExpiresAt !== undefined &&
          typeof calculatedExpiresAtMillis === 'number' &&
          calculatedExpiresAtMillis <= now;

        if (isExpired) {
          expiredDocs.push(docSnap);
        }
      });

      if (expiredDocs.length === 0) {
        console.log('nightlySwipeFlagsCleanup: no expired documents found');
        return;
      }

      let cleanedCount = 0;
      let batch = db.batch();
      let operationCount = 0;

      for (const docSnap of expiredDocs) {
        batch.update(docSnap.ref, {flag: null, expiresAt: null});
        operationCount += 1;
        if (operationCount >= 450) {
          await batch.commit();
          cleanedCount += operationCount;
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        cleanedCount += operationCount;
      }

      console.log(`nightlySwipeFlagsCleanup: cleaned up ${cleanedCount} expired swipe flag document(s)`);
    },
);
