/**
 * importScheduled: aus index.js ausgelagert (Tech-Check F2).
 */

const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const {AI_IMPORTER_TEST_UID} = require('../shared/auth');
const {escapeHtml} = require('../shared/common');
const {DEFAULT_AI_RECIPE_PROMPT} = require('../shared/gemini');
const {finalizeImportJobBackground, failImportJobBackground, isReelImportSource, runImportFromSource} = require('../shared/importJobs');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, geminiApiKey} = require('../shared/secrets');

// Firebase Web API key, used only by dailyAiImporterTest to exchange a
// server-minted custom token for an ID token so the nightly test can call
// the public callables (fetchRecipeHtml, processHtmlWithAI, scanRecipeWithAI)
// exactly like a real client does. This is the same non-secret public key
// already shipped in the web app bundle (REACT_APP_FIREBASE_API_KEY) —
// stored as a secret here purely for consistency with the other config
// values above.
// Set with: firebase functions:secrets:set WEB_API_KEY
const firebaseWebApiKey = defineSecret('WEB_API_KEY');

/**
 * Minimum number of ingredients / steps expected from the HTML test recipe.
 */
const IMPORTER_TEST_MIN_INGREDIENTS = 2;

const IMPORTER_TEST_MIN_STEPS = 2;

/**
 * Region + project host used to call the deployed callables directly over
 * HTTPS (bypassing the Firebase client SDK, which isn't usable from within a
 * Cloud Function) so the nightly test exercises the exact same auth/IAM
 * boundary a real client hits.
 */
const CALLABLE_BASE_URL = 'https://us-central1-broubook.cloudfunctions.net';

/**
 * Mint a Firebase ID token for AI_IMPORTER_TEST_UID by creating a custom
 * token with the Admin SDK and exchanging it via the Identity Toolkit REST
 * API — the same exchange the client SDK performs internally.
 *
 * @param {string} webApiKey - Firebase Web API key (WEB_API_KEY secret)
 * @returns {Promise<string>} A Firebase ID token for AI_IMPORTER_TEST_UID
 */
async function mintImporterTestIdToken(webApiKey) {
  if (!webApiKey) {
    throw new Error('WEB_API_KEY-Secret ist nicht konfiguriert');
  }
  // The AI callables read the role from users/{uid} (requireAiCaller) and
  // refuse anyone below 'edit'. The throwaway test user has no profile of its
  // own, so provision one - merge keeps this idempotent across nightly runs.
  await admin.firestore().doc(`users/${AI_IMPORTER_TEST_UID}`).set({
    vorname: 'Nightly',
    nachname: 'Importer-Test',
    role: 'edit',
    isTestAccount: true,
  }, {merge: true});
  const customToken = await admin.auth().createCustomToken(AI_IMPORTER_TEST_UID);
  const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({token: customToken, returnSecureToken: true}),
        signal: AbortSignal.timeout(15000),
      },
  );
  const body = await response.json();
  if (!response.ok || !body.idToken) {
    throw new Error(
        `Identity-Toolkit-Token-Exchange fehlgeschlagen: ${body.error?.message || response.status}`,
    );
  }
  return body.idToken;
}

/**
 * Invoke a deployed onCall function directly over HTTPS using the callable
 * protocol, so dailyAiImporterTest exercises the real public entry point
 * (Firebase Auth verification + Cloud Run invoker permissions + rate
 * limiting) instead of calling the underlying helper function in-process.
 * This is the only way to catch an IAM/invoker misconfiguration that makes
 * every real client call fail (see issue #2611).
 *
 * @param {string} functionName - Name of the exported onCall function
 * @param {Object} data - Callable request payload
 * @param {string} idToken - Firebase ID token to send as the caller's identity
 * @returns {Promise<Object>} The callable's `result` payload
 */
async function callPublicCallable(functionName, data, idToken) {
  const response = await fetch(`${CALLABLE_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({data}),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${functionName}: ${body.error?.message || `HTTP ${response.status}`}`);
  }
  return body.result;
}

/**
 * Render a small JPEG photo of a printed recipe using sharp, so the nightly
 * test can exercise scanRecipeWithAI's real image/OCR pipeline (Gemini
 * vision) end-to-end without checking a binary fixture into the repo.
 *
 * @returns {Promise<string>} data: URL (base64 JPEG) suitable for scanRecipeWithAI
 */
