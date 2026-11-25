import {
  describeFormatRules,
  formatRuleScope,
  formatRuleSentence,
  formatRuleLabel,
  formatRuleOverview,
  nextFreeLimit,
  newFormatMaxPhotos,
  repairPrintFormats,
} from './printFormatRules';
import { selectPrintFormat, validatePrintFormats } from './printFormats';

const format = (id, maxPhotos, name = id) => ({ id, name, maxPhotos });
const KARTE = format('karte', 1, 'Karte');
const KLASSISCH = format('klassisch', 3, 'Klassisch');
const STANDARD = format('standard', null, 'Standard');

describe('describeFormatRules', () => {
  it('nennt für ein einziges Format ohne Fotolimit „alle Rezepte“', () => {
    expect(describeFormatRules([STANDARD])).toEqual([{ id: 'standard', kind: 'all' }]);
  });

  it('macht aus Fotolimits lückenlose Bereiche und aus dem Format ohne Limit den Rest', () => {
    expect(describeFormatRules([KARTE, KLASSISCH, STANDARD])).toEqual([
      { id: 'karte', kind: 'range', from: 0, to: 1 },
      { id: 'klassisch', kind: 'range', from: 2, to: 3 },
      { id: 'standard', kind: 'rest', from: 4 },
    ]);
  });

  it('hängt nicht von der Reihenfolge der Liste ab', () => {
    expect(describeFormatRules([STANDARD, KLASSISCH, KARTE])).toEqual([
      { id: 'standard', kind: 'rest', from: 4 },
      { id: 'klassisch', kind: 'range', from: 2, to: 3 },
      { id: 'karte', kind: 'range', from: 0, to: 1 },
    ]);
  });

  it('meldet ein zweites Format ohne Fotolimit als unbenutzt: das erste der Liste gewinnt', () => {
    const kopie = format('kopie', null, 'Standard Kopie');
    expect(describeFormatRules([KARTE, STANDARD, kopie])).toEqual([
      { id: 'karte', kind: 'range', from: 0, to: 1 },
      { id: 'standard', kind: 'rest', from: 2 },
      { id: 'kopie', kind: 'unused', shadowedBy: 'standard' },
    ]);
  });

  it('meldet ein doppeltes und ein ungültiges Fotolimit als unbenutzt', () => {
    const doppelt = format('doppelt', 1);
    const kaputt = format('kaputt', -2);
    expect(describeFormatRules([KARTE, doppelt, kaputt, STANDARD])).toEqual([
      { id: 'karte', kind: 'range', from: 0, to: 1 },
      { id: 'doppelt', kind: 'unused', shadowedBy: 'karte' },
      { id: 'kaputt', kind: 'unused' },
      { id: 'standard', kind: 'rest', from: 2 },
    ]);
  });

  it('kommt mit einer fehlenden Liste zurecht', () => {
    expect(describeFormatRules(undefined)).toEqual([]);
    expect(describeFormatRules([])).toEqual([]);
  });

  it('beschreibt genau das, was selectPrintFormat beim Drucken wählt', () => {
    const lists = [
      [STANDARD],
      [KARTE, KLASSISCH, STANDARD],
      [STANDARD, KLASSISCH, KARTE],
      [format('null', 0), format('fuenf', 5), format('zwei', 2), STANDARD],
      [KARTE, STANDARD, format('kopie', null)],
    ];
    lists.forEach((list) => {
      const rules = describeFormatRules(list);
      for (let count = 0; count <= 8; count += 1) {
        const chosen = selectPrintFormat(list, count).id;
        const matching = rules.filter((rule) => {
          if (rule.kind === 'all') return true;
          if (rule.kind === 'rest') return count >= rule.from;
          if (rule.kind === 'range') return count >= rule.from && count <= rule.to;
          return false;
        });
        expect(matching.map((rule) => rule.id)).toEqual([chosen]);
      }
    });
  });
});

