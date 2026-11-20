// Abrufe von Nutzer-Adressen nur ins öffentliche Internet (Tech-Check S28):
// shared/oeffentlicherAbruf.js und die frühe Prüfung assertPublicUrl der Importe.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const {
  istOeffentlicheAdresse, pruefeZiel, abrufOeffentlich, schuetzeSeite,
} = require('./shared/oeffentlicherAbruf');
const {assertPublicUrl} = require('./shared/importSources');

// Die Gegenprobe aus dem Befund S28 (08.11.2026): alle gingen durch assertPublicUrl.
const INTERN_ALS_IP = ['169.254.169.254', '169.254.170.2', '100.100.100.200', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.1', '127.0.0.1', '10.0.0.8'];

test('istOeffentlicheAdresse: interne Bereiche aus S28 sind nicht öffentlich, normale Ziele schon', () => {
  INTERN_ALS_IP.forEach((ip) => assert.equal(istOeffentlicheAdresse(ip), false, ip));
  ['8.8.8.8', '151.101.1.69', '2a00:1450:4001:82a::200e'].forEach((ip) => assert.equal(istOeffentlicheAdresse(ip), true, ip));
  assert.equal(istOeffentlicheAdresse('example.com'), false, 'nur IP-Adressen');
});

test('assertPublicUrl lehnt interne IP-Adressen und Zugangsdaten ab, öffentliche Adressen nicht', () => {
  const abgelehnt = (url) => assert.throws(() => assertPublicUrl(url), (err) => err.code === 'invalid-argument', url);
  ['http://169.254.170.2/', 'http://100.100.100.200/latest', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/',
    'http://0.0.0.1/', 'http://localhost:8080/', 'http://metadata.google.internal/', 'https://user:pw@example.com/',
    'ftp://example.com/', 'kein link'].forEach(abgelehnt);
  ['https://www.chefkoch.de/rezepte/1/x.html', 'http://8.8.8.8/', 'https://[2a00:1450:4001:82a::200e]/']
      .forEach((url) => assert.doesNotThrow(() => assertPublicUrl(url), url));
});

test('pruefeZiel: nur http(s) ohne Zugangsdaten, IP-Adressen im Link nur öffentlich', () => {
  const gesperrt = (url, optionen) => assert.throws(() => pruefeZiel(new URL(url), optionen), {code: 'ZIEL_GESPERRT'}, url);
  gesperrt('file:///etc/passwd');
  gesperrt('https://a:b@example.com/');
  gesperrt('http://[::1]/');
  gesperrt('http://example.com:8080/', {nurStandardPorts: true});
  assert.doesNotThrow(() => pruefeZiel(new URL('https://example.com:8443/')));
});

// ---------------------------------------------------------------------------
// abrufOeffentlich gegen einen lokalen Server: dort ist nur 127.0.0.1 erlaubt.

let server;
let basis;
let port;
const aufrufe = [];
const LOKAL = {istErlaubt: (ip) => ip === '127.0.0.1', timeoutMs: 2000};
const SEITE = '<html><head><title>Käsespätzle</title></head><body>Rezept</body></html>';

const routen = {
  '/seite': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'X-Probe': req.headers['x-probe'] || ''});
    res.end(SEITE);
  },
  '/gzip': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html', 'Content-Encoding': 'gzip'});
    res.end(zlib.gzipSync(SEITE));
  },
  '/br': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html', 'Content-Encoding': 'br'});
    res.end(zlib.brotliCompressSync(SEITE));
  },
  '/bild': (req, res) => {
    res.writeHead(200, {'Content-Type': 'image/png'});
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  },
  '/gross': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('x'.repeat(5000));
  },
  '/weiter': (req, res) => {
    res.writeHead(302, {Location: '/seite'});
    res.end();
  },
  '/nach-innen': (req, res) => {
    res.writeHead(301, {Location: `http://[::1]:${port}/geheim`});
    res.end();
  },
  '/nach-localhost': (req, res) => {
    res.writeHead(307, {Location: `http://localhost:${port}/geheim`});
    res.end();
  },
  '/kreis': (req, res) => {
    res.writeHead(302, {Location: '/kreis'});
    res.end();
  },
  '/fehlt': (req, res) => {
    res.writeHead(404, {'Content-Type': 'text/html'});
    res.end('nicht da');
  },
  '/langsam': () => {},
  '/geheim': (req, res) => {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('intern');
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
  port = server.address().port;
  basis = `http://127.0.0.1:${port}`;
});

test.after(() => {
  server.closeAllConnections();
  server.close();
});

