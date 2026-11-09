const test = require('node:test');
const assert = require('node:assert/strict');
const {baueEinladungsMail, _internal} = require('./wichtelMail');
const {SPRACHEN} = require('./shared/sprachen');

const LINK = 'https://broubook.web.app/wichteln/AbCdEfGhIj0123456789/abcDEF123_-abcDEF123_-abcDEF1234';
const basis = {name: 'Anna Muster', titel: 'Advent 2026', link: LINK, budget: '50', hinweis: 'Bescherung am 13.12.', organisator: 'Ben'};
const NBSP = ' ';
const VARIANTEN = {north_pole: 'weihnachten', warm_casual: 'geburtstag'};

// Betreff und erster Satz je Variante und Sprache, wörtlich aus der Vorgabe.
const ERWARTET = {
  north_pole: {
    de: {betreff: '📜 Ein Brief vom Nordpol für Anna', text: /^Hallo Anna,\n\ndie Wichtel in der Werkstatt am Nordpol haben alle Hände voll zu tun, und gerade ist ein ganz besonderer Auftrag eingetroffen: Ben hat dich zum Wichteln „Advent 2026“ eingeladen\. ❄️\n\n/, knopf: 'Siegel brechen', budget: 'Budget: 50,00 €'},
    en: {betreff: '📜 A letter from the North Pole for Anna', text: /^Hi Anna,\n\nthe elves in the North Pole workshop have their hands full, and a very special order just came in: Ben has invited you to the Secret Santa “Advent 2026”\. ❄️\n\n/, knopf: 'Break the seal', budget: 'Budget: €50.00'},
    fr: {betreff: '📜 Une lettre du pôle Nord pour Anna', text: new RegExp(`^Bonjour Anna,\\n\\nles lutins de l'atelier du pôle Nord sont débordés, et une commande toute spéciale vient d'arriver${NBSP}: Ben t'invite au Père Noël secret «${NBSP}Advent 2026${NBSP}»\\. ❄️\\n\\n`), knopf: 'Briser le sceau', budget: `Budget${NBSP}: 50,00`},
  },
  warm_casual: {
    de: {betreff: '🎁 Du bist zum Wichteln eingeladen, Anna!', text: /^Hallo Anna,\n\nschön, dass du dabei bist! Ben hat dich zum Wichteln „Advent 2026“ eingeladen\.\n\n/, knopf: 'Los ziehen', budget: 'Budget: 50,00 €'},
    en: {betreff: '🎁 You\'re invited to a gift exchange, Anna!', text: /^Hi Anna,\n\ngreat to have you on board! Ben has invited you to the gift exchange “Advent 2026”\.\n\n/, knopf: 'Draw a name', budget: 'Budget: €50.00'},
    fr: {betreff: `🎁 Une invitation à un échange de cadeaux pour toi, Anna${NBSP}!`, text: new RegExp(`^Bonjour Anna,\\n\\nsuper que tu sois de la partie${NBSP}! Ben t'invite à l'échange de cadeaux «${NBSP}Advent 2026${NBSP}»\\.\\n\\n`), knopf: 'Tirer au sort', budget: `Budget${NBSP}: 50,00`},
  },
};

for (const [variante, anlass] of Object.entries(VARIANTEN)) {
  for (const sprache of SPRACHEN) {
    test(`${variante} / ${sprache}: Betreff, Text, Button, Budget und Link`, () => {
      const soll = ERWARTET[variante][sprache];
      const mail = baueEinladungsMail({...basis, anlass, sprache});
      assert.equal(mail.subject, soll.betreff);
      assert.match(mail.text, soll.text);
      assert.ok(mail.text.includes(soll.budget.replace(/\s/gu, ' ')) || mail.text.replace(/\s/gu, ' ').includes(soll.budget.replace(/\s/gu, ' ')), `Budgetzeile ${soll.budget}`);
      assert.ok(mail.text.includes(`:\n${LINK}\n`), 'Link steht als Fallback in einer eigenen Zeile');
      assert.match(mail.html, new RegExp(`<html lang="${sprache}">`));
      assert.match(mail.html, new RegExp(`href="${LINK}"[^>]*>${soll.knopf}</a>`), 'Button mit demselben Ziel');
      assert.ok(mail.html.includes(`>${LINK}</a>`), 'Link auch als Text');
    });
  }
}

