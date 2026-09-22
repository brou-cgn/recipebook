/**
 * Diagnostic: how would the low-carb classification change under a different
 * carbohydrate basis, a different portion cap, or both?
 *
 * Usage:
 *   node scripts/compareLowCarbBasis.js            (brutto vs. netto, full listing)
 *   node scripts/compareLowCarbBasis.js --quiet    (summary only)
 *   node scripts/compareLowCarbBasis.js --csv      (one CSV row per recipe)
 *   node scripts/compareLowCarbBasis.js --matrix   (both bases x 40/35/30 g cap)
 *   node scripts/compareLowCarbBasis.js --zucker   (sugar profile of the tagged recipes)
 *
 * Prerequisites:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service account JSON
 *   - Or run with Application Default Credentials
 *
 * This script NEVER writes. There is no --apply flag and no Firestore write
 * anywhere in it; it reads the recipes collection and reports. Switching basis
 * or cap for real means editing the constants in both functions/lowCarb.js and
 * src/utils/lowCarb.js and then running scripts/migrateRecipeLowCarbTag.js.
 *
 * Every verdict comes from the real implementation rather than from arithmetic
 * repeated here: functions/lowCarb.js is compiled once per variant, with
 * LOW_CARB_CARB_BASIS and LOW_CARB_MAX_CARBS_PER_PORTION_G rewritten in the
 * source. Only those constants differ between the variants, so any difference
 * in the result is caused by them and by nothing else. The energy-share
 * threshold is left alone throughout.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const admin = require('firebase-admin');

const LOW_CARB_SOURCE_PATH = path.join(__dirname, '..', 'functions', 'lowCarb.js');

const BASIS_PATTERN = /const LOW_CARB_CARB_BASIS = '(?:brutto|netto)';/;
const CAP_PATTERN = /const LOW_CARB_MAX_CARBS_PER_PORTION_G = \d+(?:\.\d+)?;/;

/** Portion caps the matrix mode walks through, in grams. */
const MATRIX_CAPS = [40, 35, 30];

/** Bases the matrix mode walks through. */
const MATRIX_BASES = ['brutto', 'netto'];

/** Candidate sugar caps per portion, in grams, for the sugar mode. */
const SUGAR_G_THRESHOLDS = [5, 7.5, 10, 12.5, 15];

/** Candidate caps for sugar as a share of carbohydrates, in percent. */
const SUGAR_SHARE_THRESHOLDS = [50, 66, 75, 90];

/**
 * Compiles functions/lowCarb.js with the basis - and optionally the portion
 * cap - forced to a given value. The file on disk is never touched.
 *
 * @param {string} basis - Either 'brutto' or 'netto'.
 * @param {number|null} capGrams - Portion cap in grams, or null to keep the
 *   value the source file carries.
 * @return {Object} The module's exports, with those values in effect.
 */
function loadLowCarbWith(basis, capGrams = null) {
  const source = fs.readFileSync(LOW_CARB_SOURCE_PATH, 'utf8');

  if (!BASIS_PATTERN.test(source)) {
    throw new Error(
        `LOW_CARB_CARB_BASIS nicht in ${LOW_CARB_SOURCE_PATH} gefunden - ` +
        'wurde die Konstante umbenannt? Dieses Skript muss dann angepasst werden.'
    );
  }
  if (capGrams != null && !CAP_PATTERN.test(source)) {
    throw new Error(
        `LOW_CARB_MAX_CARBS_PER_PORTION_G nicht in ${LOW_CARB_SOURCE_PATH} gefunden - ` +
        'wurde die Konstante umbenannt? Dieses Skript muss dann angepasst werden.'
    );
  }

  let patched = source.replace(BASIS_PATTERN, `const LOW_CARB_CARB_BASIS = '${basis}';`);
  if (capGrams != null) {
    patched = patched.replace(
        CAP_PATTERN,
        `const LOW_CARB_MAX_CARBS_PER_PORTION_G = ${capGrams};`
    );
  }

  const label = `${basis}#${capGrams == null ? 'default' : capGrams}`;
  const compiled = new Module(`${LOW_CARB_SOURCE_PATH}#${label}`, null);
  compiled.filename = LOW_CARB_SOURCE_PATH;
  compiled.paths = Module._nodeModulePaths(path.dirname(LOW_CARB_SOURCE_PATH));
  compiled._compile(patched, LOW_CARB_SOURCE_PATH);

  const exports = compiled.exports;
  if (exports.LOW_CARB_CARB_BASIS !== basis) {
    throw new Error(`Basis ${basis} konnte nicht gesetzt werden.`);
  }
  if (capGrams != null && exports.LOW_CARB_MAX_CARBS_PER_PORTION_G !== capGrams) {
    throw new Error(`Portionsgrenze ${capGrams} g konnte nicht gesetzt werden.`);
  }
  return exports;
}

