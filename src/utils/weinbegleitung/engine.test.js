import {
  empfehlungFuerRezept,
  empfehlungFuerWeinprofil,
  folgeStrafe,
  folgeSteigertSich,
  optimiereFolgeVollstaendig,
  optimiereFolgeGreedy,
  waehleFolge,
  findeFixierung,
  berechneWeinbegleitung,
  berechneProGang,
  berechneEinWein,
  gemeinsameRangliste,
} from './engine';
import { gaengeAusMenue } from './gang';
import { getStil, alleStile } from './wissensbasis';
import {
  RULES_VERSION,
  S_MIN,
  MAX_GAENGE_VOLLSTAENDIG,
  MODUS_PRO_GANG,
  MODUS_EIN_WEIN,
  STATUS_OK,
  STATUS_OHNE_PROFIL,
  HINWEIS_KEIN_STIL,
  HINWEIS_OHNE_PROFIL,
  HINWEIS_KEIN_GEMEINSAMER_STIL,
} from './konstanten';
import {
  weinprofil,
  rezept,
  festmenue,
  G1_LACHSTATAR,
  G3_GARNELEN_CURRY,
  G5_RINDERSCHMORBRATEN,
  G6_SCHOKOLADENMOUSSE,
  E3_EXTREM,
} from './__fixtures__/profile';

describe('Einzelrezept', () => {
  it('gibt ohne Profil keine Empfehlung', () => {
    expect(empfehlungFuerRezept({ id: 'a' })).toEqual({ status: STATUS_OHNE_PROFIL });
    expect(empfehlungFuerRezept(null)).toEqual({ status: STATUS_OHNE_PROFIL });
  });

  it('verwirft ein Profil mit Werten außerhalb der Listen', () => {
    expect(empfehlungFuerWeinprofil({ ...G5_RINDERSCHMORBRATEN, intensitaet: 7 }).status).toBe(STATUS_OHNE_PROFIL);
    expect(empfehlungFuerWeinprofil({ ...G5_RINDERSCHMORBRATEN, sauce: 'bechamel' }).status).toBe(STATUS_OHNE_PROFIL);
    expect(empfehlungFuerWeinprofil({
      ...G5_RINDERSCHMORBRATEN,
      komponenten: { ...G5_RINDERSCHMORBRATEN.komponenten, umami: 1.5 },
    }).status).toBe(STATUS_OHNE_PROFIL);
  });

  it('liefert Stil, Label, Gründe und Alternativen aus dem Rezept', () => {
    const ergebnis = empfehlungFuerRezept(rezept('braten', G5_RINDERSCHMORBRATEN));
    expect(ergebnis).toMatchObject({ status: STATUS_OK, stilId: 'rot_kraeftig', label: 'passt hervorragend' });
    expect(ergebnis.regelIds).toEqual(['R7', 'R8', 'R1']);
    expect(ergebnis.alternativen.map((alternative) => alternative.stilId)).toEqual(['rot_mittel']);
  });

  it('bewertet ein Einzelrezept wie einen Gang, ohne Menüfolge', () => {
    const ergebnis = empfehlungFuerWeinprofil(G1_LACHSTATAR);
    expect(ergebnis.regelIds).not.toContain('R10');
    expect(ergebnis.alternativen.length).toBeLessThanOrEqual(2);
  });
});