describe('Regel in Worten', () => {
  const sentence = (list, id) => formatRuleSentence(describeFormatRules(list).find((rule) => rule.id === id));
  const label = (list, id) => formatRuleLabel(describeFormatRules(list).find((rule) => rule.id === id));

  it('schreibt den Satz für die Karte eines Formats', () => {
    const list = [KARTE, KLASSISCH, STANDARD];
    expect(sentence(list, 'karte')).toBe('Für Rezepte mit höchstens 1 Foto');
    expect(sentence(list, 'klassisch')).toBe('Für Rezepte mit 2 bis 3 Fotos');
    expect(sentence(list, 'standard')).toBe('Für alle übrigen Rezepte');
    expect(sentence([STANDARD], 'standard')).toBe('Für alle Rezepte');
  });

  it('kennt die Sonderfälle ohne Foto, genau eine Anzahl und unbenutzt', () => {
    const list = [format('ohne', 0), format('eins', 1), format('zwei', 2), STANDARD, format('kopie', null)];
    expect(sentence(list, 'ohne')).toBe('Für Rezepte ohne Foto');
    expect(sentence(list, 'eins')).toBe('Für Rezepte mit 1 Foto');
    expect(sentence(list, 'zwei')).toBe('Für Rezepte mit 2 Fotos');
    expect(sentence(list, 'kopie')).toBe('Wird nicht verwendet');
    expect(formatRuleSentence(undefined)).toBe('Wird nicht verwendet');
  });

  it('nennt den Bereich als Satzteil, auch für den Rest', () => {
    const scope = (list, id) => formatRuleScope(describeFormatRules(list).find((rule) => rule.id === id));
    const list = [KARTE, KLASSISCH, STANDARD];
    expect(scope(list, 'karte')).toBe('Rezepte mit höchstens 1 Foto');
    expect(scope(list, 'klassisch')).toBe('Rezepte mit 2 bis 3 Fotos');
    expect(scope(list, 'standard')).toBe('Rezepte ab 4 Fotos');
    expect(scope([STANDARD], 'standard')).toBe('alle Rezepte');
    expect(scope([format('ohne', 0), STANDARD], 'ohne')).toBe('Rezepte ohne Foto');
    expect(scope([format('ohne', 0), STANDARD], 'standard')).toBe('Rezepte ab 1 Foto');
    expect(scope([KARTE, STANDARD, format('kopie', null)], 'kopie')).toBeNull();
  });

  it('schreibt die Kurzform für die Übersicht', () => {
    const list = [KARTE, KLASSISCH, STANDARD];
    expect(label(list, 'karte')).toBe('Bis 1 Foto');
    expect(label(list, 'klassisch')).toBe('2 bis 3 Fotos');
    expect(label(list, 'standard')).toBe('Ab 4 Fotos');
    expect(label([STANDARD], 'standard')).toBe('Alle Rezepte');
    expect(label([format('ohne', 0), format('eins', 1), STANDARD], 'ohne')).toBe('Ohne Foto');
    expect(label([format('ohne', 0), format('eins', 1), STANDARD], 'eins')).toBe('1 Foto');
    expect(label([KARTE, STANDARD], 'standard')).toBe('Ab 2 Fotos');
    expect(formatRuleLabel({ kind: 'unused' })).toBe('Nicht verwendet');
  });
});

describe('formatRuleOverview', () => {
  it('ordnet die verwendeten Formate nach der Fotoanzahl und lässt unbenutzte weg', () => {
    const kopie = format('kopie', null, 'Standard Kopie');
    expect(formatRuleOverview([STANDARD, kopie, KLASSISCH, KARTE])).toEqual([
      { id: 'karte', name: 'Karte', label: 'Bis 1 Foto' },
      { id: 'klassisch', name: 'Klassisch', label: '2 bis 3 Fotos' },
      { id: 'standard', name: 'Standard', label: 'Ab 4 Fotos' },
    ]);
  });
});

