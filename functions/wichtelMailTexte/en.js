/** Texte der Wichtel-Einladung auf Englisch. Aufbau und Platzhalter wie in de.js. */
module.exports = {
  north_pole: {
    betreff: "📜 A letter from the North Pole for {firstName}",
    anrede: "Hi {firstName},",
    intro: "the elves in the North Pole workshop have their hands full, and a very special order just came in: " +
      "{hostName} has invited you to the Secret Santa “{eventName}”. ❄️",
    introOhneHost: "the elves in the North Pole workshop have their hands full, and a very special order just " +
      "came in: You're taking part in the Secret Santa “{eventName}”. ❄️",
    erklaerung: "Your name is already sealed and waiting. Use your personal link to break the seal and find out " +
      "who you'll be Secret Santa for this year. Write your wish list and leave a few hints for the other " +
      "elves. The reindeer would be very grateful.",
    budget: "🎁 Budget: {budget}",
    knopf: "Break the seal",
    linkErsatz: "If the button gets stuck, this link will help:",
    geheim: "Top secret: this link is just for you. Not a word to the others!",
    gruss: "With sparkly greetings from the elves' workshop 🦌",
  },
  warm_casual: {
    betreff: "🎁 You're invited to a gift exchange, {firstName}!",
    anrede: "Hi {firstName},",
    intro: "great to have you on board! {hostName} has invited you to the gift exchange “{eventName}”.",
    introOhneHost: "great to have you on board! You're taking part in the gift exchange “{eventName}”.",
    erklaerung: "Use your personal link to draw a name and find out who you'll be giving a gift to. You can " +
      "also add your own wishes and leave gift ideas for the others.",
    budget: "Budget: {budget}",
    knopf: "Draw a name",
    linkErsatz: "If the button doesn't work, copy this link into your browser:",
    geheim: "This link is just for you, please don't share it.",
    gruss: "Have fun with the gift exchange!",
  },
  gemeinsam: {
    hinweis: "Note: {hinweis}",
    grund: "You're receiving this email because {hostName} signed you up for Secret Santa.",
    grundOhneHost: "You're receiving this email because you were signed up for Secret Santa.",
  },
};
