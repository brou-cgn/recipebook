import {
  bildeGangProfil,
  gaengeAusMenue,
  istDessertGang,
  istDrinksSektion,
  GANG_STATUS_OK,
  GANG_STATUS_OHNE_PROFIL,
  GANG_STATUS_NUR_GETRAENKE,
} from './gang';
import { weinprofil, rezept } from './__fixtures__/profile';

const profil = (werte) => weinprofil({
  rolle: 'vorspeise', hauptkomponente: 'gemuese', zubereitung: 'gebraten', sauce: 'keine', intensitaet: 2, ...werte,
});

describe('bildeGangProfil', () => {
  it('nimmt das Hauptgericht als Leitrezept, auch wenn ein anderes Rezept intensiver ist', () => {
    const gang = bildeGangProfil([
      rezept('salat', profil({ rolle: 'salat', hauptkomponente: 'kaese_frisch', intensitaet: 4, saeure: 3 })),
      rezept('braten', profil({ rolle: 'hauptgericht', hauptkomponente: 'rind_lamm', zubereitung: 'geschmort', intensitaet: 3, fett: 2 })),
    ]);
    expect(gang.status).toBe(GANG_STATUS_OK);
    expect(gang.leitRezeptId).toBe('braten');
    expect(gang.profil.hauptkomponente).toBe('rind_lamm');
    expect(gang.profil.zubereitung).toBe('geschmort');
    expect(gang.profil.rolle).toBe('hauptgericht');
    // Intensität und Komponenten: Maximum über alle Rezepte
    expect(gang.profil.intensitaet).toBe(4);
    expect(gang.profil.komponenten.saeure).toBe(3);
    expect(gang.profil.komponenten.fett).toBe(2);
  });

  it('nimmt ohne Hauptgericht das intensivste Rezept, bei Gleichstand das erste', () => {
    expect(bildeGangProfil([
      rezept('a', profil({ intensitaet: 2 })),
      rezept('b', profil({ hauptkomponente: 'ei', intensitaet: 3 })),
      rezept('c', profil({ hauptkomponente: 'pilze', intensitaet: 3 })),
    ]).leitRezeptId).toBe('b');
  });

  it('nimmt die Sauce aus einem Rezept mit Rolle sauce_dip, sonst vom Leitrezept', () => {
    const mitSauce = bildeGangProfil([
      rezept('spargel', profil({ rolle: 'hauptgericht', hauptkomponente: 'spargel', sauce: 'keine' })),
      rezept('hollandaise', profil({ rolle: 'sauce_dip', hauptkomponente: 'ei', sauce: 'sahne_butter_kaese' })),
    ]);
    expect(mitSauce.profil.sauce).toBe('sahne_butter_kaese');
    expect(mitSauce.profil.hauptkomponente).toBe('spargel');

    const ohneSauceRezept = bildeGangProfil([rezept('fisch', profil({ rolle: 'hauptgericht', sauce: 'zitrus_essig' }))]);
    expect(ohneSauceRezept.profil.sauce).toBe('zitrus_essig');
  });

  it('ignoriert Rezepte mit Rolle getraenk', () => {
    const gang = bildeGangProfil([
      rezept('punsch', profil({ rolle: 'getraenk', intensitaet: 5, suesse: 3 })),
      rezept('suppe', profil({ rolle: 'suppe', intensitaet: 2 })),
    ]);
    expect(gang.leitRezeptId).toBe('suppe');
    expect(gang.profil.intensitaet).toBe(2);
    expect(gang.profil.komponenten.suesse).toBe(0);
    expect(gang.rezeptIdsMitProfil).toEqual(['suppe']);
  });

  it('rechnet mit den vorhandenen Profilen, wenn einzelne fehlen', () => {
    const gang = bildeGangProfil([rezept('ohne'), rezept('mit', profil({ intensitaet: 3 }))]);
    expect(gang.status).toBe(GANG_STATUS_OK);
    expect(gang.fehlendeProfile).toBe(1);
  });

  it('markiert den Gang, wenn kein Rezept ein Profil hat', () => {
    expect(bildeGangProfil([rezept('a'), rezept('b')])).toEqual({ status: GANG_STATUS_OHNE_PROFIL, fehlendeProfile: 2 });
  });

  it('behandelt ein ungültiges Profil wie ein fehlendes', () => {
    const kaputt = { ...profil({}), hauptkomponente: 'tofu' };
    expect(bildeGangProfil([rezept('a', kaputt)]).status).toBe(GANG_STATUS_OHNE_PROFIL);
  });

  it('meldet einen Gang nur aus Getränken', () => {
    expect(bildeGangProfil([rezept('a', profil({ rolle: 'getraenk' }))]).status).toBe(GANG_STATUS_NUR_GETRAENKE);
  });
});

