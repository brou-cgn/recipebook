import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import {
  MENUE_HASH_KENNUNG,
  weinRezeptIds,
  inBloecken,
  menueHashEingabe,
  menueInputHash,
  erstelleSnapshot,
  istGueltigerSnapshot,
  gangFuerSektion,
  mitFixierung,
  ohneFixierung,
  snapshotZaehler,
} from './menue';
import { berechneWeinbegleitung } from './engine';
import { RULES_VERSION, MODUS_EIN_WEIN } from './konstanten';
import { festmenue } from './__fixtures__/profile';

beforeAll(() => {
  if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = NodeTextEncoder;
});

const mitHash = (rezept, inputHash) => ({ ...rezept, weinprofil: { ...rezept.weinprofil, inputHash } });

describe('weinRezeptIds', () => {
  it('nimmt alle Sektionen außer Drinks, in Reihenfolge, ohne Doppelte', () => {
    const menu = {
      sections: [
        { name: 'Vorspeise', recipeIds: ['a', 'b'] },
        { name: 'Drinks', recipeIds: ['punsch'], drinkIds: ['x'] },
        { name: 'Hauptgang', recipeIds: ['c', 'a', null] },
      ],
    };
    expect(weinRezeptIds(menu)).toEqual(['a', 'b', 'c']);
  });

  it('kennt alte Menüs ohne Sektionen', () => {
    expect(weinRezeptIds({ recipeIds: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(weinRezeptIds(null)).toEqual([]);
  });
});

describe('inBloecken', () => {
  it('teilt in Blöcke der gewünschten Größe', () => {
    const ids = Array.from({ length: 45 }, (_, i) => `r${i}`);
    const bloecke = inBloecken(ids, 20);
    expect(bloecke.map((block) => block.length)).toEqual([20, 20, 5]);
    expect(bloecke.flat()).toEqual(ids);
    expect(inBloecken([], 20)).toEqual([]);
  });
});

describe('menueHashEingabe', () => {
  const { menu, rezepte } = festmenue();
  const basis = menueHashEingabe(menu, rezepte);

  it('enthält Kennung und RULES_VERSION', () => {
    expect(JSON.parse(basis).slice(0, 2)).toEqual([MENUE_HASH_KENNUNG, RULES_VERSION]);
  });

  it('ändert sich mit Sektionsnamen, Reihenfolge, Rezepten und Profil-Hashes', () => {
    const umbenannt = { ...menu, sections: menu.sections.map((s, i) => (i === 0 ? { ...s, name: 'Amuse-Bouche' } : s)) };
    const umgestellt = { ...menu, sections: [menu.sections[1], menu.sections[0], ...menu.sections.slice(2)] };
    const mehr = { ...menu, sections: menu.sections.map((s, i) => (i === 0 ? { ...s, recipeIds: [...s.recipeIds, 'neu'] } : s)) };
    const neuesProfil = rezepte.map((r, i) => (i === 0 ? mitHash(r, 'anders') : r));
    expect(menueHashEingabe(umbenannt, rezepte)).not.toBe(basis);
    expect(menueHashEingabe(umgestellt, rezepte)).not.toBe(basis);
    expect(menueHashEingabe(mehr, rezepte)).not.toBe(basis);
    expect(menueHashEingabe(menu, neuesProfil)).not.toBe(basis);
  });

  it('ignoriert die Drinks-Sektion und Felder außerhalb des Inhalts', () => {
    const mitDrinks = { ...menu, sections: menu.sections.map((s) => (s.name === 'Drinks' ? { ...s, recipeIds: ['punsch'] } : s)) };
    expect(menueHashEingabe(mitDrinks, rezepte)).toBe(basis);
    expect(menueHashEingabe({ ...menu, name: 'Anders', weinbegleitung: { modus: 'proGang' } }, rezepte)).toBe(basis);
  });

  it('berechnet einen sha256 über die Eingabe', async () => {
    const hash = await menueInputHash(menu, rezepte, { subtle: webcrypto.subtle });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(menueInputHash(menu, rezepte, { subtle: undefined })).rejects.toThrow('SHA-256');
  });
});

describe('erstelleSnapshot', () => {
  const { menu, rezepte } = festmenue();

  it('übernimmt die Gänge ohne undefined und mit den Metadaten', () => {
    const ergebnis = berechneWeinbegleitung({ menu, rezepte });
    const snapshot = erstelleSnapshot({ ergebnis, inputHash: 'h', nutzerId: 'u1', jetzt: 42 });
    expect(snapshot).toEqual(expect.objectContaining({
      modus: 'proGang',
      gemeinsamerStilId: null,
      fixierungen: [],
      gewaehlterGemeinsamerStilId: null,
      rulesVersion: RULES_VERSION,
      inputHash: 'h',
      erstelltAm: 42,
      erstelltVon: 'u1',
    }));
    expect(snapshot.gaenge[1]).toEqual({
      sektionIndex: 1,
      sektionName: 'Hauptgang',
      stilId: 'rot_kraeftig',
      alternativen: [{ stilId: 'rot_mittel', label: 'passt' }],
      label: 'passt hervorragend',
      regelIds: ['R7', 'R8', 'R10'],
      fixiert: false,
      hinweis: null,
      istDessert: false,
    });
    expect(JSON.stringify(snapshot)).not.toContain('undefined');
    const ohneUndefined = (wert) => {
      if (wert === undefined) throw new Error('undefined im Snapshot');
      if (wert && typeof wert === 'object') Object.values(wert).forEach(ohneUndefined);
    };
    ohneUndefined(snapshot);
  });

  it('merkt im Modus „Ein Wein“ den gemeinsamen Stil', () => {
    const ergebnis = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN });
    const snapshot = erstelleSnapshot({ ergebnis, inputHash: null, nutzerId: null, gewaehlterGemeinsamerStilId: 'rose_trocken' });
    expect(snapshot.modus).toBe(MODUS_EIN_WEIN);
    expect(snapshot.gemeinsamerStilId).toBe('rot_mittel');
    expect(snapshot.gewaehlterGemeinsamerStilId).toBe('rose_trocken');
    expect(snapshot.gaenge[2].istDessert).toBe(true);
  });
});

describe('Zuordnung und Fixierungen', () => {
  const snapshot = {
    modus: 'proGang',
    gaenge: [
      { sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'a' },
      { sektionIndex: 1, sektionName: 'Hauptgang', stilId: 'b' },
      { sektionIndex: 2, sektionName: 'Gang', stilId: 'c' },
      { sektionIndex: 3, sektionName: 'Gang', stilId: 'd' },
    ],
  };

  it('ordnet über Index und Name zu, nach Verschieben über einen eindeutigen Namen', () => {
    expect(gangFuerSektion(snapshot, 1, 'Hauptgang').stilId).toBe('b');
    expect(gangFuerSektion(snapshot, 0, 'hauptgang ').stilId).toBe('b');
    expect(gangFuerSektion(snapshot, 3, 'Gang').stilId).toBe('d');
    expect(gangFuerSektion(snapshot, 0, 'Gang')).toBeNull();
    expect(gangFuerSektion(snapshot, 0, 'Dessert')).toBeNull();
    expect(gangFuerSektion(null, 0, 'Vorspeise')).toBeNull();
  });

  it('setzt, ersetzt und löst Fixierungen', () => {
    const eins = mitFixierung([], { sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'x' });
    const ersetzt = mitFixierung(eins, { sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'y' });
    expect(ersetzt).toEqual([{ sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'y' }]);
    const zwei = mitFixierung(ersetzt, { sektionIndex: 1, sektionName: 'Hauptgang', stilId: 'z' });
    expect(ohneFixierung(zwei, 0, 'Vorspeise')).toEqual([{ sektionIndex: 1, sektionName: 'Hauptgang', stilId: 'z' }]);
  });

  it('prüft Snapshots und zählt Weine', () => {
    expect(istGueltigerSnapshot(snapshot)).toBe(true);
    expect(istGueltigerSnapshot({ modus: 'anders', gaenge: [] })).toBe(false);
    expect(istGueltigerSnapshot(undefined)).toBe(false);
    expect(snapshotZaehler({ ...snapshot, gaenge: [...snapshot.gaenge, { stilId: 'a' }, { stilId: null }] }))
      .toEqual({ weine: 4, gaengeMitWein: 5, gaenge: 6 });
  });
});