async function renderImporterTestRecipeImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="white"/>
    <text x="40" y="60" font-size="36" font-family="sans-serif" font-weight="bold">Rührei</text>
    <text x="40" y="110" font-size="20" font-family="sans-serif">Für 2 Personen</text>
    <text x="40" y="160" font-size="24" font-family="sans-serif" font-weight="bold">Zutaten</text>
    <text x="40" y="195" font-size="20" font-family="sans-serif">- 4 Eier</text>
    <text x="40" y="225" font-size="20" font-family="sans-serif">- 2 Esslöffel Butter</text>
    <text x="40" y="255" font-size="20" font-family="sans-serif">- 1 Prise Salz</text>
    <text x="40" y="310" font-size="24" font-family="sans-serif" font-weight="bold">Zubereitung</text>
    <text x="40" y="345" font-size="20" font-family="sans-serif">1. Eier verquirlen und salzen.</text>
    <text x="40" y="375" font-size="20" font-family="sans-serif">2. Butter in der Pfanne schmelzen.</text>
    <text x="40" y="405" font-size="20" font-family="sans-serif">3. Eimasse unter Rühren stocken lassen.</text>
    <text x="40" y="435" font-size="20" font-family="sans-serif">4. Sofort servieren.</text>
  </svg>`;
  const sharp = require('sharp');
  const jpegBuffer = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

/**
 * Load the AI recipe extraction prompt for internal tests.
 * Falls back to the built-in default prompt instead of throwing an HttpsError
 * (which is only appropriate inside onCall handlers).
 *
 * @returns {Promise<string>} The extraction prompt string
 */
async function getAiRecipePromptForTest() {
  try {
    const db = admin.firestore();
    const settingsDoc = await db.collection('settings').doc('app').get();
    if (settingsDoc.exists) {
      const settings = settingsDoc.data();
      if (settings.aiRecipePrompt && settings.aiRecipePrompt.trim()) {
        return settings.aiRecipePrompt;
      }
    }
  } catch (err) {
    console.warn('dailyAiImporterTest: could not load prompt from Firestore:', err);
  }
  return DEFAULT_AI_RECIPE_PROMPT;
}

/**
 * Validate that a normalised recipe object returned by callGeminiTextAPI has
 * all expected fields and meets minimum content thresholds.
 *
 * @param {Object} recipe - Normalised recipe object
 * @returns {{valid: boolean, issues: string[]}}
 */
function validateImporterResult(recipe) {
  const issues = [];

  if (!recipe || typeof recipe !== 'object') {
    return {valid: false, issues: ['Kein Ergebnisobjekt erhalten']};
  }

  if (typeof recipe.title !== 'string' || recipe.title.trim().length === 0) {
    issues.push('Kein Titel im Ergebnis enthalten');
  }

  if (!recipe.ingredients || !Array.isArray(recipe.ingredients) ||
      recipe.ingredients.length < IMPORTER_TEST_MIN_INGREDIENTS) {
    issues.push(
        `Zu wenige Zutaten: erwartet mind. ${IMPORTER_TEST_MIN_INGREDIENTS}, ` +
        `erhalten ${Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0}`,
    );
  } else if (recipe.ingredients.some((i) => !String(i || '').trim())) {
    issues.push('Mindestens eine Zutat ist leer');
  }

  if (!recipe.steps || !Array.isArray(recipe.steps) ||
      recipe.steps.length < IMPORTER_TEST_MIN_STEPS) {
    issues.push(
        `Zu wenige Zubereitungsschritte: erwartet mind. ${IMPORTER_TEST_MIN_STEPS}, ` +
        `erhalten ${Array.isArray(recipe.steps) ? recipe.steps.length : 0}`,
    );
  } else if (recipe.steps.some((s) => !String(s || '').trim())) {
    issues.push('Mindestens ein Zubereitungsschritt ist leer');
  }

  return {valid: issues.length === 0, issues};
}

/**
 * Run a single named test and return a structured result.
 * The provided async function must resolve to { details: string } on success
 * and throw an error on failure.
 *
 * @param {string} name - Human-readable test name
 * @param {Function} fn - Async test function
 * @returns {Promise<{name: string, success: boolean, details: string, durationMs: number}>}
 */
async function runTest(name, fn) {
  const start = Date.now();
  try {
    const {details} = await fn();
    return {name, success: true, details, durationMs: Date.now() - start};
  } catch (err) {
    return {
      name,
      success: false,
      details: err.message || String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Execute all AI recipe importer tests.
 *
 * Unlike the previous version, tests 2–4 no longer call internal helper
 * functions directly — they go through the real deployed callables over
 * HTTPS with a genuine Firebase ID token, exactly like the web app and the
 * Apple Shortcut integration do. This means the nightly run now also catches
 * an IAM/Cloud-Run-Invoker misconfiguration or an auth-guard regression that
 * previously would have gone unnoticed (see issue #2611) — a
 * `callGeminiTextAPI` call from within the same process could never fail
 * that way.
 *
 * Tests covered:
 * 1. Konfiguration – Gemini API key present + prompt accessible
 * 2. fetchRecipeHtml (öffentliche Schnittstelle) – real HTTP fetch of a
 *    dedicated fixture page (importerTestFixturePage) through the deployed
 *    callable
 * 3. processHtmlWithAI (öffentliche Schnittstelle) – feeds test 2's fetched
 *    HTML into the deployed callable, so fetch + AI extraction are verified
 *    as one connected chain instead of two disjoint checks
 * 4. scanRecipeWithAI (öffentliche Schnittstelle) – the image/OCR import
 *    path, previously never exercised by this nightly run at all
 *
 * @param {string} apiKey - Gemini API key value
 * @param {string} webApiKey - Firebase Web API key value (for the ID-token exchange)
 * @returns {Promise<Array<{name: string, success: boolean, details: string, durationMs: number}>>}
 */
async function runAllImporterTests(apiKey, webApiKey) {
  const results = [];

  // Test 1: verify Gemini API key is present and prompt is loadable
  results.push(await runTest('Konfiguration (GEMINI_API_KEY & Prompt)', async () => {
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY-Secret ist nicht konfiguriert');
    }
    const prompt = await getAiRecipePromptForTest();
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('KI-Prompt ist leer oder nicht konfiguriert');
    }
    return {
      details:
        `API-Schlüssel vorhanden. Prompt geladen (${prompt.length} Zeichen).`,
    };
  }));

  // Mint one ID token up front and reuse it for tests 2–4. If this fails
  // (e.g. WEB_API_KEY missing), all three report the same clear
  // cause instead of three unrelated-looking errors.
  let idToken = null;
  let idTokenError = null;
  try {
    idToken = await mintImporterTestIdToken(webApiKey);
  } catch (err) {
    idTokenError = err.message || String(err);
  }

  // Test 2: real HTTP fetch of the fixture page via the public callable
  let fetchedHtml = null;
  results.push(await runTest('fetchRecipeHtml (öffentliche Schnittstelle)', async () => {
    if (idTokenError) throw new Error(`Kein Test-ID-Token: ${idTokenError}`);
    const fixtureUrl = `${CALLABLE_BASE_URL}/importerTestFixturePage`;
    const result = await callPublicCallable('fetchRecipeHtml', {url: fixtureUrl}, idToken);
    const html = result?.html || '';
    if (!html.includes('Rührei') || html.length < 200) {
      throw new Error(`Unerwarteter Seiteninhalt (${html.length} Zeichen empfangen)`);
    }
    fetchedHtml = html;
    return {details: `${html.length} Zeichen HTML über die öffentliche Callable geladen.`};
  }));

  // Test 3: pipe test 2's fetched HTML into processHtmlWithAI — a genuinely
  // connected fetch-then-extract chain, not two independent checks.
  results.push(await runTest('processHtmlWithAI (öffentliche Schnittstelle) – Fetch+Extraktion', async () => {
    if (idTokenError) throw new Error(`Kein Test-ID-Token: ${idTokenError}`);
    if (!fetchedHtml) throw new Error('Übersprungen: fetchRecipeHtml lieferte kein HTML (siehe Test oben)');
    const result = await callPublicCallable(
        'processHtmlWithAI', {rawHtml: fetchedHtml, language: 'de'}, idToken,
    );
    const {valid, issues} = validateImporterResult(result);
    if (!valid) throw new Error(`Validierungsfehler: ${issues.join('; ')}`);
    const ingredientCount = result.ingredients.length;
    const stepCount = result.steps.length;
    return {
      details:
        `Rezept "${result.title}" extrahiert – ` +
        `${ingredientCount} Zutaten, ${stepCount} Schritte.`,
    };
  }));

  // Test 4: image/OCR import path — previously never covered by this test.
  results.push(await runTest('scanRecipeWithAI (öffentliche Schnittstelle) – Bild-/OCR-Import', async () => {
    if (idTokenError) throw new Error(`Kein Test-ID-Token: ${idTokenError}`);
    const imageBase64 = await renderImporterTestRecipeImage();
    const result = await callPublicCallable(
        'scanRecipeWithAI', {imageBase64, language: 'de'}, idToken,
    );
    const {valid, issues} = validateImporterResult(result);
    if (!valid) throw new Error(`Validierungsfehler: ${issues.join('; ')}`);
    const ingredientCount = result.ingredients.length;
    const stepCount = result.steps.length;
    return {
      details:
        `Rezept "${result.title}" aus Testbild erkannt – ` +
        `${ingredientCount} Zutaten, ${stepCount} Schritte.`,
    };
  }));

  return results;
}

/**
 * Build the subject line, plain-text body and HTML body for the test result
 * e-mail that is sent to admins after each daily run.
 *
 * @param {Array<{name: string, success: boolean, details: string, durationMs: number}>} results
 * @param {string} runAt - Human-readable timestamp of the test run
 * @returns {{subject: string, text: string, html: string}}
 */
function buildTestResultEmailContent(results, runAt) {
  const totalCount = results.length;
  const passedCount = results.filter((r) => r.success).length;
  const failedCount = totalCount - passedCount;
  const allPassed = failedCount === 0;

  const subject = allPassed ?
    `✅ KI-Importer-Test: Alle ${totalCount} Tests erfolgreich (${runAt})` :
    `❌ KI-Importer-Test: ${failedCount} von ${totalCount} Tests fehlgeschlagen (${runAt})`;

  // ---- Plain-text body ----
  let text = `KI-Rezeptimporter – Täglicher Testbericht\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Ergebnis: ${passedCount}/${totalCount} Tests bestanden\n\n`;
  for (const r of results) {
    text += `${r.success ? '✅' : '❌'} ${r.name}\n`;
    text += `   ${r.details}\n`;
    text += `   Dauer: ${r.durationMs} ms\n\n`;
  }
  if (!allPassed) {
    text += `\nBitte prüfen Sie die fehlgeschlagenen Tests.\n`;
    text += `Logs: https://console.firebase.google.com/project/_/functions/logs\n`;
  }

  // ---- HTML body ----
  const statusColor = allPassed ? '#2e7d32' : '#c62828';
  const statusText = allPassed ?
    `Alle ${totalCount} Tests bestanden` :
    `${failedCount} von ${totalCount} Tests fehlgeschlagen`;

  let rowsHtml = '';
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    const rowBg = r.success ? '#f1f8e9' : '#ffebee';
    rowsHtml +=
      `<tr style="background:${rowBg}">` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee">` +
        `${icon} ${escapeHtml(r.name)}</td>` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee">` +
        `${escapeHtml(r.details)}</td>` +
      `<td style="padding:8px 12px;border-bottom:1px solid #eee;` +
        `text-align:right">${r.durationMs} ms</td>` +
      `</tr>`;
  }

  const logsLinkHtml = allPassed ? '' :
    `<p><a href="https://console.firebase.google.com/project/_/functions/logs">` +
    `Firebase-Logs öffnen</a></p>`;

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:700px">` +
    `<h2 style="color:${statusColor}">` +
      `KI-Rezeptimporter – Täglicher Testbericht</h2>` +
    `<p><strong>Ausgeführt:</strong> ${escapeHtml(runAt)}</p>` +
    `<p style="color:${statusColor};font-weight:bold">` +
      `${escapeHtml(statusText)}</p>` +
    `<table style="width:100%;border-collapse:collapse;margin-top:16px">` +
    `<thead><tr style="background:#f5f5f5">` +
    `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Test</th>` +
    `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Details</th>` +
    `<th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Dauer</th>` +
    `</tr></thead>` +
    `<tbody>${rowsHtml}</tbody>` +
    `</table>` +
    logsLinkHtml +
    `</div>`;

  return {subject, text, html};
}

