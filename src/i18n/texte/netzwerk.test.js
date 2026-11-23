import fs from 'fs';
import path from 'path';
import netzwerkTexte, { FOLGEN_MELDUNGEN } from './netzwerk';
import gruppenTexte, { EINLADUNG_MELDUNGEN } from './gruppen';

// Die deutschen Meldungen der Functions werden beim Anzeigen erkannt (erkannterText); sie müssen deshalb
// genau so im Code stehen (Mehrsprachigkeit PR 6s).
const quelle = (...teile) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'functions', ...teile), 'utf8');

const kennt = (woerterbuch, schluesselListe, code) => {
  schluesselListe.forEach((schluessel) => {
    woerterbuch.de[schluessel].split(/\{\w+\}/).filter((teil) => teil.trim()).forEach((teil) => {
      expect({ schluessel, gefunden: code.includes(teil) }).toEqual({ schluessel, gefunden: true });
    });
  });
};

describe('Meldungen der Functions', () => {
  it('Folgen: wie in functions/follow.js', () => {
    kennt(netzwerkTexte, FOLGEN_MELDUNGEN, quelle('follow.js'));
  });

  it('Einladungen: wie in functions/handlers/admin.js und functions/groupInvitations.js', () => {
    kennt(gruppenTexte, EINLADUNG_MELDUNGEN, quelle('handlers', 'admin.js') + quelle('groupInvitations.js'));
  });
});
