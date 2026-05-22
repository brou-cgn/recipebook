import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GroupDetail from './GroupDetail';

jest.mock('./RecipeRating', () => () => <div data-testid="mock-rating" />);
jest.mock('./RecipeImageCarousel', () => () => <div data-testid="mock-carousel" />);

// Mock customLists utility so it resolves quickly in tests
jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ privateListBack: '←', editRecipe: '✎', deleteRecipe: '🗑', addGroupMember: '👤+' }),
  DEFAULT_BUTTON_ICONS: { privateListBack: '←', editRecipe: '✎', deleteRecipe: '🗑', addGroupMember: '👤+' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

// Mock groupFirestore so LIST_KIND_OPTIONS is available without Firebase
jest.mock('../utils/groupFirestore', () => ({
  sendGroupInvitation: jest.fn().mockResolvedValue({ alreadyRegistered: false, alreadyInvited: false }),
  LIST_KIND_OPTIONS: [
    { value: 'interactive', label: 'Interaktive Liste' },
    { value: 'classic', label: 'Klassische Sammlung' },
  ],
}));

// Mock imageUtils
jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn().mockReturnValue(false),
}));

const mockOwner = { id: 'owner1', vorname: 'Anna', nachname: 'Müller' };
const mockMember = { id: 'member1', vorname: 'Ben', nachname: 'Schmidt' };
const mockNonMember = { id: 'nonmember1', vorname: 'Clara', nachname: 'Weber' };
const mockAllUsers = [mockOwner, mockMember, mockNonMember];

const mockPrivateGroup = {
  id: 'grp1',
  type: 'private',
  name: 'Familie',
  ownerId: 'owner1',
  memberIds: ['owner1', 'member1'],
  memberRoles: {},
};

const mockPublicGroup = {
  id: 'pub1',
  type: 'public',
  name: 'Öffentlich',
  ownerId: null,
  memberIds: ['owner1'],
};

const defaultProps = {
  group: mockPrivateGroup,
  allUsers: mockAllUsers,
  currentUser: mockOwner,
  onBack: jest.fn(),
  onUpdateGroup: jest.fn().mockResolvedValue(undefined),
  onDeleteGroup: jest.fn().mockResolvedValue(undefined),
};

const mockRecipes = [
  {
    id: 'r1',
    title: 'Kartoffelsuppe',
    portionen: 2,
    ingredients: ['2 Kartoffeln'],
  },
];

/** Helper: switch to the Einstellungen tab */
const goToEinstellungen = () => {
  fireEvent.click(screen.getByRole('tab', { name: /Einstellungen/i }));
};

