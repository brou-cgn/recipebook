import fs from 'fs';
import path from 'path';
import { WICHTEL_ANLAESSE, wichtelAnlassLabel, vorgeschlagenerWichtelAnlass } from './wichtelAnlaesse';

describe('wichtelAnlaesse', () => {
  it('liefert das Label zum Schlüssel, sonst leer', () => {
    expect(wichtelAnlassLabel('weihnachten')).toBe('Weihnachten');
    expect(wichtelAnlassLabel('')).toBe('');
    expect(wichtelAnlassLabel('unbekannt')).toBe('');
  });

  it('stimmt mit der Whitelist der Cloud Function überein', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '../../functions/wichteln.js'), 'utf8');
    const treffer = quelle.match(/const ANLAESSE = new Set\(\[([^\]]*)\]\)/);
    expect(treffer).not.toBeNull();
    const server = treffer[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
    expect(server).toEqual(WICHTEL_ANLAESSE.map((a) => a.key));
  });

  it('schlägt im November und Dezember Weihnachten vor, sonst nichts', () => {
    expect(vorgeschlagenerWichtelAnlass(new Date(2026, 10, 1))).toBe('weihnachten');
    expect(vorgeschlagenerWichtelAnlass(new Date(2026, 11, 31))).toBe('weihnachten');
    expect(vorgeschlagenerWichtelAnlass(new Date(2026, 9, 31))).toBe('');
    expect(vorgeschlagenerWichtelAnlass(new Date(2027, 0, 1))).toBe('');
  });
});
