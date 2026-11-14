import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';
import { renderWithProviders } from '../test-utils';
import WeinDazu from './WeinDazu';
import { generiereWeinprofile } from '../utils/weinbegleitung/weinprofilCallable';
import { weinprofilInputHash } from '../utils/weinbegleitung/profilHash';
import { weinprofil, G5_RINDERSCHMORBRATEN, E3_EXTREM } from '../utils/weinbegleitung/__fixtures__/profile';

jest.mock('../utils/weinbegleitung/weinprofilCallable', () => ({
  generiereWeinprofile: jest.fn(),
}));

// Wie in der App: „ab Rolle edit“ (edit, moderator, admin)
jest.mock('../utils/userManagement', () => ({
  canEditRecipes: (user) => ['edit', 'moderator', 'admin'].includes(user?.role),
}));

const BEARBEITER = { id: 'u1', role: 'edit' };
const LESER = { id: 'u2', role: 'read' };

const REZEPT = {
  id: 'r1',
  title: 'Rinderschmorbraten',
  ingredients: ['1,2 kg Rinderschulter', '750 ml Rotwein'],
  steps: ['Anbraten.', 'Schmoren.'],
  speisekategorie: ['Hauptspeisen'],
  kulinarik: ['Deutsche Küche'],
};

const mitProfil = (profil, extra = {}) => ({ ...REZEPT, ...extra, weinprofil: profil });

const zeige = (props) => renderWithProviders(<WeinDazu currentUser={BEARBEITER} {...props} />);

const sheet = () => screen.getByRole('dialog', { name: 'Wein dazu' });

// Beispiele und Temperatur stehen in einem Absatz, die Temperatur in eigener Spanne (kein Umbruch vor °C)
const beispielzeile = (dialog) => dialog.querySelector('.wein-dazu-stil-beispiele');

