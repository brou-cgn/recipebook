import React from 'react';
import {
  getRecipeImages,
  buildAuthorDateText,
  buildMetadataItems,
  buildIngredientLines,
  buildStepLines,
  getServingMultiplier,
} from '../utils/printRecipe';

/**
 * Renderers for every print element of the registry (printElements.js).
 * Each renderer receives `{ recipe, ctx, element }` where ctx carries the print
 * context: { servings, authorName, portionLabel, mode, showIngredientsHeading,
 * showStepsHeading }. A renderer returns null when there is nothing to print.
 */

function Photo({ index, recipe, ctx, element }) {
  const img = getRecipeImages(recipe)[index];
  if (!img) {
    return ctx.mode === 'preview'
      ? <div className="ppv-el-placeholder">Kein Foto {index + 1}</div>
      : null;
  }
  const ratio = element?.aspectRatio;
  const style = ratio && ratio !== 'none'
    ? { aspectRatio: ratio, width: '100%', objectFit: 'cover', display: 'block' }
    : undefined;
  return <img src={img.url} alt={recipe.title || ''} className="ppv-el-image" style={style} />;
}

function Title({ recipe }) {
  return <h1 className="ppv-el-title">{recipe.title || '(kein Titel)'}</h1>;
}

function AuthorDate({ recipe, ctx }) {
  const text = buildAuthorDateText(ctx.authorName, recipe.createdAt);
  return text ? <div className="ppv-el-author-date">{text}</div> : null;
}

function Metadata({ recipe, ctx }) {
  const items = buildMetadataItems(recipe, { servings: ctx.servings, portionLabel: ctx.portionLabel });
  if (items.length === 0) {
    return ctx.mode === 'preview' ? <div className="ppv-el-placeholder">Metadaten</div> : null;
  }
  return (
    <div className="ppv-el-metadata">
      {items.map((item) => (
        <span key={item.key} className={`ppv-el-metadata-item ppv-el-metadata-item--${item.key}`}>{item.text}</span>
      ))}
    </div>
  );
}

function Heading({ text }) {
  return <h2 className="ppv-el-section-heading">{text}</h2>;
}

function Ingredients({ recipe, ctx }) {
  const lines = buildIngredientLines(recipe, getServingMultiplier(recipe, ctx.servings));
  const heading = !ctx.showIngredientsHeading
    ? `Zutaten${ctx.servings ? ` für ${ctx.servings} ${ctx.portionLabel || 'Portionen'}` : ''}`
    : null;
  return (
    <div className="ppv-el-ingredients">
      {heading && <Heading text={heading} />}
      <ul className="ppv-el-list">
        {lines.map((line, i) => (
          <li key={i} className={line.type === 'heading' ? 'ppv-el-list-heading' : undefined}>{line.text}</li>
        ))}
      </ul>
    </div>
  );
}

function Steps({ recipe, ctx }) {
  const lines = buildStepLines(recipe);
  return (
    <div className="ppv-el-steps">
      {!ctx.showStepsHeading && <Heading text="Zubereitung" />}
      <ol className="ppv-el-list ppv-el-steps-list">
        {lines.map((line, i) => (
          line.type === 'heading'
            ? <li key={i} className="ppv-el-list-heading">{line.text}</li>
            : <li key={i} value={line.number}>{line.text}</li>
        ))}
      </ol>
    </div>
  );
}

/** id -> component. Must contain every id of PRINT_FORMAT_ELEMENTS (tested). */
export const PRINT_ELEMENT_RENDERERS = {
  title: Title,
  authorDate: AuthorDate,
  metadata: Metadata,
  ingredients: Ingredients,
  steps: Steps,
  ingredientsHeading: () => <Heading text="Zutaten" />,
  stepsHeading: () => <Heading text="Zubereitung" />,
  photo1: (props) => <Photo index={0} {...props} />,
  photo2: (props) => <Photo index={1} {...props} />,
  photo3: (props) => <Photo index={2} {...props} />,
  photo4: (props) => <Photo index={3} {...props} />,
};
