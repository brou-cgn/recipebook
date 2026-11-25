/**
 * Which recipe prints with which format, in words.
 *
 * The app picks the format by the number of photos of the recipe (selectPrintFormat in
 * printFormats.js): among the formats with a photo limit (`maxPhotos`) at or above that number
 * the lowest limit wins, otherwise the first format without a limit. The settings show this
 * rule as a readable range per format instead of the bare limit.
 *
 * Pure, no React. The texts are German: the settings are part of the admin area.
 */

const isCatchAll = (format) => format?.maxPhotos === null || format?.maxPhotos === undefined;
const isValidLimit = (value) => Number.isInteger(value) && value >= 0;
const photos = (n) => (n === 1 ? '1 Foto' : `${n} Fotos`);

/**
 * The rule of every format, in the order of the list.
 *
 * kind:
 *  - 'all'    the only rule there is: every recipe
 *  - 'range'  recipes with `from` to `to` photos (from 0: "at most `to`")
 *  - 'rest'   every recipe no limit applies to, i.e. from `from` photos on
 *  - 'unused' never chosen: another format (`shadowedBy`) already takes these recipes
 *
 * @param {Array<{id: string, maxPhotos: number|null}>} formats
 * @returns {Array<{id: string, kind: 'all'|'range'|'rest'|'unused', from?: number, to?: number, shadowedBy?: string}>}
 */
export function describeFormatRules(formats) {
  const list = Array.isArray(formats) ? formats : [];
  // Per limit the first format listed wins; a format without a limit is the rest.
  const winners = new Map();
  list.forEach((format, index) => {
    if (!isCatchAll(format) && isValidLimit(format.maxPhotos) && !winners.has(format.maxPhotos)) {
      winners.set(format.maxPhotos, index);
    }
  });
  const limits = [...winners.keys()].sort((a, b) => a - b);
  const restIndex = list.findIndex(isCatchAll);

  return list.map((format, index) => {
    if (isCatchAll(format)) {
      if (index !== restIndex) return { id: format.id, kind: 'unused', shadowedBy: list[restIndex].id };
      if (limits.length === 0) return { id: format.id, kind: 'all' };
      return { id: format.id, kind: 'rest', from: limits[limits.length - 1] + 1 };
    }
    const winner = winners.get(format.maxPhotos);
    if (winner === undefined) return { id: format.id, kind: 'unused' };
    if (winner !== index) return { id: format.id, kind: 'unused', shadowedBy: list[winner].id };
    const position = limits.indexOf(format.maxPhotos);
    return { id: format.id, kind: 'range', from: position === 0 ? 0 : limits[position - 1] + 1, to: format.maxPhotos };
  });
}

/**
 * What the rule covers, to complete a sentence: "Rezepte mit 2 bis 3 Fotos", "Rezepte ab 4 Fotos".
 * Null for a format that is not used.
 */
export function formatRuleScope(rule) {
  switch (rule?.kind) {
    case 'all': return 'alle Rezepte';
    case 'rest': return `Rezepte ab ${photos(rule.from)}`;
    case 'range':
      if (rule.to === 0) return 'Rezepte ohne Foto';
      if (rule.from === 0) return `Rezepte mit höchstens ${photos(rule.to)}`;
      if (rule.from === rule.to) return `Rezepte mit ${photos(rule.to)}`;
      return `Rezepte mit ${rule.from} bis ${photos(rule.to)}`;
    default: return null;
  }
}

/** The rule as a sentence for the card of a format: "Für Rezepte mit höchstens 1 Foto". */
export function formatRuleSentence(rule) {
  if (rule?.kind === 'rest') return 'Für alle übrigen Rezepte';
  const scope = formatRuleScope(rule);
  return scope ? `Für ${scope}` : 'Wird nicht verwendet';
}

