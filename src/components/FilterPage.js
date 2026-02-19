import React, { useState, useEffect } from 'react';
import './FilterPage.css';
import { getCustomLists } from '../utils/customLists';

function FilterPage({ currentFilters, onApply, onCancel, availableAuthors, isAdmin }) {
  const [showDrafts, setShowDrafts] = useState('all');
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedAuthors, setSelectedAuthors] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const lists = await getCustomLists();
        setAvailableCategories(lists.mealCategories || []);
      } catch (error) {
        setAvailableCategories([]);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    // Initialize filter state from current filters
    if (currentFilters) {
      setShowDrafts(currentFilters.showDrafts || 'all');
      setSelectedCuisines(currentFilters.selectedCuisines || []);
      setSelectedAuthors(currentFilters.selectedAuthors || []);
    }
  }, [currentFilters]);

  const handleCuisineChange = (e) => {
    const selected = Array.from(e.target.selectedOptions, option => option.value);
    setSelectedCuisines(selected);
  };

  const handleAuthorChange = (e) => {
    const selected = Array.from(e.target.selectedOptions, option => option.value);
    setSelectedAuthors(selected);
  };

  const handleClearFilters = () => {
    setShowDrafts('all');
    setSelectedCuisines([]);
    setSelectedAuthors([]);
  };

  const handleApply = () => {
    const filters = {
      showDrafts,
      selectedCuisines,
      selectedAuthors
    };
    onApply(filters);
  };

  return (
    <div className="filter-page">
      <div className="filter-page-header">
        <h2>Filter</h2>
      </div>

      <div className="filter-page-content">
        {availableCategories.length > 0 && (
          <div className="filter-section">
            <h3>Kulinarik</h3>
            <select
              multiple
              value={selectedCuisines}
              onChange={handleCuisineChange}
              className="filter-select"
              aria-label="Kulinarik"
            >
              {availableCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        )}

        {availableAuthors && availableAuthors.length > 0 && (
          <div className="filter-section">
            <h3>Autor</h3>
            <select
              multiple
              value={selectedAuthors}
              onChange={handleAuthorChange}
              className="filter-select"
              aria-label="Autor"
            >
              {availableAuthors.map(author => (
                <option key={author.id} value={author.id}>{author.name}</option>
              ))}
            </select>
          </div>
        )}

        {isAdmin && (
          <div className="filter-section">
            <h3>Rezept-Status</h3>
            <select
              value={showDrafts}
              onChange={(e) => setShowDrafts(e.target.value)}
              className="filter-select"
            >
              <option value="all">Alle Rezepte</option>
              <option value="yes">Nur Entwürfe</option>
              <option value="no">Keine Entwürfe</option>
            </select>
          </div>
        )}
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