describe('gaengeAusMenue', () => {
  const rezepte = [
    rezept('vor', profil({ rolle: 'vorspeise' })),
    rezept('haupt', profil({ rolle: 'hauptgericht', intensitaet: 4 })),
    rezept('drink', profil({ rolle: 'getraenk' })),
    rezept('kuchen', profil({ rolle: 'gebaeck_kuchen', hauptkomponente: 'dessert_frucht' })),
  ];

  it('bildet Gänge in Menü-Reihenfolge und überspringt Drinks, leere und reine Getränke-Sektionen', () => {
    const gaenge = gaengeAusMenue({
      sections: [
        { name: 'Vorspeise', recipeIds: ['vor'] },
        { name: 'Leer', recipeIds: [] },
        { name: 'Aperitif', recipeIds: ['drink'] },
        { name: 'Hauptgang', recipeIds: ['haupt', 'gibt-es-nicht'] },
        { name: 'drinks', recipeIds: ['haupt'] },
        { name: 'Zum Kaffee', recipeIds: ['kuchen'] },
      ],
    }, rezepte);
    expect(gaenge.map((gang) => [gang.sektionIndex, gang.sektionName])).toEqual([
      [0, 'Vorspeise'],
      [3, 'Hauptgang'],
      [5, 'Zum Kaffee'],
    ]);
    expect(gaenge[1].rezeptIds).toEqual(['haupt']);
  });

  it('erkennt Dessert-Gänge an der Rolle des Leitrezepts oder am Sektionsnamen', () => {
    const gaenge = gaengeAusMenue({
      sections: [
        { name: 'Hauptgang', recipeIds: ['haupt'] },
        { name: 'Zum Kaffee', recipeIds: ['kuchen'] },
        { name: 'Dessertvariation', recipeIds: ['vor'] },
      ],
    }, rezepte);
    expect(gaenge.map((gang) => gang.istDessert)).toEqual([false, true, true]);
  });

  it('nimmt bei alten Menüs ohne Sektionen alle Rezepte als einen Gang', () => {
    const gaenge = gaengeAusMenue({ recipeIds: ['vor', 'haupt'] }, rezepte);
    expect(gaenge).toHaveLength(1);
    expect(gaenge[0].sektionName).toBe('Alle Rezepte');
    expect(gaenge[0].gang.leitRezeptId).toBe('haupt');
  });

  it('liefert für ein leeres Menü keine Gänge', () => {
    expect(gaengeAusMenue({ sections: [] }, rezepte)).toEqual([]);
    expect(gaengeAusMenue(null, [])).toEqual([]);
  });
});

describe('Hilfsfunktionen', () => {
  it('erkennt die Drinks-Sektion ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(istDrinksSektion('Drinks')).toBe(true);
    expect(istDrinksSektion(' drinks ')).toBe(true);
    expect(istDrinksSektion('Drinks & Snacks')).toBe(false);
    expect(istDrinksSektion(undefined)).toBe(false);
  });

  it('erkennt Dessert am Namen auch ohne Profil', () => {
    expect(istDessertGang('Dessert', { status: GANG_STATUS_OHNE_PROFIL })).toBe(true);
    expect(istDessertGang('Hauptgang', { status: GANG_STATUS_OHNE_PROFIL })).toBe(false);
  });
});
