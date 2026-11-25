jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((...args) => ({ path: args.slice(1).join('/') })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  deleteField: jest.fn(),
  collection: jest.fn(),
  writeBatch: jest.fn(),
  serverTimestamp: jest.fn(),
}));

import { getDoc, updateDoc } from 'firebase/firestore';
import { getPrintFormats, savePrintFormats, loadPrintFormatsForEditing } from './printFormatsFirestore';
import { clearSettingsCache } from './customLists';
import {
  createFlowFormat, migrateFormat, isConvertedFreeFormat, PrintFormatValidationError,
} from './print/printFormats';

// Stored formats of the removed free layout: boxes positioned by hand, no layoutType.
const BOXES = [
  { id: 'title', x: 2, y: 1.4, w: 96, h: 9.9, visible: true },
  { id: 'photo1', x: 2, y: 12.7, w: 96, h: 39.6, visible: true },
  { id: 'ingredients', x: 2, y: 75, w: 45, h: 56.6, visible: true },
  { id: 'steps', x: 51, y: 75, w: 47, h: 56.6, visible: true },
];
const legacyV2 = {
  id: 'old', name: 'Alt', maxPhotos: null, orientation: 'portrait', layoutVersion: 2,
  imageColumns: 'auto', elements: BOXES,
};
const freeV3 = {
  id: 'frei', name: 'Frei', maxPhotos: null, orientation: 'portrait', layoutVersion: 3,
  pageWidthCm: 21, pageHeightCm: 29.7, fontFamily: 'Arial, Helvetica, sans-serif', elements: BOXES,
};
const template = () => ({ ...createFlowFormat('card'), id: 'vorlage', name: 'Vorlage' });

function mockSettings(data) {
  getDoc.mockImplementation(async () => ({ exists: () => true, data: () => data }));
}

beforeEach(() => {
  clearSettingsCache();
  getDoc.mockReset();
  updateDoc.mockReset();
  updateDoc.mockResolvedValue(undefined);
  localStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('getPrintFormats', () => {
  test('converts stored free formats to templates without writing anything back', async () => {
    mockSettings({ printFormats: [legacyV2, freeV3] });
    const formats = await getPrintFormats();
    formats.forEach((format) => {
      expect(format).toMatchObject({ layoutType: 'flow', template: 'classic', layoutVersion: 3 });
      expect(format).not.toHaveProperty('elements');
      expect(format).not.toHaveProperty('imageColumns');
      expect(isConvertedFreeFormat(format)).toBe(true);
    });
    expect(formats.map((f) => f.id)).toEqual(['old', 'frei']);
    expect(formats[1].fontFamily).toBe('Arial, Helvetica, sans-serif');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  test('stored template formats come back unchanged and unmarked', async () => {
    const stored = template();
    mockSettings({ printFormats: [stored] });
    const formats = await getPrintFormats();
    expect(formats).toEqual([stored]);
    expect(isConvertedFreeFormat(formats[0])).toBe(false);
  });

  test('returns the default template when nothing is stored', async () => {
    mockSettings({});
    const formats = await getPrintFormats();
    expect(formats).toHaveLength(1);
    expect(formats[0]).toMatchObject({ id: 'default', layoutType: 'flow', template: 'classic', layoutVersion: 3 });
    expect(isConvertedFreeFormat(formats[0])).toBe(false);
  });
});

describe('savePrintFormats', () => {
  test('rejects invalid formats with a typed error and does not write', async () => {
    mockSettings({ printFormats: [legacyV2] });
    const bad = [{ ...createFlowFormat(), maxPhotos: 2 }]; // no catch-all
    await expect(savePrintFormats(bad)).rejects.toBeInstanceOf(PrintFormatValidationError);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  test('keeps a backup of pre-v3 formats on the first v3 save', async () => {
    mockSettings({ printFormats: [legacyV2] });
    const next = [createFlowFormat()];
    await savePrintFormats(next);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.printFormats).toEqual(next);
    expect(payload.printFormatsBackup).toEqual([legacyV2]);
  });

  test('does not overwrite an existing backup', async () => {
    mockSettings({ printFormats: [legacyV2], printFormatsBackup: [{ id: 'first-backup' }] });
    await savePrintFormats([createFlowFormat()]);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('printFormatsBackup');
  });

  test('writes no backup when the stored formats are already templates', async () => {
    mockSettings({ printFormats: [template()] });
    await savePrintFormats([createFlowFormat()]);
    expect(Object.keys(updateDoc.mock.calls[0][1])).toEqual(['printFormats']);
  });

  test('writes no backup when nothing is stored yet', async () => {
    mockSettings({});
    await savePrintFormats([createFlowFormat()]);
    expect(Object.keys(updateDoc.mock.calls[0][1])).toEqual(['printFormats']);
  });

  test('keeps the stored free formats once in printFormatsBackupFreiesLayout', async () => {
    mockSettings({ printFormats: [freeV3] });
    await savePrintFormats([migrateFormat(freeV3)]);
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.printFormatsBackupFreiesLayout).toEqual([freeV3]);
    expect(payload).not.toHaveProperty('printFormatsBackup'); // already v3
  });

  test('a list with one free format is backed up as a whole', async () => {
    const stored = [template(), freeV3];
    mockSettings({ printFormats: stored });
    await savePrintFormats(stored.map(migrateFormat));
    expect(updateDoc.mock.calls[0][1].printFormatsBackupFreiesLayout).toEqual(stored);
  });

  test('does not overwrite an existing free-layout backup', async () => {
    mockSettings({ printFormats: [freeV3], printFormatsBackupFreiesLayout: [{ id: 'first-backup' }] });
    await savePrintFormats([migrateFormat(freeV3)]);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('printFormatsBackupFreiesLayout');
  });

  test('the second save after a conversion writes no further backup (cache follows the save)', async () => {
    mockSettings({ printFormats: [freeV3] });
    await savePrintFormats([migrateFormat(freeV3)]);
    await savePrintFormats([migrateFormat(freeV3)]);
    expect(updateDoc).toHaveBeenCalledTimes(2);
    expect(Object.keys(updateDoc.mock.calls[1][1])).toEqual(['printFormats']);
  });

  test('does not store the conversion note', async () => {
    mockSettings({ printFormats: [freeV3] });
    const converted = migrateFormat(freeV3);
    expect(converted).toHaveProperty('migrationNotes');
    await savePrintFormats([converted]);
    const [saved] = updateDoc.mock.calls[0][1].printFormats;
    expect(saved).not.toHaveProperty('migrationNotes');
    const { migrationNotes, ...rest } = converted;
    expect(saved).toEqual(rest);
    expect(converted).toHaveProperty('migrationNotes'); // the caller's object is left alone
    const [reread] = await getPrintFormats();
    expect(isConvertedFreeFormat(reread)).toBe(false);
  });

  test('only touches printFormats (and the backups) in settings/app', async () => {
    mockSettings({ printFormats: [legacyV2] });
    await savePrintFormats([createFlowFormat()]);
    expect(Object.keys(updateDoc.mock.calls[0][1]).sort())
      .toEqual(['printFormats', 'printFormatsBackup', 'printFormatsBackupFreiesLayout']);
  });

  test('propagates Firestore errors', async () => {
    mockSettings({ printFormats: [template()] });
    updateDoc.mockRejectedValue(new Error('offline'));
    await expect(savePrintFormats([createFlowFormat()])).rejects.toThrow('offline');
  });
});

describe('loadPrintFormatsForEditing', () => {
  test('returns the stored formats as templates; converted ones are marked for the hint', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ printFormats: [legacyV2, template()] }) });
    const { formats, usingDefaults } = await loadPrintFormatsForEditing();
    expect(usingDefaults).toBe(false);
    expect(formats.map((f) => f.layoutType)).toEqual(['flow', 'flow']);
    expect(formats.map(isConvertedFreeFormat)).toEqual([true, false]);
  });

  test('flags defaults when nothing is stored', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
    const { formats, usingDefaults } = await loadPrintFormatsForEditing();
    expect(usingDefaults).toBe(true);
    expect(formats).toHaveLength(1);
    expect(isConvertedFreeFormat(formats[0])).toBe(false);
  });

  test('throws on a failed read instead of returning defaults', async () => {
    getDoc.mockRejectedValue(new Error('offline'));
    await expect(loadPrintFormatsForEditing()).rejects.toThrow('offline');
  });
});

