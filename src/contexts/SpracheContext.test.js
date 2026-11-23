import { act, render, screen } from '@testing-library/react';
import { SpracheProvider, useListenwerte, useProfilSprache, useRezeptTitel, useSprache, useSpracheFuerNutzer, useTexte } from './SpracheContext';
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

describe('übersetzte Rezepttitel (Mehrsprachigkeit PR 3)', () => {
  const rezept = {
    title: 'Omas Apfelkuchen',
    titelUebersetzung: { quelle: 'Omas Apfelkuchen', originalSprache: 'de', de: 'Omas Apfelkuchen', en: 'Grandma’s apple cake', fr: 'Gâteau de mamie' },
  };
  function Titel({ nutzer }) {
    useSpracheFuerNutzer(nutzer);
    return <h1>{useRezeptTitel()(rezept)}</h1>;
  }
  const mit = (nutzer) => <SpracheProvider speicher={null}><Titel nutzer={nutzer} /></SpracheProvider>;

  it('zeigt die Übersetzung nur mit der Berechtigung sprachwahl', () => {
    const { rerender } = render(mit({ id: 'u1', sprache: 'en', sprachwahl: true }));
    expect(screen.getByRole('heading')).toHaveTextContent('Grandma’s apple cake');
    rerender(mit({ id: 'u1', sprache: 'en', sprachwahl: false }));
    expect(screen.getByRole('heading')).toHaveTextContent('Omas Apfelkuchen');
  });

  it('ohne Provider immer das Original', () => {
    function OhneProvider() {
      return <h1>{useRezeptTitel()(rezept)}</h1>;
    }
    render(<OhneProvider />);
    expect(screen.getByRole('heading')).toHaveTextContent('Omas Apfelkuchen');
  });
});

describe('useListenwerte (Mehrsprachigkeit PR 5)', () => {
  const uebersetzungen = {
    mealCategories: [{ wert: 'Hauptspeisen', en: 'Main courses', fr: 'Plats principaux' }],
    portionUnits: [{ wert: 'portion', en: { einzahl: 'serving', mehrzahl: 'servings' }, fr: { einzahl: 'portion', mehrzahl: 'portions' } }],
  };
  function Anzeige() {
    const listen = useListenwerte();
    return <p>{`${listen.text('mealCategories', 'Hauptspeisen')} · 4 ${listen.einheit('portionUnits', { id: 'portion', singular: 'Portion', plural: 'Portionen' }, 4)}`}</p>;
  }

  it('übersetzt nur mit eingeschalteten übersetzten Inhalten', () => {
    const { rerender } = render(
      <SpracheProvider profilSprache="en" inhalteUebersetzen listenUebersetzungen={uebersetzungen} speicher={null}><Anzeige /></SpracheProvider>,
    );
    expect(screen.getByText('Main courses · 4 servings')).toBeInTheDocument();
    rerender(<SpracheProvider profilSprache="en" inhalteUebersetzen listenUebersetzungen={uebersetzungen} speicher={null}><Anzeige /></SpracheProvider>);
    expect(screen.getByText('Main courses · 4 servings')).toBeInTheDocument();
  });

  it('ohne Freischaltung oder ohne Provider das Original', () => {
    render(<SpracheProvider profilSprache="en" listenUebersetzungen={uebersetzungen} speicher={null}><Anzeige /></SpracheProvider>);
    expect(screen.getByText('Hauptspeisen · 4 Portionen')).toBeInTheDocument();
  });

  it('setzeListenUebersetzungen aktualisiert die Anzeige', () => {
    let steuern;
    function Mit() {
      steuern = useSprache();
      return <Anzeige />;
    }
    render(<SpracheProvider profilSprache="fr" inhalteUebersetzen speicher={null}><Mit /></SpracheProvider>);
    expect(screen.getByText('Hauptspeisen · 4 Portionen')).toBeInTheDocument();
    act(() => steuern.setzeListenUebersetzungen(uebersetzungen));
    expect(screen.getByText('Plats principaux · 4 portions')).toBeInTheDocument();
  });
});

describe('Seiten ohne Anmeldung in der Sprache des Browsers (Entscheidung vom 22.11.2026)', () => {
  let spies = [];
  const browser = (...sprachen) => {
    spies = [
      jest.spyOn(window.navigator, 'languages', 'get').mockReturnValue(sprachen),
      jest.spyOn(window.navigator, 'language', 'get').mockReturnValue(sprachen[0]),
    ];
  };
  afterEach(() => spies.forEach((spy) => spy.mockRestore()));

  function MitNutzer({ nutzer, geprueft }) {
    useSpracheFuerNutzer(nutzer, { anmeldungGeprueft: geprueft });
    return <Knopf />;
  }
  const mit = (nutzer, geprueft) => (
    <SpracheProvider speicher={null}><MitNutzer nutzer={nutzer} geprueft={geprueft} /></SpracheProvider>
  );

  it('gilt erst, wenn die Anmeldung geprüft ist', () => {
    browser('fr-FR', 'fr');
    const { rerender } = render(mit(null, false));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    rerender(mit(null, true));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it('zählt angemeldet nicht, auch ohne Berechtigung sprachwahl', () => {
    browser('en-GB', 'en');
    render(mit({ id: 'u1', sprachwahl: false }, true));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });

  it('eine Sprache, die die App nicht hat, ergibt Deutsch', () => {
    browser('es-ES', 'es');
    render(mit(null, true));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
  });

  it('übersetzte Inhalte bleiben ohne Anmeldung aus', () => {
    browser('en-GB', 'en');
    let inhalte;
    function Inhalte() {
      useSpracheFuerNutzer(null, { anmeldungGeprueft: true });
      inhalte = useSprache().inhalteUebersetzen;
      return null;
    }
    render(<SpracheProvider speicher={null}><Inhalte /></SpracheProvider>);
    expect(inhalte).toBe(false);
  });

  describe('Gäste (anonyme Anmeldung, Entscheidung vom 23.11.2026)', () => {
    const gast = { id: 'anonym1', vorname: 'Gast', isGuest: true, role: 'guest' };

    it('bekommen die Sprache des Browsers wie ohne Anmeldung', () => {
      browser('fr-FR', 'fr');
      render(mit(gast, true));
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
    });

    it('auch wenn sprachwahl gesetzt ist, ohne eigene Profilsprache', () => {
      browser('en-GB', 'en');
      render(mit({ ...gast, sprachwahl: true }, true));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('übersetzte Inhalte bleiben ohne Berechtigung aus', () => {
      browser('en-GB', 'en');
      let inhalte;
      function Inhalte() {
        useSpracheFuerNutzer(gast, { anmeldungGeprueft: true });
        inhalte = useSprache().inhalteUebersetzen;
        return null;
      }
      render(<SpracheProvider speicher={null}><Inhalte /></SpracheProvider>);
      expect(inhalte).toBe(false);
    });
  });
});
