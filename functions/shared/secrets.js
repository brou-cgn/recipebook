/**
 * Von mehreren Function-Gruppen genutzte Helfer (secrets; aus index.js, Tech-Check F2).
 */

const {defineSecret} = require('firebase-functions/params');

// SMTP secrets for email notifications
// Set with: firebase functions:secrets:set SMTP_HOST
// and: SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM
const smtpHost = defineSecret('SMTP_HOST');
const smtpPort = defineSecret('SMTP_PORT');
const smtpUser = defineSecret('SMTP_USER');
const smtpPassword = defineSecret('SMTP_PASSWORD');
const smtpFrom = defineSecret('SMTP_FROM');

module.exports = {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom};
