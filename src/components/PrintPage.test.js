import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PrintPage from './PrintPage';
import { PRINT_ELEMENT_RENDERERS } from './printElementRenderers';
import { PRINT_FORMAT_ELEMENTS } from '../utils/printElements';
import { createPrintFormat } from '../utils/printFormats';

const recipe = {
  id: 'r1',
  title: 'Spaghetti',
  portionen: 2,
  kochdauer: 25,
  schwierigkeit: 3,
  kulinarik: ['Italienisch'],
  createdAt: new Date(2025, 0, 2),
  images: [{ url: 'one.jpg', isDefault: true }, { url: 'two.jpg' }],
  ingredients: [{ type: 'heading', text: 'Sauce' }, '200 g Tomaten', '1 Zwiebel'],
  steps: ['Kochen', { type: 'heading', text: 'Anrichten' }, 'Servieren'],
};

function allVisible(format) {
  return { ...format, elements: format.elements.map((e) => ({ ...e, visible: true })) };
}

const el = (container, id) => container.querySelector(`[data-element="${id}"]`);

describe('renderer registry', () => {
  test('every registry element has exactly one renderer', () => {
    PRINT_FORMAT_ELEMENTS.forEach((def) => expect(typeof PRINT_ELEMENT_RENDERERS[def.id]).toBe('function'));
    expect(Object.keys(PRINT_ELEMENT_RENDERERS).sort()).toEqual(PRINT_FORMAT_ELEMENTS.map((d) => d.id).sort());
  });
});

