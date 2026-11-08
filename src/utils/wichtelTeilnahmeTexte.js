/**
 * Texte der Wichtel-Teilnehmerseite (persönlicher Link, WichtelTeilnahmePage) auf
 * Deutsch, Englisch und Französisch.
 *
 * Welche Sprache gilt:
 *  1. die Sprachpräferenz aus dem Gästeprofil, mit dem der Organisator den Teilnehmer
 *     verknüpft hat (`ich.sprache` aus der Callable wichtelTeilnahme; Profile ohne Feld
 *     liefert der Server als Deutsch),
 *  2. sonst – beim Laden, bei einem ungültigen Link, ohne verknüpftes Profil – die
 *     Browsersprache, wenn sie eine der drei ist,
 *  3. sonst Deutsch.
 *
 * Platzhalter wie {name} füllt fuelleText. Alle Sprachen haben dieselben Schlüssel und
 * keine Platzhalter, die es im Deutschen nicht gibt (wichtelTeilnahmeTexte.test.js).
 */
import { getCallableErrorDetails } from './callableErrors';

export const STANDARD_SPRACHE = 'de';

// Geschütztes Leerzeichen: im Französischen vor : ? ! und innerhalb von « ».
const NBSP = ' ';

const TEXTE = {
  de: {
    laden: 'Dein Wichtel-Los wird geholt …',
    ungueltigTitel: 'Link ungültig',
    ungueltigText: 'Dieser Wichtel-Link funktioniert nicht (mehr). Vielleicht wurde er nicht vollständig kopiert, oder die Runde wurde gelöscht. Frag am besten den Organisator nach deinem Link.',
    fehlerTitel: 'Das hat nicht geklappt',
    nochmal: 'Nochmal versuchen',
    ueberzeile: 'Wichteln',
    gruss: 'Hallo {name}!',
    budget: 'Budget: {budget}',
    losTitel: 'Dein Los',
    losUeberzeile: 'Du beschenkst',
    losNochNichtAusgelost: 'Noch nicht ausgelost. Sobald es so weit ist, ziehst du hier dein Los. Deine Wünsche und Ideen für andere kannst du schon jetzt eintragen.',
    losBereit: 'Dein Los liegt bereit. Nur du siehst, wen du ziehst.',
    losGezogen: 'Du beschenkst {name}. Psst – das bleibt unter uns.',
    losZiehen: 'Los ziehen',
    losWirdGezogen: 'Wird gezogen …',
    fuer: 'Für {name}',
    wuenscheVon: 'Wünsche von {name}',
    keineWuensche: '{name} hat noch keine Wünsche eingetragen.',
    ideenAnderer: 'Ideen von anderen Gästen',
    keineIdeen: 'Noch keine Ideen von anderen.',
    vonDir: 'von dir',
    von: 'von {name}',
    vonGast: 'von einem Gast',
    privatPartner: 'Nur du siehst diese Wünsche und Ideen.',
    meineWuensche: 'Deine Wünsche',
    privatWuensche: 'Sieht nur, wer dich gezogen hat.',
    wunschLabel: 'Wunsch hinzufügen',
    wunschPlatzhalter: 'Was wünschst du dir?',
    hinzufuegen: 'Hinzufügen',
    wunschEntfernen: 'Wunsch „{text}“ entfernen',
    wunschEntfernt: 'Wunsch entfernt.',
    ideenTitel: 'Geschenkideen für andere',
    ideenText: 'Du weißt, worüber sich jemand freuen würde? Deine Idee sieht nur, wer diese Person gezogen hat – mit deinem Namen, die Person selbst nie.',
    ideeLabel: 'Geschenkidee',
    ideePlatzhalter: 'Deine Idee',
    speichern: 'Speichern',
    fuerWen: 'Für wen?',
    gastWaehlen: 'Gast wählen',
    ideeEntfernen: 'Idee „{text}“ entfernen',
    ideeEntfernt: 'Idee entfernt.',
    linkPlatzhalter: 'Link (optional)',
    wunschLinkLabel: 'Link zum Wunsch (optional)',
    ideeLinkLabel: 'Link zur Geschenkidee (optional)',
    speichert: 'Speichert …',
    neuerTab: '(öffnet in neuem Tab)',
    eintrag: 'Eintrag',
    rueckgaengig: 'Rückgängig',
    zurApp: 'Zur App',
    fehlerAllgemein: 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es noch einmal.',
    fehlerGeaendert: 'Das hat nicht geklappt: Die Runde wurde inzwischen geändert oder gelöscht. Bitte lade die Seite neu.',
    fehlerKeinLos: 'Für dich liegt gerade kein Los bereit. Vielleicht wurde die Auslosung zurückgesetzt – lade die Seite neu oder frag den Organisator.',
    fehlerZuViele: 'Du hast schon die Höchstzahl an Einträgen. Lösche zuerst einen.',
    fehlerLinkUngueltig: 'Der Link sieht nicht gültig aus. Bitte füge die ganze Adresse ein, z. B. https://…',
  },
  en: {
    laden: 'Getting your Secret Santa draw…',
    ungueltigTitel: 'Invalid link',
    ungueltigText: 'This Secret Santa link doesn’t work (anymore). Maybe it wasn’t copied completely, or this Secret Santa was deleted. Best ask the organizer for your link.',
    fehlerTitel: 'Something went wrong',
    nochmal: 'Try again',
    ueberzeile: 'Secret Santa',
    gruss: 'Hi {name}!',
    budget: 'Budget: {budget}',
    losTitel: 'Your draw',
    losUeberzeile: 'You’re gifting',
    losNochNichtAusgelost: 'Names haven’t been drawn yet. Once it’s time, you’ll draw yours here. You can already add your wishes and ideas for others.',
    losBereit: 'Your slip is ready. Only you will see who you draw.',
    losGezogen: 'You’re gifting {name}. Shh – that stays between us.',
    losZiehen: 'Draw a name',
    losWirdGezogen: 'Drawing…',
    fuer: 'For {name}',
    wuenscheVon: '{name}’s wishes',
    keineWuensche: '{name} hasn’t added any wishes yet.',
    ideenAnderer: 'Ideas from other guests',
    keineIdeen: 'No ideas from others yet.',
    vonDir: 'from you',
    von: 'from {name}',
    vonGast: 'from a guest',
    privatPartner: 'Only you can see these wishes and ideas.',
    meineWuensche: 'Your wishes',
    privatWuensche: 'Only the person who draws you can see them.',
    wunschLabel: 'Add a wish',
    wunschPlatzhalter: 'What would you like?',
    hinzufuegen: 'Add',
    wunschEntfernen: 'Remove wish “{text}”',
    wunschEntfernt: 'Wish removed.',
    ideenTitel: 'Gift ideas for others',
    ideenText: 'Know what someone would love? Only their Secret Santa sees your idea – with your name, never the person themselves.',
    ideeLabel: 'Gift idea',
    ideePlatzhalter: 'Your idea',
    speichern: 'Save',
    fuerWen: 'For whom?',
    gastWaehlen: 'Choose a guest',
    ideeEntfernen: 'Remove idea “{text}”',
    ideeEntfernt: 'Idea removed.',
    linkPlatzhalter: 'Link (optional)',
    wunschLinkLabel: 'Link for the wish (optional)',
    ideeLinkLabel: 'Link for the gift idea (optional)',
    speichert: 'Saving …',
    neuerTab: '(opens in a new tab)',
    eintrag: 'entry',
    rueckgaengig: 'Undo',
    zurApp: 'Back to the app',
    fehlerAllgemein: 'That didn’t work. Please check your connection and try again.',
    fehlerGeaendert: 'That didn’t work: this Secret Santa was changed or deleted in the meantime. Please reload the page.',
    fehlerKeinLos: 'There’s no slip ready for you right now. Maybe the draw was reset – reload the page or ask the organizer.',
    fehlerZuViele: 'You’ve reached the maximum number of entries. Delete one first.',
    fehlerLinkUngueltig: 'That link doesn’t look valid. Please paste the full address, e.g. https://…',
  },
  fr: {
    laden: 'Chargement de ton tirage…',
    ungueltigTitel: 'Lien invalide',
    ungueltigText: 'Ce lien Secret Santa ne fonctionne pas (ou plus). Il n’a peut-être pas été copié en entier, ou ce Secret Santa a été supprimé. Le mieux est de demander ton lien à l’organisateur.',
    fehlerTitel: 'Ça n’a pas marché',
    nochmal: 'Réessayer',
    ueberzeile: 'Secret Santa',
    gruss: `Bonjour {name}${NBSP}!`,
    budget: `Budget${NBSP}: {budget}`,
    losTitel: 'Ton tirage',
    losUeberzeile: 'Tu offres à',
    losNochNichtAusgelost: 'Le tirage n’a pas encore eu lieu. Dès qu’il sera fait, tu tireras ton papier ici. Tu peux déjà noter tes souhaits et tes idées pour les autres.',
    losBereit: 'Ton papier t’attend. Personne d’autre que toi ne verra qui tu tires.',
    losGezogen: 'Tu offres un cadeau à {name}. Chut – ça reste entre nous.',
    losZiehen: 'Tirer au sort',
    losWirdGezogen: 'Tirage en cours…',
    fuer: 'Pour {name}',
    // Ohne Namen: „de“ müsste vor Vokalen zu „d’“ werden (d’Anna).
    wuenscheVon: 'Ses souhaits',
    keineWuensche: '{name} n’a pas encore noté de souhaits.',
    ideenAnderer: 'Idées des autres invités',
    keineIdeen: 'Pas encore d’idées des autres.',
    vonDir: 'par toi',
    von: 'par {name}',
    vonGast: 'par un invité',
    privatPartner: 'Ces souhaits et idées ne sont visibles que pour toi.',
    meineWuensche: 'Tes souhaits',
    privatWuensche: 'Seule la personne qui te tire au sort les voit.',
    wunschLabel: 'Ajouter un souhait',
    wunschPlatzhalter: `Que souhaites-tu${NBSP}?`,
    hinzufuegen: 'Ajouter',
    wunschEntfernen: `Supprimer le souhait «${NBSP}{text}${NBSP}»`,
    wunschEntfernt: 'Souhait supprimé.',
    ideenTitel: 'Idées cadeaux pour les autres',
    ideenText: `Tu sais ce qui ferait plaisir à quelqu’un${NBSP}? Seul son Secret Santa verra ton idée, avec ton nom – jamais la personne elle-même.`,
    ideeLabel: 'Idée cadeau',
    ideePlatzhalter: 'Ton idée',
    speichern: 'Enregistrer',
    fuerWen: `Pour qui${NBSP}?`,
    gastWaehlen: 'Choisir un invité',
    ideeEntfernen: `Supprimer l’idée «${NBSP}{text}${NBSP}»`,
    ideeEntfernt: 'Idée supprimée.',
    linkPlatzhalter: 'Lien (facultatif)',
    wunschLinkLabel: 'Lien pour le souhait (facultatif)',
    ideeLinkLabel: 'Lien pour l’idée cadeau (facultatif)',
    speichert: 'Enregistrement …',
    neuerTab: '(s’ouvre dans un nouvel onglet)',
    eintrag: 'entrée',
    rueckgaengig: 'Annuler',
    zurApp: 'Retour à l’application',
    fehlerAllgemein: 'Ça n’a pas marché. Vérifie ta connexion et réessaie.',
    fehlerGeaendert: `Ça n’a pas marché${NBSP}: ce Secret Santa a été modifié ou supprimé entre-temps. Recharge la page.`,
    fehlerKeinLos: 'Aucun papier ne t’attend pour le moment. Le tirage a peut-être été réinitialisé – recharge la page ou demande à l’organisateur.',
    fehlerZuViele: 'Tu as atteint le nombre maximal d’entrées. Supprimes-en une d’abord.',
    fehlerLinkUngueltig: `Ce lien ne semble pas valide. Colle l’adresse complète, par ex. https://…`,
  },
};

