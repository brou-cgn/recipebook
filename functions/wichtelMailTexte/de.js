/**
 * Texte der Wichtel-Mails auf Deutsch, je Mail in zwei Varianten (siehe wichtelMail.js):
 * north_pole (Weihnachten, Nikolaus) und warm_casual (alle anderen Anlässe).
 *
 * einladung: persönlicher Link zum Los. Platzhalter: {firstName}, {hostName}, {eventName},
 *   {budget}, {link}, {hinweis}. `introOhneHost` gilt, wenn der Organisator keinen Vornamen
 *   hinterlegt hat.
 *
 * neuigkeiten: an den Schenker, wenn sein Empfänger Wünsche oder andere Gäste Ideen für ihn
 *   eingetragen haben. Nennt den Empfänger bewusst nicht (Vorschau auf dem Sperrbildschirm,
 *   geteiltes Postfach) und keine Inhalte der Einträge, nur ihre Anzahl. Platzhalter:
 *   {firstName}, {eventName}, {budget}, {hinweis}, {wuensche} und {ideen} (aus `anzahl`).
 *   Je nachdem, was neu ist, gilt `nurWuensche`, `nurIdeen` oder `beides`.
 *
 * erinnerung: an einen Gast, der noch keine Wünsche eingetragen hat. Gilt vor und nach dem
 *   Auslosen gleich und nennt niemanden aus der Runde. Platzhalter: {firstName}, {eventName},
 *   {budget}, {hinweis}.
 */
