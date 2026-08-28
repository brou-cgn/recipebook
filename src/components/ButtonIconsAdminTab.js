import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ButtonIconsAdminTab.css';
import {
  getButtonIcons,
  saveButtonIcon,
  DEFAULT_BUTTON_ICONS,
  getButtonIconGroups,
  saveButtonIconGroups,
  getCustomLists,
} from '../utils/customLists';
import { mergeButtonIconRowDefs, buildCuisineTypeRowDefs, cuisineTypeIconKey, CUISINE_TYPES_GROUP_ID } from '../utils/buttonIconRows';
import { fileToBase64, isBase64Image, compressImage } from '../utils/imageUtils';
import {
  getCategoryImages,
  addCategoryImage,
  updateCategoryImage,
  removeCategoryImage,
  getAlreadyAssignedCategories,
} from '../utils/categoryImages';
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
const CATEGORY_ALREADY_ASSIGNED_ERROR = 'Die folgenden Kategorien sind bereits einem anderen Bild zugeordnet: {categories}\n\nBitte wählen Sie andere Kategorien.';

function categoryImageRowName(img) {
  return img.categories.length > 0 ? img.categories.join(', ') : 'Kategoriebild';
}

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
      <div className={`bia-row-content${def.cuisineType ? ' delete-row-hover-target' : ''}`} style={swipeContentStyle} {...handlers}>
        <button type="button" className="bia-drag-handle" {...attributes} {...listeners} aria-label={`${label} verschieben`}>⠿</button>

        <div className="bia-row-name">
          {onRename ? (
            <input
              value={label}
              onChange={(e) => onRename(e.target.value)}
              className="bia-row-name-input"
              aria-label="Buttonname"
            />
          ) : (
            <span className="bia-row-name-static" title="Kulinarik-Typ – Umbenennung erfolgt in „Listen & Kategorien“">
              {label}
            </span>
          )}
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
        {def.cuisineType && (
          <DeleteRowButton itemName={label} onClick={onDelete} className="bia-row-delete-btn" />
        )}
      </div>
    </div>
  );
}

// Renders a typeahead's option list into document.body, positioned via a fixed
// rect computed from the anchor input. Ancestor cards use `overflow: hidden`
// (for rounded corners on the row list), which used to clip this dropdown
// whenever the add-row sat near the bottom of a card - a portal escapes that
// clipping regardless of where the row lives. Flips above the input when
// there isn't enough room below.
function TypeaheadPanel({ anchorRef, id, children }) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return undefined;

    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      setStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(openUpward
          ? { bottom: viewportHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorRef]);

  if (!style) return null;
  return createPortal(
    <div className="bia-typeahead-list" id={id} role="listbox" style={style}>
      {children}
    </div>,
    document.body
  );
}

// Shared behavior for the "search & pick one item" add-row pattern (Kulinarik-
// Typen and Speisekategorien). Callers own the visual row shell - this hook
// just wires the input, filtering, keyboard handling and outside-click-cancel.
function useTypeaheadCombobox({ value, onChange, suggestions, onSelect, onCancel }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onCancel]);

  const normalizedValue = value.trim().toLowerCase();
  const filtered = normalizedValue
    ? suggestions.filter((name) => name.toLowerCase().includes(normalizedValue))
    : suggestions;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length === 1) onSelect(filtered[0]);
    }
  };

  return {
    open,
    containerRef,
    inputRef,
    filtered,
    inputProps: {
      ref: inputRef,
      value,
      onChange: (e) => { onChange(e.target.value); setOpen(true); },
      onFocus: () => setOpen(true),
      onKeyDown: handleKeyDown,
      'aria-expanded': open,
      'aria-autocomplete': 'list',
      role: 'combobox',
      autoFocus: true,
    },
  };
}

function TypeaheadOptions({ filtered, emptyLabel, onSelect }) {
  return filtered.length > 0 ? (
    filtered.map((name) => (
      <button
        type="button"
        key={name}
        className="bia-typeahead-item"
        role="option"
        aria-selected="false"
        onMouseDown={(e) => { e.preventDefault(); onSelect(name); }}
      >
        {name}
      </button>
    ))
  ) : (
    <div className="bia-typeahead-empty">{emptyLabel}</div>
  );
}

