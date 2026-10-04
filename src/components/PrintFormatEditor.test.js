import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import PrintFormatEditor from './PrintFormatEditor';
import { createPrintFormat } from '../utils/printFormats';
import { DEFAULT_PRINT_ELEMENTS_PORTRAIT } from '../utils/printElements';

const recipe = { id: 'r', title: 'Testrezept', portionen: 2, ingredients: ['1 Ei'], steps: ['Kochen'] };
const box = (container, id) => container.querySelector(`.pfe-element[data-element="${id}"]`);

function setup(props = {}) {
  let current = props.format || createPrintFormat();
  const onChange = jest.fn((next) => { current = next; rerender(<PrintFormatEditor {...props} format={next} onChange={onChange} />); });
  const utils = render(<PrintFormatEditor {...props} format={current} onChange={onChange} />);
  const { rerender } = utils;
  return { ...utils, onChange, get format() { return current; } };
}

const pointer = (target, type, x = 0, y = 0) =>
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));

let rafSpy;
beforeEach(() => {
  rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function mockPageRect(container, width = 1000, height = 1414) {
  const page = container.querySelector('.pfe-page');
  page.getBoundingClientRect = () => ({ left: 0, top: 0, width, height, right: width, bottom: height });
}

describe('PrintFormatEditor structure', () => {
  test('renders toolbar, chips and one box per visible element', () => {
    const { container } = setup();
    expect(screen.getByLabelText('Seitenbreite in cm')).toHaveValue(21);
    expect(screen.getByLabelText('Schriftart')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(11);
    const visible = DEFAULT_PRINT_ELEMENTS_PORTRAIT.filter((e) => e.visible).map((e) => e.id);
    expect(Array.from(container.querySelectorAll('.pfe-element')).map((n) => n.dataset.element).sort()).toEqual(visible.sort());
  });

  test('visibility chip hides and shows an element', () => {
    const { container, onChange } = setup();
    fireEvent.click(screen.getByLabelText('Titel'));
    expect(onChange).toHaveBeenCalled();
    expect(box(container, 'title')).toBeNull();
    fireEvent.click(screen.getByLabelText('Titel'));
    expect(box(container, 'title')).not.toBeNull();
  });

  test('no Bildspalten setting any more', () => {
    setup();
    expect(screen.queryByText(/Bildspalten/)).toBeNull();
  });

  test('shows a note for formats migrated from the legacy layout', () => {
    setup({ format: { ...createPrintFormat(), migrationNotes: ['legacy-layout-replaced'] } });
    expect(screen.getByRole('note')).toHaveTextContent('alten Layoutsystem');
  });

  test('font and page size changes go through onChange', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText('Schriftart'), { target: { value: 'Arial, Helvetica, sans-serif' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ fontFamily: 'Arial, Helvetica, sans-serif' }));
    fireEvent.change(screen.getByLabelText('Seitenbreite in cm'), { target: { value: '30' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pageWidthCm: 30, orientation: 'landscape' }));
  });
});

describe('orientation and reset', () => {
  test('orientation change on the default layout needs no confirmation and resets size and elements', () => {
    const confirm = jest.spyOn(window, 'confirm');
    const { onChange } = setup();
    fireEvent.click(screen.getByLabelText('Querformat'));
    expect(confirm).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ orientation: 'landscape', pageWidthCm: 29.7, pageHeightCm: 21 }));
  });

  test('a customised layout asks before it is replaced; cancel keeps it', () => {
    const format = createPrintFormat();
    format.elements = format.elements.map((e) => (e.id === 'title' ? { ...e, x: 10 } : e));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { onChange } = setup({ format });
    fireEvent.click(screen.getByLabelText('Querformat'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Layout zurücksetzen'));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('confirmed reset restores the defaults', () => {
    const format = createPrintFormat();
    format.elements = format.elements.map((e) => (e.id === 'title' ? { ...e, x: 10 } : e));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const { onChange } = setup({ format });
    fireEvent.click(screen.getByText('Layout zurücksetzen'));
    expect(onChange.mock.calls[0][0].elements).toEqual(DEFAULT_PRINT_ELEMENTS_PORTRAIT);
  });
});

