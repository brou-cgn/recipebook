/**
 * Golden-Tests der Weinbegleitung (Spezifikation im Tracker
 * docs/vorhaben/weinbegleitung.md). Sie kalibrieren Schwellen und Gewichte:
 * Wer Konstanten oder Wissensbasis ändert, muss hier grün bleiben.
 */
import { empfehlungFuerWeinprofil, berechneWeinbegleitung } from './engine';
import { getStil, quellenFuerRegel } from './wissensbasis';
import {
  S_MIN,
  MODUS_EIN_WEIN,
  STATUS_OK,
  STATUS_ROLLE_OHNE_WEIN,
  STATUS_KEIN_STIL,
  HINWEIS_KEIN_STIL,
} from './konstanten';
import {
  weinprofil,
  festmenue,
  G1_LACHSTATAR,
  G2_SPARGEL_HOLLANDAISE,
  G3_GARNELEN_CURRY,
  G4_PILZRISOTTO,
  G5_RINDERSCHMORBRATEN,
  G6_SCHOKOLADENMOUSSE,
  G7_APFELSTRUDEL,
  E3_EXTREM,
} from './__fixtures__/profile';

// Akzeptanzkriterium 3: jeder empfohlene Stil hat mindestens einen Grund mit Quellenlink.
const erwarteGruendeMitQuelle = (regelIds) => {
  expect(regelIds.length).toBeGreaterThanOrEqual(1);
  regelIds.forEach((regelId) => {
    const quellen = quellenFuerRegel(regelId);
    expect(quellen.length).toBeGreaterThanOrEqual(1);
    quellen.forEach((quelle) => expect(quelle.url).toMatch(/^https:\/\//));
  });
};

const alleStilIds = (ergebnis) => [ergebnis.stilId, ...ergebnis.alternativen.map((alternative) => alternative.stilId)];

describe('Golden-Tests Einzelgerichte', () => {
  it('G1 Lachstatar mit Limette: weiss_leicht_frisch oder schaumwein_trocken', () => {
    const ergebnis = empfehlungFuerWeinprofil(G1_LACHSTATAR);
    expect(ergebnis.status).toBe(STATUS_OK);
    expect(['weiss_leicht_frisch', 'schaumwein_trocken']).toContain(ergebnis.stilId);
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });

  it('G2 Spargel mit Sauce hollandaise: weiss_mild_mittel', () => {
    const ergebnis = empfehlungFuerWeinprofil(G2_SPARGEL_HOLLANDAISE);
    expect(ergebnis.stilId).toBe('weiss_mild_mittel');
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });

  it('G3 Scharfes Garnelen-Curry: weiss_aromatisch_feinherb, nie rot_kraeftig', () => {
    const ergebnis = empfehlungFuerWeinprofil(G3_GARNELEN_CURRY);
    expect(ergebnis.stilId).toBe('weiss_aromatisch_feinherb');
    expect(alleStilIds(ergebnis)).not.toContain('rot_kraeftig');
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });

  it('G4 Pilzrisotto: rot_leicht oder weiss_voll', () => {
    const ergebnis = empfehlungFuerWeinprofil(G4_PILZRISOTTO);
    expect(['rot_leicht', 'weiss_voll']).toContain(ergebnis.stilId);
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });

  it('G5 Rinderschmorbraten in Rotweinsauce: rot_kraeftig', () => {
    const ergebnis = empfehlungFuerWeinprofil(G5_RINDERSCHMORBRATEN);
    expect(ergebnis.stilId).toBe('rot_kraeftig');
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });

  it('G6 Schokoladenmousse: likoerwein oder suesswein_edel, nie ein trockener Stil', () => {
    const ergebnis = empfehlungFuerWeinprofil(G6_SCHOKOLADENMOUSSE);
    expect(['likoerwein', 'suesswein_edel']).toContain(ergebnis.stilId);
    alleStilIds(ergebnis).forEach((stilId) => expect(getStil(stilId).suesse).toBeGreaterThan(0));
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });

  it('G7 Apfelstrudel: suesswein_edel', () => {
    const ergebnis = empfehlungFuerWeinprofil(G7_APFELSTRUDEL);
    expect(ergebnis.stilId).toBe('suesswein_edel');
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });
});

describe('Golden-Tests Menü', () => {
  it('G8 Menü G1 → G5 → G6: weiß oder Sekt, dann rot, dann süß, ohne Strafpunkte', () => {
    const { menu, rezepte } = festmenue();
    const ergebnis = berechneWeinbegleitung({ menu, rezepte });
    const [vorspeise, hauptgang, dessert] = ergebnis.gaenge.map((gang) => getStil(gang.stilId));

    expect(ergebnis.gaenge).toHaveLength(3);
    expect(vorspeise.farbe).toBe('weiss');
    expect(hauptgang.farbe).toBe('rot');
    expect(dessert.suesse).toBeGreaterThanOrEqual(3);
    expect(ergebnis.strafen).toBe(0);
    ergebnis.gaenge.forEach((gang) => {
      expect(gang.strafe).toBe(0);
      erwarteGruendeMitQuelle(gang.regelIds);
    });
  });

  it('G9 Ein-Wein-Modus für G1 + G5 + G6: ein Stil für G1 und G5, Dessert separat', () => {
    const { menu, rezepte } = festmenue();
    const ergebnis = berechneWeinbegleitung({ menu, rezepte, modus: MODUS_EIN_WEIN });
    const [vorspeise, hauptgang, dessert] = ergebnis.gaenge;

    expect(vorspeise.stilId).not.toBeNull();
    expect(vorspeise.stilId).toBe(hauptgang.stilId);
    expect(ergebnis.gemeinsamerStilId).toBe(vorspeise.stilId);
    expect(dessert.istDessert).toBe(true);
    expect(dessert.stilId).not.toBe(vorspeise.stilId);
    expect(['likoerwein', 'suesswein_edel']).toContain(dessert.stilId);
    ergebnis.gaenge.forEach((gang) => erwarteGruendeMitQuelle(gang.regelIds));
  });
});

describe('Golden-Tests Einzelrezept', () => {
  it('E1 Einzelrezept G5: rot_kraeftig, Alternativen nur mit Score >= S_MIN', () => {
    const ergebnis = empfehlungFuerWeinprofil(G5_RINDERSCHMORBRATEN);
    expect(ergebnis.status).toBe(STATUS_OK);
    expect(ergebnis.stilId).toBe('rot_kraeftig');
    expect(ergebnis.alternativen.length).toBeLessThanOrEqual(2);
    ergebnis.alternativen.forEach((alternative) => {
      expect(alternative.score).toBeGreaterThanOrEqual(S_MIN);
      erwarteGruendeMitQuelle(alternative.regelIds);
    });
  });

  it.each(['getraenk', 'sauce_dip', 'beilage', 'gebaeck_kuchen'])(
    'E2 Einzelrezept mit Rolle %s: keine Empfehlung',
    (rolle) => {
      const profil = weinprofil({
        rolle, hauptkomponente: 'gemuese', zubereitung: 'kalt', sauce: 'keine', intensitaet: 2,
      });
      const ergebnis = empfehlungFuerWeinprofil(profil);
      expect(ergebnis.status).toBe(STATUS_ROLLE_OHNE_WEIN);
      expect(ergebnis.stilId).toBeUndefined();
    },
  );

  it('E3 Synthetisches Extremprofil: Hinweis R11', () => {
    const ergebnis = empfehlungFuerWeinprofil(E3_EXTREM);
    expect(ergebnis.status).toBe(STATUS_KEIN_STIL);
    expect(ergebnis.hinweis).toBe(HINWEIS_KEIN_STIL);
    expect(ergebnis.regelIds).toEqual(['R11']);
    erwarteGruendeMitQuelle(ergebnis.regelIds);
  });
});
