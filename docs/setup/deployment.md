# Deployment

## Deployment

_Quelle: `DEPLOYMENT.md` (zusammengeführt)._

Die App läuft auf **Firebase Hosting**: <https://broubook.web.app>

> Bis März 2026 lief das Deployment über GitHub Pages
> (`https://brou-cgn.github.io/recipebook`). Dieser Pfad ist abgeschaltet, der
> Workflow gelöscht. Ältere Dokumente im Repository, die noch die
> `github.io`-Adresse nennen, beschreiben diesen abgelösten Stand.

### Die Kette

Ein Deployment wird nicht von Hand angestoßen, sondern fällt am Ende der
normalen Arbeit heraus:

```
Pull Request
    └─> CI  (.github/workflows/ci.yml)
        Tests + Build. Das einzige Tor vor der Produktion.
            │
        Merge auf main
            └─> Auto Version Bump  (.github/workflows/version-bump.yml)
                Bestimmt patch/minor/major aus den Commit-Titeln,
                schreibt package.json, pusht Commit + Tag.
                    │
                └─> Deploy to Firebase Hosting  (.github/workflows/deploy-firebase.yml)
                    Baut mit der frischen Versionsnummer und deployt
                    Hosting, Functions, Firestore Rules & Indexes.
```

#### Warum der Deploy am Version Bump hängt und nicht am Merge

Der Bump schreibt die neue Versionsnummer in die `package.json` und pusht sie
als eigenen Commit. `REACT_APP_VERSION` wird beim Build daraus gelesen. Hinge
der Deploy direkt am Merge, ginge die App mit der *alten* Versionsnummer live.

Aus demselben Grund checkt der Deploy-Workflow `main` aus und nicht den
auslösenden Commit: der auslösende Commit ist der Merge, die Version steht im
Bump-Commit darüber.

#### Was das für die Testabdeckung heißt

Getestet wird im Pull Request. Danach prüft nichts mehr nach. **Wer direkt auf
`main` pusht, umgeht die Tests und deployt ungeprüft** – `main` sollte sich
ausschließlich durch gemergte Pull Requests bewegen.

### Manuell deployen

Actions → *Deploy to Firebase Hosting* → *Run workflow*. Baut und deployt den
aktuellen Stand von `main`, ohne die Version zu erhöhen. Gedacht für den Fall,
dass ein automatischer Deploy fehlgeschlagen ist.

Zwei Deploys können sich nie überholen: der Workflow läuft in der
Concurrency-Gruppe `firebase-deploy` und bricht laufende Deploys **nicht** ab.
Ein mitten im `firebase deploy` abgebrochener Lauf hinterlässt Hosting,
Functions und Rules in unterschiedlichen Ständen.

### Vorschau vor dem Merge (Sandbox)

Actions → *Deploy Sandbox* deployt einen beliebigen Branch nur als Hosting in den
Preview-Channel `sandbox`, ohne Version und ohne Produktions-Deploy.
Einrichtung und Grenzen: [sandbox.md](sandbox.md).

### Benötigte Secrets

Settings → Secrets and variables → Actions:

| Secret | Zweck |
|---|---|
| `FIREBASE_TOKEN` | Authentifiziert die Firebase CLI im Deploy |
| `REACT_APP_FIREBASE_API_KEY` | Firebase-Client-Konfiguration im Build |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | " |
| `REACT_APP_FIREBASE_PROJECT_ID` | " |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | " |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | " |
| `REACT_APP_FIREBASE_APP_ID` | " |
| `REACT_APP_FIREBASE_MEASUREMENT_ID` | " |
| `REACT_APP_FIREBASE_VAPID_KEY` | Web-Push-Benachrichtigungen |

Fehlt eines der `REACT_APP_*`-Secrets, baut der Workflow trotzdem durch – die
App zeigt dann eine leere Seite, weil die Firebase-Initialisierung im Browser
fehlschlägt. Das ist der häufigste Grund für „deployed, aber weiß".

