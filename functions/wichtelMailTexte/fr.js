/**
 * Texte der Wichtel-Mails auf Französisch. Aufbau, Varianten und Platzhalter wie in de.js.
 * Typografie: geschütztes Leerzeichen (U+00A0) vor Doppelpunkt, Ausrufe- und Fragezeichen
 * sowie innerhalb der Guillemets.
 */
module.exports = {
  einladung: {
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
  },

  neuigkeiten: {
    north_pole: {
      betreff: "📜 De nouveaux indices du pôle Nord pour {firstName}",
      anrede: "Bonjour {firstName},",
      intro: "du courrier tout frais vient d'arriver à l'atelier des lutins pour ta mission au Père Noël " +
        "secret « {eventName} ». ❄️",
      nurWuensche: "La personne que tu gâtes en secret a ajouté {wuensche} à sa lettre au Père Noël.",
      nurIdeen: "Les autres lutins t'ont envoyé {ideen} pour la personne que tu gâtes en secret.",
      beides: "La personne que tu gâtes en secret a ajouté {wuensche} à sa lettre au Père Noël, et les autres " +
        "lutins t'ont envoyé {ideen}.",
      aufruf: "Prends un bon chocolat chaud et jette un œil : le cadeau parfait s'y cache peut-être.",
      budget: "🎁 Budget : {budget}",
      knopf: "Voir les indices",
      gekauftFrage: "Tu as déjà ton cadeau ? Préviens l'atelier : ensuite, les lutins ne t'enverront plus " +
        "d'indices.",
      knopfGekauft: "J'ai le cadeau",
      linkErsatz: "Si les boutons se coincent, ces liens t'aideront :",
      geheim: "Top secret : ce message est rien que pour toi. Pas un mot à la personne que tu gâtes !",
      gruss: "Avec des salutations scintillantes de l'atelier des lutins 🦌",
      grund: "Tu reçois cet e-mail parce que tu as tiré un nom au Père Noël secret « {eventName} » (un au " +
        "maximum par jour). Dès que tu marques ton cadeau comme acheté, ils s'arrêtent.",
    },
    warm_casual: {
      betreff: "🎁 Du nouveau pour ton échange de cadeaux, {firstName} !",
      anrede: "Bonjour {firstName},",
      intro: "il y a du nouveau dans l'échange de cadeaux « {eventName} ».",
      nurWuensche: "La personne à qui tu offres un cadeau a ajouté {wuensche}.",
      nurIdeen: "Le groupe a laissé {ideen} pour la personne à qui tu offres un cadeau.",
      beides: "La personne à qui tu offres un cadeau a ajouté {wuensche}, et le groupe a laissé {ideen}.",
      aufruf: "Jette un œil, le cadeau idéal s'y trouve peut-être.",
      budget: "Budget : {budget}",
      knopf: "Voir les souhaits et idées",
      gekauftFrage: "Tu as déjà un cadeau ? Marque-le comme acheté : ensuite, tu ne recevras plus d'e-mails " +
        "sur les nouveautés.",
      knopfGekauft: "Cadeau acheté",
      linkErsatz: "Si les boutons ne fonctionnent pas, copie le lien correspondant dans ton navigateur :",
      geheim: "Ce lien est rien que pour toi, merci de ne pas le partager.",
      gruss: "Bonne chasse au cadeau !",
      grund: "Tu reçois cet e-mail parce que tu as tiré un nom dans l'échange de cadeaux « {eventName} » " +
        "(un au maximum par jour). Dès que tu marques ton cadeau comme acheté, ils s'arrêtent.",
    },
    gemeinsam: {
      anzahl: {
        wunsch: {eins: "un nouveau souhait", mehrere: "{anzahl} nouveaux souhaits"},
        idee: {eins: "une nouvelle idée cadeau", mehrere: "{anzahl} nouvelles idées cadeaux"},
      },
      linkZeile: "{label} : {link}",
      hinweis: "Remarque : {hinweis}",
    },
  },
};
