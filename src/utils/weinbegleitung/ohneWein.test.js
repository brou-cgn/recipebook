import { istOhneWein } from './ohneWein';
import { bildeGangProfil, GANG_STATUS_NUR_GETRAENKE } from './gang';
import { empfehlungFuerRezept } from './engine';
import { STATUS_OK } from './konstanten';
import { G5_RINDERSCHMORBRATEN } from './__fixtures__/profile';

describe('istOhneWein', () => {
  it('erkennt Gebäcke & Teige als String und in Listen', () => {
    expect(istOhneWein({ speisekategorie: 'Gebäcke & Teige' })).toBe(true);
    expect(istOhneWein({ speisekategorie: ['Hauptspeisen', ' Gebäcke & Teige '] })).toBe(true);
  });

  it('lässt andere Kategorien und fehlende Werte durch', () => {
    expect(istOhneWein({ speisekategorie: ['Hauptspeisen'] })).toBe(false);
    expect(istOhneWein({})).toBe(false);
    expect(istOhneWein(null)).toBe(false);
  });

  it('Gang ignoriert solche Rezepte wie Getränke', () => {
    const gang = bildeGangProfil([{ id: 'a', speisekategorie: ['Gebäcke & Teige'], weinprofil: G5_RINDERSCHMORBRATEN }]);
    expect(gang.status).toBe(GANG_STATUS_NUR_GETRAENKE);
  });
});

it('Fixture bleibt eine normale Empfehlung (Gegenprobe)', () => {
  expect(empfehlungFuerRezept({ weinprofil: G5_RINDERSCHMORBRATEN }).status).toBe(STATUS_OK);
});
