/**
 * Gemeinsame Laufzeit-Optionen aller Cloud Functions (Tech-Check S15).
 *
 * FUNCTIONS_SERVICE_ACCOUNT ist das Dienstkonto, unter dem alle Functions laufen. Solange es
 * null ist, laufen sie wie bisher unter dem Compute-Standardkonto, das die Projektrolle
 * Bearbeiter hat (Befund S15: jede Lücke in einer Function hätte Reichweite über das ganze
 * Projekt). Eintragen erst, wenn das Konto mit den Rollen aus
 * docs/setup/functions-dienstkonto.md angelegt ist; die Umstellung gilt dann beim nächsten
 * Deploy für alle Functions auf einmal und wird direkt danach geprüft (Checkliste dort).
 *
 * firebase-functions liest die globalen Optionen, wenn eine Function definiert wird, nicht erst
 * beim Deploy. functions/index.js ruft applyGlobalOptions deshalb vor dem ersten Handler auf
 * (geprüft in runtimeOptions.test.js).
 */

const {setGlobalOptions} = require('firebase-functions/v2/options');

/** z. B. 'recipebook-functions@broubook.iam.gserviceaccount.com'; null = Compute-Standardkonto. */
const FUNCTIONS_SERVICE_ACCOUNT = null;

// Konto-ID nach den Regeln von Google Cloud (6 bis 30 Zeichen), immer die volle Adresse.
const SERVICE_ACCOUNT_EMAIL = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/;

/**
 * Globale Optionen für das Dienstkonto, oder null, wenn keins eingetragen ist.
 * @param {(string|null)} serviceAccount
 * @return {({serviceAccount: string}|null)}
 * @throws {Error} bei einer Adresse, die kein Dienstkonto eines Projekts ist (bricht den Deploy ab,
 *   statt alle Functions mit einem falschen Konto auszurollen)
 */
function globalOptionsFor(serviceAccount) {
  if (serviceAccount === null || serviceAccount === undefined) return null;
  if (typeof serviceAccount !== 'string' || !SERVICE_ACCOUNT_EMAIL.test(serviceAccount)) {
    throw new Error(
        `FUNCTIONS_SERVICE_ACCOUNT muss die volle Adresse eines Dienstkontos sein (…@<projekt>.iam.gserviceaccount.com), nicht „${serviceAccount}“.`,
    );
  }
  return {serviceAccount};
}

/**
 * Setzt die globalen Optionen, falls ein Dienstkonto eingetragen ist; sonst bleibt alles beim
 * Standard von Firebase.
 * @param {(string|null)} [serviceAccount]
 * @return {({serviceAccount: string}|null)} die gesetzten Optionen
 */
function applyGlobalOptions(serviceAccount = FUNCTIONS_SERVICE_ACCOUNT) {
  const options = globalOptionsFor(serviceAccount);
  if (options) setGlobalOptions(options);
  return options;
}

module.exports = {FUNCTIONS_SERVICE_ACCOUNT, applyGlobalOptions, globalOptionsFor};
