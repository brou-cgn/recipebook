/**
 * Wichtel-Einladung per Mail: Betreff, Text und HTML. Reine Funktionen, damit die Tests die
 * Vorlagen ohne SMTP prüfen können; verschickt wird in wichteln.js.
 *
 * Zwei Varianten, gewählt nur nach dem Anlass der Runde: north_pole („Post vom Nordpol“) für
 * Weihnachten und Nikolaus, warm_casual für alles andere. Die Sprache kommt aus dem Gästeprofil
 * (shared/sprachen.js, Fallback Deutsch). Die Texte stehen in wichtelMailTexte/<sprache>.js.
 *
 * Alles, was der Organisator eingibt (Name, Titel, Budget, Hinweis, sein Vorname), steht im
 * HTML nur escaped. Budget und Hinweis erscheinen so, wie er sie geschrieben hat; das Budget
 * wird bei einem reinen Betrag in der Schreibweise der Sprache formatiert.
 */

const {escapeHtml} = require('./shared/common');
const {normalisiereSprache} = require('./shared/sprachen');

const TEXTE = {
  de: require('./wichtelMailTexte/de'),
  en: require('./wichtelMailTexte/en'),
  fr: require('./wichtelMailTexte/fr'),
};

// Anlässe mit der Nordpol-Variante; alles andere (auch ohne Anlass) bekommt warm_casual.
const NORDPOL_ANLAESSE = new Set(['weihnachten', 'nikolaus']);

const ZAHLFORMAT = {de: 'de-DE', en: 'en-GB', fr: 'fr-FR'};

/**
 * @param {*} anlass - Anlass-Schlüssel der Runde
 * @return {'north_pole'|'warm_casual'}
 */
function waehleVariante(anlass) {
  return NORDPOL_ANLAESSE.has(anlass) ? 'north_pole' : 'warm_casual';
}

/**
 * Nur der Vorname: der erste Teil des Namens, den der Organisator eingetragen hat.
 * @param {string} name - Teilnehmername („Anna Muster“)
 * @return {string}
 */
function ersterVorname(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || '';
}

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
 * Ersetzt {name}-Platzhalter in einem Textbaustein in einem Durchgang (Werte werden nicht
 * erneut durchsucht). Für HTML wird Vorlage und Wert escaped. Unbekannte Platzhalter bleiben
 * stehen; der Test „kein {…} übrig“ fängt sie.
 * @param {string} vorlage - Textbaustein
 * @param {object} werte - Platzhalter → Wert
 * @param {boolean} html - HTML-escapen
 * @return {string}
 */
function fuelle(vorlage, werte, html) {
  const e = html ? escapeHtml : (s) => s;
  return e(vorlage).replace(/\{(\w+)\}/g, (treffer, key) => (key in werte ? e(String(werte[key])) : treffer));
}

/**
 * @param {{sprache?: string, anlass?: string, name: string, titel: string, link: string,
 *   budget?: string, hinweis?: string, organisator?: string|null}} params - Teilnehmername,
 *   Rundendaten, persönlicher Link und (optional) Vorname des Organisators
 * @return {{subject: string, text: string, html: string}}
 */
function baueEinladungsMail({sprache, anlass, name, titel, link, budget = '', hinweis = '', organisator = null}) {
  const s = normalisiereSprache(sprache);
  const variante = waehleVariante(anlass);
  const t = TEXTE[s][variante];
  const gemeinsam = TEXTE[s].gemeinsam;
  const von = organisator || null;
  const werte = {
    firstName: ersterVorname(name),
    hostName: von || '',
    eventName: titel,
    budget: formatiereBudget(budget, s),
    hinweis,
    link,
  };
  const budgetZeile = werte.budget ? t.budget : null;
  const hinweisZeile = hinweis ? gemeinsam.hinweis : null;
  const intro = von ? t.intro : t.introOhneHost;
  const grund = von ? gemeinsam.grund : gemeinsam.grundOhneHost;

  const betreff = fuelle(t.betreff, werte, false).replace(/[\r\n]+/g, ' ');
  const text = [
    fuelle(t.anrede, werte, false),
    fuelle(intro, werte, false),
    fuelle(t.erklaerung, werte, false),
    ...(budgetZeile ? [fuelle(budgetZeile, werte, false)] : []),
    ...(hinweisZeile ? [fuelle(hinweisZeile, werte, false)] : []),
    `${fuelle(t.linkErsatz, werte, false)}\n${link}`,
    fuelle(t.geheim, werte, false),
    fuelle(t.gruss, werte, false),
    `-- \n${fuelle(grund, werte, false)}`,
  ].join('\n\n');

  const h = (vorlage) => fuelle(vorlage, werte, true);
  const e = escapeHtml;
  const absatz = 'margin:0 0 16px;';
  const leise = 'margin:0 0 16px;font-size:14px;color:#5f5f5f;';
  const html = [
    '<!DOCTYPE html>',
    `<html lang="${s}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${h(t.betreff)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f5f3ef;">',
    '<div style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:16px;line-height:1.5;color:#2b2b2b;">',
    '<div style="background:#ffffff;border-radius:12px;padding:24px;">',
    `<p style="${absatz}">${h(t.anrede)}</p>`,
    `<p style="${absatz}">${h(intro)}</p>`,
    `<p style="${absatz}">${h(t.erklaerung)}</p>`,
    budgetZeile ? `<p style="${absatz}"><strong>${h(budgetZeile)}</strong></p>` : '',
    hinweisZeile ? `<p style="${leise}">${h(hinweisZeile)}</p>` : '',
    '<p style="margin:24px 0;">' +
      `<a href="${e(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#2f5d50;` +
      `color:#ffffff;font-weight:bold;text-decoration:none;">${h(t.knopf)}</a></p>`,
    `<p style="${leise}">${h(t.linkErsatz)}<br>` +
      `<a href="${e(link)}" style="color:#2f5d50;word-break:break-all;">${e(link)}</a></p>`,
    `<p style="${leise}">${h(t.geheim)}</p>`,
    `<p style="${absatz}margin-bottom:0;">${h(t.gruss)}</p>`,
    '</div>',
    `<p style="margin:16px 0 0;font-size:12px;color:#7a7a7a;text-align:center;">${h(grund)}</p>`,
    '</div>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n');

  return {subject: betreff, text, html};
}

module.exports = {baueEinladungsMail, _internal: {TEXTE, waehleVariante, ersterVorname, formatiereBudget, fuelle}};
