import React, { useState, useEffect } from 'react';
import './FilterPage.css';
import { getCustomLists } from '../utils/customLists';

function FilterPage({ currentFilters, onApply, onCancel, availableAuthors }) {
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

  const handleCuisineToggle = (category) => {
    setSelectedCuisines(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleAuthorToggle = (authorId) => {
    setSelectedAuthors(prev =>
      prev.includes(authorId)
        ? prev.filter(a => a !== authorId)
        : [...prev, authorId]
    );
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

        {availableCategories.length > 0 && (
          <div className="filter-section">
            <h3>Kulinarik</h3>
            <div className="filter-options">
              {availableCategories.map(category => (
                <label key={category} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedCuisines.includes(category)}
                    onChange={() => handleCuisineToggle(category)}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {availableAuthors && availableAuthors.length > 0 && (
          <div className="filter-section">
            <h3>Autor</h3>
            <div className="filter-options">
              {availableAuthors.map(author => (
                <label key={author.id} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedAuthors.includes(author.id)}
                    onChange={() => handleAuthorToggle(author.id)}
                  />
                  <span>{author.name}</span>
                </label>
              ))}
            </div>
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
