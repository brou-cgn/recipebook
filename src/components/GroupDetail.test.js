import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroupDetail from './GroupDetail';

// Mock customLists utility so it resolves quickly in tests
jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ privateListBack: '←' }),
  DEFAULT_BUTTON_ICONS: { privateListBack: '←' },
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
