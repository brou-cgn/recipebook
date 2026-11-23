import React, { createRef, act } from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import Header from './Header';
import { SpracheProvider } from '../contexts/SpracheContext';

// Mock the custom lists utility
// Slogan und Übersetzungen über Variablen statt jest.fn: resetMocks setzt vor jedem Test zurück.
let mockSlogan = 'Test Slogan';
let mockSloganUebersetzungen = null;
jest.mock('../utils/customLists', () => ({
  DEFAULT_SLOGAN: 'Unsere besten Momente',
  getHeaderSlogan: () => Promise.resolve(mockSlogan),
  getSloganUebersetzungen: () => Promise.resolve(mockSloganUebersetzungen),
  getAppLogoImage: () => Promise.resolve(null),
  getFaviconText: () => Promise.resolve('brouBook'),
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
  email: 'test@example.com'
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

  test('navigation items are ordered as Kochbuch, Festtafel, Events, Kochatelier, Chefkoch & mehr', () => {
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
    const eventsIndex = menuItems.indexOf('Events');
    const kochatelierIndex = menuItems.indexOf('Kochatelier');
    const chefkochIndex = menuItems.indexOf('Chefkoch & mehr');

    expect(kochbuchIndex).not.toBe(-1);
    expect(festtafelIndex).not.toBe(-1);
    expect(eventsIndex).not.toBe(-1);
    expect(kochatelierIndex).not.toBe(-1);
    expect(chefkochIndex).not.toBe(-1);
    expect(kochbuchIndex).toBeLessThan(festtafelIndex);
    expect(festtafelIndex).toBeLessThan(eventsIndex);
    expect(eventsIndex).toBeLessThan(kochatelierIndex);
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

  test.each(['recipes', 'menus', 'kueche'])(
    'clicking the header logo area navigates to startseite from %s view',
    (currentView) => {
      const onViewChange = jest.fn();

      render(
        <Header
          currentView={currentView}
          currentUser={mockCurrentUser}
          onViewChange={onViewChange}
          onLogout={() => {}}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Zur Startseite' }));

      expect(onViewChange).toHaveBeenCalledWith('startseite');
    }
  );

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
        currentUser={{ ...mockCurrentUser, role: 'admin', settingsAccess: false }}
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

describe('Header - Kurzbefehl installieren', () => {
  const originalPlatform = window.navigator.platform;
  const originalMaxTouchPoints = window.navigator.maxTouchPoints;
  let windowOpenSpy;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true });
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: originalPlatform, configurable: true });
    Object.defineProperty(window.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
    windowOpenSpy.mockRestore();
  });

  // Der Webimport-PIN ist seit dem 23.11.2026 abgeschafft (Tech-Check S7): kein Dialog mehr davor
  test('lädt den fertigen Kurzbefehl direkt, ohne Dialog davor', () => {
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    fireEvent.click(screen.getByText('Kurzbefehl installieren'));

    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/www\.icloud\.com\/shortcuts\//),
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // das Menü schließt sich dabei
    expect(screen.queryByText('Kurzbefehl installieren')).not.toBeInTheDocument();
  });

  test('zeigt den Eintrag nur auf Apple-Geräten', () => {
    Object.defineProperty(window.navigator, 'platform', { value: 'Win32', configurable: true });
    render(
      <Header
        currentView="recipes"
        currentUser={mockCurrentUser}
        onViewChange={() => {}}
        onLogout={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.queryByText('Kurzbefehl installieren')).not.toBeInTheDocument();
  });
});

describe('Header – Sprache dieser Sitzung (Vorhaben Mehrsprachigkeit)', () => {
  const mitSprachwahl = { ...mockCurrentUser, sprachwahl: true };
  const zeige = (nutzer, { profilSprache = null } = {}) => render(
    <SpracheProvider profilSprache={profilSprache} speicher={null}>
      <Header currentView="recipes" currentUser={nutzer} onViewChange={() => {}} onLogout={() => {}} />
    </SpracheProvider>
  );

  test('ohne die Berechtigung sprachwahl gibt es keinen Sprach-Chip', () => {
    zeige(mockCurrentUser);
    expect(screen.queryByRole('button', { name: /Sprache wählen/ })).not.toBeInTheDocument();
  });

  test('die Sprachwahl sitzt als Chip im Header, nicht mehr im Menü', () => {
    zeige(mitSprachwahl);
    expect(screen.getByRole('button', { name: 'Sprache wählen (aktuell: Deutsch)' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Menü öffnen'));
    expect(screen.queryByRole('group', { name: 'Sprache' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Français' })).not.toBeInTheDocument();
  });

  test('übersteuert die Sprache für die Sitzung, der Header spricht sofort die neue Sprache', () => {
    zeige(mitSprachwahl);
    fireEvent.click(screen.getByRole('button', { name: 'Sprache wählen (aktuell: Deutsch)' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Sprache' })).getByRole('button', { name: 'English' }));
    expect(screen.getByRole('button', { name: 'Choose language (current: English)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Open menu')).toBeInTheDocument();
  });

  test('solange die Auswahl offen ist, liegt der Header über FABs und Navigation', () => {
    const { container } = zeige(mitSprachwahl);
    const header = container.querySelector('header.header');
    expect(header).not.toHaveClass('header--menu-open');
    fireEvent.click(screen.getByRole('button', { name: /Sprache wählen/ }));
    expect(header).toHaveClass('header--menu-open');
  });
});

describe('Header – Slogan in der geltenden Sprache (Vorhaben Mehrsprachigkeit)', () => {
  const mitSprachwahl = { ...mockCurrentUser, sprachwahl: true };
  const zeige = ({ profilSprache = null } = {}) => render(
    <SpracheProvider profilSprache={profilSprache} speicher={null}>
      <Header currentView="recipes" currentUser={mitSprachwahl} onViewChange={() => {}} onLogout={() => {}} />
    </SpracheProvider>
  );
  const sloganText = (container) => container.querySelector('.tagline .handschrift-text__vorlesen')?.textContent;

  afterEach(() => {
    mockSlogan = 'Test Slogan';
    mockSloganUebersetzungen = null;
  });

  test('zeigt die gepflegte Übersetzung und setzt den Seitentitel mit', async () => {
    mockSlogan = 'Kochen mit Freunden';
    mockSloganUebersetzungen = { quelle: 'Kochen mit Freunden', en: 'Cooking with friends', fr: 'Cuisiner entre amis' };
    const { container } = zeige({ profilSprache: 'en' });
    await waitFor(() => expect(sloganText(container)).toBe('Cooking with friends'));
    expect(document.title).toBe('brouBook - Cooking with friends');
  });

  test('auf Deutsch das Original', async () => {
    mockSlogan = 'Kochen mit Freunden';
    mockSloganUebersetzungen = { quelle: 'Kochen mit Freunden', en: 'Cooking with friends' };
    const { container } = zeige();
    await waitFor(() => expect(sloganText(container)).toBe('Kochen mit Freunden'));
    expect(document.title).toBe('brouBook - Kochen mit Freunden');
  });

  test('eine veraltete Übersetzung zeigt das Original', async () => {
    mockSlogan = 'Kochen mit der Familie';
    mockSloganUebersetzungen = { quelle: 'Kochen mit Freunden', en: 'Cooking with friends' };
    const { container } = zeige({ profilSprache: 'en' });
    await waitFor(() => expect(sloganText(container)).toBe('Kochen mit der Familie'));
  });

  test('der Standard-Slogan erscheint ohne Pflege übersetzt und wechselt mit der Sprache', async () => {
    mockSlogan = 'Unsere besten Momente';
    const { container } = zeige();
    await waitFor(() => expect(sloganText(container)).toBe('Unsere besten Momente'));
    fireEvent.click(screen.getByRole('button', { name: /Sprache wählen/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Sprache' })).getByRole('button', { name: 'Français' }));
    expect(sloganText(container)).toBe('Nos meilleurs moments');
    expect(document.title).toBe('brouBook - Nos meilleurs moments');
  });
});