module.exports = {
  einladung: {
    north_pole: {
      betreff: "📜 Ein Brief vom Nordpol für {firstName}",
      anrede: "Hallo {firstName},",
      intro: "die Wichtel in der Werkstatt am Nordpol haben alle Hände voll zu tun, und gerade ist ein ganz " +
        "besonderer Auftrag eingetroffen: {hostName} hat dich zum Wichteln „{eventName}“ eingeladen. ❄️",
      introOhneHost: "die Wichtel in der Werkstatt am Nordpol haben alle Hände voll zu tun, und gerade ist ein ganz " +
        "besonderer Auftrag eingetroffen: Du bist beim Wichteln „{eventName}“ dabei. ❄️",
      erklaerung: "Dein Los liegt schon versiegelt bereit. Mit deinem persönlichen Link brichst du das Siegel und " +
        "erfährst, für wen du in diesem Jahr Weihnachtswichtel sein darfst. Schreib deinen Wunschzettel und " +
        "hinterlasse den anderen Wichteln ein paar Hinweise. Die Rentiere wären dir sehr dankbar.",
      budget: "🎁 Budget: {budget}",
      knopf: "Siegel brechen",
      linkErsatz: "Falls der Button klemmt, hilft dieser Link:",
      geheim: "Streng geheim: Dieser Link ist nur für dich. Kein Wort zu den anderen!",
      gruss: "Mit glitzernden Grüßen aus der Wichtelwerkstatt 🦌",
    },
    warm_casual: {
      betreff: "🎁 Du bist zum Wichteln eingeladen, {firstName}!",
      anrede: "Hallo {firstName},",
      intro: "schön, dass du dabei bist! {hostName} hat dich zum Wichteln „{eventName}“ eingeladen.",
      introOhneHost: "schön, dass du dabei bist! Du bist beim Wichteln „{eventName}“ dabei.",
      erklaerung: "Über deinen persönlichen Link ziehst du dein Los und erfährst, wen du beschenken darfst. " +
        "Außerdem kannst du deine Wünsche eintragen und Geschenkideen für die anderen hinterlassen.",
      budget: "Budget: {budget}",
      knopf: "Los ziehen",
      linkErsatz: "Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:",
      geheim: "Der Link gehört nur dir, bitte gib ihn nicht weiter.",
      gruss: "Viel Spaß beim Wichteln!",
    },
    // Dezente Zeilen für beide Varianten
    gemeinsam: {
      hinweis: "Hinweis: {hinweis}",
      grund: "Du bekommst diese Mail, weil {hostName} dich zum Wichteln eingetragen hat.",
      grundOhneHost: "Du bekommst diese Mail, weil du zum Wichteln eingetragen wurdest.",
    },
  },

  neuigkeiten: {
    north_pole: {
      betreff: "📜 Neue Hinweise vom Nordpol für {firstName}",
      anrede: "Hallo {firstName},",
      intro: "in der Wichtelwerkstatt ist frische Post für deinen geheimen Auftrag beim Wichteln " +
        "„{eventName}“ eingetroffen. ❄️",
      nurWuensche: "Dein Schützling hat {wuensche} auf den Wunschzettel geschrieben.",
      nurIdeen: "Aus der Wichtelrunde gibt es {ideen} für deinen Schützling.",
      beides: "Dein Schützling hat {wuensche} auf den Wunschzettel geschrieben, und aus der Wichtelrunde " +
        "gibt es {ideen}.",
      aufruf: "Schnapp dir einen Becher Kakao und schau nach – vielleicht ist genau das Richtige dabei.",
      budget: "🎁 Budget: {budget}",
      knopf: "Hinweise ansehen",
      gekauftFrage: "Ist dein Geschenk schon besorgt? Dann gib der Werkstatt Bescheid – danach schicken dir " +
        "die Wichtel keine weiteren Hinweise.",
      knopfGekauft: "Geschenk ist besorgt",
      linkErsatz: "Falls die Buttons klemmen, helfen diese Links:",
      geheim: "Streng geheim: Auch diese Post ist nur für dich. Kein Wort zu deinem Schützling!",
      gruss: "Mit glitzernden Grüßen aus der Wichtelwerkstatt 🦌",
      grund: "Du bekommst diese Mail, weil du beim Wichteln „{eventName}“ dein Los gezogen hast (höchstens " +
        "eine am Tag). Sobald du dein Geschenk als gekauft markierst, kommt keine mehr.",
    },
    warm_casual: {
      betreff: "🎁 Neuigkeiten für dein Wichtelgeschenk, {firstName}",
      anrede: "Hallo {firstName},",
      intro: "es gibt Neuigkeiten beim Wichteln „{eventName}“.",
      nurWuensche: "Die Person, die du beschenkst, hat {wuensche} eingetragen.",
      nurIdeen: "Für die Person, die du beschenkst, gibt es {ideen} aus der Runde.",
      beides: "Die Person, die du beschenkst, hat {wuensche} eingetragen, und aus der Runde gibt es {ideen}.",
      aufruf: "Schau gern rein – vielleicht ist genau das Richtige dabei.",
      budget: "Budget: {budget}",
      knopf: "Wünsche und Ideen ansehen",
      gekauftFrage: "Hast du schon ein Geschenk? Dann markiere es als gekauft – danach bekommst du keine " +
        "Neuigkeiten mehr per Mail.",
      knopfGekauft: "Geschenk gekauft",
      linkErsatz: "Falls die Buttons nicht funktionieren, kopiere den passenden Link in deinen Browser:",
      geheim: "Der Link gehört nur dir, bitte gib ihn nicht weiter.",
      gruss: "Viel Spaß beim Aussuchen!",
      grund: "Du bekommst diese Mail, weil du beim Wichteln „{eventName}“ dein Los gezogen hast (höchstens " +
        "eine am Tag). Sobald du dein Geschenk als gekauft markierst, kommt keine mehr.",
    },
    gemeinsam: {
      // Die Wunsch-Formen stehen im Akkusativ („hat einen neuen Wunsch eingetragen“).
      anzahl: {
        wunsch: {eins: "einen neuen Wunsch", mehrere: "{anzahl} neue Wünsche"},
        idee: {eins: "eine neue Geschenkidee", mehrere: "{anzahl} neue Geschenkideen"},
      },
      // Fallback-Zeile je Button: Beschriftung und Link
      linkZeile: "{label}: {link}",
      hinweis: "Hinweis: {hinweis}",
    },
  },

  erinnerung: {
    north_pole: {
      betreff: "📜 Die Wichtel warten auf deinen Wunschzettel, {firstName}",
      anrede: "Hallo {firstName},",
      intro: "in der Wichtelwerkstatt am Nordpol stapeln sich schon die Wunschzettel – nur deiner fürs " +
        "Wichteln „{eventName}“ fehlt noch. ❄️",
      erklaerung: "Schreib ein paar Wünsche auf, damit dein Wichtel das passende Geschenk für dich findet. " +
        "Ein Stichwort oder ein Link zum Shop genügt schon. Die Rentiere scharren bereits mit den Hufen.",
      budget: "🎁 Budget: {budget}",
      knopf: "Wunschzettel schreiben",
      linkErsatz: "Falls der Button klemmt, hilft dieser Link:",
      geheim: "Streng geheim: Dieser Link ist nur für dich. Kein Wort zu den anderen!",
      gruss: "Mit glitzernden Grüßen aus der Wichtelwerkstatt 🦌",
      grund: "Du bekommst diese Mail, weil du beim Wichteln „{eventName}“ dabei bist und noch keine Wünsche " +
        "eingetragen hast. Sobald du einen Wunsch einträgst, kommt keine Erinnerung mehr.",
    },
    warm_casual: {
      betreff: "🎁 Noch keine Wünsche eingetragen, {firstName}?",
      anrede: "Hallo {firstName},",
      intro: "kleine Erinnerung zum Wichteln „{eventName}“: Du hast noch keine Wünsche eingetragen.",
      erklaerung: "Mit ein paar Wünschen findet die Person, die dich beschenkt, viel leichter etwas Passendes. " +
        "Ein Stichwort oder ein Link zum Shop genügt schon.",
      budget: "Budget: {budget}",
      knopf: "Wünsche eintragen",
      linkErsatz: "Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:",
      geheim: "Der Link gehört nur dir, bitte gib ihn nicht weiter.",
      gruss: "Viel Spaß beim Wünschen!",
      grund: "Du bekommst diese Mail, weil du beim Wichteln „{eventName}“ dabei bist und noch keine Wünsche " +
        "eingetragen hast. Sobald du einen Wunsch einträgst, kommt keine Erinnerung mehr.",
    },
    gemeinsam: {
      hinweis: "Hinweis: {hinweis}",
    },
  },
};
