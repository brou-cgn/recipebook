# Publikations-Leitfaden für DishBook WebApp

Dieser Leitfaden erklärt Schritt für Schritt, wie du deine DishBook-Anwendung veröffentlichst und welche optionalen Verbesserungen du vornehmen kannst.

## 📋 Status-Übersicht

### ✅ Bereits erledigt

Die folgenden Punkte sind bereits konfiguriert:

- ✅ **GitHub Actions Workflow** - Automatisches Deployment bei jedem Push
- ✅ **PWA-Konfiguration** - manifest.json mit App-Namen, Icons und Theme
- ✅ **Service Worker** - Offline-Funktionalität implementiert
- ✅ **Responsive Design** - Mobile-First Design implementiert
- ✅ **Build-Konfiguration** - package.json mit korrekter Homepage-URL
- ✅ **App-Icons** - Logo in verschiedenen Größen vorhanden
- ✅ **Package-Lock synchronisiert** - Build-Fehler behoben

### ⚠️ Wichtig: Manuelle Schritte erforderlich

Die folgenden Schritte **musst du manuell** durchführen, um die App zu veröffentlichen:

## 🚀 Schritt 1: GitHub Pages aktivieren (ERFORDERLICH)

Dies ist der wichtigste Schritt, um deine App live zu bekommen.

### Anleitung:

1. **Öffne dein GitHub Repository**
   - Gehe zu: https://github.com/brou-cgn/recipebook
   - Melde dich an, falls noch nicht geschehen

2. **Navigiere zu den Einstellungen**
   - Klicke oben rechts auf den Tab **"Settings"** (Einstellungen)
   
3. **Öffne die Pages-Konfiguration**
   - Scrolle im linken Menü nach unten
   - Klicke auf **"Pages"**

4. **Wähle die Deployment-Quelle**
   - Unter "Build and deployment" findest du "Source"
   - **Wichtig:** Wähle **"GitHub Actions"** aus dem Dropdown-Menü
   - (NICHT "Deploy from a branch" wählen!)

5. **Speichern**
   - Die Einstellung wird automatisch gespeichert
   - Du siehst eine Bestätigung am oberen Rand der Seite

### Was passiert danach?

- Beim nächsten Push zum `main`-Branch startet automatisch das Deployment
- Nach 1-2 Minuten ist deine App unter dieser URL verfügbar:
  
  **https://brou-cgn.github.io/recipebook**

## 🔧 Schritt 2: Diesen Pull Request mergen

Nach der GitHub Pages-Aktivierung:

1. Gehe zu den **Pull Requests** in deinem Repository
2. Finde diesen PR
3. Klicke auf **"Merge pull request"**
4. Bestätige mit **"Confirm merge"**

Das Deployment startet automatisch!

## ✅ Schritt 3: Deployment überprüfen

### Deployment-Status ansehen:

1. Gehe zu **Actions** in deinem Repository
2. Du siehst einen laufenden Workflow namens "Deploy to GitHub Pages"
3. Der Workflow hat zwei Phasen:
   - **build**: Erstellt die Produktions-Version
   - **deploy**: Veröffentlicht sie auf GitHub Pages

### Erfolg prüfen:

- ✅ **Grüner Haken** = Deployment erfolgreich!
- ❌ **Rotes X** = Fehler aufgetreten (siehe Logs für Details)

### App testen:

Nach erfolgreichem Deployment:

1. Öffne: **https://brou-cgn.github.io/recipebook**
2. Teste alle Funktionen:
   - Rezepte anzeigen
   - Neues Rezept erstellen
   - Rezept bearbeiten
   - Login/Registrierung
   - Offline-Modus (Internet ausschalten)

## 📱 Schritt 4: Als PWA installieren (Optional aber empfohlen)

### Auf dem Smartphone (Android):

1. Öffne die URL in Chrome oder Firefox
2. Tippe auf das Menü (⋮)
3. Wähle **"Zum Startbildschirm hinzufügen"**
4. Bestätige den Namen
5. Die App erscheint auf deinem Homescreen wie eine native App!

### Auf dem Smartphone (iOS):

1. Öffne die URL in Safari
2. Tippe auf das Teilen-Symbol (□↑)
3. Scrolle nach unten und wähle **"Zum Home-Bildschirm"**
4. Bestätige den Namen
5. Die App erscheint auf deinem Homescreen!

### Auf dem Desktop (Chrome/Edge):

1. Öffne die URL in Chrome oder Edge
2. Schaue in der Adressleiste nach dem Installation-Symbol (➕ oder ⬇)
3. Klicke darauf
4. Klicke auf **"Installieren"**
5. Die App öffnet sich in einem eigenen Fenster!

