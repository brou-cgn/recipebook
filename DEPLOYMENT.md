# Deployment

Die App läuft auf **Firebase Hosting**: <https://broubook.web.app>

> Bis März 2026 lief das Deployment über GitHub Pages
> (`https://brou-cgn.github.io/recipebook`). Dieser Pfad ist abgeschaltet, der
> Workflow gelöscht. Ältere Dokumente im Repository, die noch die
> `github.io`-Adresse nennen, beschreiben diesen abgelösten Stand.

## Die Kette

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

### Warum der Deploy am Version Bump hängt und nicht am Merge

Der Bump schreibt die neue Versionsnummer in die `package.json` und pusht sie
als eigenen Commit. `REACT_APP_VERSION` wird beim Build daraus gelesen. Hinge
der Deploy direkt am Merge, ginge die App mit der *alten* Versionsnummer live.

Aus demselben Grund checkt der Deploy-Workflow `main` aus und nicht den
auslösenden Commit: der auslösende Commit ist der Merge, die Version steht im
Bump-Commit darüber.

### Was das für die Testabdeckung heißt

Getestet wird im Pull Request. Danach prüft nichts mehr nach. **Wer direkt auf
`main` pusht, umgeht die Tests und deployt ungeprüft** – `main` sollte sich
ausschließlich durch gemergte Pull Requests bewegen.

## Manuell deployen

Actions → *Deploy to Firebase Hosting* → *Run workflow*. Baut und deployt den
aktuellen Stand von `main`, ohne die Version zu erhöhen. Gedacht für den Fall,
dass ein automatischer Deploy fehlgeschlagen ist.

Zwei Deploys können sich nie überholen: der Workflow läuft in der
Concurrency-Gruppe `firebase-deploy` und bricht laufende Deploys **nicht** ab.
Ein mitten im `firebase deploy` abgebrochener Lauf hinterlässt Hosting,
Functions und Rules in unterschiedlichen Ständen.

## Benötigte Secrets

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

Details zum Anlegen: [GITHUB_SECRETS_SETUP.md](GITHUB_SECRETS_SETUP.md)

## Wenn ein Deploy fehlschlägt

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

## Rollback

Firebase Console → Hosting → Release-Historie → *Rollback* auf einen früheren
Release. Das betrifft ausschließlich Hosting. Functions und Firestore Rules
müssen über einen Revert-Commit und den normalen Weg zurückgerollt werden.

## Lokal bauen und prüfen

```bash
npm ci
npm run test:ci    # der Lauf, den auch die CI macht
npm run build
npx serve -s build
```

Warum `test:ci` und nicht `npm test`: eine Liste bekannt roter Suites liegt in
`scripts/quarantined-tests.js`. Siehe den Kopf der Datei.
