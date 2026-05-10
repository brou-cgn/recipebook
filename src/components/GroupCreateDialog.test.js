import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroupCreateDialog from './GroupCreateDialog';

// Mock groupFirestore so LIST_KIND_OPTIONS is available without Firebase
jest.mock('../utils/groupFirestore', () => ({
  LIST_KIND_OPTIONS: [
    { value: 'interactive', label: 'Interaktive Liste' },
    { value: 'classic', label: 'Klassische Sammlung' },
  ],
}));

const mockCurrentUser = { id: 'user1', vorname: 'Anna', nachname: 'Müller' };
const mockAllUsers = [
  { id: 'user1', vorname: 'Anna', nachname: 'Müller' },
  { id: 'user2', vorname: 'Ben', nachname: 'Schmidt' },
  { id: 'user3', vorname: 'Clara', nachname: 'Weber' },
];

const mockPrivateLists = [
  { id: 'list1', name: 'Familienrezepte', type: 'private', listKind: 'classic', memberIds: ['user1', 'user3'] },
  { id: 'list2', name: 'Freunde', type: 'private', listKind: 'classic', memberIds: ['user1', 'user2'] },
];

function renderDialog(props = {}) {
  const defaultProps = {
    allUsers: mockAllUsers,
    currentUser: mockCurrentUser,
    onSave: jest.fn(),
    onCancel: jest.fn(),
    privateLists: [],
  };
  return render(<GroupCreateDialog {...defaultProps} {...props} />);
}

