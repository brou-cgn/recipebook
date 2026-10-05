import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import PrintFormatsSettings from './PrintFormatsSettings';
import { createPrintFormat, createFlowFormat } from '../utils/printFormats';

jest.mock('../utils/customLists', () => {
  const actual = jest.requireActual('../utils/customLists');
  return { ...actual, loadPrintFormatsForEditing: jest.fn(), savePrintFormats: jest.fn() };
});
// The editor has its own tests; keep this suite about list management.
jest.mock('./PrintFormatEditor', () => function FakeEditor({ format, onChange, previewRecipe }) {
  return (
    <div data-testid="editor">
      <button type="button" onClick={() => onChange({ ...format, fontFamily: 'Arial, sans-serif' })}>edit {format.name}</button>
      {previewRecipe && <span>preview {previewRecipe.title}</span>}
    </div>
  );
});

jest.mock('./TemplateFormatEditor', () => function FakeTemplateEditor({ format, onChange }) {
  return (
    <div data-testid="template-editor">
      <span>template {format.template}</span>
      <button type="button" onClick={() => onChange({ ...format, template: 'minimal' })}>template edit {format.name}</button>
    </div>
  );
});

const { loadPrintFormatsForEditing, savePrintFormats } = require('../utils/customLists');

const fmt = (id, name, maxPhotos) => ({ ...createPrintFormat(), id, name, maxPhotos });
const stored = () => [fmt('one', 'Ein Foto', 1), fmt('all', 'Standard', null)];

async function renderLoaded(props = {}, formats = stored()) {
  loadPrintFormatsForEditing.mockResolvedValue({ formats, usingDefaults: false });
  const utils = render(<PrintFormatsSettings {...props} />);
  await screen.findAllByTestId('print-format-item');
  return utils;
}

const items = () => screen.getAllByTestId('print-format-item');
const names = () => items().map((i) => within(i).getByLabelText('Formatname').value);
const saveButton = () => screen.getByRole('button', { name: /Druckformate speichern|Speichern\.\.\./ });

beforeEach(() => {
  jest.useFakeTimers();
  loadPrintFormatsForEditing.mockReset();
  savePrintFormats.mockReset();
  savePrintFormats.mockResolvedValue(undefined);
});
afterEach(() => { jest.useRealTimers(); });

describe('loading', () => {
  test('shows the stored formats', async () => {
    await renderLoaded();
    expect(names()).toEqual(['Ein Foto', 'Standard']);
    expect(screen.queryByText(/noch keine Druckformate gespeichert/)).toBeNull();
  });

  test('hints when only the defaults are shown', async () => {
    loadPrintFormatsForEditing.mockResolvedValue({ formats: [fmt('all', 'Standard', null)], usingDefaults: true });
    render(<PrintFormatsSettings />);
    expect(await screen.findByText(/noch keine Druckformate gespeichert/)).toBeInTheDocument();
  });

  test('a failed load shows an error, offers a retry and offers no way to save', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    loadPrintFormatsForEditing.mockRejectedValueOnce(new Error('offline'));
    render(<PrintFormatsSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern ist gesperrt');
    expect(screen.queryByRole('button', { name: /Druckformate speichern/ })).toBeNull();
    loadPrintFormatsForEditing.mockResolvedValueOnce({ formats: stored(), usingDefaults: false });
    fireEvent.click(screen.getByText('Erneut laden'));
    expect(await screen.findAllByTestId('print-format-item')).toHaveLength(2);
    console.error.mockRestore();
  });
});

describe('layout types', () => {
  const flowFmt = (id, name, maxPhotos) => ({ ...createFlowFormat('card'), id, name, maxPhotos });

  test('template formats use the template editor, free formats the positioning editor with an expert hint', async () => {
    await renderLoaded({}, [flowFmt('f', 'Vorlage', 1), fmt('all', 'Frei', null)]);
    expect(within(items()[0]).getByTestId('template-editor')).toBeInTheDocument();
    expect(within(items()[0]).queryByTestId('editor')).toBeNull();
    expect(within(items()[0]).queryByText(/Expertenmodus/)).toBeNull();
    expect(within(items()[1]).getByTestId('editor')).toBeInTheDocument();
    expect(within(items()[1]).getByText(/Expertenmodus/)).toBeInTheDocument();
  });

  test('a new format is template based (classic)', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByText('+ Neues Format hinzufügen'));
    const last = items()[items().length - 1];
    expect(within(last).getByText('template classic')).toBeInTheDocument();
  });

  test('switching a free layout to a template asks first and keeps name, limit and page', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderLoaded();
    fireEvent.click(within(items()[0]).getByText('Auf Vorlage umstellen'));
    expect(within(items()[0]).getByTestId('editor')).toBeInTheDocument(); // cancelled
    fireEvent.click(within(items()[0]).getByText('Auf Vorlage umstellen'));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(within(items()[0]).getByTestId('template-editor')).toBeInTheDocument();
    expect(within(items()[0]).getByLabelText('Formatname')).toHaveValue('Ein Foto');
    expect(within(items()[0]).getByLabelText('Maximale Fotoanzahl:')).toHaveValue(1);
  });

  test('template edits are saved with the formats', async () => {
    await renderLoaded({}, [flowFmt('f', 'Vorlage', null)]);
    fireEvent.click(screen.getByText('template edit Vorlage'));
    loadPrintFormatsForEditing.mockResolvedValue({ formats: [flowFmt('f', 'Vorlage', null)], usingDefaults: false });
    fireEvent.click(saveButton());
    await waitFor(() => expect(savePrintFormats).toHaveBeenCalled());
    expect(savePrintFormats.mock.calls[0][0][0]).toMatchObject({ layoutType: 'flow', template: 'minimal' });
  });
});

describe('add and duplicate', () => {
  test('a new format starts with portrait defaults and a unique id', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByText('+ Neues Format hinzufügen'));
    fireEvent.click(screen.getByText('+ Neues Format hinzufügen'));
    expect(names()).toEqual(['Ein Foto', 'Standard', 'Format 3', 'Format 4']);
  });

  test('duplicate inserts a copy right after the original with a copy name and no photo limit', async () => {
    await renderLoaded();
    fireEvent.click(within(items()[0]).getByText('Duplizieren'));
    expect(names()).toEqual(['Ein Foto', 'Ein Foto Kopie', 'Standard']);
    expect(within(items()[1]).getByLabelText('Maximale Fotoanzahl:')).toHaveValue(null);
    // editing the copy leaves the original untouched
    fireEvent.click(within(items()[1]).getByText('edit Ein Foto Kopie'));
    expect(within(items()[0]).getByLabelText('Formatname')).toHaveValue('Ein Foto');
  });
});

