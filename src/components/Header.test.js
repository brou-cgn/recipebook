import React, { createRef, act } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Header from './Header';

// Mock the custom lists utility
jest.mock('../utils/customLists', () => ({
  getHeaderSlogan: () => Promise.resolve('Test Slogan'),
  getAppLogoImage: () => Promise.resolve(null),
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

  test('navigation items are ordered as Kochbuch, Festtafel, Kochatelier, Chefkoch & mehr', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
        interactiveLists={[{ id: 'list-1' }]}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));

    const navigationSection = screen.getByText('Navigation').closest('.menu-section');
    expect(navigationSection).not.toBeNull();

    const menuItems = within(navigationSection)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    const kochbuchIndex = menuItems.indexOf('Kochbuch');
    const festtafelIndex = menuItems.indexOf('Festtafel');
    const kochatelierIndex = menuItems.indexOf('Kochatelier');
    const chefkochIndex = menuItems.indexOf('Chefkoch & mehr');

    expect(kochbuchIndex).not.toBe(-1);
    expect(festtafelIndex).not.toBe(-1);
    expect(kochatelierIndex).not.toBe(-1);
    expect(chefkochIndex).not.toBe(-1);
    expect(kochbuchIndex).toBeLessThan(festtafelIndex);
    expect(festtafelIndex).toBeLessThan(kochatelierIndex);
    expect(kochatelierIndex).toBeLessThan(chefkochIndex);
  });

  test('shows "Küche" as first navigation item when startseite is enabled', () => {
    render(
      <Header
        currentView="startseite"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
        interactiveLists={[{ id: 'list-1' }]}
        startseiteEnabled
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));

    const navigationSection = screen.getByText('Navigation').closest('.menu-section');
    expect(navigationSection).not.toBeNull();

    const menuItems = within(navigationSection)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());

    expect(menuItems[0]).toBe('Küche');
    expect(menuItems[1]).toBe('Kochbuch');
  });

  test('clicking "Küche" triggers onViewChange with startseite', () => {
    const onViewChange = jest.fn();

    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={onViewChange}
        onLogout={() => {}}
        startseiteEnabled
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByRole('button', { name: 'Küche' }));

    expect(onViewChange).toHaveBeenCalledWith('startseite');
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

describe('Header - openSearch imperative handle', () => {
  test('openSearch() via ref opens the search input', () => {
    const ref = createRef();
    render(
      <Header
        ref={ref}
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
        onSearchChange={() => {}}
      />
    );

    // Search input should not be visible initially
    expect(screen.queryByPlaceholderText('Rezepte durchsuchen...')).not.toBeInTheDocument();

    // Call openSearch via ref
    act(() => {
      ref.current.openSearch();
    });

    // Search input should now be visible
    expect(screen.getByPlaceholderText('Rezepte durchsuchen...')).toBeInTheDocument();
  });
});

describe('Header - Erscheinungsbild (themeToggle) permission', () => {
  test('Erscheinungsbild section is not shown in the hamburger menu', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.queryByText('Erscheinungsbild')).not.toBeInTheDocument();
  });
});

describe('Header - Einstellungen permission', () => {
  test('Einstellungen menu item is shown for admins even without settingsAccess', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={{ ...mockCurrentUser, isAdmin: true, settingsAccess: false }}
        onViewChange={() => {}}
        onLogout={() => {}}
        onSettingsClick={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  test('Einstellungen menu item is shown for users with settingsAccess', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={{ ...mockCurrentUser, settingsAccess: true }}
        onViewChange={() => {}}
        onLogout={() => {}}
        onSettingsClick={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.getByText('Einstellungen')).toBeInTheDocument();
  });

  test('Einstellungen menu item is hidden without settingsAccess', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={{ ...mockCurrentUser, settingsAccess: false }}
        onViewChange={() => {}}
        onLogout={() => {}}
        onSettingsClick={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.queryByText('Einstellungen')).not.toBeInTheDocument();
  });
});

describe('Header - Chefkoch user name click', () => {
  test('user name button has aria-label when onChefkochClick is provided', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
        onChefkochClick={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.getByLabelText('Chefkoch-Seite öffnen')).toBeInTheDocument();
  });

  test('clicking user name calls onChefkochClick and closes the menu', () => {
    const onChefkochClick = jest.fn();
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
        onChefkochClick={onChefkochClick}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByLabelText('Chefkoch-Seite öffnen'));

    expect(onChefkochClick).toHaveBeenCalledTimes(1);
    // Menu should be closed after clicking
    expect(screen.queryByText('Abmelden')).not.toBeInTheDocument();
  });

  test('user name is not interactive when onChefkochClick is not provided', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    const userNameBtn = screen.getByRole('button', { name: `${mockCurrentUser.vorname} ${mockCurrentUser.nachname}` });
    expect(userNameBtn).toBeDisabled();
  });
});