describe('Fotolimit eines neuen Formats', () => {
  it('nimmt das kleinste freie Limit ab 1', () => {
    expect(nextFreeLimit([STANDARD])).toBe(1);
    expect(nextFreeLimit([KARTE, STANDARD])).toBe(2);
    expect(nextFreeLimit([KARTE, format('zwei', 2), KLASSISCH, STANDARD])).toBe(4);
    expect(nextFreeLimit(undefined)).toBe(1);
  });

  it('gibt einem neuen Format ein Limit, solange es schon ein Format für den Rest gibt', () => {
    expect(newFormatMaxPhotos([KARTE, STANDARD])).toBe(2);
    expect(newFormatMaxPhotos([KARTE])).toBeNull();
    expect(newFormatMaxPhotos([])).toBeNull();
  });

  it('ergibt zusammen mit den vorhandenen Formaten eine gültige Liste', () => {
    const list = [KARTE, KLASSISCH, STANDARD];
    const neu = { ...format('neu', newFormatMaxPhotos(list), 'Neu') };
    const errors = validatePrintFormats([...list, neu]).filter((e) => e.field === 'maxPhotos');
    expect(errors).toEqual([]);
    expect(describeFormatRules([...list, neu]).find((rule) => rule.id === 'neu')).toEqual({ id: 'neu', kind: 'range', from: 2, to: 2 });
  });
});

describe('repairPrintFormats', () => {
  it('lässt eine gültige Liste unverändert, mit denselben Objekten', () => {
    const list = [KARTE, KLASSISCH, STANDARD];
    const result = repairPrintFormats(list);
    expect(result.repairs).toEqual([]);
    expect(result.formats).toEqual(list);
    result.formats.forEach((f, i) => expect(f).toBe(list[i]));
  });

  it('benennt ein Format ohne Namen', () => {
    const result = repairPrintFormats([KARTE, format('leer', null, '  ')]);
    expect(result.formats[1].name).toBe('Format 2');
    expect(result.repairs).toEqual(['Das 2. Format hatte keinen Namen und heißt jetzt „Format 2“.']);
  });

  it('nimmt einem Format mit ungültiger oder doppelter Fotoanzahl die Regel', () => {
    const result = repairPrintFormats([KARTE, format('doppelt', 1, 'Doppelt'), format('halb', 2.5, 'Halb'), format('minus', -1, 'Minus'), STANDARD]);
    expect(result.formats.map((f) => f.maxPhotos)).toEqual([1, null, null, null, null]);
    expect(result.repairs).toEqual([
      '„Doppelt“ hatte dieselbe Fotoanzahl (1) wie ein anderes Format und hat jetzt keine Regel mehr.',
      '„Halb“ hatte eine ungültige Fotoanzahl (2.5) und hat jetzt keine Regel mehr.',
      '„Minus“ hatte eine ungültige Fotoanzahl (-1) und hat jetzt keine Regel mehr.',
    ]);
  });

  it('macht das Format mit dem höchsten Limit zum Format für den Rest, wenn keines da ist', () => {
    const result = repairPrintFormats([KLASSISCH, KARTE]);
    expect(result.formats.map((f) => f.maxPhotos)).toEqual([null, 1]);
    expect(result.repairs).toEqual(['Es gab kein Format für alle übrigen Rezepte; „Klassisch“ übernimmt das jetzt.']);
  });

  it('ergibt immer eine Liste ohne Fehler an Name und Fotoanzahl', () => {
    const broken = [
      format('a', 2, ''),
      format('b', 2, 'B'),
      format('c', -3, 'C'),
      format('d', 1.5, 'D'),
      format('e', 7, 'E'),
    ];
    const { formats } = repairPrintFormats(broken);
    const errors = validatePrintFormats(formats).filter((e) => e.field === 'name' || e.field === 'maxPhotos');
    expect(errors).toEqual([]);
    // was vorher schon stimmte, bleibt
    expect(formats.find((f) => f.id === 'e').maxPhotos).toBe(7);
  });

  it('ist idempotent und verträgt eine fehlende Liste', () => {
    const once = repairPrintFormats([KLASSISCH, format('x', 3, '')]);
    const twice = repairPrintFormats(once.formats);
    expect(twice.repairs).toEqual([]);
    expect(twice.formats).toEqual(once.formats);
    expect(repairPrintFormats(undefined)).toEqual({ formats: [], repairs: [] });
    expect(repairPrintFormats([])).toEqual({ formats: [], repairs: [] });
  });
});
