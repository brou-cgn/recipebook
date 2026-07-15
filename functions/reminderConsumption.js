const {onSchedule} = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

// Wie viele Tage nach dem Event-Datum erinnert werden soll.
const REMINDER_DELAY_DAYS = 1;

// FCM sendEachForMulticast erlaubt maximal 500 Tokens pro Aufruf.
const FCM_BATCH_SIZE = 500;

/**
 * Laeuft einmal taeglich. Sucht ueber alle Nutzer hinweg Events, deren Datum
 * laenger als REMINDER_DELAY_DAYS zurueckliegt und deren Status noch nicht
 * "verbrauchErfasst" ist, und schickt eine Push-Erinnerung an alle
 * registrierten Geraete des jeweiligen Nutzers (users/{uid}.fcmTokens,
 * dasselbe Array-Feld wie bei notifyPrivateListMembers).
 *
 * Benoetigt einen Firestore Collection-Group-Index auf "events" (status ASC,
 * date ASC) -- siehe firestore.indexes.json.
 */
exports.reminderConsumption = onSchedule(
    {
      schedule: '0 10 * * *',
      timeZone: 'Europe/Berlin',
      maxInstances: 1,
    },
    async () => {
      const db = admin.firestore();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - REMINDER_DELAY_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

      const pendingEvents = await db
          .collectionGroup('events')
          .where('status', '==', 'berechnet')
          .where('date', '<=', cutoffStr)
          .get();

      if (pendingEvents.empty) {
        console.log('reminderConsumption: keine offenen Verbrauchs-Erfassungen.');
        return;
      }

      // Ein Nutzer kann mehrere offene Events haben -- pro Nutzer nur einmal
      // laden, aber fuer jedes offene Event eine eigene Erinnerung schicken.
      const uidsToFetch = [...new Set(
          pendingEvents.docs.map((doc) => doc.ref.parent.parent.id),
      )];
      const userSnaps = await Promise.all(
          uidsToFetch.map((uid) => db.collection('users').doc(uid).get()),
      );
      const tokensByUid = new Map();
      userSnaps.forEach((snap) => {
        if (!snap.exists) return;
        const fcmTokens = snap.data().fcmTokens;
        if (Array.isArray(fcmTokens) && fcmTokens.length > 0) {
          tokensByUid.set(snap.id, fcmTokens.filter(Boolean));
        }
      });

      const messages = [];
      for (const doc of pendingEvents.docs) {
        const uid = doc.ref.parent.parent.id; // users/{uid}/events/{eventId}
        const tokens = tokensByUid.get(uid);
        if (!tokens || tokens.length === 0) continue;
        const eventData = doc.data();
        const title = 'Wie war\'s?';
        const body =
            `Trag den Getränke-Verbrauch von "${eventData.eventName}" nach, ` +
            'damit die nächste Kalkulation genauer wird.';
        const notificationId = `consumption-reminder-${doc.id}-${Date.now()}`;
        for (const token of tokens) {
          messages.push({
            uid,
            token,
            payload: {
              token,
              data: {
                title,
                body,
                icon: '/logo192.png',
                badge: '/favicon.ico',
                type: 'consumption_reminder',
                eventId: doc.id,
                notificationId,
              },
              apns: {
                headers: {
                  'apns-push-type': 'alert',
                  'apns-priority': '10',
                },
                payload: {
                  aps: {
                    'alert': {title, body},
                    'sound': 'default',
                    'mutable-content': 1,
                  },
                },
              },
              webpush: {
                fcm_options: {
                  link: `/?eventReminder=${doc.id}`,
                },
              },
            },
          });
        }
      }

      if (messages.length === 0) {
        console.log('reminderConsumption: keine Empfänger mit FCM-Token gefunden.');
        return;
      }

      let sentCount = 0;
      const staleTokens = [];
      for (let i = 0; i < messages.length; i += FCM_BATCH_SIZE) {
        const batch = messages.slice(i, i + FCM_BATCH_SIZE);
        try {
          const response = await admin.messaging().sendEach(batch.map((m) => m.payload));
          response.responses.forEach((resp, idx) => {
            if (resp.success) {
              sentCount += 1;
              return;
            }
            if (
              resp.error?.code === 'messaging/registration-token-not-registered' ||
              resp.error?.code === 'messaging/invalid-registration-token'
            ) {
              staleTokens.push(batch[idx]);
            }
          });
        } catch (sendErr) {
          console.error('reminderConsumption: batch send error', sendErr);
        }
      }

      // Ungueltige Tokens best-effort aus den Nutzerdokumenten entfernen.
      if (staleTokens.length > 0) {
        const staleByUid = new Map();
        staleTokens.forEach(({uid, token}) => {
          if (!staleByUid.has(uid)) staleByUid.set(uid, []);
          staleByUid.get(uid).push(token);
        });
        await Promise.allSettled(
            [...staleByUid.entries()].map(([uid, tokens]) =>
              db.collection('users').doc(uid).update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens),
              }),
            ),
        );
      }

      console.log(`reminderConsumption: ${sentCount} Erinnerung(en) verschickt.`);
    },
);
