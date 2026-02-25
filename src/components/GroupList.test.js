import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GroupList from './GroupList';

const mockCurrentUser = { id: 'user1', vorname: 'Anna', nachname: 'Müller', isAdmin: false };
const mockAdminUser = { id: 'admin1', vorname: 'Admin', nachname: 'User', isAdmin: true };
const mockAllUsers = [
  { id: 'user1', vorname: 'Anna', nachname: 'Müller' },
  { id: 'user2', vorname: 'Ben', nachname: 'Schmidt' }
];
const mockPublicGroup = {
  id: 'pub1',
  type: 'public',
  name: 'Öffentlich',
  ownerId: null,
  memberIds: []
};
const mockPrivateGroup = {
  id: 'grp1',
  type: 'private',
  name: 'Familie',
  ownerId: 'user1',
  memberIds: ['user1', 'user2']
};

describe('GroupList', () => {
  it('renders the heading', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.getByText('Meine Listen')).toBeInTheDocument();
  });

  it('shows empty state when there are no private groups', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.getByText('Noch keine privaten Listen!')).toBeInTheDocument();
  });

  it('renders private group cards', () => {
    render(
      <GroupList
        groups={[mockPrivateGroup]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.getByText('Familie')).toBeInTheDocument();
    expect(screen.getByText('2 Mitglied(er)')).toBeInTheDocument();
  });

  it('renders the public group in the Systemgruppen section for admin users', () => {
    render(
      <GroupList
        groups={[mockPublicGroup]}
        allUsers={mockAllUsers}
        currentUser={mockAdminUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.getByText('Systemgruppen')).toBeInTheDocument();
    // The group name appears as a heading in the card
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.some((h) => h.textContent === 'Öffentlich')).toBe(true);
  });

  it('hides the public group from non-admin users', () => {
    render(
      <GroupList
        groups={[mockPublicGroup]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.queryByText('Systemgruppen')).not.toBeInTheDocument();
    expect(screen.queryByText('Öffentlich')).not.toBeInTheDocument();
  });

  it('calls onSelectGroup when a group card is clicked', () => {
    const onSelectGroup = jest.fn();
    render(
      <GroupList
        groups={[mockPrivateGroup]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={onSelectGroup}
        onCreateGroup={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('Familie'));
    expect(onSelectGroup).toHaveBeenCalledWith(mockPrivateGroup);
  });

  it('opens the create dialog when the button is clicked', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('+ Liste erstellen'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
