# Puppeteer Installation für Webimport

## Schnellstart

Um die Webimport-Screenshot-Funktion zu aktivieren, muss Puppeteer installiert werden:

```bash
# Im Hauptverzeichnis
cd functions
npm install puppeteer@^21.0.0
cd ..
firebase deploy --only functions:captureWebsiteScreenshot
```

## Cloud Functions Anpassungen

Die Cloud Function `captureWebsiteScreenshot` in `functions/index.js` ist bereits vorbereitet.

Nach der Puppeteer-Installation:

1. Öffne `functions/index.js`
2. Navigiere zur `captureWebsiteScreenshot` Funktion
3. Entkommentiere den Puppeteer-Code (markiert mit `// Future implementation would look like:`)
4. Entferne die Fehler-Meldung über die fehlende Puppeteer-Installation

### Beispiel-Code (bereits in der Funktion vorhanden):

```javascript
const puppeteer = require('puppeteer');

try {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  await page.goto(url, { 
    waitUntil: 'networkidle0',
    timeout: 30000 
  });

  const screenshot = await page.screenshot({ 
    encoding: 'base64',
    fullPage: true 
  });

  await browser.close();

  console.log(`Screenshot captured successfully for user ${userId}`);
  
  return {
    screenshot: `data:image/png;base64,${screenshot}`,
    url: url,
    timestamp: new Date().toISOString()
  };
} catch (error) {
  // Error handling...
}
```

## Ressourcen-Empfehlungen

Für Puppeteer benötigt die Cloud Function mehr Ressourcen:

```javascript
exports.captureWebsiteScreenshot = onCall({
  maxInstances: 10,
  memory: '2GiB',      // Erhöht von 1GiB
  timeoutSeconds: 60,  // Bleibt bei 60s
}, ...)
```

## Alternative: Externe Screenshot-Services

Falls Puppeteer zu ressourcenintensiv ist, könnten auch externe Services verwendet werden:

- **ScreenshotAPI**: https://screenshotapi.net/
- **Urlbox**: https://urlbox.io/
- **Screenshot One**: https://screenshotone.com/

Diese Services würden die `captureWebsiteScreenshot` Funktion vereinfachen und die Kosten möglicherweise reduzieren.

## Kosten

Beachten Sie:
- Puppeteer benötigt mehr Memory (2GB statt 1GB)
- Längere Ausführungszeit (10-15s pro Screenshot)
- Firebase bietet ein kostenloses Kontingent, danach Pay-as-you-go

Mit den aktuellen Rate Limits (20 Scans/Tag für authentifizierte Benutzer) sollten die Kosten minimal sein.

## Testing

Nach der Installation testen Sie mit:

1. Melden Sie sich als Benutzer mit Webimport-Berechtigung an
2. Öffnen Sie "Neues Rezept hinzufügen"
3. Klicken Sie auf den Webimport-Button (🌐)
4. Geben Sie eine Test-URL ein (z.B. https://www.chefkoch.de/rezepte/...)
5. Überprüfen Sie, ob der Screenshot erfasst und analysiert wird

## Troubleshooting

### "Error: Failed to launch the browser process"

Puppeteer benötigt bestimmte Systemabhängigkeiten. In Cloud Functions sind diese normalerweise vorhanden.

Falls Probleme auftreten:
```javascript
args: [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu'
]
```

### "Timeout exceeded"

Erhöhen Sie den Timeout:
```javascript
await page.goto(url, { 
  waitUntil: 'networkidle0',
  timeout: 60000  // 60 Sekunden
});
```

### Memory Errors

Erhöhen Sie das Memory-Limit in der Cloud Function Konfiguration:
```javascript
memory: '4GiB'
```
