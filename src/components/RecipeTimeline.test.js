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
});
