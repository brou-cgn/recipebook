import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StartseitenKarussell from './StartseitenKarussell';

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
    render(
      <StartseitenKarussell title="Test" items={[]} renderItem={renderItem} onMehr={onMehr} />
    );
    fireEvent.click(screen.getByRole('button', { name: /mehr/i }));
    expect(onMehr).toHaveBeenCalledTimes(1);
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
});
