import React from 'react';
import { render, screen } from '@testing-library/react';
import Header from './Header';

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getHeaderSlogan: () => Promise.resolve('Test Slogan')
}));

const mockCurrentUser = {
  id: '1',
  vorname: 'Test',
  nachname: 'User',
  email: 'test@example.com',
  isAdmin: false
};

describe('Header - Hamburger Menu Visibility', () => {
  test('hamburger menu should be visible in recipes view', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );
    
    // The hamburger menu button should be present
    const hamburgerBtn = screen.getByLabelText('Menü öffnen');
    expect(hamburgerBtn).toBeInTheDocument();
  });

  test('hamburger menu should be visible in menus view', () => {
    render(
      <Header
        currentView="menus"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );
    
    // The hamburger menu button should be present even in menus view
    const hamburgerBtn = screen.getByLabelText('Menü öffnen');
    expect(hamburgerBtn).toBeInTheDocument();
  });

  test('search should only be visible in recipes view', () => {
    const { rerender } = render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );
    
    // Search should be visible in recipes view
    expect(screen.getByLabelText('Suche')).toBeInTheDocument();
    
    // Re-render with menus view
    rerender(
      <Header
        currentView="menus"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );
    
    // Search should NOT be visible in menus view
    expect(screen.queryByLabelText('Suche')).not.toBeInTheDocument();
  });

  test('hamburger menu should not be visible when user is not logged in', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={null}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );
    
    // The hamburger menu button should not be present without a user
    expect(screen.queryByLabelText('Menü öffnen')).not.toBeInTheDocument();
  });
});
