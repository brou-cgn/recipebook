import {
  regelTerme,
  bewerteStil,
  bewerteAlleStile,
  gangTags,
  passungsStufe,
  labelFuer,
  ermittleGruende,
  farbePasstZuR8,
  kommtInfrage,
  istKandidat,
} from './bewertung';
import { getStil, stilReihenfolge } from './wissensbasis';
import { S_MIN, S_GUT, S_TOP, LABEL_TOP, LABEL_GUT, LABEL_BASIS } from './konstanten';

// Synthetischer Stil ohne Passungs-Tags: jede Regel lässt sich einzeln prüfen.
const stil = (werte = {}) => ({
  id: 'test',
  farbe: 'weiss',
  suesse: 0,
  saeure: 2,
  koerper: 3,
  tannin: 0,
  alkohol: 2,
  schaum: false,
  passung: { stark: [], gut: [], meiden: [] },
  ...werte,
});

// Synthetisches Gang-Profil: Intensität 3, alle Komponenten 0, keine Sauce.
const gang = (werte = {}, komponenten = {}) => ({
  rolle: 'hauptgericht',
  hauptkomponente: 'gemuese',
  zubereitung: 'gebraten',
  sauce: 'keine',
  intensitaet: 3,
  ...werte,
  komponenten: { saeure: 0, suesse: 0, salz: 0, fett: 0, schaerfe: 0, bitter: 0, umami: 0, ...komponenten },
});

describe('Passung', () => {
  it('bewertet stark +3, gut +2, sonst +1 und meiden -3', () => {
    const testStil = stil({ passung: { stark: ['hk:gemuese'], gut: ['zb:gebraten'], meiden: ['sc:tomate'] } });
    expect(passungsStufe(testStil, 'hk:gemuese')).toBe('stark');
    expect(passungsStufe(testStil, 'zb:gebraten')).toBe('gut');
    expect(passungsStufe(testStil, 'sc:tomate')).toBe('meiden');
    expect(passungsStufe(testStil, 'hk:wild')).toBe('neutral');
  });

  it('gewichtet ohne Sauce hk mit 1,0 und zb mit 0,5, ohne sc-Tag', () => {
    expect(gangTags(gang())).toEqual([
      { art: 'hk', tag: 'hk:gemuese', gewicht: 1 },
      { art: 'zb', tag: 'zb:gebraten', gewicht: 0.5 },
    ]);
  });

  it('gewichtet mit Sauce sc mit 1,0 und hk mit 0,8', () => {
    expect(gangTags(gang({ sauce: 'tomate' }))).toEqual([
      { art: 'hk', tag: 'hk:gemuese', gewicht: 0.8 },
      { art: 'zb', tag: 'zb:gebraten', gewicht: 0.5 },
      { art: 'sc', tag: 'sc:tomate', gewicht: 1 },
    ]);
  });

  it('summiert die gewichteten Punkte ohne Rundungsrest', () => {
    const testStil = stil({ passung: { stark: [], gut: ['sc:tomate'], meiden: [] } });
    // 0,8 * 1 + 0,5 * 1 + 1,0 * 2 = 3,3 (R1 ist 0 bei Körper 3 und Intensität 3)
    expect(bewerteStil(testStil, gang({ sauce: 'tomate' })).score).toBe(3.3);
  });

  it('zieht meiden deutlich ab', () => {
    const testStil = stil({ passung: { stark: [], gut: [], meiden: ['hk:gemuese'] } });
    // ohne Sauce: 1,0 * -3 + 0,5 * 1 = -2,5
    expect(bewerteStil(testStil, gang()).score).toBe(-2.5);
  });
});

