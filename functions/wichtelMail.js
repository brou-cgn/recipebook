/**
 * Wichtel-Mails: Betreff, Text und HTML. Reine Funktionen, damit die Tests die Vorlagen ohne
 * SMTP prüfen können; verschickt wird in wichteln.js.
 *  - Einladung (baueEinladungsMail): persönlicher Link zum Los, beim Eintragen eines Gasts.
 *  - Neuigkeiten (baueNeuigkeitenMail): an den Schenker, wenn sein Empfänger neue Wünsche oder
 *    andere Gäste neue Ideen für ihn eingetragen haben; mit Button „Geschenk gekauft“.
 *  - Erinnerung (baueErinnerungsMail): an einen Gast, der noch keine Wünsche eingetragen hat;
 *    gleicher Aufbau wie die Einladung (baueLinkMail).
 *
 * Zwei Varianten je Mail, gewählt nur nach dem Anlass der Runde: north_pole („Post vom Nordpol“)
 * für Weihnachten und Nikolaus, warm_casual für alles andere. Die Sprache kommt aus dem
 * Gästeprofil (shared/sprachen.js, Fallback Deutsch). Die Texte stehen in
 * wichtelMailTexte/<sprache>.js. Auch der Anzeigename des Absenders hängt von Variante und
 * Sprache ab (`absenderName` im Ergebnis); die Adresse dahinter bleibt SMTP_FROM.
 *
 * Alles, was der Organisator eingibt (Name, Titel, Budget, Hinweis, sein Vorname), steht im
 * HTML nur escaped. Budget und Hinweis erscheinen so, wie er sie geschrieben hat; das Budget
 * wird bei einem reinen Betrag in der Schreibweise der Sprache formatiert, das Datum der Feier
 * immer ausgeschrieben („Sonntag, 13. Dezember 2026“).
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

// Inline-Styles: Mail-Clients ignorieren Stylesheets weitgehend.
const STIL = {
  absatz: 'margin:0 0 16px;',
  leise: 'margin:0 0 16px;font-size:14px;color:#5f5f5f;',
  knopf: 'display:inline-block;padding:12px 22px;border-radius:8px;background:#2f5d50;' +
    'color:#ffffff;font-weight:bold;text-decoration:none;',
  knopfZweit: 'display:inline-block;padding:10px 20px;border-radius:8px;border:2px solid #2f5d50;' +
    'background:#ffffff;color:#2f5d50;font-weight:bold;text-decoration:none;',
  link: 'color:#2f5d50;word-break:break-all;',
};

/**
 * @param {*} anlass - Anlass-Schlüssel der Runde
 * @return {'north_pole'|'warm_casual'}
 */
function waehleVariante(anlass) {
  return NORDPOL_ANLAESSE.has(anlass) ? 'north_pole' : 'warm_casual';
}

/**
 * Anzeigename des Absenders („Wichtelpost vom Nordpol“), je Variante und Sprache.
 * @param {string} sprache - normalisierte Sprache
 * @param {*} anlass - Anlass-Schlüssel der Runde
 * @return {string}
 */
