import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConsumptionForm from './ConsumptionForm';
import { encodeRecipeLink } from '../utils/recipeLinks';

const mockSubmitConsumption = jest.fn();
const mockLockEinkaufMengen = jest.fn(() => Promise.resolve());
const mockUnlockEinkaufMengen = jest.fn(() => Promise.resolve());

jest.mock('../utils/eventsFirestore', () => ({
  submitConsumption: (...args) => mockSubmitConsumption(...args),
  lockEinkaufMengen: (...args) => mockLockEinkaufMengen(...args),
  unlockEinkaufMengen: (...args) => mockUnlockEinkaufMengen(...args),
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
    mockLockEinkaufMengen.mockResolvedValue(undefined);
    mockUnlockEinkaufMengen.mockResolvedValue(undefined);
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

  it('übernimmt Getränke ohne Rezeptlink in der Gebindeeinheit (sonst Einheit) in die Einkaufsliste', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Einkaufsliste erstellen/ }));

    expect(await screen.findByText('1 3/4 Kasten Cola')).toBeInTheDocument();
  });

  it('übernimmt bei Getränken mit Rezeptlink nur die auf der Getränk-bearbeiten-Karte aktivierten Zutaten', async () => {
    const recipe = {
      id: 'rezept1',
      title: 'Aperol Spritz',
      portionen: 4,
      ingredients: [
        { type: 'ingredient', text: '100 ml Aperol' },
        { type: 'ingredient', text: '50 ml Sirup', includedInCalculation: false },
      ],
    };
    const einheiten = [
      { einheitsgroesse: 0.2, einheit: 'Glas', gebindeinheit: '', einheitenProGebinde: '' },
    ];
    const ergebnis = [
      {
        kategorie: 'drink4:0',
        drinkId: 'drink4',
        drinkLabel: encodeRecipeLink('rezept1', 'Aperol Spritz'),
        isCustomDrink: true,
        einheitIdx: 0,
        literMitPuffer: 4,
        gebinde: null,
        gebindeGroesseLiter: 0.2,
        einheiten,
      },
    ];

    render(<ConsumptionForm event={makeEvent(ergebnis)} recipes={[recipe]} onDone={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Einkaufsliste erstellen/ }));

    // Die vorbefuellte "Eingekauft"-Menge (20 Glaeser) wird als Portionenzahl uebernommen.
    expect(await screen.findByText('20')).toBeInTheDocument();

    const generateBtn = await screen.findByText('Einkaufsliste erstellen', { selector: '.portion-selector-generate-btn' });
    fireEvent.click(generateBtn);

    expect(await screen.findByText('500 ml Aperol')).toBeInTheDocument();
    expect(screen.queryByText(/Sirup/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Einkaufsliste' })).toHaveClass('shopping-list-modal--event');
  });

  it('sperrt beim Klick alle Einheiten des Getraenks gemeinsam und zeigt danach den Entsperren-Button', async () => {
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

    render(
      <ConsumptionForm
        event={makeEvent(ergebnis)}
        recipes={[]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        currentUser={{ id: 'user1' }}
      />
    );

    const lockButton = screen.getByRole('button', { name: 'Eingekaufte Menge sperren' });
    fireEvent.click(lockButton);

    expect(mockLockEinkaufMengen).toHaveBeenCalledWith('user1', 'event1', {
      'drink1:0': '1',
      'drink1:1': '1 3/4',
    });
    const eingekauftInputs = screen.getAllByLabelText('Eingekauft');
    expect(eingekauftInputs[0]).toBeDisabled();
    expect(eingekauftInputs[1]).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Eingekaufte Menge sperren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eingekaufte Menge entsperren' })).toBeInTheDocument();
  });

  it('entsperrt beim Klick auf den Entsperren-Button wieder alle Einheiten des Getraenks', async () => {
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
    const event = {
      ...makeEvent(ergebnis),
      einkaufGesperrt: { 'drink1:0': '1', 'drink1:1': '1 3/4' },
    };

    render(
      <ConsumptionForm
        event={event}
        recipes={[]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        currentUser={{ id: 'user1' }}
      />
    );

    const eingekauftInputsLocked = screen.getAllByLabelText('Eingekauft');
    expect(eingekauftInputsLocked[0]).toBeDisabled();
    expect(eingekauftInputsLocked[1]).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Eingekaufte Menge sperren' })).not.toBeInTheDocument();

    const unlockButton = screen.getByRole('button', { name: 'Eingekaufte Menge entsperren' });
    fireEvent.click(unlockButton);

    expect(mockUnlockEinkaufMengen).toHaveBeenCalledWith('user1', 'event1', ['drink1:0', 'drink1:1']);
    const eingekauftInputsUnlocked = screen.getAllByLabelText('Eingekauft');
    expect(eingekauftInputsUnlocked[0]).not.toBeDisabled();
    expect(eingekauftInputsUnlocked[1]).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eingekaufte Menge sperren' })).toBeInTheDocument();
  });

  it('laedt eine bereits gesperrte Menge ohne Neukalkulation und zeigt den Entsperren-Button', () => {
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
    const event = { ...makeEvent(ergebnis), einkaufGesperrt: { 'drink2:0': '3' } };

    render(<ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByLabelText('Eingekauft')).toHaveValue('3');
    expect(screen.getByLabelText('Eingekauft')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Eingekaufte Menge sperren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eingekaufte Menge entsperren' })).toBeInTheDocument();
  });
});