test('Variante richtet sich nur nach dem Anlass', () => {
  const {waehleVariante} = _internal;
  assert.equal(waehleVariante('weihnachten'), 'north_pole');
  assert.equal(waehleVariante('nikolaus'), 'north_pole');
  for (const anlass of ['silvester', 'ostern', 'geburtstag', 'hochzeit', 'jubilaeum', 'firmenfeier', 'sommerfest', 'abschied', 'einweihung', 'sonstiges', '', undefined, null, 'Quatsch']) {
    assert.equal(waehleVariante(anlass), 'warm_casual', String(anlass));
  }
  assert.match(baueEinladungsMail({...basis, anlass: 'nikolaus', sprache: 'de'}).subject, /Nordpol/);
  assert.doesNotMatch(baueEinladungsMail({...basis, sprache: 'de'}).subject, /Nordpol/, 'ohne Anlass: warm_casual');
});

test('jede Sprache aus shared/sprachen.js hat beide Varianten', () => {
  assert.deepEqual(Object.keys(_internal.TEXTE).sort(), [...SPRACHEN].sort());
  for (const sprache of SPRACHEN) {
    assert.deepEqual(Object.keys(_internal.TEXTE[sprache]).sort(), ['gemeinsam', 'north_pole', 'warm_casual']);
    assert.deepEqual(Object.keys(_internal.TEXTE[sprache].north_pole).sort(), Object.keys(_internal.TEXTE.de.north_pole).sort());
    assert.deepEqual(Object.keys(_internal.TEXTE[sprache].warm_casual).sort(), Object.keys(_internal.TEXTE.de.warm_casual).sort());
  }
});

test('unbekannte oder fehlende Sprache: Deutsch', () => {
  for (const anlass of ['weihnachten', 'geburtstag']) {
    const deutsch = baueEinladungsMail({...basis, anlass, sprache: 'de'});
    for (const sprache of [undefined, null, '', 'es', 'EN', 'fr-FR']) {
      assert.deepEqual(baueEinladungsMail({...basis, anlass, sprache}), deutsch, `${anlass} / ${sprache}`);
    }
  }
});

test('nach dem Rendern bleibt kein {…}-Platzhalter übrig (auch ohne Organisator, Budget, Hinweis)', () => {
  for (const anlass of Object.values(VARIANTEN)) {
    for (const sprache of SPRACHEN) {
      for (const extra of [{}, {organisator: null, budget: '', hinweis: ''}]) {
        const mail = baueEinladungsMail({...basis, ...extra, anlass, sprache});
        for (const teil of [mail.subject, mail.text, mail.html]) {
          assert.doesNotMatch(teil, /\{[^}]*\}/u, `${anlass} / ${sprache}`);
        }
      }
    }
  }
});

test('ohne Organisator und Budget: neutrale Einladung, keine Budgetzeile', () => {
  const mail = baueEinladungsMail({name: 'Anna', titel: 'Advent', link: LINK, sprache: 'de', anlass: 'geburtstag'});
  assert.match(mail.text, /^Hallo Anna,\n\nschön, dass du dabei bist! Du bist beim Wichteln „Advent“ dabei\./);
  assert.doesNotMatch(mail.text, /Budget|Hinweis/);
  assert.doesNotMatch(mail.html, /Budget|Hinweis/);
  assert.match(mail.text, /weil du zum Wichteln eingetragen wurdest\./);
});

