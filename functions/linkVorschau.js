/**
 * Link-Vorschau: holt zu einem Link, den ein Nutzer eingetragen hat, Vorschaubild und
 * Titel der Seite (og:image, twitter:image, … bzw. og:title, <title>).
 *
 * Der Abruf läuft serverseitig, auch für Aufrufer ohne Login (Wichtel-Link). Deshalb ist
 * er eng begrenzt:
 *  - nur GET auf http/https mit Standard-Port, keine Zugangsdaten in der Adresse
 *  - Ziel nur öffentliche IP-Adressen. Geprüft wird beim Verbindungsaufbau (eigener
 *    DNS-Lookup), also für jede Weiterleitung und ohne Lücke zwischen Prüfen und
 *    Verbinden (DNS-Rebinding)
 *  - höchstens 5 Weiterleitungen, 5 s Gesamtzeit, 2 MB entpacktes HTML
 *  - zurück gehen nur Bild-Adresse, Titel und Seitenname, nie der Seiteninhalt
 * Ein Fehler beim Abruf ist kein Fehler beim Speichern: dann gibt es keine Vorschau.
 *
 * Das Bild selbst lädt erst der Browser des Betrachters direkt von der Seite des Shops.
 */

const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const zlib = require('zlib');

const MAX_LINK = 2000;
const MAX_TITEL = 200;
const MAX_WEITERLEITUNGEN = 5;
const ZEITLIMIT_MS = 5000;
// Große Shop-Seiten (Amazon) haben mehr als 1 MB HTML; das Produktbild steht weit unten.
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_KEKSE = 20;

const WEITERLEITUNG = new Set([301, 302, 303, 307, 308]);

// Wie der Rezept-Import (shared/importSources.js): viele Shops liefern Programmen ohne
// Browser-Kennung nur eine Fehlerseite.
const ANFRAGE_HEADER = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

// ---------------------------------------------------------------------------
// Adressen
// ---------------------------------------------------------------------------

