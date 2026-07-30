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
      { id: 'bier_alkoholfrei', label: 'Alkoholfreies Bier' },
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
  { id: 'spirituosen', label: 'Spirituosen' },
  { id: 'kaffee', label: 'Kaffee' },
  { id: 'tee', label: 'Tee' },
];

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
