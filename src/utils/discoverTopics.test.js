import {
  isValidMonthDay, toMonthDay, formatMonthDay, formatPeriod, validateTopic, sortTopics,
  normalizeRecipeRule, formatRecipeRule, getDiscoverTopicImage,
} from './discoverTopics';
import { getDoc } from 'firebase/firestore';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), addDoc: jest.fn(), setDoc: jest.fn(),
  deleteDoc: jest.fn(), getDoc: jest.fn(), onSnapshot: jest.fn(), serverTimestamp: jest.fn(),
}));

describe('discoverTopics', () => {
  test('month-day validation accepts 29 Feb but not 30 Feb or month 13', () => {
    expect(isValidMonthDay('02-29')).toBe(true);
    expect(isValidMonthDay('02-30')).toBe(false);
    expect(isValidMonthDay('13-01')).toBe(false);
    expect(isValidMonthDay('')).toBe(false);
  });

  test('toMonthDay pads and formatMonthDay is German', () => {
    expect(toMonthDay(9, 5)).toBe('09-05');
    expect(formatMonthDay('10-15')).toBe('15. Oktober');
    expect(formatMonthDay('nope')).toBe('');
  });

  test('formatPeriod', () => {
    expect(formatPeriod({})).toBe('Ganzjährig');
    expect(formatPeriod({ periodStart: '09-15', periodEnd: '11-30' })).toBe('15. September – 30. November');
    expect(formatPeriod({ periodStart: '09-15' })).toBe('Unvollständig');
  });

  test('validateTopic', () => {
    const ok = { rubrik: 'Saison', beschreibung: 'Kürbis-Zeit', periodStart: '', periodEnd: '' };
    expect(validateTopic(ok)).toBe('');
    expect(validateTopic({ ...ok, rubrik: ' ' })).toMatch(/Rubrik/);
    expect(validateTopic({ ...ok, beschreibung: '' })).toMatch(/Beschreibung/);
    expect(validateTopic({ ...ok, periodStart: '09-15' })).toMatch(/Beginn und Ende/);
    expect(validateTopic({ ...ok, periodStart: '09-15', periodEnd: '02-30' })).toMatch(/ungültig/);
    expect(validateTopic({ ...ok, periodStart: '12-15', periodEnd: '01-06' })).toBe('');
  });

  test('sortTopics orders by period start, all-year last', () => {
    const sorted = sortTopics([
      { id: 'a', rubrik: 'Immer' },
      { id: 'b', rubrik: 'Herbst', periodStart: '09-15' },
      { id: 'c', rubrik: 'Frühling', periodStart: '03-01' },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  test('dateScope defaults to all and is shown only with a date condition', () => {
    expect(normalizeRecipeRule({}).dateScope).toBe('all');
    expect(normalizeRecipeRule({ dateScope: 'own' }).dateScope).toBe('own');
    expect(normalizeRecipeRule({ dateScope: 'x' }).dateScope).toBe('all');
    expect(formatRecipeRule({ lastCooked: { minDays: 365, maxDays: 365 }, dateScope: 'own' }))
      .toBe('gekocht vor genau 365 Tagen (nur eigene)');
    expect(formatRecipeRule({ cuisines: { include: ['Thai'] }, dateScope: 'own' })).toBe('Küche: Thai');
  });

  describe('getDiscoverTopicImage', () => {
    test('liefert die getrimmte URL des Themas', async () => {
      getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ imageUrl: ' https://x/a.jpg ' }) });
      await expect(getDiscoverTopicImage('t1')).resolves.toBe('https://x/a.jpg');
    });

    test('leer ohne ID, ohne Dokument oder bei Fehler', async () => {
      await expect(getDiscoverTopicImage('')).resolves.toBe('');
      getDoc.mockResolvedValueOnce({ exists: () => false });
      await expect(getDiscoverTopicImage('t1')).resolves.toBe('');
      getDoc.mockRejectedValueOnce({ code: 'permission-denied' });
      await expect(getDiscoverTopicImage('t1')).resolves.toBe('');
    });
  });
});