describe('GroupDetail – tab bar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Rezepte and Einstellungen tabs for a private group', () => {
    render(<GroupDetail {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /Rezepte/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Einstellungen/i })).toBeInTheDocument();
  });

  it('does NOT render tabs for a public group', () => {
    render(<GroupDetail {...defaultProps} group={mockPublicGroup} />);
    expect(screen.queryByRole('tab', { name: /Rezepte/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Einstellungen/i })).not.toBeInTheDocument();
  });

  it('shows the recipe section by default (Rezepte tab active)', () => {
    render(<GroupDetail {...defaultProps} />);
    expect(screen.getByRole('tab', { name: /Rezepte/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Rezepte \(/i)).toBeInTheDocument();
  });

  it('shows settings content after switching to Einstellungen tab', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    expect(screen.getByRole('tab', { name: /Einstellungen/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Listeneinstellungen')).toBeInTheDocument();
  });

  it('shows "Typ: Privat" in Einstellungen tab', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    expect(screen.getByText('Privat')).toBeInTheDocument();
  });

  it('shows listKind label in Einstellungen tab when set', () => {
    const groupWithKind = { ...mockPrivateGroup, listKind: 'classic' };
    render(<GroupDetail {...defaultProps} group={groupWithKind} />);
    goToEinstellungen();
    expect(screen.getByText('Klassische Sammlung')).toBeInTheDocument();
  });

  it('does NOT show the private type badge in the header', () => {
    const { container } = render(<GroupDetail {...defaultProps} />);
    const badges = container.querySelectorAll('.group-type-badge.private');
    expect(badges).toHaveLength(0);
  });

  it('shows the public type badge in the header for public groups', () => {
    const { container } = render(<GroupDetail {...defaultProps} group={mockPublicGroup} />);
    const badge = container.querySelector('.group-type-badge.public');
    expect(badge).toBeInTheDocument();
  });
});

describe('GroupDetail – add member feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the "Mitglied hinzufügen" button for the owner of a private group (in Einstellungen tab)', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    expect(screen.getByRole('button', { name: /Mitglied hinzufügen/i })).toBeInTheDocument();
  });

  it('does NOT show "Mitglied hinzufügen" button for a non-owner member', () => {
    render(<GroupDetail {...defaultProps} currentUser={mockMember} />);
    goToEinstellungen();
    expect(screen.queryByRole('button', { name: /Mitglied hinzufügen/i })).not.toBeInTheDocument();
  });

  it('does NOT show the "Mitglied hinzufügen" button for a public group', () => {
    render(<GroupDetail {...defaultProps} group={mockPublicGroup} />);
    expect(screen.queryByRole('button', { name: /Mitglied hinzufügen/i })).not.toBeInTheDocument();
  });

  it('toggles the add-member panel open and closed', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    const btn = screen.getByRole('button', { name: /Mitglied hinzufügen/i });

    // Panel not visible initially
    expect(screen.queryByLabelText('Einladung per E-Mail')).not.toBeInTheDocument();

    // Open panel
    fireEvent.click(btn);
    expect(screen.getByLabelText('Einladung per E-Mail')).toBeInTheDocument();

    // Close via "Abbrechen"
    fireEvent.click(screen.getByRole('button', { name: /Abbrechen/i }));
    expect(screen.queryByLabelText('Einladung per E-Mail')).not.toBeInTheDocument();
  });

  it('lists only non-members as selectable users', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    // Clara Weber is not a member → should appear
    expect(screen.getByText('Clara Weber')).toBeInTheDocument();

    // Anna Müller (owner/currentUser) and Ben Schmidt (already a member) should NOT appear in the list
    const checkboxLabels = screen.getAllByRole('checkbox').map((cb) => cb.closest('label')?.textContent?.trim());
    expect(checkboxLabels.some((t) => t?.includes('Clara Weber'))).toBe(true);
    expect(checkboxLabels.some((t) => t?.includes('Anna'))).toBe(false);
    expect(checkboxLabels.some((t) => t?.includes('Ben'))).toBe(false);
  });

  it('shows validation error when submitting with no selection and no email', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/mindestens ein Mitglied/i);
  });

  it('shows validation error for an invalid email address', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));
    fireEvent.change(screen.getByLabelText('Einladung per E-Mail'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/gültige E-Mail/i);
  });

  it('calls onUpdateGroup with new member IDs when an existing user is selected', async () => {
    const onUpdateGroup = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} onUpdateGroup={onUpdateGroup} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    // Check Clara Weber checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));

    await waitFor(() => {
      expect(onUpdateGroup).toHaveBeenCalledWith('grp1', expect.objectContaining({
        memberIds: expect.arrayContaining(['owner1', 'member1', 'nonmember1']),
      }));
    });
  });

  it('calls onUpdateGroup with invitedEmails when an email is entered', async () => {
    const onUpdateGroup = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} onUpdateGroup={onUpdateGroup} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    fireEvent.change(screen.getByLabelText('Einladung per E-Mail'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));

    await waitFor(() => {
      expect(onUpdateGroup).toHaveBeenCalledWith('grp1', expect.objectContaining({
        invitedEmails: expect.arrayContaining(['new@example.com']),
      }));
    });
  });

  it('normalizes invited email to lowercase before storing', async () => {
    const onUpdateGroup = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} onUpdateGroup={onUpdateGroup} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    fireEvent.change(screen.getByLabelText('Einladung per E-Mail'), { target: { value: 'New@Example.COM' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));

    await waitFor(() => {
      expect(onUpdateGroup).toHaveBeenCalledWith('grp1', expect.objectContaining({
        invitedEmails: expect.arrayContaining(['new@example.com']),
      }));
    });
  });

  it('shows success message and closes the panel after adding a member', async () => {
    const onUpdateGroup = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} onUpdateGroup={onUpdateGroup} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/erfolgreich hinzugefügt/i);
    });

    // Panel should be closed
    expect(screen.queryByLabelText('Einladung per E-Mail')).not.toBeInTheDocument();
  });

  it('shows error message when onUpdateGroup throws', async () => {
    const onUpdateGroup = jest.fn().mockRejectedValue(new Error('Server error'));
    render(<GroupDetail {...defaultProps} onUpdateGroup={onUpdateGroup} />);
    goToEinstellungen();
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Fehler beim Hinzufügen/i);
    });
  });
});