describe('Strafen der Menüfolge', () => {
  const stil = getStil;

  it('Körper fällt um mehr als 1: -2', () => {
    expect(folgeStrafe(stil('weiss_voll'), stil('weiss_leicht_frisch'))).toBe(2);
    expect(folgeStrafe(stil('weiss_mild_mittel'), stil('weiss_leicht_frisch'))).toBe(0);
  });

  it('rot vor weiß oder rosé: -2', () => {
    expect(folgeStrafe(stil('rot_leicht'), stil('rose_trocken'))).toBe(2);
    expect(folgeStrafe(stil('rot_leicht'), stil('weiss_leicht_frisch'))).toBe(2);
  });

  it('Stile mit Süße 3 sind von der Farbregel ausgenommen', () => {
    // Körper 5 → 3 kostet weiterhin 2, die Farbe nicht
    expect(folgeStrafe(stil('rot_kraeftig'), stil('suesswein_edel'))).toBe(2);
    expect(folgeStrafe(stil('rot_mittel'), stil('suesswein_edel'))).toBe(0);
  });

  it('Süße fällt: -1 je Stufe', () => {
    expect(folgeStrafe(stil('weiss_aromatisch_feinherb'), stil('weiss_leicht_frisch'))).toBe(1);
    // Süßwein (3) vor Likörwein (3): gleiche Süße, Körper steigt
    expect(folgeStrafe(stil('suesswein_edel'), stil('likoerwein'))).toBe(0);
    // Likörwein vor trockenem Rotwein: Süße fällt um 3, Körper bleibt
    expect(folgeStrafe(stil('likoerwein'), stil('rot_kraeftig'))).toBe(3);
  });

  it('derselbe Stil direkt hintereinander: -1', () => {
    expect(folgeStrafe(stil('rot_mittel'), stil('rot_mittel'))).toBe(1);
  });

  it('erkennt eine Steigerung der Folge', () => {
    expect(folgeSteigertSich(stil('weiss_leicht_frisch'), stil('rot_kraeftig'))).toBe(true);
    expect(folgeSteigertSich(stil('rot_kraeftig'), stil('likoerwein'))).toBe(true);
    expect(folgeSteigertSich(stil('rot_mittel'), stil('rot_mittel'))).toBe(false);
  });
});

describe('Optimierung der Folge', () => {
  // Gang 1 hat einen kräftigen Roten knapp vor einem vollen Weißen, Gang 2 nur einen leichten Weißen.
  const zweiGaenge = () => [
    { kandidaten: [{ stilId: 'rot_kraeftig', score: 6 }, { stilId: 'weiss_voll', score: 5 }] },
    { kandidaten: [{ stilId: 'weiss_leicht_frisch', score: 5 }] },
  ];
  const mitFuenfWeiteren = () => [
    ...zweiGaenge(),
    ...Array.from({ length: 5 }, () => ({ kandidaten: [{ stilId: 'weiss_leicht_frisch', score: 5 }] })),
  ];

  it('prüft alle Kombinationen und verzichtet vorn auf Punkte, um Strafen zu vermeiden', () => {
    // rot_kraeftig → weiss_leicht_frisch: 6 + 5 - 2 (Körper) - 2 (Farbe) = 7
    // weiss_voll → weiss_leicht_frisch:   5 + 5 - 2 (Körper)              = 8
    expect(optimiereFolgeVollstaendig(zweiGaenge()).map((wahl) => wahl.stilId)).toEqual(['weiss_voll', 'weiss_leicht_frisch']);
  });

  it('wählt greedy von vorn den jeweils besten Kandidaten', () => {
    expect(optimiereFolgeGreedy(zweiGaenge()).map((wahl) => wahl.stilId)).toEqual(['rot_kraeftig', 'weiss_leicht_frisch']);
  });

  it(`prüft bis ${MAX_GAENGE_VOLLSTAENDIG} Gänge vollständig und darüber greedy`, () => {
    expect(waehleFolge(zweiGaenge())[0].stilId).toBe('weiss_voll');
    const sieben = mitFuenfWeiteren();
    expect(sieben.length).toBeGreaterThan(MAX_GAENGE_VOLLSTAENDIG);
    expect(waehleFolge(sieben)[0].stilId).toBe('rot_kraeftig');
  });

  it('kommt ohne Gänge mit Wein aus', () => {
    expect(waehleFolge([])).toEqual([]);
  });
});

