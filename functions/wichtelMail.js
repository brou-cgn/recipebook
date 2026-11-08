/**
 * Wichtel-Einladung per Mail: Betreff, Text und HTML in der Sprache des Gasts
 * (Feld `sprache` im Gästeprofil, siehe shared/sprachen.js). Reine Funktionen, damit
 * die Tests die Vorlagen ohne SMTP prüfen können; verschickt wird in wichteln.js.
 *
 * Alles, was der Organisator eingibt (Name, Titel, Budget, Hinweis, sein Vorname),
 * steht im HTML nur escaped. Budget und Hinweis erscheinen so, wie er sie geschrieben
 * hat – übersetzt werden nur die festen Texte.
 */

const {escapeHtml} = require('./shared/common');
const {normalisiereSprache} = require('./shared/sprachen');

// Französische Typografie: geschütztes Leerzeichen innerhalb « » und vor dem Doppelpunkt.
const NBSP = '\u00A0';

const VORLAGEN = {
  de: {
    betreff: (titel) => `Dein Wichtel-Link für „${titel}“`,
    anrede: (name) => `Hallo ${name},`,
    einladung: (titel, von) => (von ?
      `${von} hat dich zum Wichteln „${titel}“ eingeladen.` :
      `du bist beim Wichteln „${titel}“ dabei.`),
    erklaerung: 'Über deinen persönlichen Link ziehst du dein Los, trägst deine Wünsche ein und ' +
      'kannst Geschenkideen für die anderen hinterlassen.',
    budget: 'Budget:',
    hinweis: 'Hinweis:',
    knopf: 'Zum Wichteln',
    linkErsatz: 'Falls der Button nicht funktioniert, öffne diesen Link:',
    geheim: 'Bitte nicht weitergeben – der Link ist nur für dich.',
    grund: (von) => (von ?
      `Du bekommst diese Mail, weil ${von} dich zum Wichteln eingetragen hat.` :
      'Du bekommst diese Mail, weil du zum Wichteln eingetragen wurdest.'),
  },
  en: {
    betreff: (titel) => `Your Secret Santa link for “${titel}”`,
    anrede: (name) => `Hi ${name},`,
    einladung: (titel, von) => (von ?
      `${von} has invited you to the Secret Santa “${titel}”.` :
      `You’re taking part in the Secret Santa “${titel}”.`),
    erklaerung: 'With your personal link you can draw a name, add your wishes and leave gift ideas ' +
      'for the others.',
    budget: 'Budget:',
    hinweis: 'Note:',
    knopf: 'Open Secret Santa',
    linkErsatz: 'If the button doesn’t work, open this link:',
    geheim: 'Please don’t share it – this link is just for you.',
    grund: (von) => (von ?
      `You’re receiving this email because ${von} signed you up for Secret Santa.` :
      'You’re receiving this email because you were signed up for Secret Santa.'),
  },
  fr: {
    betreff: (titel) => `Ton lien pour le Père Noël secret «${NBSP}${titel}${NBSP}»`,
    anrede: (name) => `Bonjour ${name},`,
    einladung: (titel, von) => (von ?
      `${von} t’invite au Père Noël secret «${NBSP}${titel}${NBSP}».` :
      `Tu participes au Père Noël secret «${NBSP}${titel}${NBSP}».`),
    erklaerung: 'Avec ton lien personnel, tu tires au sort la personne à qui tu offriras un cadeau, ' +
      'tu notes tes souhaits et tu peux laisser des idées de cadeaux pour les autres.',
    budget: `Budget${NBSP}:`,
    hinweis: `Remarque${NBSP}:`,
    knopf: 'Accéder au Père Noël secret',
    linkErsatz: `Si le bouton ne fonctionne pas, ouvre ce lien${NBSP}:`,
    geheim: 'Merci de ne pas le partager – ce lien t’est réservé.',
    grund: (von) => (von ?
      `Tu reçois cet e-mail parce que ${von} a ajouté ton nom au Père Noël secret.` :
      'Tu reçois cet e-mail parce que ton nom a été ajouté au Père Noël secret.'),
  },
};