describe('GroupDetail – leave group feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "Austreten" button for a non-owner member at their own row', () => {
    render(<GroupDetail {...defaultProps} currentUser={mockMember} />);
    goToEinstellungen();
    expect(screen.getByRole('button', { name: /Liste verlassen/i })).toBeInTheDocument();
  });

  it('does NOT show "Austreten" button for the owner', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    expect(screen.queryByRole('button', { name: /Liste verlassen/i })).not.toBeInTheDocument();
  });

  it('does NOT show "Austreten" button for a public group', () => {
    render(<GroupDetail {...defaultProps} group={mockPublicGroup} currentUser={{ id: 'owner1', vorname: 'Anna', nachname: 'Müller' }} />);
    expect(screen.queryByRole('button', { name: /Liste verlassen/i })).not.toBeInTheDocument();
  });

  it('calls onUpdateGroup and onBack after confirming leave', async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    const onUpdateGroup = jest.fn().mockResolvedValue(undefined);
    const onBack = jest.fn();
    render(<GroupDetail {...defaultProps} currentUser={mockMember} onUpdateGroup={onUpdateGroup} onBack={onBack} />);
    goToEinstellungen();

    fireEvent.click(screen.getByRole('button', { name: /Liste verlassen/i }));

    await waitFor(() => {
      expect(onUpdateGroup).toHaveBeenCalledWith('grp1', expect.objectContaining({
        memberIds: expect.not.arrayContaining(['member1']),
      }));
      expect(onBack).toHaveBeenCalled();
    });
  });

  it('does NOT call onUpdateGroup when leave is cancelled via confirm', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    const onUpdateGroup = jest.fn();
    render(<GroupDetail {...defaultProps} currentUser={mockMember} onUpdateGroup={onUpdateGroup} />);
    goToEinstellungen();

    fireEvent.click(screen.getByRole('button', { name: /Liste verlassen/i }));

    expect(onUpdateGroup).not.toHaveBeenCalled();
  });
});

describe('GroupDetail – shopping list flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the portion selector before showing the shopping list', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));

    expect(screen.getByText('Portionen für Einkaufsliste')).toBeInTheDocument();
    expect(screen.queryByLabelText('Einkaufsliste')).not.toBeInTheDocument();
  });

  it('applies adjusted portions before generating the shopping list', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    fireEvent.click(screen.getByLabelText('Portionen verringern'));
    fireEvent.click(screen.getByLabelText('Portionen verringern'));
    fireEvent.click(screen.getByText('Einkaufsliste erstellen'));

    expect(screen.getByLabelText('Einkaufsliste')).toBeInTheDocument();
    expect(screen.getByText('Keine Zutaten vorhanden.')).toBeInTheDocument();
  });

  it('scales ingredients when portions are reduced but remain above zero', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    fireEvent.click(screen.getByLabelText('Portionen verringern'));
    fireEvent.click(screen.getByText('Einkaufsliste erstellen'));

    expect(screen.getByText('1 Kartoffeln')).toBeInTheDocument();
  });
});

