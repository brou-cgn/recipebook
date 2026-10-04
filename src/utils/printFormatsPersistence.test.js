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
import {
  getPrintFormats, savePrintFormats, clearSettingsCache, PrintFormatValidationError,
  DEFAULT_PRINT_ELEMENTS_PORTRAIT,
} from './customLists';
import { createPrintFormat } from './printFormats';

const legacyV2 = {
  id: 'old', name: 'Alt', maxPhotos: null, orientation: 'portrait', layoutVersion: 2,
  imageColumns: 'auto', elements: DEFAULT_PRINT_ELEMENTS_PORTRAIT,
};

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
  test('migrates stored v2 formats to v3 without writing anything back', async () => {
    mockSettings({ printFormats: [legacyV2] });
    const formats = await getPrintFormats();
    expect(formats[0].layoutVersion).toBe(3);
    expect(formats[0]).not.toHaveProperty('imageColumns');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  test('returns migrated defaults when nothing is stored', async () => {
    mockSettings({});
    const formats = await getPrintFormats();
    expect(formats).toHaveLength(1);
    expect(formats[0].layoutVersion).toBe(3);
  });
});

describe('savePrintFormats', () => {
  test('rejects invalid formats with a typed error and does not write', async () => {
    mockSettings({ printFormats: [legacyV2] });
    const bad = [{ ...createPrintFormat(), maxPhotos: 2 }]; // no catch-all
    await expect(savePrintFormats(bad)).rejects.toBeInstanceOf(PrintFormatValidationError);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  test('keeps a backup of pre-v3 formats on the first v3 save', async () => {
    mockSettings({ printFormats: [legacyV2] });
    const next = [createPrintFormat()];
    await savePrintFormats(next);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.printFormats).toBe(next);
    expect(payload.printFormatsBackup).toEqual([legacyV2]);
  });

  test('does not overwrite an existing backup', async () => {
    mockSettings({ printFormats: [legacyV2], printFormatsBackup: [{ id: 'first-backup' }] });
    await savePrintFormats([createPrintFormat()]);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('printFormatsBackup');
  });

  test('writes no backup when the stored formats are already v3', async () => {
    mockSettings({ printFormats: [createPrintFormat()] });
    await savePrintFormats([createPrintFormat()]);
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('printFormatsBackup');
  });

  test('only touches printFormats (and the backup) in settings/app', async () => {
    mockSettings({ printFormats: [legacyV2] });
    await savePrintFormats([createPrintFormat()]);
    expect(Object.keys(updateDoc.mock.calls[0][1]).sort()).toEqual(['printFormats', 'printFormatsBackup']);
  });

  test('propagates Firestore errors', async () => {
    mockSettings({ printFormats: [createPrintFormat()] });
    updateDoc.mockRejectedValue(new Error('offline'));
    await expect(savePrintFormats([createPrintFormat()])).rejects.toThrow('offline');
  });
});
