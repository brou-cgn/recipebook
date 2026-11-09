import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import WichtelTeilnahmePage from './WichtelTeilnahmePage';

const mockLaden = jest.fn();
const mockZiehen = jest.fn();
const mockHinzufuegen = jest.fn();
const mockLoeschen = jest.fn();
const mockGekauft = jest.fn();

jest.mock('../utils/wichtelFirestore', () => ({
  ladeWichtelTeilnahme: (...a) => mockLaden(...a),
  zieheWichtelLos: (...a) => mockZiehen(...a),
  fuegeWichtelEintragHinzu: (...a) => mockHinzufuegen(...a),
  loescheWichtelEintrag: (...a) => mockLoeschen(...a),
  setzeWichtelGeschenkGekauft: (...a) => mockGekauft(...a),
}));

const sicht = (over = {}) => ({
  runde: { titel: 'Advent 2026', budget: '20 €', hinweis: 'Bescherung am 13.12.', status: 'offen' },
  ich: { id: 't1', name: 'Anna', sprache: 'de' },
  andere: [{ id: 't2', name: 'Ben' }, { id: 't3', name: 'Cleo' }],
  meineWuensche: [],
  meineIdeen: [],
  los: null,
  ...over,
});

const gezogenBen = (sprache) => sicht({
  ich: { id: 't1', name: 'Anna', sprache },
  runde: { ...sicht().runde, status: 'ausgelost' },
  los: {
    gezogen: true,
    empfaenger: { id: 't2', name: 'Ben' },
    wuensche: [],
    ideen: [
      { id: 'i1', text: 'Kochkurs', von: 'Cleo', vonDir: false },
      { id: 'i2', text: 'Kaffeebohnen', von: 'Anna', vonDir: true },
    ],
  },
});

const renderSeite = (props = {}) => renderWithProviders(
  <WichtelTeilnahmePage rundeId="runde1" token="tok" {...props} />,
);

// jsdom meldet en-US; die Seite nimmt ohne Präferenz die Browsersprache.
let sprachSpies = [];
const setzeBrowserSprache = (...languages) => {
  sprachSpies.forEach((spy) => spy.mockRestore());
  sprachSpies = [
    jest.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages),
    jest.spyOn(window.navigator, 'language', 'get').mockReturnValue(languages[0]),
  ];
};

beforeEach(() => {
  setzeBrowserSprache('de-DE');
  document.documentElement.setAttribute('lang', 'de');
});

