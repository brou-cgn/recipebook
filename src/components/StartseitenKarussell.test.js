import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StartseitenKarussell from './StartseitenKarussell';
import { renderWithProviders } from '../test-utils';

const mockItems = [
  { id: 'i1', label: 'Element 1' },
  { id: 'i2', label: 'Element 2' },
  { id: 'i3', label: 'Element 3' },
];

const renderItem = (item) => <span data-testid="karussell-item">{item.label}</span>;

describe('StartseitenKarussell', () => {
  test('renders without crashing', () => {
    const { container } = render(
      <StartseitenKarussell title="Testbereich" items={[]} renderItem={renderItem} />
    );
    expect(container.querySelector('.startseite-trending-section')).toBeInTheDocument();
  });

  test('renders the section title', () => {
    render(<StartseitenKarussell title="Im Trend" items={[]} renderItem={renderItem} />);
    expect(screen.getByText('Im Trend')).toBeInTheDocument();
  });

  test('shows loading state', () => {
    render(
      <StartseitenKarussell title="Test" items={[]} loading={true} renderItem={renderItem} />
    );
    expect(screen.getByText('Laden…')).toBeInTheDocument();
  });

  test('shows empty text when items is empty and not loading', () => {
    render(
      <StartseitenKarussell
        title="Test"
        items={[]}
        loading={false}
        renderItem={renderItem}
        emptyText="Keine Einträge vorhanden."
      />
    );
    expect(screen.getByText('Keine Einträge vorhanden.')).toBeInTheDocument();
  });

  test('renders carousel items', () => {
    const { container } = render(
      <StartseitenKarussell
        title="Test"
        items={mockItems}
        loading={false}
        renderItem={renderItem}
      />
    );
    const items = container.querySelectorAll('.startseite-carousel-item');
    expect(items).toHaveLength(3);
    expect(screen.getByText('Element 1')).toBeInTheDocument();
    expect(screen.getByText('Element 2')).toBeInTheDocument();
    expect(screen.getByText('Element 3')).toBeInTheDocument();
  });

  test('renders "mehr" button with default label', () => {
    render(
      <StartseitenKarussell title="Test" items={[]} renderItem={renderItem} onMehr={() => {}} />
    );
    expect(screen.getByRole('button', { name: /mehr/i })).toBeInTheDocument();
  });

  test('renders "mehr" button with custom label', () => {
    render(
      <StartseitenKarussell
        title="Test"
        items={[]}
        renderItem={renderItem}
        onMehr={() => {}}
        mehrText="Alle anzeigen"
      />
    );
    expect(screen.getByRole('button', { name: /alle anzeigen/i })).toBeInTheDocument();
  });

  test('calls onMehr when "mehr" button is clicked', () => {
    const onMehr = jest.fn();
    const scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <StartseitenKarussell title="Test" items={[]} renderItem={renderItem} onMehr={onMehr} />
    );
    fireEvent.click(screen.getByRole('button', { name: /mehr/i }));
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(onMehr).toHaveBeenCalledTimes(1);
    expect(scrollToSpy.mock.invocationCallOrder[0]).toBeLessThan(onMehr.mock.invocationCallOrder[0]);
    scrollToSpy.mockRestore();
  });

  test('does not show empty text or carousel when loading', () => {
    const { container } = render(
      <StartseitenKarussell
        title="Test"
        items={[]}
        loading={true}
        renderItem={renderItem}
        emptyText="Leer"
      />
    );
    expect(screen.queryByText('Leer')).not.toBeInTheDocument();
    expect(container.querySelector('.startseite-carousel')).not.toBeInTheDocument();
  });

  test('always renders .startseite-carousel-wrap in empty state', () => {
    const { container } = render(
      <StartseitenKarussell
        title="Test"
        items={[]}
        loading={false}
        renderItem={renderItem}
        emptyText="Leer"
      />
    );
    expect(container.querySelector('.startseite-carousel-wrap')).toBeInTheDocument();
  });

  test('renders .startseite-carousel-wrap with .startseite-carousel when items exist', () => {
    const { container } = render(
      <StartseitenKarussell
        title="Test"
        items={mockItems}
        loading={false}
        renderItem={renderItem}
      />
    );
    const wrap = container.querySelector('.startseite-carousel-wrap');
    expect(wrap).toBeInTheDocument();
    expect(wrap.querySelector('.startseite-carousel')).toBeInTheDocument();
  });

  test('renders titleAction next to the title when provided', () => {
    render(
      <StartseitenKarussell
        title="Testbereich"
        items={[]}
        renderItem={renderItem}
        titleAction={<button>Aktion</button>}
      />
    );
    expect(screen.getByRole('button', { name: /Aktion/i })).toBeInTheDocument();
  });

  test('does not render .startseite-section-title-action when titleAction is not provided', () => {
    const { container } = render(
      <StartseitenKarussell title="Testbereich" items={[]} renderItem={renderItem} />
    );
    expect(container.querySelector('.startseite-section-title-action')).not.toBeInTheDocument();
  });

  test('calls titleAction handler when clicked', () => {
    const handleClick = jest.fn();
    render(
      <StartseitenKarussell
        title="Testbereich"
        items={[]}
        renderItem={renderItem}
        titleAction={<button onClick={handleClick}>Aktion</button>}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Aktion/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('StartseitenKarussell in anderer Sprache (Mehrsprachigkeit PR 6e)', () => {
  test('Laden und „mehr“ auf Englisch', () => {
    const { unmount } = renderWithProviders(<StartseitenKarussell title="Trending" items={[]} loading renderItem={() => null} />, { sprache: 'en' });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    unmount();
    renderWithProviders(<StartseitenKarussell title="Trending" items={[{ id: 'a' }]} renderItem={() => <span>A</span>} onMehr={() => {}} />, { sprache: 'en' });
    expect(screen.getByRole('button', { name: 'more' })).toBeInTheDocument();
  });
});

describe('StartseitenKarussell: Anschnitt und Blättern-Pfeile', () => {
  const originale = {};
  const ueberschreiben = (name, wert) => {
    originale[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get() {
        return this.classList && this.classList.contains('startseite-carousel') ? wert : 0;
      },
    });
  };

  afterEach(() => {
    Object.entries(originale).forEach(([name, descriptor]) => {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
      else delete HTMLElement.prototype[name];
      delete originale[name];
    });
  });

  test('reicht nur mit Kacheln bis an den Rand', () => {
    const { container, rerender } = render(
      <StartseitenKarussell title="Test" items={mockItems} renderItem={renderItem} />
    );
    expect(container.querySelector('.startseite-carousel-wrap')).toHaveClass('startseite-carousel-wrap--randlos');

    rerender(<StartseitenKarussell title="Test" items={[]} renderItem={renderItem} emptyText="Leer" />);
    expect(container.querySelector('.startseite-carousel-wrap')).not.toHaveClass('startseite-carousel-wrap--randlos');

    rerender(<StartseitenKarussell title="Test" items={mockItems} loading renderItem={renderItem} />);
    expect(container.querySelector('.startseite-carousel-wrap')).not.toHaveClass('startseite-carousel-wrap--randlos');
  });

  test('zeigt keine Pfeile, wenn alle Kacheln hineinpassen', () => {
    render(<StartseitenKarussell title="Test" items={mockItems} renderItem={renderItem} />);
    expect(screen.queryByRole('button', { name: 'Vorherige Rezepte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nächste Rezepte' })).not.toBeInTheDocument();
  });

  test('blättert weiter und blendet die Pfeile am Anfang und Ende aus', () => {
    ueberschreiben('scrollWidth', 1000);
    ueberschreiben('clientWidth', 400);
    const { container } = render(
      <StartseitenKarussell title="Test" items={mockItems} renderItem={renderItem} />
    );
    const carousel = container.querySelector('.startseite-carousel');
    carousel.scrollBy = jest.fn();
    container.querySelector('.startseite-carousel-item').getBoundingClientRect = () => ({ width: 160 });

    // Am Anfang: nur „Nächste“
    expect(screen.queryByRole('button', { name: 'Vorherige Rezepte' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nächste Rezepte' }));
    expect(carousel.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 160 }));

    // Am Ende: nur „Vorherige“
    Object.defineProperty(carousel, 'scrollLeft', { configurable: true, writable: true, value: 600 });
    fireEvent.scroll(carousel);
    expect(screen.queryByRole('button', { name: 'Nächste Rezepte' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vorherige Rezepte' }));
    expect(carousel.scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -160 }));

    // Dazwischen: beide
    carousel.scrollLeft = 300;
    fireEvent.scroll(carousel);
    expect(screen.getByRole('button', { name: 'Vorherige Rezepte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nächste Rezepte' })).toBeInTheDocument();
  });

  test('Pfeile auf Englisch und Französisch', () => {
    ueberschreiben('scrollWidth', 1000);
    ueberschreiben('clientWidth', 400);
    const { unmount } = renderWithProviders(
      <StartseitenKarussell title="Trending" items={mockItems} renderItem={renderItem} />,
      { sprache: 'en' }
    );
    expect(screen.getByRole('button', { name: 'Next recipes' })).toBeInTheDocument();
    unmount();
    renderWithProviders(
      <StartseitenKarussell title="Tendances" items={mockItems} renderItem={renderItem} />,
      { sprache: 'fr' }
    );
    expect(screen.getByRole('button', { name: 'Recettes suivantes' })).toBeInTheDocument();
  });
});
