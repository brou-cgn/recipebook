// Canonical list of every Button-Icon row (used by the grouped Button-Icons
// admin tab), plus the logic to merge "normal" / "aktiv" pairs into one row
// and to bucket them into default groups for the grouped view.
//
// Icon values themselves always live in the `buttonIcons` Firestore
// collection (see src/utils/customLists.js) as flat `key` -> value docs.
// Nothing here mutates that data - this module only describes structure
// (labels, which keys pair up, default grouping).

export const DARK_MODE_ICON_ROWS = [
  { key: 'cookingMode', label: 'Kochmodus-Button' },
  { key: 'cookingModeDefaultImg', label: 'Kochmodus-Button (Standard-Kategoriebild)' },
  { key: 'importRecipe', label: 'Import-Button' },
  { key: 'scanImage', label: 'Bild-scannen-Button' },
  { key: 'webImport', label: 'Web-Import-Button' },
  { key: 'closeButton', label: 'Schließen-Button' },
  { key: 'closeButtonDefaultImg', label: 'Schließen-Button (Allgemein)' },
  { key: 'filterButton', label: 'Filter-Button' },
  { key: 'filterButtonActive', label: 'Filter-Button (aktiv)' },
  { key: 'copyLink', label: 'Link kopieren' },
  { key: 'nutritionEmpty', label: 'Kalkulieren' },
  { key: 'nutritionFilled', label: 'Nährwerte vorhanden' },
  { key: 'nutritionRecalc', label: 'Nährwerte nachkalkulieren' },
  { key: 'ratingHeartEmpty', label: 'Bewertung (leer)' },
  { key: 'ratingHeartEmptyModal', label: 'Bewertung Modal (leer)' },
  { key: 'ratingHeartFilled', label: 'Bewertung (gefüllt)' },
  { key: 'shoppingList', label: 'Einkaufslisten-Button' },
  { key: 'listSettings', label: 'Einstellungen-Button (private Liste)' },
  { key: 'listSettingsActive', label: 'Einstellungen-Button (private Liste geöffnet)' },
  { key: 'bringButton', label: 'Bring!-Button' },
  { key: 'timerStart', label: 'Timer starten' },
  { key: 'timerStop', label: 'Timer stoppen' },
  { key: 'cookDate', label: 'Kochdatum' },
  { key: 'addRecipe', label: 'Hinzufügen (Allgemein)' },
  { key: 'editRecipe', label: 'Rezept bearbeiten' },
  { key: 'addPrivateRecipe', label: 'Privates Rezept hinzufügen' },
  { key: 'addGroupMember', label: 'Mitglied hinzufügen' },
  { key: 'saveRecipe', label: 'Speichern (Allgemein)' },
  { key: 'swipeRight', label: 'Swipe rechts (Ja)' },
  { key: 'swipeLeft', label: 'Swipe links (Nein)' },
  { key: 'swipeUp', label: 'Swipe hoch (Favorit)' },
  { key: 'swipeDelete', label: 'Swipe löschen (Rezeptformular)' },
  { key: 'menuFavoritesButton', label: 'Menü-Favoriten' },
  { key: 'menuFavoritesButtonActive', label: 'Menü-Favoriten (aktiv)' },
  { key: 'privateBadge', label: 'Privat-Badge (Menü/Rezept)' },
  { key: 'tagesmenuZumTagesMenu', label: 'Zum Tagesmenü' },
  { key: 'tagesmenuMeineAuswahl', label: 'Meine Auswahl' },
  { key: 'tagesmenuKachelMenu', label: 'Tagesmenü-Kachelmenü' },
  { key: 'tagesmenuKachelMenuAlt', label: 'Tagesmenü-Kachelmenü (dunkles Bild)' },
  { key: 'newVersion', label: 'Neue Version' },
  { key: 'publishRecipe', label: 'Rezept veröffentlichen' },
  { key: 'deleteRecipe', label: 'Rezept löschen' },
  { key: 'printRecipe', label: 'Rezept drucken' },
  { key: 'addSection', label: 'Abschnitt hinzufügen (Menü bearbeiten)' },
  { key: 'resetThumbnail', label: 'Thumbnail-Löschen-Button (FAB)' },
  { key: 'recipeSourceLink', label: 'Rezeptquelle öffnen (Webimport)' },
  { key: 'recipeCardSwipeRight', label: 'Rezeptkarte: Rechts-Swipe-Button' },
  { key: 'addImage', label: 'Bild hinzufügen (neben Titel)' },
  { key: 'trendingDifficultyIcon', label: 'Trend-Kachel: Icon vor Schwierigkeitsgrad' },
  { key: 'trendingTimeIcon', label: 'Trend-Kachel: Icon vor Zubereitungszeit' },
  { key: 'kuecheFab', label: 'Küche-FAB-Button' },
  { key: 'eventsDrinksFab', label: 'Events: Getränke-FAB (Mobile)' },
  { key: 'eventsGuestsFab', label: 'Events: Gästeübersicht-FAB (Mobile)' },
  { key: 'bottomNavHome', label: 'Bottom Navigation: Küche' },
  { key: 'bottomNavRecipes', label: 'Bottom Navigation: Kochbuch' },
  { key: 'bottomNavMenus', label: 'Bottom Navigation: Festtafel' },
  { key: 'bottomNavAtelier', label: 'Bottom Navigation: Atelier' },
  { key: 'bottomNavChef', label: 'Bottom Navigation: Chefkoch' },
  { key: 'bottomNavHomeActive', label: 'Bottom Navigation: Küche (aktiv)' },
  { key: 'bottomNavRecipesActive', label: 'Bottom Navigation: Kochbuch (aktiv)' },
  { key: 'bottomNavMenusActive', label: 'Bottom Navigation: Festtafel (aktiv)' },
  { key: 'bottomNavAtelierActive', label: 'Bottom Navigation: Atelier (aktiv)' },
  { key: 'bottomNavChefActive', label: 'Bottom Navigation: Chefkoch (aktiv)' },
];