afterEach(() => {
  sprachSpies.forEach((spy) => spy.mockRestore());
  sprachSpies = [];
});

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
    mockLaden.mockRejectedValueOnce(Object.assign(new Error('internal'), { code: 'functions/unavailable' }));
    renderSeite();
    expect(await screen.findByText(/Bitte prüfe deine Verbindung/)).toBeInTheDocument();
    mockLaden.mockResolvedValue(sicht());
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
    expect(await screen.findByText('Hallo Anna!')).toBeInTheDocument();
    // Der alte Fehler hängt nach dem erfolgreichen Versuch nicht mehr über der Seite.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    expect(screen.queryByText(/^Feier/)).not.toBeInTheDocument();
  });

  it('zeigt das Datum der Feier ausgeschrieben, in der Sprache des Gasts', async () => {
    const mitDatum = (sprache) => sicht({
      ich: { id: 't1', name: 'Anna', sprache },
      runde: { ...sicht().runde, hinweis: '', datum: '2026-12-13' },
    });
    mockLaden.mockResolvedValue(mitDatum('de'));
    const { unmount } = renderSeite();
    expect(await screen.findByText('Feier: Sonntag, 13. Dezember 2026')).toBeInTheDocument();
    unmount();

    mockLaden.mockResolvedValue(mitDatum('fr'));
    const fr = renderSeite();
    // Gesucht wird mit normalem Leerzeichen; im Text steht das geschützte vor dem Doppelpunkt.
    expect((await screen.findByText('Fête : dimanche 13 décembre 2026')).textContent).toBe('Fête\u00A0: dimanche 13 décembre 2026');
    fr.unmount();

    mockLaden.mockResolvedValue(mitDatum('en'));
    renderSeite();
    expect(await screen.findByText(/^Party: Sunday,? 13 December 2026$/)).toBeInTheDocument();
  });

  it('trägt einen eigenen Wunsch ein', async () => {
    mockLaden.mockResolvedValue(sicht());
    mockHinzufuegen.mockResolvedValue(sicht({ meineWuensche: [{ id: 'e1', text: 'Ein gutes Buch' }] }));
    renderSeite();
    fireEvent.change(await screen.findByLabelText('Wunsch hinzufügen'), { target: { value: ' Ein gutes Buch ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Hinzufügen' })[0]);
    expect(await screen.findByText('Ein gutes Buch')).toBeInTheDocument();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', 'tok', 't1', 'Ein gutes Buch', '');
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
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', 'tok', 't3', 'Gin-Tasting', '');
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

  it('markiert „Geschenk gekauft“ und nimmt es wieder zurück', async () => {
    const mit = (gekauft) => {
      const basis = gezogenBen('de');
      return { ...basis, los: { ...basis.los, gekauft } };
    };
    mockLaden.mockResolvedValue(mit(false));
    mockGekauft.mockResolvedValueOnce(mit(true)).mockResolvedValueOnce(mit(false));
    renderSeite();
    const box = await screen.findByRole('checkbox', { name: /Ich habe das Geschenk gekauft/ });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Geschenk gekauft/ })).toBeChecked());
    expect(mockGekauft).toHaveBeenCalledWith('runde1', 'tok', true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Geschenk gekauft/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Geschenk gekauft/ })).not.toBeChecked());
    expect(mockGekauft).toHaveBeenLastCalledWith('runde1', 'tok', false);
  });

  describe('Button „Geschenk gekauft“ aus der Neuigkeiten-Mail (?gekauft=1)', () => {
    const mit = (gekauft) => {
      const basis = gezogenBen('de');
      return { ...basis, los: { ...basis.los, gekauft } };
    };
    const oeffne = (adresse) => window.history.replaceState({}, '', adresse);
    afterEach(() => oeffne('/'));

    it('fragt oben nach, setzt den Status erst per Klick und nimmt den Parameter aus der Adresse', async () => {
      oeffne('/wichteln/runde1/tok?gekauft=1#oben');
      mockLaden.mockResolvedValue(mit(false));
      mockGekauft.mockResolvedValue(mit(true));
      renderSeite();
      const frage = await screen.findByRole('heading', { name: 'Geschenk für Ben gekauft?' });
      expect(window.location.pathname + window.location.search + window.location.hash).toBe('/wichteln/runde1/tok#oben');
      expect(mockGekauft).not.toHaveBeenCalled();
      const karte = frage.closest('section');
      fireEvent.click(within(karte).getByRole('button', { name: 'Ja, Geschenk gekauft' }));
      expect(await within(karte).findByText(/^Erledigt: Dein Geschenk für Ben ist als gekauft markiert\./)).toBeInTheDocument();
      expect(mockGekauft).toHaveBeenCalledWith('runde1', 'tok', true);
      expect(screen.getByRole('checkbox', { name: /Ich habe das Geschenk gekauft/ })).toBeChecked();
    });

    it('„Noch nicht“ blendet die Rückfrage aus, ohne etwas zu ändern', async () => {
      oeffne('/wichteln/runde1/tok?gekauft=1');
      mockLaden.mockResolvedValue(mit(false));
      renderSeite();
      fireEvent.click(await screen.findByRole('button', { name: 'Noch nicht' }));
      expect(screen.queryByRole('heading', { name: 'Geschenk für Ben gekauft?' })).not.toBeInTheDocument();
      expect(mockGekauft).not.toHaveBeenCalled();
    });

    it('schon gekauft: bestätigt nur; ohne gezogenes Los oder ohne Parameter keine Rückfrage', async () => {
      oeffne('/wichteln/runde1/tok?gekauft=1');
      mockLaden.mockResolvedValue(mit(true));
      const { unmount } = renderSeite();
      expect(await screen.findByText(/^Erledigt: Dein Geschenk für Ben ist als gekauft markiert\./)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ja, Geschenk gekauft' })).not.toBeInTheDocument();
      unmount();

      oeffne('/wichteln/runde1/tok?gekauft=1');
      mockLaden.mockResolvedValue(sicht({ runde: { ...sicht().runde, status: 'ausgelost' }, los: { gezogen: false } }));
      const zweite = renderSeite();
      await screen.findByRole('button', { name: 'Los ziehen' });
      expect(screen.queryByText(/gekauft\?/)).not.toBeInTheDocument();
      zweite.unmount();

      oeffne('/wichteln/runde1/tok');
      mockLaden.mockResolvedValue(mit(false));
      renderSeite();
      await screen.findByRole('checkbox', { name: /Ich habe das Geschenk gekauft/ });
      expect(screen.queryByRole('heading', { name: 'Geschenk für Ben gekauft?' })).not.toBeInTheDocument();
    });

    it('fragt in der Sprache des Gasts', async () => {
      oeffne('/wichteln/runde1/tok?gekauft=1');
      const basis = gezogenBen('fr');
      mockLaden.mockResolvedValue({ ...basis, los: { ...basis.los, gekauft: false } });
      renderSeite();
      expect(await screen.findByRole('heading', { name: 'Tu as acheté le cadeau pour Ben\u00A0?' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oui, je l’ai acheté' })).toBeInTheDocument();
    });
  });

  it('zeigt einen Fehler beim Ziehen an und lässt es erneut versuchen', async () => {
    mockLaden.mockResolvedValue(sicht({ runde: { ...sicht().runde, status: 'ausgelost' }, los: { gezogen: false } }));
    mockZiehen.mockRejectedValue(Object.assign(new Error('Es wurde noch nicht ausgelost.'), { code: 'functions/failed-precondition' }));
    renderSeite();
    fireEvent.click(await screen.findByRole('button', { name: 'Los ziehen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Für dich liegt gerade kein Los bereit.');
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

  const VORSCHAU = { bild: 'https://cdn.example.de/messer.jpg', titel: 'Kochmesser 20 cm', seite: 'shop.example.de' };

  it('trägt einen Wunsch mit Link ein und zeigt die Bildvorschau', async () => {
    mockLaden.mockResolvedValue(sicht());
    let antworte;
    mockHinzufuegen.mockImplementation(() => new Promise((resolve) => { antworte = resolve; }));
    renderSeite();
    fireEvent.change(await screen.findByLabelText('Wunsch hinzufügen'), { target: { value: 'Ein gutes Messer' } });
    fireEvent.change(screen.getByLabelText('Link zum Wunsch (optional)'), { target: { value: ' https://shop.example.de/messer ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Hinzufügen' })[0]);

    // Der Server holt die Vorschau: das dauert, der Knopf zeigt es.
    expect(await screen.findByRole('button', { name: 'Speichert …' })).toBeDisabled();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', 'tok', 't1', 'Ein gutes Messer', 'https://shop.example.de/messer');

    await act(async () => {
      antworte(sicht({
        meineWuensche: [{ id: 'e1', text: 'Ein gutes Messer', url: 'https://shop.example.de/messer', vorschau: VORSCHAU }],
      }));
    });
    const link = screen.getByRole('link', { name: /Kochmesser 20 cm/ });
    expect(link).toHaveAttribute('href', 'https://shop.example.de/messer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toEqual(expect.stringContaining('noreferrer'));
    expect(link).toHaveTextContent('shop.example.de');
    const bild = link.querySelector('img');
    expect(bild).toHaveAttribute('src', VORSCHAU.bild);
    expect(bild).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByText('Ein gutes Messer')).toBeInTheDocument();
    expect(screen.getByLabelText('Link zum Wunsch (optional)')).toHaveValue('');
  });

  it('ein Link genügt; Löschen nennt dann den Titel der Seite', async () => {
    mockLaden.mockResolvedValue(sicht());
    mockHinzufuegen.mockResolvedValue(sicht({
      meineIdeen: [{ id: 'e2', ueberId: 't2', ueberName: 'Ben', text: '', url: 'https://shop.example.de/messer', vorschau: VORSCHAU }],
    }));
    renderSeite();
    fireEvent.change(await screen.findByLabelText('Für wen?'), { target: { value: 't2' } });
    const speichern = screen.getByRole('button', { name: 'Speichern' });
    expect(speichern).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Link zur Geschenkidee (optional)'), { target: { value: 'shop.example.de/messer' } });
    fireEvent.click(speichern);
    expect(await screen.findByRole('button', { name: 'Idee „Kochmesser 20 cm“ entfernen' })).toBeInTheDocument();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', 'tok', 't2', '', 'shop.example.de/messer');
  });

  it('ohne Vorschaubild oder wenn es nicht lädt: Link-Symbol und Seitenname', async () => {
    mockLaden.mockResolvedValue(sicht({
      meineWuensche: [
        { id: 'e1', text: 'Messer', url: 'https://shop.example.de/messer', vorschau: VORSCHAU },
        { id: 'e2', text: 'Socken', url: 'https://www.socken.example.de/rot', vorschau: null },
      ],
    }));
    renderSeite();
    const messer = await screen.findByRole('link', { name: /Kochmesser 20 cm/ });
    fireEvent.error(messer.querySelector('img'));
    expect(messer.querySelector('img')).toBeNull();
    expect(messer.querySelector('svg')).not.toBeNull();

    const socken = screen.getByRole('link', { name: /socken\.example\.de/ });
    expect(socken.querySelector('img')).toBeNull();
    expect(socken).toHaveTextContent('socken.example.de');
    expect(screen.getByRole('button', { name: 'Wunsch „Socken“ entfernen' })).toBeInTheDocument();
  });

  it('mobil: bei offener Swipe-Aktion schließt ein Tipp auf den Link sie nur', async () => {
    mockLaden.mockResolvedValue(sicht({
      meineWuensche: [{ id: 'e1', text: 'Messer', url: 'https://shop.example.de/messer', vorschau: VORSCHAU }],
    }));
    renderSeite();
    const link = await screen.findByRole('link', { name: /Kochmesser 20 cm/ });
    const zeile = link.closest('.wichtel-zeile-inhalt');
    const beruehrung = (clientX) => ({ touches: [{ clientX, clientY: 100 }], cancelable: false });
    fireEvent.touchStart(zeile, beruehrung(200));
    fireEvent.touchMove(zeile, beruehrung(130));
    fireEvent.touchEnd(zeile, {});
    const zeileLi = link.closest('li');
    await waitFor(() => expect(zeileLi).toHaveClass('swipe-delete-active'));

    // dispatchEvent liefert false, wenn das Öffnen des Links verhindert wurde.
    expect(fireEvent.click(link)).toBe(false);
    expect(zeileLi).not.toHaveClass('swipe-delete-active');
    expect(mockLoeschen).not.toHaveBeenCalled();
  });

  it('verlinkt nur http- und https-Adressen', async () => {
    mockLaden.mockResolvedValue(sicht({
      meineWuensche: [{ id: 'e1', text: 'Trick', url: 'javascript:alert(1)', vorschau: { bild: 'http://x.example.de/a.jpg', titel: 'T' } }],
    }));
    renderSeite();
    expect(await screen.findByText('Trick')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('der Ziehende sieht Links in Wünschen und Ideen seines Partners', async () => {
    mockLaden.mockResolvedValue(sicht({
      runde: { ...sicht().runde, status: 'ausgelost' },
      los: {
        gezogen: true,
        empfaenger: { id: 't2', name: 'Ben' },
        wuensche: [{ id: 'w1', text: '', url: 'https://shop.example.de/messer', vorschau: VORSCHAU }],
        ideen: [{ id: 'i1', text: 'Passend dazu', url: 'https://brett.example.de/', vorschau: null, von: 'Cleo', vonDir: false }],
      },
    }));
    renderSeite();
    const partner = (await screen.findByRole('heading', { name: 'Für Ben' })).closest('section');
    expect(within(partner).getByRole('link', { name: /Kochmesser 20 cm/ })).toHaveAttribute('href', 'https://shop.example.de/messer');
    expect(within(partner).getByRole('link', { name: /brett\.example\.de/ })).toBeInTheDocument();
    expect(within(partner).getByText('Passend dazu')).toBeInTheDocument();
    expect(within(partner).getByText('von Cleo')).toBeInTheDocument();
  });

  it('bietet angemeldeten Nutzern den Weg zurück in die App', async () => {
    mockLaden.mockResolvedValue(sicht());
    const onClose = jest.fn();
    renderSeite({ currentUser: { id: 'u1' }, onClose });
    fireEvent.click(await screen.findByRole('button', { name: 'Zur App' }));
    expect(onClose).toHaveBeenCalled();
  });
});

// Die Testing Library macht beim Vergleichen aus geschützten Leerzeichen normale.
const NBSP = ' ';

describe('WichtelTeilnahmePage – Sprache des Gasts', () => {
  it('zeigt die Seite auf Englisch, wenn das Gästeprofil Englisch vorgibt – auch im deutschen Browser', async () => {
    mockLaden.mockResolvedValue(sicht({ ich: { id: 't1', name: 'Anna', sprache: 'en' } }));
    const { container } = renderSeite();
    expect(await screen.findByText('Hi Anna!')).toBeInTheDocument();
    expect(screen.getByText('Secret Santa')).toBeInTheDocument();
    expect(screen.getByText('Budget: €20.00')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your draw' })).toBeInTheDocument();
    expect(screen.getByText(/Names haven’t been drawn yet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your wishes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Add a wish')).toHaveAttribute('placeholder', 'What would you like?');
    expect(screen.getByRole('heading', { name: 'Gift ideas for others' })).toBeInTheDocument();
    expect(screen.getByLabelText('For whom?')).toHaveDisplayValue('Choose a guest');
    expect(screen.queryByText(/Hallo|Wünsche|Gast/)).not.toBeInTheDocument();
    expect(container.querySelector('.wt-seite')).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('lang', 'en');
  });

  it('Löschen und Rückgängig in der Sprache des Gasts', async () => {
    mockLaden.mockResolvedValue(sicht({
      ich: { id: 't1', name: 'Anna', sprache: 'en' },
      meineWuensche: [{ id: 'e1', text: 'Buch' }],
      meineIdeen: [{ id: 'e2', ueberId: 't3', ueberName: 'Cleo', text: 'Gin' }],
    }));
    renderSeite();
    expect(await screen.findByRole('heading', { name: 'For Cleo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove idea “Gin”' })).toHaveAttribute('title', 'Remove idea “Gin”');
    fireEvent.click(screen.getByRole('button', { name: 'Remove wish “Buch”' }));
    expect(screen.queryByText('Buch')).not.toBeInTheDocument();
    expect(screen.getByText('Wish removed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Buch')).toBeInTheDocument();
  });

  it('auf Französisch nach dem Ziehen: Empfänger fett, Ideen mit Absender', async () => {
    mockLaden.mockResolvedValue(gezogenBen('fr'));
    const { container } = renderSeite();
    const titel = await screen.findByRole('heading', { name: 'Pour Ben' });
    expect(screen.getByText(`Bonjour Anna !`).textContent).toBe(`Bonjour Anna${NBSP}!`);
    const losText = container.querySelector('.wt-mitte-text');
    expect(losText).toHaveTextContent('Tu offres un cadeau à Ben. Chut – ça reste entre nous.');
    expect(within(losText).getByText('Ben').tagName).toBe('STRONG');
    expect(container.querySelector('.wt-los-ueberzeile')).toHaveTextContent('Tu offres à');
    const partner = titel.closest('section');
    expect(within(partner).getByRole('heading', { name: 'Ses souhaits' })).toBeInTheDocument();
    expect(within(partner).getByText('Ben n’a pas encore noté de souhaits.')).toBeInTheDocument();
    expect(within(partner).getByText('par Cleo')).toBeInTheDocument();
    expect(within(partner).getByText('par toi')).toBeInTheDocument();
    expect(within(partner).getByText('Ces souhaits et idées ne sont visibles que pour toi.')).toBeInTheDocument();
  });

  it('ohne verknüpftes Gästeprofil gilt die Browsersprache', async () => {
    setzeBrowserSprache('fr-CH', 'de');
    mockLaden.mockResolvedValue(sicht({ ich: { id: 't1', name: 'Anna', sprache: null } }));
    renderSeite();
    expect(await screen.findByText('Bonjour Anna !')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });

  it('die Präferenz aus dem Gästeprofil schlägt die Browsersprache', async () => {
    setzeBrowserSprache('fr-FR');
    mockLaden.mockResolvedValue(sicht());
    renderSeite();
    expect(await screen.findByText('Hallo Anna!')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
  });

  it('vor der Antwort und bei kaputtem Link gilt die Browsersprache', () => {
    setzeBrowserSprache('fr-FR');
    mockLaden.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderSeite();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de ton tirage…');
    unmount();

    setzeBrowserSprache('en-GB');
    renderSeite({ gueltig: false });
    expect(screen.getByRole('heading', { name: 'Invalid link' })).toBeInTheDocument();
  });

  it('Fehlermeldungen in der Sprache des Gasts, nicht in der des Servers', async () => {
    mockLaden.mockResolvedValue(sicht({
      ich: { id: 't1', name: 'Anna', sprache: 'en' },
      runde: { ...sicht().runde, status: 'ausgelost' },
      los: { gezogen: false },
    }));
    mockZiehen.mockRejectedValue(Object.assign(new Error('Es wurde noch nicht ausgelost.'), { code: 'functions/failed-precondition' }));
    renderSeite();
    fireEvent.click(await screen.findByRole('button', { name: 'Draw a name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There’s no slip ready for you right now.');
  });

  it('stellt die Dokumentsprache beim Verlassen wieder her', async () => {
    mockLaden.mockResolvedValue(sicht({ ich: { id: 't1', name: 'Anna', sprache: 'fr' } }));
    const { unmount } = renderSeite();
    await screen.findByText('Bonjour Anna !');
    expect(document.documentElement).toHaveAttribute('lang', 'fr');
    unmount();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
  });
});