describe('PrintPage content', () => {
  test('renders nothing without recipe or format', () => {
    expect(render(<PrintPage recipe={null} format={createPrintFormat()} />).container).toBeEmptyDOMElement();
    expect(render(<PrintPage recipe={recipe} format={null} />).container).toBeEmptyDOMElement();
  });

  test('default format shows title, photo, author/date, metadata, ingredients and steps', () => {
    const { container } = render(<PrintPage recipe={recipe} format={createPrintFormat()} authorName="Anna" mode="print" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Spaghetti' })).toBeInTheDocument();
    expect(el(container, 'photo1').querySelector('img')).toHaveAttribute('src', 'one.jpg');
    expect(el(container, 'authorDate')).toHaveTextContent('Von Anna erstellt am 2.1.2025');
    expect(el(container, 'metadata')).toHaveTextContent('Italienisch');
    expect(el(container, 'metadata')).toHaveTextContent('25 Min.');
    expect(el(container, 'metadata')).toHaveTextContent('2 Portionen');
    expect(el(container, 'metadata')).toHaveTextContent('★★★☆☆');
    expect(el(container, 'ingredients')).toHaveTextContent('200 g Tomaten');
    expect(el(container, 'steps')).toHaveTextContent('Servieren');
    // hidden by default
    ['photo2', 'photo3', 'photo4', 'ingredientsHeading', 'stepsHeading'].forEach((id) => expect(el(container, id)).toBeNull());
  });

  test('scales ingredient amounts with the chosen servings', () => {
    const { container } = render(<PrintPage recipe={recipe} format={createPrintFormat()} servings={4} mode="print" />);
    expect(el(container, 'ingredients')).toHaveTextContent('400 g Tomaten');
    expect(el(container, 'ingredients')).toHaveTextContent('Zutaten für 4 Portionen');
    expect(el(container, 'metadata')).toHaveTextContent('4 Portionen');
  });

  test('headings inside the sections only when the separate heading elements are hidden', () => {
    const hidden = render(<PrintPage recipe={recipe} format={createPrintFormat()} mode="print" />);
    expect(within(el(hidden.container, 'ingredients')).getByText(/^Zutaten für/)).toBeInTheDocument();
    expect(within(el(hidden.container, 'steps')).getByText('Zubereitung')).toBeInTheDocument();
    hidden.unmount();

    const shown = render(<PrintPage recipe={recipe} format={allVisible(createPrintFormat())} mode="print" />);
    expect(within(el(shown.container, 'ingredients')).queryByText(/^Zutaten/)).toBeNull();
    expect(within(el(shown.container, 'steps')).queryByText('Zubereitung')).toBeNull();
    expect(el(shown.container, 'ingredientsHeading')).toHaveTextContent('Zutaten');
    expect(el(shown.container, 'stepsHeading')).toHaveTextContent('Zubereitung');
  });

  test('ingredient and step headings are rendered; steps are numbered without headings', () => {
    const { container } = render(<PrintPage recipe={recipe} format={createPrintFormat()} mode="print" />);
    expect(el(container, 'ingredients').querySelector('.ppv-el-list-heading')).toHaveTextContent('Sauce');
    const items = Array.from(el(container, 'steps').querySelectorAll('ol > li'));
    expect(items.map((li) => li.getAttribute('value'))).toEqual(['1', null, '2']);
    expect(items[1]).toHaveClass('ppv-el-list-heading');
  });

  test('does not truncate long lists', () => {
    const long = { ...recipe, ingredients: Array.from({ length: 40 }, (_, i) => `${i + 1} Zutat`), steps: Array.from({ length: 25 }, (_, i) => `Schritt ${i}`) };
    const { container } = render(<PrintPage recipe={long} format={createPrintFormat()} mode="print" />);
    expect(el(container, 'ingredients').querySelectorAll('li')).toHaveLength(40);
    expect(el(container, 'steps').querySelectorAll('li')).toHaveLength(25);
    expect(container.textContent).not.toMatch(/weitere/);
  });

  test('photos 2..4 use the next images; aspect ratio is applied', () => {
    const fmt = allVisible(createPrintFormat());
    fmt.elements = fmt.elements.map((e) => (e.id === 'photo2' ? { ...e, aspectRatio: '1/1' } : e));
    const { container } = render(<PrintPage recipe={recipe} format={fmt} mode="print" />);
    const img2 = el(container, 'photo2').querySelector('img');
    expect(img2).toHaveAttribute('src', 'two.jpg');
    expect(img2.style.aspectRatio).toBe('1/1');
    expect(el(container, 'photo1').querySelector('img').style.aspectRatio).toBeFalsy();
  });

  test('missing photo: placeholder in preview, nothing in print', () => {
    const noPhoto = { ...recipe, images: [], image: undefined };
    const preview = render(<PrintPage recipe={noPhoto} format={createPrintFormat()} />);
    expect(preview.container).toHaveTextContent('Kein Foto 1');
    preview.unmount();
    const print = render(<PrintPage recipe={noPhoto} format={createPrintFormat()} mode="print" />);
    expect(print.container).not.toHaveTextContent('Kein Foto');
    expect(el(print.container, 'photo1').children).toHaveLength(0);
  });

  test('empty metadata: placeholder in preview only', () => {
    const bare = { id: 'b', title: 'Nur Titel' };
    const fmt = { ...createPrintFormat() };
    expect(render(<PrintPage recipe={bare} format={fmt} />).container).toHaveTextContent('Metadaten');
    const p = render(<PrintPage recipe={bare} format={fmt} mode="print" />);
    expect(p.container).not.toHaveTextContent('Metadaten');
  });

  test('missing title falls back to a placeholder text', () => {
    render(<PrintPage recipe={{ id: 'x' }} format={createPrintFormat()} mode="print" />);
    expect(screen.getByText('(kein Titel)')).toBeInTheDocument();
  });
});

describe('PrintPage layout', () => {
  test('page has the real size in cm and the format font', () => {
    const fmt = { ...createPrintFormat('landscape'), fontFamily: 'Arial, sans-serif' };
    render(<PrintPage recipe={recipe} format={fmt} mode="print" />);
    const page = screen.getByTestId('print-page');
    expect(page.style.width).toBe('29.7cm');
    expect(page.style.height).toBe('21cm');
    expect(page.style.fontFamily).toContain('Arial');
    expect(page.style.transform).toBe('');
  });

  test('preview scales the page with a transform', () => {
    render(<PrintPage recipe={recipe} format={createPrintFormat()} />);
    expect(screen.getByTestId('print-page').style.transform).toMatch(/^scale\(/);
  });

  test('elements are positioned from the format and styled per element', () => {
    const fmt = createPrintFormat();
    fmt.elements = fmt.elements.map((e) => (e.id === 'title'
      ? { ...e, x: 10, y: 5, w: 50, h: 8, fontBold: true, fontColor: '#123456', textAlignH: 'right', borderBottom: true, borderWidth: 3, borderColor: '#ff0000', rotation: 180 }
      : e));
    const { container } = render(<PrintPage recipe={recipe} format={fmt} mode="print" />);
    const s = el(container, 'title').style;
    expect(s.left).toBe('10%');
    expect(s.width).toBe('50%');
    expect(s.fontWeight).toBe('bold');
    expect(s.color).toBe('rgb(18, 52, 86)');
    expect(s.textAlign).toBe('right');
    expect(s.borderBottom).toContain('3px solid');
    expect(s.transform).toBe('rotate(180deg)');
  });

  test('hidden elements are not rendered; unknown elements are ignored', () => {
    const fmt = createPrintFormat();
    fmt.elements = [...fmt.elements.map((e) => (e.id === 'steps' ? { ...e, visible: false } : e)), { id: 'ghost', x: 0, y: 0, w: 10, h: 10, visible: true }];
    const { container } = render(<PrintPage recipe={recipe} format={fmt} mode="print" />);
    expect(el(container, 'steps')).toBeNull();
    expect(el(container, 'ghost')).toBeNull();
  });

  test('accepts legacy formats without elements (defaults are merged)', () => {
    const { container } = render(<PrintPage recipe={recipe} format={{ id: 'x', orientation: 'portrait' }} mode="print" />);
    expect(el(container, 'title')).not.toBeNull();
  });
});

describe('PrintPage overflow detection (preview)', () => {
  const spies = [];
  afterEach(() => { spies.splice(0).forEach((s) => s.mockRestore()); });

  function mockHeights(map) {
    spies.push(
      jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function scrollHeight() {
        return map[this.dataset.element]?.scroll ?? 10;
      }),
      jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function clientHeight() {
        return map[this.dataset.element]?.client ?? 10;
      }),
    );
  }

  test('flags clipped text elements with a badge, a summary and the callback', () => {
    mockHeights({ ingredients: { scroll: 300, client: 100 } });
    const onOverflow = jest.fn();
    const { container } = render(<PrintPage recipe={recipe} format={createPrintFormat()} onOverflow={onOverflow} />);
    expect(screen.getByTestId('overflow-ingredients')).toBeInTheDocument();
    expect(screen.queryByTestId('overflow-steps')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Zutaten');
    expect(onOverflow).toHaveBeenLastCalledWith(['ingredients']);
    expect(container.querySelectorAll('.ppv-overflow-badge')).toHaveLength(1);
  });

  test('one pixel of rounding is tolerated', () => {
    mockHeights({ ingredients: { scroll: 101, client: 100 } });
    render(<PrintPage recipe={recipe} format={createPrintFormat()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('image elements are never flagged', () => {
    mockHeights({ photo1: { scroll: 900, client: 10 } });
    render(<PrintPage recipe={recipe} format={createPrintFormat()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('print mode shows no badge and does not measure', () => {
    mockHeights({ ingredients: { scroll: 300, client: 100 } });
    render(<PrintPage recipe={recipe} format={createPrintFormat()} mode="print" />);
    expect(screen.queryByTestId('overflow-ingredients')).toBeNull();
  });
});