/**
 * Merges "<key>" / "<key>Active" pairs from DARK_MODE_ICON_ROWS into single
 * rows carrying all four variant keys (light normal/active, dark normal/active).
 * Rows without a matching "Active" counterpart keep `activeKey`/`darkActiveKey`
 * as null - there simply is no separate "aktiv" state for that button.
 * @returns {Array<{key:string,label:string,activeKey:string|null,darkKey:string,darkActiveKey:string|null}>}
 */
export function mergeButtonIconRowDefs() {
  const keys = new Set(DARK_MODE_ICON_ROWS.map((r) => r.key));
  const rows = [];
  for (const { key, label } of DARK_MODE_ICON_ROWS) {
    if (key.endsWith('Active') && keys.has(key.slice(0, -'Active'.length))) {
      continue; // merged into its base row below
    }
    const activeKey = keys.has(key + 'Active') ? key + 'Active' : null;
    rows.push({
      key,
      label: label.replace(/\s*\(aktiv\)\s*$/, ''),
      activeKey,
      darkKey: key + 'Dark',
      darkActiveKey: activeKey ? activeKey + 'Dark' : null,
    });
  }
  return rows;
}

// Default bucketing of the 57 merged rows into named groups for the grouped
// Button-Icons admin tab. Purely organisational - editable/reorderable by
// admins afterwards via `buttonIconGroups` (see customLists.js).
const BUTTON_ICON_GROUP_DEFS = [
  { id: 'g-kochmodus', name: 'Kochmodus', keys: ['cookingMode', 'cookingModeDefaultImg'] },
  { id: 'g-trend-kacheln', name: 'Trend-Kacheln', keys: ['trendingDifficultyIcon', 'trendingTimeIcon'] },
  { id: 'g-import', name: 'Import & Erfassung', keys: ['importRecipe', 'scanImage', 'webImport'] },
  { id: 'g-allgemein', name: 'Allgemeine Aktionen', keys: ['closeButton', 'closeButtonDefaultImg', 'filterButton', 'addRecipe', 'editRecipe', 'saveRecipe', 'copyLink'] },
  { id: 'g-rezept-details', name: 'Rezept-Details', keys: ['nutritionEmpty', 'nutritionFilled', 'nutritionRecalc', 'ratingHeartEmpty', 'ratingHeartEmptyModal', 'ratingHeartFilled', 'cookDate', 'printRecipe', 'publishRecipe', 'deleteRecipe', 'newVersion', 'recipeSourceLink', 'addImage', 'resetThumbnail'] },
  { id: 'g-rezeptformular', name: 'Rezeptformular', keys: ['swipeRight', 'swipeLeft', 'swipeUp', 'swipeDelete', 'addSection', 'recipeCardSwipeRight', 'addPrivateRecipe'] },
  { id: 'g-einkaufsliste', name: 'Einkaufsliste', keys: ['shoppingList', 'listSettings', 'bringButton'] },
  { id: 'g-timer', name: 'Timer', keys: ['timerStart', 'timerStop'] },
  { id: 'g-tagesmenu', name: 'Menü & Tagesmenü', keys: ['menuFavoritesButton', 'privateBadge', 'tagesmenuZumTagesMenu', 'tagesmenuMeineAuswahl', 'tagesmenuKachelMenu', 'tagesmenuKachelMenuAlt'] },
  { id: 'g-kueche-events', name: 'Küche & Events', keys: ['kuecheFab', 'eventsDrinksFab', 'eventsGuestsFab'] },
  { id: 'g-gruppen', name: 'Gruppen', keys: ['addGroupMember'] },
  { id: 'g-bottom-nav', name: 'Bottom Navigation', keys: ['bottomNavHome', 'bottomNavRecipes', 'bottomNavMenus', 'bottomNavAtelier', 'bottomNavChef'] },
];

/**
 * Builds the default `buttonIconGroups` structure (used the first time an
 * admin opens the grouped Button-Icons tab, before anything has been saved).
 * @returns {{groups: Array<{id:string,name:string,rowKeys:Array<{key:string,label:string}>}>, hiddenRowKeys: string[]}}
 */
export function getDefaultButtonIconGroups() {
  const rowsByKey = new Map(mergeButtonIconRowDefs().map((r) => [r.key, r]));
  const bucketed = new Set();
  const groups = BUTTON_ICON_GROUP_DEFS.map(({ id, name, keys }) => ({
    id,
    name,
    rowKeys: keys
      .filter((key) => rowsByKey.has(key))
      .map((key) => {
        bucketed.add(key);
        return { key, label: rowsByKey.get(key).label };
      }),
  }));

  // Safety net: any merged row not covered by BUTTON_ICON_GROUP_DEFS (e.g. a
  // future icon added to DARK_MODE_ICON_ROWS but not yet bucketed) lands in a
  // catch-all group instead of silently disappearing from the grouped view.
  const leftover = [...rowsByKey.values()].filter((r) => !bucketed.has(r.key));
  if (leftover.length > 0) {
    groups.push({
      id: 'g-sonstiges',
      name: 'Sonstiges',
      rowKeys: leftover.map((r) => ({ key: r.key, label: r.label })),
    });
  }

  return { groups, hiddenRowKeys: [] };
}
