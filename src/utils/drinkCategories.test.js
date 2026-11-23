import { getraenkNameAnzeige, mergeDrinkUnitAdditions, PREDEFINED_DRINKS } from './drinkCategories';
import { resolveDrinkDisplay } from './drinkDisplay';
import { erstelleT } from '../i18n/texte';
import getraenkeTexte from '../i18n/texte/getraenke';

describe('mergeDrinkUnitAdditions', () => {
  it('returns drinks unchanged when there are no additions', () => {
    const drinks = [{ id: 'd1', ownerId: 'u1', name: 'Bier', einheiten: [{ einheitsgroesse: 0.5 }] }];
    expect(mergeDrinkUnitAdditions(drinks)).toEqual(drinks);
  });

  it('folds an addition doc into its target drink and tags the added einheiten', () => {
    const drinks = [
      { id: 'd1', ownerId: 'u1', name: 'Papas Wein', einheiten: [{ einheitsgroesse: 0.75 }] },
      {
        id: 'd1',
        ownerId: 'u2',
        extendsOwnerId: 'u1',
        einheiten: [{ einheitsgroesse: 0.2, einheit: 'Glas' }],
      },
    ];

    const result = mergeDrinkUnitAdditions(drinks);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d1');
    expect(result[0].ownerId).toBe('u1');
    expect(result[0].einheiten).toEqual([
      { einheitsgroesse: 0.75 },
      { einheitsgroesse: 0.2, einheit: 'Glas', addedByUserId: 'u2' },
    ]);
  });

  it('never surfaces an addition doc as a standalone drink', () => {
    const drinks = [
      { id: 'd1', ownerId: 'u2', extendsOwnerId: 'u1', einheiten: [{ einheitsgroesse: 0.2 }] },
    ];

    expect(mergeDrinkUnitAdditions(drinks)).toEqual([]);
  });

  it('merges additions from multiple different users into the same drink', () => {
    const drinks = [
      { id: 'd1', ownerId: 'u1', einheiten: [] },
      { id: 'd1', ownerId: 'u2', extendsOwnerId: 'u1', einheiten: [{ einheitsgroesse: 0.2 }] },
      { id: 'd1', ownerId: 'u3', extendsOwnerId: 'u1', einheiten: [{ einheitsgroesse: 1.0 }] },
    ];

    const result = mergeDrinkUnitAdditions(drinks);

    expect(result).toHaveLength(1);
    expect(result[0].einheiten).toEqual([
      { einheitsgroesse: 0.2, addedByUserId: 'u2' },
      { einheitsgroesse: 1.0, addedByUserId: 'u3' },
    ]);
  });

  it('ignores an addition whose target drink id/owner does not match any drink', () => {
    const drinks = [
      { id: 'd1', ownerId: 'u1', einheiten: [{ einheitsgroesse: 0.5 }] },
      { id: 'd2', ownerId: 'u2', extendsOwnerId: 'someone-else', einheiten: [{ einheitsgroesse: 0.2 }] },
    ];

    const result = mergeDrinkUnitAdditions(drinks);

    expect(result).toEqual([{ id: 'd1', ownerId: 'u1', einheiten: [{ einheitsgroesse: 0.5 }] }]);
  });

  it('handles a non-array input gracefully', () => {
    expect(mergeDrinkUnitAdditions(undefined)).toEqual([]);
    expect(mergeDrinkUnitAdditions(null)).toEqual([]);
  });
});

describe('getraenkNameAnzeige (Mehrsprachigkeit PR 6k)', () => {
  const tEn = erstelleT(getraenkeTexte, 'en');
  const tFr = erstelleT(getraenkeTexte, 'fr');

  it('übersetzt den gespeicherten deutschen Namen vordefinierter Getränke', () => {
    expect(getraenkNameAnzeige('Mineralwasser', tEn)).toBe('Mineral water');
    expect(getraenkNameAnzeige('Mineralwasser', tFr)).toBe('Eau minérale');
  });

  it('lässt eigene Getränke und den Namen ohne t, wie er ist', () => {
    expect(getraenkNameAnzeige('Hausbier', tEn)).toBe('Hausbier');
    expect(getraenkNameAnzeige('Mineralwasser')).toBe('Mineralwasser');
  });

  it('hat für jedes vordefinierte Getränk einen Namen in jeder Sprache, auf Deutsch genau den gespeicherten', () => {
    PREDEFINED_DRINKS.forEach((drink) => {
      expect(getraenkeTexte.de[`getraenk_${drink.id}`]).toBe(drink.name);
      expect(getraenkeTexte.en[`getraenk_${drink.id}`]).toEqual(expect.any(String));
      expect(getraenkeTexte.fr[`getraenk_${drink.id}`]).toEqual(expect.any(String));
    });
  });

  it('greift in resolveDrinkDisplay für Getränke und gespeicherte Namen aus der Berechnung', () => {
    expect(resolveDrinkDisplay(PREDEFINED_DRINKS[0], [], tEn).displayName).toBe('Mineral water');
    expect(resolveDrinkDisplay('Mineralwasser', [], tFr).displayName).toBe('Eau minérale');
    expect(resolveDrinkDisplay('Mineralwasser', []).displayName).toBe('Mineralwasser');
  });
});
