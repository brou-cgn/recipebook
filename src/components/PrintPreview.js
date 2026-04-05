import React from 'react';
import './PrintPreview.css';
import { mergePrintElementsWithDefaults } from '../utils/customLists';
import { formatIngredientAsFraction } from '../utils/ingredientUtils';

/**
 * Renders recipe content for a given element id, with optional image aspect ratio.
 */
function ElementContent({ id, recipe, aspectRatio }) {
  // Helper to get all images for this recipe
  const getAllImages = () =>
    Array.isArray(recipe.images) && recipe.images.length > 0
      ? recipe.images
      : recipe.image
      ? [{ url: recipe.image }]
      : [];

  switch (id) {
    case 'title':
      return (
        <div className="ppv-el-title">
          {recipe.title || '(kein Titel)'}
        </div>
      );

    case 'images': {
      const allImages = getAllImages();
      const firstImage = allImages[0];
      if (!firstImage) {
        return <div className="ppv-el-placeholder">Kein Foto</div>;
      }
      const imgStyle = aspectRatio && aspectRatio !== 'none'
        ? { aspectRatio, width: '100%', objectFit: 'cover', display: 'block' }
        : undefined;
      return (
        <img
          src={firstImage.url}
          alt={recipe.title}
          className="ppv-el-image"
          style={imgStyle}
        />
      );
    }

    case 'photo1':
    case 'photo2':
    case 'photo3': {
      const photoIndex = parseInt(id.replace('photo', ''), 10) - 1;
      const allImages = getAllImages();
      const img = allImages[photoIndex];
      if (!img) {
        return (
          <div className="ppv-el-placeholder">Kein Foto {photoIndex + 1}</div>
        );
      }
      const imgStyle = aspectRatio && aspectRatio !== 'none'
        ? { aspectRatio, width: '100%', objectFit: 'cover', display: 'block' }
        : undefined;
      return (
        <img src={img.url} alt={recipe.title} className="ppv-el-image" style={imgStyle} />
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

    case 'ingredientsHeading':
      return <div className="ppv-el-section-heading">Zutaten</div>;

    case 'stepsHeading':
      return <div className="ppv-el-section-heading">Zubereitung</div>;

    case 'ingredients': {
      const ingredients = recipe.ingredients || [];
      return (
        <div className="ppv-el-ingredients">
          <ul className="ppv-el-list">
            {ingredients.slice(0, 12).map((ing, i) => {
              const text = typeof ing === 'string' ? ing : ing.text || '';
              const isHeading = typeof ing !== 'string' && ing.type === 'heading';
              return isHeading ? (
                <li key={i} className="ppv-el-list-heading">{text}</li>
              ) : (
                <li key={i}>{formatIngredientAsFraction(text)}</li>
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
  const pageWidthCm = format?.pageWidthCm ?? (orientation === 'landscape' ? 29.7 : 21.0);
  const pageHeightCm = format?.pageHeightCm ?? (orientation === 'landscape' ? 21.0 : 29.7);
  const pagePaddingBottom = `${(pageHeightCm / pageWidthCm) * 100}%`;
  const elements = mergePrintElementsWithDefaults(format?.elements, orientation);

  return (
    <div className="ppv-root">
      <div
        className="ppv-page"
        style={{ paddingBottom: pagePaddingBottom, fontFamily }}
      >
        <div className="ppv-page-inner">
          {elements.map((el) => {
            if (el.visible === false) return null;
            const rotation = el.rotation || 0;
            const elStyle = {
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
            };
            if (rotation) {
              elStyle.transform = `rotate(${rotation}deg)`;
            }
            if (el.fontSizeScale && el.fontSizeScale !== 1) {
              elStyle.fontSize = `${el.fontSizeScale}em`;
            }
            if (el.fontBold) elStyle.fontWeight = 'bold';
            if (el.fontItalic) elStyle.fontStyle = 'italic';
            if (el.fontUnderline) elStyle.textDecoration = 'underline';
            if (el.fontColor) elStyle.color = el.fontColor;

            // Text alignment
            if (el.textAlignH) {
              elStyle.textAlign = el.textAlignH;
            }
            if (el.textAlignV && el.textAlignV !== 'top') {
              elStyle.display = 'flex';
              elStyle.flexDirection = 'column';
              elStyle.alignItems = 'stretch';
              elStyle.justifyContent = el.textAlignV === 'bottom' ? 'flex-end' : 'center';
            }

            // Border styles
            const hasBorder = el.borderTop || el.borderRight || el.borderBottom || el.borderLeft;
            if (hasBorder) {
              const bw = `${el.borderWidth || 1}px`;
              const bc = el.borderColor || '#000000';
              const b = `${bw} solid ${bc}`;
              elStyle.borderTop = el.borderTop ? b : 'none';
              elStyle.borderRight = el.borderRight ? b : 'none';
              elStyle.borderBottom = el.borderBottom ? b : 'none';
              elStyle.borderLeft = el.borderLeft ? b : 'none';
            }

            return (
              <div
                key={el.id}
                className="ppv-element"
                style={elStyle}
              >
                <ElementContent id={el.id} recipe={recipe} aspectRatio={el.aspectRatio} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
