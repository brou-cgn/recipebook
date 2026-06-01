import {
  NUTRITION_REFERENCE_BOOLEAN_FIELDS,
  parseNutritionReferenceFallbackWeight,
  parseNutritionReferenceBooleanFields,
  parseNutritionReferenceSynonyms,
  parseNutritionReferencePossibleUnits,
} from './nutritionReferenceUtils';

const REQUIRED_HEADERS = ['ingredientID', 'synonyms'];
const CSV_HEADERS = [
  'ingredientID',
  'nutritionFamily',
  'seasonalFamily',
  'category',
  'Quelle',
  'Suchbegriff',
  ...NUTRITION_REFERENCE_BOOLEAN_FIELDS,
  'synonyms',
  'possibleUnits',
  'defaultAmountG',
  'kalorien',
  'protein',
  'fett',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'salz',
];

const parseDelimitedLine = (line, delimiter) => {
  const values = [];
  let currentValue = '';
  let inQuotes = false;
  let index = 0;

  while (index < line.length) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && index + 1 < line.length && line[index + 1] === '"') {
        currentValue += '"';
        index += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
        index += 1;
        continue;
      }
    }

    if (!inQuotes && char === delimiter) {
      values.push(currentValue.trim());
      currentValue = '';
      index += 1;
      continue;
    }

    currentValue += char;
    index += 1;
  }

  values.push(currentValue.trim());
  return values;
};

const detectDelimiter = (headerLine) => {
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return semicolonCount >= commaCount ? ';' : ',';
};

const escapeCsvValue = (value) => {
  if (value == null) return '';
  const text = String(value);
  if (/[;"\n\r,]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export function createNutritionReferenceCsv(rows = []) {
  const header = CSV_HEADERS.join(';');
  const body = rows.map((row) => (
    CSV_HEADERS.map((field) => {
      if (field === 'synonyms') {
        const synonyms = parseNutritionReferenceSynonyms(row);
        return escapeCsvValue(synonyms.join('|'));
      }
      if (field === 'possibleUnits') {
        const units = parseNutritionReferencePossibleUnits(row);
        return escapeCsvValue(units.join('|'));
      }
      if (NUTRITION_REFERENCE_BOOLEAN_FIELDS.includes(field)) {
        if (row[field] === true) return 'true';
        if (row[field] === false) return 'false';
        return '';
      }
      if (field === 'Quelle') {
        return escapeCsvValue(row.source ?? '');
      }
      if (field === 'Suchbegriff') {
        return escapeCsvValue(row.searchTerm ?? '');
      }
      return escapeCsvValue(row[field] ?? '');
    }).join(';')
  ));

  return [header, ...body].join('\n');
}

export function parseNutritionReferenceCsv(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV-Import benötigt mindestens eine Header-Zeile und eine Datenzeile.');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`CSV-Header unvollständig. Fehlende Felder: ${missingHeaders.join(', ')}`);
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseDelimitedLine(line, delimiter);
    const raw = {};
    headers.forEach((header, headerIndex) => {
      raw[header] = values[headerIndex] || '';
    });

    const ingredientID = String(raw.ingredientID || '').trim();
    if (!ingredientID) {
      throw new Error(`Zeile ${index + 2}: ingredientID fehlt.`);
    }

    const synonyms = parseNutritionReferenceSynonyms({
      synonyms: String(raw.synonyms || '')
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean),
    });
    if (synonyms.length === 0) {
      throw new Error(`Zeile ${index + 2}: Mindestens ein Synonym ist erforderlich.`);
    }

    const possibleUnits = parseNutritionReferencePossibleUnits({ possibleUnits: raw.possibleUnits || '' });

    const fallbackWeight = parseNutritionReferenceFallbackWeight({ defaultAmountG: raw.defaultAmountG });
    const nutritionFamily = String(raw.nutritionFamily || raw.family || '').trim();
    const seasonalFamily = String(raw.seasonalFamily || '').trim();
    const source = String(raw.Quelle || raw.source || '').trim();
    const searchTerm = String(raw.Suchbegriff || raw.searchTerm || '').trim();

    return {
      ingredientID,
      nutritionFamily,
      seasonalFamily,
      category: String(raw.category || '').trim(),
      source,
      searchTerm,
      ...parseNutritionReferenceBooleanFields(raw),
      synonyms,
      possibleUnits,
      ...(fallbackWeight != null ? { defaultAmountG: fallbackWeight } : {}),
      kalorien: raw.kalorien,
      protein: raw.protein,
      fett: raw.fett,
      kohlenhydrate: raw.kohlenhydrate,
      zucker: raw.zucker,
      ballaststoffe: raw.ballaststoffe,
      salz: raw.salz,
    };
  });

  const duplicates = rows
    .map((row) => row.ingredientID)
    .filter((id, index, list) => list.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`Doppelte ingredientID gefunden: ${[...new Set(duplicates)].join(', ')}`);
  }

  return rows;
}
