/**
 * Texte der Wichtel-Mails auf Englisch. Aufbau, Varianten und Platzhalter wie in de.js.
 */
module.exports = {
  einladung: {
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
  },

  neuigkeiten: {
    north_pole: {
      betreff: "📜 New clues from the North Pole for {firstName}",
      anrede: "Hi {firstName},",
      intro: "fresh mail for your secret mission in the Secret Santa “{eventName}” just arrived at the " +
        "elves' workshop. ❄️",
      nurWuensche: "Your giftee has added {wuensche} to their letter to Santa.",
      nurIdeen: "The other elves have sent you {ideen} for your giftee.",
      beides: "Your giftee has added {wuensche} to their letter to Santa, and the other elves have sent you " +
        "{ideen}.",
      aufruf: "Grab a mug of cocoa and have a look – the perfect gift might be in there.",
      budget: "🎁 Budget: {budget}",
      knopf: "View the clues",
      gekauftFrage: "Already got the gift? Let the workshop know – the elves won't send you any more clues " +
        "after that.",
      knopfGekauft: "I've got the gift",
      linkErsatz: "If the buttons get stuck, these links will help:",
      geheim: "Top secret: this mail is just for you. Not a word to your giftee!",
      gruss: "With sparkly greetings from the elves' workshop 🦌",
      grund: "You're receiving this email because you drew a name in the Secret Santa “{eventName}” (at most " +
        "one a day). Once you mark your gift as bought, they'll stop.",
    },
    warm_casual: {
      betreff: "🎁 There's news on your gift exchange, {firstName}",
      anrede: "Hi {firstName},",
      intro: "there's news in the gift exchange “{eventName}”.",
      nurWuensche: "The person you're giving a gift to has added {wuensche}.",
      nurIdeen: "The group has left {ideen} for the person you're giving a gift to.",
      beides: "The person you're giving a gift to has added {wuensche}, and the group has left {ideen}.",
      aufruf: "Have a look – maybe the perfect gift is right there.",
      budget: "Budget: {budget}",
      knopf: "See wishes and ideas",
      gekauftFrage: "Already got a gift? Mark it as bought – after that, you won't get any more update emails.",
      knopfGekauft: "Gift bought",
      linkErsatz: "If the buttons don't work, copy the matching link into your browser:",
      geheim: "This link is just for you, please don't share it.",
      gruss: "Happy gift hunting!",
      grund: "You're receiving this email because you drew a name in the gift exchange “{eventName}” (at " +
        "most one a day). Once you mark your gift as bought, they'll stop.",
    },
    gemeinsam: {
      anzahl: {
        wunsch: {eins: "a new wish", mehrere: "{anzahl} new wishes"},
        idee: {eins: "a new gift idea", mehrere: "{anzahl} new gift ideas"},
      },
      linkZeile: "{label}: {link}",
      hinweis: "Note: {hinweis}",
    },
  },
};
