/**
 * Abrufe von Adressen, die Nutzer angeben (Rezept-Import, Bildschirmfoto, Link-Vorschau),
 * nur ins öffentliche Internet (Tech-Check S28; bis dahin nur in linkVorschau.js).
 *
 * Ein Text-Vergleich des Hostnamens genügt nicht: localtest.me oder *.nip.io zeigen auf
 * interne Adressen, und fetch bzw. Chrome folgen Weiterleitungen ungeprüft. Deshalb:
 *  - abrufOeffentlich (statt fetch): prüft beim Verbindungsaufbau, über einen eigenen
 *    DNS-Lookup, jede Adresse, zu der verbunden wird. Weiterleitungen folgt er einzeln
 *    und prüft jede. Zwischen Prüfen und Verbinden bleibt keine Lücke (DNS-Rebinding).
 *  - schuetzeSeite (Puppeteer): prüft jede Anfrage einer Seite – Navigation, jede
 *    Weiterleitung, Unterressourcen – vor dem Abschicken. Chrome löst den Namen danach
 *    selbst noch einmal auf; diese kleine Lücke bleibt.
 * Öffentlich heißt: kein privates Netz, Loopback, Link-Local (Metadaten-Server), CGNAT,
 * Dokumentations-, Benchmark-, Multicast- oder reservierter Bereich; bei IPv6 nur globale
 * Unicast-Adressen (damit fallen auch ULA, IPv4-gemappte und NAT64-Adressen heraus).
 */

const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const zlib = require('zlib');

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

function gesperrt(text) {
  const fehler = new Error(text);
  fehler.code = 'ZIEL_GESPERRT';
  return fehler;
}

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
        return callback(gesperrt(`Ziel nicht erlaubt: ${hostname}`));
      }
      if (optionen && optionen.all) return callback(null, adressen);
      return callback(null, adressen[0].address, adressen[0].family);
    });
  };
}

/**
 * Prüft, was sich vor dem Verbinden prüfen lässt: http/https, keine Zugangsdaten, bei einer
 * IP-Adresse im Link diese selbst (sie umgeht den Lookup). Wirft Error mit code ZIEL_GESPERRT.
 * @param {URL} url
 * @param {{istErlaubt?: function(string): boolean, nurStandardPorts?: boolean}} [optionen]
 */
function pruefeZiel(url, {istErlaubt = istOeffentlicheAdresse, nurStandardPorts = false} = {}) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw gesperrt('Adresse nicht erlaubt');
  }
  if (nurStandardPorts && url.port !== '') throw gesperrt('Port nicht erlaubt');
  const host = rohHost(url);
  if (!host || (net.isIP(host) && !istErlaubt(host))) throw gesperrt('Ziel nicht erlaubt');
}

const WEITERLEITUNG = new Set([301, 302, 303, 307, 308]);

/** Entpackt die Antwort; null bei einer unbekannten Kodierung. */
function entpacke(antwort) {
  const kodierung = String(antwort.headers['content-encoding'] || '').trim().toLowerCase();
  if (!kodierung || kodierung === 'identity') return antwort;
  if (kodierung === 'gzip' || kodierung === 'x-gzip' || kodierung === 'deflate') return antwort.pipe(zlib.createUnzip());
  if (kodierung === 'br') return antwort.pipe(zlib.createBrotliDecompress());
  return null;
}

function zeitlimitFehler() {
  const fehler = new Error('Zeitlimit beim Abruf');
  // Wie AbortSignal.timeout bei fetch, damit Aufrufer den Fall gleich erkennen.
  fehler.name = 'TimeoutError';
  return fehler;
}

/**
 * Eine GET-Anfrage; liest den Inhalt nur bei 2xx (höchstens maxBytes entpackt).
 * @return {Promise<{status: number, statusText: string, headers: object, inhalt: Buffer, abgeschnitten: boolean}>}
 */
