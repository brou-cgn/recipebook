import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import WichtelPage, { versandMeldung } from './WichtelPage';

const mockListe = jest.fn();
const mockLaden = jest.fn();
const mockAnlegen = jest.fn();
const mockAendern = jest.fn();
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
  aendereWichtelRunde: (...a) => mockAendern(...a),
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

/** Füllt das Formular „Teilnehmer eintragen“ aus (leere Felder bleiben unberührt). */
const tippe = ({ vorname, nachname, email } = {}) => {
  if (vorname !== undefined) fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: vorname } });
  if (nachname !== undefined) fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: nachname } });
  if (email !== undefined) fireEvent.change(screen.getByLabelText('E-Mail (optional)'), { target: { value: email } });
};

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

describe('WichtelPage', () => {
  it('ohne Bearbeiten-Recht nur ein Hinweis', async () => {
    mockDarfVerwalten = false;
    renderPage();
    await act(async () => {}); // Button-Icons laden asynchron
    expect(screen.getByText(/Rolle „edit“ oder höher/)).toBeInTheDocument();
    expect(mockListe).not.toHaveBeenCalled();
  });

  it('legt eine Runde an und öffnet sie', async () => {
    mockAnlegen.mockResolvedValue(sicht({ datum: '2026-12-13' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Erste Runde anlegen' }));
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Advent 2026' } });
    fireEvent.change(screen.getByLabelText('Anlass'), { target: { value: 'weihnachten' } });
    fireEvent.change(screen.getByLabelText('Wann wird gefeiert?'), { target: { value: '2026-12-13' } });
    fireEvent.change(screen.getByLabelText('Budget'), { target: { value: '20 €' } });
    fireEvent.click(screen.getByRole('button', { name: 'Runde anlegen' }));

    await screen.findByRole('heading', { name: 'Advent 2026' });
    expect(mockAnlegen).toHaveBeenCalledWith({
      titel: 'Advent 2026', anlass: 'weihnachten', budget: '20 €', hinweis: '', datum: '2026-12-13',
    });
    expect(screen.getByText('Feier: So., 13.12.2026')).toBeInTheDocument();
    expect(screen.getByText('Noch niemand eingetragen.')).toBeInTheDocument();
  });

  it('ohne Titel und Datum zeigt das Formular beide Fehler und schickt nichts', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Erste Runde anlegen' }));
    expect(screen.queryByText('Worum geht es?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Runde anlegen' }));

    expect(screen.getByText('Bitte gib der Runde einen Titel.')).toBeInTheDocument();
    expect(screen.getByText('Bitte ein Datum für die Feier wählen.')).toBeInTheDocument();
    expect(screen.getByLabelText('Titel')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Wann wird gefeiert?')).toHaveAttribute('aria-invalid', 'true');
    expect(mockAnlegen).not.toHaveBeenCalled();

    // Nur der Titel reicht nicht.
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Advent 2026' } });
    expect(screen.queryByText('Bitte gib der Runde einen Titel.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Runde anlegen' }));
    expect(mockAnlegen).not.toHaveBeenCalled();

    // Mit Datum wird die Karte zum Kalenderblatt.
    fireEvent.change(screen.getByLabelText('Wann wird gefeiert?'), { target: { value: '2026-12-19' } });
    expect(screen.queryByText('Bitte ein Datum für die Feier wählen.')).not.toBeInTheDocument();
    expect(screen.getByText('Samstag, 19. Dezember 2026')).toBeInTheDocument();
    expect(screen.getByText('DEZ')).toBeInTheDocument();
  });

  it('nimmt einen mehrzeiligen Hinweis an und zählt die Zeichen', async () => {
    mockAnlegen.mockResolvedValue(sicht({ datum: '2026-12-13' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Erste Runde anlegen' }));
    const feld = screen.getByLabelText('Hinweis');
    expect(feld.tagName).toBe('TEXTAREA');
    fireEvent.change(feld, { target: { value: 'Bescherung nach dem Essen.\nBitte nichts Selbstgebackenes.' } });
    expect(screen.getByText('57 / 300')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Advent 2026' } });
    fireEvent.change(screen.getByLabelText('Wann wird gefeiert?'), { target: { value: '2026-12-13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Runde anlegen' }));

    await screen.findByRole('heading', { name: 'Advent 2026' });
    expect(mockAnlegen).toHaveBeenCalledWith(expect.objectContaining({
      hinweis: 'Bescherung nach dem Essen.\nBitte nichts Selbstgebackenes.',
    }));
  });

  it('setzt das Datum der Feier auch nach dem Auslosen und zeigt es in der Übersicht', async () => {
    const ausgelost = sicht({ status: 'ausgelost', ausgelostAm: 2 }, drei);
    await oeffneRunde(ausgelost);
    fireEvent.click(screen.getByRole('button', { name: 'Runde bearbeiten' }));
    const feld = screen.getByLabelText('Wann wird gefeiert?');
    expect(feld).toHaveValue('');
    // Eine ältere Runde ohne Datum braucht beim Speichern eins.
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByText('Bitte ein Datum für die Feier wählen.')).toBeInTheDocument();
    expect(mockAendern).not.toHaveBeenCalled();
    fireEvent.change(feld, { target: { value: '2026-12-13' } });
    mockAendern.mockResolvedValue({ ...ausgelost, runde: { ...ausgelost.runde, datum: '2026-12-13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Feier: So., 13.12.2026')).toBeInTheDocument();
    expect(mockAendern).toHaveBeenCalledWith('runde1', {
      titel: 'Advent 2026', anlass: '', budget: '20 €', hinweis: '', datum: '2026-12-13',
    });

    // In der Übersicht steht das Datum neben dem Status.
    mockListe.mockResolvedValue([{ ...ausgelost.runde, datum: '2026-12-13' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Zur Übersicht' }));
    expect(await screen.findByText('Feier So., 13.12.2026')).toBeInTheDocument();
  });

  it('trägt einen neuen Gast mit Vorname, Nachname und E-Mail ein; der Server legt ihn in der Gästeliste an', async () => {
    await oeffneRunde(sicht());
    const hinzufuegen = screen.getByRole('button', { name: 'Hinzufügen' });
    expect(hinzufuegen).toBeDisabled();
    tippe({ vorname: ' Lena ', email: ' Lena@Example.com ' });
    expect(hinzufuegen).toBeDisabled(); // ohne Nachname
    tippe({ nachname: 'Neu  Mann' });
    expect(hinzufuegen).toBeEnabled();

    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Lena Neu Mann', { gastId: 'gNeu' })]));
    fireEvent.click(hinzufuegen);
    expect(await screen.findByText('Lena Neu Mann ist dabei und steht jetzt auch in deiner Gästeliste.')).toBeInTheDocument();
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ vorname: 'Lena', nachname: 'Neu Mann', email: 'lena@example.com' }]);
    // Nach dem Eintragen ist das Formular leer.
    expect(screen.getByLabelText('Vorname')).toHaveValue('');
    expect(screen.getByLabelText('Nachname')).toHaveValue('');
    expect(screen.getByLabelText('E-Mail (optional)')).toHaveValue('');
  });

  it('ohne E-Mail-Adresse geht nur der Name mit', async () => {
    await oeffneRunde(sicht());
    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Tom Ohne', { gastId: 'gNeu' })]));
    tippe({ vorname: 'Tom', nachname: 'Ohne' });
    fireEvent.submit(screen.getByRole('form', { name: 'Teilnehmer eintragen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ vorname: 'Tom', nachname: 'Ohne' }]));
  });

  it('schickt eine ungültige E-Mail-Adresse nicht ab', async () => {
    await oeffneRunde(sicht());
    tippe({ vorname: 'Lena', nachname: 'Neu', email: 'lena@example' });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Diese E-Mail-Adresse sieht nicht gültig aus.');
    expect(screen.getByLabelText('E-Mail (optional)')).toHaveAttribute('aria-invalid', 'true');
    expect(mockHinzufuegen).not.toHaveBeenCalled();

    // Korrigiert: der Hinweis verschwindet beim Tippen.
    tippe({ email: 'lena@example.com' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('zeigt Gäste aus der Gästeliste erst beim Tippen, gesucht in Vor- und Nachname', async () => {
    const gaesteListe = [
      { id: 'g1', vorname: 'Anna', nachname: 'Muster' },
      { id: 'g2', vorname: 'Ben', nachname: 'Beispiel', email: 'ben@example.com' },
      { id: 'g4', vorname: 'Anna-Lena', nachname: 'Berg' },
      { id: 'g5', vorname: 'Bernd', nachname: 'Andres' },
    ];
    mockListe.mockResolvedValue([runde()]);
    mockLaden.mockResolvedValue(sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1' })]));
    renderPage({ guestProfiles: gaesteListe });
    fireEvent.click(await screen.findByText('Advent 2026'));
    await screen.findByLabelText('Vorname');
    const pillen = () => screen.queryAllByRole('button', { name: / hinzufügen$/ }).map((b) => b.getAttribute('aria-label'));
    expect(screen.queryByText('Aus deiner Gästeliste:')).not.toBeInTheDocument();
    expect(pillen()).toEqual([]);

    // Vorname sucht im Vornamen (auch in Doppelnamen), nicht im Nachnamen; Anna Muster ist schon dabei.
    tippe({ vorname: 'lena' });
    expect(pillen()).toEqual(['Anna-Lena Berg hinzufügen']);
    tippe({ vorname: 'an' });
    expect(pillen()).toEqual(['Anna-Lena Berg hinzufügen']);
    // Nachname sucht im Nachnamen; beide Felder zusammen müssen passen.
    tippe({ vorname: '', nachname: 'b' });
    expect(pillen()).toEqual(['Anna-Lena Berg hinzufügen', 'Ben Beispiel hinzufügen']);
    tippe({ vorname: 'be', nachname: 'b' });
    expect(pillen()).toEqual(['Ben Beispiel hinzufügen']);
    expect(screen.getByRole('button', { name: 'Ben Beispiel hinzufügen' })).toHaveAttribute('title', 'Bekommt den Link beim Auslosen per Mail');

    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1' }), tn('t2', 'Ben Beispiel', { gastId: 'g2' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Ben Beispiel hinzufügen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'Ben Beispiel', gastId: 'g2' }]));
    await waitFor(() => expect(screen.getByLabelText('Vorname')).toHaveValue(''));
    expect(pillen()).toEqual([]);
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
    // Auch bei offenem Panel bleibt der Ausschluss als Text in der Zeile sichtbar.
    expect(within(anna).getByText('Beschenkt nicht: Ben')).toBeInTheDocument();
    // Einen muss Anna noch beschenken können.
    expect(chip('Cleo')).toBeDisabled();
    expect(within(anna).getByText('Mindestens einen Gast muss Anna beschenken können.')).toBeInTheDocument();

    // Zugeklappt ebenso.
    fireEvent.click(within(anna).getByRole('button', { name: 'Ausschlüsse' }));
    expect(within(anna).getByText('Beschenkt nicht: Ben')).toBeInTheDocument();
    expect(within(anna).queryByRole('group')).not.toBeInTheDocument();

    fireEvent.click(within(anna).getByRole('button', { name: 'Ausschlüsse' }));
    mockAusschluesse.mockResolvedValue(sicht({}, drei));
    fireEvent.click(chip('Ben'));
    await waitFor(() => expect(chip('Ben')).toHaveAttribute('aria-pressed', 'false'));
    expect(mockAusschluesse).toHaveBeenLastCalledWith('runde1', 't1', []);
    expect(within(anna).queryByText(/Beschenkt nicht:/)).not.toBeInTheDocument();
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
    expect(screen.queryByRole('form', { name: 'Teilnehmer eintragen' })).not.toBeInTheDocument();
    expect(screen.getByText('Ausgelost – jetzt kann jeder sein Los ziehen.')).toBeInTheDocument();
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

  it('zeigt Server-Fehler an und behält die Eingabe', async () => {
    await oeffneRunde(sicht({}, drei));
    mockHinzufuegen.mockRejectedValue(new Error('„Anna Muster“ ist schon dabei.'));
    tippe({ vorname: 'Anna', nachname: 'Muster' });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('„Anna Muster“ ist schon dabei.');
    expect(screen.getByLabelText('Vorname')).toHaveValue('Anna');
    expect(screen.getByLabelText('Nachname')).toHaveValue('Muster');
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

  it('verknüpft einen eingetippten Namen aus der Gästeliste, statt ihn neu anzulegen', async () => {
    await oeffneMitGaesten(sicht(), [anna, cleo]);
    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1' })]));
    tippe({ vorname: 'anna', nachname: 'MUSTER' });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'Anna Muster', gastId: 'g1' }]));
    expect(screen.queryByText(/steht jetzt auch in deiner Gästeliste/)).not.toBeInTheDocument();

    // Mit Adresse: Sie geht mit; der Server ergänzt sie bei Cleo, die noch keine hat.
    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1' }), tn('t2', 'Cleo Ohne', { gastId: 'g3' })]));
    tippe({ vorname: 'Cleo', nachname: 'Ohne', email: 'cleo@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenLastCalledWith('runde1', [
      { name: 'Cleo Ohne', gastId: 'g3', email: 'cleo@example.com' },
    ]));
  });

  it('nimmt beim Tipp auf eine Pille die eingetippte Adresse mit', async () => {
    await oeffneMitGaesten(sicht(), [anna, cleo]);
    tippe({ email: 'cleo@example.com', vorname: 'cl' });
    mockHinzufuegen.mockResolvedValue(sicht({}, [tn('t1', 'Cleo Ohne', { gastId: 'g3' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Cleo Ohne hinzufügen' }));
    await waitFor(() => expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [
      { name: 'Cleo Ohne', gastId: 'g3', email: 'cleo@example.com' },
    ]));
  });

  it('verschickt vor dem Auslosen nichts: kein Senden-Button, aber „Mail beim Auslosen“', async () => {
    const teilnehmer = [
      tn('t1', 'Anna M.', { gastId: 'g1' }),
      tn('t2', 'Cleo Ohne', { gastId: 'g3' }),
      tn('t3', 'Ben'),
      tn('t4', 'Anna Muster'),
      tn('t5', 'Dora Komma', { gastId: 'g5' }),
    ];
    // Eine Adresse, die der Server nicht anschreibt (zwei Empfänger in einer), zählt nicht.
    const dora = { id: 'g5', vorname: 'Dora', nachname: 'Komma', email: 'a@example.com, b@example.com' };
    await oeffneMitGaesten(sicht({}, teilnehmer), [anna, cleo, dora]);
    expect(screen.queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();
    const zeileVon = (name) => screen.getByText(name).closest('li');
    expect(within(zeileVon('Anna M.')).getByText('Mail beim Auslosen')).toBeInTheDocument();
    expect(within(zeileVon('Cleo Ohne')).queryByText('Mail beim Auslosen')).not.toBeInTheDocument();
    expect(within(zeileVon('Ben')).queryByText('Mail beim Auslosen')).not.toBeInTheDocument();
    // Nur über den Namen zugeordnet: der Server mailt beim Auslosen nur gespeicherte Verknüpfungen.
    expect(within(zeileVon('Anna Muster')).queryByText('Mail beim Auslosen')).not.toBeInTheDocument();
    expect(within(zeileVon('Dora Komma')).queryByText('Mail beim Auslosen')).not.toBeInTheDocument();
  });

  it('meldet beim Auslosen die verschickten Einladungen', async () => {
    await oeffneMitGaesten(sicht({}, drei), [anna]);
    mockAuslosen.mockResolvedValue({
      ...sicht({ status: 'ausgelost' }, drei),
      versand: { gesendet: 2, fehlgeschlagen: 0, grund: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt auslosen' }));
    expect(await screen.findByText('Ausgelost – 2 Einladungen per Mail verschickt.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('zeigt dauerhaft, was beim Auslosen nicht per Mail rausging', async () => {
    await oeffneMitGaesten(sicht({}, drei), [anna]);
    mockAuslosen.mockResolvedValue({
      ...sicht({ status: 'ausgelost' }, [tn('t1', 'Anna Muster', { gastId: 'g1', mail: { status: 'fehler', am: 1 } }), drei[1], drei[2]]),
      versand: { gesendet: 0, fehlgeschlagen: 1, grund: 'nicht-eingerichtet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt auslosen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Der Mailversand ist nicht eingerichtet.');
    expect(screen.getByText('Ausgelost – jetzt kann jeder sein Los ziehen.')).toBeInTheDocument();
    expect(screen.getByText('Mail nicht verschickt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut senden' })).toBeInTheDocument();
  });

  it('bietet nach dem Auslosen Senden nur für Gäste mit E-Mail-Adresse an und sendet erneut', async () => {
    const teilnehmer = [
      tn('t1', 'Anna M.', { gastId: 'g1', mail: { status: 'gesendet', am: Date.UTC(2026, 10, 8, 10) } }),
      tn('t2', 'Ben'),
      tn('t3', 'Cleo Ohne'),
    ];
    await oeffneMitGaesten(sicht({ status: 'ausgelost' }, teilnehmer), [anna, cleo]);

    const zeileVon = (name) => screen.getByText(name).closest('li');
    expect(within(zeileVon('Ben')).queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();
    expect(within(zeileVon('Cleo Ohne')).queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Mail beim Auslosen')).not.toBeInTheDocument();

    mockSenden.mockResolvedValue({ ...sicht({ status: 'ausgelost' }, teilnehmer), versand: { gesendet: 1, fehlgeschlagen: 0, grund: null } });
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
    await oeffneMitGaesten(sicht({ status: 'ausgelost' }, teilnehmer), [anna]);
    expect(within(screen.getByText('Anna M.').closest('li')).getByRole('button', { name: 'Per Mail senden' })).toBeInTheDocument();
    expect(within(screen.getByText('Anna Muster').closest('li')).queryByRole('button', { name: /senden/ })).not.toBeInTheDocument();
  });

  it('schlägt einen schon verknüpften Gast nicht vor; eingetippt prüft der Server', async () => {
    await oeffneMitGaesten(sicht({}, [tn('t1', 'Anna M.', { gastId: 'g1' }), tn('t2', 'Ben')]), [anna]);
    tippe({ vorname: 'Anna' });
    expect(screen.queryByRole('button', { name: 'Anna Muster hinzufügen' })).not.toBeInTheDocument();

    mockHinzufuegen.mockRejectedValue(new Error('„Anna Muster“ ist schon als „Anna M.“ dabei.'));
    tippe({ nachname: 'Muster' });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('„Anna Muster“ ist schon als „Anna M.“ dabei.');
    expect(mockHinzufuegen).toHaveBeenCalledWith('runde1', [{ name: 'Anna Muster', gastId: 'g1' }]);
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

describe('WichtelPage – Stift öffnet die Gästekarte', () => {
  const anna = { id: 'g1', vorname: 'Anna', nachname: 'Muster', email: 'anna@example.com' };

  const oeffne = async (antwort, renderGastBearbeiten) => {
    mockListe.mockResolvedValue([antwort.runde]);
    mockLaden.mockResolvedValue(antwort);
    renderPage({ guestProfiles: [anna], renderGastBearbeiten });
    fireEvent.click(await screen.findByText('Advent 2026'));
    await screen.findByRole('heading', { name: 'Advent 2026' });
  };

  it('öffnet für einen Gast aus der Gästeliste die Gästekarte und kehrt zur Runde zurück', async () => {
    let schliessen;
    const render = jest.fn((gast, onClose) => {
      schliessen = onClose;
      return <div>Gästekarte {gast.vorname}</div>;
    });
    await oeffne(sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1' }), tn('t2', 'Ben')]), render);

    fireEvent.click(screen.getByRole('button', { name: 'Anna Muster bearbeiten' }));
    expect(screen.getByText('Gästekarte Anna')).toBeInTheDocument();
    expect(render).toHaveBeenLastCalledWith(anna, expect.any(Function));

    // Name geändert gespeichert: der Teilnehmer zieht nach, die Runde bleibt offen.
    mockUmbenennen.mockResolvedValue(sicht({}, [tn('t1', 'Anna Beispiel', { gastId: 'g1' }), tn('t2', 'Ben')]));
    act(() => schliessen({ vorname: 'Anna', nachname: 'Beispiel' }));
    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    expect(mockUmbenennen).toHaveBeenCalledWith('runde1', 't1', 'Anna Beispiel');
  });

  it('abgebrochen oder ohne Namensänderung wird nichts umbenannt', async () => {
    let schliessen;
    await oeffne(sicht({}, [tn('t1', 'Anna Muster', { gastId: 'g1' })]), (gast, onClose) => {
      schliessen = onClose;
      return <div>Gästekarte</div>;
    });
    mockUmbenennen.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Anna Muster bearbeiten' }));
    act(() => schliessen(null));
    await screen.findByRole('heading', { name: 'Advent 2026' });

    fireEvent.click(screen.getByRole('button', { name: 'Anna Muster bearbeiten' }));
    act(() => schliessen({ vorname: 'Anna', nachname: 'Muster', email: 'neu@example.com' }));
    await screen.findByRole('heading', { name: 'Advent 2026' });
    expect(mockUmbenennen).not.toHaveBeenCalled();
  });

  it('ohne Eintrag in der Gästeliste bleibt der Stift ein Umbenennen', async () => {
    const render = jest.fn(() => <div>Gästekarte</div>);
    await oeffne(sicht({}, [tn('t2', 'Ben')]), render);

    fireEvent.click(screen.getByRole('button', { name: 'Ben umbenennen' }));
    expect(screen.getByRole('textbox', { name: 'Ben umbenennen' })).toBeInTheDocument();
    expect(render).not.toHaveBeenCalled();
  });
});
