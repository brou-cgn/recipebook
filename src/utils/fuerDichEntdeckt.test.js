import {
  FUER_DICH_ENTDECKT_LIST_NAME,
  filterFuerDichEntdecktGroups,
  findFuerDichEntdecktList,
  getFuerDichEntdecktListId,
  isFuerDichEntdecktList,
  planFuerDichEntdecktSync,
  syncFuerDichEntdecktList,
} from './fuerDichEntdeckt';

jest.mock('../firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(),
}));

jest.mock('./groupFirestore', () => ({
  updateGroup: jest.fn(),
}));

const user = { id: 'u1', fuerDichEntdeckt: true, defaultEverydayClassicsListId: 'classics' };
const ownList = { id: 'fuerDichEntdeckt_u1', systemKey: 'fuerDichEntdeckt', ownerId: 'u1', type: 'private', listKind: 'interactive', targetListId: 'classics' };
const regularList = { id: 'g1', type: 'private', listKind: 'interactive', ownerId: 'u1' };

describe('fuerDichEntdeckt', () => {
  beforeEach(() => {
    const firestore = require('firebase/firestore');
    firestore.doc.mockImplementation((db, collection, id) => ({ collection, id }));
    firestore.setDoc.mockResolvedValue();
    firestore.serverTimestamp.mockReturnValue('ts');
    require('./groupFirestore').updateGroup.mockResolvedValue();
  });

  test('erkennt die Systemliste am systemKey, nicht am Namen', () => {
    expect(isFuerDichEntdecktList(ownList)).toBe(true);
    expect(isFuerDichEntdecktList({ ...regularList, name: FUER_DICH_ENTDECKT_LIST_NAME })).toBe(false);
    expect(isFuerDichEntdecktList(null)).toBe(false);
  });

  test('findet nur die eigene Liste', () => {
    const foreign = { ...ownList, id: 'fuerDichEntdeckt_u2', ownerId: 'u2' };
    expect(findFuerDichEntdecktList([foreign, regularList, ownList], 'u1')).toBe(ownList);
    expect(findFuerDichEntdecktList([foreign], 'u1')).toBeNull();
  });

  test('blendet die Liste ohne Berechtigung aus', () => {
    expect(filterFuerDichEntdecktGroups([regularList, ownList], false)).toEqual([regularList]);
    const groups = [regularList, ownList];
    expect(filterFuerDichEntdecktGroups(groups, true)).toBe(groups);
  });

  test('ohne Berechtigung wird nichts angelegt', () => {
    expect(planFuerDichEntdecktSync([], { ...user, fuerDichEntdeckt: false })).toEqual({ action: 'none' });
  });

  test('legt eine leere interaktive Liste mit der Alltagsklassiker-Liste als Ziel an', () => {
    const plan = planFuerDichEntdecktSync([regularList], user);
    expect(plan.action).toBe('create');
    expect(plan.listId).toBe(getFuerDichEntdecktListId('u1'));
    expect(plan.data).toEqual(expect.objectContaining({
      type: 'private',
      name: 'Für dich entdeckt',
      ownerId: 'u1',
      memberIds: ['u1'],
      listKind: 'interactive',
      targetListId: 'classics',
      systemKey: 'fuerDichEntdeckt',
    }));
    expect(plan.data.recipeIds).toBeUndefined();
  });

  test('ohne Alltagsklassiker-Liste ist die Zielliste leer', () => {
    const plan = planFuerDichEntdecktSync([], { ...user, defaultEverydayClassicsListId: '' });
    expect(plan.data.targetListId).toBeNull();
  });

  test('zieht die Zielliste nach, wenn sich die Alltagsklassiker-Liste ändert', () => {
    expect(planFuerDichEntdecktSync([ownList], { ...user, defaultEverydayClassicsListId: 'neu' }))
      .toEqual({ action: 'updateTarget', listId: 'fuerDichEntdeckt_u1', targetListId: 'neu' });
    expect(planFuerDichEntdecktSync([ownList], user)).toEqual({ action: 'none' });
  });

  test('legt per setDoc mit merge an, damit vorhandene Rezepte erhalten bleiben', async () => {
    const { setDoc } = require('firebase/firestore');
    await expect(syncFuerDichEntdecktList([], user)).resolves.toBe('create');
    expect(setDoc).toHaveBeenCalledWith(
      { collection: 'groups', id: 'fuerDichEntdeckt_u1' },
      expect.objectContaining({ systemKey: 'fuerDichEntdeckt', createdAt: 'ts' }),
      { merge: true }
    );
  });

  test('aktualisiert nur die Zielliste einer bestehenden Liste', async () => {
    const { updateGroup } = require('./groupFirestore');
    const { setDoc } = require('firebase/firestore');
    await syncFuerDichEntdecktList([ownList], { ...user, defaultEverydayClassicsListId: 'neu' });
    expect(updateGroup).toHaveBeenCalledWith('fuerDichEntdeckt_u1', { targetListId: 'neu' });
    expect(setDoc).not.toHaveBeenCalled();
  });
});