## 🎨 Optionale Verbesserungen

Die folgenden Schritte sind **optional** und verbessern die Sichtbarkeit und Professionalität:

### 📊 Google Analytics hinzufügen

Falls du wissen möchtest, wie viele Besucher deine App hat:

1. **Google Analytics Account erstellen**
   - Gehe zu: https://analytics.google.com
   - Erstelle ein kostenloses Konto
   - Erstelle eine neue Property für deine Website
   - Notiere die Measurement ID (sieht aus wie: `G-XXXXXXXXXX`)

2. **Analytics in deine App einbauen**
   - Öffne `public/index.html`
   - Füge vor dem schließenden `</head>`-Tag ein:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

3. Ersetze `G-XXXXXXXXXX` mit deiner echten Measurement ID

### 🌐 Eigene Domain verwenden

Statt `brou-cgn.github.io/recipebook` kannst du auch eine eigene Domain verwenden:

1. **Domain kaufen**
   - Bei einem Anbieter wie Namecheap, Google Domains, oder Strato
   - Kosten: ca. 10-20€ pro Jahr

2. **Domain mit GitHub Pages verbinden**
   - In deinem Repository: Settings → Pages → Custom domain
   - Gib deine Domain ein (z.B. `dishbook.de`)
   - Folge den Anweisungen zur DNS-Konfiguration
   - Bei deinem Domain-Anbieter: Erstelle die erforderlichen DNS-Einträge

3. **HTTPS aktivieren**
   - Warte 24 Stunden nach der DNS-Konfiguration
   - In Settings → Pages: Aktiviere "Enforce HTTPS"

### 🔍 SEO-Optimierung

Um in Suchmaschinen besser gefunden zu werden:

1. **robots.txt anpassen**
   - Datei existiert bereits in `public/robots.txt`
   - Aktuell erlaubt sie allen Suchmaschinen das Indexieren

2. **Sitemap erstellen**
   - Erstelle `public/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://brou-cgn.github.io/recipebook/</loc>
    <lastmod>2026-02-14</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
```

3. **Meta-Tags optimieren**
   - In `public/index.html` sind bereits Meta-Tags vorhanden
   - Optional: Erweitere sie um Social Media Tags (Open Graph)

4. **Bei Google registrieren**
   - Gehe zu: https://search.google.com/search-console
   - Füge deine Website hinzu
   - Verifiziere die Inhaberschaft
   - Reiche die Sitemap ein

### 🖼️ Social Media Preview

Wenn jemand deine App in Social Media teilt, sieht es professioneller aus mit einem Preview-Bild:

1. **Preview-Bild erstellen**
   - Erstelle ein Bild (empfohlen: 1200x630 Pixel)
   - Speichere es als `public/social-preview.png`

2. **Open Graph Tags hinzufügen**
   - Öffne `public/index.html`
   - Füge im `<head>`-Bereich ein:

```html
<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://brou-cgn.github.io/recipebook/">
<meta property="og:title" content="DishBook - Unsere Besten">
<meta property="og:description" content="Eine Progressive Web App zum Verwalten deiner Lieblingsrezepte">
<meta property="og:image" content="https://brou-cgn.github.io/recipebook/social-preview.png">

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="https://brou-cgn.github.io/recipebook/">
<meta property="twitter:title" content="DishBook - Unsere Besten">
<meta property="twitter:description" content="Eine Progressive Web App zum Verwalten deiner Lieblingsrezepte">
<meta property="twitter:image" content="https://brou-cgn.github.io/recipebook/social-preview.png">
```

## 🔒 Sicherheit & Datenschutz

### Datenschutzerklärung (DSGVO)

Da deine App Daten lokal im Browser speichert:

1. **Datenschutzerklärung erstellen**
   - Nutze einen Generator wie: https://www.datenschutz-generator.de
   - Erkläre, dass alle Daten lokal gespeichert werden
   - Erkläre, dass keine Daten an Server gesendet werden

2. **Link zur Datenschutzerklärung**
   - Erstelle eine Datei `DATENSCHUTZ.md`
   - Verlinke sie in deiner App (z.B. im Footer)

### Cookie-Banner

Falls du Google Analytics nutzt, **musst** du einen Cookie-Banner haben:

- Nutze eine Lösung wie: https://www.cookiebot.com (kostenlos für kleine Websites)
- Oder implementiere einen eigenen Banner

## 📈 Nach der Veröffentlichung

### Regelmäßige Wartung

1. **Updates prüfen**
   - Gehe regelmäßlich zu Actions und prüfe auf fehlgeschlagene Deployments
   - Aktualisiere Dependencies bei Sicherheitslücken

