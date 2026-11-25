import React from 'react';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils';
import PrintFormatScreen from './PrintFormatScreen';
import { createFlowFormat, migrateFormat } from '../../utils/print/printFormats';

// Der Vorlagen-Editor hat eigene Tests; hier geht es um Leiste, Regel, Speichern und Schließen.
jest.mock('./TemplateFormatEditor', () => function FakeTemplateEditor({ format, onChange, previewRecipe, authorName }) {
  return (
    <div data-testid="template-editor">
      <span>vorlage {format.template}</span>
      <button type="button" onClick={() => onChange({ ...format, template: 'minimal' })}>auf schlicht</button>
      {previewRecipe && <span>vorschau {previewRecipe.title} von {authorName}</span>}
    </div>
  );
});

const fmt = (id, name, maxPhotos, template = 'classic') => ({ ...createFlowFormat(template), id, name, maxPhotos });
const KARTE = fmt('karte', 'Karte', 1, 'card');
const KLASSISCH = fmt('klassisch', 'Klassisch', 3);
const STANDARD = fmt('standard', 'Standard', null);
const ALL = [KARTE, KLASSISCH, STANDARD];

function renderScreen(props = {}) {
  const onSave = jest.fn(async (format) => format);
  const onClose = jest.fn();
  const onPreviewRecipeChange = jest.fn();
  const utils = renderWithProviders(
    <PrintFormatScreen
      format={KLASSISCH}
      formats={ALL}
      onSave={onSave}
      onClose={onClose}
      onPreviewRecipeChange={onPreviewRecipeChange}
      {...props}
    />,
  );
  return { ...utils, onSave, onClose, onPreviewRecipeChange };
}

