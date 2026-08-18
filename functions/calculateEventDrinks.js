const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const {DRINK_WEIGHTS, CHILDREN_DRINK_WEIGHTS, SEASON_FACTORS, durationFactor, timeFactor, BASE_RATE_PER_PERSON_PER_HOUR, getDrinkWeight, getWeightSubcategoryParents, CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR, getChildrenDrinkWeight, loadDrinkWeightsFromFirestore, loadChildrenDrinkWeightsFromFirestore} = require('./drinkRates');

/**
 * Laedt die admin-editierbare Erwachsenen-Gewichtungsmatrix aus Firestore und
 * mischt zusaetzlich die kalibrierten Erfahrungswerte des Nutzers darueber
 * (Erfahrungswert gewinnt pro Kategorie, wo vorhanden; ueberschreibt aber
 * nicht die Gewichtsverteilung selbst, siehe getDrinkWeight()).
 * @param {object} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @return {Promise<object>} Rate-DB, Kategorie -> Werte.
 */
async function loadRatesDb(db, uid) {
  const ratesDb = await loadDrinkWeightsFromFirestore(db);
  const snap = await db.collection('users').doc(uid).collection('erfahrungswerte').get();
  snap.forEach((doc) => {
    const cat = doc.id;
    ratesDb[cat] = {...(ratesDb[cat] || {}), ...doc.data()};
  });
  return ratesDb;
}

/**
 * Vordefinierte Getraenke, die allen Nutzern ohne Firestore-Dokument zur
 * Verfuegung stehen. Spiegelt PREDEFINED_DRINKS aus drinkCategories.js (src).
 */
const PREDEFINED_DRINKS = {
  predefined_mineralwasser: {
    name: 'Mineralwasser',
    kategorie: 'wasser',
    einheiten: [{einheitsgroesse: 1.0, gebindeinheit: 'Flasche', einheitenProGebinde: 1}],
    predefined: true,
  },
};

/**
 * Laedt die benutzerdefinierten Getraenke eines Nutzers aus Firestore.
 * Vordefinierte Getraenke-IDs (siehe PREDEFINED_DRINKS) werden direkt
 * aufgeloest, ohne Firestore abzufragen.
 * @param {object} db Firestore-Instanz.
 * @param {string} uid Firebase-Nutzer-ID.
 * @param {string[]} drinkIds IDs der gewuenschten Getraenke.
 * @return {Promise<object>} Map von drinkId -> Getraenke-Definition.
 */
async function loadCustomDrinks(db, uid, drinkIds) {
  if (!drinkIds || drinkIds.length === 0) return {};
  const result = {};
  await Promise.all(
      drinkIds.map(async (id) => {
        if (PREDEFINED_DRINKS[id]) {
          const snap = await db.collection('users').doc(uid).collection('customDrinks').doc(id).get();
          if (snap.exists) {
            result[id] = {
              ...PREDEFINED_DRINKS[id],
              ...snap.data(),
              name: PREDEFINED_DRINKS[id].name,
              kategorie: PREDEFINED_DRINKS[id].kategorie,
              predefined: true,
            };
          } else {
            result[id] = PREDEFINED_DRINKS[id];
          }
          return;
        }
        const snap = await db.collection('users').doc(uid).collection('customDrinks').doc(id).get();
        if (snap.exists) {
          result[id] = snap.data();
        }
      }),
  );
  return result;
}

/**
 * Rundet auf 2 Nachkommastellen.
 * @param {number} n Zahl.
 * @return {number} Gerundete Zahl.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Normalisiert den konfigurierten Pufferwert. Gibt 0 zurueck, wenn kein Wert angegeben ist.
 * @param {number|string|null|undefined} value Konfigurierter Puffer in Prozent.
 * @return {number}
 */
