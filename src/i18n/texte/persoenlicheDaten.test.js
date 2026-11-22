import persoenlicheDatenTexte from './persoenlicheDaten';
import { ALARM_SOUND_DEFINITIONS } from '../../utils/alarmSounds';
import { SPRACH_IDS } from '../sprachen';

describe('Wörterbuch persoenlicheDaten', () => {
  it.each(SPRACH_IDS)('%s: hat für jeden Alarmton einen Namen', (sprache) => {
    const fehlend = ALARM_SOUND_DEFINITIONS
      .map(({ key }) => `alarm_${key}`)
      .filter((schluessel) => !persoenlicheDatenTexte[sprache][schluessel]);
    expect(fehlend).toEqual([]);
  });

  it('nennt die Alarmtöne im Deutschen wie src/utils/alarmSounds.js', () => {
    ALARM_SOUND_DEFINITIONS.forEach(({ key, label }) => {
      expect(persoenlicheDatenTexte.de[`alarm_${key}`]).toBe(label);
    });
  });
});