describe('WeinDazu ohne Profil', () => {
  it('zeigt Lesern nichts', () => {
    const { container } = zeige({ recipe: REZEPT, currentUser: LESER });
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt auf Freigabe-Seiten keinen Knopf, auch nicht für Bearbeiter', () => {
    const { container } = zeige({ recipe: REZEPT, isSharedView: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('bietet Bearbeitern „Passenden Wein finden“ an und ruft das Callable mit der einen Rezept-ID', async () => {
    let fertig;
    generiereWeinprofile.mockReturnValue(new Promise((resolve) => { fertig = resolve; }));
    zeige({ recipe: REZEPT });

    fireEvent.click(screen.getByRole('button', { name: 'Passenden Wein finden' }));

    expect(generiereWeinprofile).toHaveBeenCalledWith(['r1']);
    expect(screen.getByRole('status')).toHaveTextContent('Gericht wird eingeschätzt');

    fertig({ profile: { r1: { ...G5_RINDERSCHMORBRATEN, erstelltAm: 5 } }, uebersprungen: [], fehlgeschlagen: [], fehlerGruende: {} });
    expect(await screen.findByRole('button', { name: 'Wein: Rotwein, kräftig' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('meldet das Tageslimit aus der Antwort', async () => {
    generiereWeinprofile.mockResolvedValue({ profile: {}, uebersprungen: [], fehlgeschlagen: ['r1'], fehlerGruende: { r1: 'tageslimit' } });
    zeige({ recipe: REZEPT });

    fireEvent.click(screen.getByRole('button', { name: 'Passenden Wein finden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tageslimit');
    expect(screen.getByRole('button', { name: 'Passenden Wein finden' })).toBeInTheDocument();
  });

  it('meldet einen geworfenen Fehler verständlich', async () => {
    generiereWeinprofile.mockRejectedValue(Object.assign(new Error('internal'), { code: 'functions/internal' }));
    zeige({ recipe: REZEPT });

    fireEvent.click(screen.getByRole('button', { name: 'Passenden Wein finden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('nicht geklappt');
  });
});

describe('WeinDazu mit Profil', () => {
  it('zeigt Getränken, Saucen, Beilagen und Gebäck keine Karte', () => {
    ['getraenk', 'sauce_dip', 'beilage', 'gebaeck_kuchen'].forEach((rolle) => {
      const profil = weinprofil({ rolle, hauptkomponente: 'gemuese', zubereitung: 'kalt', sauce: 'keine', intensitaet: 2 });
      const { container, unmount } = zeige({ recipe: mitProfil(profil) });
      expect(container).toBeEmptyDOMElement();
      unmount();
    });
  });

  it('zeigt sofort den Chip mit dem Stilnamen, auch für Leser und auf Freigabe-Seiten', () => {
    const { unmount } = zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: LESER });
    expect(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' })).toBeInTheDocument();
    unmount();

    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: null, isSharedView: true });
    expect(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' })).toBeInTheDocument();
    expect(generiereWeinprofile).not.toHaveBeenCalled();
  });

  it('öffnet ein Sheet mit Beispielen, Temperatur, Label, Kennwerten, Gründen und Quellenlinks', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN) });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));

    const dialog = sheet();
    expect(beispielzeile(dialog)).toHaveTextContent('z. B. Cabernet Sauvignon, Syrah · 16–18 °C');
    expect(within(dialog).getByText('passt hervorragend')).toBeInTheDocument();
    expect(within(dialog).getByText('Körper').nextSibling).toHaveTextContent('sehr kräftig');
    expect(within(dialog).getByText('Gerbstoff').nextSibling).toHaveTextContent('kräftig');
    expect(within(dialog).getByText('Süße').nextSibling).toHaveTextContent('trocken');
    expect(within(dialog).getByRole('heading', { name: 'Warum passt das?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Der Wein richtet sich nach der Sauce/)).toBeInTheDocument();

    const quellen = within(dialog).getAllByRole('link', { name: /Quelle: Food and Wine Pairing Basics/ });
    expect(quellen.length).toBeGreaterThanOrEqual(1);
    expect(quellen[0]).toHaveAttribute('href', 'https://winefolly.com/tips/getting-started-with-food-and-wine-pairing');
    expect(quellen[0]).toHaveAttribute('target', '_blank');
    expect(quellen[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('zeigt eine Alternative zum Antippen, ohne etwas zu speichern', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN) });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    const dialog = sheet();

    const empfehlung = within(dialog).getByRole('button', { name: /Rotwein, kräftig.*Empfehlung/ });
    const alternative = within(dialog).getByRole('button', { name: /Rotwein, mittelkräftig.*Alternative/ });
    expect(empfehlung).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(alternative);

    expect(alternative).toHaveAttribute('aria-pressed', 'true');
    expect(empfehlung).toHaveAttribute('aria-pressed', 'false');
    expect(beispielzeile(dialog)).toHaveTextContent('z. B. Lemberger, Dornfelder · 16–18 °C');
    expect(generiereWeinprofile).not.toHaveBeenCalled();
  });

  it('schließt das Sheet über „Schließen“ und mit Escape', async () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN) });
    const chip = screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' });

    fireEvent.click(chip);
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Schließen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chip).toHaveFocus();

    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('zeigt im R11-Fall „Hier lieber Bier oder Wasser“ mit Grund und Quelle', () => {
    zeige({ recipe: mitProfil(E3_EXTREM) });
    fireEvent.click(screen.getByRole('button', { name: 'Hier lieber Bier oder Wasser' }));

    const dialog = sheet();
    expect(within(dialog).getByText(/Passt kein Weinstil, ist Bier oder Wasser/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Quelle: Getränke zum Menü/ })).toHaveAttribute('href', 'https://ichkoche.de/print/artikel-2923');
    expect(within(dialog).queryByRole('region', { name: 'Empfehlung und Alternativen' })).not.toBeInTheDocument();
  });
});

describe('WeinDazu veraltet', () => {
  beforeAll(() => {
    if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = NodeTextEncoder;
  });

  beforeEach(() => {
    global.crypto = { subtle: webcrypto.subtle };
  });

  afterEach(() => {
    global.crypto = undefined;
  });

  const veraltetesProfil = () => ({ ...G5_RINDERSCHMORBRATEN, inputHash: 'aus-einer-alten-fassung' });

  it('bietet Bearbeitern „Neu einschätzen“ an und ruft das Callable erneut', async () => {
    generiereWeinprofile.mockResolvedValue({ profile: {}, uebersprungen: [], fehlgeschlagen: [], fehlerGruende: {} });
    zeige({ recipe: mitProfil(veraltetesProfil()) });

    fireEvent.click(await screen.findByRole('button', { name: 'Neu einschätzen' }));

    expect(generiereWeinprofile).toHaveBeenCalledWith(['r1']);
  });

  it('zeigt Lesern nur den Hinweis', async () => {
    zeige({ recipe: mitProfil(veraltetesProfil()), currentUser: LESER });
    expect(await screen.findByText('Einschätzung veraltet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neu einschätzen' })).not.toBeInTheDocument();
  });

  it('nennt die Änderung auch im Sheet', async () => {
    zeige({ recipe: mitProfil(veraltetesProfil()) });
    await screen.findByRole('button', { name: 'Neu einschätzen' });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    expect(within(sheet()).getByText('Das Rezept wurde seit der Einschätzung geändert.')).toBeInTheDocument();
  });

  it('zeigt keinen Hinweis, wenn das Profil zum aktuellen Inhalt passt', async () => {
    const inputHash = await weinprofilInputHash(REZEPT, { subtle: webcrypto.subtle });
    zeige({ recipe: mitProfil({ ...G5_RINDERSCHMORBRATEN, inputHash }) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Neu einschätzen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Einschätzung veraltet')).not.toBeInTheDocument();
  });
});