function absenderName(sprache, anlass) {
  return TEXTE[sprache].absender[waehleVariante(anlass)];
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
 * Datum der Feier ausgeschrieben in der Schreibweise der Sprache („Sonntag, 13. Dezember 2026“,
 * „Sunday 13 December 2026“, „dimanche 13 décembre 2026“). Ohne Datum (oder mit einem, das kein
 * Kalendertag 'JJJJ-MM-TT' ist) ''.
 * @param {string} datum - Datum der Runde
 * @param {string} sprache - normalisierte Sprache
 * @return {string}
 */
function formatiereDatum(datum, sprache) {
  const treffer = String(datum ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!treffer) return '';
  const [jahr, monat, tag] = treffer.slice(1).map(Number);
  return new Intl.DateTimeFormat(ZAHLFORMAT[sprache], {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(jahr, monat - 1, tag)));
}

/**
 * Datum der Feier und Budget: je eine fett gesetzte Zeile in einem Absatz; fehlt beides, nichts.
 * @param {object} t - Textbausteine der Variante (datum, budget)
 * @param {object} werte - Platzhalter (datum und budget schon formatiert)
 * @return {string[]} Bausteine, leer ohne Datum und Budget
 */
function eckdatenZeilen(t, werte) {
  return [werte.datum ? t.datum : null, werte.budget ? t.budget : null].filter(Boolean);
}

/**
 * Ersetzt {name}-Platzhalter in einem Textbaustein in einem Durchgang (Werte werden nicht
 * erneut durchsucht). Für HTML wird Vorlage und Wert escaped; Werte aus `roh` sind schon
 * fertiges HTML (z. B. ein Link) und werden unverändert eingesetzt. Unbekannte Platzhalter
 * bleiben stehen; der Test „kein {…} übrig“ fängt sie.
 * @param {string} vorlage - Textbaustein
 * @param {object} werte - Platzhalter → Wert
 * @param {boolean} html - HTML-escapen
 * @param {object} [roh] - Platzhalter → fertiges HTML (nur mit html)
 * @return {string}
 */
function fuelle(vorlage, werte, html, roh = {}) {
  const e = html ? escapeHtml : (s) => s;
  return e(vorlage).replace(/\{(\w+)\}/g, (treffer, key) => {
    if (html && key in roh) return roh[key];
    return key in werte ? e(String(werte[key])) : treffer;
  });
}

/** @return {string} Absatz mit fertigem HTML-Inhalt */
function absatz(inhalt, stil = STIL.absatz) {
  return `<p style="${stil}">${inhalt}</p>`;
}

/** @return {string} Link als Button (Ziel escaped, Beschriftung schon fertiges HTML) */
function knopf(link, beschriftung, stil = STIL.knopf) {
  return `<a href="${escapeHtml(link)}" style="${stil}">${beschriftung}</a>`;
}

/** @return {string} Link, der seine Adresse zeigt (Fallback unter den Buttons) */
function sichtbarerLink(link) {
  return `<a href="${escapeHtml(link)}" style="${STIL.link}">${escapeHtml(link)}</a>`;
}

/**
 * Rahmen jeder Wichtel-Mail: weiße Karte mit dem Inhalt, darunter klein und grau der Grund.
 * @param {{sprache: string, titel: string, inhalt: string[], fuss: string}} teile - fertiges
 *   HTML; leere Einträge in `inhalt` entfallen
 * @return {string}
 */
function htmlRahmen({sprache, titel, inhalt, fuss}) {
  return [
    '<!DOCTYPE html>',
    `<html lang="${sprache}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titel}</title></head>`,
    '<body style="margin:0;padding:0;background:#f5f3ef;">',
    '<div style="max-width:520px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:16px;line-height:1.5;color:#2b2b2b;">',
    '<div style="background:#ffffff;border-radius:12px;padding:24px;">',
    ...inhalt,
    '</div>',
    `<p style="margin:16px 0 0;font-size:12px;color:#7a7a7a;text-align:center;">${fuss}</p>`,
    '</div>',
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n');
}

/** Betreff einzeilig: ein Zeilenumbruch aus einer Eingabe darf keine Kopfzeile anfangen. */
function einzeilig(text) {
  return text.replace(/[\r\n]+/g, ' ');
}

/**
 * Mail mit einem Button zum persönlichen Link (Einladung, Erinnerung): Anrede, Einleitung,
 * Erklärung, optional Budget und Hinweis, Button mit Fallback-Link, Geheim-Zeile und Gruß;
 * darunter klein der Grund.
 * @param {{sprache: string, t: object, werte: object, link: string, intro: string,
 *   grund: string, hinweisZeile: string|null}} teile - normalisierte Sprache, Textbausteine der
 *   Variante (betreff, anrede, erklaerung, datum, budget, knopf, linkErsatz, geheim, gruss), Werte
 *   der Platzhalter, schon gewählte Bausteine für Einleitung und Grund; ohne Datum oder Budget
 *   entfällt die Zeile, ohne `hinweisZeile` die Hinweiszeile
 * @return {{subject: string, text: string, html: string}}
 */
function baueLinkMail({sprache, t, werte, link, intro, grund, hinweisZeile}) {
  const eckdaten = eckdatenZeilen(t, werte);

  const text = [
    fuelle(t.anrede, werte, false),
    fuelle(intro, werte, false),
    fuelle(t.erklaerung, werte, false),
    ...(eckdaten.length ? [eckdaten.map((zeile) => fuelle(zeile, werte, false)).join('\n')] : []),
    ...(hinweisZeile ? [fuelle(hinweisZeile, werte, false)] : []),
    `${fuelle(t.linkErsatz, werte, false)}\n${link}`,
    fuelle(t.geheim, werte, false),
    fuelle(t.gruss, werte, false),
    `-- \n${fuelle(grund, werte, false)}`,
  ].join('\n\n');

  const h = (vorlage) => fuelle(vorlage, werte, true);
  const html = htmlRahmen({
    sprache,
    titel: h(t.betreff),
    inhalt: [
      absatz(h(t.anrede)),
      absatz(h(intro)),
      absatz(h(t.erklaerung)),
      eckdaten.length ? absatz(eckdaten.map((zeile) => `<strong>${h(zeile)}</strong>`).join('<br>')) : '',
      hinweisZeile ? absatz(h(hinweisZeile), STIL.leise) : '',
      absatz(knopf(link, h(t.knopf)), 'margin:24px 0;'),
      absatz(`${h(t.linkErsatz)}<br>${sichtbarerLink(link)}`, STIL.leise),
      absatz(h(t.geheim), STIL.leise),
      absatz(h(t.gruss), `${STIL.absatz}margin-bottom:0;`),
    ],
    fuss: h(grund),
  });

  return {subject: einzeilig(fuelle(t.betreff, werte, false)), text, html};
}

/**
 * @param {{sprache?: string, anlass?: string, name: string, titel: string, link: string,
 *   budget?: string, hinweis?: string, datum?: string, organisator?: string|null}} params -
 *   Teilnehmername, Rundendaten (datum: Tag der Feier 'JJJJ-MM-TT' oder ''), persönlicher Link und
 *   (optional) Vorname des Organisators
 * @return {{subject: string, text: string, html: string, absenderName: string}}
 */
function baueEinladungsMail({
  sprache, anlass, name, titel, link, budget = '', hinweis = '', datum = '', organisator = null,
}) {
  const s = normalisiereSprache(sprache);
  const texte = TEXTE[s].einladung;
  const t = texte[waehleVariante(anlass)];
  const gemeinsam = texte.gemeinsam;
  const von = organisator || null;
  const mail = baueLinkMail({
    sprache: s,
    t,
    werte: {
      firstName: ersterVorname(name),
      hostName: von || '',
      eventName: titel,
      budget: formatiereBudget(budget, s),
      datum: formatiereDatum(datum, s),
      hinweis,
      link,
    },
    link,
    intro: von ? t.intro : t.introOhneHost,
    grund: von ? gemeinsam.grund : gemeinsam.grundOhneHost,
    hinweisZeile: hinweis ? gemeinsam.hinweis : null,
  });
  return {...mail, absenderName: absenderName(s, anlass)};
}

/**
 * Erinnerung an einen Gast, der noch keine Wünsche eingetragen hat. Gleicher Text vor und nach
 * dem Auslosen; nennt niemanden aus der Runde, auch nicht, wer schon Wünsche hat.
 * @param {{sprache?: string, anlass?: string, name: string, titel: string, link: string,
 *   budget?: string, hinweis?: string, datum?: string}} params - Teilnehmername, Rundendaten
 *   (datum wie bei der Einladung) und persönlicher Link
 * @return {{subject: string, text: string, html: string, absenderName: string}}
 */
function baueErinnerungsMail({sprache, anlass, name, titel, link, budget = '', hinweis = '', datum = ''}) {
  const s = normalisiereSprache(sprache);
  const texte = TEXTE[s].erinnerung;
  const t = texte[waehleVariante(anlass)];
  const mail = baueLinkMail({
    sprache: s,
    t,
    werte: {
      firstName: ersterVorname(name),
      eventName: titel,
      budget: formatiereBudget(budget, s),
      datum: formatiereDatum(datum, s),
      hinweis,
    },
    link,
    intro: t.intro,
    grund: t.grund,
    hinweisZeile: hinweis ? texte.gemeinsam.hinweis : null,
  });
  return {...mail, absenderName: absenderName(s, anlass)};
}

/**
 * Neuigkeiten für den Schenker: wie viele Wünsche sein Empfänger und wie viele Ideen andere
 * Gäste seit der letzten Mail eingetragen haben. Den Empfänger nennt die Mail nicht, auch
 * keine Inhalte; beides steht hinter dem persönlichen Link.
 * @param {{sprache?: string, anlass?: string, name: string, titel: string, link: string,
 *   linkGekauft: string, wuensche?: number, ideen?: number, budget?: string, hinweis?: string,
 *   datum?: string}} params
 *   name: Name des Schenkers; linkGekauft: persönlicher Link, der die Rückfrage
 *   „Geschenk gekauft?“ öffnet; wuensche/ideen: Anzahl neuer Einträge (zusammen mindestens 1)
 * @return {{subject: string, text: string, html: string, absenderName: string}}
 */
function baueNeuigkeitenMail({
  sprache, anlass, name, titel, link, linkGekauft, wuensche = 0, ideen = 0, budget = '', hinweis = '', datum = '',
}) {
  if (!(wuensche > 0 || ideen > 0)) throw new Error('baueNeuigkeitenMail braucht mindestens einen neuen Eintrag');
  const s = normalisiereSprache(sprache);
  const texte = TEXTE[s].neuigkeiten;
  const t = texte[waehleVariante(anlass)];
  const g = texte.gemeinsam;
  const anzahl = (formen, n) => fuelle(n === 1 ? formen.eins : formen.mehrere, {anzahl: n}, false);
  const werte = {
    firstName: ersterVorname(name),
    eventName: titel,
    budget: formatiereBudget(budget, s),
    datum: formatiereDatum(datum, s),
    hinweis,
    wuensche: anzahl(g.anzahl.wunsch, wuensche),
    ideen: anzahl(g.anzahl.idee, ideen),
  };
  let neuigkeit = t.nurIdeen;
  if (wuensche > 0) neuigkeit = ideen > 0 ? t.beides : t.nurWuensche;
  const eckdaten = eckdatenZeilen(t, werte);
  const hinweisZeile = hinweis ? g.hinweis : null;

  const text = [
    fuelle(t.anrede, werte, false),
    fuelle(t.intro, werte, false),
    fuelle(neuigkeit, werte, false),
    fuelle(t.aufruf, werte, false),
    ...(eckdaten.length ? [eckdaten.map((zeile) => fuelle(zeile, werte, false)).join('\n')] : []),
    ...(hinweisZeile ? [fuelle(hinweisZeile, werte, false)] : []),
    fuelle(t.gekauftFrage, werte, false),
    [
      fuelle(t.linkErsatz, werte, false),
      fuelle(g.linkZeile, {label: t.knopf, link}, false),
      fuelle(g.linkZeile, {label: t.knopfGekauft, link: linkGekauft}, false),
    ].join('\n'),
    fuelle(t.geheim, werte, false),
    fuelle(t.gruss, werte, false),
    `-- \n${fuelle(t.grund, werte, false)}`,
  ].join('\n\n');

  const h = (vorlage) => fuelle(vorlage, werte, true);
  const linkZeile = (label, ziel) => fuelle(g.linkZeile, {label}, true, {link: sichtbarerLink(ziel)});
  const html = htmlRahmen({
    sprache: s,
    titel: h(t.betreff),
    inhalt: [
      absatz(h(t.anrede)),
      absatz(h(t.intro)),
      absatz(h(neuigkeit)),
      absatz(h(t.aufruf)),
      eckdaten.length ? absatz(eckdaten.map((zeile) => `<strong>${h(zeile)}</strong>`).join('<br>')) : '',
      hinweisZeile ? absatz(h(hinweisZeile), STIL.leise) : '',
      absatz(knopf(link, h(t.knopf)), 'margin:24px 0;'),
      absatz(h(t.gekauftFrage)),
      absatz(knopf(linkGekauft, h(t.knopfGekauft), STIL.knopfZweit), 'margin:0 0 24px;'),
      absatz(`${h(t.linkErsatz)}<br>${linkZeile(t.knopf, link)}<br>${linkZeile(t.knopfGekauft, linkGekauft)}`,
          STIL.leise),
      absatz(h(t.geheim), STIL.leise),
      absatz(h(t.gruss), `${STIL.absatz}margin-bottom:0;`),
    ],
    fuss: h(t.grund),
  });

  return {subject: einzeilig(fuelle(t.betreff, werte, false)), text, html, absenderName: absenderName(s, anlass)};
}

/**
 * Absender einer Wichtel-Mail: die Adresse aus SMTP_FROM mit dem Anzeigenamen der Mailvariante
 * („Wichtelpost vom Nordpol <noreply@…>“). Steht in SMTP_FROM schon ein Name („Name <adresse>“),
 * zählt nur die Adresse. Ohne Anzeigenamen bleibt SMTP_FROM unverändert.
 * @param {string} from - Wert von SMTP_FROM
 * @param {string} [name] - Anzeigename der Mail (`absenderName`)
 * @return {string|{name: string, address: string}}
 */
function absender(from, name) {
  if (!name) return from;
  const adresse = (/<([^<>]+)>\s*$/.exec(from)?.[1] ?? from).trim();
  return {name, address: adresse};
}

module.exports = {
  absender,
  baueEinladungsMail,
  baueNeuigkeitenMail,
  baueErinnerungsMail,
  _internal: {TEXTE, waehleVariante, absenderName, ersterVorname, formatiereBudget, formatiereDatum, fuelle},
};
