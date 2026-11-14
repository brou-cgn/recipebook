import {
  alleRegionen,
  regionFuerKulinarik,
  regionFuerRezept,
  regionFuerRezepte,
  beispieleFuerRegion,
  regionenFuerGaenge,
} from './kulinarik';
import { alleStile, getStil } from './wissensbasis';
import { gaengeAusMenue } from './gang';
import { DEFAULT_CUISINE_TYPES } from '../customLists';
import { rezept, G1_LACHSTATAR, G5_RINDERSCHMORBRATEN, G6_SCHOKOLADENMOUSSE, G16_MARGHERITA, G16_SALAMI } from './__fixtures__/profile';

const mitKueche = (basis, kulinarik) => ({ ...basis, kulinarik });

describe('Daten (kulinarik.json)', () => {
  const stilIds = new Set(alleStile().map((stil) => stil.id));

  it('nennt nur bekannte Stile, je Stil eindeutige, nicht leere Beispiele', () => {
    alleRegionen().forEach((region) => {
      expect(region.anzeige).toMatch(/Küche$/);
      expect(region.erkennung.length).toBeGreaterThan(0);
      region.erkennung.forEach((stamm) => expect(stamm).toBe(stamm.toLowerCase()));
      Object.entries(region.beispiele).forEach(([stilId, beispiele]) => {
        expect(stilIds.has(stilId)).toBe(true);
        expect(beispiele.length).toBeGreaterThan(0);
        expect(new Set(beispiele).size).toBe(beispiele.length);
        beispiele.forEach((beispiel) => expect(beispiel.trim()).toBe(beispiel));
      });
    });
  });

  it('hat eindeutige IDs', () => {
    const ids = alleRegionen().map((region) => region.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('erkennt die Weinländer unter den Standard-Küchen, die übrigen nicht', () => {
    const ergebnis = Object.fromEntries(DEFAULT_CUISINE_TYPES.map((name) => [name, regionFuerKulinarik(name)]));
    expect(ergebnis).toEqual({
      'Deutsche Küche': 'deutschland',
      'Französische Küche': 'frankreich',
      'Italienische Küche': 'italien',
      'Österreichische Küche': 'oesterreich',
      'Schweizer Küche': 'schweiz',
      'Türkische Küche': null,
      'Chinesische Küche': null,
      'Indische Küche': null,
      'Japanische Küche': null,
      'Orientalische Küche': null,
      'Thailändische Küche': null,
      'Mexikanische Küche': null,
      'US-Amerikanische Küche': 'usa',
      Vegetarisch: null,
      Vegan: null,
      'Weihnachtliche Küche': null,
    });
  });
});

describe('regionFuerKulinarik', () => {
  it('erkennt regionale Küchen und ignoriert Groß- und Kleinschreibung', () => {
    expect(regionFuerKulinarik('Toskanische Küche')).toBe('italien');
    expect(regionFuerKulinarik('SPANISCH')).toBe('spanien');
    expect(regionFuerKulinarik('Griechische Küche')).toBe('griechenland');
    expect(regionFuerKulinarik('Bayerische Küche')).toBe('deutschland');
  });

  it('ordnet Südtirol Italien zu, nicht Österreich', () => {
    expect(regionFuerKulinarik('Südtiroler Küche')).toBe('italien');
    expect(regionFuerKulinarik('Tiroler Küche')).toBe('oesterreich');
  });

  it('liefert null für Leeres und Unbekanntes', () => {
    expect(regionFuerKulinarik('')).toBeNull();
    expect(regionFuerKulinarik(undefined)).toBeNull();
    expect(regionFuerKulinarik('Fusion')).toBeNull();
  });
});

describe('regionFuerRezept und regionFuerRezepte', () => {
  it('nimmt die erste Kulinarik mit Region, auch aus einem alten String-Feld', () => {
    expect(regionFuerRezept({ kulinarik: ['Vegetarisch', 'Italienische Küche'] })).toBe('italien');
    expect(regionFuerRezept({ kulinarik: 'Französische Küche' })).toBe('frankreich');
    expect(regionFuerRezept({ kulinarik: ['Indische Küche'] })).toBeNull();
    expect(regionFuerRezept({})).toBeNull();
  });

  it('nimmt die häufigste Region, Rezepte ohne Region zählen nicht', () => {
    expect(regionFuerRezepte([
      { kulinarik: ['Italienische Küche'] },
      { kulinarik: ['Italienische Küche'] },
      { kulinarik: ['Deutsche Küche'] },
      { kulinarik: ['Vegan'] },
    ])).toBe('italien');
  });

  it('gibt bei Gleichstand keine Region', () => {
    expect(regionFuerRezepte([{ kulinarik: ['Italienische Küche'] }, { kulinarik: ['Deutsche Küche'] }])).toBeNull();
    expect(regionFuerRezepte([])).toBeNull();
  });
});

describe('beispieleFuerRegion', () => {
  const rotMittel = getStil('rot_mittel');

  it('stellt die Beispiele der Region vor die allgemeinen (Pizza: Chianti statt Lemberger)', () => {
    expect(beispieleFuerRegion(rotMittel, 'italien', 3)).toEqual({
      beispiele: ['Chianti', 'Barbera', "Montepulciano d'Abruzzo"],
      region: expect.objectContaining({ id: 'italien' }),
    });
  });

  it('füllt mit allgemeinen Beispielen auf, ohne doppelte', () => {
    expect(beispieleFuerRegion(rotMittel, 'spanien', 3).beispiele).toEqual(['Rioja Crianza', 'Garnacha', 'Lemberger']);
    expect(beispieleFuerRegion(getStil('likoerwein'), 'portugal', 3).beispiele).toEqual(['Portwein', 'Madeira', 'Sherry']);
  });

  it('bleibt ohne Region oder ohne Eintrag für den Stil bei den allgemeinen Beispielen, ohne Hinweis', () => {
    expect(beispieleFuerRegion(rotMittel, null)).toEqual({ beispiele: ['Lemberger', 'Dornfelder'], region: null });
    expect(beispieleFuerRegion(getStil('weiss_aromatisch_feinherb'), 'spanien')).toEqual({
      beispiele: ['Riesling feinherb oder Spätlese', 'Gewürztraminer'],
      region: null,
    });
    expect(beispieleFuerRegion(rotMittel, 'gibtsnicht').region).toBeNull();
  });
});

describe('regionenFuerGaenge', () => {
  it('nimmt je Gang die Gerichte der Auswahl, nicht den Salat daneben', () => {
    const rezepte = [
      mitKueche(rezept('margherita', G16_MARGHERITA), ['Italienische Küche']),
      mitKueche(rezept('salami', G16_SALAMI), ['Italienische Küche']),
      mitKueche(rezept('salat', { ...G1_LACHSTATAR, rolle: 'salat' }), ['Deutsche Küche']),
      mitKueche(rezept('kartoffelsalat', { ...G1_LACHSTATAR, rolle: 'salat' }), ['Deutsche Küche']),
      mitKueche(rezept('mousse', G6_SCHOKOLADENMOUSSE), ['Französische Küche']),
    ];
    const menu = {
      sections: [
        { name: 'Hauptgang', recipeIds: ['margherita', 'salami', 'salat', 'kartoffelsalat'] },
        { name: 'Dessert', recipeIds: ['mousse'] },
      ],
    };
    const { jeGang, menue } = regionenFuerGaenge(gaengeAusMenue(menu, rezepte), rezepte);
    expect(jeGang.get(0)).toBe('italien');
    expect(jeGang.get(1)).toBe('frankreich');
    expect(menue).toBe('italien'); // das Dessert zählt für „Ein Wein für alles“ nicht
  });

  it('nimmt alle Rezepte der Sektion, wenn die Auswahl keine Region hat', () => {
    const rezepte = [
      rezept('braten', G5_RINDERSCHMORBRATEN),
      mitKueche(rezept('knoedel', { ...G5_RINDERSCHMORBRATEN, rolle: 'beilage' }), ['Deutsche Küche']),
    ];
    const menu = { sections: [{ name: 'Hauptgang', recipeIds: ['braten', 'knoedel'] }] };
    const { jeGang, menue } = regionenFuerGaenge(gaengeAusMenue(menu, rezepte), rezepte);
    expect(jeGang.get(0)).toBe('deutschland');
    expect(menue).toBe('deutschland');
  });

  it('liefert ohne Kulinarik keine Region', () => {
    const rezepte = [rezept('braten', G5_RINDERSCHMORBRATEN)];
    const { jeGang, menue } = regionenFuerGaenge(gaengeAusMenue({ sections: [{ name: 'Hauptgang', recipeIds: ['braten'] }] }, rezepte), rezepte);
    expect(jeGang.size).toBe(0);
    expect(menue).toBeNull();
  });
});
