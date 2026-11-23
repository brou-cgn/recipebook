/**
 * Texte der Diktierfunktion (src/hooks/useSpeechDictation.js) und ihres Mikrofon-Knopfs, bisher im
 * Dialog „Eigene Version erstellen“ (src/components/RecipeVersionDescribe.js). Vorhaben
 * Mehrsprachigkeit PR 6o; die Spracherkennung hört seitdem in der geltenden Sprache zu.
 * Aufbau und Regeln: src/i18n/texte.js.
 */
export default {
  de: {
    diktatStarten: 'Diktat starten',
    diktatBeenden: 'Diktat beenden',
    // Fehler der Spracherkennung (Codes der Web Speech API in useSpeechDictation.js)
    keinZugriff: 'Mikrofonzugriff nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.',
    nichtsVerstanden: 'Es wurde nichts verstanden. Bitte versuche es noch einmal.',
    keinMikrofon: 'Es wurde kein Mikrofon gefunden.',
    keineVerbindung: 'Die Spracherkennung braucht eine Internetverbindung.',
    fehlgeschlagen: 'Die Spracherkennung ist fehlgeschlagen.',
    startFehlgeschlagen: 'Die Spracherkennung konnte nicht gestartet werden.',
  },
  en: {
    diktatStarten: 'Start dictation',
    diktatBeenden: 'Stop dictation',
    // Fehler der Spracherkennung (Codes der Web Speech API in useSpeechDictation.js)
    keinZugriff: 'Microphone access isn’t allowed. Please allow it in your browser settings.',
    nichtsVerstanden: 'Nothing was recognised. Please try again.',
    keinMikrofon: 'No microphone was found.',
    keineVerbindung: 'Speech recognition needs an internet connection.',
    fehlgeschlagen: 'Speech recognition failed.',
    startFehlgeschlagen: 'Speech recognition couldn’t be started.',
  },
  fr: {
    diktatStarten: 'Lancer la dictée',
    diktatBeenden: 'Arrêter la dictée',
    // Fehler der Spracherkennung (Codes der Web Speech API in useSpeechDictation.js)
    keinZugriff: 'L’accès au micro n’est pas autorisé. Autorise-le dans les réglages de ton navigateur.',
    nichtsVerstanden: 'Rien n’a été compris. Réessaie.',
    keinMikrofon: 'Aucun micro n’a été trouvé.',
    keineVerbindung: 'La reconnaissance vocale a besoin d’une connexion Internet.',
    fehlgeschlagen: 'La reconnaissance vocale a échoué.',
    startFehlgeschlagen: 'Impossible de démarrer la reconnaissance vocale.',
  },
};