/**
 * Scheduled Cloud Function: run daily AI recipe importer self-tests and send
 * a summary e-mail to all admin users.
 *
 * Schedule: every day at 06:00 Europe/Berlin (MEZ/MESZ).
 *
 * The function can be disabled without redeployment by setting
 *   dailyImporterTestEnabled: false
 * in the `settings/app` Firestore document. Remove the field (or set it to
 * true) to re-enable the tests.
 *
 * Secrets required (same as other email-sending functions):
 *   GEMINI_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 */
exports.dailyAiImporterTest = onSchedule(
    {
      schedule: '0 6 * * *',
      timeZone: 'Europe/Berlin',
      secrets: [geminiApiKey, firebaseWebApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      memory: '512MiB',
      timeoutSeconds: 420,
    },
    async (_event) => {
      const runAt = new Date().toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
      console.log(`dailyAiImporterTest: starting test run at ${runAt}`);

      // Check whether the feature is enabled via Firestore configuration
      try {
        const db = admin.firestore();
        const settingsDoc = await db.collection('settings').doc('app').get();
        if (settingsDoc.exists && settingsDoc.data().dailyImporterTestEnabled === false) {
          console.log('dailyAiImporterTest: disabled via settings/app, skipping');
          return;
        }
      } catch (cfgErr) {
        console.warn('dailyAiImporterTest: could not read settings, proceeding:', cfgErr);
      }

      // Run all importer tests
      const apiKeyVal = geminiApiKey.value();
      const webApiKeyVal = firebaseWebApiKey.value();
      let results;
      try {
        results = await runAllImporterTests(apiKeyVal, webApiKeyVal);
      } catch (runErr) {
        console.error('dailyAiImporterTest: unexpected error running tests:', runErr);
        results = [{
          name: 'Test-Ausführung',
          success: false,
          details: `Unerwarteter Fehler: ${runErr.message}`,
          durationMs: 0,
        }];
      }

      const passedCount = results.filter((r) => r.success).length;
      console.log(
          `dailyAiImporterTest: ${passedCount}/${results.length} tests passed`,
      );

      // Collect admin e-mail addresses from Firestore
      const db = admin.firestore();
      const usersSnapshot = await db
          .collection('users').where('role', '==', 'admin').get();
      const adminEmails = [];
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.email) adminEmails.push(data.email);
      });

      if (adminEmails.length === 0) {
        console.log('dailyAiImporterTest: no admin emails found, skipping email');
        return;
      }

      // Verify SMTP configuration
      const smtpHostVal = smtpHost.value();
      const smtpPortVal = smtpPort.value();
      const smtpUserVal = smtpUser.value();
      const smtpPasswordVal = smtpPassword.value();
      const smtpFromVal = smtpFrom.value();

      if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
        console.warn('dailyAiImporterTest: SMTP not fully configured – skipping email');
        return;
      }

      const smtpPortNum = parseInt(smtpPortVal || '587', 10);
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHostVal,
        port: smtpPortNum,
        secure: smtpPortNum === 465,
        auth: {user: smtpUserVal, pass: smtpPasswordVal},
      });

      const {subject, text, html} = buildTestResultEmailContent(results, runAt);

      try {
        await transporter.sendMail({
          from: smtpFromVal,
          bcc: adminEmails.join(', '),
          subject,
          text,
          html,
        });
        console.log(
            `dailyAiImporterTest: email sent to ${adminEmails.length} admin(s)`,
        );
      } catch (mailErr) {
        console.error('dailyAiImporterTest: error sending email:', mailErr);
      }
    },
);

