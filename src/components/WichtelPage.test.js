import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import WichtelPage, { teileNamen, versandMeldung } from './WichtelPage';

const mockListe = jest.fn();
const mockLaden = jest.fn();
const mockAnlegen = jest.fn();
const mockHinzufuegen = jest.fn();
const mockEntfernen = jest.fn();
const mockAuslosen = jest.fn();
const mockZuruecksetzen = jest.fn();
const mockLoeschen = jest.fn();
const mockUmbenennen = jest.fn();
const mockAusschluesse = jest.fn();
const mockTeilen = jest.fn();
const mockSenden = jest.fn();
let mockDarfVerwalten = true;

jest.mock('../utils/wichtelFirestore', () => ({
  listeWichtelRunden: (...a) => mockListe(...a),
  ladeWichtelRunde: (...a) => mockLaden(...a),
  legeWichtelRundeAn: (...a) => mockAnlegen(...a),
  aendereWichtelRunde: jest.fn(),
  fuegeWichtelTeilnehmerHinzu: (...a) => mockHinzufuegen(...a),
  benenneWichtelTeilnehmerUm: (...a) => mockUmbenennen(...a),
  entferneWichtelTeilnehmer: (...a) => mockEntfernen(...a),
  loseWichtelRundeAus: (...a) => mockAuslosen(...a),
  setzeWichtelAuslosungZurueck: (...a) => mockZuruecksetzen(...a),
  setzeWichtelAusschluesse: (...a) => mockAusschluesse(...a),
  loescheWichtelRunde: (...a) => mockLoeschen(...a),
  sendeWichtelEinladung: (...a) => mockSenden(...a),
  getWichtelFehlertext: (e) => e?.message || 'Fehler',
}));

jest.mock('../utils/wichtelLinks', () => ({
  buildWichtelLink: (rundeId, token) => `https://app.test/wichteln/${rundeId}/${token}`,
  teileWichtelEinladung: (...a) => mockTeilen(...a),
}));

jest.mock('../utils/userManagement', () => ({
  canEditRecipes: () => mockDarfVerwalten,
}));

jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({}),
  DEFAULT_BUTTON_ICONS: {},
  getEffectiveIcon: () => '',
  getDarkModePreference: () => false,
}));

const runde = (over = {}) => ({
  id: 'runde1', titel: 'Advent 2026', budget: '20 €', hinweis: '', status: 'offen',
  teilnehmerAnzahl: 0, erstelltAm: 1, ausgelostAm: null, ...over,
});
const tn = (id, name, over = {}) => ({
  id, name, token: `tok-${id}`, geoeffnet: false, gezogen: false, gastId: null, mail: null, ...over,
});
const sicht = (rundeOver = {}, teilnehmer = []) => ({
  runde: runde({ teilnehmerAnzahl: teilnehmer.length, ...rundeOver }), teilnehmer,
});
const drei = [tn('t1', 'Anna'), tn('t2', 'Ben'), tn('t3', 'Cleo')];

const renderPage = (props = {}) => renderWithProviders(
  <WichtelPage currentUser={{ id: 'u1', role: 'edit' }} onBack={jest.fn()} {...props} />,
);

const oeffneRunde = async (antwort) => {
  mockListe.mockResolvedValue([antwort.runde]);
  mockLaden.mockResolvedValue(antwort);
  renderPage();
  fireEvent.click(await screen.findByText('Advent 2026'));
  await screen.findByRole('heading', { name: 'Advent 2026' });
};

beforeEach(() => {
  mockDarfVerwalten = true;
  mockListe.mockResolvedValue([]);
});

describe('teileNamen', () => {
  it('trennt an Komma, Semikolon und Zeilenumbruch', () => {
    expect(teileNamen(' Anna, Ben;Cleo\nLena & Tom ,, ')).toEqual(['Anna', 'Ben', 'Cleo', 'Lena & Tom']);
    expect(teileNamen('')).toEqual([]);
  });
});

