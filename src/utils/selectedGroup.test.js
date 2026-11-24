import { resolveSelectedGroup } from './selectedGroup';

describe('resolveSelectedGroup', () => {
  const snapshot = { id: 'g1', memberIds: ['owner', 'gast'] };

  it('liefert den Live-Stand aus dem Abo statt des beim Öffnen gemerkten Stands', () => {
    const live = { id: 'g1', memberIds: ['owner'] };
    expect(resolveSelectedGroup([{ id: 'g0' }, live], snapshot)).toBe(live);
  });

  it('fällt auf den gemerkten Stand zurück, solange das Abo die Liste nicht führt', () => {
    expect(resolveSelectedGroup([{ id: 'g0' }], snapshot)).toBe(snapshot);
    expect(resolveSelectedGroup(undefined, snapshot)).toBe(snapshot);
  });

  it('liefert null, wenn keine Liste geöffnet ist', () => {
    expect(resolveSelectedGroup([{ id: 'g1' }], null)).toBeNull();
  });
});
