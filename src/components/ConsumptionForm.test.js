import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConsumptionForm from './ConsumptionForm';
import { encodeRecipeLink } from '../utils/recipeLinks';

const mockSubmitConsumption = jest.fn();
const mockLockEinkaufMengen = jest.fn(() => Promise.resolve());
const mockUnlockEinkaufMengen = jest.fn(() => Promise.resolve());
const mockLockVerbrauchMengen = jest.fn(() => Promise.resolve());
const mockUnlockVerbrauchMengen = jest.fn(() => Promise.resolve());
const mockSetEventStatus = jest.fn(() => Promise.resolve());

jest.mock('../utils/eventsFirestore', () => ({
  submitConsumption: (...args) => mockSubmitConsumption(...args),
  lockEinkaufMengen: (...args) => mockLockEinkaufMengen(...args),
  unlockEinkaufMengen: (...args) => mockUnlockEinkaufMengen(...args),
  lockVerbrauchMengen: (...args) => mockLockVerbrauchMengen(...args),
  unlockVerbrauchMengen: (...args) => mockUnlockVerbrauchMengen(...args),
  setEventStatus: (...args) => mockSetEventStatus(...args),
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
    mockLockVerbrauchMengen.mockResolvedValue(undefined);
    mockUnlockVerbrauchMengen.mockResolvedValue(undefined);
    mockSetEventStatus.mockResolvedValue(undefined);
    // Sperren der letzten Verbraucht/Uebrig-Gruppe loest submitConsumption automatisch aus
    // (siehe handleToggleVerbrauchLock) -- Standard-Resolve, damit Tests, die das nur
    // beilaeufig ausloesen, nicht an einem unbehandelten Promise-Fehler scheitern.
    mockSubmitConsumption.mockResolvedValue({ changes: [] });
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

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

    expect(screen.getByLabelText('Eingekauft')).toHaveValue('3');
    expect(screen.getByLabelText('Eingekauft')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Eingekaufte Menge sperren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eingekaufte Menge entsperren' })).toBeInTheDocument();
  });

  it('setzt den Event-Status auf "eingekauft", wenn beim Sperren alle Getraenke-Gruppen gesperrt sind', () => {
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
    const event = { ...makeEvent(ergebnis), status: 'berechnet' };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eingekaufte Menge sperren' }));

    expect(mockSetEventStatus).toHaveBeenCalledWith('user1', 'event1', 'eingekauft');
  });

  it('setzt den Event-Status zurueck auf "berechnet", wenn eine gesperrte Gruppe wieder entsperrt wird', () => {
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
    const event = {
      ...makeEvent(ergebnis),
      status: 'eingekauft',
      einkaufGesperrt: { 'drink2:0': '3' },
    };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eingekaufte Menge entsperren' }));

    expect(mockSetEventStatus).toHaveBeenCalledWith('user1', 'event1', 'berechnet');
  });

  it('zeigt eine Unterdeckungs-Warnung, wenn die ueber alle Einheiten summierte Liter-Menge unter dem kalkulierten Bedarf liegt', () => {
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
    const event = { ...makeEvent(ergebnis), status: 'berechnet' };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));

    const eingekauftInputs = screen.getAllByLabelText('Eingekauft');
    fireEvent.change(eingekauftInputs[0], { target: { value: '1' } });
    fireEvent.change(eingekauftInputs[1], { target: { value: '1 1/2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Eingekaufte Menge sperren' }));

    // Fass 1x50L + Flasche 1,5 Kaesten x 7,92L = 61,88L < 62,7L kalkuliert -> Unterdeckung, trotz gesperrt.
    expect(screen.getByText(/Unterdeckung: 61,88 l eingekauft, aber 62,7 l kalkuliert\./)).toBeInTheDocument();
  });

  it('zeigt keine Unterdeckungs-Warnung, wenn die gesperrte Summe (Liter) den kalkulierten Bedarf deckt', () => {
    const einheiten = [
      { einheitsgroesse: 50, einheit: 'Fass', gebindeinheit: '', einheitenProGebinde: '' },
    ];
    const ergebnis = [
      {
        kategorie: 'drink5:0',
        drinkId: 'drink5',
        drinkLabel: 'Fassbier',
        isCustomDrink: true,
        einheitIdx: 0,
        literMitPuffer: 40,
        gebinde: null,
        gebindeGroesseLiter: 50,
        einheiten,
      },
    ];
    const event = { ...makeEvent(ergebnis), status: 'berechnet' };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Einkauf bearbeiten' }));
    fireEvent.change(screen.getByLabelText('Eingekauft'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Eingekaufte Menge sperren' }));

    expect(screen.queryByText(/Unterdeckung:/)).not.toBeInTheDocument();
  });

  it('sperrt die Verbraucht/Uebrig-Menge analog zur Eingekauft-Sperre und friert die Eingabe ein', async () => {
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
    const event = { ...makeEvent(ergebnis), status: 'eingekauft', einkaufGesperrt: { 'drink2:0': '2' } };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verbrauch bearbeiten' }));
    fireEvent.change(screen.getByLabelText('Übrig (Flasche)'), { target: { value: '1' } });

    const verbrauchLockButton = screen.getByRole('button', { name: 'Verbrauchte Menge sperren' });
    fireEvent.click(verbrauchLockButton);

    expect(mockLockVerbrauchMengen).toHaveBeenCalledWith('user1', 'event1', { 'drink2:0': '1' });
    expect(screen.getByLabelText('Übrig (Flasche)')).toBeDisabled();

    // Diese Gruppe ist die einzige des Events -- das Sperren loest also auch
    // automatisch submitConsumption aus; hier nur abwarten, damit der Test
    // sauber endet (siehe eigener Test unten fuer die Details dazu).
    await screen.findByText('Verbrauch gespeichert');
  });

  it('loest submitConsumption automatisch aus, sobald alle Getraenke-Gruppen fuer Verbraucht/Uebrig gesperrt sind', async () => {
    mockSubmitConsumption.mockResolvedValue({ changes: [] });
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
    const event = { ...makeEvent(ergebnis), status: 'eingekauft', einkaufGesperrt: { 'drink2:0': '2' } };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Verbrauch bearbeiten' }));
    fireEvent.change(screen.getByLabelText('Übrig (Flasche)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verbrauchte Menge sperren' }));

    expect(await screen.findByText('Verbrauch gespeichert')).toBeInTheDocument();
    expect(mockSubmitConsumption).toHaveBeenCalledWith('event1', { 'drink2:0': { eingekauft: 2, uebrig: 0 } });
  });

  it('zeigt das Warn-Icon "Verbrauch fehlt", wenn das Eventdatum vergangen und Verbrauch/Uebrig noch nicht gesperrt ist', () => {
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
    const event = { ...makeEvent(ergebnis), status: 'eingekauft', date: '2000-01-01' };

    render(
      <ConsumptionForm event={event} recipes={[]} onDone={jest.fn()} onCancel={jest.fn()} currentUser={{ id: 'user1' }} />
    );

    expect(screen.getByLabelText('Verbrauch fehlt')).toBeInTheDocument();
  });
});
