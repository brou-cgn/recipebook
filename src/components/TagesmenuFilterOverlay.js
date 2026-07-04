import React, { useState, useEffect, useRef, useMemo } from 'react';
import './MobileSearchOverlay.css';

const DEBOUNCE_DELAY_MS = 200;
// Delay in ms before auto-focusing the input – gives the slide-up animation
// a head-start before the keyboard appears, preventing a jarring layout jump.
const FOCUS_DELAY_MS = 120;

/**
 * Filter overlay for the Tagesmenü page.
 *
 * Shows interactive lists as selectable pills plus a search bar to filter
 * them by name. Reuses the MobileSearchOverlay styling.
 *
 * @param {boolean}  props.isOpen           - Whether the overlay is visible
 * @param {Function} props.onClose          - Called when the overlay should close
 * @param {Array}    props.interactiveLists - The available interactive lists
 * @param {string}   props.selectedListId   - The currently selected list id
 * @param {Function} props.onSelectList     - Called with a list id when a pill is tapped
 * @param {Array}    props.categoryOptions   - Available meal categories
 * @param {Array}    props.selectedCategories - The currently selected meal categories
 * @param {Function} props.onSelectCategory  - Called with new categories array when toggled
 */
function TagesmenuFilterOverlay({
  isOpen,
  onClose,
  interactiveLists,
  selectedListId,
  onSelectList,
  categoryOptions = [],
  selectedCategories = [],
  onSelectCategory,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  // panelBottom tracks how far from the bottom of the screen the panel sits
  // (= 0 normally, > 0 when the software keyboard is visible on iOS)
  const [panelBottom, setPanelBottom] = useState(0);
  const inputRef = useRef(null);

  // Reset search when overlay opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setDebouncedTerm('');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, DEBOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Track keyboard height via visualViewport so the panel floats just above it
  useEffect(() => {
    if (!isOpen) return;
    const vp = window.visualViewport;
    if (!vp) return;

    const update = () => {
      const keyboardHeight = Math.max(
        0,
        window.innerHeight - vp.height - vp.offsetTop
      );
      setPanelBottom(keyboardHeight);
    };

    update();
    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  // Filter lists by search term; active (selected) list shown first
  const orderedListPills = useMemo(() => {
    let lists = interactiveLists || [];
    if (debouncedTerm) {
      const lower = debouncedTerm.toLowerCase();
      lists = lists.filter((l) => l.name.toLowerCase().includes(lower));
    }
    const active = lists.filter((l) => l.id === selectedListId);
    const inactive = lists.filter((l) => l.id !== selectedListId);
    return [...active, ...inactive];
  }, [interactiveLists, selectedListId, debouncedTerm]);

  const handleListPillClick = (listId) => {
    onSelectList(listId);
    onClose();
  };

  const handleCategoryPillClick = (categoryName) => {
    const isSelected = selectedCategories.includes(categoryName);
    const newValue = isSelected
      ? selectedCategories.filter((c) => c !== categoryName)
      : [...selectedCategories, categoryName];
    onSelectCategory?.(newValue);
  };

  // Active (selected) category pills are shown first
  const orderedCategoryPills = useMemo(() => {
    const active = categoryOptions.filter((name) => selectedCategories.includes(name));
    const inactive = categoryOptions.filter((name) => !selectedCategories.includes(name));
    return [...active, ...inactive];
  }, [categoryOptions, selectedCategories]);

  const handleClear = () => {
    setSearchTerm('');
    setDebouncedTerm('');
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <div
      className="mobile-search-overlay tagesmenu-filter-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Kochatelier filtern"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mobile-search-panel" style={{ bottom: panelBottom }}>
        {categoryOptions.length > 0 && (
          <div className="mobile-search-cuisine-grid">
            {orderedCategoryPills.map((category) => (
              <button
                key={category}
                className={`mobile-search-filter-pill mobile-search-cuisine-pill${selectedCategories.includes(category) ? ' active' : ''}`}
                onClick={() => handleCategoryPillClick(category)}
                aria-pressed={selectedCategories.includes(category)}
                title={selectedCategories.includes(category) ? 'Filter aufheben' : `Nach ${category} filtern`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* Interactive list pills */}
        {orderedListPills.length > 0 ? (
          <div className="mobile-search-private-list-grid">
            {orderedListPills.map((list) => (
              <button
                key={list.id}
                className={`mobile-search-filter-pill mobile-search-cuisine-pill${list.id === selectedListId ? ' active' : ''}`}
                onClick={() => handleListPillClick(list.id)}
                aria-pressed={list.id === selectedListId}
                title={list.id === selectedListId ? 'Aktive Liste' : `Zu ${list.name} wechseln`}
              >
                {list.name}
              </button>
            ))}
          </div>
        ) : (
          debouncedTerm && (
            <p className="mobile-search-no-results">Keine Listen gefunden</p>
          )
        )}

        {/* Search bar – anchored to the bottom of the panel, just above keyboard */}
        <div className="mobile-search-bar-row">
          <div className="mobile-search-input-wrapper">
            <span className="mobile-search-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="search"
              className="mobile-search-input"
              placeholder="Listen durchsuchen …"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Listen durchsuchen"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              enterKeyHint="search"
            />
            {searchTerm && (
              <button
                className="mobile-search-clear-btn"
                onClick={handleClear}
                aria-label="Suche löschen"
                tabIndex={0}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TagesmenuFilterOverlay;
