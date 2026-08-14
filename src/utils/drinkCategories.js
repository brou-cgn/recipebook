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

export const mergePredefinedDrinks = (customDrinks = []) => {
  const customById = new Map((Array.isArray(customDrinks) ? customDrinks : []).map((drink) => [drink.id, drink]));

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