function NewCuisineTypeRow({ value, onChange, suggestions, onSelect, onCancel }) {
  const { open, containerRef, inputRef, filtered, inputProps } = useTypeaheadCombobox({
    value, onChange, suggestions, onSelect, onCancel,
  });

  return (
    <div className="bia-row bia-row-new" ref={containerRef}>
      <div className="bia-row-content delete-row-hover-target">
        <div className="bia-row-name bia-row-name-typeahead">
          <input
            {...inputProps}
            type="text"
            placeholder="Kulinarik-Typ suchen…"
            className="bia-row-name-input"
            aria-label="Kulinarik-Typ suchen und auswählen"
            aria-controls="bia-cuisine-typeahead-list"
          />
          {open && (
            <TypeaheadPanel anchorRef={inputRef} id="bia-cuisine-typeahead-list">
              <TypeaheadOptions filtered={filtered} emptyLabel="Kein passender Kulinarik-Typ" onSelect={onSelect} />
            </TypeaheadPanel>
          )}
        </div>
        <DeleteRowButton itemName={value.trim() || 'Neue Zeile'} onClick={onCancel} className="bia-row-delete-btn" />
      </div>
    </div>
  );
}

function NewCategoryImageRow({ value, onChange, suggestions, onSelect, onCancel }) {
  const { open, containerRef, inputRef, filtered, inputProps } = useTypeaheadCombobox({
    value, onChange, suggestions, onSelect, onCancel,
  });

  return (
    <div className="bia-catimg-row-wrap bia-catimg-row-wrap-new">
      <div className="bia-catimg-row delete-row-hover-target" ref={containerRef}>
        <div className="bia-catimg-preview bia-catimg-preview-placeholder" aria-hidden="true">+</div>
        <div className="bia-catimg-typeahead">
          <input
            {...inputProps}
            type="text"
            placeholder="Speisekategorie suchen…"
            className="bia-row-name-input"
            aria-label="Speisekategorie suchen und auswählen"
            aria-controls="bia-catimg-typeahead-list"
          />
          {open && (
            <TypeaheadPanel anchorRef={inputRef} id="bia-catimg-typeahead-list">
              <TypeaheadOptions filtered={filtered} emptyLabel="Keine passende Speisekategorie" onSelect={onSelect} />
            </TypeaheadPanel>
          )}
        </div>
        <DeleteRowButton itemName={value.trim() || 'Neue Zeile'} onClick={onCancel} className="bia-row-delete-btn" />
      </div>
    </div>
  );
}

