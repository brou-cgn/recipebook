import React, { useMemo } from 'react';
import './AtelierCategorySelectionPage.css';

function AtelierCategorySelectionPage({
  categoryOptions = [],
  selectedCategories = [],
  onSelectedCategoriesChange,
  onContinue,
}) {
  const orderedCategoryOptions = useMemo(() => {
    const active = categoryOptions.filter((category) => selectedCategories.includes(category));
    const inactive = categoryOptions.filter((category) => !selectedCategories.includes(category));
    return [...active, ...inactive];
  }, [categoryOptions, selectedCategories]);

  const handleToggleCategory = (category) => {
    const nextCategories = selectedCategories.includes(category)
      ? selectedCategories.filter((value) => value !== category)
      : [...selectedCategories, category];
    onSelectedCategoriesChange?.(nextCategories);
  };

  return (
    <section className="atelier-category-selection" data-testid="atelier-category-selection-view">
      <div className="atelier-category-selection__content">
        <p className="atelier-category-selection__eyebrow">Kochatelier vorbereiten</p>
        <h1 className="atelier-category-selection__title">Speisekategorien auswählen</h1>
        <p className="atelier-category-selection__body">
          Wähle aus, was heute in deinen Swipestapel soll. Ohne Auswahl werden alle Kategorien
          angezeigt.
        </p>

        {orderedCategoryOptions.length > 0 ? (
          <div className="atelier-category-selection__grid">
            {orderedCategoryOptions.map((category) => (
              <button
                key={category}
                type="button"
                className={`atelier-category-selection__pill${selectedCategories.includes(category) ? ' active' : ''}`}
                aria-pressed={selectedCategories.includes(category)}
                onClick={() => handleToggleCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        ) : (
          <p className="atelier-category-selection__empty">
            Aktuell sind noch keine Speisekategorien verfügbar.
          </p>
        )}

        <button
          type="button"
          className="atelier-category-selection__continue"
          onClick={onContinue}
        >
          Kochatelier öffnen
        </button>
      </div>
    </section>
  );
}

export default AtelierCategorySelectionPage;
