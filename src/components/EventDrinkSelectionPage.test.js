import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EventDrinkSelectionPage from './EventDrinkSelectionPage';

const customDrinks = [
  { id: 'custom-wasser', name: 'Wasser (eigen)', kategorie: 'wasser' },
  { id: 'custom-bier', name: 'Bier (eigen)', kategorie: 'bier_alkoholfrei' },
  { id: 'custom-saft', name: 'Saft (eigen)', kategorie: 'saft' },
];

describe('EventDrinkSelectionPage', () => {
  test('renders Getränke header', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Getränke' })).toBeInTheDocument();
  });

  test('renders dropdown to add drinks', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Getränk auswählen' })).toBeInTheDocument();
  });

  test('shows selected drinks in a table', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser', 'custom-bier']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Getränk' })).toBeInTheDocument();
    expect(screen.getByText('Wasser (eigen)')).toBeInTheDocument();
    expect(screen.getByText('Bier (eigen)')).toBeInTheDocument();
  });

  test('shows table columns Getränk, Faktor und Aktion for selected drinks', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser']}
        guestPreferenceMultipliers={{ 'custom-wasser': 1 }}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Getränk' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Faktor' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Aktion' })).toBeInTheDocument();
  });

  test('shows default factor input 1.00 for selected drinks', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser', 'custom-bier']}
        guestPreferenceMultipliers={{ 'custom-wasser': 1, 'custom-bier': 0 }}
        selectedGuestIds={['g1']}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByRole('spinbutton', { name: 'Wasser (eigen) Faktor' })).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: 'Bier (eigen) Faktor' })).toHaveValue(1);
  });

  test('stores non-default factors on save', () => {
    const onSave = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser', 'custom-bier']}
        drinkDistributionFactors={{ 'custom-bier': 1.5 }}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={onSave}
        onBack={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Wasser (eigen) Faktor' }), {
      target: { value: '1.2' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bier (eigen) Faktor' }), {
      target: { value: '1.0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith(
      ['custom-wasser', 'custom-bier'],
      { 'custom-wasser': 1.2 },
    );
  });

  test('removes a drink when its remove button is clicked', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser', 'custom-bier']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Wasser (eigen) entfernen'));

    expect(screen.queryByLabelText('Wasser (eigen) entfernen')).not.toBeInTheDocument();
    expect(screen.getByText('1 Getränk ausgewählt.')).toBeInTheDocument();
  });

  test('adds a drink via the dropdown', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    fireEvent.change(select, { target: { value: 'custom-wasser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Getränk hinzufügen' }));

    expect(screen.getByText('Wasser (eigen)')).toBeInTheDocument();
    expect(screen.getByText('1 Getränk ausgewählt.')).toBeInTheDocument();
  });

  test('calls onSave with current drink ids when Speichern is clicked', () => {
    const onSave = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser', 'custom-bier']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={onSave}
        onBack={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith(['custom-wasser', 'custom-bier'], {});
  });

  test('uses default factor 1.0 for invalid values', () => {
    const onSave = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={onSave}
        onBack={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Wasser (eigen) Faktor' }), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith(['custom-wasser'], {});
  });

  test('calls onBack when Abbrechen button is clicked', () => {
    const onBack = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={onBack}
      />,
    );

    const abrechenButtons = screen.getAllByRole('button', { name: 'Abbrechen' });
    fireEvent.click(abrechenButtons[abrechenButtons.length - 1]);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('calls onBack when header close button is clicked', () => {
    const onBack = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={onBack}
      />,
    );

    const abrechenButtons = screen.getAllByRole('button', { name: 'Abbrechen' });
    fireEvent.click(abrechenButtons[0]);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('shows count for plural drinks', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser', 'custom-bier']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText('2 Getränke ausgewählt.')).toBeInTheDocument();
  });

  test('shows info message when no custom drinks available', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={[]}
        customDrinkIds={[]}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText('Noch keine eigenen Getränke angelegt.')).toBeInTheDocument();
  });

  test('already-selected drinks do not appear in the add dropdown', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Getränk auswählen' });
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).not.toContain('Wasser (eigen)');
    expect(options).toContain('Bier (eigen)');
  });
});
