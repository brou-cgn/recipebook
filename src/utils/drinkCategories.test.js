import { mergeDrinkUnitAdditions } from './drinkCategories';

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
