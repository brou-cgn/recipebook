/**
 * Texte der Seite „Chefkoch & mehr“ (src/components/Kueche.js, Variante A des Designvorschlags
 * https://claude.ai/artifact/5S6yBvMf7j4JvfHLCzwQU2). Der Seitentitel und „Chefkoch“ stehen in
 * bereiche.js. Aufbau und Regeln: src/i18n/texte.js.
 *
 * Die Mengen erscheinen als große Zahl über ihrer Bezeichnung; die Texte hier sind deshalb nur
 * die Bezeichnung in Einzahl und Mehrzahl, ohne {anzahl}.
 *
 * Seit PR 6o auch die Seite „Meine Küchenstars“ (src/components/MeineKuechenstarsPage.js) und die
 * Zeitleiste (src/components/RecipeTimeline.js).
 */
export default {
  de: {
    meinKochbuch: 'Mein Kochbuch',
    zeitleiste: 'Zeitleiste',
    meinNetzwerk: 'Mein Netzwerk',
    miseEnPlace: 'Meine Mise en Place',
    kuechenstars: 'Meine Küchenstars',
    weinbegleitung: 'Weinbegleitung',
    verwaltung: 'Verwaltung',
    kuechenbetrieb: 'Küchenbetrieb',
    eventplanung: 'Eventplanung',
    rezepte: { one: 'Rezept', other: 'Rezepte' },
    menues: { one: 'Menü', other: 'Menüs' },
    offeneAnfragen: { one: 'offene Anfrage', other: 'offene Anfragen' },
    privateListen: { one: 'private Liste', other: 'private Listen' },
    weinstile: { one: 'Weinstil', other: 'Weinstile' },
    quellen: { one: 'Quelle', other: 'Quellen' },
    aufrufeHeute: { one: 'Aufruf heute', other: 'Aufrufe heute' },
    events: { one: 'Event', other: 'Events' },
    keineAufrufe: 'Noch keine Aufrufe',
    kuecheAktion: 'Küche-Aktion',
    unbekanntesRezept: 'Unbekanntes Rezept',
    // Seite „Meine Küchenstars“, PR 6o
    kuechenstarsUntertitel: 'Hier sind deine Top 20 Rezepte nach Anzahl der Aufrufe der letzten 14 Tage.',
    kuechenstarsLeer: 'Noch keine Rezeptaufrufe vorhanden.',
    aufrufe: { one: 'Aufruf', other: 'Aufrufe' },
    // Zeitleiste (RecipeTimeline.js), PR 6o; Anzahl im Stapel: „▸ 3 Rezepte“ mit rezepte/menues
    kochereignisse: { one: 'Kochereignis', other: 'Kochereignisse' },
    stapelEinklappen: 'Stapel einklappen',
    stapelAusklappen: 'Stapel ausklappen',
    zeitleisteKeineMenues: 'Keine Menüs vorhanden',
    zeitleisteKeineRezepte: 'Keine Rezepte vorhanden',
    datumUnbekannt: 'Unbekannt',
  },
  en: {
    meinKochbuch: 'My cookbook',
    zeitleiste: 'Timeline',
    meinNetzwerk: 'My network',
    miseEnPlace: 'My mise en place',
    kuechenstars: 'My kitchen stars',
    weinbegleitung: 'Wine pairing',
    verwaltung: 'Administration',
    kuechenbetrieb: 'Kitchen operations',
    eventplanung: 'Event planning',
    rezepte: { one: 'recipe', other: 'recipes' },
    menues: { one: 'menu', other: 'menus' },
    offeneAnfragen: { one: 'open request', other: 'open requests' },
    privateListen: { one: 'private list', other: 'private lists' },
    weinstile: { one: 'wine style', other: 'wine styles' },
    quellen: { one: 'source', other: 'sources' },
    aufrufeHeute: { one: 'view today', other: 'views today' },
    events: { one: 'event', other: 'events' },
    keineAufrufe: 'No views yet',
    kuecheAktion: 'Kitchen action',
    unbekanntesRezept: 'Unknown recipe',
    // Seite „Meine Küchenstars“, PR 6o
    kuechenstarsUntertitel: 'Here are your top 20 recipes by number of views over the last 14 days.',
    kuechenstarsLeer: 'No recipe views yet.',
    aufrufe: { one: 'view', other: 'views' },
    // Zeitleiste (RecipeTimeline.js), PR 6o; Anzahl im Stapel: „▸ 3 Rezepte“ mit rezepte/menues
    kochereignisse: { one: 'cooked dish', other: 'cooked dishes' },
    stapelEinklappen: 'Collapse stack',
    stapelAusklappen: 'Expand stack',
    zeitleisteKeineMenues: 'No menus yet',
    zeitleisteKeineRezepte: 'No recipes yet',
    datumUnbekannt: 'Unknown date',
  },
  fr: {
    meinKochbuch: 'Mes recettes',
    zeitleiste: 'Chronologie',
    meinNetzwerk: 'Mon réseau',
    miseEnPlace: 'Ma mise en place',
    kuechenstars: 'Mes stars en cuisine',
    weinbegleitung: 'Accords mets-vins',
    verwaltung: 'Administration',
    kuechenbetrieb: 'Activité de la cuisine',
    eventplanung: 'Planification d’événements',
    rezepte: { one: 'recette', other: 'recettes' },
    menues: { one: 'menu', other: 'menus' },
    offeneAnfragen: { one: 'demande en attente', other: 'demandes en attente' },
    privateListen: { one: 'liste privée', other: 'listes privées' },
    weinstile: { one: 'style de vin', other: 'styles de vin' },
    quellen: { one: 'source', other: 'sources' },
    aufrufeHeute: { one: 'consultation aujourd’hui', other: 'consultations aujourd’hui' },
    events: { one: 'événement', other: 'événements' },
    keineAufrufe: 'Pas encore de consultations',
    kuecheAktion: 'Action cuisine',
    unbekanntesRezept: 'Recette inconnue',
    // Seite „Meine Küchenstars“, PR 6o
    kuechenstarsUntertitel: 'Voici tes 20 recettes les plus consultées ces 14 derniers jours.',
    kuechenstarsLeer: 'Aucune consultation de recette pour l’instant.',
    aufrufe: { one: 'consultation', other: 'consultations' },
    // Zeitleiste (RecipeTimeline.js), PR 6o; Anzahl im Stapel: „▸ 3 Rezepte“ mit rezepte/menues
    kochereignisse: { one: 'plat cuisiné', other: 'plats cuisinés' },
    stapelEinklappen: 'Replier la pile',
    stapelAusklappen: 'Déplier la pile',
    zeitleisteKeineMenues: 'Aucun menu pour l’instant',
    zeitleisteKeineRezepte: 'Aucune recette pour l’instant',
    datumUnbekannt: 'Date inconnue',
  },
};
