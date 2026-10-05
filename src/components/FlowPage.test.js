import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PrintPage from './PrintPage';
import { createFlowFormat } from '../utils/printFormats';

const recipe = {
  id: 'r1', title: 'Spaghetti', portionen: 2, kochdauer: 25, schwierigkeit: 3, kulinarik: ['Italienisch'],
  createdAt: new Date(2025, 0, 2),
  images: [{ url: 'one.jpg', isDefault: true }, { url: 'two.jpg' }, { url: 'three.jpg' }],
  ingredients: [{ type: 'heading', text: 'Sauce' }, '200 g Tomaten', '1 Zwiebel'],
  steps: ['Kochen', { type: 'heading', text: 'Anrichten' }, 'Servieren'],
};

const flow = (style = {}, extra = {}) => {
  const f = createFlowFormat('classic');
  return { ...f, style: { ...f.style, ...style }, ...extra };
};
const ids = (container) => Array.from(container.querySelectorAll('[data-flow-el]')).map((n) => n.dataset.flowEl);
const el = (container, id) => container.querySelector(`[data-flow-el="${id}"]`);

describe('dispatch', () => {
  test('flow formats use the flow renderer, free formats the positioned one', () => {
    const { container, rerender } = render(<PrintPage recipe={recipe} format={flow()} mode="print" />);
    expect(container.querySelector('.ppf-sheet')).not.toBeNull();
    expect(container.querySelector('.ppv-element')).toBeNull();
    rerender(<PrintPage recipe={recipe} format={{ id: 'x', orientation: 'portrait' }} mode="print" />);
    expect(container.querySelector('.ppf-sheet')).toBeNull();
    expect(container.querySelector('.ppv-element')).not.toBeNull();
  });

  test('renders nothing without recipe or format', () => {
    expect(render(<PrintPage recipe={null} format={flow()} />).container).toBeEmptyDOMElement();
    expect(render(<PrintPage recipe={recipe} format={null} />).container).toBeEmptyDOMElement();
  });
});

describe('content and order', () => {
  test('classic: title, photo, author/date, metadata, then ingredients and steps', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow()} authorName="Anna" mode="print" />);
    expect(ids(container)).toEqual(['title', 'photos', 'authorDate', 'metadata', 'ingredients', 'steps']);
    expect(el(container, 'authorDate')).toHaveTextContent('Von Anna erstellt am 2.1.2025');
    expect(el(container, 'metadata')).toHaveTextContent('Italienisch');
    expect(el(container, 'metadata')).toHaveTextContent('2 Portionen');
  });

  test('scaled ingredients, inline headings and all list items (no truncation)', () => {
    const long = { ...recipe, ingredients: Array.from({ length: 40 }, (_, i) => `${i + 1} Zutat`), steps: Array.from({ length: 25 }, (_, i) => `Schritt ${i}`) };
    const { container } = render(<PrintPage recipe={long} format={flow()} servings={4} mode="print" />);
    expect(within(el(container, 'ingredients')).getByText('Zutaten für 4 Portionen')).toBeInTheDocument();
    expect(within(el(container, 'steps')).getByText('Zubereitung')).toBeInTheDocument();
    expect(el(container, 'ingredients').querySelectorAll('li')).toHaveLength(40);
    expect(el(container, 'steps').querySelectorAll('li')).toHaveLength(25);
  });

  test('elements can be hidden individually; hiding both columns removes the body', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ show: { title: false, metadata: false, photos: false, steps: false, ingredients: true, authorDate: true } })} mode="print" />);
    expect(ids(container)).toEqual(['authorDate', 'ingredients']);
    expect(container.querySelector('.ppf-body--one')).not.toBeNull();
    const none = render(<PrintPage recipe={recipe} format={flow({ show: { ingredients: false, steps: false } })} mode="print" />);
    expect(none.container.querySelector('.ppf-body')).toBeNull();
  });
});

describe('photos', () => {
  test('position none shows no photo area', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ photoPosition: 'none' })} mode="print" />);
    expect(el(container, 'photos')).toBeNull();
  });

  test.each(['left', 'right'])('position %s puts photo and title info side by side', (position) => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ photoPosition: position, photoSize: 'm' })} mode="print" />);
    const header = container.querySelector('.ppf-header');
    expect(header).toHaveClass(`ppf-header--${position}`);
    expect(within(header).getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(header.querySelector('[data-flow-el="photos"]')).not.toBeNull();
    expect(container.querySelector('.ppf-sheet').style.getPropertyValue('--ppf-side')).toBe('40%');
  });

  test('photo count controls the grid and uses the images in order', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ photoCount: 3, photoAspect: '1/1' })} mode="print" />);
    const imgs = el(container, 'photos').querySelectorAll('img');
    expect(Array.from(imgs).map((i) => i.getAttribute('src'))).toEqual(['one.jpg', 'two.jpg', 'three.jpg']);
    expect(imgs[0].style.aspectRatio).toBe('1/1');
    expect(el(container, 'photos').querySelector('.ppf-photo-grid').style.gridTemplateColumns).toContain('repeat(3');
  });

  test('count is capped by the available images', () => {
    const { container } = render(<PrintPage recipe={{ ...recipe, images: [{ url: 'only.jpg' }] }} format={flow({ photoCount: 4 })} mode="print" />);
    expect(el(container, 'photos').querySelectorAll('img')).toHaveLength(1);
  });

  test('without a photo: placeholder in the preview, no area at all in print', () => {
    const none = { ...recipe, images: [], image: undefined };
    expect(render(<PrintPage recipe={none} format={flow()} />).container).toHaveTextContent('Kein Foto');
    const p = render(<PrintPage recipe={none} format={flow()} mode="print" />);
    expect(el(p.container, 'photos')).toBeNull();
  });
});

