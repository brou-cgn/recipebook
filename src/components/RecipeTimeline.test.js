import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeTimeline from './RecipeTimeline';

describe('RecipeTimeline', () => {
  const mockRecipes = [
    {
      id: '1',
      title: 'Recipe 1',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['ingredient1', 'ingredient2'],
      steps: ['step1', 'step2'],
      authorId: 'user-1',
      image: 'https://example.com/image1.jpg'
    },
    {
      id: '2',
      title: 'Recipe 2',
      createdAt: { toDate: () => new Date('2024-01-20') },
      ingredients: ['ingredient1'],
      steps: ['step1'],
      authorId: 'user-2',
    },
    {
      id: '3',
      title: 'Recipe 3',
      createdAt: { toDate: () => new Date('2024-01-10') },
      ingredients: ['ingredient1', 'ingredient2', 'ingredient3'],
      steps: ['step1', 'step2', 'step3'],
      authorId: 'user-1',
    }
  ];

  const mockUsers = [
    { id: 'user-1', vorname: 'John', nachname: 'Doe' },
    { id: 'user-2', vorname: 'Jane', nachname: 'Smith' },
  ];

  test('renders empty state when no recipes', () => {
    render(
      <RecipeTimeline 
        recipes={[]} 
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );
    
    expect(screen.getByText('Keine Rezepte vorhanden')).toBeInTheDocument();
  });

  test('renders recipes in reverse chronological order', () => {
    render(
      <RecipeTimeline 
        recipes={mockRecipes} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    // Get all timeline cards
    const timelineCards = document.querySelectorAll('.timeline-card');
    expect(timelineCards).toHaveLength(3);
    
    // Verify order: Recipe 2 (Jan 20) -> Recipe 1 (Jan 15) -> Recipe 3 (Jan 10)
    const titles = Array.from(timelineCards).map(card => 
      card.querySelector('.timeline-title').textContent
    );
    expect(titles).toEqual(['Recipe 2', 'Recipe 1', 'Recipe 3']);
  });

  test('displays recipe details correctly', () => {
    render(
      <RecipeTimeline 
        recipes={[mockRecipes[0]]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    expect(screen.getByText('Recipe 1')).toBeInTheDocument();
    expect(screen.getByText('2 Zutaten')).toBeInTheDocument();
    expect(screen.getByText('2 Schritte')).toBeInTheDocument();
    expect(screen.getByText('15. Januar 2024')).toBeInTheDocument();
  });

  test('displays author name when provided', () => {
    render(
      <RecipeTimeline 
        recipes={[mockRecipes[0]]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  test('handles recipe click', () => {
    const handleSelectRecipe = jest.fn();
    
    render(
      <RecipeTimeline 
        recipes={[mockRecipes[0]]} 
        onSelectRecipe={handleSelectRecipe}
        allUsers={mockUsers}
      />
    );
    
    const timelineCard = document.querySelector('.timeline-card');
    fireEvent.click(timelineCard);
    
    expect(handleSelectRecipe).toHaveBeenCalledWith(mockRecipes[0]);
  });

  test('handles date formatting for different formats', () => {
    const recipeWithStringDate = {
      ...mockRecipes[0],
      createdAt: new Date('2024-02-01')
    };
    
    render(
      <RecipeTimeline 
        recipes={[recipeWithStringDate]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    expect(screen.getByText('01. Februar 2024')).toBeInTheDocument();
  });

  test('displays image when provided', () => {
    render(
      <RecipeTimeline 
        recipes={[mockRecipes[0]]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    const image = screen.getByAltText('Recipe 1');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image1.jpg');
  });

  test('renders without image when not provided', () => {
    render(
      <RecipeTimeline 
        recipes={[mockRecipes[1]]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    expect(screen.queryByAltText('Recipe 2')).not.toBeInTheDocument();
  });

  test('groups multiple recipes on the same day as a stack', () => {
    const sameDay = new Date('2024-03-05');
    const recipesOnSameDay = [
      { id: 'a', title: 'Morning Cake', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'b', title: 'Evening Stew', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
    ];

    render(
      <RecipeTimeline
        recipes={recipesOnSameDay}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    // Should show only one timeline-item (one entry per day)
    const timelineItems = document.querySelectorAll('.timeline-item');
    expect(timelineItems).toHaveLength(1);

    // Should show the stack container and the count badge
    expect(document.querySelector('.timeline-stack')).toBeInTheDocument();
    expect(document.querySelector('.timeline-stack-badge')).toHaveTextContent('2');

    // The toggle button should show the recipe count
    expect(screen.getByText(/2 Rezepte/)).toBeInTheDocument();
  });

  test('expands stacked recipes when toggle is clicked', () => {
    const sameDay = new Date('2024-03-05');
    const recipesOnSameDay = [
      { id: 'a', title: 'Morning Cake', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'b', title: 'Evening Stew', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
    ];
    const handleSelect = jest.fn();

    render(
      <RecipeTimeline
        recipes={recipesOnSameDay}
        onSelectRecipe={handleSelect}
        allUsers={[]}
      />
    );

    // Before expanding: stack is visible, individual cards are not
    expect(document.querySelector('.timeline-stack')).toBeInTheDocument();

    // Click the toggle button to expand
    fireEvent.click(screen.getByRole('button', { name: /Stapel ausklappen/ }));

    // After expanding: individual cards should be visible
    expect(screen.getByText('Morning Cake')).toBeInTheDocument();
    expect(screen.getByText('Evening Stew')).toBeInTheDocument();
    expect(document.querySelector('.timeline-stack')).not.toBeInTheDocument();
  });

  test('calls onSelectRecipe when an expanded stack card is clicked', () => {
    const sameDay = new Date('2024-03-05');
    const recipe1 = { id: 'a', title: 'Morning Cake', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] };
    const recipe2 = { id: 'b', title: 'Evening Stew', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] };
    const handleSelect = jest.fn();

    render(
      <RecipeTimeline
        recipes={[recipe1, recipe2]}
        onSelectRecipe={handleSelect}
        allUsers={[]}
      />
    );

    // Expand the stack
    fireEvent.click(screen.getByRole('button', { name: /Stapel ausklappen/ }));

    // Click on the second recipe card
    fireEvent.click(screen.getByText('Evening Stew').closest('.timeline-card'));
    expect(handleSelect).toHaveBeenCalledWith(recipe2);
  });

  test('displays custom emoji icon in bubble marker', () => {
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        timelineBubbleIcon="🍕"
      />
    );

    expect(document.querySelector('.timeline-marker-emoji')).toHaveTextContent('🍕');
  });

  test('displays custom image icon in bubble marker', () => {
    const iconSrc = 'data:image/png;base64,abc123';
    render(
      <RecipeTimeline
        recipes={[mockRecipes[0]]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        timelineBubbleIcon={iconSrc}
      />
    );

    const iconImg = document.querySelector('.timeline-marker-icon');
    expect(iconImg).toBeInTheDocument();
    expect(iconImg).toHaveAttribute('src', iconSrc);
  });
});
