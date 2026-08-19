import React from 'react';
import { render, fireEvent } from '@testing-library/react';
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

describe('RecipeCard swipe-to-reveal list button', () => {
  const privateLists = [{ id: 'l1', name: 'Meine Liste', recipeIds: [] }];

  const swipe = (card, points) => {
    fireEvent.touchStart(card, { touches: [{ clientX: points[0].x, clientY: points[0].y }] });
    points.slice(1).forEach(({ x, y }) => {
      fireEvent.touchMove(card, { touches: [{ clientX: x, clientY: y }] });
    });
    fireEvent.touchEnd(card);
  };

  test('right swipe past threshold reveals the list button', () => {
    const { container } = render(
      <RecipeCard
        recipe={{ id: 'r1', title: 'Test' }}
        onClick={jest.fn()}
        privateLists={privateLists}
      />
    );
    const card = container.querySelector('.recipe-card');

    swipe(card, [{ x: 0, y: 0 }, { x: 60, y: 0 }]);

    expect(card).toHaveStyle('transform: translateX(80px)');
  });

  test('left swipe past threshold collapses a revealed card back', () => {
    const { container } = render(
      <RecipeCard
        recipe={{ id: 'r1', title: 'Test' }}
        onClick={jest.fn()}
        privateLists={privateLists}
      />
    );
    const card = container.querySelector('.recipe-card');

    swipe(card, [{ x: 0, y: 0 }, { x: 60, y: 0 }]);
    expect(card).toHaveStyle('transform: translateX(80px)');

    swipe(card, [{ x: 200, y: 0 }, { x: 140, y: 0 }]);

    expect(card).toHaveStyle('transform: translateX(0px)');
  });

  test('small left drag on a revealed card snaps back open', () => {
    const { container } = render(
      <RecipeCard
        recipe={{ id: 'r1', title: 'Test' }}
        onClick={jest.fn()}
        privateLists={privateLists}
      />
    );
    const card = container.querySelector('.recipe-card');

    swipe(card, [{ x: 0, y: 0 }, { x: 60, y: 0 }]);
    expect(card).toHaveStyle('transform: translateX(80px)');

    swipe(card, [{ x: 200, y: 0 }, { x: 185, y: 0 }]);

    expect(card).toHaveStyle('transform: translateX(80px)');
  });

  test('freezes carousel pointer events while the list button is revealed', () => {
    const { container } = render(
      <RecipeCard
        recipe={{ id: 'r1', title: 'Test', image: 'https://example.com/img.jpg' }}
        onClick={jest.fn()}
        privateLists={privateLists}
      />
    );
    const card = container.querySelector('.recipe-card');
    const imageWrapper = container.querySelector('.recipe-image');

    expect(imageWrapper).not.toHaveStyle('pointer-events: none');

    swipe(card, [{ x: 0, y: 0 }, { x: 60, y: 0 }]);

    expect(imageWrapper).toHaveStyle('pointer-events: none');
  });
});