describe('Modus „Pro Gang“', () => {
  it('liefert die Felder des Snapshots je Gang', () => {
    const { menu, rezepte } = festmenue();
    const ergebnis = berechneWeinbegleitung({ menu, rezepte });
    expect(ergebnis.modus).toBe(MODUS_PRO_GANG);
    expect(ergebnis.rulesVersion).toBe(RULES_VERSION);
    expect(ergebnis.gaenge[1]).toEqual(expect.objectContaining({
      sektionIndex: 1,
      sektionName: 'Hauptgang',
      stilId: 'rot_kraeftig',
      label: 'passt hervorragend',
      fixiert: false,
      hinweis: null,
    }));
    expect(ergebnis.gaenge[1].alternativen).toEqual([{ stilId: 'rot_mittel', label: 'passt' }]);
  });

  it('nennt R10 als Grund, wenn sich die Folge ohne Strafe steigert', () => {
    const { menu, rezepte } = festmenue();
    const [vorspeise, hauptgang] = berechneWeinbegleitung({ menu, rezepte }).gaenge;
    expect(vorspeise.regelIds).not.toContain('R10');
    expect(hauptgang.regelIds).toContain('R10');
  });

  it('bietet je Gang höchstens zwei Alternativen aus den Kandidaten an', () => {
    const { menu, rezepte } = festmenue();
    const [vorspeise] = berechneWeinbegleitung({ menu, rezepte }).gaenge;
    expect(vorspeise.alternativen.map((alternative) => alternative.stilId)).toEqual(['weiss_gruen_aromatisch', 'rose_trocken']);
  });

  it('gibt einem Gang ohne passenden Stil den Hinweis R11 und überspringt ihn in der Folge', () => {
    const menu = {
      sections: [
        { name: 'Vorspeise', recipeIds: ['lachs'] },
        { name: 'Zwischengang', recipeIds: ['extrem'] },
        { name: 'Hauptgang', recipeIds: ['braten'] },
      ],
    };
    const rezepte = [rezept('lachs', G1_LACHSTATAR), rezept('extrem', E3_EXTREM), rezept('braten', G5_RINDERSCHMORBRATEN)];
    const [, zwischengang, hauptgang] = berechneWeinbegleitung({ menu, rezepte }).gaenge;
    expect(zwischengang).toEqual(expect.objectContaining({ stilId: null, hinweis: HINWEIS_KEIN_STIL, regelIds: ['R11'] }));
    // Der Hauptgang folgt dem Weißwein der Vorspeise, nicht dem Gang ohne Wein
    expect(hauptgang.regelIds).toContain('R10');
  });

  it('markiert einen Gang ohne Profil und gibt ihm keine Empfehlung', () => {
    const menu = { sections: [{ name: 'Vorspeise', recipeIds: ['ohne'] }, { name: 'Hauptgang', recipeIds: ['braten'] }] };
    const rezepte = [rezept('ohne'), rezept('braten', G5_RINDERSCHMORBRATEN)];
    const [ohne, braten] = berechneWeinbegleitung({ menu, rezepte }).gaenge;
    expect(ohne).toEqual(expect.objectContaining({ stilId: null, hinweis: HINWEIS_OHNE_PROFIL, regelIds: [] }));
    expect(braten.stilId).toBe('rot_kraeftig');
  });
});

