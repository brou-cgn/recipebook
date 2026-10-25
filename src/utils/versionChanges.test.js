import { buildVersionRequest, mergeVersionChanges } from './versionChanges';

const recipe = {
  id: 'r1',
  title: 'Pfannkuchen',
  portionen: 4,
  kochdauer: 20,
  image: 'x.jpg',
  ingredients: [
    { type: 'heading', text: 'Teig' },
    { type: 'ingredient', text: '250 g Mehl', ingredientID: 'mehl-1' },
    '50 g Butter',
  ],
  steps: ['Teig anrühren.', { type: 'step', text: 'Ausbacken.' }, { type: 'step', text: 'Gutes Gelingen!', isAuthorSignature: true }],
};

describe('buildVersionRequest', () => {
  it('normalisiert Strings und Objekte auf type/text und lässt Zusatzdaten weg', () => {
    const req = buildVersionRequest(recipe);
    expect(req.ingredients).toEqual([
      { type: 'heading', text: 'Teig' },
      { type: 'ingredient', text: '250 g Mehl' },
      { type: 'ingredient', text: '50 g Butter' },
    ]);
    expect(req.steps[0]).toEqual({ type: 'step', text: 'Teig anrühren.' });
    expect(req.steps[2]).toEqual({ type: 'step', text: 'Gutes Gelingen!' });
    expect(req.portionen).toBe(4);
  });

  it('überspringt leere Zeilen und fehlende Zahlen', () => {
    const req = buildVersionRequest({ title: 'X', ingredients: ['', ' '], steps: [] });
    expect(req.ingredients).toEqual([]);
    expect(req.portionen).toBeNull();
    expect(req.kochdauer).toBeNull();
  });
});

describe('mergeVersionChanges', () => {
  const result = {
    title: 'Pfannkuchen',
    portionen: 4,
    kochdauer: 25,
    ingredients: [
      { type: 'heading', text: 'Teig' },
      { type: 'ingredient', text: '250 g Mehl' },
      { type: 'ingredient', text: '3 Esslöffel Olivenöl' },
    ],
    steps: [
      { type: 'step', text: 'Teig anrühren.' },
      { type: 'step', text: 'In Olivenöl ausbacken.' },
      { type: 'step', text: 'Gutes Gelingen!' },
    ],
  };

  it('behält ingredientID und Signatur-Flag unveränderter Zeilen', () => {
    const merged = mergeVersionChanges(recipe, result);
    expect(merged.ingredients[1]).toBe(recipe.ingredients[1]);
    expect(merged.steps[2]).toBe(recipe.steps[2]);
  });

  it('übernimmt neue und geänderte Zeilen ohne Zusatzdaten', () => {
    const merged = mergeVersionChanges(recipe, result);
    expect(merged.ingredients[2]).toEqual({ type: 'ingredient', text: '3 Esslöffel Olivenöl' });
    expect(merged.steps[1]).toEqual({ type: 'step', text: 'In Olivenöl ausbacken.' });
    expect(merged.steps[0]).toEqual({ type: 'step', text: 'Teig anrühren.' });
  });

  it('erhält id, Bild und übernimmt Zeitangaben nur, wenn gültig', () => {
    const merged = mergeVersionChanges(recipe, { ...result, kochdauer: null });
    expect(merged.id).toBe('r1');
    expect(merged.image).toBe('x.jpg');
    expect(merged.kochdauer).toBe(20);
    expect(mergeVersionChanges(recipe, result).kochdauer).toBe(25);
  });

  it('vergibt ein Original nicht doppelt', () => {
    const dup = { ...recipe, ingredients: [{ type: 'ingredient', text: 'Salz', ingredientID: 's' }] };
    const merged = mergeVersionChanges(dup, {
      ...result,
      ingredients: [{ type: 'ingredient', text: 'Salz' }, { type: 'ingredient', text: 'Salz' }],
    });
    expect(merged.ingredients[0].ingredientID).toBe('s');
    expect(merged.ingredients[1].ingredientID).toBeUndefined();
  });
});
