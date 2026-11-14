import { generiereWeinprofile, trageWeinprofileNach, BACKFILL_ANZAHL } from './weinprofilCallable';

const mockAufruf = jest.fn();
const mockHttpsCallable = jest.fn(() => mockAufruf);

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

jest.mock('../../firebase', () => ({ functions: { name: 'functions' } }));

beforeEach(() => {
  mockHttpsCallable.mockImplementation(() => mockAufruf);
});

describe('generiereWeinprofile', () => {
  it('ruft generateWeinprofile mit den IDs und einem Zeitlimit über dem der Function', async () => {
    mockAufruf.mockResolvedValue({ data: { profile: { r1: { rolle: 'hauptgericht' } } } });

    const antwort = await generiereWeinprofile(['r1']);

    expect(mockHttpsCallable).toHaveBeenCalledWith({ name: 'functions' }, 'generateWeinprofile', { timeout: 125000 });
    expect(mockAufruf).toHaveBeenCalledWith({ recipeIds: ['r1'] });
    expect(antwort.profile.r1.rolle).toBe('hauptgericht');
  });

  it('liefert ohne Daten eine leere Antwort', async () => {
    mockAufruf.mockResolvedValue({});
    expect(await generiereWeinprofile(['r1'])).toEqual({ profile: {}, uebersprungen: [], fehlgeschlagen: [], fehlerGruende: {} });
  });
});

describe('trageWeinprofileNach', () => {
  it('ruft backfillWeinprofile mit Cursor und fester Seitengröße, Zeitlimit über 300 s', async () => {
    mockAufruf.mockResolvedValue({ data: { geprueft: 20, fertig: false, naechsterCursor: 'r20' } });

    const antwort = await trageWeinprofileNach({ cursor: 'r0' });

    expect(mockHttpsCallable).toHaveBeenCalledWith({ name: 'functions' }, 'backfillWeinprofile', { timeout: 310000 });
    expect(mockAufruf).toHaveBeenCalledWith({ cursor: 'r0', anzahl: BACKFILL_ANZAHL });
    expect(BACKFILL_ANZAHL).toBe(20);
    expect(antwort.naechsterCursor).toBe('r20');
  });

  it('beginnt ohne Cursor von vorn', async () => {
    mockAufruf.mockResolvedValue({ data: null });
    expect(await trageWeinprofileNach()).toBeNull();
    expect(mockAufruf).toHaveBeenCalledWith({ cursor: null, anzahl: 20 });
  });
});