/** Sprachen der Teilnehmerseite, Deutsch zuerst. */
export const WICHTEL_SPRACHEN = Object.keys(TEXTE);

const istWichtelSprache = (sprache) => Object.prototype.hasOwnProperty.call(TEXTE, sprache);

/**
 * Erste Sprache aus den Browser-Einstellungen, die die Seite kann.
 * @param {{languages?: string[], language?: string}} [nav]
 * @returns {string|null}
 */
export function browserSprache(nav = typeof navigator === 'undefined' ? undefined : navigator) {
  const tags = [...(nav?.languages || []), nav?.language];
  for (const tag of tags) {
    const code = typeof tag === 'string' ? tag.toLowerCase().split('-')[0] : '';
    if (istWichtelSprache(code)) return code;
  }
  return null;
}

/**
 * Sprache der Seite: Präferenz aus dem Gästeprofil, sonst Browsersprache, sonst Deutsch.
 * Eine unbekannte Präferenz (z. B. eine später ergänzte Sprache ohne Texte hier) gilt
 * wie ein Profil ohne Wahl als Deutsch.
 * @param {string|null|undefined} serverSprache - `ich.sprache` aus der Antwort
 * @param {object} [nav] - navigator (Tests)
 * @returns {string}
 */
export function waehleWichtelSprache(serverSprache, nav) {
  if (typeof serverSprache === 'string' && serverSprache) {
    return istWichtelSprache(serverSprache) ? serverSprache : STANDARD_SPRACHE;
  }
  return browserSprache(nav) || STANDARD_SPRACHE;
}