function CategoryImageRow({
  img,
  mealCategories,
  categoryImages,
  isDeleteVisible,
  onDeleteVisibleChange,
  onImageClick,
  isUploading,
  isEditing,
  selectedCategories,
  onCategoryToggle,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}) {
  const { offset, isDeleteVisible: swipeVisible, reset, handlers } = useSwipeToDelete({
    isDeleteVisible,
    onDeleteVisibleChange,
  });
  const swipeContentStyle = {
    transform: `translateX(${offset}px)`,
    transition: 'transform 0.15s ease',
  };
  const rowName = categoryImageRowName(img);

  const handleSwipeDeleteClick = () => {
    onDelete();
    reset();
  };

  return (
    <div className={`bia-catimg-row-wrap${offset < 0 ? ' bia-swipe-active' : ''}`}>
      <div className="swipe-delete-background" aria-hidden={!swipeVisible}>
        {swipeVisible && (
          <button
            type="button"
            className="swipe-delete-action"
            onClick={handleSwipeDeleteClick}
            aria-label={`${rowName} entfernen`}
          >
            <span className="swipe-delete-icon-text">🗑</span>
          </button>
        )}
      </div>
      <div className="bia-catimg-row delete-row-hover-target" style={swipeContentStyle} {...handlers}>
        <button
          type="button"
          className="bia-catimg-preview bia-catimg-preview-btn"
          onClick={() => onImageClick(img.id)}
          title={`Bild für ${rowName} hochladen/ändern`}
          aria-label={`Bild für ${rowName} hochladen/ändern`}
        >
          {img.image ? (
            <img src={img.image} alt="" />
          ) : isUploading ? (
            <span className="bia-catimg-uploading">…</span>
          ) : (
            <span className="bia-catimg-preview-plus" aria-hidden="true">+</span>
          )}
        </button>

        {isEditing ? (
          <div className="bia-catimg-edit">
            <div className="bia-catimg-checkboxes">
              {mealCategories.map((category) => {
                const isAssignedToOther = categoryImages.some(
                  (otherImg) => otherImg.id !== img.id && otherImg.categories.includes(category)
                );
                const isSelected = selectedCategories.includes(category);
                return (
                  <label
                    key={category}
                    className={`bia-catimg-checkbox${isAssignedToOther ? ' bia-catimg-checkbox-disabled' : ''}`}
                    title={isAssignedToOther ? 'Diese Kategorie ist bereits einem anderen Bild zugeordnet' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onCategoryToggle(category)}
                      disabled={isAssignedToOther}
                    />
                    <span>{category}</span>
                  </label>
                );
              })}
            </div>
            <div className="bia-catimg-edit-actions">
              <button
                type="button"
                className="bia-btn-primary"
                onClick={onSaveEdit}
                disabled={selectedCategories.length === 0}
              >
                Speichern
              </button>
              <button type="button" className="bia-btn-secondary" onClick={onCancelEdit}>
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bia-catimg-categories">
              {img.categories.length > 0 ? (
                img.categories.map((cat) => (
                  <span key={cat} className="bia-catimg-badge">{cat}</span>
                ))
              ) : (
                <span className="bia-catimg-empty">Keine Kategorien zugeordnet</span>
              )}
            </div>
            <button
              type="button"
              className="bia-btn-tertiary bia-catimg-edit-btn"
              onClick={() => onStartEdit(img.id)}
              title="Kategorien bearbeiten"
            >
              Bearbeiten
            </button>
          </>
        )}

        {!isEditing && (
          <DeleteRowButton itemName={rowName} onClick={onDelete} className="bia-row-delete-btn" />
        )}
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
  cuisineAddControls,
  isAddingCuisineRow,
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
        <>
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
                onRename={def.cuisineType ? undefined : (value) => onRenameRow(group.id, entry.key, value)}
              />
            ))}
            {visibleRows.length === 0 && !isAddingCuisineRow && <EmptyGroupDropZone groupId={group.id} />}
          </SortableContext>
          {cuisineAddControls}
        </>
      )}
    </div>
  );
}

