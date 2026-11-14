import { kennwerteFuer, weinfarbe, weinprofilFehlertext, neueresProfil, TEXT_KEIN_STIL } from './anzeige';
import { getStil } from './wissensbasis';

describe('kennwerteFuer', () => {
  it('beschreibt Körper, Gerbstoff und Süße in Worten', () => {
    expect(kennwerteFuer(getStil('rot_kraeftig'))).toEqual([
      { name: 'Körper', wert: 'sehr kräftig' },
      { name: 'Gerbstoff', wert: 'kräftig' },
      { name: 'Süße', wert: 'trocken' },
    ]);
    expect(kennwerteFuer(getStil('weiss_aromatisch_feinherb'))[2]).toEqual({ name: 'Süße', wert: 'feinherb' });
  });

  it('liefert für jeden Stil der Wissensbasis drei Werte ohne Lücke', () => {
    ['schaumwein_trocken', 'weiss_leicht_frisch', 'rose_trocken', 'rot_leicht', 'suesswein_edel', 'likoerwein'].forEach((id) => {
      kennwerteFuer(getStil(id)).forEach((eintrag) => expect(eintrag.wert).not.toBe(''));
    });
  });

  it('kommt ohne Stil aus', () => {
    expect(kennwerteFuer(null)).toEqual([]);
  });
});

describe('weinfarbe', () => {
  it('nimmt die Farbe des Stils, Süßweine bekommen Bernstein', () => {
    expect(weinfarbe(getStil('weiss_leicht_frisch'))).toBe('weiss');
    expect(weinfarbe(getStil('rose_trocken'))).toBe('rose');
    expect(weinfarbe(getStil('rot_kraeftig'))).toBe('rot');
    expect(weinfarbe(getStil('suesswein_edel'))).toBe('suess');
    expect(weinfarbe(getStil('likoerwein'))).toBe('suess');
    expect(weinfarbe(undefined)).toBe('weiss');
  });
});

describe('weinprofilFehlertext', () => {
  it('übersetzt die Gründe aus der Antwort', () => {
    expect(weinprofilFehlertext('tageslimit')).toMatch(/Tageslimit/);
    expect(weinprofilFehlertext('keinZugriff')).toMatch(/nicht einschätzen/);
    expect(weinprofilFehlertext('kiFehler')).toMatch(/nicht geklappt/);
    expect(weinprofilFehlertext('unbekannt')).toMatch(/nicht geklappt/);
  });

  it('übersetzt geworfene Callable-Fehler', () => {
    expect(weinprofilFehlertext({ code: 'functions/resource-exhausted' })).toMatch(/Tageslimit/);
    expect(weinprofilFehlertext({ code: 'functions/permission-denied' })).toMatch(/Bearbeiten/);
    expect(weinprofilFehlertext(new Error('offline'))).toMatch(/nicht geklappt/);
  });
});

describe('neueresProfil', () => {
  it('nimmt das Profil mit dem jüngeren erstelltAm', () => {
    const alt = { erstelltAm: 1 };
    const neu = { erstelltAm: 2 };
    expect(neueresProfil(alt, neu)).toBe(neu);
    expect(neueresProfil(neu, alt)).toBe(neu);
    expect(neueresProfil(null, neu)).toBe(neu);
    expect(neueresProfil(alt, undefined)).toBe(alt);
    expect(neueresProfil(undefined, null)).toBeNull();
  });
});

it('nennt den R11-Fall wie im Entwurf', () => {
  expect(TEXT_KEIN_STIL).toBe('Hier lieber Bier oder Wasser');
});
