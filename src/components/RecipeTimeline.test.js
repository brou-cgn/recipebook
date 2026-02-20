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

  test('sorts correctly when createdAt is an ISO date string', () => {
    const recipesWithStringDates = [
      { id: 's1', title: 'Old Recipe', createdAt: '2020-11-13T00:00:00Z', ingredients: [], steps: [] },
      { id: 's2', title: 'New Recipe', createdAt: '2026-02-08T00:00:00Z', ingredients: [], steps: [] },
      { id: 's3', title: 'Middle Recipe', createdAt: '2021-12-30T00:00:00Z', ingredients: [], steps: [] },
    ];

    render(
      <RecipeTimeline
        recipes={recipesWithStringDates}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    const timelineCards = document.querySelectorAll('.timeline-card');
    const titles = Array.from(timelineCards).map(card =>
      card.querySelector('.timeline-title').textContent
    );
    // Newest first: 2026, 2021, 2020
    expect(titles).toEqual(['New Recipe', 'Middle Recipe', 'Old Recipe']);
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
    const categoryImgs = [
      { id: 'c1', image: 'https://example.com/image1.jpg', categories: ['Main Course'] }
    ];
    const recipeWithCategory = { ...mockRecipes[0], speisekategorie: ['Main Course'] };
    render(
      <RecipeTimeline 
        recipes={[recipeWithCategory]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
        categoryImages={categoryImgs}
      />
    );
    
    const image = screen.getByAltText('Recipe 1');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image1.jpg');
  });

  test('renders without image when no category image matches', () => {
    render(
      <RecipeTimeline 
        recipes={[mockRecipes[0]]} 
        onSelectRecipe={() => {}}
        allUsers={mockUsers}
      />
    );
    
    expect(screen.queryByAltText('Recipe 1')).not.toBeInTheDocument();
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

  test('calls onSelectRecipe when the front card of a stack is clicked (without expanding)', () => {
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

    // Stack is visible before click
    expect(document.querySelector('.timeline-stack')).toBeInTheDocument();

    // Click directly on the front card
    fireEvent.click(document.querySelector('.timeline-stack-front'));

    // onSelectRecipe should have been called with the primary (first) recipe
    expect(handleSelect).toHaveBeenCalledWith(recipe1);

    // Stack should still be visible (not expanded)
    expect(document.querySelector('.timeline-stack')).toBeInTheDocument();
  });

  test('expands the stack when the badge is clicked', () => {
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

    // Click the badge to expand
    fireEvent.click(document.querySelector('.timeline-stack-badge'));

    // Stack should be gone, individual cards visible
    expect(document.querySelector('.timeline-stack')).not.toBeInTheDocument();
    expect(screen.getByText('Morning Cake')).toBeInTheDocument();
    expect(screen.getByText('Evening Stew')).toBeInTheDocument();
  });

  test('expands the stack when a background card is clicked', () => {
    const sameDay = new Date('2024-03-05');
    const recipesOnSameDay = [
      { id: 'a', title: 'Alpha', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'b', title: 'Beta', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'c', title: 'Gamma', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
    ];

    render(
      <RecipeTimeline
        recipes={recipesOnSameDay}
        onSelectRecipe={() => {}}
        allUsers={[]}
      />
    );

    // Click the first background card
    fireEvent.click(document.querySelector('.timeline-stack-bg-1'));

    // Stack should be gone, individual cards visible
    expect(document.querySelector('.timeline-stack')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
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

  test('uses categoryImages to show category image for recipe', () => {
    const categoryImgs = [
      { id: 'c1', image: 'data:image/png;base64,categoryimage', categories: ['Dessert'] }
    ];
    const recipeWithCategory = { ...mockRecipes[0], speisekategorie: ['Dessert'] };
    render(
      <RecipeTimeline
        recipes={[recipeWithCategory]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        categoryImages={categoryImgs}
      />
    );

    const img = screen.getByAltText('Recipe 1');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,categoryimage');
  });

  test('shows no image for recipe when category does not match', () => {
    const categoryImgs = [
      { id: 'c1', image: 'data:image/png;base64,categoryimage', categories: ['Dessert'] }
    ];
    const recipeWithOtherCategory = { ...mockRecipes[0], speisekategorie: ['Soup'] };
    render(
      <RecipeTimeline
        recipes={[recipeWithOtherCategory]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        categoryImages={categoryImgs}
      />
    );

    expect(screen.queryByAltText('Recipe 1')).not.toBeInTheDocument();
  });

  test('uses defaultImage for menu items', () => {
    const defaultImg = 'data:image/png;base64,defaultimage';
    const menuItem = {
      id: 'm1',
      title: 'Test Menu',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['r1', 'r2'],
      steps: [],
      authorId: 'user-1',
    };
    render(
      <RecipeTimeline
        recipes={[menuItem]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        defaultImage={defaultImg}
        itemType="menu"
      />
    );

    const img = screen.getByAltText('Test Menu');
    expect(img).toHaveAttribute('src', defaultImg);
  });

  test('does not show meta info (Rezepte/Zutaten/Schritte) for menu items', () => {
    const menuItem = {
      id: 'm1',
      title: 'Test Menu',
      createdAt: { toDate: () => new Date('2024-01-15') },
      ingredients: ['r1', 'r2', 'r3'],
      steps: [],
      authorId: 'user-1',
    };
    render(
      <RecipeTimeline
        recipes={[menuItem]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        itemType="menu"
      />
    );

    expect(screen.getByText('Test Menu')).toBeInTheDocument();
    expect(screen.queryByText(/Rezepte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Zutaten/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Schritte/)).not.toBeInTheDocument();
  });

  test('shows "Keine Menüs vorhanden" empty state when itemType is menu', () => {
    render(
      <RecipeTimeline
        recipes={[]}
        onSelectRecipe={() => {}}
        allUsers={[]}
        itemType="menu"
      />
    );

    expect(screen.getByText('Keine Menüs vorhanden')).toBeInTheDocument();
  });

  test('collapses expanded stack when clicking on timeline-gutter', () => {
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

    // Expand the stack
    fireEvent.click(screen.getByRole('button', { name: /Stapel ausklappen/ }));
    expect(screen.getByText('Morning Cake')).toBeInTheDocument();
    expect(document.querySelector('.timeline-stack')).not.toBeInTheDocument();

    // Click on the gutter to collapse
    // Click the gutter to collapse
    fireEvent.click(document.querySelector('.timeline-gutter'));
    expect(document.querySelector('.timeline-stack')).toBeInTheDocument();
  });

  test('does not collapse stack when clicking a card in expanded stack', () => {
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
    expect(document.querySelector('.timeline-stack')).not.toBeInTheDocument();

    // Click a card - should call onSelectRecipe, not collapse
    fireEvent.click(screen.getByText('Morning Cake').closest('.timeline-card'));
    expect(handleSelect).toHaveBeenCalledWith(recipe1);
    // Stack should still be expanded (no stack container visible)
    expect(document.querySelector('.timeline-stack')).not.toBeInTheDocument();
  });

  test('adds expanded class to timeline-item when stack is expanded', () => {
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

    const timelineItem = document.querySelector('.timeline-item');
    expect(timelineItem).not.toHaveClass('expanded');

    fireEvent.click(screen.getByRole('button', { name: /Stapel ausklappen/ }));
    expect(document.querySelector('.timeline-item')).toHaveClass('expanded');
  });

  test('does not collapse non-expanded stack when clicking timeline-gutter (gutter not present)', () => {
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

    // Stack is not expanded initially - no gutter present
    expect(document.querySelector('.timeline-stack')).toBeInTheDocument();
    expect(document.querySelector('.timeline-gutter')).not.toBeInTheDocument();
  });

  test('stack toggle shows "X Menüs" label when itemType is menu', () => {
    const sameDay = new Date('2024-03-05');
    const menuItems = [
      { id: 'm1', title: 'Menu A', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
      { id: 'm2', title: 'Menu B', createdAt: { toDate: () => sameDay }, ingredients: [], steps: [] },
    ];

    render(
      <RecipeTimeline
        recipes={menuItems}
        onSelectRecipe={() => {}}
        allUsers={[]}
        itemType="menu"
      />
    );

    expect(screen.getByText(/2 Menüs/)).toBeInTheDocument();
  });
});
