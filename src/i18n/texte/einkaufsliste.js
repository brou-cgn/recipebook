/**
 * Texte der Einkaufsliste (src/components/ShoppingListModal.js, aus Rezeptansicht, Festtafel und
 * Events). Vorhaben Mehrsprachigkeit, PR 6a. Die Einträge selbst bleiben im Original (Zutaten des
 * deutschen Rezepts, Entscheidung „Original bleibt Grundlage“). Aufbau und Regeln: src/i18n/texte.js.
 * „Bring!“ ist ein Produktname und bleibt in allen Sprachen gleich.
 */
export default {
  de: {
    einkaufsliste: 'Einkaufsliste',
    schliessen: 'Einkaufsliste schließen',
    keineZutaten: 'Keine Zutaten vorhanden.',
    zutatBearbeiten: 'Zutat bearbeiten',
    erledigt: '{erledigt} / {gesamt} erledigt',
    zuruecksetzen: 'Zurücksetzen',
    anBring: 'Einkaufsliste an Bring! übergeben',
    teilenNoetig: 'Dieser Eintrag muss zuerst geteilt werden, um ihn an Bring! zu übergeben.',
    fehlerBring: 'Fehler beim Exportieren zu Bring!. Bitte versuch es erneut.',
  },
  en: {
    einkaufsliste: 'Shopping list',
    schliessen: 'Close shopping list',
    keineZutaten: 'No ingredients.',
    zutatBearbeiten: 'Edit ingredient',
    erledigt: '{erledigt} / {gesamt} done',
    zuruecksetzen: 'Reset',
    anBring: 'Send shopping list to Bring!',
    teilenNoetig: 'This entry has to be shared first before it can be sent to Bring!.',
    fehlerBring: 'Couldn’t export to Bring!. Please try again.',
  },
  fr: {
    einkaufsliste: 'Liste de courses',
    schliessen: 'Fermer la liste de courses',
    keineZutaten: 'Aucun ingrédient.',
    zutatBearbeiten: 'Modifier l’ingrédient',
    erledigt: '{erledigt} / {gesamt} cochés',
    zuruecksetzen: 'Réinitialiser',
    anBring: 'Envoyer la liste de courses à Bring!',
    teilenNoetig: 'Cette entrée doit d’abord être partagée pour être envoyée à Bring!.',
    fehlerBring: 'Impossible d’exporter vers Bring!. Réessaie.',
  },
};
