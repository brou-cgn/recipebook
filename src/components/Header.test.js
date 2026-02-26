import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getHeaderSlogan: () => Promise.resolve('Test Slogan'),
  getAppLogoImage: () => Promise.resolve(null)
}));

// Mock faqFirestore with a controllable subscribeToFaqs
jest.mock('../utils/faqFirestore', () => ({
  subscribeToFaqs: jest.fn((cb) => {
    cb([]);
    return () => {};
  })
}));

const { subscribeToFaqs: mockSubscribeToFaqs } = jest.requireMock('../utils/faqFirestore');

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

  test('version should be displayed in hamburger menu', () => {
    // Set up the environment variable for version
    const originalVersion = process.env.REACT_APP_VERSION;
    process.env.REACT_APP_VERSION = '0.1.1';

    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );
    
    // Open the hamburger menu
    const hamburgerBtn = screen.getByLabelText('Menü öffnen');
    fireEvent.click(hamburgerBtn);
    
    // Check if version is displayed
    expect(screen.getByText(/v0\.1\.1/)).toBeInTheDocument();

    // Restore original environment variable
    process.env.REACT_APP_VERSION = originalVersion;
  });

  test('pressing Enter in the search input blurs it (dismisses keyboard)', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
        onSearchChange={() => {}}
      />
    );

    // Open search
    const searchBtn = screen.getByLabelText('Suche');
    fireEvent.click(searchBtn);

    const searchInput = screen.getByPlaceholderText('Rezepte durchsuchen...');
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

    expect(document.activeElement).not.toBe(searchInput);
  });
});

describe('Header - FAQ Kochschule Modal', () => {
  test('level-0 FAQ description is shown in the Kochschule modal', () => {
    mockSubscribeToFaqs.mockImplementationOnce((cb) => {
      cb([
        { id: 'faq-0', level: 0, title: 'Abschnitt Kochbuch', description: 'Beschreibung der Ebene 0' },
        { id: 'faq-1', level: 1, title: 'Frage 1', description: 'Antwort 1' }
      ]);
      return () => {};
    });

    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );

    // Open the hamburger menu
    fireEvent.click(screen.getByLabelText('Menü öffnen'));

    // Open the Kochschule modal
    fireEvent.click(screen.getByText('Kochschule'));

    // The level-0 description should be visible
    expect(screen.getByText('Beschreibung der Ebene 0')).toBeInTheDocument();
  });

  test('level-0 FAQ without description renders without error', () => {
    mockSubscribeToFaqs.mockImplementationOnce((cb) => {
      cb([{ id: 'faq-0', level: 0, title: 'Abschnitt ohne Beschreibung' }]);
      return () => {};
    });

    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByText('Kochschule'));

    expect(screen.getByText('Abschnitt ohne Beschreibung')).toBeInTheDocument();
  });
});
