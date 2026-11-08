import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import WichtelTeilnahmePage from './WichtelTeilnahmePage';

const mockLaden = jest.fn();
const mockZiehen = jest.fn();
const mockHinzufuegen = jest.fn();
const mockLoeschen = jest.fn();

jest.mock('../utils/wichtelFirestore', () => ({
  ladeWichtelTeilnahme: (...a) => mockLaden(...a),
  zieheWichtelLos: (...a) => mockZiehen(...a),
  fuegeWichtelEintragHinzu: (...a) => mockHinzufuegen(...a),
  loescheWichtelEintrag: (...a) => mockLoeschen(...a),
  getWichtelFehlertext: (e, fallback = 'Fehler') => e?.message || fallback,
}));

const sicht = (over = {}) => ({
  runde: { titel: 'Advent 2026', budget: '20 €', hinweis: 'Bescherung am 13.12.', status: 'offen' },
  ich: { id: 't1', name: 'Anna' },
  andere: [{ id: 't2', name: 'Ben' }, { id: 't3', name: 'Cleo' }],
  meineWuensche: [],
  meineIdeen: [],
  los: null,
  ...over,
});

const renderSeite = (props = {}) => renderWithProviders(
  <WichtelTeilnahmePage rundeId="runde1" token="tok" {...props} />,
);

