# Firebase Einrichtung für RecipeBook 🔥

Diese Anleitung erklärt Schritt für Schritt, wie Sie Firebase in Ihrem RecipeBook-Projekt aktivieren und nutzen können.

## Übersicht

RecipeBook nutzt Firebase für folgende Funktionen:
- **Firestore Database**: Speicherung von Rezepten, Menüs und Benutzerdaten
- **Firebase Authentication**: Benutzerverwaltung und Authentifizierung
- **Offline Persistence**: Offline-Zugriff auf Daten (PWA-Unterstützung)

## Voraussetzungen

- Node.js (Version 14 oder höher)
- Ein Google-Konto
- Grundkenntnisse in der Verwendung der Kommandozeile

## Schritt 1: Firebase-Projekt anlegen

1. Gehen Sie zur [Firebase Console](https://console.firebase.google.com/)
2. Klicken Sie auf **"Projekt hinzufügen"** (Add Project)
3. Geben Sie Ihrem Projekt einen Namen (z.B. "recipebook" oder "broubook")
4. Optional: Google Analytics aktivieren (empfohlen für Produktionsumgebungen)
5. Klicken Sie auf **"Projekt erstellen"**

## Schritt 2: Web-App registrieren

1. Im Firebase-Projekt-Dashboard klicken Sie auf das **Web-Icon** (`</>`)
2. Geben Sie einen App-Spitznamen ein (z.B. "RecipeBook Web App")
3. Optional: Firebase Hosting einrichten (kann später gemacht werden)
4. Klicken Sie auf **"App registrieren"**
5. **Wichtig**: Kopieren Sie die Konfigurationsdaten - Sie benötigen diese im nächsten Schritt

Die Konfiguration sieht ungefähr so aus:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ihr-projekt.firebaseapp.com",
  projectId: "ihr-projekt",
  storageBucket: "ihr-projekt.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
  measurementId: "G-XXXXXXXXXX"
};
```

## Schritt 3: Firebase SDK installieren

Das Firebase SDK ist bereits in diesem Projekt installiert. Falls Sie es in einem neuen Projekt installieren müssen:

```bash
npm install firebase
```

**Hinweis**: Das `firebase` Paket enthält alle benötigten Module (Firestore, Auth, etc.) und wird modular importiert. Es ist nicht notwendig, zusätzliche Pakete wie `@firebase/firestore` oder `@firebase/auth` separat zu installieren.

## Schritt 4: Firebase konfigurieren

1. Erstellen Sie eine Datei namens `.env.local` im Hauptverzeichnis des Projekts
2. Kopieren Sie den Inhalt aus `.env.example` in die neue `.env.local` Datei
3. Ersetzen Sie die Platzhalterwerte mit Ihren Firebase-Konfigurationsdaten:

```env
REACT_APP_FIREBASE_API_KEY=Ihr_API_Key
REACT_APP_FIREBASE_AUTH_DOMAIN=ihr-projekt.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=ihr-projekt
REACT_APP_FIREBASE_STORAGE_BUCKET=ihr-projekt.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=Ihre_Sender_ID
REACT_APP_FIREBASE_APP_ID=Ihre_App_ID
REACT_APP_FIREBASE_MEASUREMENT_ID=Ihre_Measurement_ID
```

**Wichtig**: Die `.env.local` Datei wird automatisch von Git ignoriert und sollte **niemals** in die Versionsverwaltung eingecheckt werden!

## Schritt 5: Firestore Database einrichten

1. Gehen Sie in der Firebase Console zu **"Firestore Database"**
2. Klicken Sie auf **"Datenbank erstellen"**
3. Wählen Sie **"Im Produktionsmodus starten"** (wir konfigurieren die Regeln später)
4. Wählen Sie einen Standort für Ihre Datenbank (z.B. europe-west3 für Frankfurt)

### Firestore Sicherheitsregeln

Setzen Sie die folgenden Sicherheitsregeln in der Firebase Console (Firestore Database → Regeln):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Hilfsfunktion: Prüft ob Benutzer authentifiziert ist
    function isSignedIn() {
      return request.auth != null;
    }
    
    // Rezepte: Nur authentifizierte Benutzer können lesen/schreiben
    match /recipes/{recipeId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn();
    }
    
    // Benutzer: Nur authentifizierte Benutzer können ihre eigenen Daten lesen/schreiben
    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == userId;
    }
    
    // Menüs: Nur authentifizierte Benutzer können lesen/schreiben
    match /menus/{menuId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn();
    }
    
    // Favoriten: Benutzer können nur ihre eigenen Favoriten verwalten
    match /userFavorites/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
    
    // Menü-Favoriten: Benutzer können nur ihre eigenen Favoriten verwalten
    match /menuFavorites/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
    
    // Custom Lists: Benutzer können nur ihre eigenen Listen verwalten
    match /customLists/{userId} {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
  }
}
```