function normalizePufferProzent(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

/**
 * Clamp value to [0, 1], fallback 1 for invalid values.
 * @param {number} value Candidate multiplier.
 * @return {number}
 */
function normalizeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const MIN_DISTRIBUTION_FACTOR = 0.1;
const MAX_DISTRIBUTION_FACTOR = 2.0;

/**
 * Clamp value to [0.1, 2.0], fallback 1.0 for invalid values.
 * @param {number} value Candidate distribution factor.
 * @return {number}
 */
function normalizeDistributionFactor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1.0;
  if (n < MIN_DISTRIBUTION_FACTOR || n > MAX_DISTRIBUTION_FACTOR) return 1.0;
  return n;
}

/**
 * Rein kosmetische Unterkategorien (Geschmacksvarianten), die kein eigenes
 * Gewicht in DRINK_WEIGHTS haben und daher immer vollstaendig ins Budget der
 * Elternkategorie aufgeloest werden. Spiegelt die Hierarchie aus
 * drinkCategories.js (src) wider.
 */
const COSMETIC_SUBCATEGORY_PARENTS = {
  bier_koelsch: 'bier',
  bier_pils: 'bier',
  bier_weizen: 'bier',
  wein_weisswein: 'wein',
  wein_rose: 'wein',
  wein_rotwein: 'wein',
};

/**
 * Map von Unterkategorie-ID auf uebergeordnete Kategorie-ID. Kombiniert die
 * kosmetischen Geschmacksvarianten mit den Subkategorien, die ein eigenes
 * Budget/Gewicht in DRINK_WEIGHTS besitzen (z.B. bier_alkoholfrei, longdrinks)
 * -- DRINK_WEIGHTS.parent ist dafuer die einzige Quelle der Wahrheit.
 */
const DRINK_CATEGORY_PARENTS = {...COSMETIC_SUBCATEGORY_PARENTS, ...getWeightSubcategoryParents()};

/**
 * Subkategorien mit eigenem Budget/Gewicht (siehe DRINK_WEIGHTS.parent), die
 * bei der Kategorie-Ableitung aus custom drinks NICHT in ihre Elternkategorie
 * kollabiert werden duerfen.
 */
const CATEGORY_HAS_OWN_BUDGET = new Set(Object.keys(getWeightSubcategoryParents()));

/**
 * Set of category IDs that are considered alcoholic (for alkohol-restriction logic).
 * Mirrors ALCOHOLIC_CATEGORY_IDS in guestPreferences.js (src). Anders als
 * bier_alkoholfrei ist longdrinks (Subkategorie von spirituosen) alkoholisch
 * und muss daher explizit gelistet werden.
 */
const ALCOHOLIC_CATEGORY_IDS_FUNCTIONS = new Set(['bier', 'wein', 'sekt', 'spirituosen', 'longdrinks']);

/**
 * Liefert die uebergeordnete Kategorie-ID, falls vorhanden; sonst die ID selbst.
 * Loest rekursiv auf, d.h. bier_alkoholfrei -> bier.
 * @param {string} kategorieId Getränke-Kategorie-ID.
 * @return {string}
 */
function resolveTopLevelCategory(kategorieId) {
  const parent = DRINK_CATEGORY_PARENTS[kategorieId];
  if (!parent) return kategorieId;
  return resolveTopLevelCategory(parent);
}

/**
 * Liefert die Kategorie fuer Budget-/Verteilungsgruppen.
 * Kategorien mit eigenem Budget (z.B. bier_alkoholfrei) bleiben erhalten.
 * @param {string} kategorieId Getränke-Kategorie-ID.
 * @return {string}
 */
function resolveBudgetCategory(kategorieId) {
  if (!kategorieId) return kategorieId;
  if (CATEGORY_HAS_OWN_BUDGET.has(kategorieId)) return kategorieId;
  return resolveTopLevelCategory(kategorieId);
}

/**
 * Liefert die vereinheitlichte Gebindebezeichnung fuer pflegbare Standardgroessen.
 * @param {number} liters Gebindegroesse in Litern.
 * @return {string|null}
 */
