import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import GroupDetail from './GroupDetail';

// Mock customLists utility so it resolves quickly in tests
jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ privateListBack: '←', editRecipe: '✎', deleteRecipe: '🗑' }),
  DEFAULT_BUTTON_ICONS: { privateListBack: '←', editRecipe: '✎', deleteRecipe: '🗑' },
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

describe('GroupDetail – add member feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the "+ Mitglied hinzufügen" button for the owner of a private group', () => {
    render(<GroupDetail {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Mitglied hinzufügen/i })).toBeInTheDocument();
  });

  it('shows the "+ Mitglied hinzufügen" button for a member (non-owner) of a private group', () => {
    render(<GroupDetail {...defaultProps} currentUser={mockMember} />);
    expect(screen.getByRole('button', { name: /Mitglied hinzufügen/i })).toBeInTheDocument();
  });

  it('does NOT show the "+ Mitglied hinzufügen" button for a public group', () => {
    render(<GroupDetail {...defaultProps} group={mockPublicGroup} />);
    expect(screen.queryByRole('button', { name: /Mitglied hinzufügen/i })).not.toBeInTheDocument();
  });

  it('toggles the add-member panel open and closed', () => {
    render(<GroupDetail {...defaultProps} />);
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
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/mindestens ein Mitglied/i);
  });

  it('shows validation error for an invalid email address', () => {
    render(<GroupDetail {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));
    fireEvent.change(screen.getByLabelText('Einladung per E-Mail'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/gültige E-Mail/i);
  });

  it('calls onUpdateGroup with new member IDs when an existing user is selected', async () => {
    const onUpdateGroup = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} onUpdateGroup={onUpdateGroup} />);
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
    fireEvent.click(screen.getByRole('button', { name: /Mitglied hinzufügen/i }));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /^Hinzufügen$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Fehler beim Hinzufügen/i);
    });
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

describe('GroupDetail – edit list properties feature', () => {
  const mockPrivateGroupWithKind = {
    ...mockPrivateGroup,
    listKind: 'classic',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "Liste bearbeiten" button for the owner of a private group', () => {
    render(<GroupDetail {...defaultProps} />);
    expect(screen.getAllByRole('button', { name: /Liste bearbeiten/i })).toHaveLength(2);
  });

  it('does NOT show "Liste bearbeiten" button for a non-owner member', () => {
    render(<GroupDetail {...defaultProps} currentUser={mockMember} />);
    expect(screen.queryByRole('button', { name: /Liste bearbeiten/i })).not.toBeInTheDocument();
  });

  it('does NOT show "Liste bearbeiten" button for a public group', () => {
    render(<GroupDetail {...defaultProps} group={mockPublicGroup} />);
    expect(screen.queryByRole('button', { name: /Liste bearbeiten/i })).not.toBeInTheDocument();
  });

  it('opens the edit dialog when "Liste bearbeiten" is clicked', () => {
    render(<GroupDetail {...defaultProps} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    expect(screen.getByRole('dialog', { name: /Liste bearbeiten/i })).toBeInTheDocument();
  });

  it('pre-populates the edit dialog with the current group name', () => {
    render(<GroupDetail {...defaultProps} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    expect(screen.getByLabelText('Listenname *')).toHaveValue('Familie');
  });

  it('closes the edit dialog when Abbrechen is clicked', () => {
    render(<GroupDetail {...defaultProps} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    expect(screen.getByRole('dialog', { name: /Liste bearbeiten/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Abbrechen'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onEditGroupProperties with updated data when saved', async () => {
    const onEditGroupProperties = jest.fn().mockResolvedValue(undefined);
    render(<GroupDetail {...defaultProps} group={mockPrivateGroupWithKind} onEditGroupProperties={onEditGroupProperties} />);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Liste bearbeiten/i })[0]);
    fireEvent.click(screen.getByText('Speichern'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders the mobile edit FAB with the edit icon', () => {
    const { container } = render(<GroupDetail {...defaultProps} />);
    const editFabButton = container.querySelector('.group-edit-fab-button');
    expect(editFabButton).toBeInTheDocument();
    expect(editFabButton).toHaveTextContent('✎');
  });

  it('renders the delete FAB with recipe delete FAB class and icon for private owner lists', () => {
    const { container } = render(<GroupDetail {...defaultProps} />);
    const deleteFabButton = container.querySelector('.delete-fab-button');
    expect(deleteFabButton).toBeInTheDocument();
    expect(deleteFabButton).toHaveTextContent('🗑');
    expect(deleteFabButton).toHaveAttribute('aria-label', 'Liste löschen');
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