describe('GroupDetail – recipe tile layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders recipe overview cards instead of the legacy private-list tile wrapper', () => {
    const { container } = render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);

    expect(container.querySelector('.recipe-card')).toBeInTheDocument();
    expect(container.querySelector('.group-recipe-card')).not.toBeInTheDocument();
  });
});

describe('GroupDetail – edit list properties feature', () => {
  const mockPrivateGroupWithKind = {
    ...mockPrivateGroup,
    listKind: 'classic',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "Liste bearbeiten" button for the owner of a private group (in Einstellungen tab)', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    expect(screen.getAllByRole('button', { name: /Liste bearbeiten/i })).toHaveLength(2);
  });

  it('does NOT show "Liste bearbeiten" button for a non-owner member', () => {
    render(<GroupDetail {...defaultProps} currentUser={mockMember} />);
    goToEinstellungen();
    expect(screen.queryByRole('button', { name: /Liste bearbeiten/i })).not.toBeInTheDocument();
  });

  it('does NOT show "Liste bearbeiten" button for a public group', () => {
    render(<GroupDetail {...defaultProps} group={mockPublicGroup} />);
    expect(screen.queryByRole('button', { name: /Liste bearbeiten/i })).not.toBeInTheDocument();
  });

  it('opens the edit dialog when "Liste bearbeiten" is clicked', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    expect(screen.getByRole('dialog', { name: /Liste bearbeiten/i })).toBeInTheDocument();
  });

  it('pre-populates the edit dialog with the current group name', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    expect(screen.getByLabelText('Listenname *')).toHaveValue('Familie');
  });

  it('closes the edit dialog when Abbrechen is clicked', () => {
    render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    expect(screen.getByRole('dialog', { name: /Liste bearbeiten/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Abbrechen'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onEditGroupProperties with updated data when saved', async () => {
    const onEditGroupProperties = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} group={mockPrivateGroupWithKind} onEditGroupProperties={onEditGroupProperties} />);
    goToEinstellungen();

    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Neue Familie' } });
    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(onEditGroupProperties).toHaveBeenCalledWith('grp1', expect.objectContaining({
        name: 'Neue Familie',
        listKind: 'classic',
      }));
    });
  });

  it('closes the edit dialog after successful save', async () => {
    const onEditGroupProperties = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} group={mockPrivateGroupWithKind} onEditGroupProperties={onEditGroupProperties} />);
    goToEinstellungen();

    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders the mobile edit FAB with the edit icon (in Einstellungen tab)', () => {
    const { container } = render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    const editFabButton = container.querySelector('.group-edit-fab-button');
    expect(editFabButton).toBeInTheDocument();
    expect(editFabButton).toHaveTextContent('✎');
  });

  it('renders the delete FAB with recipe delete FAB class and icon for private owner (in Einstellungen tab)', () => {
    const { container } = render(<GroupDetail {...defaultProps} />);
    goToEinstellungen();
    const deleteFabButton = container.querySelector('.delete-fab-button');
    expect(deleteFabButton).toBeInTheDocument();
    expect(deleteFabButton).toHaveTextContent('🗑');
    expect(deleteFabButton).toHaveAttribute('aria-label', 'Liste löschen');
  });

  it('does NOT render edit/delete FABs in the Rezepte tab', () => {
    const { container } = render(<GroupDetail {...defaultProps} />);
    // Default tab is Rezepte
    expect(container.querySelector('.group-edit-fab-button')).not.toBeInTheDocument();
    expect(container.querySelector('.delete-fab-button')).not.toBeInTheDocument();
  });
});

