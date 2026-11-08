const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const linkVorschau = require('./linkVorschau');

const {normalisiereLink, trenneLinkAb, ladeVorschau} = linkVorschau;
const {istOeffentlicheAdresse, leseVorschauAusHtml, bildAdresse, dekodiere, erstelleLookup, holeSeite} =
  linkVorschau._internal;

// ---------------------------------------------------------------------------
// Eingabe
// ---------------------------------------------------------------------------

test('normalisiereLink: ergänzt https, holt den Link aus Teilen-Texten', () => {
  const faelle = [
    ['https://www.amazon.de/dp/B0C1234567?ref=x', 'https://www.amazon.de/dp/B0C1234567?ref=x'],
    ['  www.otto.de/p/123  ', 'https://www.otto.de/p/123'],
    ['amazon.de', 'https://amazon.de/'],
    ['HTTP://Example.COM', 'http://example.com/'],
    ['Schau mal: https://amzn.eu/d/abc123.', 'https://amzn.eu/d/abc123'],
    ['(https://example.com/x)', 'https://example.com/x'],
    ['https://de.wikipedia.org/wiki/Kuchen_(Geb%C3%A4ck)', 'https://de.wikipedia.org/wiki/Kuchen_(Geb%C3%A4ck)'],
  ];
  for (const [eingabe, erwartet] of faelle) assert.equal(normalisiereLink(eingabe), erwartet, eingabe);
});

test('normalisiereLink: nur http/https mit richtigem Host', () => {
  const ungueltig = [
    '', '   ', 42, null, 'javascript:alert(1)', 'ftp://example.com/x', 'mailto:a@b.de', 'localhost:3000',
    'nur Text ohne Link', 'https://user:pw@example.com/', 'https://intranet/x', 'x'.repeat(5000),
    `https://example.com/${'a'.repeat(2100)}`, 'data:text/html,<b>x</b>',
  ];
  for (const eingabe of ungueltig) assert.equal(normalisiereLink(eingabe), null, String(eingabe).slice(0, 40));
});

test('trenneLinkAb: ein Link am Ende wird zum Link des Eintrags', () => {
  assert.deepEqual(trenneLinkAb('Amazon.de: LEGO 75192 Millennium Falcon https://amzn.eu/d/abc'),
      {text: 'Amazon.de: LEGO 75192 Millennium Falcon', url: 'https://amzn.eu/d/abc'});
  assert.deepEqual(trenneLinkAb(' https://amzn.eu/d/abc '), {text: '', url: 'https://amzn.eu/d/abc'});
  assert.deepEqual(trenneLinkAb('Das hier – www.thalia.de/buch/123'), {text: 'Das hier', url: 'https://www.thalia.de/buch/123'});
  // Mitten im Satz bleibt der Text, wie er ist.
  assert.deepEqual(trenneLinkAb('Ich mag https://example.com sehr'), {text: 'Ich mag https://example.com sehr', url: null});
  assert.deepEqual(trenneLinkAb('Wollsocken'), {text: 'Wollsocken', url: null});
  assert.deepEqual(trenneLinkAb(undefined), {text: '', url: null});
});

// ---------------------------------------------------------------------------
// Adressen
// ---------------------------------------------------------------------------

test('istOeffentlicheAdresse: internes Netz, Metadaten-Server und Sonderbereiche sind gesperrt', () => {
  const gesperrt = [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::1', '2001::1',
    'metadata.google.internal', '',
  ];
  gesperrt.forEach((ip) => assert.equal(istOeffentlicheAdresse(ip), false, ip));
  const oeffentlich = ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '2a00:1450:4001:82a::200e'];
  oeffentlich.forEach((ip) => assert.equal(istOeffentlicheAdresse(ip), true, ip));
});

test('erstelleLookup: Hostnamen gehen nur durch, wenn alle Adressen erlaubt sind', async () => {
  const lookup = (istErlaubt, optionen) => new Promise((resolve) => {
    erstelleLookup(istErlaubt)('localhost', optionen, (err, adresse, familie) => resolve({err, adresse, familie}));
  });
  const gesperrt = await lookup(() => false, {all: true});
  assert.equal(gesperrt.err.code, 'ZIEL_GESPERRT');
  const einzeln = await lookup(() => true, {family: 4});
  assert.equal(einzeln.err, null);
  assert.equal(einzeln.adresse, '127.0.0.1');
  assert.equal(einzeln.familie, 4);
  const alle = await lookup(() => true, {all: true, family: 4});
  // Wie oft localhost auftaucht, hängt von /etc/hosts ab (GitHub-Runner: zweimal).
  assert.ok(alle.adresse.length >= 1);
  alle.adresse.forEach((a) => assert.deepEqual(a, {address: '127.0.0.1', family: 4}));
});