const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const CSV = args.includes('--csv');
const MATRIX = args.includes('--matrix');
const ZUCKER = args.includes('--zucker');

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
 * Describes what a recipe's tag does under one variant, ignoring what the
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
 * Runs both bases over every recipe and reports the difference. The portion
 * cap stays at whatever functions/lowCarb.js carries.
 */
/**
 * Reads the basis and portion cap that functions/lowCarb.js currently carries,
 * rather than assuming them - the whole point of this script is that they are
 * about to change.
 *
 * @return {{basis: string, cap: number}} The live setting.
 */
function readLiveSettings() {
  const source = fs.readFileSync(LOW_CARB_SOURCE_PATH, 'utf8');
  const basisMatch = BASIS_PATTERN.exec(source);
  const capMatch = CAP_PATTERN.exec(source);
  if (!basisMatch || !capMatch) {
    throw new Error(
        `Konstanten nicht in ${LOW_CARB_SOURCE_PATH} gefunden - ` +
        'wurden sie umbenannt? Dieses Skript muss dann angepasst werden.'
    );
  }
  return {
    basis: basisMatch[0].includes(`'netto'`) ? 'netto' : 'brutto',
    cap: Number(capMatch[0].match(/=\s*([\d.]+);/)[1]),
  };
}

/**
 * Whether a recipe currently carries the low-carb tag in Firestore. This is a
 * different question from whether it qualifies: the tag is only ever written
 * when something runs over the recipe, so a qualifying recipe that nothing has
 * touched carries no tag at all.
 *
 * @param {Object} lowCarbModule - Any loaded variant of the module.
 * @param {Object} data - Recipe document data.
 * @return {boolean} Whether the tag is present.
 */
function carriesLowCarbTag(lowCarbModule, data) {
  const tag = lowCarbModule.LOW_CARB_TAG.toLowerCase();
  return lowCarbModule
      .normalizeKulinarik(data && data.kulinarik)
      .some((entry) => entry.trim().toLowerCase() === tag);
}

/**
 * Prints how the tags actually stored in Firestore compare with what the live
 * rules say. A large "berechtigt, aber ohne Tag" number means the rules were
 * never applied to those recipes, not that the rules disagree.
 *
 * @param {Object} tagState - Counters collected during the run.
 * @param {string} label - The setting these verdicts were reached under.
 */
function printTagState(tagState, label) {
  console.log(`\n--- Ist-Zustand in Firestore (Regeln: ${label}) ---`);
  console.log(`Tragen den Tag aktuell:      ${tagState.tagged}`);
  console.log(`Berechtigt und getaggt:      ${tagState.taggedAndQualifies}`);
  console.log(`Berechtigt, aber ohne Tag:   ${tagState.qualifiesNotTagged}  ` +
      '(Regel nie auf sie angewendet)');
  console.log(`Getaggt, aber nicht mehr berechtigt: ${tagState.taggedNotQualifies}`);
}

