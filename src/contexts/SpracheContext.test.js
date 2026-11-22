import { act, render, screen } from '@testing-library/react';
import { SpracheProvider, useProfilSprache, useSprache, useSpracheFuerNutzer, useTexte } from './SpracheContext';
import { SITZUNGS_SPRACHE_KEY } from '../i18n/sprachen';
import allgemeinTexte from '../i18n/texte/allgemein';
import { renderWithProviders } from '../test-utils';

function speicher(start = {}) {
  const daten = { ...start };
  return {
    daten,
    getItem: (key) => (key in daten ? daten[key] : null),
    setItem: (key, wert) => { daten[key] = String(wert); },
    removeItem: (key) => { delete daten[key]; },
  };
}

let steuerung;
function Knopf() {
  steuerung = useSprache();
  const t = useTexte(allgemeinTexte);
  return <button type="button">{t('speichern')}</button>;
}

// Wie App.js: meldet die persönliche Einstellung an den Provider
function Anzeige({ profil }) {
  useProfilSprache(profil);
  return <Knopf />;
}

describe('SpracheContext', () => {
  beforeEach(() => {
    steuerung = null;
    document.documentElement.lang = 'de';
  });

  it('ohne Provider gilt Deutsch', () => {
    render(<Anzeige profil="en" />);
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    expect(steuerung.sprache).toBe('de');
  });

  it('übernimmt die persönliche Einstellung, die App.js meldet', () => {
    const { rerender } = render(<SpracheProvider speicher={null}><Anzeige profil={undefined} /></SpracheProvider>);
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();

    rerender(<SpracheProvider speicher={null}><Anzeige profil="en" /></SpracheProvider>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(steuerung.profilSprache).toBe('en');

    // Abmelden: keine Einstellung mehr, also wieder Deutsch
    rerender(<SpracheProvider speicher={null}><Anzeige profil={null} /></SpracheProvider>);
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });

  it('eine unbekannte Einstellung zählt wie keine', () => {
    render(<SpracheProvider speicher={null}><Anzeige profil="es" /></SpracheProvider>);
    expect(steuerung.profilSprache).toBeNull();
    expect(steuerung.sprache).toBe('de');
  });

  it('die Sprache der Sitzung übersteuert die Einstellung und wird gespeichert', () => {
    const s = speicher();
    render(<SpracheProvider speicher={s}><Anzeige profil="en" /></SpracheProvider>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    act(() => steuerung.setzeSitzungsSprache('fr'));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
    expect(s.daten[SITZUNGS_SPRACHE_KEY]).toBe('fr');

    act(() => steuerung.setzeSitzungsSprache(null));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(SITZUNGS_SPRACHE_KEY in s.daten).toBe(false);
  });

  it('liest eine Sitzungs-Sprache, die schon gespeichert ist', () => {
    render(<SpracheProvider speicher={speicher({ [SITZUNGS_SPRACHE_KEY]: 'fr' })}><Anzeige profil="en" /></SpracheProvider>);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
    expect(steuerung.sitzungsSprache).toBe('fr');
  });

  it('ein ungültiger Wert für die Sitzung hebt sie auf', () => {
    const s = speicher({ [SITZUNGS_SPRACHE_KEY]: 'fr' });
    render(<SpracheProvider speicher={s}><Anzeige profil="en" /></SpracheProvider>);
    act(() => steuerung.setzeSitzungsSprache('es'));
    expect(steuerung.sitzungsSprache).toBeNull();
    expect(steuerung.sprache).toBe('en');
  });

  it('setzt <html lang> auf die geltende Sprache', () => {
    render(<SpracheProvider speicher={null}><Anzeige profil="fr" /></SpracheProvider>);
    expect(document.documentElement.lang).toBe('fr');
    act(() => steuerung.setzeSitzungsSprache('en'));
    expect(document.documentElement.lang).toBe('en');
  });

  it('renderWithProviders rendert in der gewünschten Sprache, Standard Deutsch', () => {
    const { unmount } = renderWithProviders(<Knopf />);
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    unmount();
    const { rerender } = renderWithProviders(<Knopf />, { sprache: 'fr' });
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
    // rerender behält Provider und Sprache
    rerender(<Knopf />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });
});

describe('useSpracheFuerNutzer (App.js)', () => {
  function MitNutzer({ nutzer }) {
    useSpracheFuerNutzer(nutzer);
    return <Knopf />;
  }
  const mit = (s, nutzer) => <SpracheProvider speicher={s}><MitNutzer nutzer={nutzer} /></SpracheProvider>;

  it('die persönliche Sprache gilt nur mit der Berechtigung sprachwahl', () => {
    const { rerender } = render(mit(null, { id: 'u1', sprache: 'en', sprachwahl: false }));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    rerender(mit(null, { id: 'u1', sprache: 'en', sprachwahl: true }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('ohne Berechtigung endet eine Sitzungs-Sprache', () => {
    const s = speicher({ [SITZUNGS_SPRACHE_KEY]: 'fr' });
    render(mit(s, { id: 'u1', sprachwahl: false }));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    expect(SITZUNGS_SPRACHE_KEY in s.daten).toBe(false);
  });

  it('beim App-Start ohne Anmeldung bleibt die Sitzungs-Sprache, beim Abmelden endet sie', () => {
    const s = speicher({ [SITZUNGS_SPRACHE_KEY]: 'fr' });
    const { rerender } = render(mit(s, null));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();

    rerender(mit(s, { id: 'u1', sprache: 'en', sprachwahl: true }));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();

    rerender(mit(s, null));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    expect(SITZUNGS_SPRACHE_KEY in s.daten).toBe(false);
  });
});
