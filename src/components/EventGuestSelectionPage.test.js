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

    expect(screen.getByRole('heading', { name: 'Gäste' })).toBeInTheDocument();
  });

  test('shows a shared guests/drivers table', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByRole('columnheader', { name: 'Gast' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fahrer' })).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Bob Muster')).toBeInTheDocument();
  });

  test('toggles a guest in the table', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const guestCheckbox = screen.getByLabelText('Anna Beispiel als Gast auswählen');
    fireEvent.click(guestCheckbox);

    expect(screen.getByText('1 Gast ausgewählt.')).toBeInTheDocument();
  });

  test('disables driver checkbox when guest is not selected', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByLabelText('Anna Beispiel als Fahrer markieren')).toBeDisabled();
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
    expect(checkbox).not.toBeDisabled();
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

    fireEvent.click(screen.getByLabelText('Anna Beispiel als Gast auswählen'));

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
