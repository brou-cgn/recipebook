/**
 * Texte der Wichtel-Einladung auf Deutsch. Platzhalter: {firstName}, {hostName}, {eventName},
 * {budget}, {link}, {hinweis}. Zwei Varianten (siehe wichtelMail.js): north_pole (Weihnachten,
 * Nikolaus) und warm_casual (alle anderen Anlässe). `introOhneHost` gilt, wenn der Organisator
 * keinen Vornamen hinterlegt hat.
 */
module.exports = {
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
};
