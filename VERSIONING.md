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

### Manuelle Versionierung

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

### Automatisierte Versionierung (Empfohlen)

Für zukünftige Automatisierung können npm-Scripts verwendet werden:

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

#### Empfohlener Workflow

```bash
# 1. Änderungen implementieren und testen
git add .
git commit -m "feat: neue Funktion hinzugefügt"

# 2. Version erhöhen (automatischer Commit + Tag)
npm version minor  # oder patch/major je nach Änderung

# 3. Push mit Tags
git push && git push --tags
```

## GitHub Actions Integration

Die App-Version wird während des Build-Prozesses automatisch aus der `package.json` gelesen und als Umgebungsvariable `REACT_APP_VERSION` gesetzt.

Der Deployment-Workflow (`.github/workflows/deploy.yml`) liest die Version und stellt sie der React-App zur Verfügung:

```yaml
- name: Read package.json
  id: package
  run: |
    echo "json=$(cat package.json | tr -d '\n')" >> $GITHUB_OUTPUT

- name: Build
  env:
    REACT_APP_VERSION: ${{ fromJson(steps.package.outputs.json).version }}
```

## Best Practices

1. **Pre-Release Versionen**: Für Entwicklungsversionen kann ein Suffix verwendet werden:
   - `0.2.0-beta.1`
   - `1.0.0-rc.1`

2. **Changelog führen**: Dokumentiere alle Änderungen in einer `CHANGELOG.md` Datei

3. **Versionierung vor Deployment**: Erhöhe die Version **vor** dem Deployment zum `main` Branch

4. **Semantic Commits**: Verwende aussagekräftige Commit-Messages:
   - `feat:` für neue Features (MINOR)
   - `fix:` für Bugfixes (PATCH)
   - `BREAKING CHANGE:` für breaking changes (MAJOR)

5. **Regelmäßige Updates**: Aktualisiere die Version bei jedem Deployment

## Versionsverlauf

| Version | Datum | Änderungen |
|---------|-------|------------|
| 0.1.1   | 2026-02-17 | Initiale Version mit Versionsanzeige im Menü |
| 0.1.0   | - | Basis-Version vor Versionierungssystem |

## Weitere Informationen

- [Semantic Versioning Spezifikation](https://semver.org/lang/de/)
- [npm version Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-version)
- [Conventional Commits](https://www.conventionalcommits.org/)
