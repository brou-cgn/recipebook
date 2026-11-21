import { recipeHasContent } from './recipeContent';

describe('recipeHasContent (Löschregel: nur ein Rezept mit Inhalt fragt nach)', () => {
  it('zählt Zutaten, Schritte und Bilder als Inhalt', () => {
    expect(recipeHasContent({ title: 'A', ingredients: ['200 g Mehl'] })).toBe(true);
    expect(recipeHasContent({ title: 'A', steps: [{ text: 'Rühren' }] })).toBe(true);
    expect(recipeHasContent({ title: 'A', image: 'data:image/png;base64,xyz' })).toBe(true);
    expect(recipeHasContent({ title: 'A', images: [{ url: 'x' }] })).toBe(true);
  });

  it('sieht ein Rezept nur mit Titel und leeren Feldern als leer', () => {
    expect(recipeHasContent({ title: 'Nur Titel' })).toBe(false);
    expect(recipeHasContent({ title: 'A', ingredients: ['', '  '], steps: [], image: '', images: [] })).toBe(false);
    expect(recipeHasContent(null)).toBe(false);
  });

  it('wertet unbekannte Formen als Inhalt (im Zweifel nachfragen)', () => {
    expect(recipeHasContent({ title: 'A', ingredients: { teig: ['Mehl'] } })).toBe(true);
    expect(recipeHasContent({ title: 'A', steps: 'Alles verrühren' })).toBe(true);
  });
});
