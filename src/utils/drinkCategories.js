export const DRINK_CATEGORIES = [
  { id: 'wasser', label: 'Wasser' },
  { id: 'softdrinks', label: 'Softdrinks' },
  { id: 'saft', label: 'Saft' },
  {
    id: 'bier',
    label: 'Bier',
    subcategories: [
      { id: 'bier_koelsch', label: 'Kölsch' },
      { id: 'bier_pils', label: 'Pils' },
      { id: 'bier_weizen', label: 'Weizen' },
      { id: 'bier_alkoholfrei', label: 'Alkoholfreies Bier', hasOwnBudget: true },
    ],
  },
  {
    id: 'wein',
    label: 'Wein',
    subcategories: [
      { id: 'wein_weisswein', label: 'Weißwein' },
      { id: 'wein_rose', label: 'Rosé' },
      { id: 'wein_rotwein', label: 'Rotwein' },
    ],
  },
  { id: 'sekt', label: 'Sekt' },
  {
    id: 'spirituosen',
    label: 'Spirituosen',
    subcategories: [
      { id: 'longdrinks', label: 'Longdrinks', hasOwnBudget: true },
    ],
  },
  { id: 'kaffee', label: 'Kaffee' },
  { id: 'tee', label: 'Tee' },
];

/**
 * Predefined drinks that are always available for all users.
 * These drinks cannot be deleted, renamed, or have their category changed.
 * They are pre-selected at events by default.
 */
export const PREDEFINED_DRINKS = [
  {
    id: 'predefined_mineralwasser',
    name: 'Mineralwasser',
    kategorie: 'wasser',
    einheiten: [{ einheitsgroesse: 1.0, gebindeinheit: 'Flasche', einheitenProGebinde: 1 }],
    predefined: true,
  },
];

/**
 * @param {Array} customDrinks - Custom drinks, possibly from multiple owners
 *   (a shared library) when each entry carries an `ownerId`.
 * @param {string} [currentUserId] - When drinks from multiple owners can be
 *   present, only this user's own override of a predefined drink is merged
 *   into its slot; other owners' overrides of the same predefined id are
 *   ignored so they don't collide on the predefined drink's fixed id.
 */
export const mergePredefinedDrinks = (customDrinks = [], currentUserId = null) => {
  const list = Array.isArray(customDrinks) ? customDrinks : [];
  const predefinedIds = new Set(PREDEFINED_DRINKS.map((drink) => drink.id));
  const relevant = currentUserId
    ? list.filter((drink) => !predefinedIds.has(drink.id) || !drink.ownerId || drink.ownerId === currentUserId)
    : list;
  const customById = new Map(relevant.map((drink) => [drink.id, drink]));

  const mergedPredefined = PREDEFINED_DRINKS.map((predefinedDrink) => {
    const customDrink = customById.get(predefinedDrink.id);
    if (!customDrink) return predefinedDrink;
    customById.delete(predefinedDrink.id);
    return {
      ...predefinedDrink,
      ...customDrink,
      id: predefinedDrink.id,
      name: predefinedDrink.name,
      kategorie: predefinedDrink.kategorie,
      predefined: true,
    };
  });

  return [...mergedPredefined, ...customById.values()];
};

/**
 * Merge per-user "additional units" into the drinks they extend.
 *
 * Any user may maintain their own extra Einheiten for a drink owned by
 * someone else without being able to write to that owner's document (the
 * Firestore rules only let a drink's own owner/admin write it). Instead,
 * an addition is stored as an ordinary customDrinks doc under the
 * contributing user's own path, reusing the target drink's id and carrying
 * `extendsOwnerId` (the target drink's owner) to mark it as an addition
 * rather than a standalone drink. Addition docs never appear on their own
 * in the merged list – each is folded into its target drink's `einheiten`,
 * tagged with `addedByUserId` so callers can tell who contributed it.
 *
 * @param {Array} rawDrinks - Raw customDrinks docs, each annotated with
 *   `ownerId` (as produced by subscribeToAllCustomDrinks/getAllCustomDrinks).
 */
export const mergeDrinkUnitAdditions = (rawDrinks = []) => {
  const list = Array.isArray(rawDrinks) ? rawDrinks : [];
  const additions = list.filter((drink) => drink.extendsOwnerId);
  const drinks = list.filter((drink) => !drink.extendsOwnerId);

  return drinks.map((drink) => {
    const ownAdditions = additions.filter(
      (addition) => addition.extendsOwnerId === drink.ownerId && addition.id === drink.id
    );
    if (ownAdditions.length === 0) return drink;
    const addedEinheiten = ownAdditions.flatMap((addition) =>
      (Array.isArray(addition.einheiten) ? addition.einheiten : []).map((einheit) => ({
        ...einheit,
        addedByUserId: addition.ownerId,
      }))
    );
    return {
      ...drink,
      einheiten: [...(Array.isArray(drink.einheiten) ? drink.einheiten : []), ...addedEinheiten],
    };
  });
};

export const getDrinkCategoryLabel = (kategorieId) => {
  for (const cat of DRINK_CATEGORIES) {
    if (cat.id === kategorieId) return cat.label;
    if (cat.subcategories) {
      const sub = cat.subcategories.find((s) => s.id === kategorieId);
      if (sub) return sub.label;
    }
  }
  return kategorieId;
};

export const getDrinkParentCategoryId = (subcategoryId) => {
  for (const cat of DRINK_CATEGORIES) {
    if (cat.subcategories?.some((s) => s.id === subcategoryId)) {
      return cat.id;
    }
  }
  return null;
};

// Subcategories flagged hasOwnBudget have a dedicated rate/weight entry on the
// backend (functions/drinkRates.js) and must be kept as-is instead of being
// collapsed into their parent category when building an event's category list.
export const categoryHasOwnBudget = (categoryId) => {
  for (const cat of DRINK_CATEGORIES) {
    const sub = cat.subcategories?.find((s) => s.id === categoryId);
    if (sub) return Boolean(sub.hasOwnBudget);
  }
  return false;
};
