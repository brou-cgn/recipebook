/**
 * Texte des Tagesmenüs im Kochatelier (src/components/Tagesmenu.js) und seiner Filter (TagesmenuFilterOverlay.js).
 * Vorhaben Mehrsprachigkeit, PR 6n. Aufbau und Regeln: src/i18n/texte.js.
 *
 * Rezepttitel erscheinen übersetzt (useRezeptTitel), Kulinarik und Speisekategorien über die Listenwerte; Zutaten und
 * Schritte auf der Rückseite der Karte bleiben das Original, Listennamen und Autoren sind Inhalt.
 */
// Geschütztes Leerzeichen: im Französischen vor : ? ! ; und innerhalb von « ».
const NBSP = '\u00a0';

export default {
  de: {
    // Übersicht und Ergebnisse (Tagesmenu.js); der Seitentitel „Kochatelier“ kommt aus bereiche.js
    keineGemeinsamenKandidaten: 'Keine gemeinsamen Kandidaten in deinen Listen.',
    listeLeer: 'Diese Liste enthält noch keine Rezepte.',
    meineAuswahl: 'Meine Auswahl',
    gruppeKandidat: 'Kandidat',
    gruppeFuerSpaeter: 'Für später',
    gruppeArchiviert: 'Archiviert',
    archiv: 'Archiv',
    dauerhaftArchiviert: 'Dauerhaft archiviert',
    zutaten: 'Zutaten',
    zubereitung: 'Zubereitung',
    filterOeffnen: 'Filter öffnen',
    zumTagesmenue: 'Zum Tagesmenü',
    zurueckZumStapel: 'Zurück zum Swipestapel',
    // Menü einer Kachel; die deutschen Punkte bleiben im Code Kennung (TAGESMENU_KACHEL_MENU_ITEMS)
    kachelMenueOeffnen: 'Kachel-Kontextmenü öffnen',
    menuePrompt: 'Erzähl, wie war es?',
    menueEnttaeuscht: 'Ich bin enttäuscht',
    menueZweiteChance: 'Zweite Chance, bitte',
    menueMalWieder: 'Koche ich mal wieder',
    menueRegelmaessig: 'Koche ich regelmäßig',
    // Filter (TagesmenuFilterOverlay.js); Speisekategorien übersetzt aus den Listenwerten, Listennamen sind Inhalt
    kochatelierFiltern: 'Kochatelier filtern',
    filterAufheben: 'Filter aufheben',
    nachFiltern: 'Nach {name} filtern',
    listenfilterAufheben: 'Listenfilter aufheben',
    aktiveListe: 'Aktive Liste',
    zuWechseln: 'Zu {name} wechseln',
    keineListen: 'Keine Listen gefunden',
    listenDurchsuchenPlatzhalter: 'Listen durchsuchen …',
    listenDurchsuchen: 'Listen durchsuchen',
    sucheLoeschen: 'Suche löschen',
  },
  en: {
    // Übersicht und Ergebnisse (Tagesmenu.js); der Seitentitel „Kochatelier“ kommt aus bereiche.js
    keineGemeinsamenKandidaten: 'No shared candidates in your lists.',
    listeLeer: 'This list doesn’t contain any recipes yet.',
    meineAuswahl: 'My selection',
    gruppeKandidat: 'Candidate',
    gruppeFuerSpaeter: 'For later',
    gruppeArchiviert: 'Archived',
    archiv: 'Archive',
    dauerhaftArchiviert: 'Permanently archived',
    zutaten: 'Ingredients',
    zubereitung: 'Preparation',
    filterOeffnen: 'Open filters',
    zumTagesmenue: 'To the daily menu',
    zurueckZumStapel: 'Back to the swipe stack',
    // Menü einer Kachel; die deutschen Punkte bleiben im Code Kennung (TAGESMENU_KACHEL_MENU_ITEMS)
    kachelMenueOeffnen: 'Open tile menu',
    menuePrompt: 'Tell us, how was it?',
    menueEnttaeuscht: 'I’m disappointed',
    menueZweiteChance: 'Second chance, please',
    menueMalWieder: 'I’ll cook it again sometime',
    menueRegelmaessig: 'I cook it regularly',
    // Filter (TagesmenuFilterOverlay.js); Speisekategorien übersetzt aus den Listenwerten, Listennamen sind Inhalt
    kochatelierFiltern: 'Filter cooking studio',
    filterAufheben: 'Remove filter',
    nachFiltern: 'Filter by {name}',
    listenfilterAufheben: 'Remove list filter',
    aktiveListe: 'Active list',
    zuWechseln: 'Switch to {name}',
    keineListen: 'No lists found',
    listenDurchsuchenPlatzhalter: 'Search lists…',
    listenDurchsuchen: 'Search lists',
    sucheLoeschen: 'Clear search',
  },
  fr: {
    // Übersicht und Ergebnisse (Tagesmenu.js); der Seitentitel „Kochatelier“ kommt aus bereiche.js
    keineGemeinsamenKandidaten: 'Aucun candidat commun dans tes listes.',
    listeLeer: 'Cette liste ne contient encore aucune recette.',
    meineAuswahl: 'Ma sélection',
    gruppeKandidat: 'Candidat',
    gruppeFuerSpaeter: 'Pour plus tard',
    gruppeArchiviert: 'Archivé',
    archiv: 'Archive',
    dauerhaftArchiviert: 'Archivé définitivement',
    zutaten: 'Ingrédients',
    zubereitung: 'Préparation',
    filterOeffnen: 'Ouvrir les filtres',
    zumTagesmenue: 'Vers le menu du jour',
    zurueckZumStapel: 'Retour à la pile',
    // Menü einer Kachel; die deutschen Punkte bleiben im Code Kennung (TAGESMENU_KACHEL_MENU_ITEMS)
    kachelMenueOeffnen: 'Ouvrir le menu de la vignette',
    menuePrompt: `Raconte, c’était comment${NBSP}?`,
    menueEnttaeuscht: 'Ça m’a déçu',
    menueZweiteChance: 'Une deuxième chance, s’il te plaît',
    menueMalWieder: 'Je le referai un jour',
    menueRegelmaessig: 'Je le cuisine régulièrement',
    // Filter (TagesmenuFilterOverlay.js); Speisekategorien übersetzt aus den Listenwerten, Listennamen sind Inhalt
    kochatelierFiltern: 'Filtrer l’atelier cuisine',
    filterAufheben: 'Retirer le filtre',
    nachFiltern: 'Filtrer par {name}',
    listenfilterAufheben: 'Retirer le filtre de liste',
    aktiveListe: 'Liste active',
    zuWechseln: 'Passer à {name}',
    keineListen: 'Aucune liste trouvée',
    listenDurchsuchenPlatzhalter: 'Rechercher des listes…',
    listenDurchsuchen: 'Rechercher des listes',
    sucheLoeschen: 'Effacer la recherche',
  },
};