describe('style options', () => {
  test('applies font, size, spacing, accent and alignment as page variables', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ fontFamily: 'Arial, sans-serif', baseSize: 'l', spacing: 'airy', accent: '#a33a26', titleAlign: 'left' })} mode="print" />);
    const sheet = container.querySelector('.ppf-sheet');
    expect(sheet.style.fontFamily).toContain('Arial');
    expect(sheet.style.fontSize).toBe('17px');
    expect(sheet.style.getPropertyValue('--ppf-gap')).toBe('1.6em');
    expect(sheet.style.getPropertyValue('--ppf-accent')).toBe('#a33a26');
    expect(sheet.style.getPropertyValue('--ppf-title-align')).toBe('left');
  });

  test('heading and metadata style are exposed for the CSS', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ headingStyle: 'bar', metadataStyle: 'plain' })} mode="print" />);
    const content = container.querySelector('.ppf-content');
    expect(content).toHaveAttribute('data-heading', 'bar');
    expect(content).toHaveAttribute('data-meta', 'plain');
  });

  test('columns: two side by side, one stacked; tinted ingredients', () => {
    const two = render(<PrintPage recipe={recipe} format={flow({ columns: 'two', tintIngredients: true })} mode="print" />);
    expect(two.container.querySelector('.ppf-body--two')).not.toBeNull();
    expect(el(two.container, 'ingredients')).toHaveClass('ppf-block--tint');
    const one = render(<PrintPage recipe={recipe} format={flow({ columns: 'one' })} mode="print" />);
    expect(one.container.querySelector('.ppf-body--one')).not.toBeNull();
  });

  test('per-element overrides become inline text formatting on that block only', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({}, { overrides: { title: { fontBold: true, fontSizeScale: 1.5, fontColor: '#ff0000', textAlignH: 'right' } } })} mode="print" />);
    const s = el(container, 'title').style;
    expect(s.fontWeight).toBe('bold');
    expect(s.fontSize).toBe('1.5em');
    expect(s.color).toBe('rgb(255, 0, 0)');
    expect(s.textAlign).toBe('right');
    expect(el(container, 'steps').getAttribute('style') || '').toBe('');
  });
});

describe('print mode', () => {
  test('content width is page width minus both margins, no transform, no interaction', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow({ marginCm: 2 })} mode="print" selectedElement="title" onSelectElement={() => {}} />);
    const sheet = screen.getByTestId('print-page');
    expect(sheet.style.width).toBe('17cm');
    expect(sheet.style.transform).toBe('');
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('.ppf-page-break')).toBeNull();
  });

  test('uses the page size of the format', () => {
    render(<PrintPage recipe={recipe} format={{ ...flow({ marginCm: 1 }), pageWidthCm: 14.8, pageHeightCm: 21 }} mode="print" />);
    expect(screen.getByTestId('print-page').style.width).toBe('12.8cm');
  });
});

describe('preview', () => {
  test('page has real size and margin, scaled by transform', () => {
    render(<PrintPage recipe={recipe} format={flow({ marginCm: 1.5 })} />);
    const sheet = screen.getByTestId('print-page');
    expect(sheet.style.width).toBe('21cm');
    expect(sheet.style.minHeight).toBe('29.7cm');
    expect(sheet.style.padding).toBe('1.5cm');
    expect(sheet.style.transform).toMatch(/^scale\(/);
  });

  test('without onSelectElement nothing is interactive', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow()} />);
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('.ppf-sheet--interactive')).toBeNull();
  });

  test('clicking an element selects it, clicking elsewhere clears the selection', () => {
    const onSelect = jest.fn();
    const { container } = render(<PrintPage recipe={recipe} format={flow()} onSelectElement={onSelect} />);
    fireEvent.click(within(el(container, 'ingredients')).getByText('200 g Tomaten'));
    expect(onSelect).toHaveBeenLastCalledWith('ingredients');
    fireEvent.click(screen.getByTestId('print-page'));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  test('elements are keyboard accessible and the selection is highlighted', () => {
    const onSelect = jest.fn();
    const { container } = render(<PrintPage recipe={recipe} format={flow()} onSelectElement={onSelect} selectedElement="steps" />);
    const title = el(container, 'title');
    expect(title).toHaveAttribute('role', 'button');
    expect(title).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('title');
    expect(el(container, 'steps')).toHaveClass('ppf-block--selected');
  });

  test('thumbnails are not interactive even with a handler', () => {
    const { container } = render(<PrintPage recipe={recipe} format={flow()} onSelectElement={() => {}} thumbnail embedded />);
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  describe('page breaks', () => {
    let spy;
    afterEach(() => spy?.mockRestore());

    test('long content shows the approximate page breaks and the page count', () => {
      spy = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(3000);
      render(<PrintPage recipe={recipe} format={flow({ marginCm: 1.5 })} />);
      expect(screen.getAllByTestId('page-break')).toHaveLength(2);
      expect(screen.getByRole('status')).toHaveTextContent('3 Seiten');
      expect(screen.getAllByTestId('page-break')[0]).toHaveTextContent('Seite 2');
    });

    test('short content has no page break and no page count', () => {
      spy = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500);
      render(<PrintPage recipe={recipe} format={flow()} />);
      expect(screen.queryByTestId('page-break')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
