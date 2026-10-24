/**
 * Pure operations on the cuisine type list and cuisine groups. Settings and the
 * App-Aufrufe page both edit the same lists; they share these rules and only
 * differ in how the result is stored (Settings on "Speichern", App-Aufrufe at once).
 *
 * State shape: { types: string[], groups: [{ name, children: string[] }] }.
 * Every op returns a new state, or null when there is nothing to change.
 * Ops that delete also return `restore(state)`, which re-inserts the entry at
 * its old position into the state as it is by then (edits made during the
 * undo window are kept).
 */

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

const insertAt = (list, item, index) => {
  const next = list.slice();
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
};

export function addCuisineType(state, name) {
  const trimmed = (name || '').trim();
  if (!trimmed || state.types.some(t => sameName(t, trimmed))) return null;
  return { ...state, types: [...state.types, trimmed] };
}

export function removeCuisineType(state, name) {
  const index = state.types.indexOf(name);
  if (index < 0) return null;
  const memberOf = state.groups.filter(g => g.children.includes(name)).map(g => g.name);
  return {
    state: {
      types: state.types.filter(t => t !== name),
      groups: state.groups.map(g => ({ ...g, children: g.children.filter(c => c !== name) })),
    },
    restore: (current) => ({
      types: current.types.includes(name) ? current.types : insertAt(current.types, name, index),
      groups: current.groups.map(g =>
        memberOf.includes(g.name) && !g.children.includes(name)
          ? { ...g, children: [...g.children, name] }
          : g
      ),
    }),
  };
}

export function renameCuisineType(state, oldName, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed || trimmed === oldName) return null;
  if (state.types.some(t => t !== oldName && sameName(t, trimmed))) return null;
  return {
    types: state.types.map(t => (t === oldName ? trimmed : t)),
    groups: state.groups.map(g => ({
      ...g,
      children: g.children.map(c => (c === oldName ? trimmed : c)),
    })),
  };
}

export function addCuisineGroup(state, name) {
  const trimmed = (name || '').trim();
  if (!trimmed || state.groups.some(g => g.name === trimmed)) return null;
  return { ...state, groups: [...state.groups, { name: trimmed, children: [] }] };
}

export function removeCuisineGroup(state, groupName) {
  const index = state.groups.findIndex(g => g.name === groupName);
  if (index < 0) return null;
  const removed = state.groups[index];
  return {
    state: { ...state, groups: state.groups.filter(g => g.name !== groupName) },
    restore: (current) => ({
      ...current,
      groups: current.groups.some(g => g.name === groupName)
        ? current.groups
        : insertAt(current.groups, removed, index),
    }),
  };
}

export function addChildToGroup(state, groupName, childName) {
  const group = state.groups.find(g => g.name === groupName);
  if (!group || group.children.includes(childName)) return null;
  return {
    ...state,
    groups: state.groups.map(g =>
      g.name === groupName ? { ...g, children: [...g.children, childName] } : g
    ),
  };
}

export function removeChildFromGroup(state, groupName, childName) {
  const group = state.groups.find(g => g.name === groupName);
  const index = group ? group.children.indexOf(childName) : -1;
  if (index < 0) return null;
  return {
    state: {
      ...state,
      groups: state.groups.map(g =>
        g.name === groupName ? { ...g, children: g.children.filter(c => c !== childName) } : g
      ),
    },
    restore: (current) => ({
      ...current,
      groups: current.groups.map(g =>
        g.name !== groupName || g.children.includes(childName)
          ? g
          : { ...g, children: insertAt(g.children, childName, index) }
      ),
    }),
  };
}