test('bildAdresse: absolut, https, nichts aus dem lokalen Netz', () => {
  const basis = 'https://shop.example.de/p/1';
  assert.equal(bildAdresse('/img/a.jpg', basis), 'https://shop.example.de/img/a.jpg');
  assert.equal(bildAdresse('//cdn.example.de/a.jpg', basis), 'https://cdn.example.de/a.jpg');
  assert.equal(bildAdresse('http://cdn.example.de/a.jpg', basis), 'https://cdn.example.de/a.jpg');
  assert.equal(bildAdresse('http://cdn.example.de:80/a.jpg', basis), 'https://cdn.example.de/a.jpg');
  assert.equal(bildAdresse(' https://8.8.8.8/a.jpg ', basis), 'https://8.8.8.8/a.jpg');
  for (const roh of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://192.168.0.1/a.jpg', 'https://intranet/a.jpg', '', undefined]) {
    assert.equal(bildAdresse(roh, basis), null, String(roh));
  }
});

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const seite = (kopf, rumpf = '') => `<!doctype html><html><head>${kopf}</head><body>${rumpf}</body></html>`;
const BASIS = 'https://shop.example.de/produkt/1';

test('leseVorschauAusHtml: og:image und og:title, Entities dekodiert', () => {
  const html = seite('<title>Seitentitel</title><meta property="og:title" content="Caf&eacute; &amp; Kuchen">' +
    '<meta property="og:image" content="https://cdn.example.de/a.jpg">' +
    '<meta property="og:image:secure_url" content="https://cdn.example.de/sicher.jpg">');
  assert.deepEqual(leseVorschauAusHtml(html, BASIS), {bild: 'https://cdn.example.de/sicher.jpg', titel: 'Café & Kuchen'});
});

test('leseVorschauAusHtml: Rückfälle twitter:image, image_src, Microdata, JSON-LD', () => {
  const twitter = seite('<title>\n  Ein   Titel </title><meta name="twitter:image" content="/t.jpg">' +
    '<meta property="og:image" content="data:image/png;base64,AAAA">');
  assert.deepEqual(leseVorschauAusHtml(twitter, BASIS), {bild: 'https://shop.example.de/t.jpg', titel: 'Ein Titel'});

  const imageSrc = seite('<link rel="image_src" href="https://cdn.example.de/s.jpg">');
  assert.equal(leseVorschauAusHtml(imageSrc, BASIS).bild, 'https://cdn.example.de/s.jpg');

  const microdata = seite('', '<div itemscope><img itemprop="image" src="bilder/m.jpg"></div>');
  assert.equal(leseVorschauAusHtml(microdata, BASIS).bild, 'https://shop.example.de/produkt/bilder/m.jpg');

  const jsonLd = seite('<script type="application/ld+json">{kaputt</script>' +
    '<script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":"https://cdn.example.de/logo.png"},' +
    '{"@type":"Product","image":[{"@type":"ImageObject","url":"https://cdn.example.de/p.jpg"}]}]}</script>');
  assert.equal(leseVorschauAusHtml(jsonLd, BASIS).bild, 'https://cdn.example.de/p.jpg');
});

