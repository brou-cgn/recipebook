import React from 'react';
import { render } from '@testing-library/react';
import RecipeCard from './RecipeCard';

const mockRecipeImageCarousel = jest.fn(() => <div data-testid="mock-carousel" />);

jest.mock('./RecipeImageCarousel', () => (props) => mockRecipeImageCarousel(props));
jest.mock('./RecipeRating', () => () => <div data-testid="mock-rating" />);

describe('RecipeCard thumbnail handling', () => {
  beforeEach(() => {
    mockRecipeImageCarousel.mockClear();
  });

  test('does not inject recipe.imageThumbnail for default category images', () => {
    render(
      <RecipeCard
        recipe={{
          id: 'r1',
          title: 'Kategorie-Rezept',
          image: 'data:image/png;base64,category-default',
          imageThumbnail: 'https://example.com/thumb.jpg',
        }}
        onClick={jest.fn()}
      />
    );

    const carouselProps = mockRecipeImageCarousel.mock.calls[0][0];
    expect(carouselProps.images[0].thumbnailUrl).toBeUndefined();
  });

  test('keeps recipe.imageThumbnail for custom remote images', () => {
    render(
      <RecipeCard
        recipe={{
          id: 'r2',
          title: 'Eigenes Rezeptbild',
          image: 'https://example.com/custom.jpg',
          imageThumbnail: 'https://example.com/custom-thumb.jpg',
        }}
        onClick={jest.fn()}
      />
    );

    const carouselProps = mockRecipeImageCarousel.mock.calls[0][0];
    expect(carouselProps.images[0].thumbnailUrl).toBe('https://example.com/custom-thumb.jpg');
  });
});
