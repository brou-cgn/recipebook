/**
 * Meldungen und Hinweise aus src/App.js: Fehler beim Speichern, Löschen und Veröffentlichen von Rezepten, Menüs,
 * Gruppen und Listen, das Ergebnis des CSV-Imports, der Hinweis auf ein Rezept zur Prüfung und die Rückfrage beim
 * Verwerfen eines wartenden Imports. Vorhaben Mehrsprachigkeit, PR 6m. Aufbau und Regeln: src/i18n/texte.js.
 *
 * Bewusst klein: App.js liegt im Start-Chunk. Einträge im Push-Protokoll (appendPushLog) sind Diagnose und bleiben
 * deutsch.
 */
// Geschütztes Leerzeichen: im Französischen vor : ? ! ; und innerhalb von « ».
const NBSP = '\u00a0';

export default {
  de: {
    // Fehler beim Speichern, Löschen und Veröffentlichen
    fehlerRezeptSpeichern: 'Fehler beim Speichern des Rezepts. Bitte versuche es erneut.',
    fehlerRezepteImportieren: 'Fehler beim Importieren der Rezepte. Bitte versuche es erneut.',
    fehlerRezeptLoeschen: 'Fehler beim Löschen des Rezepts. Bitte versuche es erneut.',
    fehlerRezeptVeroeffentlichen: 'Fehler beim Veröffentlichen des Rezepts. Bitte versuche es erneut.',
    keineBerechtigungMenueBearbeiten: 'Du hast keine Berechtigung, dieses Menü zu bearbeiten.',
    fehlerMenueSpeichern: 'Fehler beim Speichern des Menüs. Bitte versuche es erneut.',
    keineBerechtigungMenueLoeschen: 'Du hast keine Berechtigung, dieses Menü zu löschen.',
    fehlerMenueLoeschen: 'Fehler beim Löschen des Menüs. Bitte versuche es erneut.',
    keineBerechtigungMenueVeroeffentlichen: 'Du hast keine Berechtigung, dieses Menü zu veröffentlichen.',
    fehlerMenueVeroeffentlichen: 'Fehler beim Veröffentlichen des Menüs. Bitte versuche es erneut.',
    fehlerGruppeErstellen: 'Fehler beim Erstellen der Gruppe. Bitte versuche es erneut.',
    fehlerInspirationAnlegen: 'Fehler beim Anlegen der Inspirationssammlung. Bitte versuche es erneut.',
    fehlerInspirationHinterlegen: 'Fehler beim Hinterlegen der Inspirationssammlung. Bitte versuche es erneut.',
    fehlerGruppeAktualisieren: 'Fehler beim Aktualisieren der Gruppe. Bitte versuche es erneut.',
    fehlerListeBearbeiten: 'Fehler beim Bearbeiten der Liste. Bitte versuche es erneut.',
    fehlerGruppeLoeschen: 'Fehler beim Löschen der Gruppe. Bitte versuche es erneut.',
    // Ergebnis des CSV-Imports (handleBulkImportRecipes)
    rezepteImportiert: { one: '✓ {anzahl} Rezept erfolgreich importiert!', other: '✓ {anzahl} Rezepte erfolgreich importiert!' },
    importAbgeschlossen: 'Import abgeschlossen:',
    rezepteImportiertKurz: { one: '✓ {anzahl} Rezept erfolgreich importiert', other: '✓ {anzahl} Rezepte erfolgreich importiert' },
    rezepteFehlgeschlagen: { one: '✗ {anzahl} fehlgeschlagen:', other: '✗ {anzahl} fehlgeschlagen:' },
    // Rezept zur Prüfung aus einer Mitteilung und wartende Importe
    pruefRezeptNachFormular: 'Prüf-Rezept öffnet sich nach dem Schließen des Formulars',
    rezeptWirdGeoeffnet: 'Rezept wird geöffnet …',
    importVerwerfen: 'Import verwerfen',
    importVerwerfenFrage: 'Möchtest du den Import „{titel}“ wirklich verwerfen?',
    verwerfen: 'Verwerfen',
    unbenanntesRezept: 'Unbenanntes Rezept',
  },
  en: {
    // Fehler beim Speichern, Löschen und Veröffentlichen
    fehlerRezeptSpeichern: 'The recipe couldn’t be saved. Please try again.',
    fehlerRezepteImportieren: 'The recipes couldn’t be imported. Please try again.',
    fehlerRezeptLoeschen: 'The recipe couldn’t be deleted. Please try again.',
    fehlerRezeptVeroeffentlichen: 'The recipe couldn’t be published. Please try again.',
    keineBerechtigungMenueBearbeiten: 'You don’t have permission to edit this menu.',
    fehlerMenueSpeichern: 'The menu couldn’t be saved. Please try again.',
    keineBerechtigungMenueLoeschen: 'You don’t have permission to delete this menu.',
    fehlerMenueLoeschen: 'The menu couldn’t be deleted. Please try again.',
    keineBerechtigungMenueVeroeffentlichen: 'You don’t have permission to publish this menu.',
    fehlerMenueVeroeffentlichen: 'The menu couldn’t be published. Please try again.',
    fehlerGruppeErstellen: 'The group couldn’t be created. Please try again.',
    fehlerInspirationAnlegen: 'The inspiration collection couldn’t be created. Please try again.',
    fehlerInspirationHinterlegen: 'The inspiration collection couldn’t be set. Please try again.',
    fehlerGruppeAktualisieren: 'The group couldn’t be updated. Please try again.',
    fehlerListeBearbeiten: 'The list couldn’t be edited. Please try again.',
    fehlerGruppeLoeschen: 'The group couldn’t be deleted. Please try again.',
    // Ergebnis des CSV-Imports (handleBulkImportRecipes)
    rezepteImportiert: { one: '✓ {anzahl} recipe imported successfully!', other: '✓ {anzahl} recipes imported successfully!' },
    importAbgeschlossen: 'Import finished:',
    rezepteImportiertKurz: { one: '✓ {anzahl} recipe imported successfully', other: '✓ {anzahl} recipes imported successfully' },
    rezepteFehlgeschlagen: { one: '✗ {anzahl} failed:', other: '✗ {anzahl} failed:' },
    // Rezept zur Prüfung aus einer Mitteilung und wartende Importe
    pruefRezeptNachFormular: 'The recipe to review opens once you close the form',
    rezeptWirdGeoeffnet: 'Opening recipe…',
    importVerwerfen: 'Discard import',
    importVerwerfenFrage: 'Do you really want to discard the import “{titel}”?',
    verwerfen: 'Discard',
    unbenanntesRezept: 'Untitled recipe',
  },
  fr: {
    // Fehler beim Speichern, Löschen und Veröffentlichen
    fehlerRezeptSpeichern: 'La recette n’a pas pu être enregistrée. Réessaie.',
    fehlerRezepteImportieren: 'Les recettes n’ont pas pu être importées. Réessaie.',
    fehlerRezeptLoeschen: 'La recette n’a pas pu être supprimée. Réessaie.',
    fehlerRezeptVeroeffentlichen: 'La recette n’a pas pu être publiée. Réessaie.',
    keineBerechtigungMenueBearbeiten: 'Tu n’as pas l’autorisation de modifier ce menu.',
    fehlerMenueSpeichern: 'Le menu n’a pas pu être enregistré. Réessaie.',
    keineBerechtigungMenueLoeschen: 'Tu n’as pas l’autorisation de supprimer ce menu.',
    fehlerMenueLoeschen: 'Le menu n’a pas pu être supprimé. Réessaie.',
    keineBerechtigungMenueVeroeffentlichen: 'Tu n’as pas l’autorisation de publier ce menu.',
    fehlerMenueVeroeffentlichen: 'Le menu n’a pas pu être publié. Réessaie.',
    fehlerGruppeErstellen: 'Le groupe n’a pas pu être créé. Réessaie.',
    fehlerInspirationAnlegen: 'La collection d’inspiration n’a pas pu être créée. Réessaie.',
    fehlerInspirationHinterlegen: 'La collection d’inspiration n’a pas pu être définie. Réessaie.',
    fehlerGruppeAktualisieren: 'Le groupe n’a pas pu être mis à jour. Réessaie.',
    fehlerListeBearbeiten: 'La liste n’a pas pu être modifiée. Réessaie.',
    fehlerGruppeLoeschen: 'Le groupe n’a pas pu être supprimé. Réessaie.',
    // Ergebnis des CSV-Imports (handleBulkImportRecipes)
    rezepteImportiert: { one: `✓ {anzahl} recette importée${NBSP}!`, other: `✓ {anzahl} recettes importées${NBSP}!` },
    importAbgeschlossen: `Import terminé${NBSP}:`,
    rezepteImportiertKurz: { one: '✓ {anzahl} recette importée', other: '✓ {anzahl} recettes importées' },
    rezepteFehlgeschlagen: { one: `✗ {anzahl} a échoué${NBSP}:`, other: `✗ {anzahl} ont échoué${NBSP}:` },
    // Rezept zur Prüfung aus einer Mitteilung und wartende Importe
    pruefRezeptNachFormular: 'La recette à vérifier s’ouvrira après la fermeture du formulaire',
    rezeptWirdGeoeffnet: 'Ouverture de la recette…',
    importVerwerfen: 'Abandonner l’import',
    importVerwerfenFrage: `Veux-tu vraiment abandonner l’import «${NBSP}{titel}${NBSP}»${NBSP}?`,
    verwerfen: 'Abandonner',
    unbenanntesRezept: 'Recette sans titre',
  },
};
