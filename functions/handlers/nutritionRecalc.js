/**
 * nutritionRecalc: aus index.js ausgelagert (Tech-Check F2).
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const {evaluateLowCarbTag} = require('../lowCarb');
const {fetchFirestoreDailyUsage, buildFirestoreUsageSection} = require('../firestoreUsage');
const {NUTRITION_REFERENCE_COLLECTION, calculateNutritionFromOpenFoodFactsCore} = require('../shared/nutritionCore');
const {smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom, geminiApiKey} = require('../shared/secrets');

function extractRecipeIngredientItems(recipeData = {}) {
  const rawIngredients = Array.isArray(recipeData?.zutaten) ?
    recipeData.zutaten :
    (Array.isArray(recipeData?.ingredients) ? recipeData.ingredients : []);

  return rawIngredients
      .map((item) => (typeof item === 'string' ? {text: item} : item))
      .filter((item) => item && item.type !== 'heading')
      .filter((item) => item.ignoreNutritionCalculation !== true)
      .map((item) => ({
        ...item,
        text: String(item.text || '').trim(),
      }))
      .filter((item) => item.text !== '');
}

function toMilliseconds(date) {
  if (date == null) return null;
  if (date?.toMillis) return date.toMillis();
  if (date instanceof Date) return date.getTime();
  if (typeof date === 'number') return date;
  return null;
}

function recipeUsesRecalcIngredient(recipeData = {}, recalcIngredientMap = new Map()) {
  if (!recalcIngredientMap || recalcIngredientMap.size === 0) return false;
  const calcCompletedAt = recipeData?.naehrwerte?.calcCompletedAt ?? null;
  if (calcCompletedAt == null) return false; // noch nie berechnet → nicht im Recalc-Job
  const ingredientItems = extractRecipeIngredientItems(recipeData);
  return ingredientItems.some((item) => {
    const ingredientID = String(item.ingredientID || '').trim();
    if (!ingredientID || !recalcIngredientMap.has(ingredientID)) return false;
    const recalcDate = recalcIngredientMap.get(ingredientID);
    if (recalcDate == null) return true; // kein recalcDate → immer recalculieren
    const recalcDateMs = toMilliseconds(recalcDate);
    if (recalcDateMs == null) return true;
    return recalcDateMs > calcCompletedAt;
  });
}

function escapeNutritionRecalcHtml(value) {
  return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/**
 * Wording for a recipe whose "Low Carb" tag the recalc changed. Returns null
 * for recipes the recalc left tagged as they were, so they read unchanged in
 * the report.
 *
 * @param {string|undefined} action - The action evaluateLowCarbTag reported.
 * @return {string|null} The label, or null when there is nothing to say.
 */
function nutritionRecalcLowCarbLabel(action) {
  if (action === 'added') return 'Low Carb ergänzt';
  if (action === 'removed') return 'Low Carb entfernt';
  // 'unchanged' only reaches the report when a duplicate tag was cleaned up.
  if (action === 'unchanged') return 'Low Carb bereinigt';
  return null;
}