const ZAHLFORMAT = {de: 'de-DE', en: 'en-GB', fr: 'fr-FR'};

/**
 * Budget wie in der App (src/utils/formatBudget.js): ein reiner Betrag (optional mit €/EUR,
 * Komma oder Punkt) mit zwei Nachkommastellen und Euro, in der Schreibweise der Sprache
 * („20,00 €“, „€20.00“); alles andere (z. B. „ca. 20 bis 25 €“) bleibt, wie es ist.
 * @param {string} wert - Budget aus der Runde
 * @param {string} sprache - normalisierte Sprache
 * @return {string}
 */
function formatiereBudget(wert, sprache) {
  const text = String(wert ?? '').trim();
  const treffer = text.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?\s*(?:€|eur|euro)?$/i);
  if (!treffer) return text;
  const zahl = Number(`${treffer[1].replace(/\./g, '')}.${treffer[2] || '0'}`);
  return new Intl.NumberFormat(ZAHLFORMAT[sprache], {style: 'currency', currency: 'EUR'}).format(zahl);
}

/**
 * @param {{sprache?: string, name: string, titel: string, link: string, budget?: string,
 *   hinweis?: string, organisator?: string|null}} params - Teilnehmername, Rundendaten,
 *   persönlicher Link und (optional) Vorname des Organisators
 * @return {{subject: string, text: string, html: string}}
 */
function baueEinladungsMail({sprache, name, titel, link, budget = '', hinweis = '', organisator = null}) {
  const s = normalisiereSprache(sprache);
  const t = VORLAGEN[s];
  const von = organisator || null;
  const angaben = [
    budget ? [t.budget, formatiereBudget(budget, s)] : null,
    hinweis ? [t.hinweis, hinweis] : null,
  ].filter(Boolean);

  const text = [
    t.anrede(name),
    `${t.einladung(titel, von)} ${t.erklaerung}`,
    ...(angaben.length > 0 ? [angaben.map(([label, wert]) => `${label} ${wert}`).join('\n')] : []),
    link,
    t.geheim,
    `-- \n${t.grund(von)}`,
  ].join('\n\n');

  const e = escapeHtml;
  const absatz = 'margin:0 0 16px;';
  const leise = 'margin:0 0 16px;font-size:14px;color:#5f5f5f;';
  const html = [
    '<!DOCTYPE html>',
    `<html lang="${s}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(t.betreff(titel))}</title></head>`,
    '<body style="margin:0;padding:0;background:#f5f3ef;">',
    '<div style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:16px;line-height:1.5;color:#2b2b2b;">',
    '<div style="background:#ffffff;border-radius:12px;padding:24px;">',
    `<p style="${absatz}">${e(t.anrede(name))}</p>`,
    `<p style="${absatz}">${e(t.einladung(titel, von))} ${e(t.erklaerung)}</p>`,
    angaben.length > 0 ?
      `<p style="${absatz}">${angaben.map(([label, wert]) => `<strong>${e(label)}</strong> ${e(wert)}`).join('<br>')}</p>` :
      '',
    '<p style="margin:24px 0;">' +
      `<a href="${e(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2f5d50;` +
      `color:#ffffff;font-weight:bold;text-decoration:none;">${e(t.knopf)}</a></p>`,
    `<p style="${leise}">${e(t.linkErsatz)}<br>` +
      `<a href="${e(link)}" style="color:#2f5d50;word-break:break-all;">${e(link)}</a></p>`,
    `<p style="${leise}margin-bottom:0;">${e(t.geheim)}</p>`,
    '</div>',
    `<p style="margin:16px 0 0;font-size:12px;color:#7a7a7a;text-align:center;">${e(t.grund(von))}</p>`,
    '</div>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n');

  return {subject: t.betreff(titel), text, html};
}

module.exports = {baueEinladungsMail, _internal: {VORLAGEN, formatiereBudget}};
