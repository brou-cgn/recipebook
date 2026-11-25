import React from 'react';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils';
import PrintFormatsSettings from './PrintFormatsSettings';
import { createFlowFormat, migrateFormat } from '../../utils/print/printFormats';

jest.mock('../../utils/printFormatsFirestore', () => ({
  loadPrintFormatsForEditing: jest.fn(),
  savePrintFormats: jest.fn(),
}));
// Blatt und Vorlagen-Editor haben eigene Tests; hier geht es um Übersicht, Editor-Fenster und Speichern.
jest.mock('./PrintPage', () => function FakePrintPage({ format }) {
  return <div data-testid="print-page">blatt {format.template}</div>;
});
jest.mock('./TemplateFormatEditor', () => function FakeTemplateEditor({ format, onChange, previewRecipe }) {
  return (
    <div data-testid="template-editor">
      <span>vorlage {format.template}</span>
      <button type="button" onClick={() => onChange({ ...format, template: 'minimal' })}>auf schlicht</button>
      {previewRecipe && <span>vorschau {previewRecipe.title}</span>}
    </div>
  );
});

const { loadPrintFormatsForEditing, savePrintFormats } = require('../../utils/printFormatsFirestore');

const fmt = (id, name, maxPhotos, template = 'classic') => ({ ...createFlowFormat(template), id, name, maxPhotos });
const three = () => [fmt('karte', 'Karte', 1, 'card'), fmt('klassisch', 'Klassisch', 3), fmt('standard', 'Standard', null, 'photo')];
// Ein gespeichertes Format des entfernten freien Layouts, wie loadPrintFormatsForEditing es liefert
const converted = (id, name, maxPhotos) => migrateFormat({
  id, name, maxPhotos, orientation: 'portrait', layoutVersion: 3,
  elements: [{ id: 'title', x: 2, y: 1, w: 96, h: 9, visible: true }],
});

// Firestore im Kleinen: Was gespeichert wird, liefert das nächste Laden
let store;
const stored = () => store.formats;

async function renderLoaded(props = {}, formats = three(), usingDefaults = false) {
  store = { formats, usingDefaults };
  const utils = renderWithProviders(<PrintFormatsSettings {...props} />);
  await screen.findAllByTestId('print-format-card');
  return utils;
}

const cards = () => screen.getAllByTestId('print-format-card');
const names = () => cards().map((card) => within(card).getByRole('heading', { level: 3 }).textContent);
const card = (name) => cards().find((c) => within(c).getByRole('heading', { level: 3 }).textContent === name);
const editor = () => screen.getByRole('dialog');
const openEditor = (name) => fireEvent.click(screen.getByRole('button', { name: `${name} bearbeiten` }));
const saveButton = () => within(editor()).getByRole('button', { name: /^Speicher/ });
const back = () => fireEvent.click(within(editor()).getByRole('button', { name: 'Zurück zu den Druckformaten' }));
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  loadPrintFormatsForEditing.mockReset();
  savePrintFormats.mockReset();
  loadPrintFormatsForEditing.mockImplementation(async () => ({ formats: store.formats, usingDefaults: store.usingDefaults }));
  savePrintFormats.mockImplementation(async (formats) => {
    store = { formats: formats.map(({ migrationNotes, ...format }) => format), usingDefaults: false };
  });
});
afterEach(() => { jest.useRealTimers(); });