describe('WichtelTeilnahmePage', () => {
  it('zeigt einen kaputten Link als ungültig, ohne den Server zu fragen', () => {
    renderSeite({ gueltig: false });
    expect(screen.getByRole('heading', { name: 'Link ungültig' })).toBeInTheDocument();
    expect(mockLaden).not.toHaveBeenCalled();
  });

  it('zeigt „Link ungültig“, wenn der Server das Token nicht kennt', async () => {
    mockLaden.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/not-found' }));
    renderSeite();
    expect(await screen.findByRole('heading', { name: 'Link ungültig' })).toBeInTheDocument();
  });

  it('bietet bei Netzwerkfehlern einen neuen Versuch an', async () => {
    mockLaden.mockRejectedValueOnce(Object.assign(new Error('Keine Verbindung'), { code: 'functions/unavailable' }));
    renderSeite();
    expect(await screen.findByText('Keine Verbindung')).toBeInTheDocument();
    mockLaden.mockResolvedValue(sicht());
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
    expect(await screen.findByText('Hallo Anna!')).toBeInTheDocument();
  });

  it('vor der Auslosung: Begrüßung, Eckdaten, kein Los-Knopf', async () => {
    mockLaden.mockResolvedValue(sicht());
    renderSeite();
    expect(await screen.findByRole('heading', { name: 'Advent 2026' })).toBeInTheDocument();
    expect(screen.getByText('Hallo Anna!')).toBeInTheDocument();
    expect(screen.getByText('Budget: 20,00 €')).toBeInTheDocument();
    expect(screen.getByText('Bescherung am 13.12.')).toBeInTheDocument();
    expect(screen.getByText(/Noch nicht ausgelost/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Los ziehen' })).not.toBeInTheDocument();
    expect(mockLaden).toHaveBeenCalledWith('runde1', 'tok');
  });

  it('trägt einen eigenen Wunsch ein', async () => {
    mockLaden.mockResolvedValue(sicht());
    mockHinzufuegen.mockResolvedValue(sicht({ meineWuensche: [{ id: 'e1', text: 'Ein gutes Buch' }] }));
    renderSeite();
    fireEvent.change(await screen.findByLabelText('Wunsch hinzufügen'), { target: { value: ' Ein gutes Buch ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Hinzufügen' })[0]);
    expect(await screen.findByText('Ein gutes Buch')).toBeInTheDocument();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', 'tok', 't1', 'Ein gutes Buch');
    expect(screen.getByLabelText('Wunsch hinzufügen')).toHaveValue('');
  });

  it('hinterlegt eine Idee für einen anderen Gast erst nach Auswahl des Gasts', async () => {
    mockLaden.mockResolvedValue(sicht());
    mockHinzufuegen.mockResolvedValue(sicht({ meineIdeen: [{ id: 'e2', ueberId: 't3', ueberName: 'Cleo', text: 'Gin-Tasting' }] }));
    renderSeite();
    fireEvent.change(await screen.findByLabelText('Geschenkidee'), { target: { value: 'Gin-Tasting' } });
    const speichern = screen.getByRole('button', { name: 'Speichern' });
    expect(speichern).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Für wen?'), { target: { value: 't3' } });
    fireEvent.click(speichern);
    expect(await screen.findByRole('heading', { name: 'Für Cleo' })).toBeInTheDocument();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', 'tok', 't3', 'Gin-Tasting');
  });

  it('zieht das Los und zeigt Wünsche und Ideen nur für den Gezogenen', async () => {
    mockLaden.mockResolvedValue(sicht({ runde: { ...sicht().runde, status: 'ausgelost' }, los: { gezogen: false } }));
    mockZiehen.mockResolvedValue(sicht({
      runde: { ...sicht().runde, status: 'ausgelost' },
      los: {
        gezogen: true,
        empfaenger: { id: 't2', name: 'Ben' },
        wuensche: [{ id: 'w1', text: 'Wollsocken' }],
        ideen: [
          { id: 'i1', text: 'Kochkurs', von: 'Cleo', vonDir: false },
          { id: 'i2', text: 'Kaffeebohnen', von: 'Anna', vonDir: true },
        ],
      },
    }));
    renderSeite();
    fireEvent.click(await screen.findByRole('button', { name: 'Los ziehen' }));

    expect(await screen.findByRole('heading', { name: 'Für Ben' })).toBeInTheDocument();
    expect(mockZiehen).toHaveBeenCalledWith('runde1', 'tok');
    expect(screen.queryByRole('button', { name: 'Los ziehen' })).not.toBeInTheDocument();
    const partner = screen.getByRole('heading', { name: 'Für Ben' }).closest('section');
    expect(within(partner).getByText('Wollsocken')).toBeInTheDocument();
    expect(within(partner).getByText('von Cleo')).toBeInTheDocument();
    expect(within(partner).getByText('von dir')).toBeInTheDocument();
    expect(within(partner).getByText('Nur du siehst diese Wünsche und Ideen.')).toBeInTheDocument();
  });

  it('zeigt einen Fehler beim Ziehen an und lässt es erneut versuchen', async () => {
    mockLaden.mockResolvedValue(sicht({ runde: { ...sicht().runde, status: 'ausgelost' }, los: { gezogen: false } }));
    mockZiehen.mockRejectedValue(Object.assign(new Error('Es wurde noch nicht ausgelost.'), { code: 'functions/failed-precondition' }));
    renderSeite();
    fireEvent.click(await screen.findByRole('button', { name: 'Los ziehen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Es wurde noch nicht ausgelost.');
    expect(screen.getByRole('button', { name: 'Los ziehen' })).toBeEnabled();
  });

  it('entfernt einen Wunsch sofort mit Rückgängig, gelöscht wird nach 6 s', async () => {
    mockLaden.mockResolvedValue(sicht({ meineWuensche: [{ id: 'e1', text: 'Buch' }] }));
    renderSeite();
    await screen.findByText('Buch');
    jest.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Wunsch „Buch“ entfernen' }));
      expect(screen.queryByText('Buch')).not.toBeInTheDocument();
      expect(screen.getByText('Wunsch entfernt.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
      expect(screen.getByText('Buch')).toBeInTheDocument();

      mockLoeschen.mockResolvedValue(sicht());
      fireEvent.click(screen.getByRole('button', { name: 'Wunsch „Buch“ entfernen' }));
      await act(async () => { jest.advanceTimersByTime(6000); });
      expect(mockLoeschen).toHaveBeenCalledWith('runde1', 'tok', 'e1');
    } finally {
      jest.useRealTimers();
    }
    await waitFor(() => expect(screen.queryByText('Buch')).not.toBeInTheDocument());
  });

  it('stilles Neuladen beim Zurückkehren überschreibt keinen gerade gespeicherten Wunsch', async () => {
    mockLaden.mockResolvedValueOnce(sicht());
    renderSeite();
    await screen.findByText('Hallo Anna!');

    let alteAntwort;
    mockLaden.mockImplementationOnce(() => new Promise((resolve) => { alteAntwort = resolve; }));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(mockLaden).toHaveBeenCalledTimes(2);

    mockHinzufuegen.mockResolvedValue(sicht({ meineWuensche: [{ id: 'e1', text: 'Buch' }] }));
    fireEvent.change(screen.getByLabelText('Wunsch hinzufügen'), { target: { value: 'Buch' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Hinzufügen' })[0]);
    await screen.findByText('Buch');

    await act(async () => { alteAntwort(sicht()); });
    expect(screen.getByText('Buch')).toBeInTheDocument();
  });

  it('bietet angemeldeten Nutzern den Weg zurück in die App', async () => {
    mockLaden.mockResolvedValue(sicht());
    const onClose = jest.fn();
    renderSeite({ currentUser: { id: 'u1' }, onClose });
    fireEvent.click(await screen.findByRole('button', { name: 'Zur App' }));
    expect(onClose).toHaveBeenCalled();
  });
});
