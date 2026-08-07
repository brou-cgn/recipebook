import React from 'react';
import { render, screen } from '@testing-library/react';
import ConsumptionForm from './ConsumptionForm';

const mockSubmitConsumption = jest.fn();

jest.mock('../utils/eventsFirestore', () => ({
  submitConsumption: (...args) => mockSubmitConsumption(...args),
}));

jest.mock('./EventForm', () => ({
  CATEGORY_LABELS: { wasser: 'Wasser' },
}));

function makeEvent(ergebnis) {
  return {
    id: 'event1',
    eventName: 'Testfest',
    berechnung: { ergebnis },
  };
}

describe('ConsumptionForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('befüllt Fass und Flasche kaskadierend aus dem kalkulierten Bedarf (Fass=1, Flasche=1,75)', () => {
    const einheiten = [
      { einheitsgroesse: 50, einheit: 'Fass', gebindeinheit: '', einheitenProGebinde: '' },
      { einheitsgroesse: 0.33, einheit: 'Flasche', gebindeinheit: 'Kasten', einheitenProGebinde: 24 },
    ];
    const ergebnis = [
      {
        kategorie: 'drink1:0',
        drinkId: 'drink1',
        drinkLabel: 'Hausbier',
        isCustomDrink: true,
        einheitIdx: 0,
        literMitPuffer: 62.7,
        gebinde: null,
        gebindeGroesseLiter: 50,
        einheiten,
      },
      {
        kategorie: 'drink1:1',
        drinkId: 'drink1',
        drinkLabel: 'Hausbier',
        isCustomDrink: true,
        einheitIdx: 1,
        literMitPuffer: 62.7,
        gebinde: 'Kasten',
        gebindeGroesseLiter: 0.33,
        einheiten,
      },
    ];

    render(<ConsumptionForm event={makeEvent(ergebnis)} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} />);

    const eingekauftInputs = screen.getAllByLabelText('Eingekauft');
    expect(eingekauftInputs).toHaveLength(2);
    expect(eingekauftInputs[0]).toHaveValue('1');
    expect(eingekauftInputs[1]).toHaveValue('1 3/4');
  });

  it('befüllt die einzige Einheit korrekt, wenn ein Getränk nur eine Einheit hat', () => {
    const einheiten = [
      { einheitsgroesse: 0.33, einheit: 'Flasche', gebindeinheit: 'Kasten', einheitenProGebinde: 24 },
    ];
    const ergebnis = [
      {
        kategorie: 'drink2:0',
        drinkId: 'drink2',
        drinkLabel: 'Cola',
        isCustomDrink: true,
        einheitIdx: 0,
        literMitPuffer: 12.7,
        gebinde: 'Kasten',
        gebindeGroesseLiter: 0.33,
        einheiten,
      },
    ];

    render(<ConsumptionForm event={makeEvent(ergebnis)} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} />);

    const eingekauftInput = screen.getByLabelText('Eingekauft');
    expect(eingekauftInput).toHaveValue('1 3/4');
  });

  it('lässt das Feld leer und zeigt eine Warnung, wenn eine Einheitsgröße fehlt', () => {
    const einheiten = [
      { einheitsgroesse: 0, einheit: 'Flasche', gebindeinheit: '', einheitenProGebinde: '' },
    ];
    const ergebnis = [
      {
        kategorie: 'drink3:0',
        drinkId: 'drink3',
        drinkLabel: 'Limo',
        isCustomDrink: true,
        einheitIdx: 0,
        literMitPuffer: 10,
        gebinde: null,
        gebindeGroesseLiter: 0.5,
        einheiten,
      },
    ];

    render(<ConsumptionForm event={makeEvent(ergebnis)} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} />);

    const eingekauftInput = screen.getByLabelText('Eingekauft');
    expect(eingekauftInput).toHaveValue('');
    expect(screen.getByText(/Limo:.*keine gültige/)).toBeInTheDocument();
  });
});
