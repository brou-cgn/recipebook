import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AtelierCategoryOverlay from './AtelierCategoryOverlay';

describe('AtelierCategoryOverlay', () => {
  test('renders the heading, body text and all category chips', () => {
    render(<AtelierCategoryOverlay onContinue={() => {}} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Wonach suchst du heute?')).toBeInTheDocument();
    expect(screen.getByText(/Lass dich überraschen/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hauptspeisen')).toBeInTheDocument();
    expect(screen.getByLabelText('Pizzen')).toBeInTheDocument();
  });

  test('renders chips in alphabetical order by default', () => {
    render(<AtelierCategoryOverlay onContinue={() => {}} />);

    const labels = screen.getAllByRole('checkbox').map((cb) => cb.nextSibling.textContent);
    expect(labels).toEqual([
      'Beilagen & Grundrezepte',
      'Desserts',
      'Dips & Saucen',
      'Drinks',
      'Gebäcke & Teige',
      'Hauptspeisen',
      'Pizzen',
      'Salate',
      'Suppen & Eintöpfe',
      'Vorspeisen',
    ]);
  });

  test('checking a chip moves it to the front, keeping alphabetical order within each group', () => {
    render(<AtelierCategoryOverlay onContinue={() => {}} />);

    fireEvent.click(screen.getByLabelText('Pizzen'));
    fireEvent.click(screen.getByLabelText('Desserts'));

    const labels = screen.getAllByRole('checkbox').map((cb) => cb.nextSibling.textContent);
    expect(labels).toEqual([
      'Desserts',
      'Pizzen',
      'Beilagen & Grundrezepte',
      'Dips & Saucen',
      'Drinks',
      'Gebäcke & Teige',
      'Hauptspeisen',
      'Salate',
      'Suppen & Eintöpfe',
      'Vorspeisen',
    ]);
  });

  test('calls onContinue when "Kochatelier öffnen" is clicked', () => {
    const onContinue = jest.fn();
    render(<AtelierCategoryOverlay onContinue={onContinue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Kochatelier öffnen' }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test('marks the second progress dot as active', () => {
    const { container } = render(<AtelierCategoryOverlay onContinue={() => {}} />);

    const dots = container.querySelectorAll('.atelier-category-dot');
    expect(dots).toHaveLength(7);
    expect(dots[1].className).toContain('atelier-category-dot--active');
    expect(dots[0].className).not.toContain('atelier-category-dot--active');
  });
});
