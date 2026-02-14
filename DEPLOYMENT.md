# Deployment-Anleitung / Deployment Guide

## 🌐 Web-Veröffentlichung über GitHub Pages

Diese Anwendung wird automatisch auf GitHub Pages veröffentlicht, sobald Änderungen in den `main`-Branch gepusht werden.

### Live-URL
Die Anwendung ist verfügbar unter:
**https://brou-cgn.github.io/recipebook**

---

## 📋 Einrichtungsschritte (Erstmalige Konfiguration)

### 1. GitHub Pages in den Repository-Einstellungen aktivieren

1. Gehe zu deinem GitHub Repository: `https://github.com/brou-cgn/recipebook`
2. Klicke auf **Settings** (Einstellungen)
3. Navigiere im linken Menü zu **Pages**
4. Unter "Build and deployment":
   - **Source**: Wähle "GitHub Actions"
   - Die Konfiguration wird automatisch erkannt

### 2. Firebase Secrets konfigurieren (WICHTIG!)

Die Anwendung benötigt Firebase-Zugangsdaten für die Authentifizierung und Datenbank. Diese müssen als GitHub Secrets hinterlegt werden:

1. Gehe zu **Settings** → **Secrets and variables** → **Actions**
2. Klicke auf **New repository secret**
3. Füge folgende Secrets hinzu (Werte aus deiner Firebase Console):
   - `REACT_APP_FIREBASE_API_KEY`
   - `REACT_APP_FIREBASE_AUTH_DOMAIN`
   - `REACT_APP_FIREBASE_PROJECT_ID`
   - `REACT_APP_FIREBASE_STORAGE_BUCKET`
   - `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
   - `REACT_APP_FIREBASE_APP_ID`
   - `REACT_APP_FIREBASE_MEASUREMENT_ID`

**Wo finde ich diese Werte?**
1. Gehe zu [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt aus
3. Klicke auf das Zahnrad-Symbol → **Projekteinstellungen**
4. Scrolle zu "Deine Apps" und wähle deine Web-App
5. Die Konfigurationswerte findest du unter "Firebase SDK snippet" → "Config"

### 3. Workflow-Berechtigung überprüfen

1. Gehe zu **Settings** → **Actions** → **General**
2. Scrolle zu "Workflow permissions"
3. Stelle sicher, dass folgende Option aktiviert ist:
   - ✅ "Read and write permissions" ODER
   - ✅ "Read repository contents and packages permissions" mit zusätzlicher Pages-Berechtigung

### 4. Deployment starten

Das Deployment startet automatisch bei jedem Push zum `main`-Branch.

#### Manuelles Deployment auslösen:
1. Gehe zu **Actions** in deinem Repository
2. Wähle den Workflow "Deploy to GitHub Pages"
3. Klicke auf **Run workflow** → **Run workflow**

---

## 🚀 Deployment-Prozess

### Automatischer Ablauf

Jedes Mal, wenn Code in den `main`-Branch gepusht wird:

1. **Build-Job**:
   - Checkout des Codes
   - Installation der Node.js-Dependencies (`npm ci`)
   - Build der React-Anwendung (`npm run build`)
   - Upload des Build-Artefakts

2. **Deploy-Job**:
   - Deployment des Build-Artefakts zu GitHub Pages
   - Die Anwendung wird unter der Live-URL verfügbar

### Deployment-Status überprüfen

1. Gehe zu **Actions** in deinem Repository
2. Sieh dir die laufenden/abgeschlossenen Workflows an
3. Klicke auf einen Workflow-Run für Details
4. Grüner Haken ✅ = Erfolgreiches Deployment
5. Rotes X ❌ = Fehler (Details in den Logs)

---

## 🔧 Lokales Testen des Production Builds

Bevor du Änderungen pushst, kannst du den Production Build lokal testen:

```bash
# Build erstellen
npm run build

# Build-Ordner lokal bereitstellen (serve muss installiert sein)
npx serve -s build
```

Die Anwendung ist dann unter `http://localhost:3000` (oder einem anderen Port) verfügbar.

---

## 📝 Wichtige Konfigurationsdateien

### package.json
- **homepage**: Definiert die Base-URL für GitHub Pages
  ```json
  "homepage": "https://brou-cgn.github.io/recipebook"
  ```

### .github/workflows/deploy.yml
- GitHub Actions Workflow für automatisches Deployment
- Wird bei Push zu `main` oder manuell ausgelöst
- Führt Build und Deployment aus

---

## 🛠️ Troubleshooting

### Problem: Leere Seite / Blank Page
**Ursache**: Firebase-Konfiguration fehlt
**Lösung**: 
- Überprüfe, ob alle Firebase Secrets in GitHub Actions konfiguriert sind (siehe Schritt 2 oben)
- Alle 7 REACT_APP_FIREBASE_* Secrets müssen gesetzt sein
- Nach dem Hinzufügen der Secrets muss das Deployment erneut ausgelöst werden

### Problem: Deployment schlägt fehl
**Lösung**: 
- Überprüfe die Workflow-Logs unter **Actions**
- Stelle sicher, dass `npm run build` lokal funktioniert
- Prüfe, ob alle Dependencies korrekt installiert sind

### Problem: Seite zeigt 404-Fehler
**Lösung**:
- Überprüfe, ob GitHub Pages aktiviert ist (Settings → Pages)
- Stelle sicher, dass "Source" auf "GitHub Actions" gesetzt ist
- Warte einige Minuten nach dem Deployment

### Problem: Assets werden nicht geladen (CSS/JS)
**Lösung**:
- Überprüfe die `homepage`-Einstellung in `package.json`
- Stelle sicher, dass sie mit deiner GitHub Pages URL übereinstimmt

### Problem: PWA funktioniert nicht offline
**Lösung**:
- Service Worker benötigt HTTPS (GitHub Pages bietet dies automatisch)
- Lösche Browser-Cache und lade die Seite neu
- Überprüfe, ob der Service Worker in den Browser DevTools registriert ist

---

## 🔄 Updates veröffentlichen

Um eine neue Version zu veröffentlichen:

```bash
# Änderungen committen
git add .
git commit -m "Deine Commit-Nachricht"

# Zum main-Branch pushen
git push origin main
```

Das Deployment startet automatisch und die Änderungen sind innerhalb weniger Minuten live.

---

## 📱 PWA-Features

Die veröffentlichte Anwendung unterstützt Progressive Web App Features:

- ✅ **Installierbar**: Nutzer können die App auf ihrem Gerät installieren
- ✅ **Offline-Funktionalität**: Funktioniert offline nach der ersten Nutzung
- ✅ **Service Worker**: Automatisches Caching für bessere Performance
- ✅ **HTTPS**: Sicher über GitHub Pages
- ✅ **Responsive**: Optimiert für mobile Geräte und Desktop

---

## 🌍 Alternative Deployment-Optionen

Falls GitHub Pages nicht ausreicht, kannst du auch andere Plattformen nutzen:

- **Vercel**: Automatisches Deployment bei Git Push
- **Netlify**: Ähnlich wie Vercel mit zusätzlichen Features
- **Firebase Hosting**: Google's Hosting-Lösung
- **Cloudflare Pages**: Schnelles CDN-basiertes Hosting

---

## 📞 Support

Bei Problemen oder Fragen:
1. Überprüfe die GitHub Actions Logs
2. Siehe dir die Deployment-Dokumentation an
3. Erstelle ein Issue im Repository

---

**Viel Erfolg mit deiner Web-Veröffentlichung! 🎉**
