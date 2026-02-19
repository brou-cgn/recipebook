import React, { useState, useEffect } from 'react';
import './FilterPage.css';

function FilterPage({ currentFilters, onApply, onCancel }) {
  const [showDrafts, setShowDrafts] = useState('all');

  useEffect(() => {
    // Initialize filter state from current filters
    if (currentFilters) {
      setShowDrafts(currentFilters.showDrafts || 'all');
    }
  }, [currentFilters]);

  const handleClearFilters = () => {
    setShowDrafts('all');
  };

  const handleApply = () => {
    const filters = {
      showDrafts: showDrafts
    };
    onApply(filters);
  };

  return (
    <div className="filter-page">
      <div className="filter-page-header">
        <h2>Filter</h2>
      </div>

      <div className="filter-page-content">
        <div className="filter-section">
          <h3>Rezept-Status</h3>
          <div className="filter-options">
            <label className="filter-option">
              <input
                type="radio"
                name="showDrafts"
                value="all"
                checked={showDrafts === 'all'}
                onChange={(e) => setShowDrafts(e.target.value)}
              />
              <span>Alle Rezepte</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="showDrafts"
                value="yes"
                checked={showDrafts === 'yes'}
                onChange={(e) => setShowDrafts(e.target.value)}
              />
              <span>Nur Entwürfe</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="showDrafts"
                value="no"
                checked={showDrafts === 'no'}
                onChange={(e) => setShowDrafts(e.target.value)}
              />
              <span>Keine Entwürfe</span>
            </label>
          </div>
        </div>
      </div>

      <div className="filter-page-actions">
        <button 
          className="filter-clear-button"
          onClick={handleClearFilters}
        >
          Filter löschen
        </button>
        <button 
          className="filter-apply-button"
          onClick={handleApply}
        >
          Anwenden
        </button>
      </div>
    </div>
  );
}

export default FilterPage;