describe('delete with undo', () => {
  test('uses the shared DeleteRowButton with an accessible name', async () => {
    await renderLoaded();
    const btn = within(items()[0]).getByRole('button', { name: 'Ein Foto entfernen' });
    expect(btn).toHaveClass('delete-row-button');
    expect(btn).toHaveAttribute('title', 'Ein Foto entfernen');
  });

  test('no confirmation dialog; the row disappears at once and the snackbar offers Rückgängig', async () => {
    const confirm = jest.spyOn(window, 'confirm');
    await renderLoaded();
    fireEvent.click(within(items()[0]).getByRole('button', { name: 'Ein Foto entfernen' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(names()).toEqual(['Standard']);
    expect(screen.getByRole('status')).toHaveTextContent('„Ein Foto" entfernt');
  });

  test('Rückgängig restores the format at its old index', async () => {
    await renderLoaded({}, [fmt('a', 'A', 1), fmt('b', 'B', 2), fmt('c', 'C', null)]);
    fireEvent.click(within(items()[1]).getByRole('button', { name: 'B entfernen' }));
    expect(names()).toEqual(['A', 'C']);
    fireEvent.click(screen.getByText('Rückgängig'));
    expect(names()).toEqual(['A', 'B', 'C']);
  });

  test('the snackbar disappears after 6 seconds and the deletion stays', async () => {
    await renderLoaded();
    fireEvent.click(within(items()[0]).getByRole('button', { name: 'Ein Foto entfernen' }));
    act(() => { jest.advanceTimersByTime(6000); });
    expect(screen.queryByText('Rückgängig')).toBeNull();
    expect(names()).toEqual(['Standard']);
  });

  test('the last remaining catch-all format cannot be deleted', async () => {
    await renderLoaded();
    const btn = within(items()[1]).getByRole('button', { name: 'Standard entfernen' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(names()).toEqual(['Ein Foto', 'Standard']);
  });

  test('a catch-all can be deleted while another catch-all exists', async () => {
    await renderLoaded({}, [fmt('a', 'A', null), fmt('b', 'B', null)]);
    expect(within(items()[0]).getByRole('button', { name: 'A entfernen' })).not.toBeDisabled();
  });

  test('a single format cannot be deleted', async () => {
    await renderLoaded({}, [fmt('a', 'A', null)]);
    expect(within(items()[0]).getByRole('button', { name: 'A entfernen' })).toBeDisabled();
  });
});

describe('validation and saving', () => {
  test('save is disabled until something changed', async () => {
    await renderLoaded();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(within(items()[0]).getByLabelText('Formatname'), { target: { value: 'Neu' } });
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText('Ungespeicherte Änderungen')).toBeInTheDocument();
  });

  test('duplicate photo limits are reported and block saving', async () => {
    await renderLoaded({}, [fmt('a', 'A', 2), fmt('b', 'B', 2), fmt('c', 'C', null)]);
    expect(within(items()[1]).getByRole('alert')).toHaveTextContent('bereits bei „A" vergeben');
    expect(saveButton()).toBeDisabled();
  });

  test('a blank name is reported on that format', async () => {
    await renderLoaded();
    fireEvent.change(within(items()[0]).getByLabelText('Formatname'), { target: { value: ' ' } });
    expect(within(items()[0]).getByRole('alert')).toHaveTextContent('Formatname darf nicht leer sein');
    expect(saveButton()).toBeDisabled();
  });

  test('missing catch-all is reported on list level', async () => {
    await renderLoaded({}, [fmt('a', 'A', 1), fmt('b', 'B', null)]);
    fireEvent.change(within(items()[1]).getByLabelText('Maximale Fotoanzahl:'), { target: { value: '5' } });
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('ohne Fotolimit');
    expect(saveButton()).toBeDisabled();
  });

  test('empty photo limit means "applies to all"', async () => {
    await renderLoaded();
    const input = within(items()[0]).getByLabelText('Maximale Fotoanzahl:');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
  });

  test('saving stores the edited formats, reloads and confirms', async () => {
    await renderLoaded();
    fireEvent.click(within(items()[0]).getByText('edit Ein Foto'));
    loadPrintFormatsForEditing.mockResolvedValue({ formats: stored(), usingDefaults: false });
    fireEvent.click(saveButton());
    await waitFor(() => expect(savePrintFormats).toHaveBeenCalledTimes(1));
    expect(savePrintFormats.mock.calls[0][0][0].fontFamily).toBe('Arial, sans-serif');
    expect(await screen.findByText('Druckformate gespeichert.')).toBeInTheDocument();
    expect(loadPrintFormatsForEditing).toHaveBeenCalledTimes(2);
    expect(saveButton()).toBeDisabled(); // clean again
  });

  test('a save error is shown and the edits are kept', async () => {
    await renderLoaded();
    fireEvent.change(within(items()[0]).getByLabelText('Formatname'), { target: { value: 'Neu' } });
    savePrintFormats.mockRejectedValue(new Error('permission-denied'));
    fireEvent.click(saveButton());
    expect(await screen.findByText(/Fehler beim Speichern.*permission-denied/)).toBeInTheDocument();
    expect(names()[0]).toBe('Neu');
    expect(saveButton()).toBeEnabled();
  });

  test('warns before unloading the page only while there are unsaved changes', async () => {
    await renderLoaded();
    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.change(within(items()[0]).getByLabelText('Formatname'), { target: { value: 'Neu' } });
    expect(unload()).toBe(true);
  });
});

describe('preview recipe', () => {
  const recipes = [
    { id: 'r0', title: 'Ohne Foto' },
    { id: 'r3', title: 'Mit Fotos', images: [{ url: 'a' }, { url: 'b' }, { url: 'c' }] },
  ];

  test('no selector without recipes', async () => {
    await renderLoaded();
    expect(screen.queryByLabelText('Vorschau-Rezept:')).toBeNull();
  });

  test('marks the format that applies to the recipe', async () => {
    await renderLoaded({ allRecipes: recipes });
    fireEvent.change(screen.getByLabelText('Vorschau-Rezept:'), { target: { value: 'r0' } });
    expect(within(items()[0]).getByText('Aktives Format für dieses Rezept')).toBeInTheDocument(); // 0 photos <= 1
    expect(within(items()[1]).getByText('Nicht aktiv für dieses Rezept')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Vorschau-Rezept:'), { target: { value: 'r3' } });
    expect(within(items()[1]).getByText('Aktives Format für dieses Rezept')).toBeInTheDocument(); // 3 photos -> catch-all
    expect(within(items()[0]).getByText('preview Mit Fotos')).toBeInTheDocument();
  });
});
