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

  test('shows selected drinks in the list', () => {
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

    expect(screen.getByText('Wasser (eigen)')).toBeInTheDocument();
    expect(screen.getByText('Bier (eigen)')).toBeInTheDocument();
  });

  test('shows two-row structure with drink name and details rows', () => {
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

    expect(screen.getByText('Wasser (eigen)')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Wasser (eigen) Faktor' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Aktion' })).not.toBeInTheDocument();
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
      {},
      25,
    );
  });

  test('removes a drink when swiped left and delete button is clicked', () => {
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

    const wasserRowContent = screen.getByText('Wasser (eigen)').closest('.events-drink-row-content');
    fireEvent.touchStart(wasserRowContent, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(wasserRowContent, { touches: [{ clientX: 80, clientY: 100 }] });
    fireEvent.touchEnd(wasserRowContent);
    fireEvent.click(screen.getByLabelText('Wasser (eigen) entfernen'));

    expect(screen.queryByText('Wasser (eigen)', { selector: '.events-drink-row-name' })).not.toBeInTheDocument();
    expect(screen.getByText('1 Getränk ausgewählt.')).toBeInTheDocument();
  });

  test('removes a drink via the always-visible desktop delete button, without swiping', () => {
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

    fireEvent.click(screen.getByLabelText('Wasser (eigen) löschen'));

    expect(screen.queryByText('Wasser (eigen)', { selector: '.events-drink-row-name' })).not.toBeInTheDocument();
    expect(screen.getByText('1 Getränk ausgewählt.')).toBeInTheDocument();
  });

  test('deletes drink when delete button receives touchstart before click (regression: touchend hid the button before click landed)', () => {
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

    const wasserRowContent = screen.getByText('Wasser (eigen)').closest('.events-drink-row-content');
    // First: swipe left to reveal delete button
    fireEvent.touchStart(wasserRowContent, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(wasserRowContent, { touches: [{ clientX: 80, clientY: 100 }] });
    fireEvent.touchEnd(wasserRowContent);

    const deleteButton = screen.getByLabelText('Wasser (eigen) entfernen');

    // Simulate a real tap on the delete button: touchstart, touchend, then click all target the
    // button itself. Since touch handlers only live on the content element (not the row or the
    // delete button), this sequence must not hide the button before the click can register.
    fireEvent.touchStart(deleteButton, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchEnd(deleteButton);
    fireEvent.click(deleteButton);

    expect(screen.queryByText('Wasser (eigen)', { selector: '.events-drink-row-name' })).not.toBeInTheDocument();
    expect(screen.getByText('1 Getränk ausgewählt.')).toBeInTheDocument();
  });

  test('swipe-delete button uses the configured swipeDelete icon (same as RecipeForm ingredient delete)', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser']}
        guestPreferenceMultipliers={{}}
        selectedGuestIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
        buttonIcons={{ swipeDelete: '❌' }}
        isDarkMode={false}
      />,
    );

    const wasserRowContent = screen.getByText('Wasser (eigen)').closest('.events-drink-row-content');
    fireEvent.touchStart(wasserRowContent, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(wasserRowContent, { touches: [{ clientX: 80, clientY: 100 }] });
    fireEvent.touchEnd(wasserRowContent);

    expect(screen.getByLabelText('Wasser (eigen) entfernen')).toHaveTextContent('❌');
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

    expect(onSave).toHaveBeenCalledWith(['custom-wasser', 'custom-bier'], {}, {}, 25);
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

    expect(onSave).toHaveBeenCalledWith(['custom-wasser'], {}, {}, 25);
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

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

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

  const drinksWithMultipleEinheiten = [
    {
      id: 'custom-bier-multi',
      name: 'Craft-Bier',
      kategorie: 'bier',
      einheiten: [
        { einheitsgroesse: 0.33, gebindeinheit: 'Dose' },
        { einheitsgroesse: 0.5, gebindeinheit: 'Flasche' },
        { einheitsgroesse: 10, gebindeinheit: 'Fässchen' },
      ],
    },
  ];

  test('shows chips for multiple einheiten when drink has more than one einheit', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={drinksWithMultipleEinheiten}
        customDrinkIds={['custom-bier-multi']}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Only the selected chip (first by default) is visible; unselected ones are accessible via typeahead
    expect(screen.getByRole('button', { name: '330 ml (Dose)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '500 ml (Flasche)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10,0 l (Fässchen)' })).not.toBeInTheDocument();
    // Typeahead input is visible for unselected einheiten
    expect(screen.getByRole('textbox', { name: 'Craft-Bier Einheit suchen' })).toBeInTheDocument();
  });

  test('first einheit chip is selected by default', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={drinksWithMultipleEinheiten}
        customDrinkIds={['custom-bier-multi']}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Only selected chips are rendered; first is selected by default
    expect(screen.getByRole('button', { name: '330 ml (Dose)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: '500 ml (Flasche)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '10,0 l (Fässchen)' })).not.toBeInTheDocument();
  });

  test('can select multiple einheiten via typeahead and saves selected indices', () => {
    const onSave = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={drinksWithMultipleEinheiten}
        customDrinkIds={['custom-bier-multi']}
        onSave={onSave}
        onBack={jest.fn()}
      />,
    );

    // Open typeahead and select '500 ml (Flasche)' via dropdown
    const typeaheadInput = screen.getByRole('textbox', { name: 'Craft-Bier Einheit suchen' });
    fireEvent.focus(typeaheadInput);
    fireEvent.mouseDown(screen.getByRole('button', { name: '500 ml (Flasche)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith(
      ['custom-bier-multi'],
      {},
      { 'custom-bier-multi': [0, 1] },
      25,
    );
  });

  test('restores previously selected einheiten from drinkSelectedEinheiten prop', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={drinksWithMultipleEinheiten}
        customDrinkIds={['custom-bier-multi']}
        drinkSelectedEinheiten={{ 'custom-bier-multi': [1, 2] }}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    // Only selected chips (indices 1 and 2) are shown
    expect(screen.queryByRole('button', { name: '330 ml (Dose)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '500 ml (Flasche)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '10,0 l (Fässchen)' })).toHaveAttribute('aria-pressed', 'true');
    // Typeahead shows for unselected '330 ml (Dose)'
    expect(screen.getByRole('textbox', { name: 'Craft-Bier Einheit suchen' })).toBeInTheDocument();
  });

  test('cannot deselect the last remaining einheit chip', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={drinksWithMultipleEinheiten}
        customDrinkIds={['custom-bier-multi']}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '330 ml (Dose)' }));

    expect(screen.getByRole('button', { name: '330 ml (Dose)' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows plain text for drinks with only one einheit', () => {
    const drinksSingleEinheit = [
      { id: 'custom-saft', name: 'Saft', einheiten: [{ einheitsgroesse: 1.0, gebindeinheit: 'Flasche' }] },
    ];
    render(
      <EventDrinkSelectionPage
        customDrinks={drinksSingleEinheit}
        customDrinkIds={['custom-saft']}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('1,0 l (Flasche)')).toBeInTheDocument();
  });

  test('shows Puffer (%) field with 25 as default', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Puffer (%)')).toHaveValue(25);
  });

  test('pre-populates Puffer (%) field from pufferProzent prop', () => {
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={[]}
        pufferProzent={10}
        onSave={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Puffer (%)')).toHaveValue(10);
  });

  test('passes updated Puffer (%) value to onSave', () => {
    const onSave = jest.fn();
    render(
      <EventDrinkSelectionPage
        customDrinks={customDrinks}
        customDrinkIds={['custom-wasser']}
        pufferProzent={10}
        onSave={onSave}
        onBack={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Puffer (%)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith(['custom-wasser'], {}, {}, 30);
  });
});
