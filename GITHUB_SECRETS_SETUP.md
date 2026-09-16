# GitHub Secrets einrichten / Setup GitHub Secrets

## 🔒 Problem gelöst: Leere Seite beim Deployment

Die leere Seite entstand, weil die Firebase-Konfiguration beim GitHub Actions Deployment fehlte. Dieses Problem wurde durch die Konfiguration von GitHub Secrets behoben.

## ✅ Erforderliche Schritte

Um die Web-App erfolgreich zu deployen, müssen Sie Firebase-Zugangsdaten als GitHub Secrets hinterlegen.

### 1. Firebase-Zugangsdaten abrufen

1. Gehen Sie zur [Firebase Console](https://console.firebase.google.com/)
2. Wählen Sie Ihr Projekt aus
3. Klicken Sie auf das **Zahnrad-Symbol** (⚙️) → **Projekteinstellungen**
4. Scrollen Sie zu **"Deine Apps"**
5. Wählen Sie Ihre Web-App aus
6. Klicken Sie auf **"Firebase SDK snippet"** → **"Config"**
7. Kopieren Sie die Konfigurationswerte

Sie sollten Werte wie diese sehen:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-XXXXXXXXXX"
};
```

### 2. GitHub Secrets hinzufügen

1. Gehen Sie zu Ihrem GitHub Repository: **https://github.com/brou-cgn/recipebook**
2. Klicken Sie auf **Settings** (Einstellungen)
3. Navigieren Sie im linken Menü zu **Secrets and variables** → **Actions**
4. Klicken Sie auf **New repository secret**

Fügen Sie **alle 7 Secrets** einzeln hinzu:

| Secret Name | Wert aus Firebase Config | Beispiel |
|-------------|--------------------------|----------|
| `REACT_APP_FIREBASE_API_KEY` | `apiKey` | `AIzaSy...` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `authDomain` | `your-project.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | `projectId` | `your-project` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `storageBucket` | `your-project.firebasestorage.app` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | `123456789` |
| `REACT_APP_FIREBASE_APP_ID` | `appId` | `1:123456789:web:abc123` |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | `measurementId` | `G-XXXXXXXXXX` |

**Wichtig:** 
- Der **Name** des Secrets muss exakt wie in der Tabelle sein (inklusive `REACT_APP_` Präfix)
- Der **Wert** entspricht dem jeweiligen Wert aus Ihrer Firebase-Konfiguration

### 3. Deployment auslösen

Nachdem alle Secrets hinzugefügt wurden:

1. Gehen Sie zu **Actions** in Ihrem Repository
2. Wählen Sie den Workflow **"Deploy to Firebase Hosting"**
3. Klicken Sie auf **Run workflow** → **Run workflow**

Oder pushen Sie einfach eine Änderung zum `main`-Branch:
```bash
git commit --allow-empty -m "Trigger deployment with Firebase secrets"
git push origin main
```

### 4. Überprüfung

Nach erfolgreichem Deployment (grüner Haken ✅ bei Actions):
- Öffnen Sie **https://broubook.web.app/**
- Die Web-App sollte nun korrekt geladen werden
- Sie sollten die Login-Seite sehen

## 🔍 Was wurde geändert?

Die GitHub Actions Workflow-Datei (`.github/workflows/deploy.yml`) wurde aktualisiert, um die Firebase-Umgebungsvariablen aus den GitHub Secrets während des Build-Prozesses zu verwenden.

## 📚 Weitere Informationen

- Detaillierte Deployment-Anleitung: [DEPLOYMENT.md](DEPLOYMENT.md)
- Firebase Setup Guide: [FIREBASE_SETUP.md](FIREBASE_SETUP.md)

## ❓ Problemlösung

**Problem: Secrets wurden hinzugefügt, aber die Seite ist immer noch leer**
- Lösung: Stellen Sie sicher, dass das Deployment nach dem Hinzufügen der Secrets erneut ausgeführt wurde
- Überprüfen Sie die Action-Logs auf Fehler

**Problem: Build schlägt fehl**
- Lösung: Überprüfen Sie, dass alle 7 Secret-Namen korrekt geschrieben sind (mit `REACT_APP_` Präfix)
- Stellen Sie sicher, dass die Werte korrekt aus der Firebase Console kopiert wurden

**Problem: Login funktioniert nicht**
- Lösung: Überprüfen Sie in der Firebase Console, ob die Authentifizierung (Authentication) aktiviert ist
- Stellen Sie sicher, dass die Email/Password-Anmeldemethode aktiviert ist
