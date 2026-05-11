import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroupEditDialog from './GroupEditDialog';

// Mock groupFirestore so LIST_KIND_OPTIONS is available without Firebase
jest.mock('../utils/groupFirestore', () => ({
  LIST_KIND_OPTIONS: [
    { value: 'interactive', label: 'Interaktive Liste' },
    { value: 'classic', label: 'Klassische Sammlung' },
  ],
}));

const mockClassicGroup = {
  id: 'grp1',
  name: 'Familie',
  type: 'private',
  listKind: 'classic',
  ownerId: 'user1',
  memberIds: ['user1'],
};

const mockInteractiveGroup = {
  id: 'grp2',
  name: 'Interaktiv',
  type: 'private',
  listKind: 'interactive',
  targetListId: 'list1',
  ownerId: 'user1',
  memberIds: ['user1'],
};

const mockPrivateLists = [
  { id: 'list1', name: 'Familienrezepte', type: 'private', listKind: 'classic', memberIds: ['user1'] },
  { id: 'list2', name: 'Freunde', type: 'private', listKind: 'classic', memberIds: ['user1'] },
];

function renderDialog(props = {}) {
  const defaultProps = {
    group: mockClassicGroup,
    onSave: jest.fn(),
    onCancel: jest.fn(),
    privateLists: [],
  };
  return render(<GroupEditDialog {...defaultProps} {...props} />);
}

