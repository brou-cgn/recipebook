/**
 * Texte rund um den Webimport-PIN, gebraucht im Header (Dialog vor dem Kurzbefehl) und in
 * den persönlichen Daten. Aufbau und Regeln: src/i18n/texte.js.
 */
export default {
  de: {
    name: 'Webimport-PIN',
    feld: 'PIN (4–8 Ziffern)',
    feldNeu: 'Neuer PIN (4–8 Ziffern)',
    bestaetigen: 'PIN bestätigen',
    fehlerFormat: 'PIN muss aus 4 bis 8 Ziffern bestehen.',
    fehlerUngleich: 'Die PINs stimmen nicht überein.',
  },
  en: {
    name: 'Web import PIN',
    feld: 'PIN (4–8 digits)',
    feldNeu: 'New PIN (4–8 digits)',
    bestaetigen: 'Confirm PIN',
    fehlerFormat: 'The PIN must have 4 to 8 digits.',
    fehlerUngleich: 'The PINs don’t match.',
  },
  fr: {
    name: 'Code PIN d’import web',
    feld: 'Code PIN (4 à 8 chiffres)',
    feldNeu: 'Nouveau code PIN (4 à 8 chiffres)',
    bestaetigen: 'Confirmer le code PIN',
    fehlerFormat: 'Le code PIN doit comporter 4 à 8 chiffres.',
    fehlerUngleich: 'Les codes PIN ne correspondent pas.',
  },
};