/**
 * Scheduled Cloud Function: deletes expired Reel/video import protocol
 * entries from failedWebImports (see writeImportProtocolEntry) — only
 * entries logged for a *successful* import carry an expiresAt (7 days out);
 * failed entries have none and are never matched by this query, so they're
 * kept indefinitely for developer review, same as the pre-existing
 * dismissed-web-import log this collection already held.
 */
exports.nightlyImportProtocolCleanup = onSchedule(
    {
      schedule: '30 1 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const now = admin.firestore.Timestamp.now();
      const snapshot = await db.collection('failedWebImports')
          .where('expiresAt', '<=', now)
          .get();

      if (snapshot.empty) {
        console.log('nightlyImportProtocolCleanup: no expired protocol entries found');
        return;
      }

      let deletedCount = 0;
      let batch = db.batch();
      let operationCount = 0;

      for (const docSnap of snapshot.docs) {
        batch.delete(docSnap.ref);
        operationCount += 1;
        if (operationCount >= 450) {
          await batch.commit();
          deletedCount += operationCount;
          batch = db.batch();
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        deletedCount += operationCount;
      }

      console.log(`nightlyImportProtocolCleanup: deleted ${deletedCount} expired import protocol entr${deletedCount === 1 ? 'y' : 'ies'}`);
    },
);

/**
 * Threshold above which a queued/processing (or already-failed-but-
 * retryable) import job with a stale importHeartbeatAt is considered
 * orphaned and eligible for server-side recovery. Must stay comfortably
 * above the longest-running import Cloud Function timeout (180s —
 * scanRecipesWithAI / scrapeInstagramReel) so this sweeper never restarts a
 * job while its original attempt could still be legitimately in flight.
 * Deliberately NOT the client's STALE_JOB_MS (60s, RecipeImportQueueContext.js)
 * — that threshold is tuned for same-tab/other-open-tab recovery between
 * live clients, not for restarting a job whose Cloud Function call may
 * still be running.
 */
const STUCK_IMPORT_JOB_MS = 300000; // 5 minutes

/** Maximum number of stuck import jobs redriven per sweeper run. */
const MAX_STUCK_IMPORT_JOBS_PER_RUN = 20;

/** Maximum number of run attempts (fresh + restarts) before giving up for good. */
const MAX_IMPORT_ATTEMPTS = 3;

/**
 * Scheduled Cloud Function: recover background-import jobs (recipes/{id}
 * with isTemp:true and an importStatus) that got stuck because the client
 * tab that owned them closed, reloaded, or crashed before finishing — the
 * only recovery path today is RecipeImportQueueContext's orphan-recovery
 * effect, which only runs while some tab is open. This sweeper redrives the
 * same jobs entirely server-side via runImportFromSource, independent of any
 * open tab.
 *
 * Also redrives jobs already in importStatus:'error' when their
 * importErrorKind is 'retryable' (see failImportJob/classifyImportErrorKind)
 * — jobs classified 'permanent' are left for the user's own "Neu starten".
 *
 * Schedule: every 10 minutes.
 */
exports.recoverStuckImportJobs = onSchedule(
    {
      schedule: '*/10 * * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 540,
      secrets: [geminiApiKey],
    },
    async (_event) => {
      const db = admin.firestore();
      const cutoff = Date.now() - STUCK_IMPORT_JOB_MS;

      const snapshot = await db.collection('recipes')
          .where('isTemp', '==', true)
          .where('importStatus', 'in', ['queued', 'processing', 'error'])
          .where('importHeartbeatAt', '<', cutoff)
          .limit(MAX_STUCK_IMPORT_JOBS_PER_RUN)
          .get();

      if (snapshot.empty) {
        console.log('recoverStuckImportJobs: nichts zu tun (keine liegengebliebenen Importe gefunden)');
        return;
      }

      let restarted = 0;
      let abandoned = 0;

      for (const docSnap of snapshot.docs) {
        const jobId = docSnap.id;
        const data = docSnap.data() || {};
        const authorId = data.authorId || 'unknown';
        const attempts = data.importAttempts || 0;
        const wasError = data.importStatus === 'error';

        if (wasError && data.importErrorKind !== 'retryable') {
          // Permanent failure (or a legacy error doc from before
          // importErrorKind existed) – leave it for the user's own "Neu
          // starten" action, don't touch it here.
          continue;
        }

        if (!data.importSource) {
          const error = new Error('Import kann nicht wiederhergestellt werden: keine importSource gespeichert');
          error.code = 'failed-precondition';
          await failImportJobBackground(jobId, authorId, error);
          abandoned++;
          continue;
        }

        const reelMeta = isReelImportSource(data.importSource) ?
          {steps: [], source: data.importSource} :
          undefined;

        if (attempts >= MAX_IMPORT_ATTEMPTS) {
          const error = new Error(`Import endgültig fehlgeschlagen nach ${attempts} Versuchen`);
          error.code = 'failed-precondition';
          await failImportJobBackground(jobId, authorId, error, reelMeta);
          abandoned++;
          continue;
        }

        // Claim the job (heartbeat + attempt count) before doing any work,
        // so the next tick 10 minutes from now doesn't pick the same doc
        // again while this attempt is still running.
        await docSnap.ref.update({
          importStatus: 'processing',
          importHeartbeatAt: Date.now(),
          importAttempts: attempts + 1,
          ...(wasError ? {
            importError: admin.firestore.FieldValue.delete(),
            importErrorKind: admin.firestore.FieldValue.delete(),
          } : {}),
        });

        try {
          const result = await runImportFromSource(
              data.importSource, authorId, jobId, reelMeta && reelMeta.steps,
          );
          await finalizeImportJobBackground(jobId, authorId, result, reelMeta);
          restarted++;
        } catch (error) {
          console.error(`recoverStuckImportJobs: job ${jobId} failed`, error);
          await failImportJobBackground(jobId, authorId, error, reelMeta);
          abandoned++;
        }
      }

      console.log(
          `recoverStuckImportJobs: geprüft=${snapshot.size} neu gestartet=${restarted} aufgegeben=${abandoned}`,
      );
    },
);
