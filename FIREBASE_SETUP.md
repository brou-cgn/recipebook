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

Für zusätzliche Firebase-Services (bereits installiert):
```bash
npm install @firebase/firestore @firebase/auth
```

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

### Umgebungsvariablen für GitHub Pages

Wenn Sie die App auf GitHub Pages deployen:

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
