import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './ButtonIconsAdminTab.css';
import {
  getButtonIcons,
  saveButtonIcon,
  DEFAULT_BUTTON_ICONS,
  getButtonIconGroups,
  saveButtonIconGroups,
} from '../utils/customLists';
import { mergeButtonIconRowDefs } from '../utils/buttonIconRows';
import { fileToBase64, isBase64Image, compressImage } from '../utils/imageUtils';
import DeleteRowButton from './DeleteRowButton';
import UndoSnackbar from './UndoSnackbar';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const VARIANT_LABELS = ['Hellmodus · normal', 'Hellmodus · aktiv', 'Dunkelmodus · normal', 'Dunkelmodus · aktiv'];
const VARIANT_SHORT_LABELS = ['Hell · normal', 'Hell · aktiv', 'Dunkel · normal', 'Dunkel · aktiv'];
const STRUCTURE_SAVE_DEBOUNCE_MS = 600;

function variantKeysForRow(def) {
  return [def.key, def.activeKey, def.darkKey, def.darkActiveKey];
}

function VariantSlot({ mode, value, disabled, label, onClick }) {
  const isImage = isBase64Image(value);
  return (
    <button
      type="button"
      className={`bia-slot bia-slot-${mode}${disabled ? ' bia-slot-disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? `${label} – für diesen Button nicht verfügbar` : label}
      aria-label={label}
    >
      {isImage ? (
        <img src={value} alt="" className="bia-slot-image" />
      ) : disabled ? (
        <span className="bia-slot-dash" aria-hidden="true">–</span>
      ) : value ? (
        <span className="bia-slot-glyph">{value}</span>
      ) : mode === 'dark' ? (
        <span className="bia-slot-inherit">erbt</span>
      ) : (
        <span className="bia-slot-plus" aria-hidden="true">+</span>
      )}
    </button>
  );
}

function SortableIconRow({
  group,
  entry,
  def,
  icons,
  isDeleteVisible,
  onDeleteVisibleChange,
  onOpenEditor,
  onDelete,
  onRename,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.key,
    data: { type: 'row', groupId: group.id },
  });
  const { offset, isDeleteVisible: swipeVisible, reset, handlers } = useSwipeToDelete({
    isDeleteVisible,
    onDeleteVisibleChange,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const swipeContentStyle = {
    transform: `translateX(${offset}px)`,
    transition: isDragging ? transition : 'transform 0.15s ease',
  };

  const label = entry.label || def.label;
  const inheritParts = [];
  if (!icons[def.darkKey]) inheritParts.push('Dunkel');
  if (def.darkActiveKey && !icons[def.darkActiveKey]) inheritParts.push('Dunkel aktiv');
  const fallbackNote = inheritParts.length > 0 ? `${inheritParts.join(' + ')} erbt Hellmodus-Icon` : null;

  const handleSwipeDeleteClick = () => {
    onDelete();
    reset();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bia-row${isDragging ? ' bia-dragging' : ''}${offset < 0 ? ' bia-swipe-active' : ''}`}
    >
      <div className="swipe-delete-background" aria-hidden={!swipeVisible}>
        {swipeVisible && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${label} entfernen`}
          >
            <span className="swipe-delete-icon-text">🗑</span>
          </button>
        )}
      </div>
      <div className="bia-row-content" style={swipeContentStyle} {...handlers}>
        <button type="button" className="bia-drag-handle" {...attributes} {...listeners} aria-label={`${label} verschieben`}>⠿</button>

        <div className="bia-row-name">
          <input
            value={label}
            onChange={(e) => onRename(e.target.value)}
            className="bia-row-name-input"
            aria-label="Buttonname"
          />
          {fallbackNote && <span className="bia-fallback-note">{fallbackNote}</span>}
        </div>

        <div className="bia-slot-col">
          <VariantSlot mode="light" value={icons[def.key]} label={`${label} – Hellmodus normal`} onClick={() => onOpenEditor(0)} />
        </div>
        <div className="bia-slot-col">
          <VariantSlot mode="light" value={def.activeKey ? icons[def.activeKey] : null} disabled={!def.activeKey} label={`${label} – Hellmodus aktiv`} onClick={() => onOpenEditor(1)} />
        </div>
        <div className="bia-col-sep" aria-hidden="true">│</div>
        <div className="bia-slot-col">
          <VariantSlot mode="dark" value={icons[def.darkKey]} label={`${label} – Dunkelmodus normal`} onClick={() => onOpenEditor(2)} />
        </div>
        <div className="bia-slot-col">
          <VariantSlot mode="dark" value={def.darkActiveKey ? icons[def.darkActiveKey] : null} disabled={!def.darkActiveKey} label={`${label} – Dunkelmodus aktiv`} onClick={() => onOpenEditor(3)} />
        </div>
      </div>
    </div>
  );
}

function EmptyGroupDropZone({ groupId }) {
  const { setNodeRef, isOver } = useDroppable({ id: `empty-${groupId}`, data: { type: 'group', groupId } });
  return (
    <div ref={setNodeRef} className={`bia-empty-group${isOver ? ' bia-drop-over' : ''}`}>
      Zeilen hierher ziehen
    </div>
  );
}

function SortableGroupSection({
  group,
  isOpen,
  visibleRows,
  icons,
  deleteVisibleRowKey,
  onSetDeleteVisibleRowKey,
  onToggle,
  onRename,
  onDissolve,
  onOpenEditor,
  onDeleteRow,
  onRenameRow,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    data: { type: 'group' },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`bia-group${isDragging ? ' bia-dragging' : ''}`}>
      <div className="bia-group-header">
        <button type="button" className="bia-drag-handle" {...attributes} {...listeners} aria-label={`${group.name} verschieben`}>⠿</button>
        <button type="button" className="bia-chevron" onClick={onToggle} aria-label={isOpen ? `${group.name} einklappen` : `${group.name} ausklappen`}>
          {isOpen ? '▼' : '▶'}
        </button>
        <input
          className="bia-group-name"
          value={group.name}
          onChange={(e) => onRename(e.target.value)}
          aria-label="Gruppenname"
        />
        <span className="bia-group-meta">{group.rowKeys.length} {group.rowKeys.length === 1 ? 'Button' : 'Buttons'}</span>
        <span className="bia-spacer" />
        <div className="delete-row-hover-target">
          <DeleteRowButton itemName={group.name} onClick={onDissolve} />
        </div>
      </div>

      {isOpen && (
        <SortableContext items={visibleRows.map(({ entry }) => entry.key)} strategy={verticalListSortingStrategy}>
          {visibleRows.map(({ entry, def }) => (
            <SortableIconRow
              key={entry.key}
              group={group}
              entry={entry}
              def={def}
              icons={icons}
              isDeleteVisible={deleteVisibleRowKey === entry.key}
              onDeleteVisibleChange={(visible) => onSetDeleteVisibleRowKey(visible ? entry.key : null)}
              onOpenEditor={(variantIndex) => onOpenEditor(group.id, entry.key, variantIndex)}
              onDelete={() => onDeleteRow(group.id, entry.key)}
              onRename={(value) => onRenameRow(group.id, entry.key, value)}
            />
          ))}
          {visibleRows.length === 0 && <EmptyGroupDropZone groupId={group.id} />}
        </SortableContext>
      )}
    </div>
  );
}

function ButtonIconsAdminTab() {
  const [icons, setIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [data, setData] = useState({ groups: [], hiddenRowKeys: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleteVisibleRowKey, setDeleteVisibleRowKey] = useState(null);

  const structureSaveTimeoutRef = useRef(null);
  const rowDefsByKey = useMemo(() => new Map(mergeButtonIconRowDefs().map((r) => [r.key, r])), []);
  const undo = useUndoableDelete();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getButtonIcons(), getButtonIconGroups()]).then(([iconsRes, groupsRes]) => {
      if (cancelled) return;
      setIcons(iconsRes);
      setData(groupsRes);
      setLoading(false);
    }).catch((error) => {
      console.error('Error loading button icon groups:', error);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const persistData = useCallback((next) => {
    setData(next);
    if (structureSaveTimeoutRef.current) {
      clearTimeout(structureSaveTimeoutRef.current);
      structureSaveTimeoutRef.current = null;
    }
    saveButtonIconGroups(next).catch((error) => {
      console.error('Error saving button icon groups:', error);
    });
  }, []);

  const scheduleStructureSave = useCallback((next) => {
    setData(next);
    if (structureSaveTimeoutRef.current) clearTimeout(structureSaveTimeoutRef.current);
    structureSaveTimeoutRef.current = setTimeout(() => {
      structureSaveTimeoutRef.current = null;
      saveButtonIconGroups(next).catch((error) => {
        console.error('Error saving button icon groups:', error);
      });
    }, STRUCTURE_SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (structureSaveTimeoutRef.current) clearTimeout(structureSaveTimeoutRef.current);
  }, []);

  // ---- groups
  const handleAddGroup = () => {
    const id = `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    persistData({ ...data, groups: [...data.groups, { id, name: 'Neue Gruppe', rowKeys: [] }] });
  };

  const handleRenameGroup = (groupId, name) => {
    scheduleStructureSave({
      ...data,
      groups: data.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
    });
  };

  const handleToggleGroup = (groupId) => {
    setCollapsed((c) => ({ ...c, [groupId]: !c[groupId] }));
  };

  const handleDissolveGroup = (groupId) => {
    const idx = data.groups.findIndex((g) => g.id === groupId);
    if (idx === -1) return;
    const removedGroup = data.groups[idx];
    const rest = data.groups.filter((g) => g.id !== groupId);
    let mergedIntoId = null;
    let nextGroups = rest;
    if (rest.length > 0) {
      const targetIdx = Math.min(Math.max(0, idx - 1), rest.length - 1);
      mergedIntoId = rest[targetIdx].id;
      nextGroups = rest.map((g, i) => (i === targetIdx ? { ...g, rowKeys: [...g.rowKeys, ...removedGroup.rowKeys] } : g));
    }
    persistData({ ...data, groups: nextGroups });

    undo.notifyDeleted({
      id: `group:${groupId}`,
      name: removedGroup.name,
      undo: () => {
        setData((current) => {
          let groups;
          if (mergedIntoId) {
            groups = current.groups.map((g) => {
              if (g.id !== mergedIntoId) return g;
              const n = removedGroup.rowKeys.length;
              return { ...g, rowKeys: n > 0 ? g.rowKeys.slice(0, -n) : g.rowKeys };
            });
            const insertAt = Math.min(idx, groups.length);
            groups = [...groups.slice(0, insertAt), removedGroup, ...groups.slice(insertAt)];
          } else {
            groups = [removedGroup, ...current.groups];
          }
          const restored = { ...current, groups };
          saveButtonIconGroups(restored).catch((error) => console.error('Error saving button icon groups:', error));
          return restored;
        });
      },
    });
  };

  // ---- rows
  const handleRenameRow = (groupId, rowKey, label) => {
    scheduleStructureSave({
      ...data,
      groups: data.groups.map((g) => (
        g.id !== groupId ? g : { ...g, rowKeys: g.rowKeys.map((r) => (r.key === rowKey ? { ...r, label } : r)) }
      )),
    });
  };

  const handleDeleteRow = (groupId, rowKey) => {
    const groupIdx = data.groups.findIndex((g) => g.id === groupId);
    if (groupIdx === -1) return;
    const rowIdx = data.groups[groupIdx].rowKeys.findIndex((r) => r.key === rowKey);
    if (rowIdx === -1) return;
    const removedEntry = data.groups[groupIdx].rowKeys[rowIdx];
    const def = rowDefsByKey.get(rowKey);
    const label = removedEntry.label || def?.label || rowKey;

    persistData({
      ...data,
      groups: data.groups.map((g, i) => (i === groupIdx ? { ...g, rowKeys: g.rowKeys.filter((r) => r.key !== rowKey) } : g)),
      hiddenRowKeys: [...data.hiddenRowKeys, rowKey],
    });

    undo.notifyDeleted({
      id: rowKey,
      name: label,
      undo: () => {
        setData((current) => {
          const gIdx = current.groups.findIndex((g) => g.id === groupId);
          const groups = gIdx > -1
            ? current.groups.map((g, i) => (i === gIdx
              ? { ...g, rowKeys: [...g.rowKeys.slice(0, rowIdx), removedEntry, ...g.rowKeys.slice(rowIdx)] }
              : g))
            : current.groups.map((g, i) => (i === 0 ? { ...g, rowKeys: [...g.rowKeys, removedEntry] } : g));
          const restored = { groups, hiddenRowKeys: current.hiddenRowKeys.filter((k) => k !== rowKey) };
          saveButtonIconGroups(restored).catch((error) => console.error('Error saving button icon groups:', error));
          return restored;
        });
      },
    });
  };

  // ---- drag & drop (groups reorder, rows reorder within/across groups)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeType = active.data.current?.type;

    if (activeType === 'group') {
      if (active.id === over.id) return;
      const overGroupId = over.data.current?.type === 'group' ? (over.data.current.groupId || over.id) : null;
      if (!overGroupId) return;
      const oldIndex = data.groups.findIndex((g) => g.id === active.id);
      const newIndex = data.groups.findIndex((g) => g.id === overGroupId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      persistData({ ...data, groups: arrayMove(data.groups, oldIndex, newIndex) });
      return;
    }

    if (activeType === 'row') {
      const sourceGroupId = active.data.current.groupId;
      const sourceGroup = data.groups.find((g) => g.id === sourceGroupId);
      if (!sourceGroup) return;
      const sourceIndex = sourceGroup.rowKeys.findIndex((r) => r.key === active.id);
      if (sourceIndex === -1) return;

      let destGroupId = null;
      let destIndex = -1;
      if (over.data.current?.type === 'row') {
        destGroupId = over.data.current.groupId;
        const destGroup = data.groups.find((g) => g.id === destGroupId);
        destIndex = destGroup ? destGroup.rowKeys.findIndex((r) => r.key === over.id) : -1;
      } else if (over.data.current?.type === 'group') {
        destGroupId = over.data.current.groupId || over.id;
        const destGroup = data.groups.find((g) => g.id === destGroupId);
        destIndex = destGroup ? destGroup.rowKeys.length : -1;
      }
      if (!destGroupId || destIndex === -1) return;

      if (sourceGroupId === destGroupId) {
        if (sourceIndex === destIndex) return;
        persistData({
          ...data,
          groups: data.groups.map((g) => (g.id === sourceGroupId ? { ...g, rowKeys: arrayMove(g.rowKeys, sourceIndex, destIndex) } : g)),
        });
      } else {
        const movedEntry = sourceGroup.rowKeys[sourceIndex];
        persistData({
          ...data,
          groups: data.groups.map((g) => {
            if (g.id === sourceGroupId) return { ...g, rowKeys: g.rowKeys.filter((_, i) => i !== sourceIndex) };
            if (g.id === destGroupId) {
              const rowKeys = g.rowKeys.slice();
              rowKeys.splice(destIndex, 0, movedEntry);
              return { ...g, rowKeys };
            }
            return g;
          }),
        });
      }
    }
  };

  // ---- icon editor modal
  const openEditor = (groupId, rowKey, variantIndex) => {
    const def = rowDefsByKey.get(rowKey);
    if (!def) return;
    const targetKey = variantKeysForRow(def)[variantIndex];
    if (!targetKey) return;
    const apply = [false, false, false, false];
    apply[variantIndex] = true;
    setEditing({ groupId, rowKey, variantIndex, value: icons[targetKey] || '', apply });
  };

  const patchEditing = (patch) => setEditing((e) => (e ? { ...e, ...patch } : e));
  const closeEditor = () => setEditing(null);

  const toggleApply = (i) => setEditing((e) => {
    if (!e) return e;
    const apply = e.apply.slice();
    apply[i] = !apply[i];
    return { ...e, apply };
  });

  const handleModalImage = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const compressed = await compressImage(base64);
      patchEditing({ value: compressed });
    } catch (error) {
      alert(`Fehler beim Hochladen des Bildes: ${error.message}`);
    }
  };

  const saveEditor = async () => {
    if (!editing) return;
    const def = rowDefsByKey.get(editing.rowKey);
    if (!def) { closeEditor(); return; }
    const keys = variantKeysForRow(def);
    const targets = keys.filter((k, i) => k && editing.apply[i]);
    if (targets.length === 0) { closeEditor(); return; }
    const finalValue = isBase64Image(editing.value) ? editing.value : (editing.value || '').slice(0, 10);

    setIcons((prev) => {
      const next = { ...prev };
      targets.forEach((k) => { next[k] = finalValue; });
      return next;
    });
    closeEditor();

    try {
      await Promise.all(targets.map((k) => saveButtonIcon(k, finalValue)));
    } catch (error) {
      alert(`Fehler beim Speichern des Icons: ${error.message}`);
    }
  };

  useEffect(() => {
    if (!editing) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing]);

  // ---- search / filtering
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  let visibleRowCount = 0;
  const visibleGroups = data.groups.map((group) => {
    const rows = group.rowKeys
      .map((entry) => {
        const def = rowDefsByKey.get(entry.key);
        return def ? { entry, def } : null;
      })
      .filter(Boolean)
      .filter(({ entry, def }) => !normalizedQuery || (entry.label || def.label).toLowerCase().includes(normalizedQuery));
    visibleRowCount += rows.length;
    return { group, rows };
  });

  if (loading) {
    return (
      <>
        <div className="settings-tab-header">
          <h2>Button-Icons (neu)</h2>
        </div>
        <div className="settings-section bia-tab">
          <p className="section-description">Lädt…</p>
        </div>
      </>
    );
  }

  const editingDef = editing ? rowDefsByKey.get(editing.rowKey) : null;
  const editingEntry = editing ? data.groups.find((g) => g.id === editing.groupId)?.rowKeys.find((r) => r.key === editing.rowKey) : null;
  const editingLabel = editingEntry?.label || editingDef?.label || '';
  const editingKeys = editingDef ? variantKeysForRow(editingDef) : [];

  return (
    <>
      <div className="settings-tab-header">
        <h2>Button-Icons (neu)</h2>
      </div>
      <div className="settings-section bia-tab">
        <p className="section-description">
          Pro Button ein Icon je Modus. Ein Icon kann in einem Schritt für mehrere Varianten übernommen werden.
          Formate: Emoji, Kurztext (max. 10 Zeichen) oder Bild (PNG, JPG, SVG, max. 5&nbsp;MB). Fehlt eine Variante,
          wird das Hellmodus-Icon verwendet. Diese Ansicht organisiert dieselben Button-Icons wie „Allgemein"
          in Gruppen mit vier Varianten pro Zeile – die bestehende Liste bleibt parallel bestehen.
        </p>

        <div className="bia-toolbar">
          <input
            type="search"
            className="bia-search-input"
            placeholder="Button suchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="bia-btn-secondary" onClick={handleAddGroup}>+ Gruppe</button>
        </div>

        <div className="bia-card">
          <div className="bia-header-row">
            <span className="bia-header-handle" aria-hidden="true" />
            <span className="bia-header-label">Button</span>
            <div className="bia-header-group">
              <div className="bia-header-group-title">Hellmodus</div>
              <div className="bia-header-group-cols">
                <span>normal</span>
                <span>aktiv</span>
              </div>
            </div>
            <span className="bia-header-sep" aria-hidden="true" />
            <div className="bia-header-group">
              <div className="bia-header-group-title">Dunkelmodus</div>
              <div className="bia-header-group-cols">
                <span>normal</span>
                <span>aktiv</span>
              </div>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={data.groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              {visibleGroups.map(({ group, rows }) => (
                <SortableGroupSection
                  key={group.id}
                  group={group}
                  isOpen={isSearching || !collapsed[group.id]}
                  visibleRows={rows}
                  icons={icons}
                  deleteVisibleRowKey={deleteVisibleRowKey}
                  onSetDeleteVisibleRowKey={setDeleteVisibleRowKey}
                  onToggle={() => handleToggleGroup(group.id)}
                  onRename={(name) => handleRenameGroup(group.id, name)}
                  onDissolve={() => handleDissolveGroup(group.id)}
                  onOpenEditor={openEditor}
                  onDeleteRow={handleDeleteRow}
                  onRenameRow={handleRenameRow}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="bia-footer">
            <span className="bia-totals">{data.groups.length} {data.groups.length === 1 ? 'Gruppe' : 'Gruppen'} · {visibleRowCount} Buttons sichtbar</span>
            <button type="button" className="bia-btn-dashed" onClick={handleAddGroup}>+ Neue Gruppe</button>
          </div>
        </div>

        <div className="bia-legend">
          <span>⠿ Zeilen und Gruppen per Drag &amp; Drop sortieren – auch zwischen Gruppen (Ziehgriff fokussieren, mit Leertaste aufnehmen und Pfeiltasten verschieben)</span>
          <span>Klick auf ein Feld: Icon setzen und auf mehrere Varianten anwenden</span>
        </div>
      </div>

      <UndoSnackbar itemName={undo.pendingName} onUndo={undo.undo} />

      {editing && editingDef && (
        <div className="bia-modal-overlay" onClick={closeEditor}>
          <div className="bia-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="bia-modal-header">
              <div className="bia-modal-eyebrow">{VARIANT_LABELS[editing.variantIndex]}</div>
              <div className="bia-modal-title">{editingLabel}</div>
            </div>

            <div className="bia-modal-body">
              <div className="bia-modal-row">
                <div className="bia-modal-preview">
                  {isBase64Image(editing.value) ? (
                    <img src={editing.value} alt="" className="bia-slot-image" />
                  ) : (
                    <span>{editing.value || '—'}</span>
                  )}
                </div>
                <div className="bia-modal-input-col">
                  <input
                    type="text"
                    value={isBase64Image(editing.value) ? '' : editing.value}
                    onChange={(e) => patchEditing({ value: e.target.value.slice(0, 10) })}
                    placeholder="Emoji oder Kurztext (max. 10)"
                    maxLength={10}
                    className="bia-modal-text-input"
                  />
                  <div className="bia-modal-input-actions">
                    <label htmlFor="bia-modal-file" className="bia-btn-secondary bia-modal-image-btn">
                      Bild wählen…
                    </label>
                    <input
                      type="file"
                      id="bia-modal-file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      onChange={handleModalImage}
                      style={{ display: 'none' }}
                    />
                    <button type="button" className="bia-btn-tertiary" onClick={() => patchEditing({ value: '' })}>Leeren</button>
                  </div>
                </div>
              </div>

              <div className="bia-modal-apply">
                <div className="bia-modal-apply-title">Für diese Varianten übernehmen</div>
                <div className="bia-modal-apply-grid">
                  {VARIANT_SHORT_LABELS.map((variantLabel, i) => {
                    const disabled = !editingKeys[i];
                    return (
                      <button
                        key={variantLabel}
                        type="button"
                        className={`bia-modal-apply-btn${editing.apply[i] ? ' bia-modal-apply-btn--checked' : ''}`}
                        onClick={() => toggleApply(i)}
                        disabled={disabled}
                      >
                        <span className="bia-modal-apply-check" aria-hidden="true">{editing.apply[i] ? '✓' : ''}</span>
                        {variantLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="bia-modal-apply-hint">Nicht gesetzte Dunkelmodus-Varianten erben automatisch das Hellmodus-Icon.</div>
              </div>
            </div>

            <div className="bia-modal-footer">
              <button type="button" className="bia-btn-secondary" onClick={closeEditor}>Abbrechen</button>
              <button type="button" className="bia-btn-primary" onClick={saveEditor}>Übernehmen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ButtonIconsAdminTab;
