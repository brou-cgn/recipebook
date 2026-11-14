import { stepTimerChips } from './cookingSessionStatus';

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