describe('selection and properties', () => {
  test('Enter selects an element and opens the properties panel; Schließen closes it', () => {
    const { container } = setup();
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    expect(screen.getByText('Position & Größe:')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Schließen'));
    expect(screen.queryByText('Position & Größe:')).toBeNull();
  });

  test('image elements show aspect ratio, text elements show typography', () => {
    const { container } = setup();
    fireEvent.keyDown(box(container, 'photo1'), { key: 'Enter' });
    expect(screen.getByLabelText('Seitenverhältnis')).toBeInTheDocument();
    expect(screen.queryByText('Schrift:')).toBeNull();
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    expect(screen.getByText('Schrift:')).toBeInTheDocument();
    expect(screen.queryByLabelText('Seitenverhältnis')).toBeNull();
  });

  test('changing X in cm updates the element in % of the page width', () => {
    const { container, onChange } = setup();
    fireEvent.keyDown(box(container, 'ingredients'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Horizontale Position in cm'), { target: { value: '2.1' } });
    const ing = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'ingredients');
    expect(ing.x).toBeCloseTo(10);
    fireEvent.change(screen.getByLabelText('Horizontale Position in cm'), { target: { value: '99' } });
    const clamped = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'ingredients');
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(100.0001);
  });

  test('size input respects the minimum', () => {
    const { container, onChange } = setup();
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    fireEvent.change(screen.getByLabelText('Breite in cm'), { target: { value: '0.1' } });
    expect(onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'title').w).toBe(5);
  });

  test('bold, rotation, border and colour are written to the element', () => {
    const { container, onChange } = setup();
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    const last = () => onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'title');
    fireEvent.click(screen.getByTitle('Fett'));
    expect(last().fontBold).toBe(true);
    fireEvent.change(screen.getByLabelText('Drehung'), { target: { value: '90' } });
    expect(last().rotation).toBe(90);
    fireEvent.click(screen.getByLabelText('Rahmen Unten'));
    expect(last().borderBottom).toBe(true);
    fireEvent.change(screen.getByLabelText('Schriftfarbe'), { target: { value: '#ff0000' } });
    expect(last().fontColor).toBe('#ff0000');
    fireEvent.click(screen.getAllByTitle('Mitte').find((n) => n.classList.contains('pfe-textalign-btn')));
    expect(last().textAlignH).toBe('center');
  });

  test('align to the other elements', () => {
    const { container, onChange } = setup();
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    fireEvent.click(screen.getByTitle('Links bündig'));
    const title = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'title');
    expect(title.x).toBe(2);
  });
});

