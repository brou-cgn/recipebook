/**
 * Diagnostic: how would the low-carb classification change if the carbohydrate
 * basis were switched from brutto to netto?
 *
 * Usage:
 *   node scripts/compareLowCarbBasis.js           (full listing)
 *   node scripts/compareLowCarbBasis.js --quiet   (summary only)
 *   node scripts/compareLowCarbBasis.js --csv     (one CSV row per recipe)
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON
 *   - Or run with Application Default Credentials
 *
 * This script NEVER writes. There is no --apply flag and no Firestore write
 * anywhere in it; it reads the recipes collection and reports. Switching the
 * basis for real means editing LOW_CARB_CARB_BASIS in both functions/lowCarb.js
 * and src/utils/lowCarb.js and then running scripts/migrateRecipeLowCarbTag.js.
 *
 * Both verdicts come from the real implementation rather than from arithmetic
 * repeated here: functions/lowCarb.js is loaded twice, once unmodified and once
 * with LOW_CARB_CARB_BASIS rewritten to 'netto'. Only that one constant differs
 * between the two, so any difference in the result is caused by the basis and
 * by nothing else.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const admin = require('firebase-admin');

const LOW_CARB_SOURCE_PATH = path.join(__dirname, '..', 'functions', 'lowCarb.js');

/**
 * Compiles functions/lowCarb.js with LOW_CARB_CARB_BASIS forced to one value.
 *
 * @param {string} basis - Either 'brutto' or 'netto'.
 * @return {Object} The module's exports, with that basis in effect.
 */
function loadLowCarbWithBasis(basis) {
  const source = fs.readFileSync(LOW_CARB_SOURCE_PATH, 'utf8');
  const pattern = /const LOW_CARB_CARB_BASIS = '(?:brutto|netto)';/;

  if (!pattern.test(source)) {
    throw new Error(
        `LOW_CARB_CARB_BASIS nicht in ${LOW_CARB_SOURCE_PATH} gefunden - ` +
        'wurde die Konstante umbenannt? Dieses Skript muss dann angepasst werden.'
    );
  }

  const patched = source.replace(pattern, `const LOW_CARB_CARB_BASIS = '${basis}';`);
  const compiled = new Module(`${LOW_CARB_SOURCE_PATH}#${basis}`, null);
  compiled.filename = LOW_CARB_SOURCE_PATH;
  compiled.paths = Module._nodeModulePaths(path.dirname(LOW_CARB_SOURCE_PATH));
  compiled._compile(patched, LOW_CARB_SOURCE_PATH);

  if (compiled.exports.LOW_CARB_CARB_BASIS !== basis) {
    throw new Error(`Basis ${basis} konnte nicht gesetzt werden.`);
  }
  return compiled.exports;
}

const brutto = loadLowCarbWithBasis('brutto');
const netto = loadLowCarbWithBasis('netto');

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const CSV = args.includes('--csv');

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
 * Describes what a recipe's tag does under one basis, ignoring what the
 * recipe currently carries: the question here is what the rules say, not what
 * an earlier migration happened to write.
 *
 * @param {Object} evaluation - The return value of isLowCarb.
 * @return {string} 'Low Carb', 'nein' or '-' for an unjudgeable recipe.
 */
function verdict(evaluation) {
  if (evaluation.skipped) return '-';
  return evaluation.qualifies ? 'Low Carb' : 'nein';
}

/**
 * @param {*} value - A cell value.
 * @return {string} The value as a quoted CSV field.
 */
function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

/**
 * Reads the whole recipes collection in pages, so that a large stock does not
 * have to be held in one snapshot.
 *
 * @param {number} pageSize - Documents per page.
 * @yield {Object} One Firestore document snapshot at a time.
 */
async function* iterateRecipes(pageSize = 300) {
  let cursor = null;
  for (;;) {
    let query = db.collection('recipes').orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) return;

    for (const doc of snapshot.docs) yield doc;
    if (snapshot.size < pageSize) return;
    cursor = snapshot.docs[snapshot.docs.length - 1].id;
  }
}

/**
 * Runs both bases over every recipe and reports the difference.
 */
