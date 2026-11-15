import {
  EINBLICK_ANZAHL_STILE,
  formatZahl,
  formatPunkte,
  formatKonfidenz,
  formatDatum,
  profilEinblick,
  stilAufschluesselung,
  testfallText,
} from './einblick';
import { empfehlungFuerWeinprofil } from './engine';
import { bewerteAlleStile } from './bewertung';
import { normalisiereWeinprofil } from './profilSchema';
import { RULES_VERSION, S_MIN } from './konstanten';
import { G5_RINDERSCHMORBRATEN, G13_ENTE_ORANGE, E3_EXTREM } from './__fixtures__/profile';

const summe = (teile) => Math.round(teile.reduce((gesamt, teil) => gesamt + teil.punkte, 0) * 100) / 100;

describe('Formatierung', () => {
  it('schreibt Zahlen mit Komma, höchstens zwei Nachkommastellen und echtem Minus', () => {
    expect(formatZahl(7.9)).toBe('7,9');
    expect(formatZahl(2.4000000000000004)).toBe('2,4');
    expect(formatZahl(-3)).toBe('−3');
    expect(formatZahl(0)).toBe('0');
    expect(formatZahl(-0)).toBe('0');
    expect(formatZahl(-0.001)).toBe('0');
  });

  it('zeigt Punkte mit Vorzeichen, die Null ohne', () => {
    expect(formatPunkte(1)).toBe('+1');
    expect(formatPunkte(2.4000000000000004)).toBe('+2,4');
    expect(formatPunkte(-1.5)).toBe('−1,5');
    expect(formatPunkte(0)).toBe('0');
    expect(formatPunkte(0.001)).toBe('0');
  });

  it('zeigt die Konfidenz als Prozent und verwirft Ungültiges', () => {
    expect(formatKonfidenz(0.9)).toBe('90 %');
    expect(formatKonfidenz(1)).toBe('100 %');
    [undefined, null, '0.9', 1.5, -0.1, Number.NaN].forEach((wert) => expect(formatKonfidenz(wert)).toBeNull());
  });

  it('zeigt das Datum der Einschätzung, ohne Zeitpunkt nichts', () => {
    expect(formatDatum(Date.UTC(2026, 10, 14, 12))).toBe('14.11.2026');
    [undefined, null, 0, 'gestern'].forEach((wert) => expect(formatDatum(wert)).toBeNull());
  });
});