describe('GroupDetail – FAB visibility when modals are open', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides the edit and delete FABs when the portion selector is open', () => {
    const { container } = render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);
    goToEinstellungen();

    expect(container.querySelector('.group-edit-fab-button')).toBeInTheDocument();
    expect(container.querySelector('.delete-fab-button')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));

    expect(screen.getByText('Portionen für Einkaufsliste')).toBeInTheDocument();
    expect(container.querySelector('.group-edit-fab-button')).not.toBeInTheDocument();
    expect(container.querySelector('.delete-fab-button')).not.toBeInTheDocument();
  });

  it('hides the edit and delete FABs when the shopping list modal is open', () => {
    const { container } = render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);
    goToEinstellungen();

    expect(container.querySelector('.group-edit-fab-button')).toBeInTheDocument();
    expect(container.querySelector('.delete-fab-button')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    fireEvent.click(screen.getByText('Einkaufsliste erstellen'));

    expect(screen.getByLabelText('Einkaufsliste')).toBeInTheDocument();
    expect(container.querySelector('.group-edit-fab-button')).not.toBeInTheDocument();
    expect(container.querySelector('.delete-fab-button')).not.toBeInTheDocument();
  });

  it('shows the FABs again after the portion selector is closed', () => {
    const { container } = render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);
    goToEinstellungen();

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    expect(container.querySelector('.group-edit-fab-button')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Portionsauswahl schließen'));

    expect(container.querySelector('.group-edit-fab-button')).toBeInTheDocument();
    expect(container.querySelector('.delete-fab-button')).toBeInTheDocument();
  });

  it('hides the add-recipe FAB when the portion selector is open', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} onAddRecipe={jest.fn()} />);
    // Default tab is Rezepte, so add-recipe FAB is visible
    expect(screen.getByLabelText('Privates Rezept hinzufügen')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));

    expect(screen.getByText('Portionen für Einkaufsliste')).toBeInTheDocument();
    expect(screen.queryByLabelText('Privates Rezept hinzufügen')).not.toBeInTheDocument();
  });

  it('hides the add-recipe FAB when the shopping list modal is open', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} onAddRecipe={jest.fn()} />);

    expect(screen.getByLabelText('Privates Rezept hinzufügen')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    fireEvent.click(screen.getByText('Einkaufsliste erstellen'));

    expect(screen.getByLabelText('Einkaufsliste')).toBeInTheDocument();
    expect(screen.queryByLabelText('Privates Rezept hinzufügen')).not.toBeInTheDocument();
  });

  it('shows the add-recipe FAB again after the portion selector is closed', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} onAddRecipe={jest.fn()} />);

    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    expect(screen.queryByLabelText('Privates Rezept hinzufügen')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Portionsauswahl schließen'));

    expect(screen.getByLabelText('Privates Rezept hinzufügen')).toBeInTheDocument();
  });

  it('does NOT show the add-recipe FAB in the Einstellungen tab', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} onAddRecipe={jest.fn()} />);
    goToEinstellungen();
    expect(screen.queryByLabelText('Privates Rezept hinzufügen')).not.toBeInTheDocument();
  });
});

describe('GroupDetail – longpress on minus button in portion selector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('short press (< 500 ms) decrements count by 1', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);
    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    // default portionen is 2
    expect(screen.getByText('2')).toBeInTheDocument();

    const decrementBtn = screen.getByLabelText('Portionen verringern');
    fireEvent.mouseDown(decrementBtn);
    act(() => { jest.advanceTimersByTime(100); });
    fireEvent.mouseUp(decrementBtn);
    fireEvent.click(decrementBtn);

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('long press (>= 500 ms) resets count to 0', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);
    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    expect(screen.getByText('2')).toBeInTheDocument();

    const decrementBtn = screen.getByLabelText('Portionen verringern');
    fireEvent.mouseDown(decrementBtn);
    act(() => { jest.advanceTimersByTime(600); });
    fireEvent.mouseUp(decrementBtn);
    fireEvent.click(decrementBtn);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('touch long press resets count to 0', () => {
    render(<GroupDetail {...defaultProps} recipes={mockRecipes} />);
    fireEvent.click(screen.getByLabelText('Einkaufsliste öffnen'));
    expect(screen.getByText('2')).toBeInTheDocument();

    const decrementBtn = screen.getByLabelText('Portionen verringern');
    fireEvent.touchStart(decrementBtn);
    act(() => { jest.advanceTimersByTime(600); });
    fireEvent.touchEnd(decrementBtn);

    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