// Nicht öffentlich: privat, Loopback, Link-Local (Metadaten-Server), CGNAT,
// Dokumentation, Benchmark, Multicast, reserviert.
const GESPERRT = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([netz, praefix]) => GESPERRT.addSubnet(netz, praefix, 'ipv4'));
// IPv6: nur globale Unicast-Adressen (2000::/3) ohne Sonderbereiche (Teredo, 6to4,
// Dokumentation). Alles außerhalb – Loopback, ULA, Link-Local, IPv4-gemappt, NAT64 –
// fällt damit schon heraus.
const IPV6_GLOBAL = new net.BlockList();
IPV6_GLOBAL.addSubnet('2000::', 3, 'ipv6');
[['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]
    .forEach(([netz, praefix]) => GESPERRT.addSubnet(netz, praefix, 'ipv6'));

/**
 * @param {string} adresse - IP-Adresse
 * @return {boolean} true, wenn die Adresse öffentlich im Internet erreichbar ist
 */
function istOeffentlicheAdresse(adresse) {
  const typ = net.isIP(adresse);
  if (typ === 4) return !GESPERRT.check(adresse, 'ipv4');
  if (typ === 6) return IPV6_GLOBAL.check(adresse, 'ipv6') && !GESPERRT.check(adresse, 'ipv6');
  return false;
}

/** Hostname ohne die eckigen Klammern einer IPv6-Adresse. */
function rohHost(url) {
  return url.hostname.replace(/^\[|\]$/g, '');
}

const SATZZEICHEN_AM_ENDE = /[.,;:!?'"»“”]+$/;

/**
 * Satzzeichen hinter einem Link im Fließtext gehören nicht zum Link. Eine schließende
 * Klammer nur dann nicht, wenn im Link keine passende öffnende steht.
 */
function ohneSatzzeichen(link) {
  let ergebnis = link.replace(SATZZEICHEN_AM_ENDE, '');
  const anzahl = (zeichen) => ergebnis.split(zeichen).length - 1;
  while (ergebnis.endsWith(')') && anzahl('(') < anzahl(')')) {
    ergebnis = ergebnis.slice(0, -1).replace(SATZZEICHEN_AM_ENDE, '');
  }
  return ergebnis;
}

/**
 * Macht aus einer Eingabe einen Link: ergänzt https://, holt den Link aus einem
 * Teilen-Text („Produktname https://…“) und lässt nur http/https zu.
 * @param {*} eingabe - Text vom Nutzer
 * @return {string|null} normalisierter Link oder null
 */
function normalisiereLink(eingabe) {
  if (typeof eingabe !== 'string') return null;
  let wert = eingabe.trim();
  if (!wert || wert.length > MAX_LINK * 2) return null;
  const imText = wert.match(/https?:\/\/[^\s<>"]+/i);
  if (imText) {
    wert = imText[0];
  } else if (/\s/.test(wert) || /^[a-z][a-z\d+.-]*:\/\//i.test(wert)) {
    return null;
  } else {
    wert = `https://${wert}`;
  }
  wert = ohneSatzzeichen(wert);
  let url;
  try {
    url = new URL(wert);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (!rohHost(url).includes('.')) return null;
  return url.href.length <= MAX_LINK ? url.href : null;
}

/**
 * Steht am Ende eines Textes ein Link (eingefügter Link oder Teilen-Text aus einer
 * Shop-App), wird er zum Link des Eintrags; der Rest bleibt der Text.
 * @param {string} text
 * @return {{text: string, url: string|null}}
 */
function trenneLinkAb(text) {
  if (typeof text !== 'string') return {text: '', url: null};
  const treffer = text.trim().match(/(^|\s)((?:https?:\/\/|www\.)[^\s<>"]+)$/i);
  const url = treffer ? normalisiereLink(treffer[2]) : null;
  if (!url) return {text, url: null};
  const rest = text.trim().slice(0, treffer.index).replace(/[\s:–—-]+$/, '');
  return {text: rest, url};
}

/** Seitenname zur Anzeige: Hostname ohne „www.“. */
function seitenName(url) {
  return rohHost(url).replace(/^www\./i, '');
}

/**
 * Bild-Adresse aus der Seite: absolut, nur https (http wird hochgestuft, das täte der
 * Browser auf einer https-Seite ohnehin), keine data:-URLs und keine Ziele im lokalen Netz
 * des Betrachters.
 * @param {*} roh - Wert aus der Seite
 * @param {string} basis - Adresse der Seite
 * @return {string|null}
 */
function bildAdresse(roh, basis) {
  if (typeof roh !== 'string') return null;
  const wert = roh.trim();
  if (!wert || wert.length > MAX_LINK || /^data:/i.test(wert)) return null;
  let url;
  try {
    url = new URL(wert, basis);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    if (url.port === '80') url.port = '';
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = rohHost(url);
  if (!host.includes('.') || (net.isIP(host) && !istOeffentlicheAdresse(host))) return null;
  return url.href.length <= MAX_LINK ? url.href : null;
}

// ---------------------------------------------------------------------------
// HTML auswerten
// ---------------------------------------------------------------------------

// Bot-Abwehr- und Captcha-Seiten (Cloudflare, Akamai, Fastly, Imperva …) kommen oft mit
// Status 200. Titel und Bild gehören dann nicht zum Link. Verglichen wird der ganze
// Titel bis zum ersten Trenner („Attention Required! | Cloudflare“), damit Produkte wie
// „Forbidden Island“ nicht darunter fallen.
const ABWEHR_TITEL = new Set([
  'client challenge', 'just a moment', 'attention required', 'access denied',
  'access to this page has been denied', 'access to this page has been blocked', 'robot check',
  'are you a robot', 'are you a human', 'captcha', 'security check', 'pardon our interruption',
  'one more step', 'verifying you are human', 'verify you are human', 'bot verification',
  '403 forbidden', 'forbidden',
]);

function istAbwehrSeite(titel) {
  const kern = titel.split(/\s[|–—-]\s|[.!?…]\s/)[0].replace(/[\s.!?…]+$/, '').toLowerCase();
  return ABWEHR_TITEL.has(kern);
}

function bereinigeTitel(wert) {
  if (typeof wert !== 'string') return null;
  const titel = wert.replace(/\s+/g, ' ').trim();
  return titel ? titel.slice(0, MAX_TITEL) : null;
}

/** Erstes Bild aus einem JSON-LD-Wert (String, Liste oder ImageObject). */
function bildAusWert(wert, tiefe = 0) {
  if (tiefe > 3 || !wert) return null;
  if (typeof wert === 'string') return wert;
  if (Array.isArray(wert)) {
    for (const eintrag of wert) {
      const bild = bildAusWert(eintrag, tiefe + 1);
      if (bild) return bild;
    }
    return null;
  }
  if (typeof wert === 'object') return bildAusWert(wert.url || wert.contentUrl, tiefe + 1);
  return null;
}

/** Erstes `image` in einem JSON-LD-Block (auch in @graph und mainEntity). */
function bildAusJsonLd(knoten, tiefe = 0) {
  if (!knoten || typeof knoten !== 'object' || tiefe > 4) return null;
  if (Array.isArray(knoten)) {
    for (const eintrag of knoten) {
      const bild = bildAusJsonLd(eintrag, tiefe + 1);
      if (bild) return bild;
    }
    return null;
  }
  return bildAusWert(knoten.image) ||
    bildAusJsonLd(knoten['@graph'], tiefe + 1) ||
    bildAusJsonLd(knoten.mainEntity, tiefe + 1);
}

/**
 * Amazon-Produktseiten haben kein og:image; das Hauptbild steht in #landingImage
 * (bei Büchern #imgBlkFront). data-a-dynamic-image listet es in mehreren Größen –
 * für die kleine Vorschau genügt die kleinste ab 200 px.
 */
function amazonBild($) {
  const bild = $('#landingImage, #imgBlkFront').first();
  if (!bild.length) return null;
  try {
    const groessen = Object.entries(JSON.parse(bild.attr('data-a-dynamic-image') || '{}'))
        .filter(([, mass]) => Array.isArray(mass) && mass[0] >= 200)
        .sort((a, b) => a[1][0] - b[1][0]);
    if (groessen.length) return groessen[0][0];
  } catch {
    // kein gültiges JSON: weiter mit den Attributen
  }
  return bild.attr('data-old-hires') || bild.attr('src') || null;
}

/**
 * Vorschaubild und Titel aus dem HTML einer Seite.
 * @param {string} html
 * @param {string} seitenUrl - Adresse der Seite (für relative Bild-Adressen)
 * @return {{bild: string|null, titel: string|null}}
 */
function leseVorschauAusHtml(html, seitenUrl) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const meta = (...namen) => {
    for (const name of namen) {
      const wert = $(`meta[property="${name}" i], meta[name="${name}" i]`).first().attr('content');
      if (wert && wert.trim()) return wert.trim();
    }
    return null;
  };
  const jsonLd = () => {
    for (const el of $('script[type="application/ld+json" i]').toArray()) {
      try {
        const bild = bildAusJsonLd(JSON.parse($(el).contents().text()));
        if (bild) return bild;
      } catch {
        // kaputtes JSON-LD: nächsten Block versuchen
      }
    }
    return null;
  };

  const microdata = () => {
    const el = $('[itemprop="image" i]').first();
    return el.attr('content') || el.attr('src') || el.attr('href');
  };

  const kandidaten = [
    () => meta('og:image:secure_url', 'og:image:url', 'og:image'),
    () => meta('twitter:image', 'twitter:image:src'),
    () => $('link[rel~="image_src" i]').first().attr('href'),
    microdata,
    jsonLd,
    () => amazonBild($),
  ];
  let bild = null;
  for (const kandidat of kandidaten) {
    bild = bildAdresse(kandidat(), seitenUrl);
    if (bild) break;
  }
  const titel = bereinigeTitel(meta('og:title', 'twitter:title')) ||
    bereinigeTitel($('title').first().text());
  if (titel && istAbwehrSeite(titel)) return {bild: null, titel: null};
  return {bild, titel};
}

// ---------------------------------------------------------------------------
// Abruf
// ---------------------------------------------------------------------------

/**
 * DNS-Lookup, der nur erlaubte Adressen herausgibt. net.connect ruft ihn für jede
 * Verbindung auf, die Prüfung gilt also für genau die Adresse, zu der verbunden wird.
 * @param {function(string): boolean} istErlaubt
 * @return {function} lookup im Format von dns.lookup
 */
function erstelleLookup(istErlaubt) {
  return function lookup(hostname, optionen, callback) {
    if (typeof optionen === 'function') {
      callback = optionen;
      optionen = {};
    }
    const familie = optionen && (optionen.family === 4 || optionen.family === 6) ? optionen.family : 0;
    dns.lookup(hostname, {all: true, family: familie, hints: optionen?.hints}, (fehler, adressen) => {
      if (fehler) return callback(fehler);
      if (!adressen.length || adressen.some((a) => !istErlaubt(a.address))) {
        const gesperrt = new Error(`Ziel nicht erlaubt: ${hostname}`);
        gesperrt.code = 'ZIEL_GESPERRT';
        return callback(gesperrt);
      }
      if (optionen && optionen.all) return callback(null, adressen);
      return callback(null, adressen[0].address, adressen[0].family);
    });
  };
}

function pruefeZiel(url, {istErlaubt, nurStandardPorts}) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Adresse nicht erlaubt');
  }
  if (nurStandardPorts && url.port !== '') throw new Error('Port nicht erlaubt');
  const host = rohHost(url);
  // IP-Adressen im Link umgehen den Lookup und werden hier geprüft.
  if (!host || (net.isIP(host) && !istErlaubt(host))) throw new Error('Ziel nicht erlaubt');
}

/** Cookies einer Antwort für die nächste Anfrage an denselben Host (manche Shops leiten sonst im Kreis). */
function merkeKekse(kekse, host, setCookie) {
  if (!setCookie) return;
  const fuerHost = kekse.get(host) || new Map();
  (Array.isArray(setCookie) ? setCookie : [setCookie]).forEach((zeile) => {
    const paar = String(zeile).split(';')[0];
    const gleich = paar.indexOf('=');
    if (gleich > 0 && fuerHost.size < MAX_KEKSE) fuerHost.set(paar.slice(0, gleich).trim(), paar.slice(gleich + 1).trim());
  });
  kekse.set(host, fuerHost);
}

function keksZeile(kekse, host) {
  const fuerHost = kekse.get(host);
  if (!fuerHost || fuerHost.size === 0) return null;
  return [...fuerHost.entries()].map(([name, wert]) => `${name}=${wert}`).join('; ');
}

/** Entpackt die Antwort; null bei einer unbekannten Kodierung. */
function entpacke(antwort) {
  const kodierung = String(antwort.headers['content-encoding'] || '').trim().toLowerCase();
  if (!kodierung || kodierung === 'identity') return antwort;
  if (kodierung === 'gzip' || kodierung === 'x-gzip' || kodierung === 'deflate') return antwort.pipe(zlib.createUnzip());
  if (kodierung === 'br') return antwort.pipe(zlib.createBrotliDecompress());
  return null;
}

/** Text aus den Bytes: Zeichensatz aus dem Header, sonst aus <meta charset>, sonst UTF-8. */
function dekodiere(bytes, contentType) {
  let zeichensatz = /charset=["']?([\w.:-]+)/i.exec(contentType || '')?.[1];
  if (!zeichensatz) {
    const anfang = bytes.subarray(0, 4096).toString('latin1');
    zeichensatz = /<meta[^>]+charset=["']?([\w.:-]+)/i.exec(anfang)?.[1];
  }
  try {
    return new TextDecoder(zeichensatz || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Eine GET-Anfrage. Liest den Inhalt nur bei HTML (höchstens maxBytes entpackt).
 * @return {Promise<{status: number, headers: object, typ: string, html?: string, istBild?: boolean}>}
 */
function anfrage(url, {ende, lookup, keks, maxBytes}) {
  return new Promise((resolve, reject) => {
    const rest = ende - Date.now();
    if (rest <= 0) {
      reject(new Error('Zeitlimit'));
      return;
    }
    let erledigt = false;
    let req = null;
    let strom = null;
    const abschluss = () => {
      erledigt = true;
      clearTimeout(timer);
      if (strom && typeof strom.destroy === 'function') strom.destroy();
      if (req) req.destroy();
    };
    const fehler = (err) => {
      if (erledigt) return;
      abschluss();
      reject(err);
    };
    const fertig = (ergebnis) => {
      if (erledigt) return;
      abschluss();
      resolve(ergebnis);
    };
    const timer = setTimeout(() => fehler(new Error('Zeitlimit')), rest);

    const modul = url.protocol === 'https:' ? https : http;
    try {
      req = modul.request(url, {
        method: 'GET',
        // Eigene Verbindung je Anfrage: keine wiederverwendete, die nicht durch den Lookup ging.
        agent: false,
        lookup,
        headers: keks ? {...ANFRAGE_HEADER, Cookie: keks} : ANFRAGE_HEADER,
      });
    } catch (err) {
      fehler(err);
      return;
    }
    req.on('error', fehler);
    req.on('response', (res) => {
      res.on('error', fehler);
      const typ = String(res.headers['content-type'] || '').toLowerCase();
      const basis = {status: res.statusCode, headers: res.headers, typ};
      if (res.statusCode < 200 || res.statusCode >= 300) return fertig(basis);
      if (typ.startsWith('image/')) return fertig({...basis, istBild: true});
      if (!/^(text\/html|application\/xhtml\+xml)/.test(typ)) return fertig(basis);
      strom = entpacke(res);
      if (!strom) return fertig(basis);
      const teile = [];
      let laenge = 0;
      const lesenFertig = () => fertig({...basis, html: dekodiere(Buffer.concat(teile), typ)});
      strom.on('error', fehler);
      strom.on('data', (stueck) => {
        if (erledigt) return;
        teile.push(stueck);
        laenge += stueck.length;
        if (laenge >= maxBytes) lesenFertig();
      });
      strom.on('end', lesenFertig);
      return undefined;
    });
    req.end();
  });
}

const STANDARD = {
  istErlaubt: istOeffentlicheAdresse,
  nurStandardPorts: true,
  zeitlimitMs: ZEITLIMIT_MS,
  maxBytes: MAX_BYTES,
};

/**
 * Folgt Weiterleitungen bis zur Seite.
 * @return {Promise<{url: URL, status: number, typ: string, html?: string, istBild?: boolean}>}
 */
async function holeSeite(link, einstellungen) {
  const ende = Date.now() + einstellungen.zeitlimitMs;
  const lookup = erstelleLookup(einstellungen.istErlaubt);
  const kekse = new Map();
  let url = new URL(link);
  for (let sprung = 0; sprung <= MAX_WEITERLEITUNGEN; sprung++) {
    pruefeZiel(url, einstellungen);
    const antwort = await anfrage(url, {ende, lookup, keks: keksZeile(kekse, url.host), maxBytes: einstellungen.maxBytes});
    merkeKekse(kekse, url.host, antwort.headers['set-cookie']);
    const ziel = antwort.headers.location;
    if (!WEITERLEITUNG.has(antwort.status) || !ziel) return {url, ...antwort};
    url = new URL(ziel, url);
  }
  throw new Error('Zu viele Weiterleitungen');
}

/**
 * Vorschau zu einem Link. Wirft nie: wenn der Abruf scheitert, gibt es keine Vorschau.
 * @param {string} link - normalisierter Link (normalisiereLink)
 * @param {object} [optionen] - nur für Tests (lokaler Server, kurze Limits)
 * @return {Promise<{bild: string|null, titel: string|null, seite: string}|null>}
 */
async function ladeVorschau(link, optionen = {}) {
  const einstellungen = {...STANDARD, ...optionen};
  let host = '';
  try {
    host = new URL(link).hostname;
    const seite = await holeSeite(link, einstellungen);
    const name = seitenName(seite.url);
    if (seite.istBild) return {bild: bildAdresse(seite.url.href, seite.url.href), titel: null, seite: name};
    if (!seite.html) {
      console.warn(`linkVorschau: kein HTML von ${seite.url.hostname} (Status ${seite.status})`);
      return {bild: null, titel: null, seite: name};
    }
    return {...leseVorschauAusHtml(seite.html, seite.url.href), seite: name};
  } catch (err) {
    console.warn(`linkVorschau: Abruf von ${host || 'ungültiger Adresse'} fehlgeschlagen: ${err.code || err.message}`);
    return null;
  }
}

module.exports = {
  ladeVorschau,
  normalisiereLink,
  trenneLinkAb,
  _internal: {
    istOeffentlicheAdresse, leseVorschauAusHtml, bildAdresse, dekodiere, erstelleLookup, holeSeite,
    STANDARD, MAX_LINK, MAX_TITEL,
  },
};
