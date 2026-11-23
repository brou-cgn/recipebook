import React from 'react';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
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
  it('wählt die Rebsorten nach der Kulinarik, den Stil nach dem Gericht', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN, { kulinarik: ['Vegetarisch', 'Italienische Küche'] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    expect(beispielzeile(sheet())).toHaveTextContent('z. B. Barolo, Brunello di Montalcino · 16–18 °C');
    expect(within(sheet()).getByText('Beispiele passend zur italienischen Küche')).toBeInTheDocument();
  });

  it('bleibt ohne Weinregion bei den allgemeinen Beispielen, ohne Hinweis', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN, { kulinarik: ['Indische Küche'] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    expect(beispielzeile(sheet())).toHaveTextContent('z. B. Cabernet Sauvignon, Syrah · 16–18 °C');
    expect(within(sheet()).queryByText(/Beispiele passend zur/)).not.toBeInTheDocument();
  });

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

  it('öffnet ein Sheet mit Beispielen, Temperatur, Label, Kennwerten und Gründen, ohne Quellenlinks', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN) });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));

    const dialog = sheet();
    // Deutsche Küche: regionale Rebsorte zuerst, aufgefüllt mit den allgemeinen
    expect(beispielzeile(dialog)).toHaveTextContent('z. B. Lemberger aus dem Barrique, Cabernet Sauvignon · 16–18 °C');
    expect(within(dialog).getByText('Beispiele passend zur deutschen Küche')).toBeInTheDocument();
    expect(within(dialog).getByText('passt hervorragend')).toBeInTheDocument();
    expect(within(dialog).getByText('Körper').nextSibling).toHaveTextContent('sehr kräftig');
    expect(within(dialog).getByText('Gerbstoff').nextSibling).toHaveTextContent('kräftig');
    expect(within(dialog).getByText('Süße').nextSibling).toHaveTextContent('trocken');
    expect(within(dialog).getByRole('heading', { name: 'Warum passt das?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Der Wein richtet sich nach der Sauce/)).toBeInTheDocument();

    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Empfohlen werden Weinstile');
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

  it('hat keinen sichtbaren „Schließen“-Knopf; der Griff schließt per Tastatur, außerdem Escape', async () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN) });
    const chip = screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' });

    fireEvent.click(chip);
    expect(within(sheet()).queryByText('Schließen')).not.toBeInTheDocument();
    const griff = sheet().querySelector('.wein-dazu-sheet-grabber');
    expect(griff).toHaveAttribute('aria-label', 'Schließen');
    fireEvent.click(griff);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(chip).toHaveFocus();

    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('schließt beim Wischen nach unten am Griff, nicht bei einem kurzen Zug', async () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN) });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    const zone = sheet().querySelector('.wein-dazu-sheet-ziehzone');

    fireEvent.touchStart(zone, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(zone, { touches: [{ clientY: 120 }] });
    expect(sheet().style.transform).toBe('translateY(20px)');
    fireEvent.touchEnd(zone);
    expect(sheet()).toBeInTheDocument();
    expect(sheet().style.transform).toBe('');

    fireEvent.touchStart(zone, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(zone, { touches: [{ clientY: 260 }] });
    fireEvent.touchEnd(zone);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('nutzt die eingerichteten Icons für Rot- und Weißwein', () => {
    const icons = { rot: 'data:image/png;base64,ROT', weiss: 'data:image/png;base64,WEISS' };
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), icons });
    const chip = screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' });
    expect(chip.querySelector('img')).toHaveAttribute('src', icons.rot);
    expect(chip.querySelector('svg')).toBeNull();
  });

  it('bleibt ohne eingerichtete Icons beim eingebauten Glas', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), icons: { rot: '', weiss: '' } });
    const chip = screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' });
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('svg')).not.toBeNull();
  });

  it('zeigt im R11-Fall „Hier lieber Bier oder Wasser“ mit Grund', () => {
    zeige({ recipe: mitProfil(E3_EXTREM) });
    fireEvent.click(screen.getByRole('button', { name: 'Hier lieber Bier oder Wasser' }));

    const dialog = sheet();
    expect(within(dialog).getByText(/Passt kein Weinstil, ist Bier oder Wasser/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Empfehlung und Alternativen' })).not.toBeInTheDocument();
  });

  it('nutzt im R11-Fall das eingerichtete Icon für Bier oder Wasser, in Chip und Sheet', () => {
    const icons = { rot: 'data:image/png;base64,ROT', weiss: '', keinStil: 'data:image/png;base64,BIER' };
    zeige({ recipe: mitProfil(E3_EXTREM), icons });
    const chip = screen.getByRole('button', { name: 'Hier lieber Bier oder Wasser' });
    expect(chip.querySelector('img')).toHaveAttribute('src', icons.keinStil);
    expect(chip.querySelector('svg')).toBeNull();

    fireEvent.click(chip);
    const kopf = sheet().querySelector('.wein-dazu-stil-glas');
    expect(kopf.querySelector('img')).toHaveAttribute('src', icons.keinStil);
    expect(kopf.querySelector('svg')).toBeNull();
  });

  it('bleibt im R11-Fall ohne eingerichtetes Icon beim eingebauten Glas', () => {
    zeige({ recipe: mitProfil(E3_EXTREM), icons: { rot: 'data:image/png;base64,ROT', weiss: '', keinStil: '' } });
    const chip = screen.getByRole('button', { name: 'Hier lieber Bier oder Wasser' });
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('svg')).not.toBeNull();

    fireEvent.click(chip);
    const kopf = sheet().querySelector('.wein-dazu-stil-glas');
    expect(kopf.querySelector('img')).toBeNull();
    expect(kopf.querySelector('svg')).not.toBeNull();
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

  it('zeigt auf Freigabe-Seiten auch bei veraltetem Profil nur das Ergebnis, ohne Hinweis', async () => {
    zeige({ recipe: mitProfil(veraltetesProfil()), currentUser: null, isSharedView: true });
    // Kurz warten: ohne Freigabe-Seite käme der Hinweis nach der Hash-Prüfung
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(screen.queryByText('Einschätzung veraltet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neu einschätzen' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    expect(within(sheet()).queryByText('Das Rezept wurde seit der Einschätzung geändert.')).not.toBeInTheDocument();
    expect(generiereWeinprofile).not.toHaveBeenCalled();
  });

  it('zeigt keinen Hinweis, wenn das Profil zum aktuellen Inhalt passt', async () => {
    const inputHash = await weinprofilInputHash(REZEPT, { subtle: webcrypto.subtle });
    zeige({ recipe: mitProfil({ ...G5_RINDERSCHMORBRATEN, inputHash }) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Neu einschätzen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Einschätzung veraltet')).not.toBeInTheDocument();
  });
});

// Weinprofil-Einblick (Tracker W1): Berechtigung „weinprofilEinblick“ aus „Funktionen nach
// Berechtigung“, App.js legt sie als Flag an den currentUser.
describe('WeinDazu Einschätzung im Detail', () => {
  const MIT_EINBLICK = { id: 'u3', role: 'admin', weinprofilEinblick: true };
  const OHNE_EINBLICK = { id: 'u4', role: 'admin', weinprofilEinblick: false };
  const schalter = (dialog) => within(dialog).queryByRole('button', { name: 'Einschätzung im Detail' });

  const oeffneEinblick = (chipName = 'Wein: Rotwein, kräftig') => {
    fireEvent.click(screen.getByRole('button', { name: chipName }));
    const dialog = sheet();
    const knopf = schalter(dialog);
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
    return dialog;
  };

  const setzeZwischenablage = (wert) => {
    Object.defineProperty(navigator, 'clipboard', { value: wert, configurable: true });
  };

  afterEach(() => setzeZwischenablage(undefined));

  it('zeigt mit der Berechtigung Profilwerte und die Punkte der besten Stile', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: MIT_EINBLICK });
    const dialog = oeffneEinblick();

    expect(within(dialog).getByText('Rind oder Lamm')).toBeInTheDocument();
    expect(within(dialog).getByText('Rotwein oder Jus')).toBeInTheDocument();
    expect(within(dialog).getByText('5 von 5')).toBeInTheDocument();
    expect(within(dialog).getByText(/Konfidenz 90/)).toBeInTheDocument();

    const stile = within(dialog).getAllByRole('listitem').filter((eintrag) => eintrag.closest('.wein-einblick-stile'));
    expect(stile).toHaveLength(5);
    expect(stile[0]).toHaveTextContent('Rotwein, kräftig');
    expect(stile[0]).toHaveTextContent('7,9');
    expect(stile[0]).toHaveTextContent('Sauce stark +3');
    expect(stile[0]).toHaveTextContent('Fett und Salz (R6) +1');
    expect(within(dialog).getByText(/Empfohlen wird ab 1,5 Punkten/)).toBeInTheDocument();
  });

  it('ist ohne die Berechtigung nicht da, auch nicht für Admins', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: OHNE_EINBLICK });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    expect(schalter(sheet())).not.toBeInTheDocument();
  });

  it('ist auf Freigabe-Seiten nie da, auch mit der Berechtigung', () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: MIT_EINBLICK, isSharedView: true });
    fireEvent.click(screen.getByRole('button', { name: 'Wein: Rotwein, kräftig' }));
    expect(schalter(sheet())).not.toBeInTheDocument();
  });

  it('erklärt auch „Hier lieber Bier oder Wasser“', () => {
    zeige({ recipe: mitProfil(E3_EXTREM), currentUser: MIT_EINBLICK });
    const dialog = oeffneEinblick('Hier lieber Bier oder Wasser');
    expect(within(dialog).getByText('Gemüse')).toBeInTheDocument();
    expect(within(dialog).getByText('Punkte der Weinstile')).toBeInTheDocument();
  });

  it('kopiert die Werte als eine Zeile JSON in die Zwischenablage', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setzeZwischenablage({ writeText });
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: MIT_EINBLICK });
    const dialog = oeffneEinblick();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Werte kopieren' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Kopiert');
    expect(writeText).toHaveBeenCalledTimes(1);
    const kopiert = JSON.parse(writeText.mock.calls[0][0]);
    expect(kopiert).toEqual(expect.objectContaining({ titel: 'Rinderschmorbraten', hauptkomponente: 'rind_lamm', empfehlung: 'rot_kraeftig' }));
    expect(kopiert).not.toHaveProperty('ingredients');
  });

  it('meldet, wenn es keine Zwischenablage gibt', async () => {
    zeige({ recipe: mitProfil(G5_RINDERSCHMORBRATEN), currentUser: MIT_EINBLICK });
    const dialog = oeffneEinblick();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Werte kopieren' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Kopieren nicht möglich');
  });
});