function getConfiguredUnitLabel(liters) {
  const value = Number(liters);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (value === 0.2) return '200 ml';
  if (value === 0.33) return '330 ml';
  if (value === 0.5) return '500 ml';
  if (value === 0.75) return '750 ml';
  if (value === 1) return '1,0 l';
  if (value === 1.5) return '1,5 l';
  if (value === 2) return '2,0 l';
  if (value === 5) return '5,0 l';
  if (value === 10) return '10,0 l';
  return null;
}

/**
 * Reine Berechnungsfunktion, kein Firestore-Zugriff -- leicht testbar.
 * @param {object} event Event-Parameter (eventName, durationHours, guests, season,
 *   eventType, categories, customDrinkIds, drinkDistributionFactors, pufferProzent).
 * @param {object} ratesDb Rate-Datenbank (Default + ggf. Erfahrungswerte).
 * @param {object} [customDrinksMap] Map von drinkId -> Getraenke-Definition.
 * @param {object} [childrenRatesDb] Kinder-Gewichtungsmatrix (Default oder admin-editiert).
 * @return {object} Ergebnis pro Kategorie + Warnungen.
 */
function calculate(event, ratesDb, customDrinksMap, childrenRatesDb = CHILDREN_DRINK_WEIGHTS) {
  const adults = event.guests?.adults || 0;
  const children = event.guests?.children || 0;
  const hours = event.durationHours;
  const seasonFactor = SEASON_FACTORS[event.season] ?? 1.0;
  const timeFac = timeFactor(event.startTime, hours);
  const pufferProzent = normalizePufferProzent(event.pufferProzent);
  const puffer = pufferProzent / 100;
  const durFactor = durationFactor(hours);
  const customDrinkIds = event.customDrinkIds || [];
  const drinkDistributionFactors = event.drinkDistributionFactors || {};
  const drinkSelectedEinheiten = event.drinkSelectedEinheiten || {};
  const allCustomDrinks = customDrinksMap || {};
  const derivedCategoriesFromCustomDrinks = [...new Set(
      customDrinkIds
          .map((drinkId) => allCustomDrinks[drinkId]?.kategorie)
          .filter(Boolean)
          .map((categoryId) => resolveBudgetCategory(categoryId)),
  )];
  const categories = Array.isArray(event.categories) && event.categories.length > 0 ?
    event.categories :
    derivedCategoriesFromCustomDrinks.length > 0 ?
      derivedCategoriesFromCustomDrinks :
      Object.keys(DRINK_WEIGHTS);
  const guestPreferences = event.guestPreferenceMultipliers?.perGuest ?? null;

  const ergebnis = [];
  const warnungen = [];

  // --- Step 1: Compute total beverage requirement for the event ---
  // Adults: total = adults x base_rate x hours x season_factor x time_factor x duration_factor.
  // Children: total = children x children_base_rate x hours x season_factor x time_factor x duration_factor.
  // season_factor is applied first, time_factor (hours before 18:00) reduces the result further.
  // Both budgets are distributed independently across selected categories and then summed.
  const totalBeverage =
      adults * BASE_RATE_PER_PERSON_PER_HOUR * hours * seasonFactor * timeFac * durFactor;
  const childrenTotalBeverage =
      children * CHILDREN_BASE_RATE_PER_PERSON_PER_HOUR * hours * seasonFactor * timeFac * durFactor;

  // --- Step 2: Compute effective category weights from DRINK_WEIGHTS (adults) ---
  // Each offered category receives its raw DRINK_WEIGHTS basis value.
  // Categories not in event.categories effectively get weight 0 (they are not iterated).
  const categoryRawWeights = {};
  let totalRawWeight = 0;
  const categorySet = new Set(categories);

  for (const cat of categories) {
    const drinkWeight = getDrinkWeight(cat, event.season, undefined, ratesDb);
    if (drinkWeight <= 0) continue;

    categoryRawWeights[cat] = drinkWeight;
    totalRawWeight += drinkWeight;
  }

  // Step 2b: fallback -- if parent is offered but sub-category (and none of its children) is not,
  // add the sub-category weight to the parent.
  // Example: bier offered, bier_alkoholfrei not offered
  //          -> add bier_alkoholfrei weight (0.039) to bier.
  // If bier_alkoholfrei IS offered, the group is covered -> no fallback.
  for (const [subCategory, parentCategory] of Object.entries(DRINK_CATEGORY_PARENTS)) {
    if (!categorySet.has(parentCategory) || categorySet.has(subCategory)) continue;

    // Also skip if any direct child of subCategory is offered (they cover the same consumer group)
    const hasOfferedChild = Object.entries(DRINK_CATEGORY_PARENTS)
        .some(([child, parent]) => parent === subCategory && categorySet.has(child));
    if (hasOfferedChild) continue;

    const subCategoryWeight = getDrinkWeight(subCategory, event.season, undefined, ratesDb);
    if (subCategoryWeight <= 0) continue;

    categoryRawWeights[parentCategory] = (categoryRawWeights[parentCategory] || 0) + subCategoryWeight;
    totalRawWeight += subCategoryWeight;
  }

  // --- Step 2c: Compute effective category weights from CHILDREN_DRINK_WEIGHTS ---
  const childrenCategoryRawWeights = {};
  let childrenTotalRawWeight = 0;

  for (const cat of categories) {
    const childWeight = getChildrenDrinkWeight(cat, event.season, undefined, childrenRatesDb);
    if (childWeight <= 0) continue;

    childrenCategoryRawWeights[cat] = childWeight;
    childrenTotalRawWeight += childWeight;
  }

  // Step 2d: same bier_alkoholfrei fallback for children weights.
  for (const [subCategory, parentCategory] of Object.entries(DRINK_CATEGORY_PARENTS)) {
    if (!categorySet.has(parentCategory) || categorySet.has(subCategory)) continue;

    const hasOfferedChild = Object.entries(DRINK_CATEGORY_PARENTS)
        .some(([child, parent]) => parent === subCategory && categorySet.has(child));
    if (hasOfferedChild) continue;

    const subCategoryChildWeight = getChildrenDrinkWeight(subCategory, event.season, undefined, childrenRatesDb);
    if (subCategoryChildWeight <= 0) continue;

    childrenCategoryRawWeights[parentCategory] =
        (childrenCategoryRawWeights[parentCategory] || 0) + subCategoryChildWeight;
    childrenTotalRawWeight += subCategoryChildWeight;
  }

  // --- Step 2e: Compute per-category adults budget using per-guest preferences ---
  // If guestPreferences is provided, each guest's budget is split between preferred
  // and non-preferred categories. Otherwise, budget is distributed purely by weights.
  const categoryAdultsLiters = {};
  for (const cat of categories) {
    categoryAdultsLiters[cat] = 0;
  }

  if (adults > 0 && totalRawWeight > 0) {
    const perGuestBudget = totalBeverage / adults;

    if (Array.isArray(guestPreferences) && guestPreferences.length > 0) {
      // Per-guest preference-aware distribution
      for (const guestPref of guestPreferences) {
        const {
          preferredCategoryIds = [],
          preferenceFactor = 0,
          allowsAlcohol = true,
        } = guestPref;

        // Determine which preferred categories are available in this event
        const availablePreferredCats = preferredCategoryIds.filter((catId) => {
          if (!categorySet.has(catId)) return false;
          if (!allowsAlcohol && ALCOHOLIC_CATEGORY_IDS_FUNCTIONS.has(catId)) return false;
          return true;
        });

        const hasAvailablePreferences = availablePreferredCats.length > 0 && preferenceFactor > 0;

        if (hasAvailablePreferences) {
          // Preferred portion: preferenceFactor * guestBudget -> distributed among available preferred categories
          const preferredBudget = perGuestBudget * preferenceFactor;
          const preferredCatSet = new Set(availablePreferredCats);
          const preferredTotalWeight = availablePreferredCats.reduce(
              (sum, cat) => sum + (categoryRawWeights[cat] || 0), 0,
          );
          if (preferredTotalWeight > 0) {
            for (const cat of availablePreferredCats) {
              categoryAdultsLiters[cat] += preferredBudget * (categoryRawWeights[cat] / preferredTotalWeight);
            }
          } else {
            // All preferred cats have zero weight: distribute evenly
            for (const cat of availablePreferredCats) {
              categoryAdultsLiters[cat] += preferredBudget / availablePreferredCats.length;
            }
          }

          // Remaining portion: (1 - preferenceFactor) * guestBudget -> distributed among non-preferred available categories
          const remainingBudget = perGuestBudget * (1 - preferenceFactor);
          const nonPreferredCats = categories.filter((cat) => {
            if (preferredCatSet.has(cat)) return false;
            if (!allowsAlcohol && ALCOHOLIC_CATEGORY_IDS_FUNCTIONS.has(cat)) return false;
            return (categoryRawWeights[cat] || 0) > 0;
          });
          const nonPreferredTotalWeight = nonPreferredCats.reduce(
              (sum, cat) => sum + (categoryRawWeights[cat] || 0), 0,
          );
          if (nonPreferredTotalWeight > 0) {
            for (const cat of nonPreferredCats) {
              categoryAdultsLiters[cat] += remainingBudget * (categoryRawWeights[cat] / nonPreferredTotalWeight);
            }
          } else if (nonPreferredCats.length > 0) {
            for (const cat of nonPreferredCats) {
              categoryAdultsLiters[cat] += remainingBudget / nonPreferredCats.length;
            }
          }
        } else {
          // No available preferences (or no preferences at all): distribute full budget by weights
          const availableCats = categories.filter((cat) => {
            if (!allowsAlcohol && ALCOHOLIC_CATEGORY_IDS_FUNCTIONS.has(cat)) return false;
            return (categoryRawWeights[cat] || 0) > 0;
          });
          const availableTotalWeight = availableCats.reduce(
              (sum, cat) => sum + (categoryRawWeights[cat] || 0), 0,
          );
          if (availableTotalWeight > 0) {
            for (const cat of availableCats) {
              categoryAdultsLiters[cat] += perGuestBudget * (categoryRawWeights[cat] / availableTotalWeight);
            }
          }
        }
      }

      // Guests not covered by guestPreferences entries: distribute normally
      const coveredGuests = guestPreferences.length;
      if (coveredGuests < adults) {
        const uncoveredBudget = perGuestBudget * (adults - coveredGuests);
        for (const cat of categories) {
          categoryAdultsLiters[cat] += totalRawWeight > 0 ?
            uncoveredBudget * (categoryRawWeights[cat] || 0) / totalRawWeight :
            0;
        }
      }
    } else {
      // No preference data: standard weight-based distribution
      for (const cat of categories) {
        categoryAdultsLiters[cat] = totalBeverage * (categoryRawWeights[cat] || 0) / totalRawWeight;
      }
    }
  }

  // --- Step 3: Distribute totals across selected categories and sum adults + children ---
  for (const cat of categories) {
    const entry = ratesDb[cat];
    if (!entry) {
      warnungen.push(
          `Kategorie '${cat}' ist unbekannt -- keine Faustwerte hinterlegt. ` +
          `Bitte manuell schaetzen oder in erfahrungswerte ergaenzen.`,
      );
      continue;
    }

    const adultsLiterGesamt = categoryAdultsLiters[cat] || 0;
    const childrenLiterGesamt = childrenTotalRawWeight > 0 ?
        childrenTotalBeverage * ((childrenCategoryRawWeights[cat] || 0) / childrenTotalRawWeight) :
        0;
    const literGesamt = adultsLiterGesamt + childrenLiterGesamt;
    const literMitPuffer = literGesamt * (1 + puffer);

    // Gebindegroesse/-bezeichnung kommen nicht mehr aus DRINK_WEIGHTS, sondern
    // ausschliesslich von den einzelnen Getraenken (deren `einheiten`) -- die
    // Kategorie-Zeile selbst liefert daher keine Gebinde-Angaben mehr.
    ergebnis.push({
      kategorie: cat,
      literOhnePuffer: round2(literGesamt),
      literMitPuffer: round2(literMitPuffer),
      gebinde: null,
      gebindeGroesseLiter: null,
      anzahlGebinde: null,
      ratenQuelle: entry._nEvents ? 'erfahrungswert' : 'standard-faustwert',
      anteilTrinkerAngenommen: null,
      praeferenzFaktor: null,
    });
  }

  // Aufbau der Kategorie-Liter-Map fuer die Verteilung auf Einzelgetraenke.
  const categoryLitersMap = {};
  for (const item of ergebnis) {
    if (!item.isCustomDrink && item.literOhnePuffer !== null) {
      categoryLitersMap[item.kategorie] = {
        literOhnePuffer: item.literOhnePuffer,
        literMitPuffer: item.literMitPuffer,
      };
    }
  }

  // Anzahl der neuen Modell-Getraenke (mit einheiten) pro genutzter Kategorie zaehlen.
  // Wenn die genaue Kategorie des Drinks angeboten wird (z.B. 'bier_alkoholfrei'),
  // wird sie direkt verwendet. Sonst wird die Oberkategorie (z.B. 'bier') verwendet.
  const drinkDistributionByCategory = {};
  for (const drinkId of customDrinkIds) {
    const entry = allCustomDrinks[drinkId];
    if (entry && Array.isArray(entry.einheiten) && entry.einheiten.length > 0 && entry.kategorie) {
      const topCat = resolveBudgetCategory(entry.kategorie);
      const catToUse = categorySet.has(entry.kategorie) ? entry.kategorie : topCat;
      const distributionFactor = normalizeDistributionFactor(drinkDistributionFactors[drinkId]);
      if (!drinkDistributionByCategory[catToUse]) {
        drinkDistributionByCategory[catToUse] = {sumFactors: 0, factorsByDrinkId: {}};
      }
      drinkDistributionByCategory[catToUse].sumFactors += distributionFactor;
      drinkDistributionByCategory[catToUse].factorsByDrinkId[drinkId] = distributionFactor;
    }
  }

  // Kategorie-Zeilen markieren, deren Bedarf bereits durch benutzerdefinierte
  // Getraenke abgedeckt ist -- diese Zeilen sind fuer die Einkaufsliste redundant.
  for (const item of ergebnis) {
    if (!item.isCustomDrink) {
      item.hasCustomDrinkCoverage = Boolean(drinkDistributionByCategory[item.kategorie]);
    }
  }

  // --- Custom drinks ---
  for (const drinkId of customDrinkIds) {
    const entry = allCustomDrinks[drinkId];
    if (!entry) {
      warnungen.push(
          `Benutzerdefiniertes Getraenk '${drinkId}' nicht gefunden -- wird uebersprungen.`,
      );
      continue;
    }

    // Fallback fuer vordefinierte Getraenke, denen (noch) keine eigene
    // Einheit zugewiesen wurde -- eigentlich sollte z.B. Mineralwasser immer
    // eine Einheit haben (siehe PREDEFINED_DRINKS), das hier faengt nur
    // unvollstaendig gepflegte Bestandsdaten ab. Ihr Bedarf steckt bereits in
    // der normalen Kategorie-Zeile, Gebinde-Angaben (gebinde/gebindeGroesseLiter)
    // liefert diese Zeile aber nicht mehr, da DRINK_WEIGHTS keine
    // Gebinde-Metadaten mehr fuehrt.
    if (entry.predefined && (!Array.isArray(entry.einheiten) || entry.einheiten.length === 0)) {
      const catRow = ergebnis.find((r) => !r.isCustomDrink && r.kategorie === entry.kategorie);
      ergebnis.push({
        kategorie: drinkId,
        drinkId,
        drinkLabel: entry.name,
        drinkKategorie: entry.kategorie || null,
        isPredefinedDrink: true,
        literOhnePuffer: catRow?.literOhnePuffer ?? null,
        literMitPuffer: catRow?.literMitPuffer ?? null,
        gebinde: catRow?.gebinde ?? null,
        gebindeGroesseLiter: catRow?.gebindeGroesseLiter ?? null,
        anzahlGebinde: catRow?.anzahlGebinde ?? null,
        ratenQuelle: catRow?.ratenQuelle ?? 'standard-faustwert',
        anteilTrinkerAngenommen: null,
        praeferenzFaktor: null,
      });
      continue;
    }

    // New model: einheiten array (no rate fields)
    if (Array.isArray(entry.einheiten) && entry.einheiten.length > 0) {
      // Determine which einheiten indices are selected for this drink
      const selectedIndices = Array.isArray(drinkSelectedEinheiten[drinkId]) && drinkSelectedEinheiten[drinkId].length > 0
        ? drinkSelectedEinheiten[drinkId]
        : [0];
      const validIndices = selectedIndices.filter((idx) => idx >= 0 && idx < entry.einheiten.length);
      const indicesToUse = validIndices.length > 0 ? validIndices : [0];

      // Kategoriebedarfe auf einzelne Getraenke verteilen, falls Kategorie bekannt.
      const topCat = entry.kategorie ? resolveBudgetCategory(entry.kategorie) : null;
      const catToUse = entry.kategorie && categorySet.has(entry.kategorie) ? entry.kategorie : topCat;
      const catLiters = catToUse ? categoryLitersMap[catToUse] : null;
      const categoryDistribution = catToUse ? drinkDistributionByCategory[catToUse] : null;
      const distributionFactor = normalizeDistributionFactor(drinkDistributionFactors[drinkId]);

      let literOhnePuffer = null;
      let literMitPuffer = null;
      if (catLiters) {
        const factor =
            categoryDistribution?.factorsByDrinkId?.[drinkId] ?? distributionFactor;
        const sumFactors =
            categoryDistribution?.sumFactors && categoryDistribution.sumFactors > 0 ?
            categoryDistribution.sumFactors :
            factor;
        literOhnePuffer = round2(catLiters.literOhnePuffer * (factor / sumFactors));
        literMitPuffer = round2(catLiters.literMitPuffer * (factor / sumFactors));
      }

      for (const einheitIdx of indicesToUse) {
        const einheit = entry.einheiten[einheitIdx];
        const gebindeLiter = Number(einheit.einheitsgroesse) || null;
        const gebindeName = einheit.gebindeinheit || null;
        const anzahlGebinde = (literMitPuffer !== null && gebindeLiter)
          ? Math.ceil(literMitPuffer / gebindeLiter)
          : null;
        const rowKategorie = indicesToUse.length > 1 ? `${drinkId}:${einheitIdx}` : drinkId;

        ergebnis.push({
          kategorie: rowKategorie,
          drinkId,
          drinkLabel: entry.name,
          drinkKategorie: entry.kategorie || null,
          isCustomDrink: true,
          einheitIdx,
          literOhnePuffer,
          literMitPuffer,
          gebinde: gebindeName,
          gebindeGroesseLiter: gebindeLiter,
          anzahlGebinde,
          ratenQuelle: catLiters ? 'kategorie-verteilung' : 'benutzerdefiniert',
          anteilTrinkerAngenommen: null,
          praeferenzFaktor: null,
          distributionFactor,
          einheiten: entry.einheiten,
        });
      }
      continue;
    }

    // Legacy model: rate-based calculation
    const anteilTrinker = entry.anteilTrinker ?? 1.0;
    const modus = entry.modus || 'stunde';

    let literErwachsene;
    if (modus === 'pauschal') {
      literErwachsene = adults * anteilTrinker * (entry.erwachsene || 0) * seasonFactor * timeFac;
    } else {
      literErwachsene =
          adults * anteilTrinker * (entry.erwachsene || 0) * hours * seasonFactor * timeFac * durFactor;
    }

    const preferenceMultiplier = 1;
    const literGesamt = literErwachsene * preferenceMultiplier;
    const literMitPuffer = literGesamt * (1 + puffer);
    const anzahlGebinde =
        entry.gebindeLiter ? Math.ceil(literMitPuffer / entry.gebindeLiter) : null;

    ergebnis.push({
      kategorie: drinkId,
      drinkLabel: entry.name,
      isCustomDrink: true,
      literOhnePuffer: round2(literGesamt),
      literMitPuffer: round2(literMitPuffer),
      gebinde: getConfiguredUnitLabel(entry.gebindeLiter) || entry.gebindeName,
      gebindeGroesseLiter: entry.gebindeLiter,
      anzahlGebinde,
      ratenQuelle: 'benutzerdefiniert',
      anteilTrinkerAngenommen: anteilTrinker !== 1.0 ? anteilTrinker : null,
      praeferenzFaktor: null,
    });
  }

  return {
    eventName: event.eventName || 'Event',
    gaeste: {erwachsene: adults, kinder: children},
    dauerStunden: hours,
    saisonFaktor: seasonFactor,
    zeitFaktor: timeFac,
    dauerFaktor: durFactor,
    eventTyp: event.eventType,
    pufferProzent,
    // Gesamtbedarf vor Kategorie-Verteilung (ohne Puffer) -- fuer spaetere
    // Kalibrierungs-Snapshots (siehe submitConsumption.js) explizit
    // mitgespeichert, damit er nicht aus ggf. spaeter geaenderten Konstanten
    // (BASE_RATE_PER_PERSON_PER_HOUR etc.) neu abgeleitet werden muss.
    gesamtbedarfErwachseneLiter: round2(totalBeverage),
    gesamtbedarfKinderLiter: round2(childrenTotalBeverage),
    ergebnis,
    warnungen,
  };
}

