// Anlass einer Wichtelrunde. Gespeichert wird der Schlüssel; die Liste der erlaubten
// Schlüssel steht auch in functions/wichteln.js (ANLAESSE) und muss dort identisch bleiben
// (Test: wichtelAnlaesse.test.js).
export const WICHTEL_ANLAESSE = [
  { key: 'weihnachten', label: 'Weihnachten' },
  { key: 'nikolaus', label: 'Nikolaus' },
  { key: 'silvester', label: 'Silvester' },
  { key: 'ostern', label: 'Ostern' },
  { key: 'geburtstag', label: 'Geburtstag' },
  { key: 'hochzeit', label: 'Hochzeit' },
  { key: 'jubilaeum', label: 'Jubiläum' },
  { key: 'firmenfeier', label: 'Firmenfeier' },
  { key: 'sommerfest', label: 'Sommerfest' },
  { key: 'abschied', label: 'Abschied' },
  { key: 'einweihung', label: 'Einweihung' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

export const wichtelAnlassLabel = (key) => WICHTEL_ANLAESSE.find((a) => a.key === key)?.label || '';
