/**
 * One-time migration script: classify every existing recipe as low carb or
 * not, and add or remove the "Low Carb" cuisine tag accordingly.
 *
 * Usage:
 *   node scripts/migrateRecipeLowCarbTag.js            (dry run - writes nothing)
 *   node scripts/migrateRecipeLowCarbTag.js --apply    (writes to Firestore)
 *   node scripts/migrateRecipeLowCarbTag.js --apply --quiet   (summary only)
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON
 *   - Or run with Application Default Credentials
 *
 * The script deliberately does no arithmetic of its own: it iterates over the
 * recipes, hands each one to evaluateLowCarbTag() - the same function the
 * nightly recalc uses - and writes back what that returns. The thresholds live
 * in functions/lowCarb.js and nowhere else.
 *
 * It is safe to run repeatedly. A recipe whose tag is already correct produces
 * no write at all, so a second run touches nothing.
 */

const admin = require('firebase-admin');
const {
  LOW_CARB_TAG,
  LOW_CARB_MAX_ENERGY_PERCENT,
  LOW_CARB_MAX_CARBS_PER_PORTION_G,
  LOW_CARB_CARB_BASIS,
  evaluateLowCarbTag,
} = require('../functions/lowCarb');

// Firestore allows 500 operations per batch. That is a hard limit, not a
// guideline - one more and the whole commit is rejected.
const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const QUIET = args.includes('--quiet');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * @param {number|null} value - A number to show in the log.
 * @param {number} digits - Decimal places.
 * @return {string} The formatted number, or a dash when there is none.
 */
function fmt(value, digits = 1) {
  return value == null ? '-' : value.toFixed(digits);
}

/**
 * @param {Object} recipeDoc - Firestore document snapshot.
 * @param {Object} result - The verdict from evaluateLowCarbTag.
 * @return {string} One log line describing what happens to this recipe.
 */
function describe(recipeDoc, result) {
  const title = String(recipeDoc.data().title || recipeDoc.id);
  const numbers =
    `${fmt(result.energyPercent)} % Energie aus KH, ` +
    `${fmt(result.carbsPerPortionG)} g KH/Portion ` +
    `(${result.portionen} Portion(en), Basis: ${result.basisSource})`;

  if (result.action === 'skipped') {
    return `  [uebersprungen] ${title}: ${result.reason}`;
  }
  if (result.action === 'added') {
    return `  [neu Low Carb]  ${title}: ${numbers}`;
  }
  if (result.action === 'removed') {
    return `  [Tag entfernt]  ${title}: ${numbers}`;
  }
  return `  [unveraendert]  ${title}: ${numbers}`;
}

async function migrateRecipeLowCarbTag() {
  console.log(
      `Low-Carb-Klassifikation - ${APPLY ? 'SCHREIBMODUS' : 'DRY RUN (es wird nichts geschrieben)'}`
  );
  console.log(
      `Schwellen: Energieanteil < ${LOW_CARB_MAX_ENERGY_PERCENT} % ` +
      `UND <= ${LOW_CARB_MAX_CARBS_PER_PORTION_G} g KH pro Portion ` +
      `(Basis: ${LOW_CARB_CARB_BASIS}), Tag: "${LOW_CARB_TAG}"\n`
  );

  const recipesSnapshot = await db.collection('recipes').get();
  console.log(`${recipesSnapshot.size} Rezept(e) gefunden.\n`);

  const stats = {
    total: recipesSnapshot.size,
    added: 0,
    removed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  // Only the recipes that actually need a write are collected. Everything else
  // never reaches a batch, which is what keeps repeated runs free of writes.
  const pendingWrites = [];

  for (const recipeDoc of recipesSnapshot.docs) {
    try {
      const result = evaluateLowCarbTag(recipeDoc.data() || {});

      if (result.action === 'skipped') stats.skipped += 1;
      else if (result.action === 'added') stats.added += 1;
      else if (result.action === 'removed') stats.removed += 1;
      else stats.unchanged += 1;

      if (!QUIET) console.log(describe(recipeDoc, result));

      if (result.changed) {
        pendingWrites.push({ref: recipeDoc.ref, kulinarik: result.kulinarik});
      }
    } catch (error) {
      // One bad recipe must not take the run down with it.
      stats.failed += 1;
      console.error(
          `  [FEHLER]        ${recipeDoc.id}: ${error?.message || error}`
      );
    }
  }

  console.log('');

  if (pendingWrites.length === 0) {
    console.log('Keine Aenderungen noetig.');
  } else if (!APPLY) {
    console.log(
        `DRY RUN: ${pendingWrites.length} Rezept(e) wuerden geschrieben. ` +
        'Mit --apply erneut ausfuehren, um die Aenderungen zu uebernehmen.'
    );
  } else {
    let written = 0;
    for (let i = 0; i < pendingWrites.length; i += BATCH_SIZE) {
      const chunk = pendingWrites.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(({ref, kulinarik}) => batch.update(ref, {kulinarik}));

      try {
        await batch.commit();
        written += chunk.length;
        console.log(
            `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
            `${chunk.length} Rezept(e) geschrieben (gesamt: ${written})`
        );
      } catch (error) {
        // A failed batch is reported and the run carries on with the next one,
        // rather than leaving the remaining recipes untouched.
        stats.failed += chunk.length;
        console.error(
            `  [FEHLER] Batch ${Math.floor(i / BATCH_SIZE) + 1} fehlgeschlagen: ` +
            `${error?.message || error}`
        );
      }
    }
  }

  console.log('\n--- Zusammenfassung ---');
  console.log(`Rezepte gesamt:    ${stats.total}`);
  console.log(`Neu Low Carb:      ${stats.added}`);
  console.log(`Unveraendert:      ${stats.unchanged}`);
  console.log(`Tag entfernt:      ${stats.removed}`);
  console.log(`Uebersprungen:     ${stats.skipped}  (unvollstaendige Naehrwerte)`);
  if (stats.failed > 0) {
    console.log(`Fehler:            ${stats.failed}`);
  }
  if (!APPLY) {
    console.log('\nDRY RUN - es wurde nichts geschrieben.');
  }
}

migrateRecipeLowCarbTag().catch((err) => {
  console.error('Migration fehlgeschlagen:', err);
  process.exit(1);
});
