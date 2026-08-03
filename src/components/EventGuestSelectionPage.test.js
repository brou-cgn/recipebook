import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EventGuestSelectionPage from './EventGuestSelectionPage';

const mockSubscribeToGuestProfiles = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  subscribeToGuestProfiles: (...args) => mockSubscribeToGuestProfiles(...args),
}));

describe('EventGuestSelectionPage', () => {
  const currentUser = { id: 'u1' };
  const guests = [
    { id: 'g1', vorname: 'Anna', nachname: 'Beispiel', alkoholischeGetränke: false, bevorzugteGetränke: [] },
    { id: 'g2', vorname: 'Bob', nachname: 'Muster', alkoholischeGetränke: true, bevorzugteGetränke: [] },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribeToGuestProfiles.mockImplementation((_uid, cb) => {
      cb(guests);
      return jest.fn();
    });
  });

  test('renders guest selection header', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Gäste & Fahrer' })).toBeInTheDocument();
  });

  test('shows guest dropdown with unselected guests', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const select = screen.getByLabelText('Gast auswählen');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Bob Muster')).toBeInTheDocument();
  });

  test('adds a guest when Hinzufügen is clicked', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Gast auswählen'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gast hinzufügen' }));

    expect(screen.getByText('1 Gast ausgewählt.')).toBeInTheDocument();
  });

  test('shows driver checkboxes for selected guests', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Anna Beispiel als Fahrer markieren')).toBeInTheDocument();
  });

  test('toggles driver when checkbox is clicked', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const checkbox = screen.getByLabelText('Anna Beispiel als Fahrer markieren');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByText('1 Fahrer markiert.')).toBeInTheDocument();
  });

  test('calls onSave with selected guests and drivers when Speichern is clicked', () => {
    const onSave = jest.fn();
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={['g1']}
        onSave={onSave}
        onBack={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith(['g1'], ['g1']);
  });

  test('calls onBack when form Abbrechen button is clicked', () => {
    const onBack = jest.fn();
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={onBack}
      />
    );

    // There are two Abbrechen buttons (header close and form action); click the form action one
    const abrechenButtons = screen.getAllByRole('button', { name: 'Abbrechen' });
    fireEvent.click(abrechenButtons[abrechenButtons.length - 1]);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('removes a guest via chip remove button', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Anna Beispiel entfernen'));

    expect(screen.queryByText('1 Gast ausgewählt.')).not.toBeInTheDocument();
    expect(screen.getByText('Gast auswählen …')).toBeInTheDocument();
  });

  test('driver is removed when corresponding guest is deselected', () => {
    const onSave = jest.fn();
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={['g1']}
        onSave={onSave}
        onBack={jest.fn()}
      />
    );

    // Remove guest g1
    fireEvent.click(screen.getByLabelText('Anna Beispiel entfernen'));

    // Save and verify driver is also removed
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith([], []);
  });

  test('calls onBack when header close button is clicked', () => {
    const onBack = jest.fn();
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={onBack}
      />
    );

    // Header close button is the first Abbrechen button
    const abrechenButtons = screen.getAllByRole('button', { name: 'Abbrechen' });
    fireEvent.click(abrechenButtons[0]);

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
