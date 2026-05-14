import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TrendingCard from './TrendingCard';

const mockRecipe = {
  id: 'r1',
  title: 'Pasta Carbonara',
  image: 'https://example.com/pasta.jpg',
  schwierigkeit: 3,
  kochdauer: 30,
};

describe('TrendingCard', () => {
  test('renders without crashing', () => {
    render(<TrendingCard recipe={mockRecipe} />);
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
  });

  test('renders null when no recipe is given', () => {
    const { container } = render(<TrendingCard recipe={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('displays the recipe title', () => {
    render(<TrendingCard recipe={mockRecipe} />);
    expect(screen.getByRole('heading', { name: 'Pasta Carbonara' })).toBeInTheDocument();
  });

  test('displays cooking time', () => {
    render(<TrendingCard recipe={mockRecipe} />);
    expect(screen.getByText('30 Min.')).toBeInTheDocument();
  });

  test('displays difficulty stars', () => {
    render(<TrendingCard recipe={mockRecipe} />);
    expect(screen.getByLabelText('Schwierigkeit 3 von 5')).toBeInTheDocument();
  });

  test('does not display difficulty when schwierigkeit is absent', () => {
    const recipe = { ...mockRecipe, schwierigkeit: null };
    render(<TrendingCard recipe={recipe} />);
    expect(screen.queryByLabelText(/Schwierigkeit/)).toBeNull();
  });

  test('does not display time when kochdauer is absent', () => {
    const recipe = { ...mockRecipe, kochdauer: null };
    render(<TrendingCard recipe={recipe} />);
    expect(screen.queryByText(/Min\./)).toBeNull();
  });

  test('renders difficulty icon when difficultyIcon prop is provided', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} difficultyIcon="★" />);
    const icons = container.querySelectorAll('.trending-card-meta-icon');
    expect(icons.length).toBeGreaterThan(0);
    expect(icons[0]).toHaveTextContent('★');
  });

  test('renders time icon when timeIcon prop is provided', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} timeIcon="⏱" />);
    const icons = container.querySelectorAll('.trending-card-meta-icon');
    expect(icons.length).toBeGreaterThan(0);
  });

  test('does not render meta icons when icon props are omitted', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} />);
    expect(container.querySelectorAll('.trending-card-meta-icon').length).toBe(0);
  });

  test('time is rendered in trending-card-time span', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} />);
    expect(container.querySelector('.trending-card-time')).toBeInTheDocument();
  });

  test('difficulty stars wrapped in trending-card-meta-left when schwierigkeit set', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} />);
    expect(container.querySelector('.trending-card-meta-left')).toBeInTheDocument();
  });

  test('calls onSelectRecipe when clicked', () => {
    const onSelectRecipe = jest.fn();
    render(<TrendingCard recipe={mockRecipe} onSelectRecipe={onSelectRecipe} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelectRecipe).toHaveBeenCalledWith(mockRecipe);
  });

  test('does not throw when onSelectRecipe is not provided', () => {
    render(<TrendingCard recipe={mockRecipe} />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });

  test('renders image when recipe.image is set', () => {
    render(<TrendingCard recipe={mockRecipe} />);
    const img = screen.getByAltText('Pasta Carbonara');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/pasta.jpg');
  });

  test('renders placeholder when no image is available', () => {
    const recipe = { ...mockRecipe, image: null, images: [] };
    const { container } = render(<TrendingCard recipe={recipe} />);
    expect(container.querySelector('.trending-card-image-placeholder')).toBeInTheDocument();
  });

  test('prefers images array over image field', () => {
    const recipe = {
      ...mockRecipe,
      image: 'https://example.com/fallback.jpg',
      images: [
        { url: 'https://example.com/gallery.jpg', isDefault: true },
      ],
    };
    render(<TrendingCard recipe={recipe} />);
    const img = screen.getByAltText('Pasta Carbonara');
    expect(img).toHaveAttribute('src', 'https://example.com/gallery.jpg');
  });

  test('card has trending-card CSS class', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} />);
    expect(container.querySelector('.trending-card')).toBeInTheDocument();
  });

  test('text content area has trending-card-content CSS class', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} />);
    expect(container.querySelector('.trending-card-content')).toBeInTheDocument();
  });

  test('image container has trending-card-image CSS class for round corners', () => {
    const { container } = render(<TrendingCard recipe={mockRecipe} />);
    expect(container.querySelector('.trending-card-image')).toBeInTheDocument();
  });
});
