const ALCOHOLIC_CATEGORY_IDS = ['bier', 'wein', 'sekt', 'spirituosen'];

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

export const computeGuestPreferenceMultipliers = (selectedGuests, drinkIds) => {
  const allDrinkIds = Array.isArray(drinkIds) ? drinkIds : [];
  if (!Array.isArray(selectedGuests) || selectedGuests.length === 0 || allDrinkIds.length === 0) {
    return {};
  }

  const totals = Object.fromEntries(allDrinkIds.map((id) => [id, 0]));

  selectedGuests.forEach((guest) => {
    const preferredDrinkIds = Array.isArray(guest?.bevorzugteGetränke)
      ? [...new Set(guest.bevorzugteGetränke.filter((id) => typeof id === 'string' && id.trim()))]
      : [];
    const preferenceFactor = normalizePreferenceFactor(guest?.präferenzFaktor);
    const hasExplicitPreferences = preferredDrinkIds.length > 0 && preferenceFactor > 0;
    const nonPreferredMultiplier = hasExplicitPreferences ? Math.max(0, 1 - preferenceFactor) : 1;
    const allowsAlcohol = guest?.alkoholischeGetränke !== false;

    allDrinkIds.forEach((drinkId) => {
      let multiplier = nonPreferredMultiplier;
      if (hasExplicitPreferences && preferredDrinkIds.includes(drinkId)) {
        multiplier = 1;
      }
      if (!allowsAlcohol && ALCOHOLIC_CATEGORY_IDS.includes(drinkId)) {
        multiplier = 0;
      }
      totals[drinkId] += multiplier;
    });
  });

  return Object.fromEntries(
    Object.entries(totals).map(([drinkId, total]) => [drinkId, Math.round((total / selectedGuests.length) * 100) / 100]),
  );
};

