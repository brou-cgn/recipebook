import React from 'react';
import { screen, fireEvent, within, act } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import WeinbegleitungSeite from './WeinbegleitungSeite';
import { trageWeinprofileNach } from '../utils/weinbegleitung/weinprofilCallable';
import { getButtonIcons } from '../utils/customLists';
import { alleRegeln, alleStile, alleQuellen } from '../utils/weinbegleitung/wissensbasis';
import { RULES_VERSION } from '../utils/weinbegleitung/konstanten';

jest.mock('../utils/weinbegleitung/weinprofilCallable', () => ({
  trageWeinprofileNach: jest.fn(),
}));

jest.mock('../utils/customLists', () => ({
  ...jest.requireActual('../utils/customLists'),
  getButtonIcons: jest.fn(),
}));

const ADMIN = { id: 'a1', role: 'admin' };
const BEARBEITER = { id: 'u1', role: 'edit' };

const seite = (antwort) => ({
  geprueft: 0,
  neu: 0,
  uebersprungen: 0,
  fehlgeschlagen: [],
  fehlerGruende: {},
  naechsterCursor: null,
  fertig: false,
  tageslimitErreicht: false,
  gesamt: null,
  ...antwort,
});

// Nach dem Rendern die Symbole (getButtonIcons) abwarten, damit kein Update außerhalb von act landet
const zeige = async (props = {}) => {
  const ergebnis = renderWithProviders(<WeinbegleitungSeite currentUser={ADMIN} onBack={jest.fn()} {...props} />);
  await act(async () => {});
  return ergebnis;
};

const nachtragen = () => within(screen.getByRole('region', { name: 'Profile nachtragen' }));

const callableFehler = (code) => Object.assign(new Error(code), { code: `functions/${code}` });

beforeEach(() => {
  getButtonIcons.mockResolvedValue({});
  window.scrollTo = jest.fn();
});