async function compareLowCarbBasis() {
  console.log('Low-Carb-Basisvergleich - brutto vs. netto (DRY RUN, es wird nichts geschrieben)');
  console.log(
      `Schwellen: Energieanteil < ${brutto.LOW_CARB_MAX_ENERGY_PERCENT} % ` +
      `UND <= ${brutto.LOW_CARB_MAX_CARBS_PER_PORTION_G} g KH pro Portion\n`
  );

  const stats = {
    total: 0,
    skipped: 0,
    failed: 0,
    bothYes: 0,
    bothNo: 0,
    onlyNetto: 0,
    onlyBrutto: 0,
  };
  const flipped = [];

  if (CSV) {
    console.log([
      'recipeId', 'title', 'portionen', 'basisSource',
      'energyPct_brutto', 'carbsPerPortion_brutto', 'verdict_brutto',
      'energyPct_netto', 'carbsPerPortion_netto', 'verdict_netto',
      'kippt',
    ].map(csvCell).join(','));
  }

  for await (const doc of iterateRecipes()) {
    stats.total += 1;
    const data = doc.data() || {};
    const title = String(data.title || doc.id);

    try {
      const b = brutto.isLowCarb(data);
      const n = netto.isLowCarb(data);

      if (b.skipped || n.skipped) {
        stats.skipped += 1;
      } else if (b.qualifies && n.qualifies) {
        stats.bothYes += 1;
      } else if (!b.qualifies && !n.qualifies) {
        stats.bothNo += 1;
      } else if (n.qualifies) {
        stats.onlyNetto += 1;
        flipped.push({title, id: doc.id, b, n, direction: 'gewinnt Tag bei netto'});
      } else {
        stats.onlyBrutto += 1;
        flipped.push({title, id: doc.id, b, n, direction: 'verliert Tag bei netto'});
      }

      if (CSV) {
        console.log([
          doc.id, title, b.portionen, b.basisSource,
          fmt(b.energyPercent, 2), fmt(b.carbsPerPortionG, 2), verdict(b),
          fmt(n.energyPercent, 2), fmt(n.carbsPerPortionG, 2), verdict(n),
          b.skipped || n.skipped ? '' : String(b.qualifies !== n.qualifies),
        ].map(csvCell).join(','));
      } else if (!QUIET) {
        const mark = b.skipped || n.skipped ? '[uebersprungen]' :
          b.qualifies !== n.qualifies ? '[KIPPT]        ' : '[gleich]       ';
        console.log(
            `  ${mark} ${title}: brutto ${fmt(b.energyPercent)} % -> ${verdict(b)} | ` +
            `netto ${fmt(n.energyPercent)} % -> ${verdict(n)}`
        );
      }
    } catch (error) {
      // One bad recipe must not take the run down with it.
      stats.failed += 1;
      console.error(`  [FEHLER]        ${doc.id}: ${error?.message || error}`);
    }
  }

  const judged = stats.bothYes + stats.bothNo + stats.onlyNetto + stats.onlyBrutto;
  const flipCount = stats.onlyNetto + stats.onlyBrutto;

  console.log('\n--- Zusammenfassung ---');
  console.log(`Rezepte gesamt:          ${stats.total}`);
  console.log(`Bewertbar:               ${judged}`);
  console.log(`Uebersprungen:           ${stats.skipped}  (unvollstaendige Naehrwerte)`);
  if (stats.failed > 0) console.log(`Fehler:                  ${stats.failed}`);
  console.log('');
  console.log(`Low Carb bei brutto:     ${stats.bothYes + stats.onlyBrutto}`);
  console.log(`Low Carb bei netto:      ${stats.bothYes + stats.onlyNetto}`);
  console.log('');
  console.log(`Unter beiden Basen Tag:  ${stats.bothYes}`);
  console.log(`Unter keiner Basis Tag:  ${stats.bothNo}`);
  console.log(`Nur bei netto Tag:       ${stats.onlyNetto}  (kaemen neu dazu)`);
  console.log(`Nur bei brutto Tag:      ${stats.onlyBrutto}  (wuerden wegfallen)`);
  console.log(
      `\nKippende Rezepte:        ${flipCount}` +
      (judged > 0 ? `  (${(flipCount / judged * 100).toFixed(1)} % der bewertbaren)` : '')
  );

  if (flipped.length > 0 && !CSV) {
    console.log('\n--- Rezepte, bei denen die Basis das Ergebnis umdreht ---');
    for (const entry of flipped) {
      console.log(
          `  ${entry.title} (${entry.id}) - ${entry.direction}\n` +
          `      brutto: ${fmt(entry.b.energyPercent, 2)} % Energie aus KH, ` +
          `${fmt(entry.b.carbsPerPortionG, 2)} g KH/Portion\n` +
          `      netto:  ${fmt(entry.n.energyPercent, 2)} % Energie aus KH, ` +
          `${fmt(entry.n.carbsPerPortionG, 2)} g KH/Portion`
      );
    }
  }

  console.log('\nDRY RUN - es wurde nichts geschrieben.');
}

compareLowCarbBasis().catch((err) => {
  console.error('Basisvergleich fehlgeschlagen:', err);
  process.exit(1);
});