describe('Regel-Terme einzeln', () => {
  it('R1: -1 je Stufe Abstand zwischen Körper und Intensität', () => {
    expect(regelTerme(stil({ koerper: 3 }), gang({ intensitaet: 3 })).R1).toBe(0);
    expect(regelTerme(stil({ koerper: 3 }), gang({ intensitaet: 5 })).R1).toBe(-2);
    expect(regelTerme(stil({ koerper: 4 }), gang({ intensitaet: 1 })).R1).toBe(-3);
  });

  it('R2: -2 je Stufe, wenn das Gericht säurereicher ist als der Wein', () => {
    expect(regelTerme(stil({ saeure: 1 }), gang({}, { saeure: 3 })).R2).toBe(-4);
    expect(regelTerme(stil({ saeure: 2 }), gang({}, { saeure: 2 })).R2).toBe(0);
    expect(regelTerme(stil({ saeure: 3 }), gang({}, { saeure: 1 })).R2).toBe(0);
  });

  it('R3: wenn das Gericht süßer ist als der Wein, wächst die Strafe mit dem Abstand (1, 3, 6)', () => {
    expect(regelTerme(stil({ suesse: 0 }), gang({}, { suesse: 1 })).R3).toBe(-1);
    expect(regelTerme(stil({ suesse: 0 }), gang({}, { suesse: 2 })).R3).toBe(-3);
    expect(regelTerme(stil({ suesse: 0 }), gang({}, { suesse: 3 })).R3).toBe(-6);
    expect(regelTerme(stil({ suesse: 1 }), gang({}, { suesse: 3 })).R3).toBe(-3);
    expect(regelTerme(stil({ suesse: 1 }), gang({}, { suesse: 1 })).R3).toBe(0);
  });

  it('R3: deutlich süßerer Wein kostet -2 je Stufe über 1, außer zu Blauschimmelkäse', () => {
    expect(regelTerme(stil({ suesse: 2 }), gang({}, { suesse: 1 })).R3).toBe(0);
    expect(regelTerme(stil({ suesse: 2 }), gang({}, { suesse: 0 })).R3).toBe(-2);
    expect(regelTerme(stil({ suesse: 3 }), gang({}, { suesse: 0 })).R3).toBe(-4);
    expect(regelTerme(stil({ suesse: 3 }), gang({ hauptkomponente: 'kaese_blau' }, { suesse: 0 })).R3).toBe(0);
  });

  it('R4: greift erst ab Schärfe 2', () => {
    expect(regelTerme(stil({ tannin: 3, alkohol: 3 }), gang({}, { schaerfe: 1 })).R4).toBe(0);
  });

  it('R4: -2 je Tannin-Stufe und -1 je Alkohol-Stufe über 1', () => {
    expect(regelTerme(stil({ tannin: 3, alkohol: 3 }), gang({}, { schaerfe: 2 })).R4).toBe(-8);
    expect(regelTerme(stil({ tannin: 0, alkohol: 1 }), gang({}, { schaerfe: 3 })).R4).toBe(0);
  });

  it('R4: +1 bei Restsüße und +1 bei Schaum', () => {
    expect(regelTerme(stil({ tannin: 0, alkohol: 1, suesse: 1 }), gang({}, { schaerfe: 2, suesse: 1 })).R4).toBe(1);
    expect(regelTerme(stil({ tannin: 0, alkohol: 1, suesse: 1, schaum: true }), gang({}, { schaerfe: 2, suesse: 1 })).R4).toBe(2);
  });

  it('R5: Umami ohne viel Salz kostet -1 je Tannin-Stufe über 1', () => {
    expect(regelTerme(stil({ tannin: 3 }), gang({}, { umami: 2 })).R5).toBe(-2);
    expect(regelTerme(stil({ tannin: 1 }), gang({}, { umami: 3 })).R5).toBe(0);
    expect(regelTerme(stil({ tannin: 3 }), gang({}, { umami: 2, salz: 2 })).R5).toBe(0);
    expect(regelTerme(stil({ tannin: 3 }), gang({}, { umami: 1 })).R5).toBe(0);
  });

  it('R6: Fett oder Salz ab 2 bringt +1 bei Tannin ab 2 oder Säure 3', () => {
    expect(regelTerme(stil({ tannin: 2 }), gang({}, { fett: 2 })).R6).toBe(1);
    expect(regelTerme(stil({ saeure: 3 }), gang({}, { salz: 2 })).R6).toBe(1);
    expect(regelTerme(stil({ tannin: 1, saeure: 2 }), gang({}, { fett: 3 })).R6).toBe(0);
    expect(regelTerme(stil({ tannin: 3 }), gang({}, { fett: 1, salz: 1 })).R6).toBe(0);
  });

  it('R9: Bitteres ab 2 und Tannin ab 2 kostet -2', () => {
    expect(regelTerme(stil({ tannin: 2 }), gang({}, { bitter: 2 })).R9).toBe(-2);
    expect(regelTerme(stil({ tannin: 1 }), gang({}, { bitter: 3 })).R9).toBe(0);
    expect(regelTerme(stil({ tannin: 3 }), gang({}, { bitter: 1 })).R9).toBe(0);
  });

  it('liefert 0 statt -0, wenn eine Regel nichts abzieht', () => {
    const terme = regelTerme(stil(), gang());
    Object.values(terme).forEach((wert) => expect(Object.is(wert, 0)).toBe(true));
  });
});

describe('Einschränkung nurZu', () => {
  const suesswein = stil({ suesse: 3, nurZu: ['rolle:dessert', 'hk:dessert_schoko', 'hk:kaese_blau'] });

  it('lässt Stile ohne nurZu immer zu', () => {
    expect(kommtInfrage(stil(), gang())).toBe(true);
    expect(kommtInfrage(stil({ nurZu: [] }), gang())).toBe(true);
  });

  it('lässt einen Stil mit nurZu nur zu passender Rolle oder Hauptkomponente zu', () => {
    expect(kommtInfrage(suesswein, gang({ rolle: 'dessert', hauptkomponente: 'kaese_frisch' }))).toBe(true);
    expect(kommtInfrage(suesswein, gang({ rolle: 'vorspeise', hauptkomponente: 'kaese_blau' }))).toBe(true);
    expect(kommtInfrage(suesswein, gang({ rolle: 'hauptgericht', hauptkomponente: 'gefluegel' }))).toBe(false);
  });

  it('schließt auch bei hohem Score aus: Süße im herzhaften Gericht macht es nicht zum Dessert', () => {
    const passtGut = { ...suesswein, passung: { stark: ['hk:gefluegel', 'sc:suess_fruchtig'], gut: [], meiden: [] } };
    const bewertung = bewerteStil(passtGut, gang({ hauptkomponente: 'gefluegel', sauce: 'suess_fruchtig' }, { suesse: 3 }));
    expect(bewertung.score).toBeGreaterThanOrEqual(S_MIN);
    expect(bewertung.infrage).toBe(false);
    expect(istKandidat(bewertung)).toBe(false);
  });

  it('istKandidat verlangt infrage und S_MIN', () => {
    expect(istKandidat({ infrage: true, score: S_MIN })).toBe(true);
    expect(istKandidat({ infrage: true, score: S_MIN - 0.1 })).toBe(false);
    expect(istKandidat({ infrage: false, score: S_TOP })).toBe(false);
  });
});