/** The rule as a short label: "Bis 1 Foto", "2 bis 3 Fotos", "Ab 4 Fotos". */
export function formatRuleLabel(rule) {
  switch (rule?.kind) {
    case 'all': return 'Alle Rezepte';
    case 'rest': return `Ab ${photos(rule.from)}`;
    case 'range':
      if (rule.to === 0) return 'Ohne Foto';
      if (rule.from === 0) return `Bis ${photos(rule.to)}`;
      if (rule.from === rule.to) return photos(rule.to);
      return `${rule.from} bis ${photos(rule.to)}`;
    default: return 'Nicht verwendet';
  }
}

/**
 * The rules that are in use, ordered by the number of photos they start at: the overview
 * of "which recipe prints with which format".
 * @returns {Array<{id: string, name: string, label: string}>}
 */
export function formatRuleOverview(formats) {
  const list = Array.isArray(formats) ? formats : [];
  return describeFormatRules(list)
    .map((rule, index) => ({ rule, format: list[index] }))
    .filter(({ rule }) => rule.kind !== 'unused')
    .sort((a, b) => (a.rule.from ?? 0) - (b.rule.from ?? 0))
    .map(({ rule, format }) => ({ id: format.id, name: format.name, label: formatRuleLabel(rule) }));
}

/** The lowest photo limit from 1 on that no format uses yet. */
export function nextFreeLimit(formats) {
  const used = new Set((Array.isArray(formats) ? formats : []).filter((f) => !isCatchAll(f)).map((f) => f.maxPhotos));
  let limit = 1;
  while (used.has(limit)) limit += 1;
  return limit;
}

/**
 * The photo limit a new format starts with next to the given ones: the rest while no format
 * takes it yet, otherwise the next free limit, so the new format is not born unused.
 * @returns {number|null}
 */
export function newFormatMaxPhotos(formats) {
  const list = Array.isArray(formats) ? formats : [];
  return list.some(isCatchAll) ? nextFreeLimit(list) : null;
}

/**
 * Makes a list of formats storable when it is not (data from before the rules were checked
 * on saving): a missing name, a photo limit that is no whole number from 0 on, a limit used
 * twice, no format for the rest. Every format is edited on its own in the settings, so a
 * list with several such faults could never be saved again otherwise.
 *
 * Pure: returns new objects only for the formats it changes. `repairs` says in words what
 * was changed, for the note in the settings; an empty list means nothing was wrong.
 * @param {Array<object>} formats
 * @returns {{formats: Array<object>, repairs: string[]}}
 */
export function repairPrintFormats(formats) {
  const list = Array.isArray(formats) ? formats : [];
  const repairs = [];
  const seen = new Set();

  const repaired = list.map((format, index) => {
    let next = format;
    if (!next.name || !String(next.name).trim()) {
      const name = `Format ${index + 1}`;
      next = { ...next, name };
      repairs.push(`Das ${index + 1}. Format hatte keinen Namen und heißt jetzt „${name}“.`);
    }
    if (isCatchAll(next)) return next;
    if (!isValidLimit(next.maxPhotos)) {
      repairs.push(`„${next.name}“ hatte eine ungültige Fotoanzahl (${next.maxPhotos}) und hat jetzt keine Regel mehr.`);
      return { ...next, maxPhotos: null };
    }
    if (seen.has(next.maxPhotos)) {
      repairs.push(`„${next.name}“ hatte dieselbe Fotoanzahl (${next.maxPhotos}) wie ein anderes Format und hat jetzt keine Regel mehr.`);
      return { ...next, maxPhotos: null };
    }
    seen.add(next.maxPhotos);
    return next;
  });

  if (repaired.length > 0 && !repaired.some(isCatchAll)) {
    // No format for the rest: the one with the highest limit takes it.
    const index = repaired.reduce((best, format, i) => (format.maxPhotos > repaired[best].maxPhotos ? i : best), 0);
    repairs.push(`Es gab kein Format für alle übrigen Rezepte; „${repaired[index].name}“ übernimmt das jetzt.`);
    repaired[index] = { ...repaired[index], maxPhotos: null };
  }
  return { formats: repaired, repairs };
}
