import { describeActors, formatActionDay } from './fuerDichAttribution';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // 19.10.2026
const names = { a: 'Anna', b: 'Ben', c: 'Cara' };
const nameOf = (id) => names[id] || '';

describe('formatActionDay', () => {
  test('grobe Angaben statt Datum', () => {
    expect(formatActionDay('2026-10-19', NOW)).toBe('heute');
    expect(formatActionDay('2026-10-18', NOW)).toBe('gestern');
    expect(formatActionDay('2026-10-14', NOW)).toBe('diese Woche');
    expect(formatActionDay('2026-10-08', NOW)).toBe('letzte Woche');
    expect(formatActionDay('2026-09-28', NOW)).toBe('vor 3 Wochen');
    expect(formatActionDay('kaputt', NOW)).toBe('');
  });
});

describe('describeActors', () => {
  test('eine Person, gekocht', () => {
    expect(describeActors([{ userId: 'a', kind: 'cooked', day: '2026-10-18' }], nameOf, NOW))
      .toBe('Anna hat das gekocht · gestern');
  });

  test('mehrere Personen, jüngste Handlung bestimmt die Zeit', () => {
    expect(describeActors([
      { userId: 'a', kind: 'cooked', day: '2026-10-14' },
      { userId: 'b', kind: 'cooked', day: '2026-10-18' },
      { userId: 'c', kind: 'cooked', day: '2026-10-10' },
    ], nameOf, NOW)).toBe('Anna, Ben und Cara haben das gekocht · gestern');
  });

  test('gemischte Handlungen und unbekannte Namen', () => {
    expect(describeActors([
      { userId: 'a', kind: 'cooked', day: '2026-10-14' },
      { userId: 'zz', kind: 'created', day: '2026-10-13' },
    ], nameOf, NOW)).toBe('Anna hat das gekocht, Ein Mitglied hat es angelegt · diese Woche');
  });

  test('ohne Einträge leer', () => {
    expect(describeActors([], nameOf, NOW)).toBe('');
    expect(describeActors(undefined, nameOf, NOW)).toBe('');
  });
});
