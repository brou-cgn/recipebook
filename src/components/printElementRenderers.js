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
 * Renderers for the parts of a printed recipe; FlowPage places them on the page.
 * Each renderer receives `{ recipe, ctx, element }` where ctx carries the print
 * context: { servings, authorName, portionLabel, mode }. A renderer returns null
 * when there is nothing to print.
 */

function Photo({ index, recipe, element }) {
  const img = getRecipeImages(recipe)[index];
  if (!img) return null;
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
  const heading = `Zutaten${ctx.servings ? ` für ${ctx.servings} ${ctx.portionLabel || 'Portionen'}` : ''}`;
  return (
    <div className="ppv-el-ingredients">
      <Heading text={heading} />
      <ul className="ppv-el-list">
        {lines.map((line, i) => (
          <li key={i} className={line.type === 'heading' ? 'ppv-el-list-heading' : undefined}>{line.text}</li>
        ))}
      </ul>
    </div>
  );
}

function Steps({ recipe }) {
  const lines = buildStepLines(recipe);
  return (
    <div className="ppv-el-steps">
      <Heading text="Zubereitung" />
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

/** id -> component: the text blocks of FLOW_ELEMENTS (printTemplates.js) and one renderer per photo. */
export const PRINT_ELEMENT_RENDERERS = {
  title: Title,
  authorDate: AuthorDate,
  metadata: Metadata,
  ingredients: Ingredients,
  steps: Steps,
  photo1: (props) => <Photo index={0} {...props} />,
  photo2: (props) => <Photo index={1} {...props} />,
  photo3: (props) => <Photo index={2} {...props} />,
  photo4: (props) => <Photo index={3} {...props} />,
};
