import { DRINK_CATEGORIES, getDrinkParentCategoryId } from './drinkCategories';

const ALCOHOLIC_CATEGORY_IDS = ['bier', 'wein', 'sekt', 'spirituosen'];
const NON_ALCOHOLIC_SUBCATEGORY_IDS = ['bier_alkoholfrei'];

const ALLOWED_PREFERENCE_FACTORS = [0, 0.25, 0.5, 0.75, 1];

export const normalizePreferenceFactor = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return ALLOWED_PREFERENCE_FACTORS.includes(numeric) ? numeric : 0;
};

export const getGuestDisplayName = (guest) => {
  const firstName = typeof guest?.vorname === 'string' ? guest.vorname.trim() : '';
  const lastName = typeof guest?.nachname === 'string' ? guest.nachname.trim() : '';
  return `${firstName} ${lastName}`.trim();
};

export const countGuestsByCategory = (guests) => {
  if (!Array.isArray(guests) || guests.length === 0) {
    return { adults: 0, children: 0 };
  }

  return guests.reduce((counts, guest) => {
    if (guest?.kind === true) {
      counts.children += 1;
    } else {
      counts.adults += 1;
    }
    return counts;
  }, { adults: 0, children: 0 });
};

const isDrinkCategoryPreferred = (drinkKategorie, preferredCategoryIds) => {
  if (!drinkKategorie || preferredCategoryIds.length === 0) return false;
  if (preferredCategoryIds.includes(drinkKategorie)) return true;
  const parentId = getDrinkParentCategoryId(drinkKategorie);
  return parentId !== null && preferredCategoryIds.includes(parentId);
};

const isDrinkAlcoholic = (drinkId, drinkKategorie) => {
  if (drinkKategorie) {
    if (NON_ALCOHOLIC_SUBCATEGORY_IDS.includes(drinkKategorie)) return false;
    if (ALCOHOLIC_CATEGORY_IDS.includes(drinkKategorie)) return true;
    const parentId = getDrinkParentCategoryId(drinkKategorie);
    if (parentId && ALCOHOLIC_CATEGORY_IDS.includes(parentId)) return true;
  }
  return ALCOHOLIC_CATEGORY_IDS.includes(drinkId);
};

export const computeGuestPreferenceMultipliers = (selectedGuests, drinks) => {
  const allDrinks = Array.isArray(drinks) ? drinks : [];
  if (!Array.isArray(selectedGuests) || selectedGuests.length === 0 || allDrinks.length === 0) {
    return {};
  }

  const normalizedDrinks = allDrinks.map((d) =>
    typeof d === 'string' ? { id: d, kategorie: null } : { id: d.id, kategorie: d.kategorie ?? null },
  );

  const totals = Object.fromEntries(normalizedDrinks.map(({ id }) => [id, 0]));

  selectedGuests.forEach((guest) => {
    const preferredDrinkIds = Array.isArray(guest?.bevorzugteGetränke)
      ? [...new Set(guest.bevorzugteGetränke.filter((id) => typeof id === 'string' && id.trim()))]
      : [];
    const preferredCategoryIds = Array.isArray(guest?.bevorzugteKategorien)
      ? [...new Set(guest.bevorzugteKategorien.filter((id) => typeof id === 'string' && id.trim()))]
      : [];
    const preferenceFactor = normalizePreferenceFactor(guest?.präferenzFaktor);
    const hasExplicitPreferences =
      (preferredDrinkIds.length > 0 || preferredCategoryIds.length > 0) && preferenceFactor > 0;
    const nonPreferredMultiplier = hasExplicitPreferences ? Math.max(0, 1 - preferenceFactor) : 1;
    const allowsAlcohol = guest?.alkoholischeGetränke !== false;

    normalizedDrinks.forEach(({ id: drinkId, kategorie: drinkKategorie }) => {
      let multiplier = nonPreferredMultiplier;
      if (hasExplicitPreferences) {
        const isDrinkPreferred =
          preferredDrinkIds.includes(drinkId) ||
          isDrinkCategoryPreferred(drinkKategorie, preferredCategoryIds);
        if (isDrinkPreferred) {
          multiplier = 1;
        }
      }
      if (!allowsAlcohol && isDrinkAlcoholic(drinkId, drinkKategorie)) {
        multiplier = 0;
      }
      totals[drinkId] += multiplier;
    });
  });

  return Object.fromEntries(
    Object.entries(totals).map(([drinkId, total]) => [drinkId, Math.round((total / selectedGuests.length) * 100) / 100]),
  );
};