describe('Fixierte Gänge', () => {
  it('behält den fixierten Stil und rechnet die anderen Gänge drumherum', () => {
    const { menu, rezepte } = festmenue();
    const ergebnis = berechneWeinbegleitung({
      menu,
      rezepte,
      fixierungen: [{ sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'schaumwein_trocken' }],
    });
    const [vorspeise, hauptgang] = ergebnis.gaenge;
    expect(vorspeise).toEqual(expect.objectContaining({ stilId: 'schaumwein_trocken', fixiert: true }));
    expect(vorspeise.alternativen.map((alternative) => alternative.stilId)).not.toContain('schaumwein_trocken');
    expect(vorspeise.alternativen[0].stilId).toBe('weiss_leicht_frisch');
    expect(hauptgang).toEqual(expect.objectContaining({ stilId: 'rot_kraeftig', fixiert: false }));
  });

  it('übernimmt einen fixierten Stil auch unter S_MIN', () => {
    const { menu, rezepte } = festmenue();
    const [, hauptgang] = berechneWeinbegleitung({
      menu,
      rezepte,
      fixierungen: [{ sektionIndex: 1, sektionName: 'Hauptgang', stilId: 'rot_leicht' }],
    }).gaenge;
    expect(hauptgang.stilId).toBe('rot_leicht');
    expect(hauptgang.score).toBeLessThan(S_MIN);
    expect(hauptgang.label).toBe('passt');
  });

  it('findet die Fixierung nach dem Verschieben der Sektion über den Namen wieder', () => {
    const { rezepte } = festmenue();
    const verschoben = {
      sections: [
        { name: 'Hauptgang', recipeIds: ['schmorbraten'] },
        { name: 'Vorspeise', recipeIds: ['lachstatar'] },
      ],
    };
    const [hauptgang, vorspeise] = berechneWeinbegleitung({
      menu: verschoben,
      rezepte,
      fixierungen: [{ sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'schaumwein_trocken' }],
    }).gaenge;
    expect(vorspeise.stilId).toBe('schaumwein_trocken');
    expect(hauptgang.fixiert).toBe(false);
  });

  it('verlangt bei doppelten Sektionsnamen auch den passenden Index', () => {
    const fixierungen = [{ sektionIndex: 2, sektionName: 'Gang', stilId: 'rot_mittel' }];
    const haeufigkeit = new Map([['gang', 2]]);
    expect(findeFixierung({ sektionIndex: 2, sektionName: 'Gang' }, fixierungen, haeufigkeit)).toBe('rot_mittel');
    expect(findeFixierung({ sektionIndex: 0, sektionName: 'Gang' }, fixierungen, haeufigkeit)).toBeNull();
  });

  it('ignoriert Fixierungen auf unbekannte Stile', () => {
    const { menu, rezepte } = festmenue();
    const [vorspeise] = berechneWeinbegleitung({
      menu,
      rezepte,
      fixierungen: [{ sektionIndex: 0, sektionName: 'Vorspeise', stilId: 'gibt_es_nicht' }],
    }).gaenge;
    expect(vorspeise.fixiert).toBe(false);
    expect(vorspeise.stilId).toBe('weiss_leicht_frisch');
  });

  it('berechnet die Folge auch direkt aus den Gängen', () => {
    const { menu, rezepte } = festmenue();
    expect(berechneProGang(gaengeAusMenue(menu, rezepte))).toEqual(berechneWeinbegleitung({ menu, rezepte }));
  });
});

