import React, { useMemo } from 'react';
import PrintPage from '../PrintPage';
import { PRINT_TEMPLATES, buildFlowFormat } from '../../utils/printTemplates';
import { SAMPLE_RECIPE } from '../../utils/printSampleRecipe';

/** Template cards with a live thumbnail each; the active template is marked. */
export default function TemplateGallery({ activeId, onSelect }) {
  const thumbs = useMemo(
    () => PRINT_TEMPLATES.map((t) => ({
      template: t,
      format: buildFlowFormat({ id: `thumb-${t.id}`, name: t.label, templateId: t.id }),
    })),
    [],
  );
  return (
    <div className="tfe-gallery" role="radiogroup" aria-label="Vorlage">
      {thumbs.map(({ template, format }) => (
        <button
          key={template.id}
          type="button"
          role="radio"
          aria-checked={activeId === template.id}
          className={`tfe-template${activeId === template.id ? ' tfe-template--active' : ''}`}
          onClick={() => onSelect(template.id)}
          title={template.description}
        >
          <span className="tfe-template-thumb" aria-hidden="true">
            <PrintPage recipe={SAMPLE_RECIPE} format={format} mode="preview" embedded thumbnail />
          </span>
          <span className="tfe-template-name">{template.label}</span>
        </button>
      ))}
    </div>
  );
}