describe('Laden', () => {
  test('zeigt je gespeichertem Format eine Karte', async () => {
    await renderLoaded();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(screen.queryByText(/noch keine Druckformate gespeichert/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('weist darauf hin, wenn noch nichts gespeichert ist', async () => {
    await renderLoaded({}, [fmt('default', 'Standard', null)], true);
    expect(screen.getByText(/noch keine Druckformate gespeichert/)).toBeInTheDocument();
  });

  test('ein fehlgeschlagenes Laden zeigt einen Fehler mit „Erneut laden“ und keine Formate', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    store = { formats: three(), usingDefaults: false };
    loadPrintFormatsForEditing.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<PrintFormatsSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Bearbeiten ist gesperrt');
    expect(screen.queryByTestId('print-format-card')).toBeNull();
    expect(screen.queryByRole('button', { name: /Neues Format/ })).toBeNull();
    fireEvent.click(screen.getByText('Erneut laden'));
    expect(await screen.findAllByTestId('print-format-card')).toHaveLength(3);
    console.error.mockRestore();
  });
});

describe('Übersicht', () => {
  test('nennt je Format die Regel in Klartext, Vorlage und Papier', async () => {
    await renderLoaded();
    expect(within(card('Karte')).getByText('Für Rezepte mit höchstens 1 Foto')).toBeInTheDocument();
    expect(within(card('Klassisch')).getByText('Für Rezepte mit 2 bis 3 Fotos')).toBeInTheDocument();
    expect(within(card('Standard')).getByText('Für alle übrigen Rezepte')).toBeInTheDocument();
    expect(within(card('Karte')).getByText('Vorlage Karte · A4 hoch')).toBeInTheDocument();
    expect(within(card('Standard')).getByText('Vorlage Foto groß · A4 hoch')).toBeInTheDocument();
    expect(within(card('Karte')).getByTestId('print-page')).toHaveTextContent('blatt card');
  });

  test('zeigt die Reihenfolge, in der die App beim Drucken wählt', async () => {
    await renderLoaded({}, [fmt('standard', 'Standard', null), fmt('klassisch', 'Klassisch', 3), fmt('karte', 'Karte', 1)]);
    const strip = screen.getByRole('region', { name: 'So wählt die App beim Drucken' });
    expect(within(strip).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Bis 1 FotoKarte', '2 bis 3 FotosKlassisch', 'Ab 4 FotosStandard',
    ]);
  });

  test('ein einziges Format hat keine Regel: keine Zeile auf der Karte, keine Leiste', async () => {
    await renderLoaded({}, [fmt('standard', 'Standard', null)]);
    expect(screen.queryByText(/^Für /)).toBeNull();
    expect(screen.queryByText('So wählt die App beim Drucken')).toBeNull();
    expect(screen.getByText(/Solange es nur dieses eine gibt, druckt die App jedes Rezept damit/)).toBeInTheDocument();
  });

  test('der Einleitungstext duzt und beschreibt kein Drag & Drop', async () => {
    await renderLoaded();
    expect(screen.getByText(/Beim Drucken nimmt die App das Format, dessen Regel zur Fotoanzahl des Rezepts passt/)).toBeInTheDocument();
    expect(screen.queryByText(/Drag|Konfigurieren Sie|Maximale Fotoanzahl/)).toBeNull();
  });

  test('ein zweites Format ohne Regel ist als unbenutzt gekennzeichnet und sagt, was zu tun ist', async () => {
    await renderLoaded({}, [fmt('karte', 'Karte', 1), fmt('standard', 'Standard', null), fmt('kopie', 'Standard Kopie', null)]);
    expect(within(card('Standard Kopie')).getByText('Wird nicht verwendet')).toBeInTheDocument();
    expect(within(card('Standard Kopie')).getByText(/„Standard“ gilt bereits für dieselben Rezepte/)).toBeInTheDocument();
    expect(within(card('Standard')).getByText('Für alle übrigen Rezepte')).toBeInTheDocument();
  });

  describe('Prüfen mit Rezept', () => {
    const recipes = [
      { id: 'r3', title: 'Zwetschgenkuchen', images: [{ url: 'a' }, { url: 'b' }, { url: 'c' }] },
      { id: 'r0', title: 'Apfelmus' },
      { id: 'r5', title: 'Braten', images: [1, 2, 3, 4, 5].map((n) => ({ url: `b${n}` })) },
    ];

    test('ohne Rezepte gibt es keine Auswahl', async () => {
      await renderLoaded();
      expect(screen.queryByLabelText('Prüfen mit Rezept')).toBeNull();
    });

    test('listet die Rezepte nach Titel mit ihrer Fotoanzahl', async () => {
      await renderLoaded({ allRecipes: recipes });
      const options = within(screen.getByLabelText('Prüfen mit Rezept')).getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['Rezept wählen', 'Apfelmus (ohne Foto)', 'Braten (5 Fotos)', 'Zwetschgenkuchen (3 Fotos)']);
    });

    test('sagt, mit welchem Format das Rezept druckt, und kennzeichnet dessen Karte', async () => {
      await renderLoaded({ allRecipes: recipes });
      expect(screen.queryByText('Druckt das gewählte Rezept')).toBeNull();
      fireEvent.change(screen.getByLabelText('Prüfen mit Rezept'), { target: { value: 'r0' } });
      expect(screen.getByRole('status')).toHaveTextContent('druckt mit Karte.');
      expect(within(card('Karte')).getByText('Druckt das gewählte Rezept')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Prüfen mit Rezept'), { target: { value: 'r5' } });
      expect(screen.getByRole('status')).toHaveTextContent('druckt mit Standard.');
      expect(within(card('Standard')).getByText('Druckt das gewählte Rezept')).toBeInTheDocument();
      expect(within(card('Karte')).queryByText('Druckt das gewählte Rezept')).toBeNull();
    });

    test('das gewählte Rezept ist im Editor das Rezept der Vorschau', async () => {
      await renderLoaded({ allRecipes: recipes });
      fireEvent.change(screen.getByLabelText('Prüfen mit Rezept'), { target: { value: 'r3' } });
      openEditor('Klassisch');
      expect(within(editor()).getByText('vorschau Zwetschgenkuchen')).toBeInTheDocument();
      expect(within(editor()).getByLabelText('Vorschau mit')).toHaveValue('r3');
    });
  });
});

describe('Bearbeiten', () => {
  test('öffnet genau ein Format im Vollfenster', async () => {
    await renderLoaded();
    openEditor('Klassisch');
    expect(within(editor()).getByLabelText('Name')).toHaveValue('Klassisch');
    expect(within(editor()).getByText('vorlage classic')).toBeInTheDocument();
    expect(screen.getAllByTestId('template-editor')).toHaveLength(1);
  });

  test('„Speichern“ schreibt das geänderte Format an seinem Platz und zeigt, was gespeichert ist', async () => {
    await renderLoaded();
    openEditor('Klassisch');
    expect(saveButton()).toBeDisabled();
    fireEvent.change(within(editor()).getByLabelText('Name'), { target: { value: 'Klassisch neu' } });
    fireEvent.click(within(editor()).getByText('auf schlicht'));
    expect(within(editor()).getByRole('status')).toHaveTextContent('Ungespeichert');
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    expect(savePrintFormats).toHaveBeenCalledTimes(1);
    expect(savePrintFormats.mock.calls[0][0].map((f) => [f.id, f.name, f.template])).toEqual([
      ['karte', 'Karte', 'card'], ['klassisch', 'Klassisch neu', 'minimal'], ['standard', 'Standard', 'photo'],
    ]);
    expect(loadPrintFormatsForEditing).toHaveBeenCalledTimes(2); // beim Öffnen und nach dem Speichern
    expect(saveButton()).toBeDisabled();
    back();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(names()).toEqual(['Karte', 'Klassisch neu', 'Standard']);
    expect(within(card('Klassisch neu')).getByText('Vorlage Schlicht · A4 hoch')).toBeInTheDocument();
  });

  test('scheitert das Speichern, bleibt der Entwurf im Editor und die Übersicht beim alten Stand', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderLoaded();
    openEditor('Karte');
    fireEvent.change(within(editor()).getByLabelText('Name'), { target: { value: 'Karte neu' } });
    savePrintFormats.mockRejectedValueOnce(new Error('permission-denied'));
    fireEvent.click(saveButton());
    expect(await within(editor()).findByText(/konnte nicht gespeichert werden.*permission-denied/)).toBeInTheDocument();
    expect(within(editor()).getByLabelText('Name')).toHaveValue('Karte neu');
    expect(saveButton()).toBeEnabled();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    // zweiter Versuch gelingt
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    expect(stored().map((f) => f.name)).toEqual(['Karte neu', 'Klassisch', 'Standard']);
    console.error.mockRestore();
  });

  test('zurück ohne Speichern verwirft nach Rückfrage und speichert nichts', async () => {
    await renderLoaded();
    openEditor('Karte');
    fireEvent.change(within(editor()).getByLabelText('Name'), { target: { value: 'Verworfen' } });
    back();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Verwerfen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(savePrintFormats).not.toHaveBeenCalled();
  });
});

describe('Neues Format und Duplizieren', () => {
  test('„Neues Format“ öffnet einen Entwurf mit der Vorlage „Klassisch“ und einer freien Fotoanzahl', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Neues Format/ }));
    expect(within(editor()).getByLabelText('Name')).toHaveValue('Neues Format');
    expect(within(editor()).getByText('vorlage classic')).toBeInTheDocument();
    expect(within(editor()).getByLabelText('Höchste Fotoanzahl')).toHaveValue(2);
    expect(within(editor()).getByText('Dieses Format druckt Rezepte mit 2 Fotos.')).toBeInTheDocument();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(savePrintFormats).not.toHaveBeenCalled();
  });

  test('ein unveränderter neuer Entwurf verschwindet beim Zurückgehen ohne Rückfrage', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Neues Format/ }));
    back();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(savePrintFormats).not.toHaveBeenCalled();
  });

  test('„Speichern“ legt das neue Format am Ende der Liste an', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Neues Format/ }));
    fireEvent.change(within(editor()).getByLabelText('Name'), { target: { value: 'Ohne Foto' } });
    fireEvent.change(within(editor()).getByLabelText('Höchste Fotoanzahl'), { target: { value: '0' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    expect(stored().map((f) => [f.name, f.maxPhotos])).toEqual([['Karte', 1], ['Klassisch', 3], ['Standard', null], ['Ohne Foto', 0]]);
    expect(stored()[3].id).toMatch(/^fmt-/);
    back();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard', 'Ohne Foto']);
    expect(within(card('Ohne Foto')).getByText('Für Rezepte ohne Foto')).toBeInTheDocument();
    expect(within(card('Karte')).getByText('Für Rezepte mit 1 Foto')).toBeInTheDocument();
  });

  test('jedes neue Format bekommt eine eigene ID', async () => {
    await renderLoaded();
    for (const name of ['Eins', 'Zwei']) {
      fireEvent.click(screen.getByRole('button', { name: /Neues Format/ }));
      fireEvent.change(within(editor()).getByLabelText('Name'), { target: { value: name } });
      fireEvent.click(saveButton());
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
      back();
    }
    const ids = stored().map((f) => f.id);
    expect(new Set(ids).size).toBe(5);
    expect(stored().slice(3).map((f) => f.maxPhotos)).toEqual([2, 4]);
  });

  test('„Duplizieren“ öffnet eine Kopie als Entwurf; gespeichert wird erst mit „Speichern“', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Karte duplizieren' }));
    expect(within(editor()).getByLabelText('Name')).toHaveValue('Karte Kopie');
    expect(within(editor()).getByText('vorlage card')).toBeInTheDocument();
    expect(within(editor()).getByLabelText('Höchste Fotoanzahl')).toHaveValue(2);
    expect(savePrintFormats).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    back();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard', 'Karte Kopie']);
    expect(stored()[3]).toMatchObject({ name: 'Karte Kopie', template: 'card', maxPhotos: 2 });
    expect(stored()[3].id).not.toBe('karte');
    expect(stored()[0]).toMatchObject({ id: 'karte', name: 'Karte', maxPhotos: 1 });
  });

  test('die Kopie eines umgestellten Formats trägt den Hinweis nicht', async () => {
    await renderLoaded({}, [converted('alt', 'Altes Layout', null)]);
    fireEvent.click(screen.getByRole('button', { name: 'Altes Layout duplizieren' }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    expect(stored().every((f) => f.migrationNotes === undefined)).toBe(true);
  });
});