describe('WeinbegleitungSeite', () => {
  it('zeigt Regeln, Weinstile und Quellen aus der Wissensbasis', async () => {
    await zeige({ currentUser: BEARBEITER });

    expect(screen.getByRole('heading', { name: 'Weinbegleitung', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(`Stand der Regeln: ${RULES_VERSION}`)).toBeInTheDocument();

    const regeln = within(screen.getByRole('region', { name: 'Die Regeln' }));
    alleRegeln().forEach((regel) => expect(regeln.getByText(regel.kurztext, { exact: false })).toBeInTheDocument());

    const stile = within(screen.getByRole('region', { name: 'Die Weinstile' }));
    expect(stile.getAllByRole('listitem')).toHaveLength(alleStile().length);
    expect(stile.getByText('Rotwein, kräftig')).toBeInTheDocument();
    expect(stile.getByText(/Cabernet Sauvignon, Syrah, Malbec/)).toBeInTheDocument();

    const quellen = within(screen.getByRole('region', { name: 'Die Quellen' }));
    alleQuellen().forEach((quelle) => {
      const link = quellen.getByRole('link', { name: quelle.titel });
      expect(link).toHaveAttribute('href', quelle.url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
    // Der gemeinsame Lizenzhinweis steht einmal, nicht je Quelle
    expect(quellen.getAllByText(alleQuellen()[0].lizenzhinweis)).toHaveLength(1);
  });

  it('nennt keine Preise oder Jahrgänge', async () => {
    const { container } = await zeige();
    expect(container.textContent).not.toMatch(/€|\bEUR\b|Jahrgang \d{4}/);
  });

  it('zeigt Nicht-Admins keinen Backfill', async () => {
    await zeige({ currentUser: BEARBEITER });
    expect(screen.queryByRole('region', { name: 'Profile nachtragen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Profile nachtragen' })).not.toBeInTheDocument();
  });

  it('schließt über den Schließen-Knopf', async () => {
    const onBack = jest.fn();
    await zeige({ onBack });
    fireEvent.click(screen.getByRole('button', { name: 'Weinbegleitung schließen' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Profile nachtragen (Admin)', () => {
  it('trägt Seite für Seite nach, bis der Bestand durch ist', async () => {
    trageWeinprofileNach
      .mockResolvedValueOnce(seite({ geprueft: 20, neu: 5, uebersprungen: 15, naechsterCursor: 'r20', gesamt: 25 }))
      .mockResolvedValueOnce(seite({ geprueft: 5, neu: 1, uebersprungen: 3, fehlgeschlagen: ['r23'], fertig: true }));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));

    expect(await nachtragen().findByText(/^Fertig\. Ein Rezept konnte nicht eingeschätzt werden/)).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenNthCalledWith(1, { cursor: null });
    expect(trageWeinprofileNach).toHaveBeenNthCalledWith(2, { cursor: 'r20' });
    expect(nachtragen().getByText('25 von 25 Rezepten geprüft')).toBeInTheDocument();
    expect(screen.getByText('6 neu eingeschätzt').parentElement).toHaveTextContent('6 neu eingeschätzt · 18 schon aktuell · 1 fehlgeschlagen');
    expect(nachtragen().getByRole('progressbar', { name: 'Fortschritt beim Nachtragen' })).toHaveAttribute('value', '25');
    expect(nachtragen().queryByRole('button', { name: 'Fortsetzen' })).not.toBeInTheDocument();
    expect(nachtragen().getByRole('button', { name: 'Von vorn prüfen' })).toBeInTheDocument();
  });

  it('macht nach einem Fehler mit „Fortsetzen“ am letzten Cursor weiter', async () => {
    trageWeinprofileNach
      .mockResolvedValueOnce(seite({ geprueft: 20, neu: 20, naechsterCursor: 'r20', gesamt: 30 }))
      .mockRejectedValueOnce(callableFehler('internal'))
      .mockResolvedValueOnce(seite({ geprueft: 10, neu: 10, fertig: true }));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));

    expect(await nachtragen().findByRole('alert')).toHaveTextContent('Die Einschätzung hat nicht geklappt.');
    expect(nachtragen().getByText('20 von 30 Rezepten geprüft')).toBeInTheDocument();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Fortsetzen' }));

    expect(await nachtragen().findByText('Fertig. Alle Rezepte haben ein aktuelles Profil.')).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenLastCalledWith({ cursor: 'r20' });
    expect(nachtragen().getByText('30 von 30 Rezepten geprüft')).toBeInTheDocument();
    expect(nachtragen().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hält beim Tageslimit an, aus der Antwort wie aus dem Fehler resource-exhausted', async () => {
    trageWeinprofileNach
      .mockResolvedValueOnce(seite({ geprueft: 7, neu: 6, uebersprungen: 1, naechsterCursor: 'r7', tageslimitErreicht: true, gesamt: 40 }));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));

    expect(await nachtragen().findByText(/Tageslimit für Wein-Einschätzungen ist erreicht/)).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenCalledTimes(1);

    trageWeinprofileNach.mockRejectedValueOnce(callableFehler('resource-exhausted'));
    fireEvent.click(nachtragen().getByRole('button', { name: 'Fortsetzen' }));

    expect(await nachtragen().findByText(/Tageslimit für Wein-Einschätzungen ist erreicht/)).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenLastCalledWith({ cursor: 'r7' });
    expect(nachtragen().queryByRole('alert')).not.toBeInTheDocument();
  });

  it('„Anhalten“ wirkt nach der laufenden Seite, „Fortsetzen“ macht dort weiter', async () => {
    let ersteSeite;
    trageWeinprofileNach.mockReturnValueOnce(new Promise((resolve) => { ersteSeite = resolve; }));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));
    fireEvent.click(nachtragen().getByRole('button', { name: 'Anhalten' }));
    expect(nachtragen().getByRole('button', { name: 'Wird angehalten …' })).toBeDisabled();

    await act(async () => { ersteSeite(seite({ geprueft: 20, neu: 2, uebersprungen: 18, naechsterCursor: 'r20', gesamt: 50 })); });

    expect(await nachtragen().findByText(/^Angehalten\./)).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenCalledTimes(1);

    trageWeinprofileNach.mockResolvedValueOnce(seite({ geprueft: 30, uebersprungen: 30, fertig: true }));
    fireEvent.click(nachtragen().getByRole('button', { name: 'Fortsetzen' }));

    expect(await nachtragen().findByText('50 von 50 Rezepten geprüft')).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenLastCalledWith({ cursor: 'r20' });
  });

  it('beginnt mit „Von vorn prüfen“ wieder am Anfang, mit frischem Fortschritt', async () => {
    trageWeinprofileNach.mockResolvedValue(seite({ geprueft: 3, neu: 1, uebersprungen: 2, fertig: true, gesamt: 3 }));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));
    fireEvent.click(await nachtragen().findByRole('button', { name: 'Von vorn prüfen' }));

    expect(await nachtragen().findByText('3 von 3 Rezepten geprüft')).toBeInTheDocument();
    expect(trageWeinprofileNach).toHaveBeenCalledTimes(2);
    expect(trageWeinprofileNach).toHaveBeenLastCalledWith({ cursor: null });
  });

  it('bricht bei einer Antwort ohne Fortschritt ab, statt von vorn zu beginnen', async () => {
    trageWeinprofileNach.mockResolvedValue(seite({ geprueft: 0, naechsterCursor: null, fertig: false }));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));

    expect(await nachtragen().findByRole('alert')).toHaveTextContent('Die Antwort des Servers war unerwartet.');
    expect(trageWeinprofileNach).toHaveBeenCalledTimes(1);
  });

  it('meldet fehlende Admin-Rechte verständlich', async () => {
    trageWeinprofileNach.mockRejectedValue(callableFehler('permission-denied'));
    await zeige();

    fireEvent.click(nachtragen().getByRole('button', { name: 'Profile nachtragen' }));

    expect(await nachtragen().findByRole('alert')).toHaveTextContent('Weinprofile nachtragen dürfen nur Admins.');
  });
});