test('leseVorschauAusHtml: Amazon-Produktbild in passender Größe', () => {
  const dynamisch = JSON.stringify({
    'https://m.media-amazon.com/images/I/s100.jpg': [100, 100],
    'https://m.media-amazon.com/images/I/s600.jpg': [600, 600],
    'https://m.media-amazon.com/images/I/s300.jpg': [300, 300],
  }).replace(/"/g, '&quot;');
  const html = seite('<title>Amazon.de: Kochmesser</title>',
      `<img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/gross.jpg" data-a-dynamic-image="${dynamisch}">`);
  assert.deepEqual(leseVorschauAusHtml(html, 'https://www.amazon.de/dp/B0C1234567'),
      {bild: 'https://m.media-amazon.com/images/I/s300.jpg', titel: 'Amazon.de: Kochmesser'});

  const nurHires = seite('', '<img id="imgBlkFront" data-old-hires="https://m.media-amazon.com/images/I/buch.jpg">');
  assert.equal(leseVorschauAusHtml(nurHires, 'https://www.amazon.de/dp/3123456789').bild, 'https://m.media-amazon.com/images/I/buch.jpg');
});

test('leseVorschauAusHtml: Bot-Abwehrseiten liefern keine Vorschau', () => {
  for (const titel of ['Client Challenge', 'Just a moment...', 'Attention Required! | Cloudflare', 'Access Denied',
    'Robot Check', 'Pardon Our Interruption', 'Verifying you are human. This may take a few seconds.',
    'Access to this page has been denied.', '403 Forbidden']) {
    const html = seite(`<title>${titel}</title><meta property="og:image" content="https://cdn.example.de/logo.png">`);
    assert.deepEqual(leseVorschauAusHtml(html, BASIS), {bild: null, titel: null}, titel);
  }
  // Produkte, deren Titel nur so anfangen oder es enthalten, bleiben.
  for (const titel of ['Forbidden Island – Kooperatives Brettspiel', 'Captcha-freies Puzzle für Kinder',
    'Access Denied: Roman', 'Das Buch „Access Denied“ (Thriller)']) {
    assert.equal(leseVorschauAusHtml(seite(`<title>${titel}</title>`), BASIS).titel, titel);
  }
});

test('leseVorschauAusHtml: ohne Bild und Titel bleibt beides leer, lange Titel werden gekürzt', () => {
  assert.deepEqual(leseVorschauAusHtml('<p>nichts</p>', BASIS), {bild: null, titel: null});
  const lang = leseVorschauAusHtml(seite(`<title>${'x'.repeat(500)}</title>`), BASIS);
  assert.equal(lang.titel.length, linkVorschau._internal.MAX_TITEL);
});

test('dekodiere: Zeichensatz aus Header oder <meta charset>, sonst UTF-8', () => {
  assert.equal(dekodiere(Buffer.from('Käse', 'latin1'), 'text/html; charset=iso-8859-1'), 'Käse');
  assert.match(dekodiere(Buffer.from('<meta charset="windows-1252"><title>Käse</title>', 'latin1'), 'text/html'), /Käse/);
  assert.equal(dekodiere(Buffer.from('Käse', 'utf8'), 'text/html; charset=x-gibtsnicht'), 'Käse');
  assert.equal(dekodiere(Buffer.from('Käse', 'utf8'), ''), 'Käse');
});

// ---------------------------------------------------------------------------
// Abruf gegen einen lokalen Server
// ---------------------------------------------------------------------------

const OG_SEITE = seite('<meta property="og:title" content="Wollsocken &amp; mehr">' +
  '<meta property="og:image" content="https://cdn.example.de/socken.jpg">');

const aufrufe = [];
let server;
let basis;

const routen = {
  '/seite': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(OG_SEITE);
  },
  '/gzip': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'});
    res.end(zlib.gzipSync(OG_SEITE));
  },
  '/br': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html', 'Content-Encoding': 'br'});
    res.end(zlib.brotliCompressSync(OG_SEITE));
  },
  '/latin1': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html; charset=ISO-8859-1'});
    res.end(Buffer.from(seite('<meta property="og:title" content="Käsefondue-Set">'), 'latin1'));
  },
  '/weiter1': (req, res) => {
    res.writeHead(302, {'Location': '/weiter2', 'Set-Cookie': 'sitzung=abc; Path=/; HttpOnly'});
    res.end();
  },
  '/weiter2': (req, res) => {
    // Ohne das Cookie aus /weiter1 im Kreis – wie bei manchen Shops.
    const ok = /(^|;\s*)sitzung=abc(;|$)/.test(req.headers.cookie || '');
    res.writeHead(ok ? 301 : 302, {Location: ok ? `${basis}/seite` : '/weiter1'});
    res.end();
  },
  '/kreis': (req, res) => {
    res.writeHead(302, {Location: '/kreis'});
    res.end();
  },
  '/zu-privat': (req, res) => {
    res.writeHead(302, {Location: `http://127.0.0.2:${server.address().port}/geheim`});
    res.end();
  },
  '/geheim': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(seite('<title>GEHEIM</title>'));
  },
  '/bild.png': (req, res) => {
    res.writeHead(200, {'Content-Type': 'image/png'});
    res.end(Buffer.alloc(64));
  },
  '/json': (req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end('{"og:image":"https://cdn.example.de/x.jpg"}');
  },
  '/fehlt': (req, res) => {
    res.writeHead(404, {'Content-Type': 'text/html'});
    res.end(OG_SEITE);
  },
  '/langsam': () => {
    // Antwortet nie.
  },
  '/gross': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write(`<html><head>${'<meta property="og:image" content="https://cdn.example.de/gross.jpg">'}</head><body>`);
    const block = `<p>${'x'.repeat(64 * 1024)}</p>`;
    let gesendet = 0;
    const schreibe = () => {
      while (gesendet < 4 * 1024 * 1024) {
        gesendet += block.length;
        if (!res.write(block)) return res.once('drain', schreibe);
      }
      return res.end('</body></html>');
    };
    schreibe();
  },
};

