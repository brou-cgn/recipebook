/**
 * Allgemeine Texte, die viele Bereiche brauchen (Knöpfe, Zustände). Was nur ein Bereich
 * braucht, gehört in dessen eigenes Wörterbuch. Aufbau und Regeln: src/i18n/texte.js.
 */
// Geschütztes Leerzeichen: im Französischen vor : ? ! ; und innerhalb von « ».
const NBSP = '\u00a0';

export default {
  de: {
    speichern: 'Speichern',
    abbrechen: 'Abbrechen',
    schliessen: 'Schließen',
    zurueck: 'Zurück',
    bearbeiten: 'Bearbeiten',
    loeschen: 'Löschen',
    speichernLaeuft: 'Wird gespeichert…',
    laden: 'Wird geladen …',
    fehlerAllgemein: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
    ok: 'OK',
    gespeichert: '✓ Gespeichert',
    speichernKurz: 'Speichern…',
    vorherigesBild: 'Vorheriges Bild',
    naechstesBild: 'Nächstes Bild',
    bildNummer: 'Bild {nummer}',
    profilOeffnen: 'Profil von {name} öffnen',
    entfernt: '„{name}“ entfernt',
    rueckgaengig: 'Rückgängig',
    // Löschknopf einer Zeile (DeleteRowButton.js) und kurze Knöpfe, PR 6g
    nameEntfernen: '{name} entfernen',
    // Anzeigename von Gästen (anonyme Anmeldung); gespeichert bleibt vorname 'Gast' (userManagement.js)
    gast: 'Gast',
    weiter: 'Weiter',
    hinzufuegen: 'Hinzufügen',
    aendern: 'Ändern',
    // Prüfung und Hochladen von Bildern (bildDateiFehler in src/utils/imageUtils.js), PR 6o; message der
    // Fehler ist der deutsche Text, angezeigt über ergebnisText(fehler, t)
    bildFehlt: 'Es wurde keine Datei ausgewählt.',
    bildZuGross: 'Das Bild darf höchstens 5 MB groß sein.',
    bildTypUngueltig: 'Dieses Dateiformat geht nicht. Bitte wähle ein Bild im Format JPEG, PNG, GIF oder WebP.',
    bildHochladenFehlgeschlagen: 'Das Bild konnte nicht hochgeladen werden. Bitte versuch es noch einmal.',
  },
  en: {
    speichern: 'Save',
    abbrechen: 'Cancel',
    schliessen: 'Close',
    zurueck: 'Back',
    bearbeiten: 'Edit',
    loeschen: 'Delete',
    speichernLaeuft: 'Saving…',
    laden: 'Loading…',
    fehlerAllgemein: 'Something went wrong. Please try again.',
    ok: 'OK',
    gespeichert: '✓ Saved',
    speichernKurz: 'Saving…',
    vorherigesBild: 'Previous image',
    naechstesBild: 'Next image',
    bildNummer: 'Image {nummer}',
    profilOeffnen: 'Open {name}’s profile',
    entfernt: '“{name}” removed',
    rueckgaengig: 'Undo',
    // Löschknopf einer Zeile (DeleteRowButton.js) und kurze Knöpfe, PR 6g
    nameEntfernen: 'Remove {name}',
    // Anzeigename von Gästen (anonyme Anmeldung); gespeichert bleibt vorname 'Gast' (userManagement.js)
    gast: 'Guest',
    weiter: 'Next',
    hinzufuegen: 'Add',
    aendern: 'Change',
    // Prüfung und Hochladen von Bildern (bildDateiFehler in src/utils/imageUtils.js), PR 6o; message der
    // Fehler ist der deutsche Text, angezeigt über ergebnisText(fehler, t)
    bildFehlt: 'No file was selected.',
    bildZuGross: 'The image can be no larger than 5 MB.',
    bildTypUngueltig: 'This file type isn’t supported. Please choose a JPEG, PNG, GIF or WebP image.',
    bildHochladenFehlgeschlagen: 'The image couldn’t be uploaded. Please try again.',
  },
  fr: {
    speichern: 'Enregistrer',
    abbrechen: 'Annuler',
    schliessen: 'Fermer',
    zurueck: 'Retour',
    bearbeiten: 'Modifier',
    loeschen: 'Supprimer',
    speichernLaeuft: 'Enregistrement…',
    laden: 'Chargement…',
    fehlerAllgemein: 'Ça n’a pas marché. Réessaie.',
    ok: 'OK',
    gespeichert: '✓ Enregistré',
    speichernKurz: 'Enregistrement…',
    vorherigesBild: 'Image précédente',
    naechstesBild: 'Image suivante',
    bildNummer: 'Image {nummer}',
    profilOeffnen: 'Ouvrir le profil de {name}',
    entfernt: `«${NBSP}{name}${NBSP}» retiré`,
    rueckgaengig: 'Annuler',
    // Löschknopf einer Zeile (DeleteRowButton.js) und kurze Knöpfe, PR 6g
    nameEntfernen: 'Retirer {name}',
    // Anzeigename von Gästen (anonyme Anmeldung); gespeichert bleibt vorname 'Gast' (userManagement.js)
    gast: 'Invité',
    weiter: 'Suivant',
    hinzufuegen: 'Ajouter',
    aendern: 'Modifier',
    // Prüfung und Hochladen von Bildern (bildDateiFehler in src/utils/imageUtils.js), PR 6o; message der
    // Fehler ist der deutsche Text, angezeigt über ergebnisText(fehler, t)
    bildFehlt: 'Aucun fichier n’a été sélectionné.',
    bildZuGross: 'L’image ne doit pas dépasser 5 Mo.',
    bildTypUngueltig: 'Ce format de fichier n’est pas pris en charge. Choisis une image JPEG, PNG, GIF ou WebP.',
    bildHochladenFehlgeschlagen: 'Impossible d’envoyer l’image. Réessaie.',
  },
};