describe('profilEinblick', () => {
  it('gibt ohne gültiges Profil nichts zurück', () => {
    expect(profilEinblick(undefined)).toBeNull();
    expect(profilEinblick({ ...G5_RINDERSCHMORBRATEN, rolle: 'unbekannt' })).toBeNull();
  });

  it('nennt die Profilwerte in Worten', () => {
    const einblick = profilEinblick(G5_RINDERSCHMORBRATEN);
    expect(einblick.werte).toEqual([
      { name: 'Rolle', wert: 'Hauptgericht' },
      { name: 'Hauptzutat', wert: 'Rind oder Lamm' },
      { name: 'Zubereitung', wert: 'geschmort' },
      { name: 'Sauce', wert: 'Rotwein oder Jus' },
      { name: 'Intensität', wert: '5 von 5' },
    ]);
    expect(einblick.komponenten).toEqual([
      { id: 'saeure', name: 'Säure', wert: 0 },
      { id: 'suesse', name: 'Süße', wert: 0 },
      { id: 'salz', name: 'Salz', wert: 2 },
      { id: 'fett', name: 'Fett', wert: 2 },
      { id: 'schaerfe', name: 'Schärfe', wert: 0 },
      { id: 'bitter', name: 'Bitter', wert: 0 },
      { id: 'umami', name: 'Umami', wert: 2 },
    ]);
    expect(einblick.konfidenz).toBe('90 %');
    expect(einblick.modell).toBe('fixture');
    expect(einblick.datum).toBeNull();
    expect(einblick.schwelle).toBe(S_MIN);
  });

  it('zeigt die besten Stile mit denselben Punkten wie die Empfehlung', () => {
    const einblick = profilEinblick(G5_RINDERSCHMORBRATEN);
    const bewertungen = bewerteAlleStile(normalisiereWeinprofil(G5_RINDERSCHMORBRATEN));

    expect(einblick.stile).toHaveLength(EINBLICK_ANZAHL_STILE);
    expect(einblick.stile.map((stil) => [stil.stilId, stil.score]))
      .toEqual(bewertungen.slice(0, EINBLICK_ANZAHL_STILE).map((bewertung) => [bewertung.stilId, bewertung.score]));
    expect(einblick.stile[0]).toEqual(expect.objectContaining({
      stilId: empfehlungFuerWeinprofil(G5_RINDERSCHMORBRATEN).stilId,
      name: 'Rotwein, kräftig',
      score: 7.9,
      kandidat: true,
      einschraenkung: null,
    }));
    expect(profilEinblick(G5_RINDERSCHMORBRATEN, { anzahl: 2 }).stile).toHaveLength(2);
  });

  it('schlüsselt die Punkte nach Passung und Regeln auf, die Summe ergibt den Score', () => {
    const [kraeftig, ...rest] = profilEinblick(G5_RINDERSCHMORBRATEN).stile;
    expect(kraeftig.teile.map(({ text, punkte }) => [text, Math.round(punkte * 100) / 100])).toEqual([
      ['Hauptzutat stark', 2.4],
      ['Zubereitung stark', 1.5],
      ['Sauce stark', 3],
      ['Fett und Salz (R6)', 1],
    ]);
    [kraeftig, ...rest].forEach((stil) => expect(summe(stil.teile)).toBe(stil.score));
  });

  it('zeigt neutrale Passung mit ihren Punkten und lässt Regeln ohne Wirkung weg', () => {
    const mittel = profilEinblick(G5_RINDERSCHMORBRATEN).stile.find((stil) => stil.stilId === 'rot_mittel');
    expect(mittel.teile.map((teil) => teil.text)).toEqual([
      'Hauptzutat gut', 'Zubereitung gut', 'Sauce neutral', 'Kraft (R1)', 'Fett und Salz (R6)',
    ]);
  });

  it('markiert Stile, die für das Gericht nicht infrage kommen, mit ihrer Einschränkung', () => {
    const [erster, zweiter] = profilEinblick(G13_ENTE_ORANGE).stile;
    expect(erster).toEqual(expect.objectContaining({
      stilId: 'suesswein_edel',
      kandidat: false,
      einschraenkung: 'nur zu Dessert und Blauschimmelkäse',
    }));
    expect(zweiter).toEqual(expect.objectContaining({ stilId: 'weiss_aromatisch_feinherb', kandidat: true }));
  });

  it('kennzeichnet bei „Bier oder Wasser“ keinen Stil als Kandidaten', () => {
    expect(profilEinblick(E3_EXTREM).stile.every((stil) => !stil.kandidat)).toBe(true);
  });
});

describe('stilAufschluesselung', () => {
  it('kommt ohne Passungen und Terme aus', () => {
    expect(stilAufschluesselung({})).toEqual([]);
  });
});

describe('testfallText', () => {
  it('liefert das Profil als eine Zeile JSON mit Empfehlung und Regelstand, ohne Zutaten und Schritte', () => {
    const rezept = { id: 'r1', title: ' Rinderschmorbraten ', ingredients: ['Rotwein'], steps: ['Schmoren.'] };
    const text = testfallText(rezept, G5_RINDERSCHMORBRATEN);
    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toEqual({
      titel: 'Rinderschmorbraten',
      rolle: 'hauptgericht',
      hauptkomponente: 'rind_lamm',
      zubereitung: 'geschmort',
      sauce: 'rotwein_jus',
      intensitaet: 5,
      komponenten: { saeure: 0, suesse: 0, salz: 2, fett: 2, schaerfe: 0, bitter: 0, umami: 2 },
      konfidenz: 0.9,
      modell: 'fixture',
      empfehlung: 'rot_kraeftig',
      rulesVersion: RULES_VERSION,
    });
  });

  it('nennt „Bier oder Wasser“ als R11', () => {
    expect(JSON.parse(testfallText({ title: 'Extrem' }, E3_EXTREM)).empfehlung).toBe('R11');
  });

  it('gibt ohne gültiges Profil nichts zurück', () => {
    expect(testfallText({ title: 'Ohne' }, null)).toBeNull();
  });
});