2. **Backups**
   - Git ist bereits dein Backup-System
   - Optional: Exportiere die Rezept-Daten regelmäßig

3. **Monitoring**
   - Prüfe Google Analytics (falls aktiviert)
   - Schaue dir Fehler-Reports an (falls Browser-Logs verfügbar)

### App-Updates veröffentlichen

So einfach geht's:

1. Ändere den Code lokal
2. Committe die Änderungen: `git commit -am "Beschreibung"`
3. Pushe zum main-Branch: `git push origin main`
4. Nach 1-2 Minuten ist das Update live!

## 🆘 Problemlösung

### Problem: Deployment schlägt fehl

**Symptom:** Rotes X bei GitHub Actions

**Lösung:**
1. Gehe zu Actions → Klicke auf den fehlgeschlagenen Workflow
2. Schaue dir die Logs an
3. Häufige Fehler:
   - Build-Fehler: Teste `npm run build` lokal
   - Dependency-Fehler: Führe `npm install` aus und committe `package-lock.json`
   - Permissions-Fehler: Prüfe Settings → Actions → General → Workflow permissions

### Problem: App lädt nicht (404 Fehler)

**Symptom:** https://brou-cgn.github.io/recipebook zeigt "404 Not Found"

**Lösung:**
1. Prüfe, ob GitHub Pages aktiviert ist (Settings → Pages)
2. Stelle sicher, dass "Source" auf "GitHub Actions" steht
3. Warte 5-10 Minuten nach dem ersten Deployment
4. Leere den Browser-Cache (Strg+Shift+R oder Cmd+Shift+R)

### Problem: CSS/JavaScript wird nicht geladen

**Symptom:** Weiße Seite oder fehlende Styles

**Lösung:**
1. Öffne die Browser-Konsole (F12)
2. Schaue nach 404-Fehlern
3. Prüfe, ob die `homepage` in `package.json` korrekt ist:
   ```json
   "homepage": "https://brou-cgn.github.io/recipebook"
   ```
4. Rebuild und redeploy

### Problem: Service Worker funktioniert nicht

**Symptom:** Offline-Modus funktioniert nicht

**Lösung:**
1. Service Worker benötigt HTTPS (GitHub Pages bietet dies)
2. Öffne DevTools → Application → Service Workers
3. Prüfe, ob der Service Worker registriert ist
4. Klicke "Unregister" und lade die Seite neu
5. Warte einige Sekunden, bis der SW aktiviert wird

### Problem: PWA kann nicht installiert werden

**Symptom:** Kein "Installieren"-Button erscheint

**Lösung:**
1. Stelle sicher, dass die Seite über HTTPS läuft
2. Prüfe `manifest.json` - alle erforderlichen Felder müssen ausgefüllt sein
3. Icons müssen vorhanden sein (192x192 und 512x512)
4. Service Worker muss registriert sein
5. Prüfe in DevTools → Application → Manifest auf Fehler

## 📚 Weitere Ressourcen

### Dokumentation

- **DEPLOYMENT.md** - Technische Deployment-Details
- **README.md** - Projekt-Übersicht und Features
- **NOTION_IMPORT_GUIDE.md** - Rezept-Import aus Notion

### Hilfreiche Links

- **GitHub Pages Docs:** https://docs.github.com/en/pages
- **PWA Documentation:** https://web.dev/progressive-web-apps/
- **React Documentation:** https://react.dev/
- **MDN Web Docs:** https://developer.mozilla.org/

### Support

Bei weiteren Fragen oder Problemen:
1. Prüfe die vorhandene Dokumentation
2. Schaue dir die GitHub Actions Logs an
3. Erstelle ein Issue im Repository
4. Suche auf Stack Overflow nach ähnlichen Problemen

## ✨ Zusammenfassung

### Minimale Schritte für Go-Live:

1. ✅ Package-Lock synchronisiert (bereits erledigt durch diesen PR)
2. ⚠️ GitHub Pages aktivieren (Settings → Pages → Source: GitHub Actions)
3. ⚠️ Diesen PR mergen
4. ✅ Warten (1-2 Minuten)
5. ✅ App unter https://brou-cgn.github.io/recipebook aufrufen

### Empfohlene nächste Schritte:

- Als PWA auf dem Smartphone installieren
- Rezepte hinzufügen und testen
- Mit Freunden/Familie teilen
- Feedback sammeln

### Optionale Verbesserungen (später):

- Google Analytics einrichten
- Eigene Domain kaufen und verbinden
- SEO-Optimierung
- Social Media Preview
- Datenschutzerklärung hinzufügen

---

**Viel Erfolg mit deiner App! 🎉👨‍🍳**

Bei Fragen stehe ich gerne zur Verfügung!
