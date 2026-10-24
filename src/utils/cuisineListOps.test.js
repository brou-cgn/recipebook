import {
  addCuisineType, removeCuisineType, renameCuisineType,
  addCuisineGroup, removeCuisineGroup, addChildToGroup, removeChildFromGroup,
} from './cuisineListOps';

const base = () => ({
  types: ['Deutsche Küche', 'Italienische Küche', 'Vegan'],
  groups: [{ name: 'Europa', children: ['Deutsche Küche', 'Italienische Küche'] }],
});

describe('cuisineListOps', () => {
  test('addCuisineType trimmt und lehnt Dubletten ohne Beachtung der Schreibweise ab', () => {
    expect(addCuisineType(base(), '  Thai ').types).toContain('Thai');
    expect(addCuisineType(base(), 'vegan')).toBeNull();
    expect(addCuisineType(base(), '   ')).toBeNull();
  });

  test('removeCuisineType entfernt den Typ aus den Gruppen, restore setzt ihn an die alte Stelle zurück', () => {
    const { state, restore } = removeCuisineType(base(), 'Deutsche Küche');
    expect(state.types).toEqual(['Italienische Küche', 'Vegan']);
    expect(state.groups[0].children).toEqual(['Italienische Küche']);
    const back = restore(state);
    expect(back.types[0]).toBe('Deutsche Küche');
    expect(back.groups[0].children).toContain('Deutsche Küche');
  });

  test('restore behält Änderungen aus dem Undo-Fenster', () => {
    const { state, restore } = removeCuisineType(base(), 'Vegan');
    const edited = addCuisineType(state, 'Thai');
    expect(restore(edited).types).toEqual(['Deutsche Küche', 'Italienische Küche', 'Vegan', 'Thai']);
  });

  test('removeCuisineType ohne Treffer ändert nichts', () => {
    expect(removeCuisineType(base(), 'Gibt es nicht')).toBeNull();
  });

  test('renameCuisineType zieht die Gruppen mit und verbietet Namen, die schon existieren', () => {
    const next = renameCuisineType(base(), 'Deutsche Küche', 'Deutsch');
    expect(next.types[0]).toBe('Deutsch');
    expect(next.groups[0].children[0]).toBe('Deutsch');
    expect(renameCuisineType(base(), 'Deutsche Küche', 'vegan')).toBeNull();
    expect(renameCuisineType(base(), 'Deutsche Küche', 'Deutsche Küche')).toBeNull();
    expect(renameCuisineType(base(), 'Vegan', 'VEGAN').types[2]).toBe('VEGAN');
  });

  test('Gruppen: anlegen, entfernen mit restore, Kinder hinzufügen und entfernen', () => {
    expect(addCuisineGroup(base(), 'Europa')).toBeNull();
    const withAsia = addCuisineGroup(base(), 'Asien');
    expect(withAsia.groups.map(g => g.name)).toEqual(['Europa', 'Asien']);

    const { state, restore } = removeCuisineGroup(withAsia, 'Europa');
    expect(state.groups.map(g => g.name)).toEqual(['Asien']);
    expect(restore(state).groups.map(g => g.name)).toEqual(['Europa', 'Asien']);

    const added = addChildToGroup(base(), 'Europa', 'Vegan');
    expect(added.groups[0].children).toContain('Vegan');
    expect(addChildToGroup(added, 'Europa', 'Vegan')).toBeNull();

    const removed = removeChildFromGroup(base(), 'Europa', 'Deutsche Küche');
    expect(removed.state.groups[0].children).toEqual(['Italienische Küche']);
    expect(removed.restore(removed.state).groups[0].children).toEqual(['Deutsche Küche', 'Italienische Küche']);
    expect(removeChildFromGroup(base(), 'Europa', 'Vegan')).toBeNull();
  });
});