function anfrage(url, {ende, lookup, headers, maxBytes, beiUeberlaenge}) {
  return new Promise((resolve, reject) => {
    const rest = ende - Date.now();
    if (rest <= 0) {
      reject(zeitlimitFehler());
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
    const timer = setTimeout(() => fehler(zeitlimitFehler()), rest);

    const modul = url.protocol === 'https:' ? https : http;
    try {
      req = modul.request(url, {
        method: 'GET',
        // Eigene Verbindung je Anfrage: keine wiederverwendete, die nicht durch den Lookup ging.
        agent: false,
        lookup,
        headers,
      });
    } catch (err) {
      fehler(err);
      return;
    }
    req.on('error', fehler);
    req.on('response', (res) => {
      res.on('error', fehler);
      const basis = {status: res.statusCode, statusText: res.statusMessage || '', headers: res.headers};
      if (res.statusCode < 200 || res.statusCode >= 300) return fertig({...basis, inhalt: Buffer.alloc(0), abgeschnitten: false});
      strom = entpacke(res);
      if (!strom) return fehler(new Error(`Unbekannte Kodierung: ${res.headers['content-encoding']}`));
      const teile = [];
      let laenge = 0;
      strom.on('error', fehler);
      strom.on('data', (stueck) => {
        if (erledigt) return;
        teile.push(stueck);
        laenge += stueck.length;
        if (laenge > maxBytes) {
          if (beiUeberlaenge === 'fehler') return fehler(new Error(`Antwort größer als ${maxBytes} Bytes`));
          return fertig({...basis, inhalt: Buffer.concat(teile).subarray(0, maxBytes), abgeschnitten: true});
        }
        return undefined;
      });
      strom.on('end', () => fertig({...basis, inhalt: Buffer.concat(teile), abgeschnitten: false}));
      return undefined;
    });
    req.end();
  });
}

/**
 * fetch-Ersatz für Adressen von Nutzern: nur GET, nur öffentliche Ziele (siehe oben),
 * Weiterleitungen einzeln geprüft, Gesamtzeit und Größe begrenzt.
 *
 * @param {string} link - absolute http(s)-Adresse
 * @param {object} [optionen]
 * @param {object} [optionen.headers] - Anfrage-Header (Accept-Encoding setzt der Abruf selbst)
 * @param {number} [optionen.timeoutMs=20000] - Gesamtzeit über alle Weiterleitungen
 * @param {number} [optionen.maxBytes=10485760] - höchstens so viele Bytes Inhalt (entpackt)
 * @param {'abschneiden'|'fehler'} [optionen.beiUeberlaenge='abschneiden'] - was bei mehr passiert
 * @param {number} [optionen.maxWeiterleitungen=5]
 * @param {function(string): boolean} [optionen.istErlaubt] - nur für Tests (lokaler Server)
 * @return {Promise<{ok: boolean, status: number, statusText: string, url: string, abgeschnitten: boolean,
 *   headers: {get: function(string): (string|null)}, text: function(): Promise<string>,
 *   arrayBuffer: function(): Promise<ArrayBuffer>}>} was die Aufrufer von fetch nutzen
 */
async function abrufOeffentlich(link, {
  headers = {},
  timeoutMs = 20000,
  maxBytes = 10 * 1024 * 1024,
  beiUeberlaenge = 'abschneiden',
  maxWeiterleitungen = 5,
  istErlaubt = istOeffentlicheAdresse,
} = {}) {
  const ende = Date.now() + timeoutMs;
  const lookup = erstelleLookup(istErlaubt);
  const anfrageHeader = {...headers, 'Accept-Encoding': 'gzip, deflate, br'};
  let url = new URL(link);
  for (let sprung = 0; sprung <= maxWeiterleitungen; sprung++) {
    pruefeZiel(url, {istErlaubt});
    const antwort = await anfrage(url, {ende, lookup, headers: anfrageHeader, maxBytes, beiUeberlaenge});
    const ziel = antwort.headers.location;
    if (WEITERLEITUNG.has(antwort.status) && ziel) {
      url = new URL(ziel, url);
      continue;
    }
    const inhalt = antwort.inhalt;
    return {
      ok: antwort.status >= 200 && antwort.status < 300,
      status: antwort.status,
      statusText: antwort.statusText,
      url: url.href,
      abgeschnitten: antwort.abgeschnitten,
      headers: {
        get: (name) => {
          const wert = antwort.headers[String(name).toLowerCase()];
          if (wert === undefined) return null;
          return Array.isArray(wert) ? wert.join(', ') : String(wert);
        },
      },
      // Wie Response.text(): immer UTF-8.
      text: async () => new TextDecoder('utf-8').decode(inhalt),
      arrayBuffer: async () => inhalt.buffer.slice(inhalt.byteOffset, inhalt.byteOffset + inhalt.byteLength),
    };
  }
  throw new Error('Zu viele Weiterleitungen');
}

/**
 * Lässt eine Puppeteer-Seite nur Anfragen an öffentliche Ziele schicken: die Navigation,
 * jede Weiterleitung und jede Unterressource (Bilder, Skripte, Frames, XHR). Vor page.goto
 * aufrufen. Gesperrte Anfragen bricht Chrome mit net::ERR_BLOCKED_BY_CLIENT ab.
 * @param {object} page - Puppeteer-Seite
 * @param {{istErlaubt?: function(string): boolean}} [optionen] - istErlaubt nur für Tests
 * @return {Promise<void>}
 */
async function schuetzeSeite(page, {istErlaubt = istOeffentlicheAdresse} = {}) {
  const hosts = new Map(); // Hostname -> Promise<boolean>, je Seite einmal aufgelöst
  const erlaubt = (adresse) => {
    let url;
    try {
      url = new URL(adresse);
    } catch {
      return Promise.resolve(false);
    }
    // Ohne Netz: eingebettete Daten und die leere Seite.
    if (url.protocol === 'data:' || url.protocol === 'blob:' || url.href === 'about:blank') return Promise.resolve(true);
    try {
      pruefeZiel(url, {istErlaubt});
    } catch {
      return Promise.resolve(false);
    }
    const host = rohHost(url);
    if (net.isIP(host)) return Promise.resolve(true); // in pruefeZiel geprüft
    if (!hosts.has(host)) {
      hosts.set(host, dns.promises.lookup(host, {all: true}).then(
          (adressen) => adressen.length > 0 && adressen.every((a) => istErlaubt(a.address)),
          () => false,
      ));
    }
    return hosts.get(host);
  };
  await page.setRequestInterception(true);
  page.on('request', (anfrageDerSeite) => {
    if (anfrageDerSeite.isInterceptResolutionHandled()) return;
    erlaubt(anfrageDerSeite.url())
        .then((ok) => (ok ? anfrageDerSeite.continue() : anfrageDerSeite.abort('blockedbyclient')))
        // Die Seite kann inzwischen geschlossen sein; dann ist nichts mehr zu tun.
        .catch(() => {});
  });
}

module.exports = {
  istOeffentlicheAdresse,
  erstelleLookup,
  pruefeZiel,
  rohHost,
  abrufOeffentlich,
  schuetzeSeite,
};
