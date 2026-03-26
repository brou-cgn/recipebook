# CORS-Fehler Behebung für Firebase Storage

## Problem
CORS-Fehler beim Speichern von Menüs und Laden von Bildern aus Firebase Storage.

## Lösung

### 1. CORS-Konfiguration auf Firebase Storage anwenden

Die CORS-Konfiguration muss mit dem Google Cloud SDK auf deinen Firebase Storage Bucket angewendet werden.

#### Installation des Google Cloud SDK

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

#### CORS-Konfiguration anwenden

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
   gsutil cors set storage-cors.json gs://[DEIN-PROJEKT-ID].appspot.com
   ```

   Oder wenn dein Bucket einen anderen Namen hat:
   ```bash
   gsutil cors set storage-cors.json gs://broubook.firebasestorage.app
   ```

4. **CORS-Konfiguration überprüfen:**
   ```bash
   gsutil cors get gs://[DEIN-PROJEKT-ID].appspot.com
   ```

### 2. Firebase Storage Rules deployen

Deploye die neuen Storage Security Rules:

```bash
firebase deploy --only storage
```

### 3. Firestore Rules deployen (falls noch nicht geschehen)

```bash
firebase deploy --only firestore
```

### 4. Testen

1. Öffne deine App: `https://[DEIN-PROJEKT-ID].web.app`
2. Versuche ein Menü zu speichern
3. Die CORS-Fehler sollten nicht mehr auftreten

## Troubleshooting

### Fehler: "gsutil: command not found"

Das Google Cloud SDK ist nicht korrekt installiert oder nicht im PATH.

**Lösung:**
- Mac: `source ~/google-cloud-sdk/path.bash.inc`
- Linux: Führe `exec -l $SHELL` nach der Installation aus
- Windows: Starte die Command Prompt neu

### Fehler: "AccessDeniedException: 403"

Du hast keine Berechtigung für den Storage Bucket.

**Lösung:**
1. Stelle sicher, dass du der Owner des Firebase-Projekts bist
2. Gehe zur Google Cloud Console: https://console.cloud.google.com/
3. Wähle dein Projekt aus
4. Gehe zu "IAM & Admin" → "IAM"
5. Stelle sicher, dass dein Account die Rolle "Storage Admin" hat

### Bucket-Name herausfinden

Falls du nicht sicher bist, wie dein Storage Bucket heißt:

1. Gehe zur Firebase Console: https://console.firebase.google.com/
2. Wähle dein Projekt
3. Gehe zu "Storage"
4. Der Bucket-Name steht oben (z.B. `broubook.appspot.com` oder `broubook.firebasestorage.app`)

## Weitere Informationen

- [Firebase Storage CORS Dokumentation](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
- [Google Cloud SDK Installation](https://cloud.google.com/sdk/docs/install)
- [gsutil CORS Kommando](https://cloud.google.com/storage/docs/gsutil/commands/cors)
