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
const { ACCOUNT, SEED_NOW, patchAccount, patchDoc } = require('./seed');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.SCREENSHOT_PORT || 5174);
const URL = `http://127.0.0.1:${PORT}/`;

// Deutscher Browser: Seiten ohne Anmeldung folgen der Sprache des Browsers (Mehrsprachigkeit,
// Entscheidung O). Ohne locale meldet Chromium en-US, dann erschienen Anmeldung und Registrierung
// englisch, und Bildschirme mit deutschen Knopfnamen (registrieren) fänden ihren Knopf nicht.
const BROWSER = { locale: 'de-DE' };

const VARIANTS = [
  { name: 'desktop-hell', context: { ...BROWSER, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }, dark: false },
  { name: 'desktop-dunkel', context: { ...BROWSER, viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }, dark: true },
  { name: 'handy-hell', context: { ...devices['iPhone 13'], ...BROWSER }, dark: false },
  { name: 'handy-dunkel', context: { ...devices['iPhone 13'], ...BROWSER }, dark: true },
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
  {
    // Neues Konto ohne Inspirationssammlung und Alltagsklassiker: Die Karussells zeigen statt der
    // Plus-Knöpfe ihre Einrichtungs-Knöpfe. Das Konto wird danach zurückgesetzt.
    name: 'startseite-einrichtung',
    fullPage: true,
    run: async (page, shot) => {
      await patchAccount({ defaultWebImportListId: undefined, defaultEverydayClassicsListId: undefined });
      try {
        await page.reload({ waitUntil: 'load' });
        await page.locator('.hamburger-btn').waitFor({ timeout: 30000 });
        await openMenuItem(page, 'Küche');
        await page.getByRole('button', { name: 'Alltagsklassiker zuordnen' }).waitFor();
        await pause(page, 1500);
        await shot();
      } finally {
        await patchAccount({ defaultWebImportListId: 'inspiration', defaultEverydayClassicsListId: 'familie' });
      }
    },
  },
  { name: 'kochbuch', run: async (page, shot) => { await openMenuItem(page, 'Kochbuch'); await shot(); } },
  {
    // Sprach-Chip im Header (Mehrsprachigkeit): Handy mit Bottom Sheet, Desktop mit Popover
    name: 'sprachwahl',
    run: async (page, shot) => {
      await openMenuItem(page, 'Kochbuch');
      await page.getByRole('button', { name: /^Sprache wählen/ }).click();
      await pause(page, 500);
      await shot();
    },
  },
  {
    // Englisch nur für die Sitzung: oranger Rand am Chip, die Auswahl nennt die Standardsprache
    name: 'sprachwahl-englisch',
    run: async (page, shot) => {
      await openMenuItem(page, 'Kochbuch');
      await page.getByRole('button', { name: /^Sprache wählen/ }).click();
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.getByRole('button', { name: /^Choose language/ }).click();
      await pause(page, 500);
      await shot();
    },
  },
  { name: 'rezept', run: async (page, shot) => { await openRecipe(page, 'Linsensuppe mit Kreuzkümmel'); await shot(); } },
  {
    // „Wein dazu“ mit dem eingerichteten Süßwein-Icon (seed.js) im Chip und im Sheet
    name: 'rezept-wein-dazu-suesswein',
    run: async (page, shot) => {
      await openRecipe(page, 'Apfelkuchen vom Blech');
      await page.getByRole('button', { name: /^Wein: Süßwein/ }).click();
      await page.getByRole('dialog', { name: 'Wein dazu' }).waitFor();
      await pause(page, 600);
      await shot();
    },
  },
  {
    // Auf dem Handy öffnet der schwebende Knopf das Formular in der Testumgebung nicht zuverlässig
    name: 'rezept-bearbeiten',
    variants: ['desktop-hell', 'desktop-dunkel'],
    fullPage: true,
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[title="Rezept bearbeiten"]').first().click();
      await page.locator('.recipe-form-header-save, form').first().waitFor();
      await pause(page, 1200);
      await shot();
    },
  },
  {
    // Rezeptformular mit Emoji im Titel: „Emojis entfernen“ erscheint (Button-System Schritt 5b)
    name: 'rezept-bearbeiten-emoji',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[title="Rezept bearbeiten"]').first().click();
      await page.locator('#title').waitFor();
      await page.locator('#title').fill('Linsensuppe mit Kreuzkümmel 🍲');
      await pause(page, 800);
      await shot();
    },
  },
  // Bearbeiten mit KI (Berechtigung versionDictation, Admin): Unverändert zeigt der runde Knopf unten
  // rechts „Bearbeiten“ statt „Speichern“; ein Klick öffnet die Beschreibung, der Knopf wird zu
  // „Einarbeiten“. Den runden Knopf gibt es nur auf dem Handy.
  ...[['rezept-bearbeiten-ki', null], ['rezept-bearbeiten-ki-beschreibung', 'Ersetze den Kreuzkümmel durch geräuchertes Paprikapulver']].map(([name, beschreibung]) => ({
    name,
    variants: ['handy-hell', 'handy-dunkel'],
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('.edit-fab-button').click();
      await page.getByRole('button', { name: 'Rezept mit KI bearbeiten' }).waitFor();
      await pause(page, 1200);
      if (beschreibung) {
        await page.getByRole('button', { name: 'Rezept mit KI bearbeiten' }).click();
        await page.getByLabel('Was soll sich ändern?').fill(beschreibung);
        await pause(page, 800);
      }
      await shot();
    },
  })),
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
    // Kochmodus beim letzten Schritt: Timer im Schritt und „Heute gekocht“ (Einstieg nur auf dem Handy)
    name: 'kochmodus',
    variants: ['handy-hell', 'handy-dunkel'],
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[aria-label="Kochmodus aktivieren"]').first().click();
      await page.locator('.step-card').first().waitFor();
      await page.locator('.step-card').last().click();
      await pause(page, 1000);
      await shot();
    },
  },
  {
    // Kochmodus ohne Rollen-Flag parallelKochen (wie das Testkonto): Timer auf Schritt 3 läuft, man steht auf
    // Schritt 2. Seit Tech-Check P9 steht die Restzeit als Chip über dem Fortschritt, vorher nirgends.
    name: 'kochmodus-timer-anderer-schritt',
    variants: ['handy-hell', 'handy-dunkel'],
    run: async (page, shot) => {
      await openRecipe(page, 'Linsensuppe mit Kreuzkümmel');
      await page.locator('[aria-label="Kochmodus aktivieren"]').first().click();
      await page.locator('.step-card').first().waitFor();
      await page.locator('.step-dot').nth(2).click();
      await page.locator('.step-card').nth(2).locator('.step-timer-start-btn').click();
      await page.locator('.step-dot').nth(1).click();
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
      await page.getByRole('button', { name: 'Meine Mise en Place' }).first().click();
      await pause(page, 1000);
      await page.getByText('+ Liste erstellen').first().click();
      await page.getByRole('dialog').first().waitFor();
      await shot();
    },
  },
  {
    name: 'menue-bearbeiten',
    variants: ['desktop-hell', 'desktop-dunkel'],
    fullPage: true,
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
    // „+ Abschnitt hinzufügen“ öffnet die vordefinierten Abschnitte und das Feld für einen eigenen Namen
    name: 'menue-bearbeiten-abschnitt',
    variants: ['desktop-hell', 'desktop-dunkel'],
    run: async (page, shot) => {
      await openMenuItem(page, 'Festtafel');
      await page.getByText('Sonntagsessen', { exact: true }).first().click();
      await pause(page, 1000);
      await page.locator('[title="Menü bearbeiten"]').first().click();
      await page.locator('.menu-form-container').first().waitFor();
      await page.getByRole('button', { name: '+ Abschnitt hinzufügen' }).click();
      await page.locator('.new-section-input').first().scrollIntoViewIfNeeded();
      await pause(page, 500);
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
    // Profilseite mit aufgeklappter Inspirationssammlung (Standardlisten klappen wie der Alarmton auf)
    name: 'persoenliche-daten-liste',
    run: async (page, shot) => {
      await openMenuItem(page, 'Testkoch Beispiel');
      const zeile = page.getByRole('button', { name: /^Inspirationssammlung/ });
      await zeile.click();
      await zeile.scrollIntoViewIfNeeded();
      await pause(page, 500);
      await shot();
    },
  },
  {
    // Einstellungen › Allgemein: Header-Slogan mit Englisch und Französisch (Mehrsprachigkeit)
    name: 'einstellungen-allgemein',
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.getByRole('heading', { name: 'Header-Slogan' }).waitFor();
      await pause(page);
      await shot();
    },
  },
  {
    // Favicon und App-Logo gewählt, noch nicht gespeichert: Vorschau mit „Ändern“ und „Entfernen“ (Tech-Check D8).
    // Hochgeladen wird im Bildschirm selbst; die Testdaten haben keine allgemeinen Einstellungen, ohne die die App
    // gespeicherte Bilder nicht liest
    name: 'einstellungen-allgemein-logo',
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.getByRole('heading', { name: 'Header-Slogan' }).waitFor();
      const bild = path.join(ROOT, 'public', 'logo192.png');
      await page.locator('#faviconImageFile').setInputFiles(bild);
      await page.locator('#appLogoImageFile').setInputFiles(bild);
      await page.locator('.favicon-preview').nth(1).waitFor();
      await page.locator('.favicon-image-section').first().scrollIntoViewIfNeeded();
      await pause(page, 700);
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
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Kochschule' }).first().click();
      await pause(page);
      await shot();
    },
  },
  {
    // Kochschule-Eintrag bearbeiten: Formular mit Screenshot und „Entfernen“ (Tech-Check D8). Bearbeiten ist der
    // dritte Knopf der Zeile (nach den Pfeilen), vor und nach Schritt 8 gleich gezählt
    name: 'einstellungen-kochschule-bearbeiten',
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Kochschule' }).first().click();
      await pause(page);
      await page.locator('.faq-list-item-actions').first().locator('button').nth(2).click();
      await page.mouse.move(0, 0);
      await pause(page, 700);
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
  // Weinbegleitung im Menü mit den eingerichteten Icons (seed.js: Rot, Weiß, Süß, Bier oder Wasser). Die Profile
  // sind aktuell, „Weinbegleitung erstellen“ rechnet also ohne KI-Aufruf; danach wird sie wieder entfernt, damit
  // „menue“ in der nächsten Variante ohne Weinbegleitung bleibt.
  ...[
    { name: 'menue-weinbegleitung', einWein: false },
    { name: 'menue-weinbegleitung-ein-wein', einWein: true },
  ].map(({ name, einWein }) => ({
    name,
    fullPage: true,
    run: async (page, shot) => {
      try {
        await openMenuItem(page, 'Festtafel');
        await page.getByText('Sonntagsessen', { exact: true }).first().click();
        await page.locator('.menu-detail-container').first().waitFor();
        await page.getByRole('button', { name: 'Weinbegleitung erstellen' }).click();
        await page.locator('.weinbegleitung-gang').first().waitFor();
        if (einWein) {
          await page.getByRole('button', { name: 'Ein Wein für alles' }).click();
          await page.getByRole('list', { name: 'Ein Wein für alle Gänge' }).waitFor();
        }
        await pause(page, 1000);
        await shot();
      } finally {
        await patchDoc('menus/menu-sonntag', { weinbegleitung: undefined });
      }
    },
  })),
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
  { name: 'chefkoch', fullPage: true, run: async (page, shot) => { await openMenuItem(page, 'Chefkoch & mehr'); await shot(); } },
  {
    // Zeitleiste „Mein Kochbuch“ (Variante A): Das Menü ist für die Aufnahme in 30 Tagen geplant (über der Linie
    // „Heute“), die Shakshuka am selben Tag angelegt wie die Spaghetti (zwei Rezepte an einem Tag). Danach zurückgesetzt.
    name: 'chefkoch-zeitleiste',
    fullPage: true,
    run: async (page, shot) => {
      const geplant = new Date();
      geplant.setDate(geplant.getDate() + 30);
      const menuDate = `${geplant.getFullYear()}-${String(geplant.getMonth() + 1).padStart(2, '0')}-${String(geplant.getDate()).padStart(2, '0')}`;
      const tageVorSeed = (tage, stunden = 0) => new Date(SEED_NOW.getTime() - tage * 86400000 + stunden * 3600000).toISOString();
      await patchDoc('menus/menu-sonntag', { menuDate });
      await patchDoc('recipes/rezept-shakshuka', { createdAt: tageVorSeed(1, -6) });
      try {
        await page.reload({ waitUntil: 'load' });
        await page.locator('.hamburger-btn').waitFor({ timeout: 30000 });
        await openMenuItem(page, 'Chefkoch & mehr');
        await page.getByRole('button', { name: 'Mein Kochbuch', exact: true }).first().click();
        await page.locator('.recipe-timeline-container').first().waitFor();
        await pause(page, 1500);
        await shot();
      } finally {
        await patchDoc('menus/menu-sonntag', { menuDate: undefined });
        await patchDoc('recipes/rezept-shakshuka', { createdAt: tageVorSeed(2) });
      }
    },
  },
  // Unterseiten von „Chefkoch & mehr“ (Variante A): über die Kachel geöffnet, ganze Seite
  ...[
    ['chefkoch-kuechenstars', 'Meine Küchenstars'],
    ['chefkoch-mise-en-place', 'Meine Mise en Place'],
    ['chefkoch-weinbegleitung', 'Weinbegleitung'],
    ['chefkoch-kuechenbetrieb', 'Küchenbetrieb'],
    ['chefkoch-eventplanung', 'Eventplanung'],
  ].map(([name, kachel]) => ({
    name,
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Chefkoch & mehr');
      await page.getByRole('button', { name: kachel, exact: true }).first().click();
      await pause(page, 1200);
      await shot();
    },
  })),
  {
    name: 'chefkoch-liste',
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Chefkoch & mehr');
      await page.getByRole('button', { name: 'Meine Mise en Place', exact: true }).first().click();
      await pause(page, 1000);
      await page.getByRole('button', { name: 'Familienrezepte', exact: true }).first().click();
      await pause(page, 1200);
      await shot();
    },
  },
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
  // Tabellen der Verwaltung mit einer Zeile in Bearbeitung: Abbrechen und Speichern in der Zeile (Schritt 7)
  ...[
    ['einstellungen-saison-bearbeiten', 'Saisonmatrix', '.season-matrix-actions'],
    ['einstellungen-getraenke-bearbeiten', 'Getränkegewichtung', '.drink-weights-actions'],
  ].map(([name, label, actions]) => ({
    name,
    fullPage: true,
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: label }).first().click();
      await pause(page, 1000);
      await page.locator(actions).first().getByRole('button', { name: 'Bearbeiten', exact: true }).click();
      // Maus weg, sonst zeigt der Knopf, der jetzt unter ihr liegt, seinen Hover-Zustand
      await page.mouse.move(0, 0);
      await pause(page, 500);
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
    // Benutzertabelle nach rechts gescrollt: Die Spalte „Aktionen“ liegt sonst außerhalb des Bildes
    name: 'einstellungen-benutzer-aktionen',
    run: async (page, shot) => {
      await openMenuItem(page, 'Einstellungen');
      await page.locator('.tab-button', { hasText: 'Benutzerverwaltung' }).first().click();
      await pause(page, 1000);
      const tabelle = page.locator('.users-table-container').first();
      await tabelle.scrollIntoViewIfNeeded();
      await tabelle.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await pause(page, 300);
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