describe('Entfernen mit Rückgängig', () => {
  test('nutzt den gemeinsamen DeleteRowButton mit Namen', async () => {
    await renderLoaded();
    const button = within(card('Karte')).getByRole('button', { name: 'Karte entfernen' });
    expect(button).toHaveClass('delete-row-button');
    expect(button).toHaveAttribute('title', 'Karte entfernen');
  });

  test('wirkt sofort und ohne Rückfrage: Karte weg, gespeichert, Hinweis mit „Rückgängig“', async () => {
    const confirm = jest.spyOn(window, 'confirm');
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Klassisch entfernen' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(names()).toEqual(['Karte', 'Standard']);
    expect(screen.getByText('„Klassisch“ entfernt')).toBeInTheDocument();
    // die Regeln der übrigen Formate gelten sofort neu
    expect(within(card('Standard')).getByText('Für alle übrigen Rezepte')).toBeInTheDocument();
    await waitFor(() => expect(stored().map((f) => f.name)).toEqual(['Karte', 'Standard']));
    confirm.mockRestore();
  });

  test('„Rückgängig“ stellt das Format an seinem alten Platz wieder her und speichert das', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Klassisch entfernen' }));
    await waitFor(() => expect(stored()).toHaveLength(2));
    fireEvent.click(screen.getByText('Rückgängig'));
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(screen.queryByText('Rückgängig')).toBeNull();
    await waitFor(() => expect(stored().map((f) => [f.id, f.maxPhotos])).toEqual([['karte', 1], ['klassisch', 3], ['standard', null]]));
  });

  test('hat inzwischen ein anderes Format dieselbe Fotoanzahl, kommt es ohne Regel zurück', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Klassisch entfernen' }));
    await waitFor(() => expect(stored()).toHaveLength(2));
    openEditor('Karte');
    fireEvent.change(within(editor()).getByLabelText('Höchste Fotoanzahl'), { target: { value: '3' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    back();
    fireEvent.click(screen.getByText('Rückgängig'));
    await waitFor(() => expect(stored().map((f) => [f.id, f.maxPhotos])).toEqual([['karte', 3], ['klassisch', null], ['standard', null]]));
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
  });

  test('nach 6 Sekunden verschwindet der Hinweis, das Format bleibt entfernt', async () => {
    jest.useFakeTimers();
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Karte entfernen' }));
    await settle();
    act(() => { jest.advanceTimersByTime(6000); });
    expect(screen.queryByText('Rückgängig')).toBeNull();
    expect(names()).toEqual(['Klassisch', 'Standard']);
    expect(stored().map((f) => f.name)).toEqual(['Klassisch', 'Standard']);
    expect(savePrintFormats).toHaveBeenCalledTimes(1);
  });

  test('scheitert das Entfernen, steht das Format wieder da und eine Meldung sagt es', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderLoaded();
    savePrintFormats.mockRejectedValueOnce(new Error('unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Karte entfernen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('„Karte“ konnte nicht entfernt werden. Fehler beim Speichern: unavailable');
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    // „Rückgängig“ legt es dann nicht doppelt an
    fireEvent.click(screen.getByText('Rückgängig'));
    await settle();
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(savePrintFormats).toHaveBeenCalledTimes(1);
    console.error.mockRestore();
  });

  test('das einzige Format für alle übrigen Rezepte lässt sich nicht entfernen', async () => {
    await renderLoaded();
    const button = screen.getByRole('button', { name: 'Standard entfernen' });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute('title', expect.stringContaining('Ein solches Format muss es geben'));
    fireEvent.click(button);
    expect(names()).toEqual(['Karte', 'Klassisch', 'Standard']);
    expect(savePrintFormats).not.toHaveBeenCalled();
  });

  test('gibt es zwei Formate ohne Regel, lässt sich eines entfernen, danach das letzte nicht mehr', async () => {
    await renderLoaded({}, [fmt('a', 'A', null), fmt('b', 'B', null)]);
    expect(screen.getByRole('button', { name: 'A entfernen' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'A entfernen' }));
    expect(screen.getByRole('button', { name: 'B entfernen' })).toBeDisabled();
    await waitFor(() => expect(stored()).toHaveLength(1));
  });

  test('ein einziges Format lässt sich nicht entfernen', async () => {
    await renderLoaded({}, [fmt('a', 'A', null)]);
    const button = screen.getByRole('button', { name: 'A entfernen' });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute('title', 'Es muss mindestens ein Druckformat geben.');
  });
});

describe('Speichern der Reihe nach', () => {
  test('ein zweites Speichern wartet auf das erste und schreibt den neueren Stand', async () => {
    await renderLoaded({}, [fmt('a', 'A', 1), fmt('b', 'B', 2), fmt('c', 'C', null)]);
    const resolvers = [];
    savePrintFormats.mockImplementation((formats) => new Promise((resolve) => {
      resolvers.push(() => { store = { formats, usingDefaults: false }; resolve(); });
    }));
    fireEvent.click(screen.getByRole('button', { name: 'A entfernen' }));
    fireEvent.click(screen.getByRole('button', { name: 'B entfernen' }));
    await settle();
    expect(savePrintFormats).toHaveBeenCalledTimes(1);
    expect(savePrintFormats.mock.calls[0][0].map((f) => f.id)).toEqual(['b', 'c']);
    await act(async () => { resolvers[0](); });
    await waitFor(() => expect(savePrintFormats).toHaveBeenCalledTimes(2));
    expect(savePrintFormats.mock.calls[1][0].map((f) => f.id)).toEqual(['c']);
    // das Zwischenergebnis des ersten Speicherns holt B nicht zurück in die Anzeige
    expect(names()).toEqual(['C']);
    await act(async () => { resolvers[1](); });
    await waitFor(() => expect(stored().map((f) => f.id)).toEqual(['c']));
    expect(names()).toEqual(['C']);
  });

  test('speichert zu Ende, auch wenn der Reiter inzwischen verlassen wurde', async () => {
    const { unmount } = await renderLoaded();
    let finish;
    savePrintFormats.mockImplementation((formats) => new Promise((resolve) => {
      finish = () => { store = { formats, usingDefaults: false }; resolve(); };
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Karte entfernen' }));
    await settle();
    unmount();
    await act(async () => { finish(); });
    await settle();
    expect(stored().map((f) => f.name)).toEqual(['Klassisch', 'Standard']);
  });
});

describe('Umgestellte und korrigierte Formate', () => {
  const hint = /war ein freies Layout und wurde auf die Vorlage „Klassisch“ umgestellt/;

  test('Vorlagen-Formate zeigen keinen Hinweis', async () => {
    await renderLoaded();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByRole('button', { name: /Jetzt speichern/ })).toBeNull();
  });

  test('ein aus dem freien Layout umgestelltes Format trägt einen Hinweis, nur an seiner Karte', async () => {
    await renderLoaded({}, [fmt('karte', 'Karte', 1, 'card'), converted('alt', 'Altes Layout', null)]);
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(within(card('Altes Layout')).getByText('Aus einem freien Layout umgestellt, bitte prüfen.')).toBeInTheDocument();
    expect(within(card('Karte')).queryByText(/umgestellt/)).toBeNull();
    expect(within(card('Altes Layout')).getByText('Vorlage Klassisch · A4 hoch')).toBeInTheDocument();
  });

  test('„Jetzt speichern“ übernimmt die Umstellung; danach ist der Hinweis weg', async () => {
    const old = converted('alt', 'Altes Layout', null);
    await renderLoaded({}, [old]);
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt speichern' }));
    await waitFor(() => expect(screen.queryByText(hint)).toBeNull());
    expect(savePrintFormats).toHaveBeenCalledTimes(1);
    expect(savePrintFormats.mock.calls[0][0]).toEqual([old]);
    expect(stored()[0].migrationNotes).toBeUndefined();
    expect(screen.queryByRole('button', { name: /Jetzt speichern/ })).toBeNull();
  });

  test('ein umgestelltes Format lässt sich im Editor ohne weitere Änderung speichern', async () => {
    await renderLoaded({}, [converted('alt', 'Altes Layout', null)]);
    openEditor('Altes Layout');
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(editor()).getByRole('status')).toHaveTextContent('Gespeichert'));
    back();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText(hint)).toBeNull();
  });

  test('eine gespeicherte Liste, die nicht zusammenpasst, wird korrigiert angezeigt und lässt sich so speichern', async () => {
    await renderLoaded({}, [fmt('a', 'A', 2), fmt('b', 'B', 2), fmt('c', '', 5)]);
    const notice = screen.getByRole('note');
    expect(notice).toHaveTextContent('Die gespeicherten Formate passten nicht zusammen und wurden korrigiert');
    expect(within(notice).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '„B“ hatte dieselbe Fotoanzahl (2) wie ein anderes Format und hat jetzt keine Regel mehr.',
      'Das 3. Format hatte keinen Namen und heißt jetzt „Format 3“.',
    ]);
    expect(names()).toEqual(['A', 'B', 'Format 3']);
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt speichern' }));
    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
    expect(stored().map((f) => [f.name, f.maxPhotos])).toEqual([['A', 2], ['B', null], ['Format 3', 5]]);
  });

  test('scheitert „Jetzt speichern“, bleibt der Hinweis und eine Meldung erscheint', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderLoaded({}, [converted('alt', 'Altes Layout', null)]);
    savePrintFormats.mockRejectedValueOnce(new Error('unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Druckformate konnten nicht gespeichert werden. Fehler beim Speichern: unavailable');
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jetzt speichern' })).toBeEnabled();
    console.error.mockRestore();
  });
});
