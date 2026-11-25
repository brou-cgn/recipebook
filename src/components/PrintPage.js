import React from 'react';
import './PrintPage.css';
import FlowPage from './FlowPage';

/**
 * PrintPage – the one renderer for a recipe on a print format page. Used by the
 * settings preview and by the real print (portal in #print-root), so both always
 * agree.
 *
 * Every print format is a template (flow layout), so FlowPage does the work; this
 * entry point also loads the styles of the print elements (PrintPage.css).
 *
 * Props:
 *   recipe       {object}  recipe to render
 *   format       {object}  print format (as returned by migrateFormat)
 *   servings     {number}  chosen servings (default recipe.portionen)
 *   authorName   {string}  resolved author first name (not stored on the recipe)
 *   portionLabel {string}  e.g. "Portionen"
 *   mode         {'preview'|'print'} preview: scaled, placeholders, page-break marks
 *   embedded     {boolean} preview only: no outer margin and no summary line
 * plus the preview props of FlowPage (selectedElement, onSelectElement, thumbnail).
 */
export default function PrintPage(props) {
  return <FlowPage {...props} />;
}
