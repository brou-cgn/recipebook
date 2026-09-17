import { splitIntoTwoRows, reorderActiveFirst } from './pillCarousel';

describe('splitIntoTwoRows', () => {
  test('teilt gerade Listen in zwei gleich grosse Reihen', () => {
    expect(splitIntoTwoRows(['a', 'b', 'c', 'd'])).toEqual([['a', 'b'], ['c', 'd']]);
  });

  test('legt bei ungerader Anzahl die zusaetzliche Pille in die erste Reihe', () => {
    expect(splitIntoTwoRows(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c']]);
  });

  test('liefert fuer leere oder fehlende Listen zwei leere Reihen', () => {
    expect(splitIntoTwoRows([])).toEqual([[], []]);
    expect(splitIntoTwoRows(undefined)).toEqual([[], []]);
  });

  // Die Reihenzugehoerigkeit muss unabhaengig von der Auswahl sein: sortiert
  // man erst nach aktiv und teilt dann, springt eine Pille beim Antippen in
  // die andere Reihe und verliert dabei den Fokus.
  test('haengt die Reihenzugehoerigkeit allein an der Eingabereihenfolge', () => {
    const stable = ['a', 'b', 'c', 'd'];
    expect(splitIntoTwoRows(stable)).toEqual(splitIntoTwoRows([...stable]));
  });
});

describe('reorderActiveFirst', () => {
  test('sortiert gewaehlte Pillen nach vorn und behaelt sonst die Reihenfolge', () => {
    expect(reorderActiveFirst(['a', 'b', 'c'], ['c'])).toEqual(['c', 'a', 'b']);
    expect(reorderActiveFirst(['a', 'b', 'c'], ['b', 'c'])).toEqual(['b', 'c', 'a']);
  });

  test('laesst eine Reihe ohne Auswahl unveraendert', () => {
    expect(reorderActiveFirst(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  test('vergleicht Objekte ueber den uebergebenen Schluessel', () => {
    const items = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    expect(reorderActiveFirst(items, ['z'], (item) => item.id)).toEqual([
      { id: 'z' }, { id: 'x' }, { id: 'y' }
    ]);
  });

  test('kommt mit fehlenden Listen zurecht', () => {
    expect(reorderActiveFirst(undefined, ['a'])).toEqual([]);
    expect(reorderActiveFirst(['a'], undefined)).toEqual(['a']);
  });
});
