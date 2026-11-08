const test = require('node:test');
const assert = require('node:assert/strict');
const {baueEinladungsMail, _internal} = require('./wichtelMail');
const {SPRACHEN} = require('./shared/sprachen');

const LINK = 'https://broubook.web.app/wichteln/AbCdEfGhIj0123456789/abcDEF123_-abcDEF123_-abcDEF1234';
const basis = {name: 'Anna', titel: 'Advent 2026', link: LINK, budget: '20 €', hinweis: 'Bescherung am 13.12.', organisator: 'Ben'};

test('jede Sprache aus shared/sprachen.js hat eine Vorlage', () => {
  assert.deepEqual(Object.keys(_internal.VORLAGEN).sort(), [...SPRACHEN].sort());
  const betreffs = SPRACHEN.map((sprache) => baueEinladungsMail({...basis, sprache}).subject);
  assert.equal(new Set(betreffs).size, SPRACHEN.length, 'jede Sprache hat ihren eigenen Betreff');
});

test('Deutsch: Anrede, Organisator, Titel, Budget, Hinweis und Link', () => {
  const mail = baueEinladungsMail({...basis, sprache: 'de'});
  assert.equal(mail.subject, 'Dein Wichtel-Link für „Advent 2026“');
  assert.match(mail.text, /^Hallo Anna,\n\nBen hat dich zum Wichteln „Advent 2026“ eingeladen\. Über deinen persönlichen Link/);
  assert.match(mail.text, /Budget: 20,00\s€\nHinweis: Bescherung am 13\.12\./);
  assert.ok(mail.text.includes(`\n\n${LINK}\n\n`), 'Link steht für sich in einer Zeile');
  assert.match(mail.text, /Bitte nicht weitergeben – der Link ist nur für dich\./);
  assert.match(mail.html, /<html lang="de">/);
  assert.ok(mail.html.includes(`href="${LINK}"`));
  assert.match(mail.html, />Zum Wichteln<\/a>/);
});

test('Englisch und Französisch', () => {
  const en = baueEinladungsMail({...basis, sprache: 'en'});
  assert.equal(en.subject, 'Your Secret Santa link for “Advent 2026”');
  assert.match(en.text, /^Hi Anna,\n\nBen has invited you to the Secret Santa “Advent 2026”\./);
  assert.match(en.text, /Note: Bescherung am 13\.12\./, 'Hinweis bleibt so, wie der Organisator ihn schrieb');
  assert.match(en.text, /Budget: €20\.00\n/);
  assert.match(en.html, /<html lang="en">/);
  assert.match(en.html, />Open Secret Santa<\/a>/);

  const fr = baueEinladungsMail({...basis, sprache: 'fr'});
  assert.equal(fr.subject, 'Ton lien pour le Père Noël secret «\u00A0Advent 2026\u00A0»');
  assert.match(fr.text, /^Bonjour Anna,\n\nBen t’invite au Père Noël secret «\u00A0Advent 2026\u00A0»\./);
  assert.match(fr.text, /Budget\u00A0: 20,00\s€\nRemarque\u00A0: Bescherung am 13\.12\./);
  assert.match(fr.html, /<html lang="fr">/);
});

test('ohne Organisator, Budget und Hinweis', () => {
  const de = baueEinladungsMail({name: 'Anna', titel: 'Advent', link: LINK, sprache: 'de'});
  assert.match(de.text, /^Hallo Anna,\n\ndu bist beim Wichteln „Advent“ dabei\./);
  assert.doesNotMatch(de.text, /Budget|Hinweis/);
  assert.doesNotMatch(de.html, /Budget|Hinweis/);
  assert.match(de.text, /weil du zum Wichteln eingetragen wurdest\./);

  const en = baueEinladungsMail({name: 'Anna', titel: 'Advent', link: LINK, sprache: 'en'});
  assert.match(en.text, /^Hi Anna,\n\nYou’re taking part in the Secret Santa “Advent”\./);
});

test('unbekannte oder fehlende Sprache: Deutsch', () => {
  const deutsch = baueEinladungsMail({...basis, sprache: 'de'});
  for (const sprache of [undefined, null, 'es', 'EN']) {
    assert.deepEqual(baueEinladungsMail({...basis, sprache}), deutsch);
  }
});

test('Eingaben des Organisators stehen im HTML nur escaped', () => {
  const boese = '<img src=x onerror=alert(1)>&"\'';
  const mail = baueEinladungsMail({
    sprache: 'de', name: boese, titel: boese, link: LINK, budget: boese, hinweis: boese, organisator: boese,
  });
  assert.ok(!mail.html.includes('<img'), 'kein rohes Tag aus Eingaben');
  assert.ok(mail.html.includes('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;'));
  // Im Text- und Betreffteil bleibt der Text, wie er ist (dort wird nichts gerendert).
  assert.ok(mail.text.includes(boese));
  assert.ok(mail.subject.includes(boese));
});

test('Budget wie in der App, in der Schreibweise der Sprache; Freitext bleibt', () => {
  const {formatiereBudget} = _internal;
  const ohneLeer = (text) => text.replace(/\s/gu, ' ');
  assert.equal(ohneLeer(formatiereBudget('20', 'de')), '20,00 €');
  assert.equal(ohneLeer(formatiereBudget('19,5 €', 'de')), '19,50 €');
  assert.equal(ohneLeer(formatiereBudget('1.000 EUR', 'de')), '1.000,00 €');
  assert.equal(formatiereBudget('20 €', 'en'), '€20.00');
  assert.equal(ohneLeer(formatiereBudget('20', 'fr')), '20,00 €');
  assert.equal(formatiereBudget('ca. 20 bis 25 €', 'en'), 'ca. 20 bis 25 €');
  assert.equal(formatiereBudget('  ', 'de'), '');
});
