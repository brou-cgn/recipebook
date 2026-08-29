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

/**
 * Formats the guests selected for a menu as Fließtext, e.g.
 * "Gäste: Anna, Ben und Clara". Only first names are used, joined by commas
 * except between the last two, which get "und". Guest IDs that can't be
 * resolved (guest not loaded yet, or missing vorname) are silently skipped.
 * @param {string[]} guestIds - descriptionGuestIds from a menu document
 * @param {Array} guests - resolved guest profile objects (with id, vorname)
 * @returns {string} The formatted text, or '' if there are no resolvable guests
 */
export const formatMenuGuestsFliesstext = (guestIds, guests) => {
  if (!Array.isArray(guestIds) || guestIds.length === 0) return '';
  const guestList = Array.isArray(guests) ? guests : [];
  const firstNames = guestIds
    .map((id) => guestList.find((g) => g.id === id))
    .map((guest) => (typeof guest?.vorname === 'string' ? guest.vorname.trim() : ''))
    .filter((name) => name.length > 0);

  if (firstNames.length === 0) return '';
  if (firstNames.length === 1) return `Gäste: ${firstNames[0]}`;
  return `Gäste: ${firstNames.slice(0, -1).join(', ')} und ${firstNames[firstNames.length - 1]}`;
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

/**
 * Computes a per-guest preference structure for use in drink budget calculation.
 *
 * Returns an object with a `perGuest` array where each entry describes one adult
 * guest's preference profile. The backend uses this to compute per-guest budget
 * allocations: the preference fraction goes to preferred drinks/categories first,
 * and the remainder is distributed proportionally across the other available
 * categories.
 *
 * @param {Array} selectedGuests - Array of guest objects with preference properties.
 * @param {Array} drinks - Array of drink objects or IDs (used to resolve preferred drink categories).
 * @param {Array} driverGuestIds - IDs of guests marked as drivers for this event; drivers always
 *   cover their full budget with non-alcoholic drinks, regardless of their alcohol preference.
 * @returns {{ perGuest: Array }} Per-guest preference profiles for adult guests.
 */
export const computeGuestPreferenceMultipliers = (selectedGuests, drinks, driverGuestIds) => {
  const allDrinks = Array.isArray(drinks) ? drinks : [];
  const driverIds = Array.isArray(driverGuestIds) ? driverGuestIds : [];
  if (!Array.isArray(selectedGuests) || selectedGuests.length === 0) {
    return { perGuest: [] };
  }

  const normalizedDrinks = allDrinks.map((d) =>
    typeof d === 'string' ? { id: d, kategorie: null } : { id: d.id, kategorie: d.kategorie ?? null },
  );

  const perGuest = [];

  selectedGuests.forEach((guest) => {
    if (guest?.kind === true) return;

    const preferredDrinkIds = Array.isArray(guest?.bevorzugteGetränke)
      ? [...new Set(guest.bevorzugteGetränke.filter((id) => typeof id === 'string' && id.trim()))]
      : [];
    const preferredCategoryIds = Array.isArray(guest?.bevorzugteKategorien)
      ? [...new Set(guest.bevorzugteKategorien.filter((id) => typeof id === 'string' && id.trim()))]
      : [];
    const preferenceFactor = normalizePreferenceFactor(guest?.präferenzFaktor);
    const isDriver = guest?.id !== undefined && driverIds.includes(guest.id);
    const allowsAlcohol = guest?.alkoholischeGetränke !== false && !isDriver;

    // Resolve categories for specifically preferred drink IDs
    const preferredCategoryIdsFromDrinks = preferredDrinkIds.flatMap((drinkId) => {
      const drink = normalizedDrinks.find((d) => d.id === drinkId);
      if (!drink?.kategorie) return [drinkId];
      const parentId = getDrinkParentCategoryId(drink.kategorie);
      return [drink.kategorie, ...(parentId ? [parentId] : [])];
    });

    const allPreferredCategoryIds = [
      ...new Set([...preferredCategoryIds, ...preferredCategoryIdsFromDrinks]),
    ];

    perGuest.push({
      preferredDrinkIds,
      preferredCategoryIds: allPreferredCategoryIds,
      preferenceFactor: (preferredDrinkIds.length > 0 || preferredCategoryIds.length > 0) ? preferenceFactor : 0,
      allowsAlcohol,
    });
  });

  return { perGuest };
};