describe('WeinDazu in anderer Sprache (Mehrsprachigkeit PR 6c)', () => {
  const zeigeIn = (sprache, props) => renderWithProviders(<WeinDazu currentUser={BEARBEITER} {...props} />, { sprache });

  it('Englisch: Stil, Beispiele, Region, Kennwerte und Gründe aus der übersetzten Wissensbasis', () => {
    zeigeIn('en', { recipe: mitProfil(G5_RINDERSCHMORBRATEN, { kulinarik: ['Italienische Küche'] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Wine: Red wine, full-bodied' }));
    const dialog = screen.getByRole('dialog', { name: 'Wine pairing' });
    expect(beispielzeile(dialog)).toHaveTextContent('e.g. Barolo, Brunello di Montalcino · 16–18 °C');
    expect(within(dialog).getByText('Examples to suit Italian cuisine')).toBeInTheDocument();
    expect(within(dialog).getByText('Body')).toBeInTheDocument();
    expect(within(dialog).getByText('Why does it work?')).toBeInTheDocument();
    expect(within(dialog).getByText('Dish and wine are similarly intense; neither overpowers the other.')).toBeInTheDocument();
  });

  it('Französisch: Beispiele mit deutschen Wörtern übersetzt, Eigennamen bleiben', () => {
    zeigeIn('fr', { recipe: mitProfil(G5_RINDERSCHMORBRATEN, { kulinarik: ['Österreichische Küche'] }) });
    fireEvent.click(screen.getByRole('button', { name: /^Vin\s: Vin rouge, corsé$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Accord mets-vin' });
    expect(beispielzeile(dialog)).toHaveTextContent('p. ex. Blaufränkisch Reserve, Assemblage rouge du Burgenland · 16–18 °C');
    expect(within(dialog).getByText('Exemples adaptés à la cuisine autrichienne')).toBeInTheDocument();
  });

  it('Fehler auf Englisch', async () => {
    generiereWeinprofile.mockResolvedValue({ profile: {}, uebersprungen: [], fehlgeschlagen: ['r1'], fehlerGruende: { r1: 'tageslimit' } });
    zeigeIn('en', { recipe: REZEPT });
    fireEvent.click(screen.getByRole('button', { name: 'Find a matching wine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The daily limit for wine assessments has been reached.');
  });
});
