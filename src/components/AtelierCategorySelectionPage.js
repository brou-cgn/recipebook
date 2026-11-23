import React, { useMemo } from 'react';
import './AtelierCategorySelectionPage.css';
import { useListenwerte, useTexte } from '../contexts/SpracheContext';
import atelierTexte from '../i18n/texte/atelier';

function AtelierCategorySelectionPage({
  categoryOptions = [],
  selectedCategories = [],
  onSelectedCategoriesChange,
  onContinue,
}) {
  // Texte des Ateliers (Mehrsprachigkeit PR 6n); Speisekategorien übersetzt, gespeichert bleibt der deutsche Wert
  const t = useTexte(atelierTexte);
  const listen = useListenwerte();
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
        <p className="atelier-category-selection__eyebrow">{t('vorbereiten')}</p>
        <h1 className="atelier-category-selection__title">{t('wonachSuchst')}</h1>
        <p className="atelier-category-selection__body">
          {t('inspirationHinweis')}
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
                {listen.text('mealCategories', category)}
              </button>
            ))}
          </div>
        ) : (
          <p className="atelier-category-selection__empty">
            {t('keineKategorien')}
          </p>
        )}

        <button
          type="button"
          className="atelier-category-selection__continue"
          onClick={onContinue}
        >
          {t('kochatelierOeffnen')}
        </button>
      </div>
    </section>
  );
}

export default AtelierCategorySelectionPage;