function buildNutritionRecalcSummaryMail(report, runAt, usageSection = null) {
  const updatedCount = report.updatedRecipes.length;
  const failedCount = report.failedRecipes.length;
  const skippedCount = report.skippedRecipes.length;
  const totalAffected = report.affectedRecipeCount;
  const lowCarbAddedCount = report.updatedRecipes
      .filter((entry) => entry.lowCarbAction === 'added').length;
  const lowCarbRemovedCount = report.updatedRecipes
      .filter((entry) => entry.lowCarbAction === 'removed').length;
  const status = failedCount === 0 && !report.fatalError ? '✅ Erfolgreich' : '⚠️ Mit Fehlern';
  const subject = `[RecipeBook] Nährwert-Recalc ${status} (${runAt})`;

  let text = `Nährwert-Recalc Bericht\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Trigger: ${report.triggeredBy}\n`;
  text += `Betroffene Rezepte: ${totalAffected}\n`;
  text += `Aktualisiert: ${updatedCount}\n`;
  text += `Übersprungen: ${skippedCount}\n`;
  text += `Fehlgeschlagen: ${failedCount}\n`;
  text += `recalc zurückgesetzt: ${report.resetRecalcCount}\n`;
  text += `Low Carb ergänzt: ${lowCarbAddedCount}\n`;
  text += `Low Carb entfernt: ${lowCarbRemovedCount}\n`;
  if (report.fatalError) {
    text += `\nFataler Fehler: ${report.fatalError}\n`;
  }
  if (updatedCount > 0) {
    text += `\nAktualisierte Rezepte:\n`;
    report.updatedRecipes.forEach((entry) => {
      const lowCarbLabel = nutritionRecalcLowCarbLabel(entry.lowCarbAction);
      text += `- ${entry.title} (${entry.recipeId})${lowCarbLabel ? ` – ${lowCarbLabel}` : ''}\n`;
    });
  }
  if (failedCount > 0) {
    text += `\nFehlgeschlagene Rezepte:\n`;
    report.failedRecipes.forEach((entry) => {
      text += `- ${entry.title} (${entry.recipeId}): ${entry.error}\n`;
    });
  }
  if (usageSection) {
    text += usageSection.text;
  }

  const htmlList = (entries, formatter) => {
    if (!entries || entries.length === 0) return '<p>Keine</p>';
    return `<ul>${entries.map((entry) => `<li>${formatter(entry)}</li>`).join('')}</ul>`;
  };

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px">
      <h2>Nährwert-Recalc Bericht</h2>
      <p><strong>Ausgeführt:</strong> ${escapeNutritionRecalcHtml(runAt)}</p>
      <p><strong>Trigger:</strong> ${escapeNutritionRecalcHtml(report.triggeredBy)}</p>
      <p><strong>Betroffene Rezepte:</strong> ${totalAffected}</p>
      <p><strong>Aktualisiert:</strong> ${updatedCount}</p>
      <p><strong>Übersprungen:</strong> ${skippedCount}</p>
      <p><strong>Fehlgeschlagen:</strong> ${failedCount}</p>
      <p><strong>recalc zurückgesetzt:</strong> ${report.resetRecalcCount}</p>
      <p><strong>Low Carb ergänzt:</strong> ${lowCarbAddedCount}</p>
      <p><strong>Low Carb entfernt:</strong> ${lowCarbRemovedCount}</p>
      ${report.fatalError ? `<p style="color:#c62828"><strong>Fataler Fehler:</strong> ${escapeNutritionRecalcHtml(report.fatalError)}</p>` : ''}
      <h3>Aktualisierte Rezepte</h3>
      ${htmlList(report.updatedRecipes, (entry) => {
    const lowCarbLabel = nutritionRecalcLowCarbLabel(entry.lowCarbAction);
    return `${escapeNutritionRecalcHtml(entry.title)} (${escapeNutritionRecalcHtml(entry.recipeId)})` +
      (lowCarbLabel ? ` &ndash; <strong>${escapeNutritionRecalcHtml(lowCarbLabel)}</strong>` : '');
  })}
      <h3>Fehlgeschlagene Rezepte</h3>
      ${htmlList(report.failedRecipes, (entry) => `${escapeNutritionRecalcHtml(entry.title)} (${escapeNutritionRecalcHtml(entry.recipeId)}): ${escapeNutritionRecalcHtml(entry.error)}`)}
      ${usageSection ? usageSection.html : ''}
    </div>
  `;

  return {subject, text, html};
}

/**
 * Mails a report to every admin user. Shared by the nutrition recalc and the
 * low-carb full pass, so the admin lookup, the SMTP guard and the transporter
 * exist once rather than once per job.
 *
 * @param {Object} mail - The message.
 * @param {string} mail.subject - Subject line.
 * @param {string} mail.text - Plain-text body.
 * @param {string} mail.html - HTML body.
 * @param {string} mail.logLabel - Job name for the console messages.
 * @return {Promise<boolean>} Whether a mail was actually sent.
 */
async function sendAdminReportMail({subject, text, html, logLabel}) {
  const db = admin.firestore();
  const usersSnapshot = await db.collection('users').where('role', '==', 'admin').get();
  const adminEmails = [];
  usersSnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.email) adminEmails.push(data.email);
  });

  if (adminEmails.length === 0) {
    console.log(`${logLabel}: no admin emails found, skipping email`);
    return false;
  }

  const smtpHostVal = smtpHost.value();
  const smtpPortVal = smtpPort.value();
  const smtpUserVal = smtpUser.value();
  const smtpPasswordVal = smtpPassword.value();
  const smtpFromVal = smtpFrom.value();
  if (!smtpHostVal || !smtpUserVal || !smtpPasswordVal || !smtpFromVal) {
    console.warn(`${logLabel}: SMTP not fully configured – skipping email`);
    return false;
  }

  const smtpPortNum = parseInt(smtpPortVal || '587', 10);
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtpHostVal,
    port: smtpPortNum,
    secure: smtpPortNum === 465,
    auth: {user: smtpUserVal, pass: smtpPasswordVal},
  });

  await transporter.sendMail({
    from: smtpFromVal,
    bcc: adminEmails.join(', '),
    subject,
    text,
    html,
  });
  return true;
}

/**
 * Firestore-Nutzung für den Recalc-Bericht. Schlägt nie fehl: ohne
 * Monitoring-Berechtigung oder bei einem Fehler steht ein Hinweis im Bericht.
 *
 * @return {Promise<{text: string, html: string}>}
 */
async function loadFirestoreUsageSection() {
  try {
    const rows = await fetchFirestoreDailyUsage({
      projectId: process.env.GCLOUD_PROJECT || admin.app().options.projectId,
      getAccessToken: () => admin.credential.applicationDefault().getAccessToken(),
    });
    return buildFirestoreUsageSection({rows});
  } catch (error) {
    console.warn('loadFirestoreUsageSection: Firestore-Nutzung nicht verfügbar:', error.message);
    return buildFirestoreUsageSection({error: error.message, status: error.status});
  }
}

async function sendNutritionRecalcSummary(report) {
  const runAt = new Date(report.finishedAt || Date.now()).toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
  const usageSection = await loadFirestoreUsageSection();
  const mailContent = buildNutritionRecalcSummaryMail(report, runAt, usageSection);
  await sendAdminReportMail({
    subject: mailContent.subject,
    text: mailContent.text,
    html: mailContent.html,
    logLabel: 'runNutritionRecalcForFlaggedRecipes',
  });
}

async function setRecalcFalseForReferences(referenceDocs = []) {
  if (!Array.isArray(referenceDocs) || referenceDocs.length === 0) {
    return 0;
  }
  const db = admin.firestore();
  let updatedCount = 0;
  let batch = db.batch();
  let operationCount = 0;

  for (const docSnap of referenceDocs) {
    batch.update(docSnap.ref, {recalc: false});
    operationCount += 1;
    if (operationCount >= 450) {
      await batch.commit();
      updatedCount += operationCount;
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    updatedCount += operationCount;
  }

  return updatedCount;
}

async function runNutritionRecalcForFlaggedRecipesCore({triggeredBy = 'schedule'} = {}) {
  const db = admin.firestore();
  const report = {
    triggeredBy,
    startedAt: Date.now(),
    finishedAt: null,
    affectedRecipeCount: 0,
    updatedRecipes: [],
    failedRecipes: [],
    skippedRecipes: [],
    resetRecalcCount: 0,
    fatalError: null,
  };

  let recalcReferenceDocs = [];
  try {
    const recalcSnapshot = await db
        .collection(NUTRITION_REFERENCE_COLLECTION)
        .where('recalc', '==', true)
        .get();
    recalcReferenceDocs = recalcSnapshot.docs;

    const recalcIngredientMap = new Map(
        recalcSnapshot.docs
            .map((docSnap) => {
              const data = docSnap.data() || {};
              const ingredientID = String(data?.ingredientID || docSnap.id || '').trim();
              if (!ingredientID) return null;
              return [ingredientID, data?.recalcDate ?? null];
            })
            .filter(Boolean)
    );

    if (recalcIngredientMap.size === 0) {
      console.log('runNutritionRecalcForFlaggedRecipes: no recalc ingredientIDs found');
      return report;
    }

    const recipesSnapshot = await db.collection('recipes').get();
    const affectedRecipes = recipesSnapshot.docs.filter((recipeDoc) =>
      recipeUsesRecalcIngredient(recipeDoc.data() || {}, recalcIngredientMap)
    );
    report.affectedRecipeCount = affectedRecipes.length;

    for (const recipeDoc of affectedRecipes) {
      const recipeData = recipeDoc.data() || {};
      const recipeTitle = String(recipeData.title || recipeDoc.id);
      const ingredientItems = extractRecipeIngredientItems(recipeData);
      const regularIngredients = ingredientItems
          .map((item) => item.text)
          .filter((text) => !/#recipe:[^:]+:/i.test(text));
      const skippedRecipeLinkIngredients = ingredientItems
          .filter((item) => /#recipe:[^:]+:/i.test(item.text))
          .map((item) => item.text);

      if (regularIngredients.length === 0) {
        report.skippedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          reason: 'Keine berechenbaren Zutaten',
        });
        continue;
      }

      try {
        const calcResult = await calculateNutritionFromOpenFoodFactsCore({
          ingredients: regularIngredients,
          portionen: Number(recipeData.portionen) > 0 ? Number(recipeData.portionen) : 1,
          callerLabel: `nightly job (${recipeDoc.id})`,
          calcYieldGrams: recipeData?.naehrwerte?.calcYieldGrams ?? null,
          calcYieldFactor: recipeData?.naehrwerte?.calcYieldFactor ?? null,
        });
        const notIncluded = calcResult.details
            .filter((entry) => entry.found === false)
            .map((entry) => ({
              ingredient: entry.ingredient,
              error: entry.error || 'Nicht gefunden',
            }));
        skippedRecipeLinkIngredients.forEach((ingredient) => {
          notIncluded.push({
            ingredient,
            error: 'Rezept-Link konnte im Nachtjob nicht automatisch aufgelöst werden.',
            isRecipeLink: true,
          });
        });

        const updatedNaehrwerte = {
          ...(recipeData.naehrwerte || {}),
          ...calcResult.naehrwerte,
          calcPending: false,
          calcCompletedAt: Date.now(),
          calcError: null,
          calcNotIncluded: notIncluded.length > 0 ? notIncluded : null,
          calcFoundCount: calcResult.foundCount,
          calcTotalCount: calcResult.totalCount + skippedRecipeLinkIngredients.length,
          calcYieldGrams: recipeData?.naehrwerte?.calcYieldGrams ?? null,
          calcYieldFactor: recipeData?.naehrwerte?.calcYieldFactor ?? null,
          calcFinalWeightGrams: calcResult.calcFinalWeightGrams ?? null,
          calcPer100g: calcResult.calcPer100g ?? null,
        };

        // The nutrition figures have just changed, so the low-carb verdict may
        // have changed with them. Judged on the values about to be written, in
        // the same set() - no second read, no second write.
        const lowCarb = evaluateLowCarbTag({
          ...recipeData,
          naehrwerte: updatedNaehrwerte,
        });

        await recipeDoc.ref.set({
          naehrwerte: updatedNaehrwerte,
          ...(lowCarb.changed ? {kulinarik: lowCarb.kulinarik} : {}),
        }, {merge: true});

        report.updatedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          ...(lowCarb.changed ? {lowCarbAction: lowCarb.action} : {}),
        });
      } catch (error) {
        const errorMessage = error?.message || 'Unbekannter Fehler';
        report.failedRecipes.push({
          recipeId: recipeDoc.id,
          title: recipeTitle,
          error: errorMessage,
        });
        try {
          await recipeDoc.ref.set({
            naehrwerte: {
              ...(recipeData.naehrwerte || {}),
              calcPending: false,
              calcCompletedAt: Date.now(),
              calcError: errorMessage,
            },
          }, {merge: true});
        } catch (persistError) {
          console.error(`runNutritionRecalcForFlaggedRecipes: could not persist calcError for ${recipeDoc.id}`, persistError);
        }
      }
    }
  } catch (error) {
    report.fatalError = error?.message || 'Unbekannter Fehler im Nachtjob';
    console.error('runNutritionRecalcForFlaggedRecipes: fatal error', error);
  } finally {
    try {
      if (!report.fatalError && report.failedRecipes.length === 0) {
        report.resetRecalcCount = await setRecalcFalseForReferences(recalcReferenceDocs);
      }
    } catch (resetError) {
      report.fatalError = report.fatalError || `recalc-Reset fehlgeschlagen: ${resetError?.message || resetError}`;
      console.error('runNutritionRecalcForFlaggedRecipes: could not reset recalc flags', resetError);
    }
    report.finishedAt = Date.now();
    try {
      await sendNutritionRecalcSummary(report);
    } catch (mailError) {
      console.error('runNutritionRecalcForFlaggedRecipes: could not send summary email', mailError);
    }
  }

  return report;
}

exports.runNutritionRecalcForFlaggedRecipes = onCall(
    {
      timeoutSeconds: 10,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      invoker: 'public',
    },
    async (request) => {
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }

      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      const callerData = callerDoc.exists ? (callerDoc.data() || {}) : {};
      const canRunManualRecalc = (
        callerData.role === 'admin' ||
        callerData.role === 'moderator'
      );
      if (!canRunManualRecalc) {
        throw new HttpsError('permission-denied', 'Admin or moderator role required.');
      }

      // Nur den Auftrag anlegen: Arbeit nach der Antwort eines Callables
      // drosselt Cloud Run fast auf null und darf sie jederzeit beenden.
      // processNutritionRecalcRequest führt ihn mit voller Laufzeit aus.
      await admin.firestore().collection('jobRequests').add({
        type: 'nutritionRecalc',
        triggeredBy: `manual:${callerUid}`,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        started: true,
        message: 'Recalc-Job gestartet. Ergebnis wird per E-Mail gesendet.',
      };
    }
);

/**
 * Führt einen manuell angeforderten Nährwert-Recalc aus (Auftrag aus
 * runNutritionRecalcForFlaggedRecipes). Der Trigger wartet bis zum Ende des
 * Jobs und behält dadurch die volle Rechenzeit, wie der Nachtlauf. Der
 * Auftrag wird danach gelöscht; Ergebnis und Fehler stehen in der Mail.
 */
exports.processNutritionRecalcRequest = onDocumentCreated(
    {
      document: 'jobRequests/{requestId}',
      timeoutSeconds: 540,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async (event) => {
      const data = event.data ? event.data.data() : null;
      if (!data || data.type !== 'nutritionRecalc') return;
      try {
        await runNutritionRecalcForFlaggedRecipesCore({triggeredBy: data.triggeredBy || 'manual'});
      } finally {
        await event.data.ref.delete().catch((err) => {
          console.error('processNutritionRecalcRequest: could not delete job request', err);
        });
      }
    },
);

exports.nightlyNutritionRecalc = onSchedule(
    {
      schedule: '0 2 * * *',
      timeZone: 'Europe/Berlin',
      timeoutSeconds: 540,
      maxInstances: 1,
      secrets: [geminiApiKey, smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
    },
    async () => {
      await runNutritionRecalcForFlaggedRecipesCore({triggeredBy: 'schedule'});
    }
);

/**
 * Applies the low-carb rules to every recipe in the collection - the one-time
 * full pass that gives the tag to the recipes nothing has touched since the
 * rules were introduced.
 *
 * Unlike the nutrition recalc this reads the stored values and does no
 * arithmetic of its own beyond evaluateLowCarbTag: no external lookups, no
 * recalculation, no e-mail. That makes it cheap enough to run inside the
 * request and hand the numbers straight back to the caller.
 *
 * Idempotent: a recipe whose tag is already correct produces no write at all,
 * so a second run touches nothing.
 *
 * @return {Promise<Object>} Counters describing what happened.
 */
/**
 * How many recipes each section of the low-carb report mail lists before it
 * falls back to a count. A mailbox is not a database export; on a large
 * collection the "skipped" section alone would otherwise run into thousands
 * of lines.
 */
const LOW_CARB_MAIL_LIST_LIMIT = 100;

/**
 * @param {number|null} value - A number for the report.
 * @param {number} digits - Decimal places.
 * @return {string} The formatted number, or a dash when there is none.
 */
function formatLowCarbNumber(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ?
    value.toFixed(digits) :
    '-';
}

/**
 * The numbers a verdict rested on, as one readable phrase.
 *
 * @param {Object} entry - A report entry.
 * @return {string} e.g. "12.0 % Energie aus KH, 30.0 g KH/Portion (2 Portionen, Basis: per100g)".
 */
function formatLowCarbEntryNumbers(entry) {
  return `${formatLowCarbNumber(entry.energyPercent)} % Energie aus KH, ` +
    `${formatLowCarbNumber(entry.carbsPerPortionG)} g KH/Portion ` +
    `(${entry.portionen} Portion(en), Basis: ${entry.basisSource})`;
}

/**
 * Builds the report mail for the low-carb full pass.
 *
 * @param {Object} report - What runLowCarbFullTaggingCore returned, plus
 *   triggeredBy and finishedAt.
 * @param {string} runAt - Localised timestamp for the header.
 * @return {{subject: string, text: string, html: string}} The message.
 */
function buildLowCarbTaggingMail(report, runAt) {
  const status = report.failed === 0 ? '✅ Erfolgreich' : '⚠️ Mit Fehlern';
  const subject = `[RecipeBook] Low-Carb-Klassifikation ${status} (${runAt})`;

  const judged = report.basisCounts.per100g + report.basisCounts.total;
  const basisNote = report.basisCounts.total > 0 ?
    `${report.basisCounts.total} von ${judged} bewerteten Rezepten wurden auf Basis der ` +
    'gespeicherten Gesamtwerte beurteilt statt auf Basis der eindeutigen 100-g-Werte. ' +
    'Bei diesen hängt das Ergebnis davon ab, welcher Schreibweg die Nährwerte zuletzt ' +
    'gesetzt hat – ein hoher Anteil ist ein Grund, die Werte stichprobenartig zu prüfen.' :
    'Alle bewerteten Rezepte wurden auf Basis der eindeutigen 100-g-Werte beurteilt.';

  const textSection = (heading, entries, formatter) => {
    if (!entries || entries.length === 0) return '';
    const shown = entries.slice(0, LOW_CARB_MAIL_LIST_LIMIT);
    let out = `\n${heading} (${entries.length}):\n`;
    shown.forEach((entry) => {
      out += `- ${formatter(entry)}\n`;
    });
    if (entries.length > shown.length) {
      out += `- ... und ${entries.length - shown.length} weitere\n`;
    }
    return out;
  };

  let text = `Low-Carb-Klassifikation\n`;
  text += `Ausgeführt: ${runAt}\n`;
  text += `Ausgelöst von: ${report.triggeredBy}\n`;
  text += `Rezepte gesamt: ${report.total}\n`;
  text += `Neu Low Carb: ${report.added}\n`;
  text += `Tag entfernt: ${report.removed}\n`;
  text += `Unverändert: ${report.unchanged}\n`;
  text += `Übersprungen: ${report.skipped} (unvollständige Nährwerte)\n`;
  text += `Geschrieben: ${report.written}\n`;
  text += `Fehler: ${report.failed}\n`;
  text += `\nRechengrundlage: ${report.basisCounts.per100g} x 100-g-Werte, `;
  text += `${report.basisCounts.total} x Gesamtwerte\n${basisNote}\n`;

  text += textSection(
      'Neu als Low Carb getaggt',
      report.addedRecipes,
      (entry) => `${entry.title} (${entry.recipeId}): ${formatLowCarbEntryNumbers(entry)}`
  );
  text += textSection(
      'Tag entfernt',
      report.removedRecipes,
      (entry) => `${entry.title} (${entry.recipeId}): ${formatLowCarbEntryNumbers(entry)}`
  );
  text += textSection(
      'Übersprungen',
      report.skippedRecipes,
      (entry) => `${entry.title} (${entry.recipeId}): ${entry.reason}`
  );
  text += textSection(
      'Fehler',
      report.failedRecipes,
      (entry) => `${entry.recipeId}: ${entry.error}`
  );

  const htmlSection = (heading, entries, formatter) => {
    if (!entries || entries.length === 0) return '';
    const shown = entries.slice(0, LOW_CARB_MAIL_LIST_LIMIT);
    const items = shown.map((entry) => `<li>${formatter(entry)}</li>`).join('');
    const more = entries.length > shown.length ?
      `<li>... und ${entries.length - shown.length} weitere</li>` :
      '';
    return `<h3>${escapeNutritionRecalcHtml(heading)} (${entries.length})</h3><ul>${items}${more}</ul>`;
  };

  const htmlRecipe = (entry) =>
    `<strong>${escapeNutritionRecalcHtml(entry.title)}</strong> ` +
    `(${escapeNutritionRecalcHtml(entry.recipeId)})<br>` +
    `<small>${escapeNutritionRecalcHtml(formatLowCarbEntryNumbers(entry))}</small>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px">
      <h2>Low-Carb-Klassifikation</h2>
      <p><strong>Ausgeführt:</strong> ${escapeNutritionRecalcHtml(runAt)}</p>
      <p><strong>Ausgelöst von:</strong> ${escapeNutritionRecalcHtml(report.triggeredBy)}</p>
      <p><strong>Rezepte gesamt:</strong> ${report.total}</p>
      <p><strong>Neu Low Carb:</strong> ${report.added}</p>
      <p><strong>Tag entfernt:</strong> ${report.removed}</p>
      <p><strong>Unverändert:</strong> ${report.unchanged}</p>
      <p><strong>Übersprungen:</strong> ${report.skipped} (unvollständige Nährwerte)</p>
      <p><strong>Geschrieben:</strong> ${report.written}</p>
      <p><strong>Fehler:</strong> ${report.failed}</p>
      <p style="background:#f5f5f5;padding:12px;border-radius:6px">
        <strong>Rechengrundlage:</strong>
        ${report.basisCounts.per100g} x 100-g-Werte, ${report.basisCounts.total} x Gesamtwerte<br>
        <small>${escapeNutritionRecalcHtml(basisNote)}</small>
      </p>
      ${htmlSection('Neu als Low Carb getaggt', report.addedRecipes, htmlRecipe)}
      ${htmlSection('Tag entfernt', report.removedRecipes, htmlRecipe)}
      ${htmlSection('Übersprungen', report.skippedRecipes, (entry) =>
    `${escapeNutritionRecalcHtml(entry.title)} ` +
        `(${escapeNutritionRecalcHtml(entry.recipeId)}): ${escapeNutritionRecalcHtml(entry.reason)}`)}
      ${htmlSection('Fehler', report.failedRecipes, (entry) =>
    `${escapeNutritionRecalcHtml(entry.recipeId)}: ${escapeNutritionRecalcHtml(entry.error)}`)}
    </div>
  `;

  return {subject, text, html};
}

/**
 * Mails the low-carb report to the admins.
 *
 * @param {Object} report - runLowCarbFullTaggingCore's result plus
 *   triggeredBy and finishedAt.
 * @return {Promise<boolean>} Whether a mail was actually sent.
 */
async function sendLowCarbTaggingSummary(report) {
  const runAt = new Date(report.finishedAt || Date.now())
      .toLocaleString('de-DE', {timeZone: 'Europe/Berlin'});
  const mailContent = buildLowCarbTaggingMail(report, runAt);
  return sendAdminReportMail({
    subject: mailContent.subject,
    text: mailContent.text,
    html: mailContent.html,
    logLabel: 'runLowCarbFullTagging',
  });
}

async function runLowCarbFullTaggingCore() {
  const db = admin.firestore();
  const stats = {
    total: 0, added: 0, removed: 0, unchanged: 0, skipped: 0, failed: 0, written: 0,
  };

  // Per-recipe detail for the report mail. Counters alone say how many recipes
  // moved; only these say which ones, and on what numbers the verdict rested.
  const detail = {
    addedRecipes: [],
    removedRecipes: [],
    skippedRecipes: [],
    failedRecipes: [],
    // How many verdicts rested on the unambiguous per-100-g values and how
    // many on the stored totals, whose meaning differs between the write
    // paths. A high 'total' share is the signal to look closer.
    basisCounts: {per100g: 0, total: 0},
  };

  const recipesSnapshot = await db.collection('recipes').get();
  // docs.length rather than snapshot.size: the same number, but read off the
  // array this function iterates anyway.
  stats.total = recipesSnapshot.docs.length;

  // Only the recipes that actually need a write are collected. Everything else
  // never reaches a batch, which is what keeps repeated runs free of writes.
  const pendingWrites = [];

  for (const recipeDoc of recipesSnapshot.docs) {
    try {
      const recipeData = recipeDoc.data() || {};
      const result = evaluateLowCarbTag(recipeData);
      const entry = {
        recipeId: recipeDoc.id,
        title: String(recipeData.title || recipeDoc.id),
        energyPercent: result.energyPercent,
        carbsPerPortionG: result.carbsPerPortionG,
        basisSource: result.basisSource,
        portionen: result.portionen,
      };

      if (result.action === 'skipped') {
        stats.skipped += 1;
        detail.skippedRecipes.push({...entry, reason: result.reason});
      } else {
        // Only recipes that were actually judged say anything about the basis.
        if (result.basisSource === 'per100g') detail.basisCounts.per100g += 1;
        else detail.basisCounts.total += 1;

        if (result.action === 'added') {
          stats.added += 1;
          detail.addedRecipes.push(entry);
        } else if (result.action === 'removed') {
          stats.removed += 1;
          detail.removedRecipes.push(entry);
        } else {
          stats.unchanged += 1;
        }
      }

      if (result.changed) {
        pendingWrites.push({ref: recipeDoc.ref, kulinarik: result.kulinarik});
      }
    } catch (error) {
      // One bad recipe must not take the run down with it.
      stats.failed += 1;
      const errorMessage = error?.message || String(error);
      detail.failedRecipes.push({recipeId: recipeDoc.id, error: errorMessage});
      console.error(
          `runLowCarbFullTagging: ${recipeDoc.id}: ${errorMessage}`,
      );
    }
  }

  // Firestore allows 500 operations per batch. That is a hard limit, not a
  // guideline - one more and the whole commit is rejected.
  const BATCH_SIZE = 500;
  for (let i = 0; i < pendingWrites.length; i += BATCH_SIZE) {
    const chunk = pendingWrites.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(({ref, kulinarik}) => batch.update(ref, {kulinarik}));

    try {
      await batch.commit();
      stats.written += chunk.length;
    } catch (error) {
      // A failed batch is reported and the run carries on with the next one,
      // rather than leaving the remaining recipes untouched.
      stats.failed += chunk.length;
      const errorMessage = error?.message || String(error);
      detail.failedRecipes.push({
        recipeId: `Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} Rezepte)`,
        error: errorMessage,
      });
      console.error(
          `runLowCarbFullTagging: batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ` +
          `${errorMessage}`,
      );
    }
  }

  return {...stats, ...detail};
}

/**
 * Callable Cloud Function: the one-time low-carb full pass, startable from the
 * Kuechenbetrieb page so that it needs no local checkout, no service account
 * key and no terminal.
 *
 * Runs synchronously and returns its counters rather than mailing them: the
 * pass is one collection read plus the batched writes for the recipes that
 * actually change, so the caller can simply wait for it.
 */
exports.runLowCarbFullTagging = onCall(
    {
      timeoutSeconds: 300,
      maxInstances: 1,
      secrets: [smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom],
      invoker: 'public',
    },
    async (request) => {
      const callerUid = request.auth?.uid;
      if (!callerUid) {
        throw new HttpsError('unauthenticated', 'Authentication required.');
      }

      const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get();
      const callerData = callerDoc.exists ? (callerDoc.data() || {}) : {};
      const canRunFullTagging = (
        callerData.role === 'admin' ||
        callerData.role === 'moderator'
      );
      if (!canRunFullTagging) {
        throw new HttpsError('permission-denied', 'Admin or moderator role required.');
      }

      const report = await runLowCarbFullTaggingCore();
      const {
        addedRecipes, removedRecipes, skippedRecipes, failedRecipes, basisCounts, ...stats
      } = report;
      console.log(`runLowCarbFullTagging: triggered by ${callerUid}`, stats);

      // The per-recipe lists go into the mail, not into the response: the page
      // shows the counters, and a few thousand entries have no business
      // crossing the wire to a browser.
      let mailed = false;
      try {
        mailed = await sendLowCarbTaggingSummary({
          ...report,
          triggeredBy: callerData.email || callerUid,
          finishedAt: Date.now(),
        });
      } catch (mailError) {
        // The tagging already happened and is the point of the call. A mail
        // that cannot be sent is worth logging, not worth failing over.
        console.error('runLowCarbFullTagging: could not send summary email', mailError);
      }

      return {
        completed: true,
        ...stats,
        basisCounts,
        mailed,
        message:
          `${stats.total} Rezepte geprüft: ${stats.added} neu als Low Carb getaggt, ` +
          `${stats.removed} Tag entfernt, ${stats.unchanged} unverändert, ` +
          `${stats.skipped} übersprungen (unvollständige Nährwerte).` +
          (mailed ? ' Die Rezeptliste wurde per E-Mail verschickt.' : ''),
      };
    }
);

/**
 * Season status constants – must stay in sync with
 * src/utils/seasonMatrix.js CURRENT_SEASON_STATUS.
 */
const CURRENT_SEASON_STATUS = {
  HAUPTSAISON: 'Hauptsaison',
  NEBENSAISON: 'Nebensaison',
  BALD_SAISON: 'Bald_Saison',
  KEINE_SAISON: 'Keine_Saison',
};

/**
 * Computes the current season status for one season matrix entry.
 *
 * @param {Object} entry - Firestore season matrix document data
 * @param {Date} date - Reference date (defaults to today)
 * @returns {string} One of CURRENT_SEASON_STATUS values
 */
function computeCurrentSeasonStatus(entry, date = new Date()) {
  const mainMonths = Array.isArray(entry.mainSeasonMonths) ? entry.mainSeasonMonths : [];
  const secondaryMonths = Array.isArray(entry.secondarySeasonMonths) ?
    entry.secondarySeasonMonths :
    [];

  const currentMonth = date.getMonth() + 1; // 1–12

  if (mainMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.HAUPTSAISON;
  if (secondaryMonths.includes(currentMonth)) return CURRENT_SEASON_STATUS.NEBENSAISON;

  // Check if a main-season month starts within the next 7 days
  for (let i = 1; i <= 7; i++) {
    const futureDate = new Date(date);
    futureDate.setDate(futureDate.getDate() + i);
    const futureMonth = futureDate.getMonth() + 1;
    if (mainMonths.includes(futureMonth)) return CURRENT_SEASON_STATUS.BALD_SAISON;
  }

  return CURRENT_SEASON_STATUS.KEINE_SAISON;
}

/**
 * Scheduled Cloud Function: update the `currentSeasonStatus` field on every
 * season matrix entry once per day.
 *
 * Schedule: every day at 03:00 Europe/Berlin (MEZ/MESZ).
 */
exports.updateSeasonMatrixStatus = onSchedule(
    {
      schedule: '0 3 * * *',
      timeZone: 'Europe/Berlin',
    },
    async (_event) => {
      const db = admin.firestore();
      const snapshot = await db.collection('seasonMatrix').get();

      if (snapshot.empty) {
        console.log('updateSeasonMatrixStatus: no entries found, nothing to update');
        return;
      }

      const today = new Date();
      const batch = db.batch();

      snapshot.forEach((docSnap) => {
        const entry = docSnap.data();
        const status = computeCurrentSeasonStatus(entry, today);
        batch.update(docSnap.ref, {currentSeasonStatus: status});
      });

      await batch.commit();
      console.log(
          `updateSeasonMatrixStatus: updated ${snapshot.size} entries` +
          ` for ${today.toISOString().slice(0, 10)}`,
      );
    },
);

exports.onNutritionReferenceChanged = onDocumentWritten(
    {document: 'nutritionReferences/{refId}'},
    async () => {
      try {
        await admin.firestore()
            .collection('appConfig')
            .doc('nutritionReferences')
            .set({lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
      } catch (err) {
        console.error('onNutritionReferenceChanged: failed to update lastUpdatedAt', err);
      }
    },
);
