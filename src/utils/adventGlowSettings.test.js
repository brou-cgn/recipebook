jest.mock('../firebase', () => ({
  db: {},
}));

const mockDoc = jest.fn();
const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();

jest.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
}));

import {
  ADVENT_GLOW_TICKER_MAX_LENGTH,
  DEFAULT_ADVENT_GLOW_TICKER_TEXT,
  getAdventGlowTickerText,
  normalizeAdventGlowTickerText,
  saveAdventGlowTickerText,
} from './adventGlowSettings';

describe('adventGlowSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDoc.mockReturnValue({ path: 'appSettings/adventGlow' });
  });

  test('liefert den Standardtext, wenn kein Dokument existiert', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    await expect(getAdventGlowTickerText()).resolves.toBe(DEFAULT_ADVENT_GLOW_TICKER_TEXT);
    expect(mockDoc).toHaveBeenCalledWith({}, 'appSettings', 'adventGlow');
  });

  test('liefert den Standardtext bei leerem Feld oder Lesefehler', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ tickerText: '   ' }) });
    await expect(getAdventGlowTickerText()).resolves.toBe(DEFAULT_ADVENT_GLOW_TICKER_TEXT);

    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(getAdventGlowTickerText()).resolves.toBe(DEFAULT_ADVENT_GLOW_TICKER_TEXT);
    console.error.mockRestore();
  });

  test('liefert den gespeicherten Text', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ tickerText: 'Hallo Advent' }) });
    await expect(getAdventGlowTickerText()).resolves.toBe('Hallo Advent');
  });

  test('speichert normalisiert mit merge', async () => {
    await saveAdventGlowTickerText('  Glühwein \n und   Lichter ');
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'appSettings/adventGlow' },
      { tickerText: 'Glühwein und Lichter' },
      { merge: true }
    );
  });

  test('leerer Text wird als Standardtext gespeichert', async () => {
    await saveAdventGlowTickerText('');
    expect(mockSetDoc.mock.calls[0][1]).toEqual({ tickerText: DEFAULT_ADVENT_GLOW_TICKER_TEXT });
  });

  test('kürzt auf die Maximallänge', () => {
    expect(normalizeAdventGlowTickerText('x'.repeat(1000))).toHaveLength(ADVENT_GLOW_TICKER_MAX_LENGTH);
  });
});
