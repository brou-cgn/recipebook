/**
 * CSV-Export aller Rezepte mit Vorschlägen für Themenschlagwörter.
 *
 * Die Datei ist für Excel (DE) gebaut – Semikolon, UTF-8 mit BOM, CRLF – und für
 * die manuelle Nacharbeit mit späterem Reimport: Schlüssel ist die Spalte "ID",
 * je Schlagwort-Achse gibt es eine Spalte, mehrere Werte stehen mit ", " getrennt.
 *
 * Die Vorschläge sind regelbasiert und bewusst konservativ: lieber eine leere
 * Zelle als ein falsches Schlagwort. Nicht abgeleitet werden Allergen-Angaben
 * (Glutenfrei, Laktosefrei) – die lassen sich aus Zutatentexten nicht sicher lesen.
 */
import { decodeRecipeLink } from './recipeLinks';
import { isLowCarb } from './lowCarb';

export const KEYWORD_AXES = [
  {
    key: 'anlass',
    header: 'Anlass',
    values: [
      'Alltag', 'Schnell unter der Woche', 'Gäste & Dinner', 'Party & Buffet', 'Grillabend',
      'Date Night', 'Familienessen', 'Kindergeburtstag', 'Brunch', 'Sonntagsessen',
    ],
  },
  {
    key: 'saison',
    header: 'Saison',
    values: [
      'Frühling', 'Sommer', 'Herbst', 'Winter', 'Weihnachten', 'Ostern', 'Silvester',
      'Spargelzeit', 'Erntezeit',
    ],
  },
  {
    key: 'aufwand',
    header: 'Aufwand',
    values: [
      '15-Minuten-Gericht', 'Unter 30 Min', 'Wenig Aufwand', 'Meal Prep', 'Vorbereiten',
      'Aufwendig / Wochenendprojekt', 'One-Pot', 'Ofengericht',
    ],
  },
  {
    key: 'ernaehrung',
    header: 'Ernährung',
    values: [
      'Low Carb', 'High Protein', 'Leicht & frisch', 'Gesund', 'Kalorienarm', 'Glutenfrei',
      'Laktosefrei', 'Kinderfreundlich', 'Comfort Food',
    ],
  },
  {
    key: 'hauptzutat',
    header: 'Hauptzutat',
    values: [
      'Fleisch', 'Geflügel', 'Fisch & Meeresfrüchte', 'Gemüse', 'Pasta', 'Reis & Getreide',
      'Kartoffeln', 'Hülsenfrüchte', 'Eier', 'Käse', 'Brot & Teig',
    ],
  },
];

const MAX_MAIN_INGREDIENTS = 2;