describe('Labels', () => {
  it.each([
    [S_TOP, LABEL_TOP],
    [S_TOP - 0.01, LABEL_GUT],
    [S_GUT, LABEL_GUT],
    [S_GUT - 0.01, LABEL_BASIS],
    [S_MIN, LABEL_BASIS],
  ])('Score %s ergibt „%s“', (score, label) => {
    expect(labelFuer(score)).toBe(label);
  });
});

describe('Gründe', () => {
  it('nennt R7, wenn die Sauce beim Stil „stark“ ist', () => {
    const testStil = stil({ passung: { stark: ['sc:tomate'], gut: [], meiden: [] } });
    expect(ermittleGruende(testStil, gang({ sauce: 'tomate' }))).toContain('R7');
  });

  it('nennt R8 nur, wenn die Farbe zur Aussage der Regel passt', () => {
    const rot = stil({ farbe: 'rot', passung: { stark: ['hk:rind_lamm', 'hk:pilze'], gut: [], meiden: [] } });
    expect(ermittleGruende(rot, gang({ hauptkomponente: 'rind_lamm' }))).toContain('R8');
    expect(ermittleGruende(rot, gang({ hauptkomponente: 'pilze' }))).not.toContain('R8');
    expect(farbePasstZuR8(stil({ farbe: 'weiss' }), gang({ hauptkomponente: 'fisch_mager' }))).toBe(true);
    expect(farbePasstZuR8(stil({ farbe: 'rose' }), gang({ hauptkomponente: 'fisch_mager' }))).toBe(false);
  });

  it('nennt R3, wenn ein süßes Gericht einen mindestens so süßen Wein bekommt', () => {
    expect(ermittleGruende(stil({ suesse: 3, koerper: 5 }), gang({ hauptkomponente: 'dessert_schoko' }, { suesse: 3 })))
      .toContain('R3');
  });

  it('nennt R3 auch für Süßwein zu Blauschimmelkäse', () => {
    expect(ermittleGruende(stil({ suesse: 3 }), gang({ hauptkomponente: 'kaese_blau' }))).toContain('R3');
  });

  it('nennt R4 bei Schärfe für einen Wein mit wenig Gerbstoff und Alkohol', () => {
    expect(ermittleGruende(stil({ tannin: 0, alkohol: 1 }), gang({}, { schaerfe: 3 }))).toContain('R4');
    expect(ermittleGruende(stil({ tannin: 2, alkohol: 3 }), gang({}, { schaerfe: 3 }))).not.toContain('R4');
  });

  it('nennt R10 nur, wenn die Menüfolge es meldet', () => {
    expect(ermittleGruende(stil(), gang())).not.toContain('R10');
    expect(ermittleGruende(stil(), gang(), { folgeGrund: true })).toContain('R10');
  });

  it('nennt höchstens drei Gründe, sortiert nach Beitrag', () => {
    const gruende = ermittleGruende(getStil('rot_kraeftig'), gang(
      { hauptkomponente: 'rind_lamm', zubereitung: 'geschmort', sauce: 'rotwein_jus', intensitaet: 5 },
      { fett: 2, salz: 2, umami: 2 },
    ));
    expect(gruende).toEqual(['R7', 'R8', 'R1']);
  });

  it('fällt ohne erfüllte Bedingung auf R1 zurück', () => {
    expect(ermittleGruende(stil({ koerper: 5 }), gang({ intensitaet: 1 }))).toEqual(['R1']);
  });

  it('fällt bei passender Farbe auf R8 zurück', () => {
    expect(ermittleGruende(stil({ farbe: 'rot', koerper: 5 }), gang({ hauptkomponente: 'wild', intensitaet: 1 })))
      .toEqual(['R8']);
  });
});

describe('Rangliste', () => {
  it('sortiert alle zwölf Stile absteigend und bei Gleichstand nach der Wissensbasis', () => {
    const bewertungen = bewerteAlleStile(gang());
    expect(bewertungen).toHaveLength(12);
    for (let i = 1; i < bewertungen.length; i += 1) {
      const [vorher, nachher] = [bewertungen[i - 1], bewertungen[i]];
      expect(vorher.score).toBeGreaterThanOrEqual(nachher.score);
      if (vorher.score === nachher.score) {
        expect(stilReihenfolge(vorher.stilId)).toBeLessThan(stilReihenfolge(nachher.stilId));
      }
    }
  });
});
