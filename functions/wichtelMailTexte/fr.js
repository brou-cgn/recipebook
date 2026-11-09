/**
 * Texte der Wichtel-Einladung auf Französisch. Aufbau und Platzhalter wie in de.js.
 * Typografie: geschütztes Leerzeichen (Escape U+00A0) vor Doppelpunkt, Ausrufe- und Fragezeichen
 * sowie innerhalb der Guillemets.
 */
module.exports = {
  north_pole: {
    betreff: "📜 Une lettre du pôle Nord pour {firstName}",
    anrede: "Bonjour {firstName},",
    intro: "les lutins de l'atelier du pôle Nord sont débordés, et une commande toute spéciale vient " +
      "d'arriver : {hostName} t'invite au Père Noël secret « {eventName} ». ❄️",
    introOhneHost: "les lutins de l'atelier du pôle Nord sont débordés, et une commande toute spéciale vient " +
      "d'arriver : tu participes au Père Noël secret « {eventName} ». ❄️",
    erklaerung: "Ton tirage t'attend déjà, bien scellé. Avec ton lien personnel, brise le sceau et découvre " +
      "pour qui tu seras le Père Noël secret cette année. Écris ta liste de souhaits et laisse quelques " +
      "indices aux autres lutins. Les rennes t'en seront très reconnaissants.",
    budget: "🎁 Budget : {budget}",
    knopf: "Briser le sceau",
    linkErsatz: "Si le bouton se coince, ce lien t'aidera :",
    geheim: "Top secret : ce lien est rien que pour toi. Pas un mot aux autres !",
    gruss: "Avec des salutations scintillantes de l'atelier des lutins 🦌",
  },
  warm_casual: {
    betreff: "🎁 Une invitation à un échange de cadeaux pour toi, {firstName} !",
    anrede: "Bonjour {firstName},",
    intro: "super que tu sois de la partie ! {hostName} t'invite à l'échange de cadeaux " +
      "« {eventName} ».",
    introOhneHost: "super que tu sois de la partie ! Tu participes à l'échange de cadeaux " +
      "« {eventName} ».",
    erklaerung: "Avec ton lien personnel, tu tires au sort la personne à qui tu offriras un cadeau. Tu peux " +
      "aussi indiquer tes souhaits et laisser des idées de cadeaux pour les autres.",
    budget: "Budget : {budget}",
    knopf: "Tirer au sort",
    linkErsatz: "Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :",
    geheim: "Ce lien est rien que pour toi, merci de ne pas le partager.",
    gruss: "Amuse-toi bien !",
  },
  gemeinsam: {
    hinweis: "Remarque : {hinweis}",
    grund: "Tu reçois cet e-mail parce que {hostName} a ajouté ton nom au Père Noël secret.",
    grundOhneHost: "Tu reçois cet e-mail parce que ton nom a été ajouté au Père Noël secret.",
  },
};