function ButtonIconsAdminTab() {
  const [icons, setIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [data, setData] = useState({ groups: [], hiddenRowKeys: [] });
  const [cuisineTypes, setCuisineTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing] = useState(null);
  const [deleteVisibleRowKey, setDeleteVisibleRowKey] = useState(null);
  const [cuisineAddGroupId, setCuisineAddGroupId] = useState(null);
  const [cuisineAddValue, setCuisineAddValue] = useState('');

  const [categoryImages, setCategoryImages] = useState([]);
  const [mealCategories, setMealCategories] = useState([]);
  const [editingCategoryImageId, setEditingCategoryImageId] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [catimgAdding, setCatimgAdding] = useState(false);
  const [catimgAddValue, setCatimgAddValue] = useState('');
  const [catimgDeleteVisibleId, setCatimgDeleteVisibleId] = useState(null);
  const [uploadingRowId, setUploadingRowId] = useState(null);
  const rowUploadTargetIdRef = useRef(null);
  const categoryFileInputRef = useRef(null);

  const structureSaveTimeoutRef = useRef(null);
  const rowDefsByKey = useMemo(() => {
    const map = new Map(mergeButtonIconRowDefs().map((r) => [r.key, r]));
    buildCuisineTypeRowDefs(cuisineTypes).forEach((r) => map.set(r.key, r));
    return map;
  }, [cuisineTypes]);
  const availableCuisineTypeNames = useMemo(() => {
    const usedKeys = new Set();
    data.groups.forEach((g) => g.rowKeys.forEach((r) => usedKeys.add(r.key)));
    return cuisineTypes.filter((name) => !usedKeys.has(cuisineTypeIconKey(name)));
  }, [data.groups, cuisineTypes]);
  const availableMealCategoryNames = useMemo(() => (
    mealCategories.filter((name) => !categoryImages.some((img) => img.categories.includes(name)))
  ), [mealCategories, categoryImages]);
  const undo = useUndoableDelete();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getButtonIcons(), getButtonIconGroups(), getCategoryImages(), getCustomLists()]).then(([iconsRes, groupsRes, catImagesRes, listsRes]) => {
      if (cancelled) return;
      setIcons(iconsRes);
      setCuisineTypes(listsRes.cuisineTypes || []);
      setData(groupsRes);
      setCategoryImages(catImagesRes);
      setMealCategories(listsRes.mealCategories || []);
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

  const handleStartAddCuisineRow = (groupId) => {
    setCuisineAddGroupId(groupId);
    setCuisineAddValue('');
  };

  const handleCancelAddCuisineRow = () => {
    setCuisineAddGroupId(null);
    setCuisineAddValue('');
  };

  const handleSelectCuisineType = (groupId, name) => {
    if (!name) return;
    const entry = { key: cuisineTypeIconKey(name), label: name };
    persistData({
      ...data,
      groups: data.groups.map((g) => (g.id === groupId ? { ...g, rowKeys: [...g.rowKeys, entry] } : g)),
    });
    setCuisineAddGroupId(null);
    setCuisineAddValue('');
  };

  // ---- category images (Speisekategorien), integrated into the same
  // row/typeahead pattern as the Kulinarik-Typen group above.
  const handleCategoryToggle = (category) => {
    setSelectedCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));
  };

  const handleStartAddCategoryImage = () => {
    setCatimgAdding(true);
    setCatimgAddValue('');
  };

  const handleCancelAddCategoryImage = () => {
    setCatimgAdding(false);
    setCatimgAddValue('');
  };

  const handleSelectMealCategory = async (name) => {
    if (!name) return;
    setCatimgAdding(false);
    setCatimgAddValue('');
    try {
      const newImage = await addCategoryImage('', [name]);
      setCategoryImages((prev) => [...prev, newImage]);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleRowImageClick = (imageId) => {
    rowUploadTargetIdRef.current = imageId;
    categoryFileInputRef.current?.click();
  };

  const handleRowImageFileChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const targetId = rowUploadTargetIdRef.current;
    rowUploadTargetIdRef.current = null;
    if (!file || !targetId) return;

    setUploadingRowId(targetId);
    try {
      const base64 = await fileToBase64(file);
      const compressed = await compressImage(base64);
      const ok = await updateCategoryImage(targetId, { image: compressed });
      if (ok) {
        setCategoryImages((prev) => prev.map((img) => (img.id === targetId ? { ...img, image: compressed } : img)));
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadingRowId(null);
    }
  };

  const handleEditCategoryImageCategories = (imageId) => {
    const image = categoryImages.find((img) => img.id === imageId);
    if (!image) return;
    setEditingCategoryImageId(imageId);
    setSelectedCategories([...image.categories]);
  };

  const handleCancelEditCategoryImageCategories = () => {
    setEditingCategoryImageId(null);
    setSelectedCategories([]);
  };

  const handleSaveCategoryImageCategories = async () => {
    if (!editingCategoryImageId) return;
    const alreadyAssigned = await getAlreadyAssignedCategories(selectedCategories, editingCategoryImageId);
    if (alreadyAssigned.length > 0) {
      alert(CATEGORY_ALREADY_ASSIGNED_ERROR.replace('{categories}', alreadyAssigned.join(', ')));
      return;
    }
    const ok = await updateCategoryImage(editingCategoryImageId, { categories: selectedCategories });
    if (ok) {
      const savedId = editingCategoryImageId;
      setCategoryImages((prev) => prev.map((img) => (img.id === savedId ? { ...img, categories: selectedCategories } : img)));
    }
    setEditingCategoryImageId(null);
    setSelectedCategories([]);
  };

  const handleDeleteCategoryImage = (imageId) => {
    const idx = categoryImages.findIndex((img) => img.id === imageId);
    if (idx === -1) return;
    const removedImage = categoryImages[idx];

    setCategoryImages((prev) => prev.filter((img) => img.id !== imageId));
    removeCategoryImage(imageId).catch((error) => console.error('Error removing category image:', error));

    undo.notifyDeleted({
      id: `catimg:${imageId}`,
      name: categoryImageRowName(removedImage),
      undo: () => {
        addCategoryImage(removedImage.image, removedImage.categories).then((restoredImage) => {
          setCategoryImages((prev) => {
            const insertAt = Math.min(idx, prev.length);
            return [...prev.slice(0, insertAt), restoredImage, ...prev.slice(insertAt)];
          });
        }).catch((error) => console.error('Error restoring category image:', error));
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
          <h2>Bilder & Icons</h2>
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
        <h2>Bilder & Icons</h2>
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
                  isAddingCuisineRow={group.id === CUISINE_TYPES_GROUP_ID && cuisineAddGroupId === group.id}
                  cuisineAddControls={group.id === CUISINE_TYPES_GROUP_ID ? (
                    cuisineAddGroupId === group.id ? (
                      <NewCuisineTypeRow
                        value={cuisineAddValue}
                        onChange={setCuisineAddValue}
                        suggestions={availableCuisineTypeNames}
                        onSelect={(name) => handleSelectCuisineType(group.id, name)}
                        onCancel={handleCancelAddCuisineRow}
                      />
                    ) : (
                      <div className="bia-cuisine-add-row">
                        <button
                          type="button"
                          className="bia-btn-dashed"
                          onClick={() => handleStartAddCuisineRow(group.id)}
                          disabled={availableCuisineTypeNames.length === 0}
                          title={availableCuisineTypeNames.length === 0 ? 'Alle Kulinarik-Typen sind bereits als Zeile angelegt' : undefined}
                        >
                          + Bild/Icon
                        </button>
                      </div>
                    )
                  ) : null}
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

        <div className="bia-card bia-catimg-card">
          <div className="bia-group-header">
            <button
              type="button"
              className="bia-chevron"
              onClick={() => setCollapsed((c) => ({ ...c, catimg: !c.catimg }))}
              aria-label={collapsed.catimg ? 'Speisekategorien ausklappen' : 'Speisekategorien einklappen'}
            >
              {collapsed.catimg ? '▶' : '▼'}
            </button>
            <span className="bia-group-name bia-group-name-static">Speisekategorien</span>
            <span className="bia-group-meta">{categoryImages.length} {categoryImages.length === 1 ? 'Bild' : 'Bilder'}</span>
          </div>

          {!collapsed.catimg && (
            <>
              <p className="section-description bia-catimg-description">
                Jede Speisekategorie bekommt (analog zu den Kulinarik-Typen oben) eine eigene Zeile mit einem Bild.
                Es wird als Platzhalter verwendet, wenn ein Rezept ohne Titelbild gespeichert wird.
              </p>

              <div className="bia-catimg-rows">
                {categoryImages.map((img) => (
                  <CategoryImageRow
                    key={img.id}
                    img={img}
                    mealCategories={mealCategories}
                    categoryImages={categoryImages}
                    isDeleteVisible={catimgDeleteVisibleId === img.id}
                    onDeleteVisibleChange={(visible) => setCatimgDeleteVisibleId(visible ? img.id : null)}
                    onImageClick={handleRowImageClick}
                    isUploading={uploadingRowId === img.id}
                    isEditing={editingCategoryImageId === img.id}
                    selectedCategories={selectedCategories}
                    onCategoryToggle={handleCategoryToggle}
                    onStartEdit={handleEditCategoryImageCategories}
                    onSaveEdit={handleSaveCategoryImageCategories}
                    onCancelEdit={handleCancelEditCategoryImageCategories}
                    onDelete={() => handleDeleteCategoryImage(img.id)}
                  />
                ))}
                {categoryImages.length === 0 && !catimgAdding && (
                  <div className="bia-empty-group">Noch keine Kategoriebilder</div>
                )}
                {catimgAdding ? (
                  <NewCategoryImageRow
                    value={catimgAddValue}
                    onChange={setCatimgAddValue}
                    suggestions={availableMealCategoryNames}
                    onSelect={handleSelectMealCategory}
                    onCancel={handleCancelAddCategoryImage}
                  />
                ) : (
                  <div className="bia-cuisine-add-row">
                    <button
                      type="button"
                      className="bia-btn-dashed"
                      onClick={handleStartAddCategoryImage}
                      disabled={availableMealCategoryNames.length === 0}
                      title={availableMealCategoryNames.length === 0 ? 'Alle Speisekategorien sind bereits als Zeile angelegt' : undefined}
                    >
                      + Bild/Icon
                    </button>
                  </div>
                )}
              </div>

              <input
                type="file"
                accept="image/*"
                ref={categoryFileInputRef}
                onChange={handleRowImageFileChange}
                style={{ display: 'none' }}
              />
            </>
          )}
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