describe('WichtelPage', () => {
  it('ohne Bearbeiten-Recht nur ein Hinweis', async () => {
    mockDarfVerwalten = false;
    renderPage();
    await act(async () => {}); // Button-Icons laden asynchron
    expect(screen.getByText(/Rolle „edit“ oder höher/)).toBeInTheDocument();
    expect(mockListe).not.toHaveBeenCalled();
  });

  it('legt eine Runde an und öffnet sie', async () => {
    mockAnlegen.mockResolvedValue(sicht());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Erste Runde anlegen' }));
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Advent 2026' } });
    fireEvent.change(screen.getByLabelText('Anlass (optional)'), { target: { value: 'weihnachten' } });
    fireEvent.change(screen.getByLabelText('Budget (optional)'), { target: { value: '20 €' } });
    fireEvent.click(screen.getByRole('button', { name: 'Runde anlegen' }));

    await screen.findByRole('heading', { name: 'Advent 2026' });
    expect(mockAnlegen).toHaveBeenCalledWith({ titel: 'Advent 2026', anlass: 'weihnachten', budget: '20 €', hinweis: '' });
    expect(screen.getByText('Noch niemand eingetragen.')).toBeInTheDocument();
  });

  it('fügt mehrere Namen auf einmal und Gäste aus der Gästeliste hinzu', async () => {
    await oeffneRunde(sicht());
    mockHinzufuegen.mockResolvedValue(sicht({}, drei));
    fireEvent.change(screen.getByLabelText('Teilnehmer hinzufügen'), { target: { value: 'Anna, Ben, Cleo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await screen.findByText('Cleo');
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [
      { name: 'Anna', gastId: null }, { name: 'Ben', gastId: null }, { name: 'Cleo', gastId: null },
    ]);
  });

  it('schlägt Gäste vor, die noch nicht dabei sind', async () => {
    mockListe.mockResolvedValue([runde()]);
    mockLaden.mockResolvedValue(sicht({}, [tn('t1', 'Anna Muster')]));
    renderPage({ guestProfiles: [{ id: 'g1', vorname: 'Anna', nachname: 'Muster' }, { id: 'g2', vorname: 'Ben', nachname: 'Beispiel' }] });
    fireEvent.click(await screen.findByText('Advent 2026'));
    await screen.findByText('Aus deiner Gästeliste:');
    expect(screen.queryByRole('button', { name: 'Anna Muster hinzufügen' })).not.toBeInTheDocument();
    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Anna Muster'), tn('t2', 'Ben Beispiel')]));
    fireEvent.click(screen.getByRole('button', { name: 'Ben Beispiel hinzufügen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'Ben Beispiel', gastId: 'g2' }]));
  });

  it('lost erst ab drei Teilnehmern aus', async () => {
    await oeffneRunde(sicht({}, drei.slice(0, 2)));
    expect(screen.getByRole('button', { name: 'Jetzt auslosen' })).toBeDisabled();
    expect(screen.getByText(/mindestens 3 Teilnehmer/)).toBeInTheDocument();
    // Zu zweit bliebe nach einem Ausschluss niemand zum Beschenken.
    expect(screen.queryByRole('button', { name: 'Ausschlüsse' })).not.toBeInTheDocument();
  });

  it('legt je Teilnehmer fest, wen er nicht ziehen soll, und hebt es wieder auf', async () => {
    await oeffneRunde(sicht({}, drei));
    const anna = screen.getByText('Anna').closest('li');
    const chip = (name) => within(within(anna).getByRole('group', { name: 'Anna beschenkt nicht:' }))
      .getByRole('button', { name });

    fireEvent.click(within(anna).getByRole('button', { name: 'Ausschlüsse' }));
    expect(within(anna).getByRole('button', { name: 'Ausschlüsse' })).toHaveAttribute('aria-expanded', 'true');
    expect(chip('Ben')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Cleo')).toHaveAttribute('aria-pressed', 'false');

    mockAusschluesse.mockResolvedValue(sicht({}, [tn('t1', 'Anna', { ausschluesse: ['t2'] }), drei[1], drei[2]]));
    fireEvent.click(chip('Ben'));
    await waitFor(() => expect(chip('Ben')).toHaveAttribute('aria-pressed', 'true'));
    expect(mockAusschluesse).toHaveBeenCalledWith('runde1', 't1', ['t2']);
    // Einen muss Anna noch beschenken können.
    expect(chip('Cleo')).toBeDisabled();
    expect(within(anna).getByText('Mindestens einen Gast muss Anna beschenken können.')).toBeInTheDocument();

    // Zugeklappt steht der Ausschluss als Text in der Zeile.
    fireEvent.click(within(anna).getByRole('button', { name: 'Ausschlüsse' }));
    expect(within(anna).getByText('Beschenkt nicht: Ben')).toBeInTheDocument();
    expect(within(anna).queryByRole('group')).not.toBeInTheDocument();

    fireEvent.click(within(anna).getByRole('button', { name: 'Ausschlüsse' }));
    mockAusschluesse.mockResolvedValue(sicht({}, drei));
    fireEvent.click(chip('Ben'));
    await waitFor(() => expect(chip('Ben')).toHaveAttribute('aria-pressed', 'false'));
    expect(mockAusschluesse).toHaveBeenLastCalledWith('runde1', 't1', []);
    expect(chip('Cleo')).toBeEnabled();
  });

  it('zeigt Ausschlüsse nach dem Auslosen nur noch an', async () => {
    await oeffneRunde(sicht({ status: 'ausgelost' }, [tn('t1', 'Anna', { ausschluesse: ['t2'] }), drei[1], drei[2]]));
    expect(screen.getByText('Beschenkt nicht: Ben')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ausschlüsse' })).not.toBeInTheDocument();
    expect(screen.getByText(/Teilnehmer und Ausschlüsse ändern geht erst nach dem Zurücksetzen/)).toBeInTheDocument();
  });

  it('lost aus und zeigt danach nur den Status, Löschen ist gesperrt', async () => {
    await oeffneRunde(sicht({}, drei));
    mockAuslosen.mockResolvedValue(sicht({ status: 'ausgelost', ausgelostAm: Date.UTC(2026, 10, 10) },
      [tn('t1', 'Anna', { geoeffnet: true, gezogen: true }), tn('t2', 'Ben', { geoeffnet: true }), tn('t3', 'Cleo'),
        tn('t4', 'Dana', { geoeffnet: true, gezogen: true, gekauft: true })]));
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt auslosen' }));

    await screen.findByText('Ausgelost am 10.11.2026');
    expect(mockAuslosen).toHaveBeenCalledWith('runde1');
    expect(screen.getByText('Los gezogen')).toBeInTheDocument();
    expect(screen.getByText('Geschenk gekauft')).toBeInTheDocument();
    expect(screen.getByText('Link geöffnet')).toBeInTheDocument();
    expect(screen.getByText('Link noch nicht geöffnet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anna entfernen' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Teilnehmer hinzufügen')).not.toBeInTheDocument();
  });

  it('Zurücksetzen fragt nach und setzt dann zurück', async () => {
    await oeffneRunde(sicht({ status: 'ausgelost' }, drei));
    mockZuruecksetzen.mockResolvedValue(sicht({}, drei));
    fireEvent.click(screen.getByRole('button', { name: 'Auslosung zurücksetzen' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }));
    await screen.findByRole('button', { name: 'Jetzt auslosen' });
    expect(mockZuruecksetzen).toHaveBeenCalledWith('runde1');
  });

  it('teilt die Einladung mit dem persönlichen Link', async () => {
    await oeffneRunde(sicht({}, drei));
    mockTeilen.mockResolvedValue('kopiert');
    const zeile = screen.getByText('Ben').closest('li');
    fireEvent.click(within(zeile).getByRole('button', { name: 'Link teilen' }));
    await screen.findByText('Einladung für Ben kopiert.');
    expect(mockTeilen).toHaveBeenCalledWith({
      name: 'Ben', titel: 'Advent 2026', link: 'https://app.test/wichteln/runde1/tok-t2', sprache: 'de',
    });
  });

  it('zeigt den Link zum Abschreiben, wenn Kopieren nicht geht', async () => {
    await oeffneRunde(sicht({}, drei));
    mockTeilen.mockResolvedValue('fehler');
    const zeile = screen.getByText('Ben').closest('li');
    fireEvent.click(within(zeile).getByRole('button', { name: 'Link teilen' }));
    expect(await screen.findByLabelText('Link für Ben')).toHaveValue('https://app.test/wichteln/runde1/tok-t2');
  });

  it('entfernt Teilnehmer sofort mit Rückgängig, die Mutation läuft erst danach', async () => {
    await oeffneRunde(sicht({}, drei));
    jest.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Ben entfernen' }));
      expect(screen.queryByText('Ben')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Jetzt auslosen' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
      expect(screen.getByText('Ben')).toBeInTheDocument();
      act(() => { jest.advanceTimersByTime(7000); });
      expect(mockEntfernen).not.toHaveBeenCalled();

      mockEntfernen.mockResolvedValue(sicht({}, [drei[0], drei[2]]));
      fireEvent.click(screen.getByRole('button', { name: 'Ben entfernen' }));
      await act(async () => { jest.advanceTimersByTime(6000); });
      expect(mockEntfernen).toHaveBeenCalledWith('runde1', 't2');
    } finally {
      jest.useRealTimers();
    }
  });

  it('löscht eine Runde aus der Übersicht mit Rückgängig', async () => {
    mockListe.mockResolvedValue([runde({ teilnehmerAnzahl: 3 })]);
    renderPage();
    await screen.findByText('3 Teilnehmer');
    jest.useFakeTimers();
    try {
      mockLoeschen.mockResolvedValue({ geloescht: true });
      fireEvent.click(screen.getByRole('button', { name: 'Advent 2026 entfernen' }));
      expect(screen.queryByText('3 Teilnehmer')).not.toBeInTheDocument();
      expect(screen.getByText('„Advent 2026“ gelöscht.')).toBeInTheDocument();
      await act(async () => { jest.advanceTimersByTime(6000); });
      expect(mockLoeschen).toHaveBeenCalledWith('runde1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('zeigt Server-Fehler an', async () => {
    await oeffneRunde(sicht({}, drei));
    mockHinzufuegen.mockRejectedValue(new Error('„Anna“ ist schon dabei.'));
    fireEvent.change(screen.getByLabelText('Teilnehmer hinzufügen'), { target: { value: 'anna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('„Anna“ ist schon dabei.');
  });
});

describe('versandMeldung', () => {
  it('meldet Erfolg, Teilerfolg und Gründe', () => {
    expect(versandMeldung(undefined)).toBeNull();
    expect(versandMeldung({ gesendet: 0, fehlgeschlagen: 0, grund: null })).toBeNull();
    expect(versandMeldung({ gesendet: 1, fehlgeschlagen: 0 })).toEqual({ art: 'ok', text: 'Einladung per Mail verschickt.' });
    expect(versandMeldung({ gesendet: 3, fehlgeschlagen: 0 })).toEqual({ art: 'ok', text: '3 Einladungen per Mail verschickt.' });
    expect(versandMeldung({ gesendet: 2, fehlgeschlagen: 1, grund: 'limit' })).toEqual({
      art: 'fehler',
      text: 'Eine Einladung konnte nicht per Mail verschickt werden (2 verschickt). Das Tageslimit für Wichtel-Mails ist erreicht. Teile den Link über „Link teilen“.',
    });
    expect(versandMeldung({ gesendet: 0, fehlgeschlagen: 2, grund: 'nicht-eingerichtet' }).text)
      .toBe('2 Einladungen konnten nicht per Mail verschickt werden. Der Mailversand ist nicht eingerichtet. Teile den Link über „Link teilen“.');
    expect(versandMeldung({ gesendet: 0, fehlgeschlagen: 1, grund: 'fehler' }).text).toContain('Der Mailversand hat nicht geklappt.');
  });
});

describe('WichtelPage – Einladung per Mail', () => {
  const anna = { id: 'g1', vorname: 'Anna', nachname: 'Muster', email: 'anna@example.com', sprache: 'en' };
  const cleo = { id: 'g3', vorname: 'Cleo', nachname: 'Ohne', sprache: 'fr' };

  const oeffneMitGaesten = async (antwort, guestProfiles) => {
    mockListe.mockResolvedValue([antwort.runde]);
    mockLaden.mockResolvedValue(antwort);
    renderPage({ guestProfiles });
    fireEvent.click(await screen.findByText('Advent 2026'));
    await screen.findByRole('heading', { name: 'Advent 2026' });
  };

  it('verknüpft eingetippte Namen mit Gästen und meldet den Versand', async () => {
    await oeffneMitGaesten(sicht(), [anna, cleo]);
    mockHinzufuegen.mockResolvedValue({
      ...sicht({}, [tn('t1', 'anna muster', { gastId: 'g1', mail: { status: 'gesendet', am: 1 } }), tn('t2', 'Ben')]),
      versand: { gesendet: 1, fehlgeschlagen: 0, grund: null },
    });
    fireEvent.change(screen.getByLabelText('Teilnehmer hinzufügen'), { target: { value: 'anna muster, Ben' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));

    expect(await screen.findByText('Einladung per Mail verschickt.')).toBeInTheDocument();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'anna muster', gastId: 'g1' }, { name: 'Ben', gastId: null }]);
    expect(screen.getByText('Per Mail verschickt')).toBeInTheDocument();
  });

  it('zeigt dauerhaft, was nicht per Mail rausging', async () => {
    await oeffneMitGaesten(sicht(), [anna]);
    mockHinzufuegen.mockResolvedValue({
      ...sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1', mail: { status: 'fehler', am: 1 } })]),
      versand: { gesendet: 0, fehlgeschlagen: 1, grund: 'nicht-eingerichtet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Anna Muster hinzufügen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Der Mailversand ist nicht eingerichtet.');
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'Anna Muster', gastId: 'g1' }]);
    expect(screen.getByText('Mail nicht verschickt')).toBeInTheDocument();
  });

  it('bietet Senden nur für Gäste mit E-Mail-Adresse an und sendet erneut', async () => {
    const teilnehmer = [
      tn('t1', 'Anna M.', { gastId: 'g1', mail: { status: 'gesendet', am: Date.UTC(2026, 10, 8, 10) } }),
      tn('t2', 'Ben'),
      tn('t3', 'Cleo Ohne'),
    ];
    await oeffneMitGaesten(sicht({}, teilnehmer), [anna, cleo]);

    const zeileVon = (name) => screen.getByText(name).closest('li');
    expect(within(zeileVon('Ben')).queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();
    expect(within(zeileVon('Cleo Ohne')).queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();
    // Bereits verknüpft: kein zweiter Vorschlag unter dem Namen aus der Gästeliste.
    expect(screen.queryByRole('button', { name: 'Anna Muster hinzufügen' })).not.toBeInTheDocument();

    mockSenden.mockResolvedValue({ ...sicht({}, teilnehmer), versand: { gesendet: 1, fehlgeschlagen: 0, grund: null } });
    fireEvent.click(within(zeileVon('Anna M.')).getByRole('button', { name: 'Erneut senden' }));
    expect(await screen.findByText('Einladung per Mail verschickt.')).toBeInTheDocument();
    expect(mockSenden).toHaveBeenCalledWith('runde1', 't1', 'g1');
  });

  it('verknüpft beim ersten Senden einen früher angelegten Teilnehmer über den Namen', async () => {
    await oeffneMitGaesten(sicht({ status: 'ausgelost' }, [tn('t1', 'Anna Muster'), tn('t2', 'Ben'), tn('t3', 'Cleo')]), [anna]);
    mockSenden.mockResolvedValue({ ...sicht({ status: 'ausgelost' }, []), versand: { gesendet: 1, fehlgeschlagen: 0, grund: null } });
    const zeile = screen.getByText('Anna Muster').closest('li');
    fireEvent.click(within(zeile).getByRole('button', { name: 'Per Mail senden' }));
    await waitFor(() => expect(mockSenden).toHaveBeenCalledWith('runde1', 't1', 'g1'));
  });

  it('ordnet einen schon verknüpften Gast keinem zweiten Teilnehmer über den Namen zu', async () => {
    const teilnehmer = [tn('t1', 'Anna M.', { gastId: 'g1' }), tn('t2', 'Anna Muster'), tn('t3', 'Ben')];
    await oeffneMitGaesten(sicht({}, teilnehmer), [anna]);
    expect(within(screen.getByText('Anna M.').closest('li')).getByRole('button', { name: 'Per Mail senden' })).toBeInTheDocument();
    expect(within(screen.getByText('Anna Muster').closest('li')).queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();

    mockHinzufuegen.mockResolvedValue(sicht({}, teilnehmer));
    fireEvent.change(screen.getByLabelText('Teilnehmer hinzufügen'), { target: { value: 'ANNA MUSTER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'ANNA MUSTER', gastId: null }]));
  });

  it('teilt den Link in der Sprache des Gasts', async () => {
    await oeffneMitGaesten(sicht({}, [tn('t1', 'Anna M.', { gastId: 'g1' }), tn('t2', 'Cleo Ohne'), tn('t3', 'Ben')]), [anna, cleo]);
    mockTeilen.mockResolvedValue('geteilt');

    fireEvent.click(within(screen.getByText('Anna M.').closest('li')).getByRole('button', { name: 'Link teilen' }));
    await waitFor(() => expect(mockTeilen).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Anna M.', sprache: 'en' })));

    fireEvent.click(within(screen.getByText('Cleo Ohne').closest('li')).getByRole('button', { name: 'Link teilen' }));
    await waitFor(() => expect(mockTeilen).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Cleo Ohne', sprache: 'fr' })));

    fireEvent.click(within(screen.getByText('Ben').closest('li')).getByRole('button', { name: 'Link teilen' }));
    await waitFor(() => expect(mockTeilen).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Ben', sprache: 'de' })));
  });
});
