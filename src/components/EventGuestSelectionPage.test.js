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

  test('renders typeahead search input', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByRole('combobox', { name: 'Gast suchen' })).toBeInTheDocument();
  });

  test('guests are not listed before typing', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.queryByText('Anna Beispiel')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Muster')).not.toBeInTheDocument();
  });

  test('typing in search input shows matching guests in dropdown', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const searchInput = screen.getByRole('combobox', { name: 'Gast suchen' });
    fireEvent.change(searchInput, { target: { value: 'Anna' } });

    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.queryByText('Bob Muster')).not.toBeInTheDocument();
  });

  test('shows no-results message when search does not match any guest', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const searchInput = screen.getByRole('combobox', { name: 'Gast suchen' });
    fireEvent.change(searchInput, { target: { value: 'ZZZ' } });

    expect(screen.getByText('Keine Gäste gefunden.')).toBeInTheDocument();
  });

  test('selecting a guest from the dropdown adds them to the selection list', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const searchInput = screen.getByRole('combobox', { name: 'Gast suchen' });
    fireEvent.change(searchInput, { target: { value: 'Anna' } });

    const option = screen.getByRole('option', { name: 'Anna Beispiel' });
    fireEvent.mouseDown(option);

    expect(screen.getByText('1 Gast ausgewählt.')).toBeInTheDocument();
    expect(screen.getByText('Anna Beispiel', { selector: '.events-guest-row-name' })).toBeInTheDocument();
  });

  test('search input is cleared after selecting a guest', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={[]}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const searchInput = screen.getByRole('combobox', { name: 'Gast suchen' });
    fireEvent.change(searchInput, { target: { value: 'Anna' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Anna Beispiel' }));

    expect(searchInput.value).toBe('');
  });

  test('already-selected guests do not appear in the typeahead dropdown', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const searchInput = screen.getByRole('combobox', { name: 'Gast suchen' });
    fireEvent.change(searchInput, { target: { value: 'Anna' } });

    expect(screen.queryByRole('option', { name: 'Anna Beispiel' })).not.toBeInTheDocument();
  });

  test('shows selected guests as rows with a Fahrer checkbox', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    expect(screen.getByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.getByLabelText('Anna Beispiel als Fahrer markieren')).toBeInTheDocument();
  });

  test('removes a guest when swiped left and delete button is clicked', () => {
    render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const annaRowContent = screen.getByText('Anna Beispiel').closest('.events-guest-row-content');
    fireEvent.touchStart(annaRowContent, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(annaRowContent, { touches: [{ clientX: 80, clientY: 100 }] });
    fireEvent.touchEnd(annaRowContent);
    fireEvent.click(annaRowContent.parentElement.querySelector('.events-guest-row-swipe-action'));

    expect(screen.getByText('0 Gäste ausgewählt.')).toBeInTheDocument();
    expect(screen.queryByText('Anna Beispiel', { selector: '.events-guest-row-name' })).not.toBeInTheDocument();
  });

  test('removes a guest via the always-visible desktop delete button, without swiping', () => {
    const { container } = render(
      <EventGuestSelectionPage
        currentUser={currentUser}
        selectedGuestIds={['g1']}
        driverGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />
    );

    fireEvent.click(container.querySelector('.events-guest-row-delete-btn'));

    expect(screen.getByText('0 Gäste ausgewählt.')).toBeInTheDocument();
    expect(screen.queryByText('Anna Beispiel', { selector: '.events-guest-row-name' })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

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

    fireEvent.click(screen.getByLabelText('Anna Beispiel entfernen'));

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith([], []);
  });
});