describe('GroupEditDialog', () => {
  describe('basic rendering', () => {
    it('renders the dialog with "Liste bearbeiten" title', () => {
      renderDialog();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Liste bearbeiten')).toBeInTheDocument();
    });

    it('renders list name and kind fields', () => {
      renderDialog();
      expect(screen.getByLabelText('Listenname *')).toBeInTheDocument();
      expect(screen.getByLabelText('Art *')).toBeInTheDocument();
    });

    it('pre-populates the name field with the group name', () => {
      renderDialog();
      expect(screen.getByLabelText('Listenname *')).toHaveValue('Familie');
    });

    it('pre-populates the list kind with the group listKind', () => {
      renderDialog({ group: mockClassicGroup });
      expect(screen.getByLabelText('Art *')).toHaveValue('classic');
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
  });

  describe('validation', () => {
    it('shows error if name is empty on submit', async () => {
      renderDialog();
      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: '' } });
      fireEvent.click(screen.getByText('Speichern'));
      await waitFor(() => {
        expect(screen.getByText('Bitte gib einen Listennamen ein.')).toBeInTheDocument();
      });
    });

    it('shows error if list kind is not selected on submit', async () => {
      renderDialog({ group: { ...mockClassicGroup, listKind: '' } });
      fireEvent.click(screen.getByText('Speichern'));
      await waitFor(() => {
        expect(screen.getByText('Bitte wähle eine Art der Liste aus.')).toBeInTheDocument();
      });
    });
  });

  describe('classic list editing', () => {
    it('calls onSave with correct data when name is changed', async () => {
      const onSave = jest.fn().mockResolvedValue();
      renderDialog({ onSave });

      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Neue Familie' } });
      fireEvent.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Neue Familie',
          listKind: 'classic',
        });
      });
    });

    it('does not show target list section for classic list kind', () => {
      renderDialog({ group: mockClassicGroup });
      expect(screen.queryByText(/Ziel-Liste/)).not.toBeInTheDocument();
    });
  });

  describe('interactive list editing', () => {
    it('pre-populates the target list when group already has targetListId', () => {
      renderDialog({ group: mockInteractiveGroup, privateLists: mockPrivateLists });
      // targetListMode should be 'select' since group has targetListId
      expect(screen.getByLabelText('Bestehende Liste auswählen')).toHaveValue('list1');
    });

    it('shows target list section when switching to interactive kind', () => {
      renderDialog({ group: mockClassicGroup });
      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'interactive' } });
      expect(screen.getAllByText(/Ziel-Liste/).length).toBeGreaterThan(0);
      expect(screen.getByText('Bestehende Liste wählen')).toBeInTheDocument();
      expect(screen.getByText('Neue Liste anlegen')).toBeInTheDocument();
    });

    it('hides target list section when switching from interactive to classic', () => {
      renderDialog({ group: mockInteractiveGroup, privateLists: mockPrivateLists });
      expect(screen.getAllByText(/Ziel-Liste/).length).toBeGreaterThan(0);

      fireEvent.change(screen.getByLabelText('Art *'), { target: { value: 'classic' } });
      expect(screen.queryByText(/Ziel-Liste/)).not.toBeInTheDocument();
    });

    it('shows error when submitting interactive list without target list mode', async () => {
      renderDialog({ group: { ...mockClassicGroup, listKind: 'interactive' } });
      fireEvent.click(screen.getByText('Speichern'));
      await waitFor(() => {
        expect(screen.getByText('Bitte wähle eine Ziel-Liste aus oder lege eine neue an.')).toBeInTheDocument();
      });
    });

    it('shows error when "select" mode selected but no list chosen', async () => {
      renderDialog({ group: { ...mockClassicGroup, listKind: 'interactive' }, privateLists: mockPrivateLists });
      fireEvent.click(screen.getByText('Bestehende Liste wählen'));
      fireEvent.click(screen.getByText('Speichern'));
      await waitFor(() => {
        expect(screen.getByText('Bitte wähle eine bestehende Liste als Ziel aus.')).toBeInTheDocument();
      });
    });

    it('shows error when "create" mode selected but name is empty', async () => {
      renderDialog({ group: { ...mockClassicGroup, listKind: 'interactive' } });
      fireEvent.click(screen.getByText('Neue Liste anlegen'));
      fireEvent.click(screen.getByText('Speichern'));
      await waitFor(() => {
        expect(screen.getByText('Bitte gib einen Namen für die neue Ziel-Liste ein.')).toBeInTheDocument();
      });
    });

    it('calls onSave with targetListId when saving with existing target list', async () => {
      const onSave = jest.fn().mockResolvedValue();
      renderDialog({ group: mockInteractiveGroup, onSave, privateLists: mockPrivateLists });

      fireEvent.change(screen.getByLabelText('Listenname *'), { target: { value: 'Interaktiv Neu' } });
      fireEvent.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Interaktiv Neu',
          listKind: 'interactive',
          targetListId: 'list1',
        });
      });
    });

    it('calls onSave with newTargetListName when creating a new target list', async () => {
      const onSave = jest.fn().mockResolvedValue();
      renderDialog({ group: { ...mockClassicGroup, listKind: 'interactive' }, onSave });

      fireEvent.click(screen.getByText('Neue Liste anlegen'));
      fireEvent.change(screen.getByLabelText('Name der neuen Ziel-Liste'), {
        target: { value: 'Neue Zielliste' },
      });
      fireEvent.click(screen.getByText('Speichern'));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Familie',
          listKind: 'interactive',
          newTargetListName: 'Neue Zielliste',
        });
      });
    });
  });

  describe('excludes current group from privateLists', () => {
    it('does not show the current group itself as a target list option', () => {
      const groupWithSameId = { id: 'list1', name: 'Familienrezepte', type: 'private', listKind: 'interactive', targetListId: 'list2', ownerId: 'user1', memberIds: ['user1'] };
      // Simulate what GroupDetail does: filter out the current group before passing privateLists
      const filteredLists = mockPrivateLists.filter((l) => l.id !== groupWithSameId.id);
      renderDialog({
        group: groupWithSameId,
        privateLists: filteredLists,
      });

      // list1 has been filtered out, so only list2 (Freunde) should appear
      expect(screen.queryByText('Familienrezepte')).not.toBeInTheDocument();
      expect(screen.getByText('Freunde')).toBeInTheDocument();
    });
  });
});