/**
 * Runs both bases over every recipe and reports the difference. The portion
 * cap stays at whatever functions/lowCarb.js carries.
 */
async function compareLowCarbBasis() {
  const brutto = loadLowCarbWith('brutto');
  const netto = loadLowCarbWith('netto');
  const live = readLiveSettings();
  const liveModule = live.basis === 'netto' ? netto : brutto;

  console.log('Low-Carb-Basisvergleich - brutto vs. netto (DRY RUN, es wird nichts geschrieben)');
  console.log(
      `Schwellen: Energieanteil < ${brutto.LOW_CARB_MAX_ENERGY_PERCENT} % ` +
      `UND <= ${brutto.LOW_CARB_MAX_CARBS_PER_PORTION_G} g KH pro Portion\n`
  );

  const stats = {
    total: 0, skipped: 0, failed: 0,
    bothYes: 0, bothNo: 0, onlyNetto: 0, onlyBrutto: 0,
  };
  const tagState = {
    tagged: 0, taggedAndQualifies: 0, qualifiesNotTagged: 0, taggedNotQualifies: 0,
  };
  const flipped = [];

  if (CSV) {
    console.log([
      'recipeId', 'title', 'portionen', 'basisSource', 'hatTagAktuell',
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
      const hasTag = carriesLowCarbTag(brutto, data);
      const liveVerdict = live.basis === 'netto' ? n : b;

      if (hasTag) tagState.tagged += 1;
      if (!liveVerdict.skipped) {
        if (liveVerdict.qualifies && hasTag) tagState.taggedAndQualifies += 1;
        else if (liveVerdict.qualifies && !hasTag) tagState.qualifiesNotTagged += 1;
        else if (!liveVerdict.qualifies && hasTag) tagState.taggedNotQualifies += 1;
      }

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
          doc.id, title, b.portionen, b.basisSource, String(hasTag),
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

  printTagState(tagState, `${live.basis}, ${liveModule.LOW_CARB_MAX_CARBS_PER_PORTION_G} g`);

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

/**
 * Runs every combination of basis and portion cap over the whole stock and
 * reports how many recipes each one tags, plus who moves relative to the
 * setting that is live today.
 */
async function matrixLowCarb() {
  const live = readLiveSettings();
  const baselineKey = `${live.basis}/${live.cap}`;

  const variants = [];
  for (const basis of MATRIX_BASES) {
    for (const cap of MATRIX_CAPS) {
      variants.push({basis, cap, key: `${basis}/${cap}`, mod: loadLowCarbWith(basis, cap)});
    }
  }
  const anyModule = variants[0].mod;

  console.log('Low-Carb-Schwellenmatrix (DRY RUN, es wird nichts geschrieben)');
  console.log(
      `Energieanteil-Schwelle unveraendert: < ${anyModule.LOW_CARB_MAX_ENERGY_PERCENT} %`
  );
  console.log(`Heutige Einstellung: ${live.basis}, ${live.cap} g\n`);

  const counts = {};
  const gained = {};
  const lost = {};
  for (const v of variants) {
    counts[v.key] = 0;
    gained[v.key] = [];
    lost[v.key] = [];
  }

  const stats = {total: 0, judged: 0, skipped: 0, failed: 0};
  const tagState = {
    tagged: 0, taggedAndQualifies: 0, qualifiesNotTagged: 0, taggedNotQualifies: 0,
  };
  const baselineHasVariant = variants.some((v) => v.key === baselineKey);

  for await (const doc of iterateRecipes()) {
    stats.total += 1;
    const data = doc.data() || {};
    const title = String(data.title || doc.id);

    try {
      const hasTag = carriesLowCarbTag(anyModule, data);
      if (hasTag) tagState.tagged += 1;

      const evaluations = {};
      let skipped = false;
      for (const v of variants) {
        const evaluation = v.mod.isLowCarb(data);
        if (evaluation.skipped) skipped = true;
        evaluations[v.key] = evaluation;
      }

      if (skipped) {
        stats.skipped += 1;
        continue;
      }
      stats.judged += 1;

      for (const v of variants) {
        if (evaluations[v.key].qualifies) counts[v.key] += 1;
      }

      if (!baselineHasVariant) continue;
      const baseQualifies = evaluations[baselineKey].qualifies;

      if (baseQualifies && hasTag) tagState.taggedAndQualifies += 1;
      else if (baseQualifies && !hasTag) tagState.qualifiesNotTagged += 1;
      else if (!baseQualifies && hasTag) tagState.taggedNotQualifies += 1;

      for (const v of variants) {
        if (v.key === baselineKey) continue;
        const now = evaluations[v.key].qualifies;
        const entry = {title, id: doc.id, evaluation: evaluations[v.key]};
        if (now && !baseQualifies) gained[v.key].push(entry);
        else if (!now && baseQualifies) lost[v.key].push(entry);
      }
    } catch (error) {
      // One bad recipe must not take the run down with it.
      stats.failed += 1;
      console.error(`  [FEHLER] ${doc.id}: ${error?.message || error}`);
    }
  }

  console.log(`Rezepte gesamt: ${stats.total}   Bewertbar: ${stats.judged}   ` +
      `Uebersprungen: ${stats.skipped}`);
  if (stats.failed > 0) console.log(`Fehler: ${stats.failed}`);

  console.log(`\n--- Rezepte mit Low-Carb-Tag (von ${stats.judged} bewertbaren) ---`);
  console.log(`${'Basis'.padEnd(10)}${MATRIX_CAPS.map((c) => `${c} g`.padStart(8)).join('')}`);
  for (const basis of MATRIX_BASES) {
    const row = MATRIX_CAPS
        .map((cap) => String(counts[`${basis}/${cap}`]).padStart(8))
        .join('');
    console.log(`${basis.padEnd(10)}${row}`);
  }

  if (baselineHasVariant) {
    printTagState(tagState, `${live.basis}, ${live.cap} g`);

    console.log(
        `\n--- Differenz zur heutigen Einstellung (${live.basis}, ${live.cap} g ` +
        `-> ${counts[baselineKey]} Rezepte) ---`
    );
    for (const v of variants) {
      if (v.key === baselineKey) continue;
      console.log(
          `  ${v.key.padEnd(14)} ${String(counts[v.key]).padStart(4)} Rezepte   ` +
          `(+${gained[v.key].length} neu / -${lost[v.key].length} weg)`
      );
    }

    if (!QUIET) {
      for (const v of variants) {
        if (v.key === baselineKey) continue;
        if (gained[v.key].length === 0 && lost[v.key].length === 0) continue;
        console.log(`\n--- ${v.key} g gegenueber heute ---`);
        for (const entry of lost[v.key]) {
          console.log(
              `  [-] ${entry.title} (${entry.id}): ` +
              `${fmt(entry.evaluation.energyPercent, 2)} % Energie aus KH, ` +
              `${fmt(entry.evaluation.carbsPerPortionG, 2)} g KH/Portion`
          );
        }
        for (const entry of gained[v.key]) {
          console.log(
              `  [+] ${entry.title} (${entry.id}): ` +
              `${fmt(entry.evaluation.energyPercent, 2)} % Energie aus KH, ` +
              `${fmt(entry.evaluation.carbsPerPortionG, 2)} g KH/Portion`
          );
        }
      }
    }
  } else {
    console.log(
        `\nHinweis: die heutige Einstellung (${baselineKey}) ist keine der ` +
        'verglichenen Varianten - die Differenzen entfallen.'
    );
  }

  console.log('\nDRY RUN - es wurde nichts geschrieben.');
}

/**
 * Returns a nutrition record in which sugar stands where carbohydrates
 * normally stand.
 *
 * The point is to get sugar per portion without repeating any of the basis
 * resolution - which of calcPer100g and the stored totals applies, how the
 * final weight and the portion count enter into it. Handing this record to
 * isLowCarb makes it answer that question for sugar, using the very code that
 * answers it for carbohydrates. carbsPerPortionG then holds sugar per portion
 * and energyPercent the share of energy sugar supplies.
 *
 * Fibre is dropped rather than carried over: subtracting it from sugar would
 * mean nothing, and without it brutto and netto give the same answer.
 *
 * @param {Object|null} naehrwerte - The recipe's stored nutrition record.
 * @return {Object} The same record with sugar in place of carbohydrates.
 */
function withSugarAsCarbohydrates(naehrwerte) {
  const record = naehrwerte && typeof naehrwerte === 'object' ? naehrwerte : {};

  const swapSugarIn = (source) => {
    const copy = {...source};
    delete copy.ballaststoffe;
    // The sugar rule must not fire on this record: here sugar stands in for
    // the carbohydrates, so leaving it in place as well would have isLowCarb
    // judge a value against itself.
    delete copy.zucker;
    const sugar = source.zucker;
    if (sugar === null || sugar === undefined || sugar === '') {
      // No sugar figure: leave no carbohydrate value either, so that
      // isLowCarb reports the recipe as unjudgeable instead of reading the
      // real carbohydrates as if they were sugar.
      delete copy.kohlenhydrate;
    } else {
      copy.kohlenhydrate = sugar;
    }
    return copy;
  };

  const swapped = swapSugarIn(record);
  if (record.calcPer100g && typeof record.calcPer100g === 'object') {
    swapped.calcPer100g = swapSugarIn(record.calcPer100g);
  }
  return swapped;
}

/**
 * Profiles the sugar in the recipes the live rules currently tag as low carb.
 *
 * The energy-share rule is blind to a fat-heavy dessert: cream inflates the
 * denominator and pushes the carbohydrate share down, so a sweet dish can pass
 * comfortably while carrying almost nothing but sugar. This mode makes that
 * visible and shows what a sugar limit would cut, so the threshold can be
 * picked off the stock rather than guessed.
 */
async function sugarAnalysis() {
  const live = readLiveSettings();
  const liveModule = loadLowCarbWith(live.basis);
  const sugarModule = loadLowCarbWith('brutto');

  console.log('Low-Carb-Zuckerprofil (DRY RUN, es wird nichts geschrieben)');
  console.log(`Heutige Einstellung: ${live.basis}, ${live.cap} g\n`);

  const tagged = [];
  const stats = {total: 0, qualifying: 0, withoutSugar: 0, mixedBasis: 0, failed: 0};

  for await (const doc of iterateRecipes()) {
    stats.total += 1;
    const data = doc.data() || {};

    try {
      const carbVerdict = liveModule.isLowCarb(data);
      if (carbVerdict.skipped || !carbVerdict.qualifies) continue;
      stats.qualifying += 1;

      const sugarVerdict = sugarModule.isLowCarb({
        ...data,
        naehrwerte: withSugarAsCarbohydrates(data.naehrwerte),
      });

      if (sugarVerdict.skipped) stats.withoutSugar += 1;

      // A share only means something when both figures were read off the same
      // basis; otherwise it would divide a per-100-g number by a total.
      const comparable =
        !sugarVerdict.skipped &&
        sugarVerdict.basisSource === carbVerdict.basisSource &&
        carbVerdict.carbsPerPortionG > 0;
      if (!sugarVerdict.skipped && !comparable) stats.mixedBasis += 1;

      tagged.push({
        title: String(data.title || doc.id),
        id: doc.id,
        carbsPerPortionG: carbVerdict.carbsPerPortionG,
        sugarPerPortionG: sugarVerdict.skipped ? null : sugarVerdict.carbsPerPortionG,
        sugarEnergyPercent: sugarVerdict.skipped ? null : sugarVerdict.energyPercent,
        sugarSharePercent: comparable ?
          (sugarVerdict.carbsPerPortionG / carbVerdict.carbsPerPortionG) * 100 :
          null,
      });
    } catch (error) {
      // One bad recipe must not take the run down with it.
      stats.failed += 1;
      console.error(`  [FEHLER] ${doc.id}: ${error?.message || error}`);
    }
  }

  console.log(`Rezepte gesamt: ${stats.total}   Aktuell Low Carb: ${stats.qualifying}`);
  if (stats.withoutSugar > 0) {
    console.log(`Ohne Zuckerangabe: ${stats.withoutSugar}  (von keiner Zuckerregel erfassbar)`);
  }
  if (stats.mixedBasis > 0) {
    console.log(`Uneinheitliche Basis: ${stats.mixedBasis}  (Anteil nicht berechenbar)`);
  }
  if (stats.failed > 0) console.log(`Fehler: ${stats.failed}`);

  // Highest sugar share first: that is where the sweets collect, and the gap
  // between them and the rest is what a threshold has to land in.
  const sorted = [...tagged].sort((a, b) => {
    if (a.sugarSharePercent == null) return 1;
    if (b.sugarSharePercent == null) return -1;
    return b.sugarSharePercent - a.sugarSharePercent;
  });

  if (!QUIET && sorted.length > 0) {
    console.log('\n--- Aktuell getaggte Rezepte nach Zuckeranteil ---');
    console.log(
        `${'Anteil'.padStart(7)}${'Zucker/P.'.padStart(12)}${'KH/P.'.padStart(10)}` +
        `${'Zucker-kcal%'.padStart(14)}  Rezept`
    );
    for (const entry of sorted) {
      console.log(
          `${(entry.sugarSharePercent == null ? '-' : entry.sugarSharePercent.toFixed(0) + ' %').padStart(7)}` +
          `${(entry.sugarPerPortionG == null ? '-' : entry.sugarPerPortionG.toFixed(1) + ' g').padStart(12)}` +
          `${(entry.carbsPerPortionG.toFixed(1) + ' g').padStart(10)}` +
          `${(entry.sugarEnergyPercent == null ? '-' : entry.sugarEnergyPercent.toFixed(1) + ' %').padStart(14)}` +
          `  ${entry.title} (${entry.id})`
      );
    }
  }

  const measurable = tagged.filter((entry) => entry.sugarPerPortionG != null);
  const shareable = tagged.filter((entry) => entry.sugarSharePercent != null);

  console.log(`\n--- Wirkung einer Zuckergrenze pro Portion (${measurable.length} mit Zuckerangabe) ---`);
  for (const limit of SUGAR_G_THRESHOLDS) {
    const out = measurable.filter((entry) => entry.sugarPerPortionG > limit);
    console.log(
        `  Zucker <= ${String(limit).padStart(4)} g:  ` +
        `${String(measurable.length - out.length).padStart(4)} bleiben, ` +
        `${String(out.length).padStart(4)} fallen weg`
    );
  }

  console.log(`\n--- Wirkung einer Zuckeranteil-Grenze (${shareable.length} berechenbar) ---`);
  for (const limit of SUGAR_SHARE_THRESHOLDS) {
    const out = shareable.filter((entry) => entry.sugarSharePercent > limit);
    console.log(
        `  Anteil <= ${String(limit).padStart(3)} %:  ` +
        `${String(shareable.length - out.length).padStart(4)} bleiben, ` +
        `${String(out.length).padStart(4)} fallen weg`
    );
  }

  console.log('\nDRY RUN - es wurde nichts geschrieben.');
}

const run = ZUCKER ? sugarAnalysis : MATRIX ? matrixLowCarb : compareLowCarbBasis;

const runLabel = ZUCKER ?
  'Zuckerprofil fehlgeschlagen:' :
  MATRIX ? 'Schwellenmatrix fehlgeschlagen:' : 'Basisvergleich fehlgeschlagen:';

run().catch((err) => {
  console.error(runLabel, err);
  process.exit(1);
});