## Schritt 6: Firebase Authentication einrichten

1. Gehen Sie in der Firebase Console zu **"Authentication"**
2. Klicken Sie auf **"Jetzt starten"**
3. Wählen Sie unter **"Sign-in method"** die Methode **"E-Mail/Passwort"**
4. Aktivieren Sie diese Methode und speichern Sie die Änderungen

**Hinweis**: RecipeBook verwendet eine benutzerdefinierte E-Mail/Passwort-Authentifizierung mit lokaler Benutzerverwaltung in Firestore.

## Schritt 7: Anwendung testen

1. Starten Sie die Entwicklungsumgebung:
   ```bash
   npm start
   ```

2. Öffnen Sie die Anwendung im Browser: [http://localhost:3000](http://localhost:3000)

3. Testen Sie die Funktionen:
   - Registrieren Sie einen neuen Benutzer
   - Melden Sie sich an
   - Erstellen Sie ein Rezept
   - Überprüfen Sie in der Firebase Console, ob die Daten in Firestore gespeichert werden

## Schritt 8: Für Produktion vorbereiten

### Umgebungsvariablen für das Deployment

Der Build läuft in GitHub Actions und deployt auf Firebase Hosting:

1. Gehen Sie zu Ihren GitHub Repository-Einstellungen
2. Navigieren Sie zu **Settings → Secrets and variables → Actions**
3. Fügen Sie die folgenden Secrets hinzu:
   - `REACT_APP_FIREBASE_API_KEY`
   - `REACT_APP_FIREBASE_AUTH_DOMAIN`
   - `REACT_APP_FIREBASE_PROJECT_ID`
   - `REACT_APP_FIREBASE_STORAGE_BUCKET`
   - `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
   - `REACT_APP_FIREBASE_APP_ID`
   - `REACT_APP_FIREBASE_MEASUREMENT_ID`
   - `REACT_APP_FIREBASE_VAPID_KEY`

### Build erstellen

```bash
npm run build
```

Die optimierten Dateien befinden sich im `build/` Ordner.

## Verfügbare Firebase Services in RecipeBook

### 1. Firestore Database
- **Zweck**: Persistente Datenspeicherung
- **Verwendung**: Rezepte, Menüs, Benutzerdaten, Favoriten
- **Offline-Unterstützung**: Ja (IndexedDB Persistence)

### 2. Firebase Authentication
- **Zweck**: Benutzerverwaltung
- **Verwendung**: Login, Registrierung, Sitzungsverwaltung
- **Methoden**: E-Mail/Passwort

### 3. Offline Persistence
- **Zweck**: PWA-Unterstützung
- **Verwendung**: Offline-Zugriff auf Rezepte und Daten
- **Technologie**: Workbox + Firestore Persistence

## Fehlerbehebung

### Problem: "Firebase configuration is missing"

**Lösung**: 
- Stellen Sie sicher, dass die `.env.local` Datei existiert
- Überprüfen Sie, dass alle Umgebungsvariablen korrekt gesetzt sind
- Starten Sie den Entwicklungsserver neu (`npm start`)

### Problem: "Firebase: Error (auth/operation-not-allowed)"

**Lösung**:
- Aktivieren Sie E-Mail/Passwort-Authentifizierung in der Firebase Console
- Gehen Sie zu Authentication → Sign-in method → E-Mail/Passwort

### Problem: "Missing or insufficient permissions"

**Lösung**:
- Überprüfen Sie die Firestore-Sicherheitsregeln
- Stellen Sie sicher, dass Sie angemeldet sind
- Prüfen Sie in der Firebase Console unter "Firestore Database → Regeln"

### Problem: Daten werden nicht synchronisiert

**Lösung**:
- Überprüfen Sie Ihre Internetverbindung
- Öffnen Sie die Browser-Konsole auf Fehlermeldungen
- Prüfen Sie den Status in der Firebase Console

## Weitere Ressourcen

- [Firebase Dokumentation](https://firebase.google.com/docs)
- [Firestore Dokumentation](https://firebase.google.com/docs/firestore)
- [Firebase Authentication Dokumentation](https://firebase.google.com/docs/auth)
- [React Firebase Hooks](https://github.com/CSFrequency/react-firebase-hooks)

## Support

Bei Fragen oder Problemen:
1. Überprüfen Sie die Browser-Konsole auf Fehlermeldungen
2. Schauen Sie in die Firebase Console für detaillierte Logs
3. Erstellen Sie ein Issue in diesem Repository

---

**Viel Erfolg mit RecipeBook und Firebase! 🎉**

---

## Nach der Einrichtung: Nächste Schritte

Nachdem Sie Firebase erfolgreich eingerichtet haben, folgen hier die wichtigsten Schritte für den produktiven Einsatz:

### 1. Erste Schritte in der Anwendung

#### Erster Benutzer registrieren
1. Öffnen Sie die Anwendung im Browser
2. Klicken Sie auf **"Registrieren"**
3. Geben Sie Ihre Daten ein (Vorname, Nachname, E-Mail, Passwort)
4. Der erste Benutzer wird automatisch als **Administrator** angelegt

#### Als Administrator anmelden
- Sie haben als erster Benutzer automatisch alle Rechte
- Sie können weitere Benutzer verwalten und Berechtigungen zuweisen

### 2. Benutzerverwaltung einrichten

#### Weitere Benutzer hinzufügen
1. Andere Benutzer können sich über die Registrierungsseite registrieren
2. Neue Benutzer erhalten standardmäßig **Lesen**-Rechte
3. Als Administrator können Sie die Berechtigungen anpassen

#### Berechtigungen zuweisen
1. Gehen Sie zu **Einstellungen → Benutzerverwaltung**
2. Klicken Sie auf das 🔐-Symbol neben einem Benutzer
3. Wählen Sie die gewünschte Berechtigung:
   - **Administrator**: Volle Kontrolle
   - **Bearbeiten**: Rezepte erstellen und bearbeiten
   - **Kommentieren**: Kommentare hinzufügen (zukünftig)
   - **Lesen**: Nur Rezepte ansehen

### 3. Rezepte verwalten

#### Erstes Rezept erstellen
1. Klicken Sie auf **"+ Rezept hinzufügen"**
2. Füllen Sie alle Felder aus:
   - Titel (Pflichtfeld)
   - Bild-URL (optional)
   - Zutaten (mindestens eine)
   - Zubereitungsschritte (mindestens einer)
   - Kategorien und Tags
3. Klicken Sie auf **"Rezept speichern"**
4. Das Rezept wird sofort in Firestore gespeichert

#### Rezepte organisieren
- Nutzen Sie **Kategorien** zur Einteilung (Hauptgericht, Dessert, etc.)
- Markieren Sie Favoriten mit dem ⭐-Symbol
- Erstellen Sie **Menüs** für besondere Anlässe
- Nutzen Sie die **Versionen-Funktion** für Rezeptvarianten

### 4. Firestore-Daten überwachen

#### In der Firebase Console
1. Öffnen Sie die [Firebase Console](https://console.firebase.google.com/)
2. Wählen Sie Ihr Projekt
3. Gehen Sie zu **Firestore Database**
4. Überprüfen Sie die erstellten Collections:
   - `recipes` - Alle Rezepte
   - `users` - Benutzerdaten
   - `menus` - Erstellte Menüs
   - `userFavorites` - Favoriten pro Benutzer
   - `menuFavorites` - Menü-Favoriten
   - `customLists` - Benutzerdefinierte Listen

### 5. Sicherheit und Wartung

#### Regelmäßige Überprüfungen
- **Firestore-Regeln**: Überprüfen Sie monatlich die Sicherheitsregeln
- **Benutzer**: Deaktivieren oder löschen Sie inaktive Benutzer
- **Datenbank-Größe**: Überwachen Sie das Firestore-Nutzungskontingent
- **Authentifizierung**: Prüfen Sie verdächtige Anmeldeversuche

#### Backup-Strategie
- **Firebase Exports**: Nutzen Sie Firebase-Exports für regelmäßige Backups
- **Lokale Kopien**: Die App nutzt IndexedDB für Offline-Kopien
- **Export-Funktion**: Implementieren Sie ggf. eine manuelle Export-Funktion

### 6. Performance-Optimierung

#### Firestore-Nutzung optimieren
- **Indizes erstellen**: Firebase erstellt automatisch Indizes bei Bedarf
- **Abfragen begrenzen**: Die App nutzt bereits Pagination
- **Offline-First**: Nutzen Sie die Offline-Funktionalität für bessere Performance

#### App-Performance
- **Service Worker**: Ist bereits für Offline-Unterstützung konfiguriert
- **Caching**: Bilder und statische Assets werden gecacht
- **Lazy Loading**: Erwägen Sie Lazy Loading für große Bilddateien

### 7. Deployment auf Firebase Hosting

#### Umgebungsvariablen in GitHub Actions
Falls noch nicht geschehen:

1. Gehen Sie zu **Settings → Secrets and variables → Actions**
2. Klicken Sie auf **"New repository secret"**
3. Fügen Sie alle Firebase-Variablen einzeln hinzu:
   ```
   Name: REACT_APP_FIREBASE_API_KEY
   Value: [Ihr API Key aus .env.local]
   ```
4. Wiederholen Sie dies für alle 7 Umgebungsvariablen

#### GitHub Actions Workflow überprüfen
- Der Deploy läuft über `.github/workflows/deploy-firebase.yml` und wird
  automatisch nach jedem Version Bump auf `main` ausgelöst
- Überprüfen Sie unter **Actions** ob Deployments erfolgreich sind
- Bei Fehlern prüfen Sie die Logs
- Die vollständige Kette ist in [DEPLOYMENT.md](deployment.md) beschrieben

#### Eigene Domain einrichten (optional)
1. In der Firebase Console: **Hosting → Eigene Domain hinzufügen**
2. Geben Sie Ihre Domain ein (z.B. `rezepte.ihredomain.de`)
3. Konfigurieren Sie die von Firebase angezeigten DNS-Einträge bei Ihrem
   Domain-Anbieter
4. Firebase stellt das TLS-Zertifikat automatisch aus

### 8. Erweiterte Funktionen nutzen

#### Menü-Planung
- Erstellen Sie Wochenmenüs aus Ihren Rezepten
- Kombinieren Sie Vorspeise, Hauptgang und Dessert
- Markieren Sie Lieblings-Menüs

#### Custom Lists
- Erstellen Sie Einkaufslisten
- Organisieren Sie Rezepte nach Themen
- Nutzen Sie Listen für besondere Anlässe

#### PWA-Installation
- Installieren Sie die App auf dem Smartphone (Add to Home Screen)
- Nutzen Sie die App offline
- Synchronisation erfolgt automatisch bei Internetverbindung

### 9. Monitoring und Analytics

#### Firebase Analytics (optional)
Falls Sie Google Analytics aktiviert haben:
1. Öffnen Sie **Analytics** in der Firebase Console
2. Überprüfen Sie Nutzungsstatistiken
3. Analysieren Sie beliebte Rezepte
4. Überwachen Sie aktive Benutzer

#### Performance Monitoring
1. Gehen Sie zu **Performance** in der Firebase Console
2. Überwachen Sie Ladezeiten
3. Identifizieren Sie Engpässe
4. Optimieren Sie langsame Abfragen

### 10. Häufige Aufgaben

#### Passwort zurücksetzen (Administrator)
1. **Einstellungen → Benutzerverwaltung**
2. Klicken Sie auf 🔑 neben dem Benutzer
3. Setzen Sie ein temporäres Passwort
4. Informieren Sie den Benutzer

#### Rezept-Duplikate vermeiden
- Nutzen Sie die **Versionen-Funktion** statt neue Rezepte zu erstellen
- Erstellen Sie eine neue Version mit dem 📋-Symbol

#### Daten exportieren
- Nutzen Sie die Firebase Console für manuelle Exports
- Firestore Database → Export/Import
- Wählen Sie Collections aus

### 11. Troubleshooting im laufenden Betrieb

#### Synchronisationsprobleme
- Prüfen Sie die Internetverbindung
- Öffnen Sie die Browser-Entwicklertools (F12)
- Schauen Sie im **Console**-Tab nach Fehlern
- Prüfen Sie im **Network**-Tab die Firebase-Verbindungen

#### Benutzer kann sich nicht anmelden
- Überprüfen Sie in Firebase Console unter **Authentication**
- Stellen Sie sicher, dass E-Mail/Passwort aktiviert ist
- Prüfen Sie ob der Benutzer in Firestore unter `users` existiert

#### Rezepte werden nicht angezeigt
- Prüfen Sie Firestore-Sicherheitsregeln
- Stellen Sie sicher, dass der Benutzer angemeldet ist
- Überprüfen Sie Browser-Konsole auf Fehler

### 12. Best Practices

#### Datenstruktur
- **Konsistente Kategorien**: Legen Sie feste Kategorien fest
- **Einheitliche Tags**: Verwenden Sie konsistente Tag-Namen
- **Rezept-IDs**: Werden automatisch von Firestore vergeben

#### Bildverwaltung
- **Externe URLs**: Nutzen Sie zuverlässige Bild-Hosting-Dienste
- **Optimierte Bilder**: Komprimieren Sie Bilder vor dem Upload
- **HTTPS**: Verwenden Sie nur HTTPS-URLs für Bilder

#### Teamarbeit
- **Berechtigungen**: Vergeben Sie nur notwendige Rechte
- **Kommunikation**: Nutzen Sie GitHub Issues für Feedback
- **Versionierung**: Nutzen Sie die Rezept-Versionen-Funktion

---

## Checkliste: Nach der Einrichtung

- [ ] Erste Benutzer registriert (wird automatisch Administrator)
- [ ] Firestore-Sicherheitsregeln veröffentlicht
- [ ] Mindestens ein Test-Rezept erstellt
- [ ] Daten erscheinen in Firebase Console
- [ ] Weitere Benutzer registriert und Berechtigungen zugewiesen
- [ ] GitHub Actions Secrets konfiguriert (für Deployment)
- [ ] App auf Firebase Hosting deployed (https://broubook.web.app)
- [ ] PWA auf Mobilgerät installiert und getestet
- [ ] Offline-Funktionalität getestet
- [ ] Backup-Strategie festgelegt

---

## Weiterführende Dokumentation

- **[README.md](../../README.md)** - Allgemeine Projektinformationen
- **[DEPLOYMENT.md](deployment.md)** - Die Deploy-Kette, benötigte Secrets, Rollback

---

**Bei weiteren Fragen erstellen Sie bitte ein Issue im Repository! 💬**

## CORS-Fehler Behebung für Firebase Storage

_Quelle: `CORS_FIX_ANLEITUNG.md` (zusammengeführt)._

### Problem
CORS-Fehler beim Speichern von Menüs und Laden von Bildern aus Firebase Storage.

### Lösung

#### 1. CORS-Konfiguration auf Firebase Storage anwenden

Die CORS-Konfiguration muss mit dem Google Cloud SDK auf deinen Firebase Storage Bucket angewendet werden.

##### Installation des Google Cloud SDK

**Mac (mit Homebrew):**
```bash
brew install google-cloud-sdk
```

**Windows:**
Lade den Installer herunter: https://cloud.google.com/sdk/docs/install#windows

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

##### CORS-Konfiguration anwenden

1. **Authentifizieren:**
   ```bash
   gcloud auth login
   ```

2. **Projekt setzen:**
   ```bash
   gcloud config set project [DEIN-PROJEKT-ID]
   ```

   Ersetze `[DEIN-PROJEKT-ID]` mit deiner Firebase Project ID (z.B. `broubook`)

3. **CORS-Konfiguration anwenden:**
   ```bash
   gcloud storage buckets update gs://[DEIN-PROJEKT-ID].appspot.com --cors-file=storage-cors.json
   ```

   Oder wenn dein Bucket einen anderen Namen hat:
   ```bash
   gcloud storage buckets update gs://broubook.firebasestorage.app --cors-file=storage-cors.json
   ```

4. **CORS-Konfiguration überprüfen:**
   ```bash
   gcloud storage buckets describe gs://[DEIN-PROJEKT-ID].appspot.com --format="default(cors_config)"
   ```

#### 2. Firebase Storage Rules deployen

Deploye die neuen Storage Security Rules:

```bash
firebase deploy --only storage
```

#### 3. Firestore Rules deployen (falls noch nicht geschehen)

```bash
firebase deploy --only firestore
```

#### 4. Testen

1. Öffne deine App: `https://[DEIN-PROJEKT-ID].web.app`
2. Versuche ein Menü zu speichern
3. Die CORS-Fehler sollten nicht mehr auftreten

### Troubleshooting

#### Fehler: "gcloud: command not found"

Das Google Cloud SDK ist nicht korrekt installiert oder nicht im PATH.

**Lösung:**
- Mac: `source ~/google-cloud-sdk/path.bash.inc`
- Linux: Führe `exec -l $SHELL` nach der Installation aus
- Windows: Starte die Command Prompt neu

#### Fehler: "AccessDeniedException: 403"

Du hast keine Berechtigung für den Storage Bucket.

**Lösung:**
1. Stelle sicher, dass du der Owner des Firebase-Projekts bist
2. Gehe zur Google Cloud Console: https://console.cloud.google.com/
3. Wähle dein Projekt aus
4. Gehe zu "IAM & Admin" → "IAM"
5. Stelle sicher, dass dein Account die Rolle "Storage Admin" hat

#### Bucket-Name herausfinden

Falls du nicht sicher bist, wie dein Storage Bucket heißt:

1. Gehe zur Firebase Console: https://console.firebase.google.com/
2. Wähle dein Projekt
3. Gehe zu "Storage"
4. Der Bucket-Name steht oben (z.B. `broubook.appspot.com` oder `broubook.firebasestorage.app`)

### Weitere Informationen

- [Firebase Storage CORS Dokumentation](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
- [Google Cloud SDK Installation](https://cloud.google.com/sdk/docs/install)
- [CORS mit gcloud storage einrichten](https://cloud.google.com/storage/docs/using-cors)

## Puppeteer Installation für Webimport

_Quelle: `PUPPETEER_INSTALLATION.md` (zusammengeführt)._

### Schnellstart

Um die Webimport-Screenshot-Funktion zu aktivieren, muss Puppeteer installiert werden:

```bash
## Im Hauptverzeichnis
cd functions
npm install puppeteer@^21.0.0
cd ..
firebase deploy --only functions:captureWebsiteScreenshot
```

### Cloud Functions Anpassungen

Die Cloud Function `captureWebsiteScreenshot` in `functions/index.js` ist bereits vorbereitet.

Nach der Puppeteer-Installation:

1. Öffne `functions/index.js`
2. Navigiere zur `captureWebsiteScreenshot` Funktion
3. Entkommentiere den Puppeteer-Code (markiert mit `// Future implementation would look like:`)
4. Entferne die Fehler-Meldung über die fehlende Puppeteer-Installation

#### Beispiel-Code (bereits in der Funktion vorhanden):

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

### Ressourcen-Empfehlungen

Für Puppeteer benötigt die Cloud Function mehr Ressourcen:

```javascript
exports.captureWebsiteScreenshot = onCall({
  maxInstances: 10,
  memory: '2GiB',      // Erhöht von 1GiB
  timeoutSeconds: 60,  // Bleibt bei 60s
}, ...)
```

### Alternative: Externe Screenshot-Services

Falls Puppeteer zu ressourcenintensiv ist, könnten auch externe Services verwendet werden:

- **ScreenshotAPI**: https://screenshotapi.net/
- **Urlbox**: https://urlbox.io/
- **Screenshot One**: https://screenshotone.com/

Diese Services würden die `captureWebsiteScreenshot` Funktion vereinfachen und die Kosten möglicherweise reduzieren.

### Kosten

Beachten Sie:
- Puppeteer benötigt mehr Memory (2GB statt 1GB)
- Längere Ausführungszeit (10-15s pro Screenshot)
- Firebase bietet ein kostenloses Kontingent, danach Pay-as-you-go

Mit den aktuellen Rate Limits (20 Scans/Tag für authentifizierte Benutzer) sollten die Kosten minimal sein.

### Testing

Nach der Installation testen Sie mit:

1. Melden Sie sich als Benutzer mit Webimport-Berechtigung an
2. Öffnen Sie "Neues Rezept hinzufügen"
3. Klicken Sie auf den Webimport-Button (🌐)
4. Geben Sie eine Test-URL ein (z.B. https://www.chefkoch.de/rezepte/...)
5. Überprüfen Sie, ob der Screenshot erfasst und analysiert wird

### Troubleshooting

#### "Error: Failed to launch the browser process"

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

#### "Timeout exceeded"

Erhöhen Sie den Timeout:
```javascript
await page.goto(url, { 
  waitUntil: 'networkidle0',
  timeout: 60000  // 60 Sekunden
});
```

#### Memory Errors

Erhöhen Sie das Memory-Limit in der Cloud Function Konfiguration:
```javascript
memory: '4GiB'
```
