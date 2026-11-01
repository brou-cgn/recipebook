/**
 * Weckruf für Kochmodus-Timer (Tech-Check P8). Logik in ../cookingTimerAlarms.js.
 */

const {onSchedule} = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const {processDueCookingTimerAlarms} = require('../cookingTimerAlarms');

/**
 * Jede Minute: Weckrufe, die vor dem nächsten Lauf fällig werden, abwarten und pünktlich als
 * Push an das Gerät senden, auf dem der Timer gestartet wurde. Ein Lauf dauert höchstens knapp
 * eine Minute (er wartet auf die Endzeiten); ohne fällige Weckrufe endet er nach einer Abfrage.
 */
exports.sendDueCookingTimerAlarms = onSchedule(
    {
      schedule: '* * * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 120,
      maxInstances: 2,
      retryCount: 0,
    },
    async () => {
      await processDueCookingTimerAlarms(admin, admin.firestore());
    },
);
