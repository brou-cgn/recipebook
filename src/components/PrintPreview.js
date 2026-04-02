import React from 'react';
import './PrintPreview.css';
import {
  PRINT_FORMAT_ELEMENTS,
  DEFAULT_PRINT_ELEMENTS_PORTRAIT,
  DEFAULT_PRINT_ELEMENTS_LANDSCAPE,
} from '../utils/customLists';

/**
 * Returns default elements for the given orientation.
 */
function getDefaultElements(orientation) {
  return orientation === 'landscape'
    ? DEFAULT_PRINT_ELEMENTS_LANDSCAPE
    : DEFAULT_PRINT_ELEMENTS_PORTRAIT;
}

/**
 * Ensures every known element ID is represented in the elements array.
 */
function mergeWithDefaults(elements, orientation) {
  const defaults = getDefaultElements(orientation);
  return PRINT_FORMAT_ELEMENTS.map((def) => {
    const existing = elements && elements.find((e) => e.id === def.id);
    if (existing) return existing;
    const fallback = defaults.find((d) => d.id === def.id);
    return fallback
      ? { ...fallback }
      : { id: def.id, x: 2, y: 2, w: 50, h: 10, visible: true };
  });
}

/**
 * Renders recipe content for a given element id.
 */
function ElementContent({ id, recipe }) {
  switch (id) {
    case 'title':
      return (
        <div className="ppv-el-title">
          {recipe.title || '(kein Titel)'}
        </div>
      );

    case 'images': {
      const allImages =
        Array.isArray(recipe.images) && recipe.images.length > 0
          ? recipe.images
          : recipe.image
          ? [{ url: recipe.image }]
          : [];
      const firstImage = allImages[0];
      if (!firstImage) {
        return <div className="ppv-el-placeholder">Kein Foto</div>;
      }
      return (
        <img
          src={firstImage.url}
          alt={recipe.title}
          className="ppv-el-image"
        />
      );
    }

    case 'authorDate': {
      const parts = [];
      if (recipe.author) parts.push(`Autor: ${recipe.author}`);
      if (recipe.createdAt) {
        const d = recipe.createdAt?.toDate
          ? recipe.createdAt.toDate()
          : new Date(recipe.createdAt);
        if (!isNaN(d)) {
          parts.push(
            `Erstellt am: ${d.toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}`
          );
        }
      }
      if (parts.length === 0) return null;
      return <div className="ppv-el-author-date">{parts.join(' · ')}</div>;
    }

    case 'metadata': {
      const items = [];
      if (recipe.kochzeit || recipe.kochdauer) {
        items.push(`Zeit: ${recipe.kochzeit || recipe.kochdauer} Min.`);
      }
      if (recipe.portionen) {
        items.push(`Portionen: ${recipe.portionen}`);
      }
      if (recipe.schwierigkeit) {
        const diff = Math.min(5, Math.max(0, recipe.schwierigkeit));
        items.push(`Schwierigkeit: ${'★'.repeat(diff)}${'☆'.repeat(5 - diff)}`);
      }
      if (items.length === 0) return <div className="ppv-el-placeholder">Metadaten</div>;
      return (
        <div className="ppv-el-metadata">
          {items.map((item, i) => (
            <span key={i} className="ppv-el-metadata-item">{item}</span>
          ))}
        </div>
      );
    }

    case 'ingredients': {
      const ingredients = recipe.ingredients || [];
      return (
        <div className="ppv-el-ingredients">
          <div className="ppv-el-section-heading">Zutaten</div>
          <ul className="ppv-el-list">
            {ingredients.slice(0, 12).map((ing, i) => {
              const text = typeof ing === 'string' ? ing : ing.text || '';
              const isHeading = typeof ing !== 'string' && ing.type === 'heading';
              return isHeading ? (
                <li key={i} className="ppv-el-list-heading">{text}</li>
              ) : (
                <li key={i}>{text}</li>
              );
            })}
            {ingredients.length > 12 && (
              <li className="ppv-el-more">… ({ingredients.length - 12} weitere)</li>
            )}
          </ul>
        </div>
      );
    }

    case 'steps': {
      const steps = recipe.steps || [];
      return (
        <div className="ppv-el-steps">
          <div className="ppv-el-section-heading">Zubereitung</div>
          <ol className="ppv-el-list ppv-el-steps-list">
            {steps.slice(0, 8).map((step, i) => {
              const item =
                typeof step === 'string' ? { type: 'step', text: step } : step;
              if (item.type === 'heading') {
                return (
                  <li key={i} className="ppv-el-list-heading">{item.text}</li>
                );
              }
              return <li key={i}>{item.text}</li>;
            })}
            {steps.length > 8 && (
              <li className="ppv-el-more">… ({steps.length - 8} weitere)</li>
            )}
          </ol>
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * PrintPreview – renders a recipe in a scaled-down A4 page using a given print format.
 *
 * Props:
 *   recipe  {object} - The recipe object to preview
 *   format  {object} - The print format object (from PrintFormatEditor)
 */
export default function PrintPreview({ recipe, format }) {
  if (!recipe || !format) return null;

  const orientation = format?.orientation || 'portrait';
  const fontFamily = format?.fontFamily || "Georgia, 'Times New Roman', serif";
  const pagePaddingBottom = orientation === 'landscape' ? '70.71%' : '141.43%';
  const elements = mergeWithDefaults(format?.elements, orientation);

  return (
    <div className="ppv-root">
      <div
        className="ppv-page"
        style={{ paddingBottom: pagePaddingBottom, fontFamily }}
      >
        <div className="ppv-page-inner">
          {elements.map((el) => {
            if (el.visible === false) return null;
            return (
              <div
                key={el.id}
                className="ppv-element"
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.w}%`,
                  height: `${el.h}%`,
                }}
              >
                <ElementContent id={el.id} recipe={recipe} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