test('Hinweis und Footer stehen dezent in kleiner grauer Schrift', () => {
  const mail = baueEinladungsMail({...basis, sprache: 'de', anlass: 'geburtstag'});
  assert.match(mail.text, /Hinweis: Bescherung am 13\.12\./);
  assert.match(mail.html, /<p style="[^"]*font-size:14px;color:#5f5f5f;">Hinweis: Bescherung am 13\.12\.<\/p>/);
  assert.match(mail.html, /font-size:12px;color:#7a7a7a;[^>]*>Du bekommst diese Mail, weil Ben dich zum Wichteln eingetragen hat\./);
});

test('nur der Vorname des Empfängers', () => {
  const {ersterVorname} = _internal;
  assert.equal(ersterVorname('Anna Muster'), 'Anna');
  assert.equal(ersterVorname('  Anna-Lena   von Muster '), 'Anna-Lena');
  assert.equal(ersterVorname('Dana'), 'Dana');
  assert.equal(ersterVorname(''), '');
  assert.equal(ersterVorname(undefined), '');
  assert.match(baueEinladungsMail({...basis, sprache: 'en'}).text, /^Hi Anna,\n/);
});

test('Französisch: geschütztes Leerzeichen vor : ! ? und in « »', () => {
  const schlecht = [/\S [:!?]/u, /« /u, /«[^\u00A0]/u, / »/u, /[^\u00A0]»/u];
  const texte = [];
  for (const block of Object.values(_internal.TEXTE.fr)) texte.push(...Object.values(block));
  for (const anlass of Object.values(VARIANTEN)) {
    const mail = baueEinladungsMail({...basis, sprache: 'fr', anlass});
    texte.push(mail.subject, mail.text, mail.html);
    assert.ok(mail.text.includes(`«${NBSP}Advent 2026${NBSP}»`));
  }
  for (const text of texte) {
    for (const muster of schlecht) assert.doesNotMatch(text, muster, `${muster}: ${text.slice(0, 60)}`);
  }
});

test('Eingaben des Organisators stehen im HTML nur escaped', () => {
  const boese = '<script>alert(1)</script>&"\'';
  for (const anlass of Object.values(VARIANTEN)) {
    const mail = baueEinladungsMail({
      sprache: 'de', anlass, name: `${boese} Muster`, titel: boese, link: LINK, budget: boese, hinweis: boese, organisator: boese,
    });
    assert.ok(!mail.html.includes('<script'), 'kein rohes Tag aus Eingaben');
    assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;'));
    // Im Text- und Betreffteil bleibt der Text, wie er ist (dort wird nichts gerendert).
    assert.ok(mail.text.includes(boese));
  }
  const rundenname = baueEinladungsMail({...basis, sprache: 'de', anlass: 'weihnachten', titel: '<script>x</script>'});
  assert.ok(!rundenname.html.includes('<script>'));
  assert.ok(rundenname.html.includes('&lt;script&gt;x&lt;/script&gt;'));
});

test('Werte mit {…} werden nicht ein zweites Mal ersetzt', () => {
  const mail = baueEinladungsMail({...basis, sprache: 'de', anlass: 'geburtstag', titel: '{link}', organisator: '{firstName}'});
  assert.ok(mail.text.includes('„{link}“'));
  assert.ok(mail.text.includes('{firstName} hat dich'));
});

test('Betreff ist einzeilig, auch bei Zeilenumbruch im Namen', () => {
  const mail = baueEinladungsMail({...basis, name: 'Anna\r\nBcc: x@example.com', sprache: 'de'});
  assert.doesNotMatch(mail.subject, /[\r\n]/);
});

test('Budget wie in der App, in der Schreibweise der Sprache; Freitext bleibt', () => {
  const {formatiereBudget} = _internal;
  const ohneLeer = (text) => text.replace(/\s/gu, ' ');
  assert.equal(ohneLeer(formatiereBudget('20', 'de')), '20,00 €');
  assert.equal(ohneLeer(formatiereBudget('19,5 €', 'de')), '19,50 €');
  assert.equal(ohneLeer(formatiereBudget('1.000 EUR', 'de')), '1.000,00 €');
  assert.equal(formatiereBudget('20 €', 'en'), '€20.00');
  assert.equal(ohneLeer(formatiereBudget('50', 'fr')), '50,00 €');
  assert.equal(formatiereBudget('ca. 20 bis 25 €', 'en'), 'ca. 20 bis 25 €');
  assert.equal(formatiereBudget('  ', 'de'), '');
});
