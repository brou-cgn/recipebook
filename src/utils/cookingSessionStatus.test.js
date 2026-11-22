import { cookingStatus, stepTimerChips } from './cookingSessionStatus';
import { erstelleT } from '../i18n/texte';
import kochmodusTexte from '../i18n/texte/kochmodus';

// Timer wie in CookingSessionContext: stepKey -> timerIndex -> Timer
const running = (remainingSeconds) => ({ totalSeconds: 600, remainingSeconds, endTime: 1, running: true, finished: false });
const finished = () => ({ totalSeconds: 600, remainingSeconds: 0, endTime: 1, running: false, finished: true });

describe('stepTimerChips (Titelzeile, Feinschliff Tablet Punkt 3)', () => {
  test('zeigt laufende und abgelaufene Timer anderer Schritte, nicht den des aktuellen', () => {
    const chips = stepTimerChips({ step_0: { 0: running(4360) }, step_5: { 0: running(120) } }, 5);

    expect(chips).toEqual([
      { stepIndex: 0, kind: 'timer', text: '1:12:40', urgent: false, label: 'Timer 1:12:40' },
    ]);
  });

  test('abgelaufene zuerst, dann nach Restzeit; unter fünf Minuten hervorgehoben', () => {
    const chips = stepTimerChips({
      step_1: { 0: running(900) },
      step_2: { 0: finished() },
      step_3: { 0: running(240) },
    }, 4);

    expect(chips.map((chip) => [chip.stepIndex, chip.text, chip.urgent])).toEqual([
      [2, 'Fertig', true],
      [3, '4:00', true],
      [1, '15:00', false],
    ]);
  });

  test('gestoppte Timer, leere Schritte und fremde Schlüssel zählen nicht', () => {
    expect(stepTimerChips({ step_1: {}, step_2: { 0: undefined }, other: { 0: running(60) } }, 0)).toEqual([]);
    expect(stepTimerChips(undefined, 0)).toEqual([]);
  });
});

describe('Texte in der geltenden Sprache (Mehrsprachigkeit PR 6a)', () => {
  const rezept = { id: 'r', steps: ['Eins.', { type: 'heading', text: 'Teil' }, 'Zwei.', 'Drei.'] };

  test('ohne Übersetzungsfunktion deutsch wie bisher', () => {
    expect(cookingStatus({ recipe: rezept, stepIndex: 1 }, {})).toMatchObject({
      text: 'Schritt 2 / 3', shortText: '2 / 3', label: 'Schritt 2 von 3',
    });
  });

  test('mit t aus kochmodus.js auf Englisch und Französisch', () => {
    const en = erstelleT(kochmodusTexte, 'en');
    expect(cookingStatus({ recipe: rezept, stepIndex: 1 }, {}, en)).toMatchObject({ text: 'Step 2 / 3', label: 'Step 2 of 3' });
    expect(cookingStatus({ recipe: rezept }, { r: { step_0: { 0: finished() } } }, en)).toMatchObject({ text: 'Done', label: 'Timer finished' });
    const fr = erstelleT(kochmodusTexte, 'fr');
    expect(stepTimerChips({ step_2: { 0: running(90) } }, 0, fr)[0]).toMatchObject({ text: '1:30', label: 'Minuteur 1:30' });
    expect(cookingStatus({ recipe: { id: 'leer', steps: [] } }, {}, fr)).toMatchObject({ text: 'En cuisson', label: 'en cuisson' });
  });
});