const asList = (value) => {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

const itemText = (item) => (typeof item === 'string' ? item : item?.text || '');

const ingredientLines = (recipe) =>
  (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((item) => typeof item === 'string' || item?.type !== 'heading')
    .map(itemText)
    .filter((text) => text && !decodeRecipeLink(text));

const stepLines = (recipe) =>
  (Array.isArray(recipe.steps) ? recipe.steps : [])
    .filter((item) => typeof item === 'string' || item?.type !== 'heading')
    .map(itemText)
    .filter(Boolean);

const has = (pattern, text) => pattern.test(text);

// Zeilen, die Brühe/Gewürz/Sauce nennen, sagen nichts über die Hauptzutat aus.
const NOISE_LINE = /brühe|bouillon|fond\b|gewürz|sauce|soße|würz/i;

const MAIN_INGREDIENT_RULES = [
  ['Geflügel', /hähnchen|hühn|huhn|pute|puten|truthahn|\bente\b|\bgans\b|geflügel|chicken/i],
  ['Fleisch', /rind|schwein|\bhack|lamm|speck|schinken|wurst|steak|kalb|gulasch|bacon|filet\b/i],
  ['Fisch & Meeresfrüchte', /lachs|thunfisch|forelle|garnele|shrimp|scampi|kabeljau|dorsch|seelachs|hering|muschel|tintenfisch|\bfisch/i],
  ['Pasta', /spaghetti|nudel|penne|tagliatelle|fusilli|pasta|lasagne|maccheroni|rigatoni|farfalle|linguine|tortellini/i],
  ['Reis & Getreide', /\breis\b|couscous|bulgur|quinoa|hirse|haferflocken|polenta|risotto/i],
  ['Kartoffeln', /kartoffel|gnocchi/i],
  ['Hülsenfrüchte', /linsen|kichererbsen|bohnen|erbsen|tofu/i],
  ['Brot & Teig', /hefe\b|blätterteig|pizzateig|hefeteig|toast|brötchen|baguette|ciabatta|fladenbrot/i],
];

const TITLE_ONLY_RULES = [
  ['Eier', /rührei|omelett|spiegelei|\beier|frittata/i],
  ['Käse', /käse|mozzarella|feta|raclette|fondue|halloumi/i],
];

const VEGETABLES = /tomate|zucchini|paprika|brokkoli|blumenkohl|karotte|möhre|spinat|aubergine|kürbis|champignon|pilz|lauch|fenchel|spargel|kohl|gurke|sellerie|mangold/i;

export function suggestMainIngredients(recipe) {
  const title = recipe.title || '';
  const lines = ingredientLines(recipe).filter((line) => !NOISE_LINE.test(line));
  const scored = [];

  for (const [label, pattern] of MAIN_INGREDIENT_RULES) {
    const score = lines.filter((line) => has(pattern, line)).length + (has(pattern, title) ? 3 : 0);
    if (score > 0) scored.push([label, score]);
  }
  for (const [label, pattern] of TITLE_ONLY_RULES) {
    if (has(pattern, title)) scored.push([label, 3]);
  }
  const vegetableScore = lines.filter((line) => has(VEGETABLES, line)).length;
  if (vegetableScore >= 3 || has(VEGETABLES, title)) scored.push(['Gemüse', vegetableScore + 1]);

  if (asList(recipe.speisekategorie).includes('Gebäcke & Teige') && !scored.some(([l]) => l === 'Brot & Teig')) {
    scored.push(['Brot & Teig', 1]);
  }

  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MAIN_INGREDIENTS)
    .map(([label]) => label);
}

const SEASON_RULES = [
  ['Weihnachten', /plätzchen|lebkuchen|glühwein|stollen|spekulatius|weihnacht|bratapfel/i],
  ['Ostern', /oster|osterlamm|osterbrot/i],
  ['Silvester', /silvester|fondue|raclette/i],
  ['Spargelzeit', /spargel/i],
  ['Frühling', /bärlauch|rhabarber/i],
  ['Sommer', /wassermelone|beerenkaltschale|gazpacho|eiscreme|\beis\b/i],
  ['Herbst', /kürbis|pfifferling|steinpilz|maronen|kastanie/i],
  ['Winter', /grünkohl|rosenkohl|rotkohl|schwarzwurzel|glühwein/i],
];

export function suggestSeasons(recipe) {
  const cuisines = asList(recipe.kulinarik);
  const categories = asList(recipe.speisekategorie);
  const text = [recipe.title || '', ...ingredientLines(recipe)].join(' \n ');
  const result = [];

  if (cuisines.includes('Weihnachtliche Küche')) result.push('Weihnachten');
  for (const [label, pattern] of SEASON_RULES) {
    // Zutaten zählen nur für eindeutig saisonale Begriffe; Titel reicht immer.
    if (!result.includes(label) && has(pattern, text)) result.push(label);
  }
  if (categories.includes('Grillrezepte') && !result.includes('Sommer')) result.push('Sommer');
  return result.slice(0, 2);
}

export function suggestEffort(recipe) {
  const minutes = Number(recipe.kochdauer);
  const difficulty = Number(recipe.schwierigkeit);
  const title = recipe.title || '';
  const categories = asList(recipe.speisekategorie);
  const steps = stepLines(recipe).join(' \n ');
  const result = [];

  if (Number.isFinite(minutes) && minutes > 0) {
    if (minutes <= 15) result.push('15-Minuten-Gericht');
    else if (minutes <= 30) result.push('Unter 30 Min');
  }
  if (Number.isFinite(difficulty) && difficulty > 0 && difficulty <= 1 && ingredientLines(recipe).length <= 7) {
    result.push('Wenig Aufwand');
  }
  if ((Number.isFinite(minutes) && minutes >= 120) || difficulty >= 5) {
    result.push('Aufwendig / Wochenendprojekt');
  }
  if (has(/one[\s-]?pot|eintopf/i, title) || categories.includes('Suppen & Eintöpfe')) {
    result.push('One-Pot');
  }
  const isBakedGood = categories.some((c) => ['Gebäcke & Teige', 'Kuchen & Torten', 'Desserts'].includes(c));
  if (!isBakedGood && has(/backofen|\bofen\b|auflaufform|backblech/i, steps)) result.push('Ofengericht');
  if (has(/über nacht|einfrieren|vorbereiten|vorkochen|meal prep/i, `${title} \n ${steps}`)) {
    result.push('Vorbereiten');
  }
  return result;
}

export function suggestOccasions(recipe) {
  const minutes = Number(recipe.kochdauer);
  const difficulty = Number(recipe.schwierigkeit);
  const title = recipe.title || '';
  const categories = asList(recipe.speisekategorie);
  const result = [];

  if (categories.includes('Grillrezepte') || has(/grill/i, title)) result.push('Grillabend');
  if (categories.includes('Appetizer') || categories.includes('Dips & Saucen') || has(/fingerfood|buffet|\bdip\b/i, title)) {
    result.push('Party & Buffet');
  }
  if (has(/brunch|pancake|frühstück|rührei|croissant/i, title)) result.push('Brunch');
  if (difficulty >= 4 && categories.some((c) => ['Hauptspeisen', 'Vorspeisen', 'Desserts'].includes(c))) {
    result.push('Gäste & Dinner');
  }
  const isMain = categories.includes('Hauptspeisen') || categories.includes('Suppen & Eintöpfe');
  if (isMain && Number.isFinite(minutes) && minutes > 0 && minutes <= 30 && difficulty <= 2) {
    result.push('Schnell unter der Woche');
  }
  return result.slice(0, 2);
}

export function suggestNutrition(recipe) {
  const result = [];
  const cuisines = asList(recipe.kulinarik);
  // Low Carb kommt aus der bestehenden Logik (Tag in Kulinarik bzw. Nährwert-Prüfung),
  // nicht aus einer zweiten Heuristik.
  let lowCarb = cuisines.includes('Low Carb');
  if (!lowCarb) {
    try {
      const verdict = isLowCarb(recipe);
      lowCarb = Boolean(verdict && verdict.qualifies);
    } catch {
      lowCarb = false;
    }
  }
  if (lowCarb) result.push('Low Carb');
  if (asList(recipe.speisekategorie).includes('Salate')) result.push('Leicht & frisch');
  return result;
}

export function suggestKeywords(recipe) {
  const isDrink = asList(recipe.speisekategorie).includes('Drinks');
  return {
    anlass: suggestOccasions(recipe),
    saison: suggestSeasons(recipe),
    aufwand: suggestEffort(recipe),
    ernaehrung: suggestNutrition(recipe),
    hauptzutat: isDrink ? [] : suggestMainIngredients(recipe),
  };
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Escape für eine Zelle: Semikolon-CSV, Excel-Formel-Schutz (CSV-Injection). */
export function escapeCsvCell(value) {
  let text = value == null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const formatCreatedAt = (value) => {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

export const CSV_HEADERS = [
  'ID', 'Name', 'Kulinarik', 'Speisekategorie', 'Zubereitung (Min)', 'Schwierigkeit', 'Erstellt am',
  ...KEYWORD_AXES.map((axis) => axis.header),
  'Zutaten',
];

/**
 * Baut den kompletten CSV-Text (mit BOM) für alle übergebenen Rezepte.
 * @param {Array<Object>} recipes
 * @returns {string}
 */
export function buildRecipesKeywordCsv(recipes) {
  const rows = [CSV_HEADERS];
  const sorted = [...(recipes || [])].sort((a, b) =>
    String(a.title || '').localeCompare(String(b.title || ''), 'de'));

  for (const recipe of sorted) {
    const keywords = suggestKeywords(recipe);
    rows.push([
      recipe.id || '',
      recipe.title || '',
      asList(recipe.kulinarik).join(', '),
      asList(recipe.speisekategorie).join(', '),
      recipe.kochdauer ?? '',
      recipe.schwierigkeit ?? '',
      formatCreatedAt(recipe.createdAt),
      ...KEYWORD_AXES.map((axis) => keywords[axis.key].join(', ')),
      ingredientLines(recipe).join(' | '),
    ]);
  }

  const body = rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n');
  return `﻿${body}\r\n`;
}

/** Löst den Browser-Download der CSV aus. */
export function downloadRecipesKeywordCsv(recipes, filename = 'rezepte-schlagwoerter.csv') {
  const csv = buildRecipesKeywordCsv(recipes);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
