/**
 * Texte der Bewertungen (src/components/RecipeRating.js auf Karten und in der Rezeptansicht,
 * src/components/RatingModal.js). Vorhaben Mehrsprachigkeit, PR 6a. Aufbau und Regeln:
 * src/i18n/texte.js. {schnitt} kommt schon nach der Sprache formatiert (4,5 / 4.5).
 */
// Geschütztes Leerzeichen: im Französischen vor : ? ! ; und innerhalb von « ».
const NBSP = '\u00a0';

export default {
  de: {
    herzGefuellt: 'Herz gefüllt',
    herzLeer: 'Herz leer',
    bewerten: 'Bewerten',
    jetztBewerten: 'Jetzt bewerten',
    zusammenfassung: {
      one: 'Bewertung: Ø {schnitt} ({anzahl} Bewertung) – Jetzt bewerten',
      other: 'Bewertung: Ø {schnitt} ({anzahl} Bewertungen) – Jetzt bewerten',
    },
    deineBewertung: { one: 'Deine Bewertung: {anzahl} Herz', other: 'Deine Bewertung: {anzahl} Herzen' },
    durchschnitt: { one: 'Ø {schnitt} ({anzahl} Bewertung)', other: 'Ø {schnitt} ({anzahl} Bewertungen)' },
    nochKeine: 'Noch keine Bewertungen',
    rezeptBewerten: 'Rezept bewerten',
    herzen: { one: '{anzahl} Herz', other: '{anzahl} Herzen' },
    vonFuenf: { one: '{anzahl} von 5 Herzen', other: '{anzahl} von 5 Herzen' },
    anzahlBewertungen: { one: '{anzahl} Bewertung', other: '{anzahl} Bewertungen' },
    bewertungAuswaehlen: 'Bewertung auswählen',
    deinName: 'Dein Name *',
    kommentar: 'Kommentar (optional)…',
    alleBewertungen: 'Alle Bewertungen',
    anonym: 'Anonym',
    bewertungLoeschen: 'Bewertung löschen',
  },
  en: {
    herzGefuellt: 'Filled heart',
    herzLeer: 'Empty heart',
    bewerten: 'Rate',
    jetztBewerten: 'Rate now',
    zusammenfassung: {
      one: 'Rating: Ø {schnitt} ({anzahl} rating) – rate now',
      other: 'Rating: Ø {schnitt} ({anzahl} ratings) – rate now',
    },
    deineBewertung: { one: 'Your rating: {anzahl} heart', other: 'Your rating: {anzahl} hearts' },
    durchschnitt: { one: 'Ø {schnitt} ({anzahl} rating)', other: 'Ø {schnitt} ({anzahl} ratings)' },
    nochKeine: 'No ratings yet',
    rezeptBewerten: 'Rate recipe',
    herzen: { one: '{anzahl} heart', other: '{anzahl} hearts' },
    vonFuenf: { one: '{anzahl} of 5 hearts', other: '{anzahl} of 5 hearts' },
    anzahlBewertungen: { one: '{anzahl} rating', other: '{anzahl} ratings' },
    bewertungAuswaehlen: 'Choose a rating',
    deinName: 'Your name *',
    kommentar: 'Comment (optional)…',
    alleBewertungen: 'All ratings',
    anonym: 'Anonymous',
    bewertungLoeschen: 'Delete rating',
  },
  fr: {
    herzGefuellt: 'Cœur plein',
    herzLeer: 'Cœur vide',
    bewerten: 'Noter',
    jetztBewerten: 'Noter maintenant',
    zusammenfassung: {
      one: `Note${NBSP}: Ø {schnitt} ({anzahl} note) – noter maintenant`,
      other: `Note${NBSP}: Ø {schnitt} ({anzahl} notes) – noter maintenant`,
    },
    deineBewertung: { one: `Ta note${NBSP}: {anzahl} cœur`, other: `Ta note${NBSP}: {anzahl} cœurs` },
    durchschnitt: { one: 'Ø {schnitt} ({anzahl} note)', other: 'Ø {schnitt} ({anzahl} notes)' },
    nochKeine: 'Pas encore de note',
    rezeptBewerten: 'Noter la recette',
    herzen: { one: '{anzahl} cœur', other: '{anzahl} cœurs' },
    vonFuenf: { one: '{anzahl} cœur sur 5', other: '{anzahl} cœurs sur 5' },
    anzahlBewertungen: { one: '{anzahl} note', other: '{anzahl} notes' },
    bewertungAuswaehlen: 'Choisir une note',
    deinName: 'Ton nom *',
    kommentar: 'Commentaire (facultatif)…',
    alleBewertungen: 'Toutes les notes',
    anonym: 'Anonyme',
    bewertungLoeschen: 'Supprimer la note',
  },
};