const nameInput = () => screen.getByLabelText('Name');
const ruleSelect = () => screen.getByLabelText('Gilt für');
const limitInput = () => screen.getByLabelText('Höchste Fotoanzahl');
const saveButton = () => screen.getByRole('button', { name: /^Speicher/ });
const backButton = () => screen.getByRole('button', { name: 'Zurück zu den Druckformaten' });
const status = () => within(screen.getByRole('dialog')).queryAllByRole('status').map((el) => el.textContent);
const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('Fenster', () => {
  test('liegt als Dialog über der Seite und sperrt das Scrollen dahinter', () => {
    const { unmount } = renderScreen();
    const dialog = screen.getByRole('dialog', { name: 'Druckformat bearbeiten' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement).toBe(document.body);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  test('schaltet die App dahinter für Tastatur und Screenreader ab, solange es offen ist', () => {
    const app = document.createElement('div');
    app.id = 'root';
    document.body.appendChild(app);
    const { unmount } = renderScreen();
    expect(app).toHaveAttribute('inert');
    expect(app.contains(screen.getByRole('dialog'))).toBe(false);
    unmount();
    expect(app).not.toHaveAttribute('inert');
    app.remove();
  });

  test('ein vorhandenes Format bekommt den Fokus am Fenster, ein neues im Namensfeld', () => {
    const first = renderScreen();
    expect(screen.getByRole('dialog')).toHaveFocus();
    first.unmount();
    renderScreen({ format: fmt('neu', 'Neues Format', 2), isNew: true });
    expect(nameInput()).toHaveFocus();
  });

  test('gibt den Fokus beim Schließen an den Knopf zurück, der es geöffnet hat', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = renderScreen();
    expect(opener).not.toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  test('zeigt den Vorlagen-Editor für genau dieses Format', () => {
    renderScreen();
    expect(nameInput()).toHaveValue('Klassisch');
    expect(screen.getByText('vorlage classic')).toBeInTheDocument();
  });
});

describe('Regel in Klartext', () => {
  test('zeigt Fotoanzahl und was daraus mit den anderen Formaten wird', () => {
    renderScreen();
    expect(ruleSelect()).toHaveValue('limit');
    expect(limitInput()).toHaveValue(3);
    expect(screen.getByText('Dieses Format druckt Rezepte mit 2 bis 3 Fotos.')).toBeInTheDocument();
  });

  test('rechnet den Bereich bei jeder Eingabe neu', () => {
    renderScreen();
    fireEvent.change(limitInput(), { target: { value: '5' } });
    expect(screen.getByText('Dieses Format druckt Rezepte mit 2 bis 5 Fotos.')).toBeInTheDocument();
    fireEvent.change(limitInput(), { target: { value: '0' } });
    expect(screen.getByText('Dieses Format druckt Rezepte ohne Foto.')).toBeInTheDocument();
    fireEvent.change(limitInput(), { target: { value: '2' } });
    expect(screen.getByText('Dieses Format druckt Rezepte mit 2 Fotos.')).toBeInTheDocument();
  });

  test('gibt es nur dieses eine Format, erscheint keine Regel', () => {
    renderScreen({ format: STANDARD, formats: [STANDARD] });
    expect(screen.queryByLabelText('Gilt für')).toBeNull();
    expect(screen.queryByText(/Dieses Format druckt/)).toBeNull();
  });

  test('dieselbe Fotoanzahl wie ein anderes Format ist ein Fehler, egal welches zuerst in der Liste steht', () => {
    renderScreen();
    fireEvent.change(limitInput(), { target: { value: '1' } }); // „Karte“ steht davor
    expect(screen.getByRole('alert')).toHaveTextContent('Die Fotoanzahl 1 ist bereits bei „Karte“ vergeben.');
    expect(saveButton()).toBeDisabled();
    expect(status()).toEqual(['Eingabe prüfen']);
    expect(limitInput()).toHaveAttribute('aria-invalid', 'true');
  });

  test('… auch wenn das andere Format dahinter steht', () => {
    renderScreen({ format: KARTE });
    fireEvent.change(limitInput(), { target: { value: '3' } }); // „Klassisch“ steht dahinter
    expect(screen.getByRole('alert')).toHaveTextContent('Die Fotoanzahl 3 ist bereits bei „Klassisch“ vergeben.');
    expect(saveButton()).toBeDisabled();
  });

  test.each(['', '-1', '2.5', 'abc'])('die Eingabe „%s“ ist keine Fotoanzahl', (value) => {
    renderScreen();
    fireEvent.change(nameInput(), { target: { value: 'Geändert' } });
    fireEvent.change(limitInput(), { target: { value } });
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte eine ganze Zahl ab 0 eingeben.');
    expect(saveButton()).toBeDisabled();
  });

  test('„alle übrigen Rezepte“ nimmt die Fotoanzahl weg; zurück gibt es die nächste freie', () => {
    renderScreen({ format: KARTE, formats: [KARTE, KLASSISCH, STANDARD, fmt('zwei', 'Zwei', 2)] });
    fireEvent.change(ruleSelect(), { target: { value: 'rest' } });
    expect(screen.queryByLabelText('Höchste Fotoanzahl')).toBeNull();
    fireEvent.change(ruleSelect(), { target: { value: 'limit' } });
    expect(limitInput()).toHaveValue(1); // 2 und 3 sind vergeben, 1 ist durch den Wechsel frei geworden
  });

  test('ein zweites Format für alle übrigen Rezepte würde nicht verwendet: Das sagt die Zeile', () => {
    const letztes = fmt('letztes', 'Letztes', 5);
    renderScreen({ format: letztes, formats: [...ALL, letztes] }); // steht hinter „Standard“
    fireEvent.change(ruleSelect(), { target: { value: 'rest' } });
    expect(screen.getByText('Wird so nicht verwendet: „Standard“ gilt bereits für dieselben Rezepte.')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled(); // erlaubt, aber sichtbar unbenutzt
  });

  test('steht das Format vor dem anderen in der Liste, verdrängt es dieses, und die Zeile nennt es', () => {
    renderScreen(); // „Klassisch“ steht vor „Standard“
    fireEvent.change(ruleSelect(), { target: { value: 'rest' } });
    expect(screen.getByText('Dieses Format druckt Rezepte ab 2 Fotos. „Standard“ wird dadurch nicht mehr verwendet.')).toBeInTheDocument();
  });

  test('ohne Verdrängung steht dort nur der Bereich', () => {
    renderScreen();
    expect(screen.queryByText(/nicht mehr verwendet/)).toBeNull();
  });

  test('das einzige Format für alle übrigen Rezepte kann seine Regel nicht wechseln', () => {
    renderScreen({ format: STANDARD });
    expect(ruleSelect()).toBeDisabled();
    expect(ruleSelect()).toHaveValue('rest');
    expect(screen.getByText(/Dieses Format druckt Rezepte ab 4 Fotos\. Ein Format muss für alle übrigen Rezepte gelten/)).toBeInTheDocument();
  });

  test('gibt es noch ein Format für den Rest, ist der Wechsel frei', () => {
    renderScreen({ format: STANDARD, formats: [KARTE, STANDARD, fmt('kopie', 'Kopie', null)] });
    expect(ruleSelect()).toBeEnabled();
    fireEvent.change(ruleSelect(), { target: { value: 'limit' } });
    expect(limitInput()).toHaveValue(2);
  });
});

describe('Name', () => {
  test('ein leerer Name ist ein Fehler am Feld und sperrt das Speichern', () => {
    renderScreen();
    fireEvent.change(nameInput(), { target: { value: '  ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Der Formatname darf nicht leer sein.');
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toBeDisabled();
  });
});

describe('Speichern', () => {
  test('ist gesperrt, solange nichts geändert ist, und zeigt dann „Ungespeichert“', () => {
    renderScreen();
    expect(saveButton()).toBeDisabled();
    expect(status()).toEqual([]);
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    expect(saveButton()).toBeEnabled();
    expect(status()).toEqual(['Ungespeichert']);
  });

  test('übergibt den Entwurf und übernimmt, was gespeichert wurde', async () => {
    const onSave = jest.fn(async (format) => ({ ...format, name: `${format.name} (gespeichert)` }));
    renderScreen({ onSave });
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    fireEvent.change(limitInput(), { target: { value: '4' } });
    fireEvent.click(screen.getByText('auf schlicht'));
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'klassisch', name: 'Neu', maxPhotos: 4, template: 'minimal' }));
    await waitFor(() => expect(status()).toEqual(['Gespeichert']));
    expect(nameInput()).toHaveValue('Neu (gespeichert)');
    expect(saveButton()).toBeDisabled();
    // die nächste Änderung zählt gegen den gespeicherten Stand
    fireEvent.change(nameInput(), { target: { value: 'Noch einmal' } });
    expect(status()).toEqual(['Ungespeichert']);
  });

  test('sperrt den Knopf, solange gespeichert wird', async () => {
    let finish;
    const onSave = jest.fn((format) => new Promise((resolve) => { finish = () => resolve(format); }));
    renderScreen({ onSave });
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    fireEvent.click(saveButton());
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveTextContent('Speichert …');
    expect(backButton()).toBeDisabled();
    await act(async () => { finish(); });
    expect(saveButton()).toHaveTextContent('Speichern');
  });

  test('wird beim Speichern weitergearbeitet, bleibt die neuere Eingabe stehen und gilt als ungespeichert', async () => {
    let finish;
    const onSave = jest.fn((format) => new Promise((resolve) => { finish = () => resolve(format); }));
    renderScreen({ onSave });
    fireEvent.change(nameInput(), { target: { value: 'Erster' } });
    fireEvent.click(saveButton());
    fireEvent.change(nameInput(), { target: { value: 'Zweiter' } });
    await act(async () => { finish(); });
    expect(nameInput()).toHaveValue('Zweiter');
    expect(status()).toEqual(['Ungespeichert']);
    expect(saveButton()).toBeEnabled();
  });

  test('zeigt den Fehler und behält die Eingaben', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('permission-denied'));
    renderScreen({ onSave });
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Format konnte nicht gespeichert werden: permission-denied');
    expect(nameInput()).toHaveValue('Neu');
    expect(saveButton()).toBeEnabled();
    // die Meldung verschwindet mit der nächsten Eingabe
    fireEvent.change(nameInput(), { target: { value: 'Neu 2' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('ein neues Format lässt sich ohne Änderung speichern', async () => {
    const neu = fmt('neu', 'Neues Format', 2);
    const { onSave } = renderScreen({ format: neu, isNew: true });
    expect(status()).toEqual(['Ungespeichert']);
    expect(screen.getByText('Dieses Format druckt Rezepte mit 2 Fotos.')).toBeInTheDocument();
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(neu);
    await waitFor(() => expect(status()).toEqual(['Gespeichert']));
  });

  test('ein aus dem freien Layout umgestelltes Format ebenso', () => {
    const old = migrateFormat({ id: 'alt', name: 'Alt', maxPhotos: 5, layoutVersion: 3, elements: [{ id: 'title', x: 1, y: 1, w: 50, h: 9 }] });
    renderScreen({ format: old, formats: [old, STANDARD] });
    expect(saveButton()).toBeEnabled();
    expect(status()).toEqual(['Ungespeichert']);
  });
});

describe('Zurück', () => {
  test('ohne Änderung schließt sofort', () => {
    const { onClose } = renderScreen();
    fireEvent.click(backButton());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('mit Änderungen fragt nach; „Abbrechen“ bleibt, „Verwerfen“ schließt', () => {
    const { onClose } = renderScreen();
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    fireEvent.click(backButton());
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Änderungen verwerfen?');
    expect(dialog).toHaveTextContent('Die Änderungen an „Neu“ sind noch nicht gespeichert und gehen verloren.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue('Neu');
    fireEvent.click(backButton());
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Verwerfen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('ein neues Format schließt unverändert ohne Rückfrage, verändert mit', () => {
    const { onClose } = renderScreen({ format: fmt('neu', 'Neues Format', 2), isNew: true });
    fireEvent.click(backButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.change(nameInput(), { target: { value: 'Angefangen' } });
    fireEvent.click(backButton());
    expect(screen.getByRole('alertdialog')).toHaveTextContent('„Angefangen“ ist noch nicht gespeichert und geht verloren.');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('die Rückfrage kommt auch ohne Namen aus', () => {
    renderScreen();
    fireEvent.change(nameInput(), { target: { value: ' ' } });
    fireEvent.click(backButton());
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Die Änderungen sind noch nicht gespeichert und gehen verloren.');
  });

  test('nach dem Speichern schließt es wieder ohne Rückfrage', async () => {
    const { onClose } = renderScreen();
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toEqual(['Gespeichert']));
    fireEvent.click(backButton());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('warnt vor dem Schließen des Fensters nur bei ungespeicherten Änderungen', async () => {
    const { unmount } = renderScreen();
    expect(unload()).toBe(false);
    fireEvent.change(nameInput(), { target: { value: 'Neu' } });
    expect(unload()).toBe(true);
    fireEvent.click(saveButton());
    await waitFor(() => expect(status()).toEqual(['Gespeichert']));
    expect(unload()).toBe(false);
    fireEvent.change(nameInput(), { target: { value: 'Wieder' } });
    unmount();
    expect(unload()).toBe(false);
  });
});

describe('Vorschau mit Rezept', () => {
  const recipes = [
    { id: 'r3', title: 'Zwetschgenkuchen', authorId: 'u1', images: [{ url: 'a' }, { url: 'b' }, { url: 'c' }] },
    { id: 'r0', title: 'Apfelmus', authorId: 'u2' },
  ];
  const users = [{ id: 'u1', vorname: 'Mara' }, { id: 'u2', vorname: 'Jo' }];

  test('ohne Rezepte gibt es keine Auswahl', () => {
    renderScreen();
    expect(screen.queryByLabelText('Vorschau mit')).toBeNull();
  });

  test('bietet das Beispielrezept und die Rezepte nach Titel mit Fotoanzahl', () => {
    const { onPreviewRecipeChange } = renderScreen({ recipes, users });
    const select = screen.getByLabelText('Vorschau mit');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Beispielrezept', 'Apfelmus (ohne Foto)', 'Zwetschgenkuchen (3 Fotos)',
    ]);
    expect(select).toHaveValue('');
    expect(screen.queryByText(/^vorschau/)).toBeNull();
    fireEvent.change(select, { target: { value: 'r0' } });
    expect(onPreviewRecipeChange).toHaveBeenCalledWith('r0');
  });

  test('gibt Rezept und Autor an den Editor und sagt, ob es mit diesem Format druckt', () => {
    const { rerender } = renderScreen({ recipes, users, previewRecipeId: 'r3' });
    expect(screen.getByText('vorschau Zwetschgenkuchen von Mara')).toBeInTheDocument();
    expect(screen.getByText('Dieses Rezept druckt mit diesem Format.')).toBeInTheDocument();
    rerender(
      <PrintFormatScreen format={KLASSISCH} formats={ALL} recipes={recipes} users={users} previewRecipeId="r0" onSave={jest.fn()} onClose={jest.fn()} onPreviewRecipeChange={jest.fn()} />,
    );
    expect(screen.getByText('vorschau Apfelmus von Jo')).toBeInTheDocument();
    expect(screen.getByText('Dieses Rezept druckt mit „Karte“, nicht mit diesem Format.')).toBeInTheDocument();
  });

  test('der Hinweis folgt der noch nicht gespeicherten Regel', () => {
    renderScreen({ recipes, users, previewRecipeId: 'r3' });
    fireEvent.change(limitInput(), { target: { value: '2' } });
    expect(screen.getByText('Dieses Rezept druckt mit „Standard“, nicht mit diesem Format.')).toBeInTheDocument();
  });

  test('ein Rezept, das es nicht mehr gibt, fällt auf das Beispielrezept zurück', () => {
    renderScreen({ recipes, users, previewRecipeId: 'weg' });
    expect(screen.getByLabelText('Vorschau mit')).toHaveValue('');
    expect(screen.queryByText(/^vorschau/)).toBeNull();
  });
});