describe('Modus „Ein Wein für alles“', () => {
  it('wählt den Stil mit dem höchsten Minimum über die Nicht-Dessert-Gänge', () => {
    const { menu, rezepte } = festmenue();
    const ergebnis = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN });
    expect(ergebnis.modus).toBe(MODUS_EIN_WEIN);
    // Vorspeise 2,3 und Hauptgang 2,6: Minimum 2,3 ist das höchste aller Stile
    expect(ergebnis.gemeinsamerStilId).toBe('rot_mittel');
    expect(ergebnis.gaenge.map((gang) => gang.stilId)).toEqual(['rot_mittel', 'rot_mittel', 'likoerwein']);
    expect(ergebnis.gaenge.map((gang) => gang.istDessert)).toEqual([false, false, true]);
  });

  it('nimmt bei gleichem Minimum den Stil mit der höheren Summe, dann die Reihenfolge der Wissensbasis', () => {
    const gangMit = (scores) => ({
      bewertungen: alleStile().map((stil) => ({ stilId: stil.id, score: scores[stil.id] ?? 0, infrage: true })),
    });
    const rangliste = gemeinsameRangliste([
      gangMit({ weiss_leicht_frisch: 3, rot_leicht: 3, rose_trocken: 3 }),
      gangMit({ weiss_leicht_frisch: 3, rot_leicht: 5, rose_trocken: 3 }),
    ]);
    // alle drei haben Minimum 3; rot_leicht hat die höhere Summe, rosé und weiß sind gleich
    expect(rangliste.slice(0, 3).map((eintrag) => eintrag.stilId)).toEqual(['rot_leicht', 'weiss_leicht_frisch', 'rose_trocken']);
    expect(rangliste[0]).toEqual(expect.objectContaining({ minimum: 3, summe: 8 }));
  });

  it('lässt Stile weg, die für einen der Gänge nicht infrage kommen', () => {
    const gangMit = (scores, nichtInfrage = []) => ({
      bewertungen: alleStile().map((stil) => ({
        stilId: stil.id, score: scores[stil.id] ?? 0, infrage: !nichtInfrage.includes(stil.id),
      })),
    });
    const rangliste = gemeinsameRangliste([
      gangMit({ suesswein_edel: 9, rot_mittel: 3 }),
      gangMit({ suesswein_edel: 9, rot_mittel: 3 }, ['suesswein_edel']),
    ]);
    expect(rangliste.map((eintrag) => eintrag.stilId)).not.toContain('suesswein_edel');
    expect(rangliste[0].stilId).toBe('rot_mittel');
    expect(rangliste).toHaveLength(alleStile().length - 1);
  });

  it('wählt für zwei gleiche Currys den einzigen passenden Stil', () => {
    const menu = { sections: [{ name: 'Hauptgang', recipeIds: ['curry'] }, { name: 'Nachschlag', recipeIds: ['curry2'] }] };
    const rezepte = [rezept('curry', G3_GARNELEN_CURRY), rezept('curry2', G3_GARNELEN_CURRY)];
    expect(berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN }).gemeinsamerStilId).toBe('weiss_aromatisch_feinherb');
  });

  it('übernimmt einen gewählten gemeinsamen Stil und markiert ihn als fixiert', () => {
    const { menu, rezepte } = festmenue();
    const ergebnis = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN, gemeinsamerStilId: 'rose_trocken' });
    const [vorspeise, hauptgang, dessert] = ergebnis.gaenge;
    expect([vorspeise.stilId, hauptgang.stilId]).toEqual(['rose_trocken', 'rose_trocken']);
    expect(vorspeise.fixiert).toBe(true);
    expect(dessert.stilId).toBe('likoerwein');
  });

  it('meldet, wenn kein Stil zu allen Gängen passt', () => {
    // G5 braucht kräftigen Rotwein, G3 verträgt nur Feinherbes: kein gemeinsamer Stil über S_MIN
    const menu = { sections: [{ name: 'Vorspeise', recipeIds: ['curry'] }, { name: 'Hauptgang', recipeIds: ['braten'] }] };
    const rezepte = [rezept('curry', G3_GARNELEN_CURRY), rezept('braten', G5_RINDERSCHMORBRATEN)];
    const ergebnis = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN });
    expect(ergebnis.gemeinsamerStilId).toBeNull();
    ergebnis.gaenge.forEach((gang) => expect(gang.hinweis).toBe(HINWEIS_KEIN_GEMEINSAMER_STIL));
  });

  it('lässt Gänge ohne passenden Stil aus der gemeinsamen Wahl heraus', () => {
    const menu = { sections: [{ name: 'Vorspeise', recipeIds: ['extrem'] }, { name: 'Hauptgang', recipeIds: ['braten'] }] };
    const rezepte = [rezept('extrem', E3_EXTREM), rezept('braten', G5_RINDERSCHMORBRATEN)];
    const [vorspeise, hauptgang] = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN }).gaenge;
    expect(vorspeise.hinweis).toBe(HINWEIS_KEIN_STIL);
    expect(hauptgang.stilId).toBe('rot_kraeftig');
  });

  it('gibt bei einem reinen Dessert-Menü jedem Dessert eine eigene Empfehlung', () => {
    const menu = { sections: [{ name: 'Dessert', recipeIds: ['mousse'] }] };
    const rezepte = [rezept('mousse', G6_SCHOKOLADENMOUSSE)];
    const ergebnis = berechneEinWein(gaengeAusMenue(menu, rezepte));
    expect(ergebnis.gemeinsamerStilId).toBeNull();
    expect(ergebnis.gaenge[0].stilId).toBe('likoerwein');
  });

  it('erkennt ein Dessert auch an der Rolle, wenn der Name nichts verrät', () => {
    const menu = { sections: [{ name: 'Hauptgang', recipeIds: ['braten'] }, { name: 'Zum Schluss', recipeIds: ['strudel'] }] };
    const strudel = weinprofil({
      rolle: 'gebaeck_kuchen', hauptkomponente: 'dessert_frucht', zubereitung: 'gebacken', sauce: 'suess_fruchtig',
      intensitaet: 3, suesse: 2,
    });
    const rezepte = [rezept('braten', G5_RINDERSCHMORBRATEN), rezept('strudel', strudel)];
    const [hauptgang, schluss] = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN }).gaenge;
    expect(hauptgang.stilId).toBe('rot_kraeftig');
    expect(schluss).toEqual(expect.objectContaining({ istDessert: true, stilId: 'suesswein_edel' }));
  });
});
