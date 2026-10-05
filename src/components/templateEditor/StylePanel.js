import React from 'react';
import Segmented from './Segmented';
import { PRINT_FONT_OPTIONS } from '../../utils/printElements';
import {
  FLOW_BASE_SIZES, FLOW_SPACINGS, FLOW_HEADING_STYLES, FLOW_PHOTO_POSITIONS, FLOW_PHOTO_SIZES,
  FLOW_PHOTO_ASPECTS, FLOW_COLUMNS, FLOW_METADATA_STYLES, FLOW_ALIGNMENTS, FLOW_ELEMENTS,
  PAPER_PRESETS, MIN_MARGIN_CM, MAX_MARGIN_CM,
} from '../../utils/printTemplates';

const CUSTOM = 'custom';
const sameSize = (p, w, h) => Math.abs(p.widthCm - w) < 0.05 && Math.abs(p.heightCm - h) < 0.05;

function paperIdFor(page) {
  const portraitW = Math.min(page.widthCm, page.heightCm);
  const portraitH = Math.max(page.widthCm, page.heightCm);
  return PAPER_PRESETS.find((p) => sameSize(p, portraitW, portraitH))?.id || CUSTOM;
}

function Section({ title, defaultOpen = false, children }) {
  return (
    <details className="tfe-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="tfe-section-body">{children}</div>
    </details>
  );
}

/** All options of a flow format as plain controls. */
export default function StylePanel({ format, page, style, onStyle, onPage }) {
  const paperId = paperIdFor(page);
  const landscape = page.widthCm >= page.heightCm;
  const setPaper = (id) => {
    const p = PAPER_PRESETS.find((x) => x.id === id);
    if (!p) return;
    onPage(landscape ? { widthCm: p.heightCm, heightCm: p.widthCm } : { widthCm: p.widthCm, heightCm: p.heightCm });
  };
  const setOrientation = (value) => {
    const long = Math.max(page.widthCm, page.heightCm);
    const short = Math.min(page.widthCm, page.heightCm);
    onPage(value === 'landscape' ? { widthCm: long, heightCm: short } : { widthCm: short, heightCm: long });
  };

  return (
    <div className="tfe-panel">
      <Section title="Seite" defaultOpen>
        <div className="tfe-field">
          <label className="tfe-label" htmlFor="tfe-paper">Papierformat</label>
          <select id="tfe-paper" className="pfe-select" value={paperId} onChange={(e) => setPaper(e.target.value)}>
            {PAPER_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value={CUSTOM}>Eigene Größe</option>
          </select>
        </div>
        <Segmented
          label="Ausrichtung"
          options={[{ value: 'portrait', label: 'Hochformat' }, { value: 'landscape', label: 'Querformat' }]}
          value={landscape ? 'landscape' : 'portrait'}
          onChange={setOrientation}
        />
        {paperId === CUSTOM && (
          <div className="tfe-field tfe-inline">
            <input type="number" className="pfe-props-number" min="5" max="200" step="0.1" value={page.widthCm}
              aria-label="Seitenbreite in cm" onChange={(e) => onPage({ widthCm: parseFloat(e.target.value) || page.widthCm })} />
            <span>×</span>
            <input type="number" className="pfe-props-number" min="5" max="200" step="0.1" value={page.heightCm}
              aria-label="Seitenhöhe in cm" onChange={(e) => onPage({ heightCm: parseFloat(e.target.value) || page.heightCm })} />
            <span>cm</span>
          </div>
        )}
        <div className="tfe-field tfe-inline">
          <label className="tfe-label" htmlFor="tfe-margin">Seitenrand</label>
          <input id="tfe-margin" type="number" className="pfe-props-number" min={MIN_MARGIN_CM} max={MAX_MARGIN_CM} step="0.1"
            value={style.marginCm}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onStyle({ marginCm: Number.isFinite(v) ? Math.min(MAX_MARGIN_CM, Math.max(MIN_MARGIN_CM, v)) : style.marginCm });
            }} />
          <span>cm</span>
        </div>
      </Section>

      <Section title="Text" defaultOpen>
        <div className="tfe-field">
          <label className="tfe-label" htmlFor="tfe-font">Schriftart</label>
          <select id="tfe-font" className="pfe-select" value={style.fontFamily} onChange={(e) => onStyle({ fontFamily: e.target.value })}>
            {PRINT_FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <Segmented label="Schriftgröße" options={FLOW_BASE_SIZES} value={style.baseSize} onChange={(v) => onStyle({ baseSize: v })} />
        <Segmented label="Abstände" options={FLOW_SPACINGS} value={style.spacing} onChange={(v) => onStyle({ spacing: v })} />
        <div className="tfe-field tfe-inline">
          <label className="tfe-label" htmlFor="tfe-accent">Akzentfarbe</label>
          <input id="tfe-accent" type="color" className="pfe-props-color" value={style.accent} onChange={(e) => onStyle({ accent: e.target.value })} />
        </div>
        <Segmented label="Überschriften" options={FLOW_HEADING_STYLES} value={style.headingStyle} onChange={(v) => onStyle({ headingStyle: v })} />
        <Segmented label="Titel ausrichten" options={FLOW_ALIGNMENTS} value={style.titleAlign} onChange={(v) => onStyle({ titleAlign: v })} />
      </Section>

      <Section title="Fotos">
        <Segmented label="Position" options={FLOW_PHOTO_POSITIONS} value={style.photoPosition} onChange={(v) => onStyle({ photoPosition: v })} />
        {style.photoPosition !== 'none' && (
          <>
            <Segmented label="Größe" options={FLOW_PHOTO_SIZES} value={style.photoSize} onChange={(v) => onStyle({ photoSize: v })} />
            <div className="tfe-field">
              <label className="tfe-label" htmlFor="tfe-aspect">Seitenverhältnis</label>
              <select id="tfe-aspect" className="pfe-select" value={style.photoAspect} onChange={(e) => onStyle({ photoAspect: e.target.value })}>
                {FLOW_PHOTO_ASPECTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="tfe-field">
              <label className="tfe-label" htmlFor="tfe-count">Anzahl Fotos</label>
              <select id="tfe-count" className="pfe-select" value={style.photoCount} onChange={(e) => onStyle({ photoCount: parseInt(e.target.value, 10) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </>
        )}
      </Section>

      <Section title="Aufbau">
        <div className="tfe-field">
          <label className="tfe-label" htmlFor="tfe-columns">Zutaten und Zubereitung</label>
          <select id="tfe-columns" className="pfe-select" value={style.columns} onChange={(e) => onStyle({ columns: e.target.value })}>
            {FLOW_COLUMNS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <Segmented label="Metadaten" options={FLOW_METADATA_STYLES} value={style.metadataStyle} onChange={(v) => onStyle({ metadataStyle: v })} />
        <label className="tfe-check">
          <input type="checkbox" checked={style.tintIngredients} onChange={(e) => onStyle({ tintIngredients: e.target.checked })} />
          Zutaten farbig hinterlegen
        </label>
        <div className="tfe-label">Anzeigen</div>
        <div className="tfe-checks">
          {FLOW_ELEMENTS.map((el) => (
            <label key={el.id} className="tfe-check">
              <input type="checkbox" checked={style.show[el.id]} onChange={(e) => onStyle({ show: { ...style.show, [el.id]: e.target.checked } })} />
              {el.label}
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