/** @returns {Object<string, string>} die Texte einer Sprache (unbekannt: Deutsch) */
export function wichtelTexte(sprache) {
  return TEXTE[istWichtelSprache(sprache) ? sprache : STANDARD_SPRACHE];
}

/**
 * Setzt Werte in die Platzhalter eines Textes ein ('Hallo {name}!').
 * Sind alle Werte Text, kommt ein String zurück; sonst (etwa ein fett gesetzter Name als
 * React-Element) eine Liste, die React direkt rendert – das Element braucht dann einen key.
 * @param {string} text
 * @param {Object<string, *>} [werte]
 * @returns {string|Array}
 */
export function fuelleText(text, werte = {}) {
  const teile = text.split(/\{(\w+)\}/).map((teil, i) => {
    if (i % 2 === 0) return teil;
    return Object.prototype.hasOwnProperty.call(werte, teil) ? (werte[teil] ?? '') : `{${teil}}`;
  });
  const nurText = teile.every((teil) => typeof teil === 'string' || typeof teil === 'number');
  return nurText ? teile.join('') : teile.filter((teil) => teil !== '');
}

/**
 * Schlüssel der Fehlermeldung für die Teilnehmerseite. Die Meldungen des Servers sind
 * deutsch; übersetzt wird nach Code und Aktion (siehe TEILNAHME in functions/wichteln.js).
 * @param {Error & {code?: string}} error
 * @param {'laden'|'ziehen'|'eintragHinzufuegen'|'eintragLoeschen'} aktion
 * @returns {string} Schlüssel in wichtelTexte()
 */
export function wichtelFehlerSchluessel(error, aktion) {
  const { code } = getCallableErrorDetails(error);
  // Runde gelöscht, Teilnehmer entfernt oder der gewählte Gast nicht mehr dabei
  if (code === 'not-found') return 'fehlerGeaendert';
  if (code === 'failed-precondition' && aktion === 'ziehen') return 'fehlerKeinLos';
  if (code === 'resource-exhausted' && aktion === 'eintragHinzufuegen') return 'fehlerZuViele';
  // Vom Formular aus kann nur der Link ungültig sein (leere Einträge verhindert es selbst).
  if (code === 'invalid-argument' && aktion === 'eintragHinzufuegen') return 'fehlerLinkUngueltig';
  return 'fehlerAllgemein';
}
