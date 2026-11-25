import React from 'react';
import { render, screen } from '@testing-library/react';
import PrintPage from './PrintPage';
import { PRINT_ELEMENT_RENDERERS } from './printElementRenderers';
import { createFlowFormat, migrateFormat } from '../utils/printFormats';
import { FLOW_ELEMENTS } from '../utils/printTemplates';

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

const format = (style = {}) => {
  const f = createFlowFormat('classic');
  return { ...f, style: { ...f.style, ...style } };
};
const el = (container, id) => container.querySelector(`[data-flow-el="${id}"]`);

describe('renderers', () => {
  test('every text block of the template has a renderer, plus one per photo', () => {
    const blocks = FLOW_ELEMENTS.map((e) => e.id).filter((id) => id !== 'photos');
    expect(Object.keys(PRINT_ELEMENT_RENDERERS).sort())
      .toEqual([...blocks, 'photo1', 'photo2', 'photo3', 'photo4'].sort());
    Object.values(PRINT_ELEMENT_RENDERERS).forEach((renderer) => expect(typeof renderer).toBe('function'));
  });
});

describe('PrintPage content', () => {
  test('renders nothing without recipe or format', () => {
    expect(render(<PrintPage recipe={null} format={format()} />).container).toBeEmptyDOMElement();
    expect(render(<PrintPage recipe={recipe} format={null} />).container).toBeEmptyDOMElement();
  });

  test('title, photo, author/date, metadata, ingredients and steps', () => {
    const { container } = render(<PrintPage recipe={recipe} format={format()} authorName="Anna" mode="print" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Spaghetti' })).toBeInTheDocument();
    expect(el(container, 'photos').querySelector('img')).toHaveAttribute('src', 'one.jpg');
    expect(el(container, 'authorDate')).toHaveTextContent('Von Anna erstellt am 2.1.2025');
    expect(el(container, 'metadata')).toHaveTextContent('Italienisch');
    expect(el(container, 'metadata')).toHaveTextContent('25 Min.');
    expect(el(container, 'metadata')).toHaveTextContent('2 Portionen');
    expect(el(container, 'metadata')).toHaveTextContent('Schwierigkeit 3/5');
    expect(el(container, 'ingredients')).toHaveTextContent('200 g Tomaten');
    expect(el(container, 'steps')).toHaveTextContent('Servieren');
  });

  test('scales ingredient amounts with the chosen servings', () => {
    const { container } = render(<PrintPage recipe={recipe} format={format()} servings={4} mode="print" />);
    expect(el(container, 'ingredients')).toHaveTextContent('400 g Tomaten');
    expect(el(container, 'ingredients')).toHaveTextContent('Zutaten für 4 Portionen');
    expect(el(container, 'metadata')).toHaveTextContent('4 Portionen');
  });

  test('ingredients and steps carry their own section heading', () => {
    const { container } = render(<PrintPage recipe={recipe} format={format()} portionLabel="Stück" mode="print" />);
    expect(el(container, 'ingredients').querySelector('h2')).toHaveTextContent('Zutaten für 2 Stück');
    expect(el(container, 'steps').querySelector('h2')).toHaveTextContent('Zubereitung');
  });

  test('ingredient and step headings are rendered; steps are numbered without headings', () => {
    const { container } = render(<PrintPage recipe={recipe} format={format()} mode="print" />);
    expect(el(container, 'ingredients').querySelector('.ppv-el-list-heading')).toHaveTextContent('Sauce');
    const items = Array.from(el(container, 'steps').querySelectorAll('ol > li'));
    expect(items.map((li) => li.getAttribute('value'))).toEqual(['1', null, '2']);
    expect(items[1]).toHaveClass('ppv-el-list-heading');
  });

  test('photos use the images in order; the aspect ratio is applied unless it is "none"', () => {
    const square = render(<PrintPage recipe={recipe} format={format({ photoCount: 2, photoAspect: '1/1' })} mode="print" />);
    const imgs = Array.from(el(square.container, 'photos').querySelectorAll('img'));
    expect(imgs.map((img) => img.getAttribute('src'))).toEqual(['one.jpg', 'two.jpg']);
    imgs.forEach((img) => expect(img.style.aspectRatio).toBe('1/1'));
    square.unmount();
    const original = render(<PrintPage recipe={recipe} format={format({ photoAspect: 'none' })} mode="print" />);
    expect(el(original.container, 'photos').querySelector('img').style.aspectRatio).toBeFalsy();
  });

  test('empty metadata: placeholder in preview only', () => {
    const bare = { id: 'b', title: 'Nur Titel' };
    expect(render(<PrintPage recipe={bare} format={format()} />).container).toHaveTextContent('Metadaten');
    const p = render(<PrintPage recipe={bare} format={format()} mode="print" />);
    expect(p.container).not.toHaveTextContent('Metadaten');
  });

  test('missing title falls back to a placeholder text', () => {
    render(<PrintPage recipe={{ id: 'x' }} format={format()} mode="print" />);
    expect(screen.getByText('(kein Titel)')).toBeInTheDocument();
  });

  test('the printed page holds no interactive elements', () => {
    const { container } = render(<PrintPage recipe={recipe} format={format()} mode="print" />);
    expect(container.querySelectorAll('button, input, select, textarea, a, [role="button"]')).toHaveLength(0);
  });
});

describe('PrintPage with formats of the removed free layout', () => {
  const free = {
    id: 'alt', name: 'Alt', maxPhotos: null, orientation: 'landscape', layoutVersion: 2, fontFamily: 'Arial, Helvetica, sans-serif',
    elements: [
      { id: 'title', x: 2, y: 1, w: 96, h: 8, visible: true },
      { id: 'steps', x: 2, y: 40, w: 96, h: 20, visible: false },
      { id: 'photo1', x: 2, y: 10, w: 40, h: 28, visible: true },
      { id: 'photo2', x: 50, y: 10, w: 40, h: 28, visible: true },
    ],
  };

  test('a migrated free format prints as a template with its font, page size, visible parts and photo count', () => {
    const { container } = render(<PrintPage recipe={recipe} format={migrateFormat(free)} mode="print" />);
    const sheet = screen.getByTestId('print-page');
    expect(sheet).toHaveClass('ppf-sheet');
    expect(sheet.style.fontFamily).toContain('Arial');
    expect(sheet.style.width).toBe('26.7cm'); // 29.7 cm minus two margins of 1.5 cm
    expect(el(container, 'title')).not.toBeNull();
    expect(el(container, 'steps')).toBeNull();
    expect(el(container, 'photos').querySelectorAll('img')).toHaveLength(2);
    expect(container.querySelector('.ppv-element')).toBeNull();
  });

  test('a format that was never migrated still renders as the plain template', () => {
    const { container } = render(<PrintPage recipe={recipe} format={{ id: 'x', orientation: 'portrait' }} mode="print" />);
    expect(el(container, 'title')).not.toBeNull();
    expect(el(container, 'ingredients')).not.toBeNull();
  });
});
