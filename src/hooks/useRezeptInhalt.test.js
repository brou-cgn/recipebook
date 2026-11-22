import { renderHook, waitFor } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import useRezeptInhalt from './useRezeptInhalt';
import { SpracheProvider } from '../contexts/SpracheContext';
import { inhaltQuellHash, SCHEMA_VERSION } from '../i18n/rezeptInhalt';
import { ladeRezeptUebersetzung } from '../utils/rezeptUebersetzungFirestore';

jest.mock('../utils/rezeptUebersetzungFirestore', () => ({ ladeRezeptUebersetzung: jest.fn() }));

const rezept = { id: 'r1', ingredients: ['200 g Mehl'], steps: ['Rühren.'] };

beforeAll(() => {
  if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = NodeTextEncoder;
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const mitSprache = (sprache, inhalteUebersetzen) => ({ children }) => (
  <SpracheProvider profilSprache={sprache} inhalteUebersetzen={inhalteUebersetzen} speicher={null}>{children}</SpracheProvider>
);

describe('useRezeptInhalt', () => {
  let dokument;
  beforeEach(async () => {
    dokument = {
      quellHash: await inhaltQuellHash(rezept, { subtle: webcrypto.subtle }),
      originalSprache: 'de',
      schemaVersion: SCHEMA_VERSION,
      en: { zutaten: ['200 g flour'], schritte: ['Stir.'] },
    };
    ladeRezeptUebersetzung.mockResolvedValue(dokument);
  });

  it('liefert die Übersetzung in der geltenden Sprache', async () => {
    const { result } = renderHook(() => useRezeptInhalt(rezept), { wrapper: mitSprache('en', true) });
    await waitFor(() => expect(result.current).toEqual({ zutaten: ['200 g flour'], schritte: ['Stir.'] }));
    expect(ladeRezeptUebersetzung).toHaveBeenCalledWith('r1');
  });

  it('ohne übersetzte Inhalte lädt er nichts und liefert null', async () => {
    const { result } = renderHook(() => useRezeptInhalt(rezept), { wrapper: mitSprache('en', false) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
    expect(ladeRezeptUebersetzung).not.toHaveBeenCalled();
  });

  it('ein geänderter Inhalt zeigt das Original, bis die neue Übersetzung da ist', async () => {
    const geaendert = { ...rezept, steps: ['Kräftig rühren.'] };
    const { result } = renderHook(() => useRezeptInhalt(geaendert), { wrapper: mitSprache('en', true) });
    await waitFor(() => expect(ladeRezeptUebersetzung).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it('ein Fehler beim Laden zeigt das Original', async () => {
    ladeRezeptUebersetzung.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useRezeptInhalt(rezept), { wrapper: mitSprache('en', true) });
    await waitFor(() => expect(ladeRezeptUebersetzung).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });
});
