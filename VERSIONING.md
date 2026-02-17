# Versionierung - RecipeBook App

## Übersicht

Die RecipeBook App verwendet [Semantic Versioning](https://semver.org/lang/de/) im Format `MAJOR.MINOR.PATCH` (z.B. 0.1.1).

## Versionsanzeige

Die aktuelle App-Version wird im Hamburger-Menü (3-Strich-Menü) unten rechts angezeigt.

## Versionierungsregeln

### Wann erhöhe ich welche Version?

#### MAJOR Version (x.0.0)
Erhöhe die MAJOR-Version bei **rückwärtsinkompatiblen Änderungen**:
- Breaking Changes in der API
- Entfernung von Features
- Grundlegende Architekturänderungen
- Änderungen, die Benutzer-Migrationen erfordern

**Beispiel:** 0.9.5 → 1.0.0

#### MINOR Version (0.x.0)
Erhöhe die MINOR-Version bei **neuen Features in bestehender Funktionalität**:
- Neue Funktionen oder Features
- Erweiterungen bestehender Funktionalität
- Neue Komponenten oder Seiten
- Neue Konfigurationsoptionen

**Beispiel:** 0.1.5 → 0.2.0

#### PATCH Version (0.0.x)
Erhöhe die PATCH-Version bei **kleineren Änderungen oder Bugfixes**:
- Fehlerbehebungen
- Performance-Verbesserungen
- Kleine UI-Anpassungen
- Dokumentationsänderungen
- Sicherheitspatches

**Beispiel:** 0.1.1 → 0.1.2

## Versionierung bei Deployments

### Automatische Versionierung (Standard)

Die App-Version wird **automatisch bei jedem Deployment** erhöht. Der Workflow analysiert die Commit-Messages seit der letzten Version und bestimmt den passenden Version-Bump-Typ.

#### Wie funktioniert es?

1. **Push zum `main` Branch** - Das Deployment wird automatisch gestartet
2. **Commit-Analyse** - Der Workflow analysiert alle Commits seit der letzten Version
3. **Version-Bump-Bestimmung** - Basierend auf den Commit-Präfixen wird der Typ bestimmt:
   - `BREAKING CHANGE:` oder `feat!:`, `fix!:` → **MAJOR** Version
   - `feat:`, `feature:` → **MINOR** Version
   - `fix:`, `bugfix:`, `patch:`, `perf:`, `refactor:`, `docs:`, `chore:` → **PATCH** Version
   - Andere Commits → **PATCH** Version (Standard)
4. **Automatisches Update** - `package.json` wird aktualisiert, committed und getaggt
5. **Deployment** - Die neue Version wird deployed

#### Beispiel-Commits

```bash
# PATCH Version (0.1.1 → 0.1.2)
git commit -m "fix: Behebe Fehler bei Rezeptsuche"
git commit -m "docs: Aktualisiere README"
git commit -m "chore: Update dependencies"

# MINOR Version (0.1.1 → 0.2.0)
git commit -m "feat: Füge neue Export-Funktion hinzu"
git commit -m "feature: Implementiere Dark Mode"

# MAJOR Version (0.1.1 → 1.0.0)
git commit -m "feat!: Neue Datenbank-Struktur"
git commit -m "fix: Behebe API

BREAKING CHANGE: API-Endpunkte geändert"
```

#### Mehrere Commits

Wenn mehrere Commits seit der letzten Version vorhanden sind, gilt:
- **BREAKING CHANGE** überschreibt alles → MAJOR
- **feat:** ohne BREAKING CHANGE → MINOR
- Nur **fix:**, **docs:**, etc. → PATCH

### Manuelle Versionierung (Optional)

Falls du die Version manuell setzen möchtest (z.B. für Hotfixes):

1. Öffne die Datei `package.json`
2. Aktualisiere das `version` Feld entsprechend der Art der Änderung
3. Committe die Änderung mit einer aussagekräftigen Commit-Message
4. Pushe zum `main` Branch - das Deployment erfolgt automatisch

**Beispiel:**
```json
{
  "name": "recipebook",
  "version": "0.2.0",
  ...
}
```

### Lokale Versionierung (Entwicklung)

### Lokale Versionierung (Entwicklung)

Für lokale Entwicklung und Tests kannst du npm-Scripts verwenden:

#### npm version Commands

```bash
# Patch-Version erhöhen (0.1.1 → 0.1.2)
npm version patch

# Minor-Version erhöhen (0.1.1 → 0.2.0)
npm version minor

# Major-Version erhöhen (0.1.1 → 1.0.0)
npm version major
```

Diese Commands:
- Aktualisieren automatisch die Version in `package.json`
- Erstellen einen Git-Commit mit der Message "vX.Y.Z"
- Erstellen einen Git-Tag mit "vX.Y.Z"

#### Lokaler Workflow (Entwicklung)

```bash
# 1. Änderungen implementieren und testen
git add .
git commit -m "feat: neue Funktion hinzugefügt"

# 2. Version erhöhen (automatischer Commit + Tag) - NUR FÜR LOKALE TESTS
npm version minor  # oder patch/major je nach Änderung

# 3. Push mit Tags
git push && git push --tags
```

**Hinweis**: Bei normalem Push zum `main` Branch erfolgt die Versionierung automatisch!

## GitHub Actions Integration

Die App-Version wird während des Build-Prozesses automatisch aus der `package.json` gelesen und als Umgebungsvariable `REACT_APP_VERSION` gesetzt.

### Automatischer Workflow

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
# Automatischer Version-Bump
- name: Auto Version Bump
  uses: ./.github/workflows/version-bump.yml

# Version auslesen
- name: Read package.json
  id: package
  run: |
    echo "json=$(cat package.json | tr -d '\n')" >> $GITHUB_OUTPUT

# Build mit Version
- name: Build
  env:
    REACT_APP_VERSION: ${{ fromJson(steps.package.outputs.json).version }}
```

### Fehlerbehandlung

Der Workflow bricht ab und meldet einen Fehler, wenn:
- Git-Operationen fehlschlagen
- Die Version nicht korrekt aktualisiert werden kann
- Der Push fehlschlägt

Bei Fehlern wird eine detaillierte Zusammenfassung im Workflow-Log angezeigt.

## Best Practices

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

## Troubleshooting

### Version wurde nicht erhöht

**Problem**: Nach einem Push zum `main` Branch wurde die Version nicht automatisch erhöht.

**Lösung**:
1. Prüfe den Workflow-Status in GitHub Actions
2. Stelle sicher, dass der Commit eine gültige Commit-Message hat
3. Prüfe die Logs des `version-bump` Jobs

### Fehlgeschlagener Version-Bump

**Problem**: Der Version-Bump Workflow ist fehlgeschlagen.

**Lösung**:
1. Prüfe die Fehlermelung im Workflow-Log
2. Stelle sicher, dass die `package.json` korrekt formatiert ist
3. Bei Git-Konflikten: Pull die neuesten Änderungen und pushe erneut

### Manuelle Version-Korrektur

**Problem**: Die automatisch gesetzte Version ist falsch.

**Lösung**:
1. Ändere die Version manuell in `package.json`
2. Committe mit `git commit -m "chore: korrigiere Version auf vX.Y.Z [skip ci]"`
3. Pushe zum `main` Branch
4. Erstelle manuell ein Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

**Hinweis**: `[skip ci]` im Commit verhindert, dass der Workflow erneut läuft.

## Versionsverlauf

| Version | Datum | Änderungen |
|---------|-------|------------|
| 0.1.1   | 2026-02-17 | Initiale Version mit Versionsanzeige im Menü |
| 0.1.0   | - | Basis-Version vor Versionierungssystem |

## Weitere Informationen

- [Semantic Versioning Spezifikation](https://semver.org/lang/de/)
- [npm version Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-version)
- [Conventional Commits](https://www.conventionalcommits.org/)