describe('settings cache', () => {
  // A reload: fresh modules (empty memory cache), same localStorage. Firestore still answers
  // with the old formats, as it would for a client that only reads settings/images after a reload.
  const afterReload = (storedInFirestore) => {
    jest.resetModules();
    const firestore = require('firebase/firestore');
    firestore.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => storedInFirestore }));
    return require('./printFormatsFirestore');
  };

  test('saved formats are used after a reload, not the stale copy in localStorage', async () => {
    const before = { printFormats: [template()] };
    mockSettings(before);
    expect((await getPrintFormats()).map((f) => f.name)).toEqual(['Vorlage']);
    await savePrintFormats([{ ...template(), name: 'Geändert' }]);
    expect((await getPrintFormats()).map((f) => f.name)).toEqual(['Geändert']);

    const formats = await afterReload(before).getPrintFormats();
    expect(formats.map((f) => f.name)).toEqual(['Geändert']);
  });

  test('the backup written with the save is cached too, so a second save does not overwrite it', async () => {
    mockSettings({ printFormats: [freeV3] });
    await getPrintFormats();
    await savePrintFormats([createFlowFormat()]);
    expect(updateDoc.mock.calls[0][1]).toHaveProperty('printFormatsBackupFreiesLayout');

    const fresh = afterReload({ printFormats: [freeV3] });
    const firestore = require('firebase/firestore');
    firestore.updateDoc.mockResolvedValue(undefined);
    await fresh.savePrintFormats([createFlowFormat()]);
    expect(firestore.updateDoc.mock.calls[0][1]).not.toHaveProperty('printFormatsBackupFreiesLayout');
  });

  test('formats read for the editor replace the cached ones', async () => {
    mockSettings({ printFormats: [template()] });
    await getPrintFormats();
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ printFormats: [{ ...template(), name: 'Neu aus Firestore' }] }) });
    await loadPrintFormatsForEditing();
    expect((await getPrintFormats()).map((f) => f.name)).toEqual(['Neu aus Firestore']);
  });
});