/**
 * Callable: calculateEventDrinks({ eventId?, event })
 * - event: Parameter-Objekt (eventName, date, durationHours, guests, season,
 *   eventType, categories, customDrinkIds, drinkDistributionFactors, pufferProzent)
 * - eventId: falls gesetzt, wird das bestehende Event-Dokument mit dem
 *   Ergebnis aktualisiert (status -> "berechnet"). Sonst wird ein neues
 *   Event-Dokument angelegt.
 * Gibt { eventId, ...Berechnungsergebnis } zurueck.
 */
exports.calculateEventDrinks = onCall({maxInstances: 10}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login erforderlich.');
  }
  const uid = request.auth.uid;
  const {event, eventId, ownerId} = request.data || {};

  if (!event || !event.durationHours || !event.guests) {
    throw new HttpsError('invalid-argument', 'event mit durationHours und guests ist erforderlich.');
  }

  const db = admin.firestore();

  // Admins may recalculate/save an event on behalf of another user (full
  // edit access to all events); everyone else may only act on their own.
  const targetUid = ownerId || uid;
  if (targetUid !== uid) {
    const userSnap = await db.collection('users').doc(uid).get();
    const role = userSnap.exists ? userSnap.data()?.role : null;
    if (role !== 'admin') {
      throw new HttpsError('permission-denied', 'Nur Admins können Events anderer Nutzer bearbeiten.');
    }
  }

  const [ratesDb, customDrinksMap, childrenRatesDb] = await Promise.all([
    loadRatesDb(db, targetUid),
    loadCustomDrinks(db, targetUid, event.customDrinkIds),
    loadChildrenDrinkWeightsFromFirestore(db),
  ]);
  const result = calculate(event, ratesDb, customDrinksMap, childrenRatesDb);

  const eventsRef = db.collection('users').doc(targetUid).collection('events');
  let docRef;
  if (eventId) {
    docRef = eventsRef.doc(eventId);
    await docRef.set({...event, berechnung: result, status: 'berechnet'}, {merge: true});
  } else {
    docRef = await eventsRef.add({...event, berechnung: result, status: 'berechnet'});
  }

  return {eventId: docRef.id, ...result};
});

// Fuer Unit-Tests (z.B. mit firebase-functions-test) ohne Firestore-Zugriff.
exports._internal = {
  calculate,
  loadCustomDrinks,
  getConfiguredUnitLabel,
  resolveTopLevelCategory,
};