describe('keyboard', () => {
  test('arrow keys move by 0.1 cm, Shift by 1 cm, clamped to the page', () => {
    const { container, onChange } = setup();
    const title = () => onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'title');
    fireEvent.keyDown(box(container, 'title'), { key: 'ArrowRight' });
    expect(title().x).toBeCloseTo(2 + (0.1 / 21) * 100);
    fireEvent.keyDown(box(container, 'title'), { key: 'ArrowDown', shiftKey: true });
    expect(title().y).toBeCloseTo(1.4 + (1 / 21) * 100);
    for (let i = 0; i < 20; i += 1) fireEvent.keyDown(box(container, 'title'), { key: 'ArrowLeft', shiftKey: true });
    expect(title().x).toBe(0);
  });

  test('Delete hides the element', () => {
    const { container } = setup();
    fireEvent.keyDown(box(container, 'title'), { key: 'Delete' });
    expect(box(container, 'title')).toBeNull();
  });

  test('keys typed inside the properties panel do not move the element', () => {
    const { container, onChange } = setup();
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    onChange.mockClear();
    fireEvent.keyDown(screen.getByLabelText('Horizontale Position in cm'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('elements are focusable buttons with a label', () => {
    const { container } = setup();
    const b = box(container, 'title');
    expect(b).toHaveAttribute('role', 'button');
    expect(b).toHaveAttribute('tabindex', '0');
    expect(b.getAttribute('aria-label')).toMatch(/^Titel/);
    expect(b.querySelectorAll('[aria-hidden="true"]')).toHaveLength(8);
  });
});

describe('pointer interaction', () => {
  test('a press without movement selects the element', () => {
    const { container } = setup();
    mockPageRect(container);
    pointer(box(container, 'title'), 'pointerdown', 100, 100);
    pointer(document, 'pointerup', 100, 100);
    expect(screen.getByText('Position & Größe:')).toBeInTheDocument();
  });

  test('dragging moves the element by the pointer delta (% of page width) and does not select it', () => {
    const { container, onChange } = setup();
    mockPageRect(container, 1000, 1414);
    pointer(box(container, 'ingredients'), 'pointerdown', 100, 100);
    pointer(document, 'pointermove', 200, 100); // +10 % of 1000 px
    pointer(document, 'pointerup', 200, 100);
    const ing = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'ingredients');
    expect(ing.x).toBeCloseTo(12, 0);
    expect(screen.queryByText('Position & Größe:')).toBeNull();
  });

  test('dragging is clamped to the page', () => {
    const { container, onChange } = setup();
    mockPageRect(container);
    pointer(box(container, 'title'), 'pointerdown', 100, 100);
    pointer(document, 'pointermove', 5000, 5000);
    pointer(document, 'pointerup', 5000, 5000);
    const title = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'title');
    expect(title.x + title.w).toBeLessThanOrEqual(100.0001);
    expect(title.y + title.h).toBeLessThanOrEqual((29.7 / 21) * 100 + 0.0001);
  });

  test('moves are applied per animation frame, not per event', () => {
    rafSpy.mockImplementation(() => 7); // frame never fires on its own
    const { container, onChange } = setup();
    mockPageRect(container);
    pointer(box(container, 'title'), 'pointerdown', 100, 100);
    pointer(document, 'pointermove', 150, 100);
    pointer(document, 'pointermove', 160, 100);
    pointer(document, 'pointermove', 170, 100);
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    pointer(document, 'pointerup', 170, 100); // flushes the last position
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('resizing from the east handle never goes below the minimum width', () => {
    const { container, onChange } = setup();
    mockPageRect(container);
    const handle = box(container, 'title').querySelector('.pfe-resize-e');
    pointer(handle, 'pointerdown', 500, 100);
    pointer(document, 'pointermove', -5000, 100);
    pointer(document, 'pointerup', -5000, 100);
    expect(onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'title').w).toBe(5);
  });

  test('resizing from the south-east handle grows width and height', () => {
    const { container, onChange } = setup();
    mockPageRect(container);
    const handle = box(container, 'ingredients').querySelector('.pfe-resize-se');
    const before = DEFAULT_PRINT_ELEMENTS_PORTRAIT.find((e) => e.id === 'ingredients');
    pointer(handle, 'pointerdown', 0, 0);
    pointer(document, 'pointermove', -20, -20);
    pointer(document, 'pointerup', -20, -20);
    const after = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'ingredients');
    expect(after.w).toBeCloseTo(before.w - 2, 1);
    expect(after.h).toBeCloseTo(before.h - 2, 1);
  });

  test('snaps to the edge of another element and shows no guides afterwards', () => {
    const { container, onChange } = setup();
    mockPageRect(container);
    // steps starts at x=51; drag ingredients (x=2, w=45) so that its right edge is near 51
    pointer(box(container, 'ingredients'), 'pointerdown', 0, 0);
    pointer(document, 'pointermove', 40, 0); // x -> 6, right edge 51 -> snap
    expect(container.querySelectorAll('.pfe-snap-guide').length).toBeGreaterThan(0);
    pointer(document, 'pointerup', 40, 0);
    expect(container.querySelectorAll('.pfe-snap-guide')).toHaveLength(0);
    const ing = onChange.mock.calls.at(-1)[0].elements.find((e) => e.id === 'ingredients');
    expect(ing.x + ing.w).toBeCloseTo(51, 5);
  });

  test('clicking the page background clears the selection', () => {
    const { container } = setup();
    mockPageRect(container);
    fireEvent.keyDown(box(container, 'title'), { key: 'Enter' });
    expect(screen.getByText('Position & Größe:')).toBeInTheDocument();
    pointer(container.querySelector('.pfe-page-inner'), 'pointerdown');
    expect(screen.queryByText('Position & Größe:')).toBeNull();
  });
});

describe('preview recipe', () => {
  test('without recipe there is no print rendering underneath', () => {
    const { container } = setup();
    expect(container.querySelector('.pfe-page-content')).toBeNull();
  });

  test('with recipe the real PrintPage is rendered underneath the boxes', () => {
    const { container } = setup({ previewRecipe: recipe, authorName: 'Anna' });
    const content = container.querySelector('.pfe-page-content');
    expect(within(content).getByText('Testrezept')).toBeInTheDocument();
    expect(container.querySelector('.pfe-page')).toHaveClass('pfe-page--overlay');
    expect(content.querySelector('.ppv-overflow-warning')).toBeNull();
  });
});
