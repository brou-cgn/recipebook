import {
  getWichtelFehlertext,
  ladeWichtelTeilnahme,
  legeWichtelRundeAn,
  listeWichtelRunden,
  loseWichtelRundeAus,
  fuegeWichtelEintragHinzu,
} from './wichtelFirestore';

// jest.mock wird vor die Importe gehoben.
jest.mock('../firebase', () => ({ functions: {} }));

const mockCall = jest.fn();
const mockHttpsCallable = jest.fn();
jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

beforeEach(() => {
  mockHttpsCallable.mockImplementation(() => mockCall);
});

describe('wichtelFirestore', () => {
  it('ruft wichtelVerwalten mit Aktion und Daten', async () => {
    mockCall.mockResolvedValue({ data: { runde: { id: 'r1' }, teilnehmer: [] } });
    const result = await legeWichtelRundeAn({ titel: 'Advent', budget: '20 €', hinweis: '', namen: ['Anna'] });
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'wichtelVerwalten');
    expect(mockCall).toHaveBeenCalledWith({ aktion: 'anlegen', titel: 'Advent', budget: '20 €', hinweis: '', namen: ['Anna'] });
    expect(result.runde.id).toBe('r1');

    mockCall.mockResolvedValue({ data: {} });
    await loseWichtelRundeAus('r1');
    expect(mockCall).toHaveBeenLastCalledWith({ aktion: 'auslosen', rundeId: 'r1' });
  });

  it('liefert eine leere Liste ohne Runden', async () => {
    mockCall.mockResolvedValue({ data: {} });
    await expect(listeWichtelRunden()).resolves.toEqual([]);
  });

  it('ruft wichtelTeilnahme mit Runde und Token', async () => {
    mockCall.mockResolvedValue({ data: { ich: { id: 't1' } } });
    await ladeWichtelTeilnahme('r1', 'tok');
    expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'wichtelTeilnahme');
    expect(mockCall).toHaveBeenCalledWith({ aktion: 'laden', rundeId: 'r1', token: 'tok' });

    await fuegeWichtelEintragHinzu('r1', 'tok', 't2', 'Buch');
    expect(mockCall).toHaveBeenLastCalledWith({ aktion: 'eintragHinzufuegen', rundeId: 'r1', token: 'tok', ueberId: 't2', text: 'Buch', url: '' });

    await fuegeWichtelEintragHinzu('r1', 'tok', 't2', '', 'https://shop.example.de/buch');
    expect(mockCall).toHaveBeenLastCalledWith({
      aktion: 'eintragHinzufuegen', rundeId: 'r1', token: 'tok', ueberId: 't2', text: '', url: 'https://shop.example.de/buch',
    });
  });

  it('zeigt Server-Meldungen, ersetzt technische durch einen Hinweis', () => {
    expect(getWichtelFehlertext({ code: 'functions/already-exists', message: '„Anna“ ist schon dabei.' }))
      .toBe('„Anna“ ist schon dabei.');
    expect(getWichtelFehlertext({ code: 'functions/internal', message: 'internal' }, 'Fallback')).toBe('Fallback');
    expect(getWichtelFehlertext({ code: 'functions/not-found', message: 'not-found' }, 'Fallback')).toBe('Fallback');
    expect(getWichtelFehlertext(new TypeError('Failed to fetch'), 'Fallback')).toBe('Fallback');
  });
});