test('abrufOeffentlich: liefert, was die Aufrufer von fetch nutzen', async () => {
  const antwort = await abrufOeffentlich(`${basis}/seite`, {...LOKAL, headers: {'X-Probe': 'ja'}});
  assert.equal(antwort.ok, true);
  assert.equal(antwort.status, 200);
  assert.equal(antwort.url, `${basis}/seite`);
  assert.equal(antwort.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(antwort.headers.get('x-probe'), 'ja', 'eigene Header gehen mit');
  assert.equal(antwort.headers.get('fehlt'), null);
  assert.equal(await antwort.text(), SEITE);
  const bild = await abrufOeffentlich(`${basis}/bild`, LOKAL);
  assert.deepEqual([...new Uint8Array(await bild.arrayBuffer())], [0x89, 0x50, 0x4e, 0x47]);
});

test('abrufOeffentlich: entpackt gzip und Brotli', async () => {
  assert.equal(await (await abrufOeffentlich(`${basis}/gzip`, LOKAL)).text(), SEITE);
  assert.equal(await (await abrufOeffentlich(`${basis}/br`, LOKAL)).text(), SEITE);
});

test('abrufOeffentlich: folgt Weiterleitungen und meldet Fehlerstatus wie fetch', async () => {
  const antwort = await abrufOeffentlich(`${basis}/weiter`, LOKAL);
  assert.equal(antwort.url, `${basis}/seite`);
  assert.equal(await antwort.text(), SEITE);
  const fehlt = await abrufOeffentlich(`${basis}/fehlt`, LOKAL);
  assert.deepEqual([fehlt.ok, fehlt.status, await fehlt.text()], [false, 404, '']);
  await assert.rejects(abrufOeffentlich(`${basis}/kreis`, LOKAL), /Zu viele Weiterleitungen/);
});

test('abrufOeffentlich: kein Abruf im internen Netz, auch nicht über Namen oder Weiterleitungen', async () => {
  aufrufe.length = 0;
  // Standard (nur öffentliche Adressen): Loopback als IP und als Name.
  await assert.rejects(abrufOeffentlich(`${basis}/geheim`), {code: 'ZIEL_GESPERRT'});
  await assert.rejects(abrufOeffentlich(`http://localhost:${port}/geheim`), {code: 'ZIEL_GESPERRT'});
  // Erlaubter Start, Weiterleitung ins Gesperrte: als IP-Adresse und als Name.
  await assert.rejects(abrufOeffentlich(`${basis}/nach-innen`, LOKAL), {code: 'ZIEL_GESPERRT'});
  // Weiterleitung auf einen Namen, der intern auflöst: erst der Lookup beim Verbinden sieht die
  // Adresse. Hier ist nur der Start erlaubt (erste Prüfung), danach nichts mehr.
  let erstePruefung = true;
  const nurDerStart = (ip) => {
    const erlaubt = erstePruefung && ip === '127.0.0.1';
    erstePruefung = false;
    return erlaubt;
  };
  await assert.rejects(abrufOeffentlich(`${basis}/nach-localhost`, {...LOKAL, istErlaubt: nurDerStart}), {code: 'ZIEL_GESPERRT'});
  await assert.rejects(abrufOeffentlich('https://nutzer:pw@example.com/'), {code: 'ZIEL_GESPERRT'});
  assert.ok(!aufrufe.includes('/geheim'), `interne Seite abgerufen: ${aufrufe.join(', ')}`);
});

test('abrufOeffentlich: Größe und Zeit sind begrenzt', async () => {
  const kurz = await abrufOeffentlich(`${basis}/gross`, {...LOKAL, maxBytes: 1000});
  assert.equal(kurz.abgeschnitten, true);
  assert.equal((await kurz.text()).length, 1000);
  await assert.rejects(abrufOeffentlich(`${basis}/gross`, {...LOKAL, maxBytes: 1000, beiUeberlaenge: 'fehler'}), /größer als 1000 Bytes/);
  await assert.rejects(abrufOeffentlich(`${basis}/langsam`, {...LOKAL, timeoutMs: 200}), {name: 'TimeoutError'});
});

// ---------------------------------------------------------------------------
// schuetzeSeite mit einer nachgebauten Puppeteer-Seite.

function falscheSeite() {
  const ergebnisse = {};
  let handler = null;
  const seite = {
    interception: false,
    setRequestInterception: async (an) => {
      seite.interception = an;
    },
    on: (ereignis, fn) => {
      assert.equal(ereignis, 'request');
      handler = fn;
    },
    // Schickt eine Anfrage durch den Handler und wartet auf continue/abort.
    anfrage: (url, {schonErledigt = false} = {}) => new Promise((resolve) => {
      handler({
        url: () => url,
        isInterceptResolutionHandled: () => schonErledigt,
        continue: async () => resolve((ergebnisse[url] = 'weiter')),
        abort: async (grund) => resolve((ergebnisse[url] = `abgebrochen:${grund}`)),
      });
      if (schonErledigt) resolve((ergebnisse[url] = 'nicht angefasst'));
    }),
  };
  return seite;
}

test('schuetzeSeite: nur Anfragen an öffentliche Ziele gehen raus', async () => {
  const seite = falscheSeite();
  await schuetzeSeite(seite);
  assert.equal(seite.interception, true);
  assert.equal(await seite.anfrage('https://8.8.8.8/rezept'), 'weiter');
  assert.equal(await seite.anfrage('data:image/png;base64,iVBORw0KGgo='), 'weiter');
  assert.equal(await seite.anfrage('about:blank'), 'weiter');
  assert.equal(await seite.anfrage('http://169.254.169.254/computeMetadata/v1/'), 'abgebrochen:blockedbyclient');
  assert.equal(await seite.anfrage('http://[fd00::1]/'), 'abgebrochen:blockedbyclient');
  // Name, der auf eine interne Adresse zeigt (wie localtest.me): beim Auflösen erkannt.
  assert.equal(await seite.anfrage('http://localhost/'), 'abgebrochen:blockedbyclient');
  assert.equal(await seite.anfrage('file:///etc/passwd'), 'abgebrochen:blockedbyclient');
  assert.equal(await seite.anfrage('http://gibt-es-nicht.invalid/'), 'abgebrochen:blockedbyclient');
  assert.equal(await seite.anfrage('https://8.8.8.8/x', {schonErledigt: true}), 'nicht angefasst');
});

test('schuetzeSeite: istErlaubt bestimmt, welche aufgelösten Adressen erlaubt sind', async () => {
  const seite = falscheSeite();
  // localhost löst je nach /etc/hosts auf 127.0.0.1 und/oder ::1 auf.
  await schuetzeSeite(seite, {istErlaubt: (ip) => ip === '127.0.0.1' || ip === '::1'});
  assert.equal(await seite.anfrage(`http://localhost:${port}/seite`), 'weiter');
  assert.equal(await seite.anfrage('http://10.0.0.1/'), 'abgebrochen:blockedbyclient');
});
