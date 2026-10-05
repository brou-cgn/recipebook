import {
  PRINT_TEMPLATES, FLOW_ELEMENTS, FLOW_STYLE_DEFAULTS, getTemplate, getTemplateStyle, normalizeFlowStyle,
  normalizeFlowOverrides, resolveFlowStyle, getFormatMarginCm, hasFlowCustomisations, applyTemplate,
  buildFlowFormat, isFlowFormat, PAPER_PRESETS,
} from './printTemplates';

describe('templates', () => {
  test('ids are unique and every template resolves to a valid complete style', () => {
    const ids = PRINT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    PRINT_TEMPLATES.forEach((t) => {
      const style = getTemplateStyle(t.id);
      expect(normalizeFlowStyle(style)).toEqual(style); // nothing is silently corrected
      expect(Object.keys(style.show).sort()).toEqual(FLOW_ELEMENTS.map((e) => e.id).sort());
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
    });
  });

  test('templates differ from each other', () => {
    const styles = PRINT_TEMPLATES.map((t) => JSON.stringify(getTemplateStyle(t.id)));
    expect(new Set(styles).size).toBe(styles.length);
  });

  test('classic is the plain defaults; unknown ids fall back to the first template', () => {
    expect(getTemplateStyle('classic')).toEqual(FLOW_STYLE_DEFAULTS);
    expect(getTemplate('does-not-exist').id).toBe(PRINT_TEMPLATES[0].id);
  });

  test('paper presets are portrait and ordered large to small', () => {
    PAPER_PRESETS.forEach((p) => expect(p.heightCm).toBeGreaterThan(p.widthCm));
  });
});

describe('normalizeFlowStyle', () => {
  test('undefined and garbage give the defaults', () => {
    expect(normalizeFlowStyle(undefined)).toEqual(FLOW_STYLE_DEFAULTS);
    expect(normalizeFlowStyle('x')).toEqual(FLOW_STYLE_DEFAULTS);
  });
  test('clamps numbers and rejects unknown enum values and bad colours', () => {
    const s = normalizeFlowStyle({ marginCm: -3, photoCount: 0, photoPosition: 'diagonal', accent: '#12', spacing: 'huge' });
    expect(s.marginCm).toBe(0);
    expect(s.photoCount).toBe(1);
    expect(s.photoPosition).toBe(FLOW_STYLE_DEFAULTS.photoPosition);
    expect(s.accent).toBe(FLOW_STYLE_DEFAULTS.accent);
    expect(s.spacing).toBe(FLOW_STYLE_DEFAULTS.spacing);
  });
  test('only an explicit false hides an element', () => {
    expect(normalizeFlowStyle({ show: { steps: false } }).show).toMatchObject({ steps: false, title: true });
  });
  test('is idempotent', () => {
    const once = normalizeFlowStyle({ baseSize: 'l', marginCm: 2.5, show: { photos: false } });
    expect(normalizeFlowStyle(once)).toEqual(once);
  });
});

describe('normalizeFlowOverrides', () => {
  test('keeps valid formatting only and drops empty entries', () => {
    expect(normalizeFlowOverrides({
      title: { fontBold: true, fontColor: '#ff0000', textAlignH: 'center', fontSizeScale: 1.2 },
      steps: { fontSizeScale: 1, fontBold: false },
      ghost: { fontBold: true },
      metadata: { textAlignH: 'justify', fontColor: 'red' },
    })).toEqual({ title: { fontBold: true, fontColor: '#ff0000', textAlignH: 'center', fontSizeScale: 1.2 } });
  });
  test('clamps the font scale', () => {
    expect(normalizeFlowOverrides({ title: { fontSizeScale: 0.1 } }).title.fontSizeScale).toBe(0.6);
    expect(normalizeFlowOverrides({ title: { fontSizeScale: 7 } }).title.fontSizeScale).toBe(2);
  });
  test.each([[undefined], [null], ['x'], [[]]])('tolerates %p', (v) => {
    expect(normalizeFlowOverrides(v)).toEqual({});
  });
});

describe('format helpers', () => {
  const flow = () => buildFlowFormat({ id: 'a', name: 'A', templateId: 'photo' });

  test('isFlowFormat and margin: free layouts print edge to edge', () => {
    expect(isFlowFormat(flow())).toBe(true);
    expect(isFlowFormat({})).toBe(false);
    expect(getFormatMarginCm({})).toBe(0);
    expect(getFormatMarginCm(flow())).toBe(FLOW_STYLE_DEFAULTS.marginCm);
    expect(getFormatMarginCm({ ...flow(), style: { marginCm: 3 } })).toBe(3);
  });

  test('resolveFlowStyle tolerates formats without style', () => {
    expect(resolveFlowStyle(undefined)).toEqual(FLOW_STYLE_DEFAULTS);
  });

  test('hasFlowCustomisations detects style changes and overrides', () => {
    expect(hasFlowCustomisations(flow())).toBe(false);
    expect(hasFlowCustomisations({ ...flow(), style: { ...flow().style, baseSize: 'l' } })).toBe(true);
    expect(hasFlowCustomisations({ ...flow(), overrides: { title: { fontBold: true } } })).toBe(true);
    expect(hasFlowCustomisations({ ...flow(), overrides: { title: {} } })).toBe(false);
  });

  test('applyTemplate resets style and overrides but keeps identity and page', () => {
    const custom = { ...flow(), name: 'Mein', maxPhotos: 2, pageWidthCm: 14.8, pageHeightCm: 21, overrides: { title: { fontBold: true } } };
    const out = applyTemplate(custom, 'minimal');
    expect(out).toMatchObject({ id: 'a', name: 'Mein', maxPhotos: 2, pageWidthCm: 14.8, template: 'minimal', overrides: {} });
    expect(out.style).toEqual(getTemplateStyle('minimal'));
    expect(out.fontFamily).toBe(getTemplateStyle('minimal').fontFamily);
  });
});
