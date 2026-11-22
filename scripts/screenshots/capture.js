#!/usr/bin/env node
/**
 * Fotografiert eine feste Liste von Bildschirmen der App gegen die lokalen Emulatoren
 * (docs/setup/screenshots.md): hell und dunkel, Desktop (1280 px) und Handy (iPhone 13).
 * Startet dafür selbst den Vite-Dev-Server mit REACT_APP_USE_EMULATORS=true und beendet ihn
 * am Ende. Erwartet laufende Emulatoren mit den Testdaten aus seed.js (run.sh erledigt beides).
 *
 * Aufruf: node scripts/screenshots/capture.js [Ausgabeordner] [--only name,name]
 *         [--variants desktop-hell,handy-dunkel] [--css entwurf.css]
 * --css legt ein Stylesheet über die App (Gestaltungsentwürfe auf den echten Bildschirmen,
 * ohne App-Code zu ändern).
 * Ergebnis: <Ausgabe>/<variante>/<bildschirm>.png und <Ausgabe>/index.html zum Durchsehen.
 * Braucht Playwright mit Chromium (in den Cloud-Sessions vorinstalliert).
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { ACCOUNT } = require('./seed');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.SCREENSHOT_PORT || 5174);
const URL = `http://127.0.0.1:${PORT}/`;

const VARIANTS = [
  { name: 'desktop-hell', context: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }, dark: false },
  { name: 'desktop-dunkel', context: { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }, dark: true },
  { name: 'handy-hell', context: { ...devices['iPhone 13'] }, dark: false },
  { name: 'handy-dunkel', context: { ...devices['iPhone 13'] }, dark: true },
];

const pause = (page, ms = 700) => page.waitForTimeout(ms);

async function openMenuItem(page, label) {
  await page.locator('.hamburger-btn').click();
  await page.locator('.hamburger-dropdown').getByText(label, { exact: true }).click();
  await pause(page, 1200);
}

// Neues Rezept: Nur dort gibt es die Import-Knöpfe (Webimport, Foto-Scan, Rezept importieren)
async function openNewRecipeForm(page) {
  await openMenuItem(page, 'Kochbuch');
  await page.locator('[aria-label^="Rezept hinzufügen"]').first().click();
  await page.locator('.recipe-form-toolbar').first().waitFor();
  await pause(page, 800);
}

// Teilen aus einer anderen App: Der Service-Worker legt die Daten in IndexedDB ab, die App liest sie
// beim Aufruf mit ?share-target (App.js, readSharedDataFromDB) und öffnet den universellen Import
async function shareIntoApp(page, data) {
  await page.evaluate((shared) => new Promise((resolve, reject) => {
    const req = indexedDB.open('recipebook-settings', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('settings')) req.result.createObjectStore('settings');
    };
    req.onsuccess = () => {
      const tx = req.result.transaction(['settings'], 'readwrite');
      tx.objectStore('settings').put(shared, 'pendingSharedData');
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), data);
  await page.goto(`${URL}?share-target`, { waitUntil: 'load' });
}

async function openRecipe(page, title) {
  await openMenuItem(page, 'Kochbuch');
  await page.getByText(title, { exact: true }).first().click();
  await pause(page, 1200);
}

// Jeder Bildschirm startet angemeldet auf der Startseite („Küche“; außer „anmeldung“ und „registrieren“).
// `shot` macht das Bild; ein Eintrag darf mehrere Bilder machen.
const SCREENS = [
  { name: 'anmeldung', loggedOut: true, run: async (page, shot) => shot() },
  {
    name: 'registrieren',
    loggedOut: true,
    run: async (page, shot) => {
      await page.getByRole('button', { name: 'Jetzt registrieren' }).click();
      await page.locator('#confirmPassword').waitFor();
      await shot();
    },
  },
  {
    // Startseite mit den Karussells „Meine Kochideen“ und „Meine Alltagsklassiker“ samt Plus (P14, T9)
    name: 'startseite',
    fullPage: true,
    run: async (page, shot) => { await openMenuItem(page, 'Küche'); await pause(page, 1500); await shot(); },
  },
  { name: 'kochbuch', run: async (page, shot) => { await openMenuItem(page, 'Kochbuch'); await shot(); } },
  { name: 'rezept', run: async (page, shot) => { await openRecipe(page, 'Linsensuppe mit Kreuzkümmel'); await shot(); } },
  {
    // Auf dem Handy öffnet der schwebende Knopf das Formular in der Testumgebung nicht zuverlässig
    name: 'rezept-bearbeiten',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[title="Rezept bearbeiten"]').first().click();
      await page.locator('.recipe-form-header-save, form').first().waitFor();
      await pause(page, 1200);
      await shot();
    },
  },
  // Import-Dialoge (Button-System Schritt 4b); wie „rezept-bearbeiten“ nur am Desktop
  {
    name: 'import-web',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openNewRecipeForm(page);
      await page.getByRole('button', { name: 'Webimport' }).click();
      await page.locator('.web-import-modal').waitFor();
      await shot();
    },
  },
  {
    name: 'import-text',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openNewRecipeForm(page);
      await page.getByRole('button', { name: 'Rezept importieren' }).click();
      await page.getByRole('heading', { name: /importieren/i }).first().waitFor();
      await pause(page);
      await shot();
    },
  },
  {
    name: 'import-scan',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openNewRecipeForm(page);
      await page.locator('#ocrImageUpload').setInputFiles(path.join(ROOT, 'public', 'logo192.png'));
      await page.locator('.ocr-modal').waitFor();
      await pause(page, 1000);
      await shot();
    },
  },
  {
    name: 'import-geteilt',
    run: async (page, shot) => {
      await shareIntoApp(page, {
        title: 'Ofengemüse mit Feta',
        text: 'Ofengemüse mit Feta. Zutaten: 2 Paprika, 1 Zucchini, 200 g Feta, Olivenöl, Thymian.',
        url: 'https://example.com/rezept/ofengemuese',
        images: [],
      });
      await page.locator('.universal-import-modal').waitFor({ timeout: 30000 });
      await pause(page, 1000);
      await shot();
    },
  },
  {
    // Nährwert-Dialog eines berechneten Rezepts (Button-System Schritt 4c)
    name: 'naehrwerte-dialog',
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('.nutrition-metadata-btn').first().click();
      await page.locator('.nutrition-modal').first().waitFor();
      await pause(page);
      await shot();
    },
  },
  {
    // Nährwert-Dialog nach fehlgeschlagener Berechnung („Erneut versuchen“)
    name: 'naehrwerte-fehler',
    run: async (page, shot) => {
      await openRecipe(page, 'Shakshuka');
      await page.locator('.nutrition-metadata-btn').first().click();
      await page.locator('.nutrition-modal').first().waitFor();
      await pause(page);
      await shot();
    },
  },
  {
    // Zusammensetzung im Nährwert-Dialog (Tabelle der Zutaten)
    name: 'naehrwerte-zusammensetzung',
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('.nutrition-metadata-btn').first().click();
      await page.locator('.nutrition-modal').first().waitFor();
      await page.locator('.nutrition-composition-toggle').first().click();
      await pause(page, 1000);
      await shot();
    },
  },
  {
    name: 'rezept-loeschen-dialog',
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[title="Rezept löschen"]').first().click();
      await page.getByRole('alertdialog').waitFor();
      await shot();
      await page.getByRole('button', { name: 'Abbrechen' }).click();
    },
  },
  {
    name: 'kochdatum-dialog',
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[title="Kochdatum erfassen"]').first().click();
      await page.locator('.cook-date-modal').first().waitFor();
      await shot();
    },
  },
  {
    name: 'bewertung-dialog',
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[title="Bewerten"]').first().click();
      await page.locator('.rating-modal').first().waitFor();
      await shot();
    },
  },
  {
    // Auf dem Handy legt der schwebende Plus-Knopf die Liste an; der Bildschirm ist vorerst nur Desktop
    name: 'liste-anlegen-dialog',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openMenuItem(page, 'Chefkoch & mehr');
      await page.locator('[aria-label^="Meine Mise en Place"]').first().click();
      await pause(page, 1000);
      await page.getByText('+ Liste erstellen').first().click();
      await page.getByRole('dialog').first().waitFor();
      await shot();
    },
  },
  {
    name: 'menue-bearbeiten',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openMenuItem(page, 'Festtafel');
      await page.getByText('Sonntagsessen', { exact: true }).first().click();
      await pause(page, 1000);
      await page.locator('[title="Menü bearbeiten"]').first().click();
      await page.locator('.menu-form-container').first().waitFor();
      await shot();
    },
  },
  {
    name: 'persoenliche-daten',
    fullPage: true,
    run: async (page, shot) => { await openMenuItem(page, 'Testkoch Beispiel'); await shot(); },
  },
  {
    // Profilseite mit aufgeklapptem Alarmton (Auswahl direkt in der Zeile, Variante B)
    name: 'persoenliche-daten-alarmton',
    run: async (page, shot) => {
      await openMenuItem(page, 'Testkoch Beispiel');
      const zeile = page.getByRole('button', { name: /^Alarmton/ });
      await zeile.click();
      await zeile.scrollIntoViewIfNeeded();
      await pause(page, 500);
      await shot();
    },
  },
  {
    name: 'einstellungen-ki',
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'KI-Einstellungen' }).first().click();
      await pause(page);
      await shot();
    },
  },
  {
    name: 'einstellungen-kochschule',
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Kochschule' }).first().click();
      await pause(page);
      await shot();
    },
  },
  { name: 'festtafel', run: async (page, shot) => { await openMenuItem(page, 'Festtafel'); await shot(); } },
  {
    name: 'menue',
    run: async (page, shot) => {
      await openMenuItem(page, 'Festtafel');
      await page.getByText('Sonntagsessen', { exact: true }).first().click();
      await page.locator('.menu-detail-container').first().waitFor();
      await pause(page, 1000);
      await shot();
    },
  },
  { name: 'events', run: async (page, shot) => { await openMenuItem(page, 'Events'); await shot(); } },
  {
    name: 'event',
    run: async (page, shot) => {
      await openMenuItem(page, 'Events');
      await page.getByText('Sommerfest', { exact: true }).first().click();
      await pause(page, 1000);
      await shot();
    },
  },
  {
    // Auf dem Handy öffnet ein schwebender Knopf das Formular; der Bildschirm ist vorerst nur Desktop
    name: 'event-bearbeiten',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openMenuItem(page, 'Events');
      await page.getByText('Sommerfest', { exact: true }).first().click();
      await pause(page, 1000);
      await page.getByRole('button', { name: 'Bearbeiten', exact: true }).first().click();
      await page.locator('.events-form').first().waitFor();
      await pause(page);
      await shot();
    },
  },
  {
    // Getränkeformular mit zwei Gebindeeinheiten (Entfernen: Desktop Knopf am Rand, Handy Wischen).
    // „Neues Getränk anlegen“ (Desktop) und „Getränk anlegen“ (schwebender Knopf, Handy)
    name: 'getraenk-formular',
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Events');
      await page.getByRole('button', { name: 'Getränke verwalten', exact: true }).first().click();
      await pause(page, 1000);
      await page.getByRole('button', { name: /Getränk anlegen/ }).first().click();
      await page.getByRole('button', { name: 'Einheit hinzufügen' }).click();
      await pause(page);
      await shot();
    },
  },
  // Die drei Verwaltungsseiten öffnen auf Desktop Knöpfe über der Liste, auf dem Handy schwebende
  // Knöpfe; beide tragen denselben Namen
  ...[['event-getraenke', 'Getränke verwalten'], ['event-gaeste', 'Gäste verwalten'], ['event-wichteln', 'Wichteln']].map(([name, label]) => ({
    name,
    run: async (page, shot) => {
      await openMenuItem(page, 'Events');
      await page.getByRole('button', { name: label, exact: true }).first().click();
      await pause(page, 1000);
      await shot();
    },
  })),
  { name: 'chefkoch', run: async (page, shot) => { await openMenuItem(page, 'Chefkoch & mehr'); await shot(); } },
  { name: 'einstellungen', run: async (page, shot) => { await openMenuItem(page, 'Einstellungen'); await shot(); } },
  // Weitere Reiter der Einstellungen (Admin), je als ganze Seite
  ...[
    ['einstellungen-druck', 'Drucklayout'],
    ['einstellungen-kochatelier', 'Kochatelier'],
    ['einstellungen-entdeckt', 'Für dich entdeckt'],
    ['einstellungen-benutzer', 'Benutzerverwaltung'],
    ['einstellungen-icons', 'Bilder & Icons'],
    ['einstellungen-saison', 'Saisonmatrix'],
    ['einstellungen-naehrwerte', 'Nährwerte'],
    ['einstellungen-getraenke', 'Getränkegewichtung'],
  ].map(([name, label]) => ({
    name,
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: label }).first().click();
      await pause(page, 1000);
      await shot();
    },
  })),
  // App-Aufrufe (Küchenbetrieb, Admin), je Reiter als ganze Seite (Button-System Schritt 4c)
  ...[
    ['appaufrufe', null],
    ['appaufrufe-rezepte', 'Rezeptaufrufe'],
    ['appaufrufe-ohne-link', 'Rezepte ohne Link'],
    ['appaufrufe-naehrwerte', 'Nährwertberechnungen'],
    ['appaufrufe-zutaten-ids', 'Fehlende Zutaten-IDs'],
    ['appaufrufe-kulinarik', 'Kulinariktypen'],
    ['appaufrufe-einheiten', 'Standardeinheiten/-adjektive'],
  ].map(([name, label]) => ({
    name,
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Appaufrufe');
      if (label) await page.locator('.app-calls-tab', { hasText: label }).first().click();
      await pause(page, 1000);
      await shot();
    },
  })),
  {
    // Drucklayout im Vorlagen-Modus (TemplateFormatEditor); die Umstellung wird nicht gespeichert
    name: 'einstellungen-druck-vorlage',
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Drucklayout' }).first().click();
      await pause(page, 1000);
      // Die Umstellung fragt per window.confirm nach; Playwright würde die Rückfrage sonst ablehnen
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByRole('button', { name: 'Auf Vorlage umstellen' }).first().click();
      await pause(page, 1000);
      await shot();
    },
  },
  {
    // Dialog der Benutzerverwaltung auf dem gemeinsamen Hintergrund .modal-overlay (ModalOverlay.css)
    name: 'benutzer-bearbeiten-dialog',
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Benutzerverwaltung' }).first().click();
      await pause(page, 1000);
      await page.locator('[title="Name bearbeiten"]').first().click();
      await page.getByRole('heading', { name: 'Benutzer bearbeiten' }).waitFor();
      await pause(page);
      await shot();
    },
  },
  {
    name: 'einstellungen-listen',
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Listen' }).first().click();
      await pause(page);
      await shot();
    },
  },
];

async function login(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.locator('input[type="password"]').waitFor({ timeout: 30000 });
  await page.locator('input[type="email"]').fill(ACCOUNT.email);
  await page.locator('input[type="password"]').fill(ACCOUNT.password);
  await page.locator('input[type="password"]').press('Enter');
  await page.locator('.hamburger-btn').waitFor({ timeout: 30000 });
  await pause(page, 1500);
}

function startVite() {
  const env = {
    ...process.env,
    REACT_APP_FIREBASE_API_KEY: 'demo-key',
    REACT_APP_FIREBASE_PROJECT_ID: process.env.SCREENSHOT_PROJECT || 'demo-recipebook',
    REACT_APP_FIREBASE_AUTH_DOMAIN: '127.0.0.1',
    REACT_APP_FIREBASE_STORAGE_BUCKET: 'demo-recipebook.appspot.com',
    REACT_APP_FIREBASE_APP_ID: 'demo-app',
    REACT_APP_USE_EMULATORS: 'true',
  };
  // Eigene Prozessgruppe: npx startet Vite als Kindprozess, beendet wird die ganze Gruppe (stopVite)
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
  return vite;
}

function stopVite(vite) {
  try {
    process.kill(-vite.pid, 'SIGTERM');
  } catch (e) {
    vite.kill();
  }
}

/** Läuft auf dem Port schon ein Server, zeigten die Bilder dessen Stand statt des Arbeitsstands. */
async function assertPortFree() {
  try {
    await fetch(URL);
  } catch (e) {
    return;
  }
  throw new Error(`Port ${PORT} ist belegt (läuft noch ein Dev-Server?). Erst beenden, sonst zeigen die Bilder dessen Stand.`);
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch (e) {
      // noch nicht oben
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Dev-Server unter ${URL} antwortet nicht`);
}

function writeIndex(outDir, results) {
  const rows = SCREENS.map((s) => `<tr><th>${s.name}</th>${VARIANTS.map((v) => {
    const file = `${v.name}/${s.name}.png`;
    return fs.existsSync(path.join(outDir, file))
      ? `<td><a href="${file}"><img src="${file}" loading="lazy" alt="${s.name}, ${v.name}"></a></td>`
      : `<td class="fehlt">fehlt</td>`;
  }).join('')}</tr>`).join('\n');
  const failures = results.filter((r) => r.error).map((r) => `<li>${r.variant} / ${r.screen}: ${r.error.replace(/</g, '&lt;')}</li>`)
    .concat(results.filter((r) => r.overflow).map((r) => `<li>${r.variant} / ${r.screen}: seitlich scrollbar, ${r.overflow} px zu breit</li>`)).join('');
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Screenshots</title>
<style>body{font:14px system-ui;margin:16px;background:#f5f5f5}table{border-collapse:collapse}th,td{padding:6px;vertical-align:top;border:1px solid #ddd;background:#fff}
td img{max-width:260px;max-height:420px;display:block}.fehlt{color:#a33a26}</style>
<h1>Screenshots</h1><p>${new Date().toLocaleString('de-DE')}</p>${failures ? `<ul>${failures}</ul>` : ''}
<table><tr><th></th>${VARIANTS.map((v) => `<th>${v.name}</th>`).join('')}</tr>${rows}</table>`);
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const valueIdx = new Set(['--only', '--variants', '--css'].map((n) => args.indexOf(n)).filter((i) => i >= 0).map((i) => i + 1));
  const only = option('--only') ? new Set(option('--only').split(',')) : null;
  const variants = option('--variants') ? new Set(option('--variants').split(',')) : null;
  const css = option('--css') ? fs.readFileSync(path.resolve(option('--css')), 'utf8') : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
  const outDir = path.resolve(positional[0] || path.join(ROOT, 'screenshots-out'));
  await assertPortFree();
  const vite = startVite();
  const results = [];
  try {
    await waitForServer();
    const browser = await chromium.launch();
    for (const variant of VARIANTS.filter((v) => !variants || variants.has(v.name))) {
      fs.mkdirSync(path.join(outDir, variant.name), { recursive: true });
      for (const screen of SCREENS.filter((s) => (!only || only.has(s.name)) && (!s.variants || s.variants.includes(variant.name)))) {
        const context = await browser.newContext(variant.context);
        // Dunkelmodus wie in der App gewählt (customLists.js, darkModePreference)
        await context.addInitScript((dark) => localStorage.setItem('darkModePreference', dark ? 'true' : 'false'), variant.dark);
        if (css) {
          await context.addInitScript((text) => {
            const add = () => { const style = document.createElement('style'); style.dataset.entwurf = ''; style.textContent = text; document.head.appendChild(style); };
            if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
          }, css);
        }
        const page = await context.newPage();
        const file = path.join(outDir, variant.name, `${screen.name}.png`);
        try {
          if (screen.loggedOut) await page.goto(URL, { waitUntil: 'load' }).then(() => page.locator('input[type="password"]').waitFor());
          else await login(page);
          let overflow = 0;
          await screen.run(page, async () => {
            await pause(page);
            // Seitlich scrollbar? Dann ist etwas breiter als der Bildschirm (z. B. eine Knopfreihe).
            // Gemessen an der Fensterbreite der Variante: In der Handy-Emulation zoomt Chromium eine
            // zu breite Seite heraus, dann wächst innerWidth mit und der Vergleich damit sähe nichts
            // (so blieben am 21.11.2026 sechs Einstellungs-Reiter mit bis zu 996 statt 390 px unbemerkt).
            const width = page.viewportSize().width;
            overflow = await page.evaluate((w) => document.documentElement.scrollWidth - Math.min(window.innerWidth, w), width);
            await page.screenshot({ path: file, fullPage: Boolean(screen.fullPage) });
          });
          results.push({ variant: variant.name, screen: screen.name, overflow: overflow > 1 ? overflow : 0 });
        } catch (err) {
          results.push({ variant: variant.name, screen: screen.name, error: err.message.split('\n')[0] });
        }
        await context.close();
      }
    }
    await browser.close();
  } finally {
    stopVite(vite);
  }
  writeIndex(outDir, results);
  const failed = results.filter((r) => r.error);
  console.log(`${results.length - failed.length} von ${results.length} Bildern erstellt: ${outDir}`);
  failed.forEach((r) => console.log(`  fehlt: ${r.variant} / ${r.screen}: ${r.error}`));
  results.filter((r) => r.overflow).forEach((r) => console.log(`  seitlich scrollbar: ${r.variant} / ${r.screen} (${r.overflow} px zu breit)`));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { SCREENS, VARIANTS };