test.before(async () => {
  server = http.createServer((req, res) => {
    aufrufe.push(req.url);
    const route = routen[req.url];
    if (route) return route(req, res);
    res.writeHead(404);
    return res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  basis = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.closeAllConnections();
  server.close();
});

// Gegen den lokalen Server: nur 127.0.0.1 erlaubt, beliebiger Port.
const LOKAL = {istErlaubt: (ip) => ip === '127.0.0.1', nurStandardPorts: false, zeitlimitMs: 2000};

const ohneWarnungen = async (fn) => {
  const original = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = original;
  }
};

test('ladeVorschau: Bild, Titel und Seitenname einer Seite', async () => {
  assert.deepEqual(await ladeVorschau(`${basis}/seite`, LOKAL),
      {bild: 'https://cdn.example.de/socken.jpg', titel: 'Wollsocken & mehr', seite: '127.0.0.1'});
});

test('ladeVorschau: gzip, Brotli und Latin-1', async () => {
  assert.equal((await ladeVorschau(`${basis}/gzip`, LOKAL)).titel, 'Wollsocken & mehr');
  assert.equal((await ladeVorschau(`${basis}/br`, LOKAL)).bild, 'https://cdn.example.de/socken.jpg');
  assert.equal((await ladeVorschau(`${basis}/latin1`, LOKAL)).titel, 'Käsefondue-Set');
});

test('ladeVorschau folgt Weiterleitungen und gibt Cookies an denselben Host weiter', async () => {
  const vorschau = await ladeVorschau(`${basis}/weiter1`, LOKAL);
  assert.equal(vorschau.titel, 'Wollsocken & mehr');
  assert.ok(await ohneWarnungen(() => ladeVorschau(`${basis}/kreis`, LOKAL)) === null, 'Endlosschleife bricht ab');
});

test('ladeVorschau: kein Abruf im internen Netz, auch nicht über eine Weiterleitung', async () => {
  aufrufe.length = 0;
  await ohneWarnungen(async () => {
    // Standard-Einstellungen: Loopback als IP und als Hostname, fremder Port.
    assert.equal(await ladeVorschau(`${basis}/geheim`, {nurStandardPorts: false}), null);
    assert.equal(await ladeVorschau(`http://localhost:${server.address().port}/geheim`, {nurStandardPorts: false}), null);
    assert.equal(await ladeVorschau(`${basis}/geheim`, {istErlaubt: () => true}), null);
    // Erlaubter Start, Weiterleitung ins Gesperrte.
    assert.equal(await ladeVorschau(`${basis}/zu-privat`, LOKAL), null);
  });
  assert.deepEqual(aufrufe, ['/zu-privat'], 'nur der erlaubte Start wurde abgerufen');
});

test('ladeVorschau: ohne HTML oder bei Fehlerstatus keine Vorschau, aber der Seitenname', async () => {
  await ohneWarnungen(async () => {
    assert.deepEqual(await ladeVorschau(`${basis}/json`, LOKAL), {bild: null, titel: null, seite: '127.0.0.1'});
    assert.deepEqual(await ladeVorschau(`${basis}/fehlt`, LOKAL), {bild: null, titel: null, seite: '127.0.0.1'});
  });
  // Ein direkter Bild-Link wird als Bild erkannt (lokale Adressen gibt bildAdresse nicht heraus).
  const bild = await holeSeite(`${basis}/bild.png`, {...linkVorschau._internal.STANDARD, ...LOKAL});
  assert.equal(bild.istBild, true);
  assert.equal(bild.html, undefined);
});

test('ladeVorschau: Zeitlimit und Größenlimit', async () => {
  const start = Date.now();
  assert.equal(await ohneWarnungen(() => ladeVorschau(`${basis}/langsam`, {...LOKAL, zeitlimitMs: 300})), null);
  assert.ok(Date.now() - start < 1500, 'bricht nach dem Zeitlimit ab');

  const gross = await ladeVorschau(`${basis}/gross`, {...LOKAL, maxBytes: 256 * 1024});
  assert.equal(gross.bild, 'https://cdn.example.de/gross.jpg');
});
