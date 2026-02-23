import React, { useState, useEffect } from 'react';
import './FilterPage.css';
import { getCustomLists } from '../utils/customLists';

function FilterPage({ currentFilters, onApply, onCancel, availableAuthors, isAdmin, privateGroups }) {
  const [showDrafts, setShowDrafts] = useState('all');
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedAuthors, setSelectedAuthors] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [availableCategories, setAvailableCategories] = useState([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const lists = await getCustomLists();
        setAvailableCategories(lists.cuisineTypes || []);
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
      setSelectedGroup(currentFilters.selectedGroup || '');
    }
  }, [currentFilters]);

  const handleCuisineToggle = (category) => {
    setSelectedCuisines(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const handleAuthorToggle = (authorId) => {
    setSelectedAuthors(prev =>
      prev.includes(authorId) ? prev.filter(a => a !== authorId) : [...prev, authorId]
    );
  };

  const handleClearFilters = () => {
    setShowDrafts('all');
    setSelectedCuisines([]);
    setSelectedAuthors([]);
    setSelectedGroup('');
  };

  const handleApply = () => {
    const filters = {
      showDrafts,
      selectedCuisines,
      selectedAuthors,
      selectedGroup
    };
    onApply(filters);
  };

  return (
    <div className="filter-page">
      <div className="filter-page-header">
        <h2>Filter</h2>
      </div>

      <div className="filter-page-content">
        {privateGroups && privateGroups.length > 0 && (
          <div className="filter-section">
            <h3>Private Liste</h3>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="filter-select"
              aria-label="Private Liste"
            >
              <option value="">Alle Listen</option>
              {privateGroups.map(group => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
        )}

        {availableCategories.length > 0 && (
          <div className="filter-section">
            <h3>Kulinarik</h3>
            <div className="filter-checkbox-grid">
              {availableCategories.map(category => (
                <label key={category} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    value={category}
                    checked={selectedCuisines.includes(category)}
                    onChange={() => handleCuisineToggle(category)}
                  />
                  {category}
                </label>
              ))}
            </div>
          </div>
        )}

        {availableAuthors && availableAuthors.length > 0 && (
          <div className="filter-section">
            <h3>Autor</h3>
            <div className="filter-checkbox-grid">
              {availableAuthors.map(author => (
                <label key={author.id} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    value={author.id}
                    checked={selectedAuthors.includes(author.id)}
                    onChange={() => handleAuthorToggle(author.id)}
                  />
                  {author.name}
                </label>
              ))}
            </div>
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