describe('GroupCreateDialog', () => {
  describe('basic rendering', () => {
    it('renders the dialog with title', () => {
      renderDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Neue Liste erstellen')).toBeInTheDocument();
    });

    it('renders list name and kind fields', () => {
      renderDialog();
      expect(screen.getByLabelText('Listenname *')).toBeInTheDocument();
      expect(screen.getByLabelText('Art *')).toBeInTheDocument();
    });

    it('calls onCancel when close button is clicked', () => {
      const onCancel = jest.fn();
      renderDialog({ onCancel });
      fireEvent.click(screen.getByLabelText('Schließen'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onCancel when Abbrechen button is clicked', () => {
      const onCancel = jest.fn();
      renderDialog({ onCancel });
      fireEvent.click(screen.getByText('Abbrechen'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('shows member checkboxes for other users', () => {
      renderDialog();
      expect(screen.getByText('Ben Schmidt')).toBeInTheDocument();
      expect(screen.getByText('Clara Weber')).toBeInTheDocument();
      // Owner is not shown as a selectable member
      expect(screen.queryByText('Anna Müller')).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('shows error if name is empty on submit', async () => {
      renderDialog();
      fireEvent.click(screen.getByText('Liste erstellen'));
      await waitFor(() => {
        expect(screen.getByText('Bitte gib einen Listennamen ein.')).toBeInTheDocument();
      });
    });

    it('shows error if list kind is not selected on submit', async () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Meine Liste' } });
      fireEvent.click(screen.getByText('Liste erstellen'));
      await waitFor(() => {
        expect(screen.getByText('Bitte wähle eine Art der Liste aus.')).toBeInTheDocument();
      });
    });
  });

  describe('classic list creation', () => {
    it('calls onSave with correct data for a classic list', async () => {
      const onSave = jest.fn().mockResolvedValue();
      renderDialog({ onSave });

      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Testliste' } });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'classic' } });
      fireEvent.click(screen.getByText('Liste erstellen'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Testliste',
          memberIds: ['user1'],
          memberRoles: {},
          listKind: 'classic',
        });
      });
    });

    it('does not show target list section for classic list kind', () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'classic' } });
      expect(screen.queryByText(/Ziel-Liste/)).not.toBeInTheDocument();
    });
  });

  describe('interactive list – target list requirement', () => {
    it('shows target list section when interactive kind is selected', () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      expect(screen.getAllByText(/Ziel-Liste/).length).toBeGreaterThan(0);
      expect(screen.getByText('Bestehende Liste wählen')).toBeInTheDocument();
      expect(screen.getByText('Neue Liste anlegen')).toBeInTheDocument();
    });

    it('shows error when submitting interactive list without selecting target list mode', async () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Meine interaktive Liste' } });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Liste erstellen'));
      await waitFor(() => {
        expect(screen.getByText('Bitte wähle eine Ziel-Liste aus oder lege eine neue an.')).toBeInTheDocument();
      });
    });

    it('shows error when "create" mode selected but name is empty', async () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Meine interaktive Liste' } });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Neue Liste anlegen'));
      fireEvent.click(screen.getByText('Liste erstellen'));
      await waitFor(() => {
        expect(screen.getByText('Bitte gib einen Namen für die neue Ziel-Liste ein.')).toBeInTheDocument();
      });
    });

    it('shows error when "select" mode selected but no list chosen', async () => {
      renderDialog({ privateLists: mockPrivateLists });
      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Meine interaktive Liste' } });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Bestehende Liste wählen'));
      fireEvent.click(screen.getByText('Liste erstellen'));
      await waitFor(() => {
        expect(screen.getByText('Bitte wähle eine bestehende Liste als Ziel aus.')).toBeInTheDocument();
      });
    });
  });

  describe('interactive list – create new target list', () => {
    it('shows text input when "Neue Liste anlegen" is selected', () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Neue Liste anlegen'));
      expect(screen.getByLabelText('Name der neuen Ziel-Liste')).toBeInTheDocument();
    });

    it('calls onSave with newTargetListName when creating a new target list', async () => {
      const onSave = jest.fn().mockResolvedValue();
      renderDialog({ onSave });

      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Meine interaktive Liste' } });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Neue Liste anlegen'));
      fireEvent.change(screen.getByLabelText('Name der neuen Ziel-Liste'), {
        target: { value: 'Neue Zielliste' },
      });
      fireEvent.click(screen.getByText('Liste erstellen'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Meine interaktive Liste',
          memberIds: ['user1'],
          memberRoles: {},
          listKind: 'interactive',
          newTargetListName: 'Neue Zielliste',
        });
      });
    });
  });

  describe('interactive list – select existing target list', () => {
    it('shows dropdown of private lists when "Bestehende Liste wählen" is selected', () => {
      renderDialog({ privateLists: mockPrivateLists });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Bestehende Liste wählen'));
      expect(screen.getByLabelText('Bestehende Liste auswählen')).toBeInTheDocument();
      expect(screen.getByText('Familienrezepte')).toBeInTheDocument();
      expect(screen.getByText('Freunde')).toBeInTheDocument();
    });

    it('calls onSave with targetListId when an existing list is selected', async () => {
      const onSave = jest.fn().mockResolvedValue();
      renderDialog({ onSave, privateLists: mockPrivateLists });

      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Meine interaktive Liste' } });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Bestehende Liste wählen'));
      fireEvent.change(screen.getByLabelText('Bestehende Liste auswählen'), {
        target: { value: 'list1' },
      });
      fireEvent.click(screen.getByText('Liste erstellen'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Meine interaktive Liste',
          memberIds: ['user1', 'user3'], // members from list1 (user1 is owner, user3 is other member)
          memberRoles: {},
          listKind: 'interactive',
          targetListId: 'list1',
        });
      });
    });

    it('syncs member checkboxes from selected existing list', async () => {
      renderDialog({ privateLists: mockPrivateLists });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Bestehende Liste wählen'));
      fireEvent.change(screen.getByLabelText('Bestehende Liste auswählen'), {
        target: { value: 'list1' },
      });

      // list1 has memberIds: ['user1', 'user3'] - Clara Weber should be checked
      await waitFor(() => {
        const claraCheckbox = screen.getByRole('checkbox', { name: /Clara Weber/ });
        expect(claraCheckbox).toBeChecked();
        const benCheckbox = screen.getByRole('checkbox', { name: /Ben Schmidt/ });
        expect(benCheckbox).not.toBeChecked();
      });
    });

    it('disables member checkboxes when members are synced from a selected list', async () => {
      renderDialog({ privateLists: mockPrivateLists });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      fireEvent.click(screen.getByText('Bestehende Liste wählen'));
      fireEvent.change(screen.getByLabelText('Bestehende Liste auswählen'), {
        target: { value: 'list1' },
      });

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        checkboxes.forEach((cb) => {
          expect(cb).toBeDisabled();
        });
      });
    });
  });

  describe('target list section resets', () => {
    it('hides target list section when switching from interactive to classic', () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      expect(screen.getAllByText(/Ziel-Liste/).length).toBeGreaterThan(0);

      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'classic' } });
      expect(screen.queryByText(/Ziel-Liste/)).not.toBeInTheDocument();
    });
  });
});
