#!/usr/bin/env node
/**
 * Machbarkeitstest Word-Vorlage: stellt gefüllte Word-Dateien im Browser dar (docx-preview, ohne Server)
 * und hält das Ergebnis als Bild der Bildschirmansicht und als PDF aus dem Druckdialog des Browsers fest.
 * So sähe der Druck aus, wenn die App die Word-Datei selbst zeichnet statt sie umwandeln zu lassen.
 *
 * Aufruf: node browser_darstellen.js <ordner mit .docx> <ausgabeordner>
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const IN = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const lib = (rel) => fs.readFileSync(path.join(__dirname, 'node_modules', rel), 'utf8');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = {};
  try {
    for (const file of fs.readdirSync(IN).filter((f) => f.endsWith('.docx')).sort()) {
      const name = file.replace(/\.docx$/, '');
      const page = await browser.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 1 });
      const messages = [];
      page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) messages.push(m.text().slice(0, 200)); });
      page.on('pageerror', (e) => messages.push(`pageerror ${String(e).slice(0, 200)}`));
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#888}@media print{body{background:#fff}}</style></head><body><div id="ziel"></div></body></html>');
      await page.addScriptTag({ content: lib('jszip/dist/jszip.min.js') });
      await page.addScriptTag({ content: lib('docx-preview/dist/docx-preview.min.js') });
      const base64 = fs.readFileSync(path.join(IN, file)).toString('base64');
      const result = await page.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const started = performance.now();
        await window.docx.renderAsync(bytes, document.getElementById('ziel'), null, {
          inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true,
          useBase64URL: true, experimental: true,
        });
        await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
        const pages = Array.from(document.querySelectorAll('section.docx'));
        return {
          ms: Math.round(performance.now() - started),
          seiten: pages.length,
          seitenhoehen: pages.map((p) => Math.round(p.getBoundingClientRect().height)),
          textfelder: document.querySelectorAll('#ziel svg foreignObject, #ziel .docx-textbox, #ziel [class*=shape]').length,
          bilder: document.images.length,
          textAuszug: document.getElementById('ziel').innerText.replace(/\s+/g, ' ').slice(0, 160),
          enthaeltZutaten: /Hackfleisch|Zutat 1\.1/.test(document.getElementById('ziel').innerText),
          enthaeltKopfzeile: /brouBook/.test(document.getElementById('ziel').innerText),
        };
      }, base64);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      await page.pdf({ path: path.join(OUT, `${name}.pdf`), preferCSSPageSize: true, printBackground: true });
      report[name] = { ...result, meldungen: messages.slice(0, 5) };
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'bericht.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
})().catch((err) => { console.error(err); process.exit(1); });
