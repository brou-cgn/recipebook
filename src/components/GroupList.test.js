import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GroupList from './GroupList';

// Mock customLists so icon loading resolves immediately
jest.mock('../utils/customLists', () => ({
  getButtonIcons: () => Promise.resolve({ closeButtonDefaultImg: '✕', addRecipe: '+' }),
  DEFAULT_BUTTON_ICONS: { closeButtonDefaultImg: '✕', addRecipe: '+' },
  getEffectiveIcon: (icons, key) => icons[key] ?? '',
  getDarkModePreference: () => false,
}));

// Mock imageUtils
jest.mock('../utils/imageUtils', () => ({
  isBase64Image: jest.fn().mockReturnValue(false),
}));

const mockCurrentUser = { id: 'user1', vorname: 'Anna', nachname: 'Müller' };
const mockAdminUser = { id: 'admin1', vorname: 'Admin', nachname: 'User', role: 'admin' };
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
  description: 'Familienrezepte und Wochenplanung',
  ownerId: 'user1',
  memberIds: ['user1', 'user2']
};

describe('GroupList', () => {
  it('renders the heading "Meine Mise en Place"', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.getByText('Meine Mise en Place')).toBeInTheDocument();
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
    expect(screen.getByText('Familienrezepte und Wochenplanung')).toBeInTheDocument();
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

  it('zeigt den Zurück-Link „Chefkoch & mehr“, wenn onBack da ist', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
        onBack={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Chefkoch & mehr' })).toBeInTheDocument();
  });

  it('Zurück-Link ruft onBack', () => {
    const onBack = jest.fn();
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chefkoch & mehr' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('nimmt dem Zurück-Link beim Öffnen den Fokus (iPhone)', () => {
    const blurSpy = jest.spyOn(HTMLButtonElement.prototype, 'blur');
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
        onBack={jest.fn()}
      />
    );
    const closeButton = screen.getByRole('button', { name: 'Chefkoch & mehr' }); // Zurück-Link
    expect(blurSpy).toHaveBeenCalledTimes(1);
    expect(blurSpy.mock.instances[0]).toBe(closeButton);
    blurSpy.mockRestore();
  });

  it('zeigt keinen Zurück-Link ohne onBack', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Chefkoch & mehr' })).not.toBeInTheDocument();
  });

  it('Variante A: Zurück-Link und Titel im Kopf, „+ Liste erstellen“ rechts daneben', () => {
    const { container } = render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
        onBack={jest.fn()}
      />
    );
    const kopf = container.querySelector('.unterseite-kopf');
    expect(kopf).toBeInTheDocument();
    expect(within(kopf).getByRole('button', { name: 'Chefkoch & mehr' })).toBeInTheDocument();
    expect(within(kopf).getByRole('heading', { name: 'Meine Mise en Place' })).toBeInTheDocument();
    expect(kopf.querySelector('.group-list-actions')).toHaveTextContent('+ Liste erstellen');
    expect(container.querySelector('.app-close-button')).not.toBeInTheDocument();
  });

  it('heißt der Zurück-Link „Küche“, wenn die Seite von der Startseite kam', () => {
    render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
        onBack={jest.fn()}
        ausStartseite
      />
    );
    expect(screen.getByRole('button', { name: 'Küche' })).toBeInTheDocument();
  });

  it('der Listenname ist ein echter Knopf', () => {
    const onSelectGroup = jest.fn();
    render(
      <GroupList
        groups={[{ id: 'g1', name: 'Familie', type: 'private', ownerId: 'user-1', memberIds: ['user-1'] }]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={onSelectGroup}
        onCreateGroup={jest.fn()}
      />
    );
    const knopf = screen.getByRole('button', { name: 'Familie' });
    fireEvent.click(knopf);
    expect(onSelectGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }));
  });

  it('renders the FAB button with aria-label "Liste erstellen"', () => {
    const { container } = render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    expect(container.querySelector('.add-group-fab-button')).toBeInTheDocument();
    expect(container.querySelector('.add-group-fab-button')).toHaveAttribute('aria-label', 'Liste erstellen');
  });

  it('opens the create dialog when the FAB button is clicked', () => {
    const { container } = render(
      <GroupList
        groups={[]}
        allUsers={mockAllUsers}
        currentUser={mockCurrentUser}
        onSelectGroup={jest.fn()}
        onCreateGroup={jest.fn()}
      />
    );
    fireEvent.click(container.querySelector('.add-group-fab-button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
