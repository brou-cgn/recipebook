import fs from 'fs';
import path from 'path';

describe('MenuForm CSS mobile drag-handle layout', () => {
  const cssPath = path.join(__dirname, 'MenuForm.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const getRuleBody = (source, selector) => {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
    return match ? match[1] : '';
  };

  test('keeps drag handles in normal flow inside MenuForm containers', () => {
    const dragHandleRule = getRuleBody(css, '.menu-form-container .drag-handle');

    expect(dragHandleRule).toContain('position: static;');
    expect(dragHandleRule).toContain('top: auto;');
    expect(dragHandleRule).toContain('right: auto;');
    expect(dragHandleRule).toContain('bottom: auto;');
    expect(dragHandleRule).toContain('display: inline-flex;');
  });

  test('adds iOS safe-area spacing at the top of the form container', () => {
    const containerRule = getRuleBody(css, '.menu-form-container');

    expect(containerRule).toContain('padding: calc(1rem + env(safe-area-inset-top, 0px)) 1rem 1rem;');
  });

  test('lets the photo button wrap below the date field instead of overlapping it', () => {
    const rowRule = getRuleBody(css, '.menu-date-row');
    const fieldRule = getRuleBody(css, '.menu-date-row .menu-date-field');
    const dateInputRule = getRuleBody(css, '.menu-date-row .menu-date-field input[type="date"]');

    // Without a wrap fallback, the fixed-width photo button and the date
    // input can be squeezed into overlapping each other when the row is too
    // narrow to fit both (e.g. iPhone landscape).
    expect(rowRule).toContain('flex-wrap: wrap;');
    expect(fieldRule).toContain('min-width: 150px;');
    expect(dateInputRule).toContain('min-width: 0;');
  });

  test('clips the native date control instead of letting it visually spill onto the photo button', () => {
    const fieldRule = getRuleBody(css, '.menu-date-row .menu-date-field');
    const dateInputRule = getRuleBody(css, '.menu-date-row .menu-date-field input[type="date"]');

    // Some browsers (notably iOS Safari) can paint the native date control
    // wider than its layout box instead of shrinking it, so the field wraps
    // to the date input's own width but still visually overlaps the photo
    // button next to it. Clipping the field's overflow, and constraining
    // the input to its own box, guarantees the button stays uncovered.
    expect(fieldRule).toContain('overflow: hidden;');
    expect(dateInputRule).toContain('width: 100%;');
    expect(dateInputRule).toContain('max-width: 100%;');
    expect(dateInputRule).toContain('box-sizing: border-box;');
  });

  test('does not cap the date input width with a stray max-width rule', () => {
    // A leftover `.form-group input[type="date"] { max-width: 200px; }`
    // rule (from before the photo button existed) capped the input's width
    // on narrow viewports while the surrounding flex row was sized for the
    // full-width layout below, leaving an unexplained gap before the
    // button. The row's own rules are the single source of truth for the
    // date input's width now.
    expect(css).not.toMatch(/\.form-group input\[type="date"\]\s*\{\s*max-width:\s*200px;/);
  });
});
