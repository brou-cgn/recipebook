const REQUIRED_HEADERS = ['id', 'name', 'mainSeasonMonths', 'seasonScore', 'labelMode', 'region'];

const normalizeDelimitedList = (value, splitter = /[|,]/) => {
  if (!value) return [];
  return String(value)
    .split(splitter)
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeMonthArray = (value, rowNumber, fieldName) => {
  const monthTokens = normalizeDelimitedList(value, /[|,\s]+/);
  const months = [...new Set(monthTokens.map((token) => Number(token)))].filter((month) => Number.isInteger(month));

  if (months.length === 0) {
    return [];
  }

  const invalidMonth = months.find((month) => month < 1 || month > 12);
  if (invalidMonth) {
    throw new Error(`Zeile ${rowNumber}: ${fieldName} enthält ungültigen Monat "${invalidMonth}" (erlaubt: 1-12).`);
  }

  return months.sort((a, b) => a - b);
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (['true', '1', 'ja', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'nein', 'no'].includes(normalized)) return false;
  throw new Error('Aktiv muss true/false, 1/0 oder ja/nein sein.');
};

const parseDelimitedLine = (line, delimiter) => {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      values.push(currentValue.trim());
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  values.push(currentValue.trim());
  return values;
};

const detectDelimiter = (headerLine) => {
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
};

const normalizeEntry = (rawEntry, rowNumber, options) => {
  const entry = {
    id: String(rawEntry.id || '').trim(),
    name: String(rawEntry.name || '').trim(),
    category: String(rawEntry.category || '').trim() || undefined,
    mainSeasonMonths: normalizeMonthArray(rawEntry.mainSeasonMonths, rowNumber, 'Hauptsaison-Monate'),
    secondarySeasonMonths: normalizeMonthArray(rawEntry.secondarySeasonMonths, rowNumber, 'Nebensaison-Monate'),
    seasonScore: Number(rawEntry.seasonScore),
    labelMode: String(rawEntry.labelMode || '').trim(),
    isActive: normalizeBoolean(rawEntry.isActive),
    region: String(rawEntry.region || '').trim(),
    synonyms: normalizeDelimitedList(rawEntry.synonyms),
    description: String(rawEntry.description || '').trim() || undefined
  };

  if (!entry.id) throw new Error(`Zeile ${rowNumber}: Feld "id" fehlt.`);
  if (!entry.name) throw new Error(`Zeile ${rowNumber}: Feld "name" fehlt.`);
  if (entry.mainSeasonMonths.length === 0) throw new Error(`Zeile ${rowNumber}: Mindestens ein Hauptsaison-Monat ist erforderlich.`);
  if (!Number.isFinite(entry.seasonScore) || entry.seasonScore < 0 || entry.seasonScore > 100) {
    throw new Error(`Zeile ${rowNumber}: seasonScore muss zwischen 0 und 100 liegen.`);
  }
  if (!options.labelModeOptions.includes(entry.labelMode)) {
    throw new Error(`Zeile ${rowNumber}: labelMode "${entry.labelMode}" ist ungültig.`);
  }
  if (!options.regionOptions.includes(entry.region)) {
    throw new Error(`Zeile ${rowNumber}: region "${entry.region}" ist ungültig.`);
  }

  if (entry.synonyms.length === 0) {
    entry.synonyms = undefined;
  }

  return entry;
};

const parseCsvImport = (content, options) => {
  const lines = content
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

  const parsed = [];
  const errors = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseDelimitedLine(lines[index], delimiter);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || '';
    });

    try {
      parsed.push(normalizeEntry(row, index + 1, options));
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (parsed.length === 0) {
    throw new Error(`Import fehlgeschlagen:\n${errors.join('\n')}`);
  }

  return {
    entries: parsed,
    errors
  };
};

const parseJsonImport = (content, options) => {
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    throw new Error('JSON-Datei konnte nicht gelesen werden. Bitte Format prüfen.');
  }

  const rows = Array.isArray(json) ? json : [json];
  if (rows.length === 0) {
    throw new Error('JSON-Import enthält keine Einträge.');
  }

  const entries = [];
  const errors = [];

  rows.forEach((row, index) => {
    try {
      entries.push(normalizeEntry(row, index + 1, options));
    } catch (error) {
      errors.push(error.message);
    }
  });

  if (entries.length === 0) {
    throw new Error(`Import fehlgeschlagen:\n${errors.join('\n')}`);
  }

  return {
    entries,
    errors
  };
};

export const createSeasonMatrixTemplateCsv = () => [
  'id;name;category;mainSeasonMonths;secondarySeasonMonths;seasonScore;labelMode;isActive;region;synonyms;description',
  'kartoffel;Kartoffel;Gemuese;1|2|3|9|10|11;4|5|6|7|8|12;86;jetzt_saison;true;DE;Erdapfel|Potato;Mild und vielseitig einsetzbar'
].join('\n');

export const parseSeasonMatrixImport = (content, {
  fileName = '',
  regionOptions = ['GLOBAL', 'DE', 'AT', 'CH'],
  labelModeOptions = ['jetzt_saison', 'bald_saison', 'ausserhalb']
} = {}) => {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    throw new Error('Die Importdatei ist leer.');
  }

  const options = { regionOptions, labelModeOptions };
  const lowerFileName = String(fileName || '').toLowerCase();
  const isJson = lowerFileName.endsWith('.json') || normalizedContent.startsWith('{') || normalizedContent.startsWith('[');

  return isJson ? parseJsonImport(normalizedContent, options) : parseCsvImport(normalizedContent, options);
};
