import fs from 'fs';
import path from 'path';
import { erstelleT, findeText } from '../texte';
import naehrwerteTexte, { MELDUNGEN } from './naehrwerte';

// Meldungen von resolveIngredientNutritionByStatus landen in calcNotIncluded und erscheinen über
// MELDUNGEN in der geltenden Sprache (Mehrsprachigkeit PR 6p)
describe('Meldungen der Nährwert-Ermittlung', () => {
  const gespeichert = [
    ['Nährwerte konnten nicht ermittelt werden (Datenerfassung ausstehend)', 'meldungDatenerfassung'],
    ['Mengenangabe konnte nicht ermittelt werden', 'meldungMengeUnbekannt'],
  ];

  test('werden erkannt und übersetzt', () => {
    const tEn = erstelleT(naehrwerteTexte, 'en');
    gespeichert.forEach(([text, schluessel]) => {
      expect(findeText(naehrwerteTexte, text, MELDUNGEN)).toEqual({ schluessel, werte: {} });
    });
    expect(tEn('meldungMengeUnbekannt')).toBe('The amount couldn’t be determined');
  });

  test('stehen genau so im Code von nutritionStatusResolver.js', () => {
    const quelle = fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'nutritionStatusResolver.js'), 'utf8');
    gespeichert.forEach(([text]) => expect(quelle).toContain(`'${text}'`));
  });
});