Details zum Anlegen: [GITHUB_SECRETS_SETUP.md](#)

### Wenn ein Deploy fehlschlägt

Der Workflow wiederholt sich **nur** bei bekannter Flakiness der Firebase-APIs
(HTTP 503, Timeouts beim Ausrollen von Functions, „Failed to list functions").
Jeder inhaltliche Fehler bricht sofort ab, statt dreimal dasselbe zu versuchen.

| Meldung im Log | Bedeutung |
|---|---|
| `Can't release to … is the current active version` | Derselbe Build ist bereits live. Wird als Erfolg gewertet. |
| `HTTP Error: 503` / `timed out after` | Firebase-seitig. Wird bis zu 3× wiederholt. |
| Fehler im Build-Schritt | Echter Fehler im Code. Deploy findet nicht statt, die alte Version bleibt live. |

Ein fehlgeschlagener Deploy nimmt nichts zurück: die zuletzt erfolgreich
ausgerollte Version bleibt unverändert online.

### Rollback

Firebase Console → Hosting → Release-Historie → *Rollback* auf einen früheren
Release. Das betrifft ausschließlich Hosting. Functions und Firestore Rules
müssen über einen Revert-Commit und den normalen Weg zurückgerollt werden.

### Lokal bauen und prüfen

```bash
npm ci
npm run test:ci    # der Lauf, den auch die CI macht
npm run build
npx serve -s build
```

Warum `test:ci` und nicht `npm test`: eine Liste bekannt roter Suites liegt in
`scripts/quarantined-tests.js`. Siehe den Kopf der Datei.

## GitHub Secrets einrichten / Setup GitHub Secrets

_Quelle: `GITHUB_SECRETS_SETUP.md` (zusammengeführt)._

### 🔒 Problem gelöst: Leere Seite beim Deployment

Die leere Seite entstand, weil die Firebase-Konfiguration beim GitHub Actions Deployment fehlte. Dieses Problem wurde durch die Konfiguration von GitHub Secrets behoben.

### ✅ Erforderliche Schritte

Um die Web-App erfolgreich zu deployen, müssen Sie Firebase-Zugangsdaten als GitHub Secrets hinterlegen.

#### 1. Firebase-Zugangsdaten abrufen

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

#### 2. GitHub Secrets hinzufügen

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

#### 3. Deployment auslösen

Nachdem alle Secrets hinzugefügt wurden:

1. Gehen Sie zu **Actions** in Ihrem Repository
2. Wählen Sie den Workflow **"Deploy to Firebase Hosting"**
3. Klicken Sie auf **Run workflow** → **Run workflow**

Oder pushen Sie einfach eine Änderung zum `main`-Branch:
```bash
git commit --allow-empty -m "Trigger deployment with Firebase secrets"
git push origin main
```

#### 4. Überprüfung

Nach erfolgreichem Deployment (grüner Haken ✅ bei Actions):
- Öffnen Sie **https://broubook.web.app/**
- Die Web-App sollte nun korrekt geladen werden
- Sie sollten die Login-Seite sehen

### 🔍 Was wurde geändert?

Die GitHub Actions Workflow-Datei (`.github/workflows/deploy.yml`) wurde aktualisiert, um die Firebase-Umgebungsvariablen aus den GitHub Secrets während des Build-Prozesses zu verwenden.

### 📚 Weitere Informationen

- Detaillierte Deployment-Anleitung: [DEPLOYMENT.md](#)
- Firebase Setup Guide: [FIREBASE_SETUP.md](firebase.md)

### ❓ Problemlösung

**Problem: Secrets wurden hinzugefügt, aber die Seite ist immer noch leer**
- Lösung: Stellen Sie sicher, dass das Deployment nach dem Hinzufügen der Secrets erneut ausgeführt wurde
- Überprüfen Sie die Action-Logs auf Fehler

**Problem: Build schlägt fehl**
- Lösung: Überprüfen Sie, dass alle 7 Secret-Namen korrekt geschrieben sind (mit `REACT_APP_` Präfix)
- Stellen Sie sicher, dass die Werte korrekt aus der Firebase Console kopiert wurden

**Problem: Login funktioniert nicht**
- Lösung: Überprüfen Sie in der Firebase Console, ob die Authentifizierung (Authentication) aktiviert ist
- Stellen Sie sicher, dass die Email/Password-Anmeldemethode aktiviert ist

## Versionierung - RecipeBook App

_Quelle: `VERSIONING.md` (zusammengeführt)._

### Übersicht

Die RecipeBook App verwendet [Semantic Versioning](https://semver.org/lang/de/) im Format `MAJOR.MINOR.PATCH` (z.B. 0.1.1).

### Versionsanzeige

Die aktuelle App-Version wird im Hamburger-Menü (3-Strich-Menü) unten rechts angezeigt.

### Versionierungsregeln

#### Wann erhöhe ich welche Version?

##### MAJOR Version (x.0.0)
Erhöhe die MAJOR-Version bei **rückwärtsinkompatiblen Änderungen**:
- Breaking Changes in der API
- Entfernung von Features
- Grundlegende Architekturänderungen
- Änderungen, die Benutzer-Migrationen erfordern

**Beispiel:** 0.9.5 → 1.0.0

##### MINOR Version (0.x.0)
Erhöhe die MINOR-Version bei **neuen Features in bestehender Funktionalität**:
- Neue Funktionen oder Features
- Erweiterungen bestehender Funktionalität
- Neue Komponenten oder Seiten
- Neue Konfigurationsoptionen

**Beispiel:** 0.1.5 → 0.2.0

##### PATCH Version (0.0.x)
Erhöhe die PATCH-Version bei **kleineren Änderungen oder Bugfixes**:
- Fehlerbehebungen
- Performance-Verbesserungen
- Kleine UI-Anpassungen
- Dokumentationsänderungen
- Sicherheitspatches

**Beispiel:** 0.1.1 → 0.1.2

### Versionierung bei Deployments

#### Automatische Versionierung (Standard)

Die App-Version wird **automatisch bei jedem Deployment** erhöht. Der Workflow analysiert die Commit-Messages seit der letzten Version und bestimmt den passenden Version-Bump-Typ.

##### Wie funktioniert es?

1. **Push zum `main` Branch** - Das Deployment wird automatisch gestartet
2. **Commit-Analyse** - Der Workflow analysiert alle Commits seit der letzten Version
3. **Version-Bump-Bestimmung** - Basierend auf den Commit-Präfixen wird der Typ bestimmt:
   - `BREAKING CHANGE:` oder `feat!:`, `fix!:` → **MAJOR** Version
   - `feat:`, `feature:` → **MINOR** Version
   - `fix:`, `bugfix:`, `patch:`, `perf:`, `refactor:`, `docs:`, `chore:` → **PATCH** Version
   - Andere Commits → **PATCH** Version (Standard)
4. **Automatischer Tag** - Die neue Version wird als Git-Tag `vX.Y.Z` angelegt. Es gibt keinen Commit auf `main` mehr (ein Branch-Ruleset mit Pflicht-PR würde ihn blockieren). Die Version in `package.json` wird nicht mehr gepflegt; der Deploy liest den jüngsten Tag.
5. **Deployment** - Die neue Version wird deployed

##### Beispiel-Commits

```bash
## PATCH Version (0.1.1 → 0.1.2)
git commit -m "fix: Behebe Fehler bei Rezeptsuche"
git commit -m "docs: Aktualisiere README"
git commit -m "chore: Update dependencies"

## MINOR Version (0.1.1 → 0.2.0)
git commit -m "feat: Füge neue Export-Funktion hinzu"
git commit -m "feature: Implementiere Dark Mode"

## MAJOR Version (0.1.1 → 1.0.0)
git commit -m "feat!: Neue Datenbank-Struktur"
git commit -m "fix: Behebe API

BREAKING CHANGE: API-Endpunkte geändert"
```

##### Mehrere Commits

Wenn mehrere Commits seit der letzten Version vorhanden sind, gilt:
- **BREAKING CHANGE** überschreibt alles → MAJOR
- **feat:** ohne BREAKING CHANGE → MINOR
- Nur **fix:**, **docs:**, etc. → PATCH

#### Manuelle Versionierung (Optional)

Falls du die Version manuell setzen möchtest (z.B. für Hotfixes):

1. Lege auf dem gewünschten Commit von `main` einen Tag an, z. B. `git tag v2.30.0 && git push origin v2.30.0` (Tags fallen nicht unter das Branch-Ruleset)
2. Der nächste automatische Bump zählt von diesem Tag aus weiter


#### Lokale Versionierung (Entwicklung)

Für lokale Entwicklung und Tests kannst du npm-Scripts verwenden:

##### npm version Commands

```bash
## Patch-Version erhöhen (0.1.1 → 0.1.2)
npm version patch

## Minor-Version erhöhen (0.1.1 → 0.2.0)
npm version minor

## Major-Version erhöhen (0.1.1 → 1.0.0)
npm version major
```

Diese Commands:
- Aktualisieren automatisch die Version in `package.json`
- Erstellen einen Git-Commit mit der Message "vX.Y.Z"
- Erstellen einen Git-Tag mit "vX.Y.Z"

##### Lokaler Workflow (Entwicklung)

```bash
## 1. Änderungen implementieren und testen
git add .
git commit -m "feat: neue Funktion hinzugefügt"

## 2. Version erhöhen (automatischer Commit + Tag) - NUR FÜR LOKALE TESTS
npm version minor  # oder patch/major je nach Änderung

## 3. Push mit Tags
git push && git push --tags
```

**Hinweis**: Bei normalem Push zum `main` Branch erfolgt die Versionierung automatisch!

### GitHub Actions Integration

Die App-Version wird während des Build-Prozesses automatisch aus der `package.json` gelesen und als Umgebungsvariable `REACT_APP_VERSION` gesetzt.

#### Automatischer Workflow

Der Deployment-Workflow (`.github/workflows/deploy.yml`) führt folgende Schritte aus:

1. **Version Bump** (`.github/workflows/version-bump.yml`):
   - Analysiert Commits seit letzter Version
   - Bestimmt Version-Bump-Typ (major/minor/patch)
   - Aktualisiert `package.json`
   - Erstellt Git-Tag
   - Pusht Änderungen

2. **Build & Deploy**:
   - Liest neue Version aus `package.json`
   - Setzt `REACT_APP_VERSION` Umgebungsvariable
   - Baut die App
   - Deployed zu GitHub Pages

```yaml
## Automatischer Version-Bump
- name: Auto Version Bump
  uses: ./.github/workflows/version-bump.yml

## Version auslesen
- name: Read package.json
  id: package
  run: |
    echo "json=$(cat package.json | tr -d '\n')" >> $GITHUB_OUTPUT

## Build mit Version
- name: Build
  env:
    REACT_APP_VERSION: ${{ fromJson(steps.package.outputs.json).version }}
```

#### Fehlerbehandlung

Der Workflow bricht ab und meldet einen Fehler, wenn:
- Git-Operationen fehlschlagen
- Die Version nicht korrekt aktualisiert werden kann
- Der Push fehlschlägt

Bei Fehlern wird eine detaillierte Zusammenfassung im Workflow-Log angezeigt.

### Best Practices

1. **Conventional Commits verwenden**: 
   - `feat:` für neue Features (MINOR Version)
   - `fix:` für Bugfixes (PATCH Version)
   - `BREAKING CHANGE:` für breaking changes (MAJOR Version)
   - Beispiel: `git commit -m "feat: Füge Export-Funktion hinzu"`

2. **Pre-Release Versionen**: Für Entwicklungsversionen kann ein Suffix verwendet werden:
   - `0.2.0-beta.1`
   - `1.0.0-rc.1`

3. **Changelog führen**: Alle Änderungen werden in `CHANGELOG.md` dokumentiert

4. **Automatische Versionierung**: Die Version wird automatisch bei jedem Push zum `main` Branch erhöht

5. **Git Tags**: Jede Version wird automatisch getaggt (z.B. `v0.2.0`)

6. **Workflow-Zusammenfassung prüfen**: Nach dem Deployment die GitHub Actions Zusammenfassung prüfen, um die neue Version zu sehen

### Troubleshooting

#### Version wurde nicht erhöht

**Problem**: Nach einem Push zum `main` Branch wurde die Version nicht automatisch erhöht.

**Lösung**:
1. Prüfe den Workflow-Status in GitHub Actions
2. Stelle sicher, dass der Commit eine gültige Commit-Message hat
3. Prüfe die Logs des `version-bump` Jobs

#### Fehlgeschlagener Version-Bump

**Problem**: Der Version-Bump Workflow ist fehlgeschlagen.

**Lösung**:
1. Prüfe die Fehlermeldung im Workflow-Log
2. Stelle sicher, dass die `package.json` korrekt formatiert ist
3. Bei Git-Konflikten: Pull die neuesten Änderungen und pushe erneut

#### Manuelle Version-Korrektur

**Problem**: Die automatisch gesetzte Version ist falsch.

**Lösung**:
1. Ändere die Version manuell in `package.json`
2. Committe mit `git commit -m "chore: korrigiere Version auf vX.Y.Z [skip ci]"`
3. Pushe zum `main` Branch
4. Erstelle manuell ein Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

**Hinweis**: `[skip ci]` im Commit verhindert, dass der Workflow erneut läuft.

### Versionsverlauf

| Version | Datum | Änderungen |
|---------|-------|------------|
| 0.1.1   | 2026-02-17 | Initiale Version mit Versionsanzeige im Menü |
| 0.1.0   | - | Basis-Version vor Versionierungssystem |

### Weitere Informationen

- [Semantic Versioning Spezifikation](https://semver.org/lang/de/)
- [npm version Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-version)
- [Conventional Commits](https://www.conventionalcommits.org/)
