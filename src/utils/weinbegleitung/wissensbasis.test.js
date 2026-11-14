/**
 * Integrität der Wissensbasis (src/data/weinbegleitung/) und Pflicht zur
 * Versionierung: Ändert sich der Inhalt von Stilen, Regeln oder Engine-Konstanten,
 * muss RULES_VERSION steigen, sonst bleiben gespeicherte Menü-Weinbegleitungen
 * unbemerkt auf altem Stand.
 */
import { createHash } from 'crypto';
import * as konstanten from './konstanten';
import {
  alleStile,
  alleRegeln,
  alleQuellen,
  getQuelle,
  quellenFuerRegel,
  formatTemperatur,
  beispieleKurz,
  getStil,
} from './wissensbasis';
import { HAUPTKOMPONENTEN, ZUBEREITUNGEN, SAUCEN, ROLLEN } from './profilSchema';

const stile = alleStile();
const regeln = alleRegeln();
const quellen = alleQuellen();

// Fingerabdruck je RULES_VERSION. Neue Version: Eintrag ergänzen, alte Einträge nie ändern.
const FINGERABDRUECKE = {
  '2026-11-1': 'b3c3142f72c55ee9',
};

// JSON mit sortierten Schlüsseln: die Reihenfolge der Objekt-Schlüssel (auch die, die Babel
// für die Exporte erzeugt) ändert den Fingerabdruck nicht, die Reihenfolge in Listen schon
// (sie entscheidet bei Gleichstand).
const kanonisch = (wert) => {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(',')}]`;
  if (wert && typeof wert === 'object') {
    return `{${Object.keys(wert).sort().map((key) => `${JSON.stringify(key)}:${kanonisch(wert[key])}`).join(',')}}`;
  }
  return JSON.stringify(wert);
};

const fingerabdruck = () => {
  const { RULES_VERSION: _version, ...engineKonstanten } = konstanten;
  return createHash('sha256')
    .update(kanonisch({ stile, regeln, engineKonstanten }))
    .digest('hex')
    .slice(0, 16);
};

describe('Versionierung', () => {
  it('hat zu RULES_VERSION genau diesen Inhalt (sonst Version erhöhen und Fingerabdruck ergänzen)', () => {
    expect({ version: konstanten.RULES_VERSION, fingerabdruck: fingerabdruck() })
      .toEqual({ version: konstanten.RULES_VERSION, fingerabdruck: FINGERABDRUECKE[konstanten.RULES_VERSION] });
  });
});

describe('Quellen', () => {
  it('haben eindeutige IDs, Titel, Herausgeber und eine https-URL', () => {
    expect(new Set(quellen.map((quelle) => quelle.id)).size).toBe(quellen.length);
    quellen.forEach((quelle) => {
      expect(quelle.titel).toBeTruthy();
      expect(quelle.herausgeber).toBeTruthy();
      expect(quelle.url).toMatch(/^https:\/\/[^\s]+$/);
      expect(quelle.lizenzhinweis).toBeTruthy();
      if (quelle.abgerufenAm !== null) expect(quelle.abgerufenAm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('werden alle von einer Regel oder einem Stil verwendet', () => {
    const verwendet = new Set([...regeln, ...stile].flatMap((eintrag) => eintrag.quellenIds));
    quellen.forEach((quelle) => expect(verwendet.has(quelle.id)).toBe(true));
  });
});

describe('Regeln', () => {
  it('umfassen genau R1 bis R11', () => {
    expect(regeln.map((regel) => regel.id)).toEqual(Array.from({ length: 11 }, (_, i) => `R${i + 1}`));
  });

  it('haben einen eigenen Kurztext mit höchstens 120 Zeichen', () => {
    regeln.forEach((regel) => {
      expect(regel.kurztext.length).toBeGreaterThan(0);
      expect(regel.kurztext.length).toBeLessThanOrEqual(120);
    });
    expect(new Set(regeln.map((regel) => regel.kurztext)).size).toBe(regeln.length);
  });

  it('verweisen jeweils auf mindestens eine vorhandene Quelle', () => {
    regeln.forEach((regel) => {
      expect(regel.quellenIds.length).toBeGreaterThanOrEqual(1);
      regel.quellenIds.forEach((id) => expect(getQuelle(id)).not.toBeNull());
      expect(quellenFuerRegel(regel.id)).toHaveLength(regel.quellenIds.length);
    });
  });
});

describe('Stile', () => {
  const erlaubteTags = new Set([
    ...HAUPTKOMPONENTEN.map((wert) => `hk:${wert}`),
    ...ZUBEREITUNGEN.map((wert) => `zb:${wert}`),
    ...SAUCEN.filter((wert) => wert !== 'keine').map((wert) => `sc:${wert}`),
  ]);

  it('sind zwölf mit eindeutigen IDs', () => {
    expect(stile).toHaveLength(12);
    expect(new Set(stile.map((stil) => stil.id)).size).toBe(stile.length);
  });

  it.each(stile.map((stil) => [stil.id, stil]))('%s hat gültige Kennwerte', (_id, stil) => {
    expect(['weiss', 'rose', 'rot']).toContain(stil.farbe);
    expect(stil.suesse).toBeGreaterThanOrEqual(0);
    expect(stil.suesse).toBeLessThanOrEqual(3);
    expect(stil.saeure).toBeGreaterThanOrEqual(1);
    expect(stil.saeure).toBeLessThanOrEqual(3);
    expect(stil.koerper).toBeGreaterThanOrEqual(1);
    expect(stil.koerper).toBeLessThanOrEqual(5);
    expect(stil.tannin).toBeGreaterThanOrEqual(0);
    expect(stil.tannin).toBeLessThanOrEqual(3);
    expect(stil.alkohol).toBeGreaterThanOrEqual(1);
    expect(stil.alkohol).toBeLessThanOrEqual(3);
    [stil.suesse, stil.saeure, stil.koerper, stil.tannin, stil.alkohol].forEach((wert) => expect(Number.isInteger(wert)).toBe(true));
    expect(typeof stil.schaum).toBe('boolean');
    expect(stil.alkoholfrei).toBeNull();
    expect(stil.temperatur.min).toBeLessThan(stil.temperatur.max);
    expect(stil.beispiele.length).toBeGreaterThanOrEqual(2);
    stil.quellenIds.forEach((id) => expect(getQuelle(id)).not.toBeNull());
  });

  it.each(stile.map((stil) => [stil.id, stil]))('%s nutzt nur gültige Passungs-Tags, jeden höchstens einmal', (_id, stil) => {
    const tags = [...stil.passung.stark, ...stil.passung.gut, ...stil.passung.meiden];
    tags.forEach((tag) => expect(erlaubteTags.has(tag)).toBe(true));
    expect(new Set(tags).size).toBe(tags.length);
  });

  // Akzeptanzkriterium 6: nur Stile mit Rebsorten-Beispielen, nie Flaschen, Erzeuger, Jahrgänge oder Preise.
  it('nennen keine Jahrgänge, Preise, Erzeuger oder Flaschen', () => {
    const verboten = /\d|€|\$|\bEUR\b|preis|weingut|winzerhof|domaine|ch[aâ]teau|bodega|tenuta|flasche/i;
    stile.forEach((stil) => {
      [stil.name, ...stil.beispiele].forEach((text) => expect(text).not.toMatch(verboten));
    });
    regeln.forEach((regel) => expect(regel.kurztext).not.toMatch(verboten));
  });
});

describe('Anzeige-Helfer', () => {
  it('formatiert die Trinktemperatur', () => {
    expect(formatTemperatur(getStil('rot_kraeftig'))).toBe('16–18 °C');
    expect(formatTemperatur(null)).toBe('');
  });

  it('liefert die ersten zwei Beispiele', () => {
    expect(beispieleKurz(getStil('rot_mittel'))).toEqual(['Lemberger', 'Dornfelder']);
    expect(beispieleKurz(undefined)).toEqual([]);
  });
});

describe('Profil-Listen', () => {
  it('haben die Werte aus der Spezifikation', () => {
    expect(ROLLEN).toHaveLength(10);
    expect(HAUPTKOMPONENTEN).toHaveLength(19);
    expect(ZUBEREITUNGEN).toHaveLength(8);
    expect(SAUCEN).toHaveLength(12);
  });

  it('decken die Rollen ohne Wein ab', () => {
    konstanten.ROLLEN_OHNE_WEIN.forEach((rolle) => expect(ROLLEN).toContain(rolle));
  });
});
