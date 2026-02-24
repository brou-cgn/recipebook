import React, { useState, useEffect } from 'react';
import './FilterPage.css';
import { getCustomLists } from '../utils/customLists';

function FilterPage({ currentFilters, onApply, onCancel, availableAuthors, isAdmin, privateGroups }) {
  const [showDrafts, setShowDrafts] = useState('all');
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [selectedAuthors, setSelectedAuthors] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [availableCategories, setAvailableCategories] = useState([]);
  const [expandedSections, setExpandedSections] = useState({
    group: true,
    cuisine: true,
    author: true,
    status: true
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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
            <button
              className="filter-section-header"
              onClick={() => toggleSection('group')}
              aria-expanded={expandedSections.group}
            >
              <span className="filter-section-title">
                Private Liste
                {selectedGroup && <span className="filter-section-active-dot" aria-hidden="true" />}
              </span>
              <span className="filter-section-arrow">{expandedSections.group ? '▲' : '▼'}</span>
            </button>
            {expandedSections.group && (
              <div className="filter-section-content">
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
          </div>
        )}

        {availableCategories.length > 0 && (
          <div className="filter-section">
            <button
              className="filter-section-header"
              onClick={() => toggleSection('cuisine')}
              aria-expanded={expandedSections.cuisine}
            >
              <span className="filter-section-title">
                Kulinarik
                {selectedCuisines.length > 0 && <span className="filter-section-active-dot" aria-hidden="true" />}
              </span>
              <span className="filter-section-arrow">{expandedSections.cuisine ? '▲' : '▼'}</span>
            </button>
            {expandedSections.cuisine && (
              <div className="filter-section-content">
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
          </div>
        )}

        {availableAuthors && availableAuthors.length > 0 && (
          <div className="filter-section">
            <button
              className="filter-section-header"
              onClick={() => toggleSection('author')}
              aria-expanded={expandedSections.author}
            >
              <span className="filter-section-title">
                Autor
                {selectedAuthors.length > 0 && <span className="filter-section-active-dot" aria-hidden="true" />}
              </span>
              <span className="filter-section-arrow">{expandedSections.author ? '▲' : '▼'}</span>
            </button>
            {expandedSections.author && (
              <div className="filter-section-content">
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
          </div>
        )}

        {isAdmin && (
          <div className="filter-section">
            <button
              className="filter-section-header"
              onClick={() => toggleSection('status')}
              aria-expanded={expandedSections.status}
            >
              <span className="filter-section-title">
                Rezept-Status
                {showDrafts !== 'all' && <span className="filter-section-active-dot" aria-hidden="true" />}
              </span>
              <span className="filter-section-arrow">{expandedSections.status ? '▲' : '▼'}</span>
            </button>
            {expandedSections.status && (
              <div className="filter-section-content">
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
