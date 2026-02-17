# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Automatische Versionierung bei jedem Deployment
- Commit-basierte Versionserkennung (Conventional Commits)
- Automatisches Tagging von Versionen

### Geändert
- GitHub Actions Workflow erweitert um automatisches Version-Bumping

## [0.1.1] - 2026-02-17

### Hinzugefügt
- Initiale Version mit Versionsanzeige im Menü

## [0.1.0]

### Hinzugefügt
- Basis-Version vor Versionierungssystem
- RecipeBook Grundfunktionalität

---

## Format der Version-Typen

- **MAJOR** (x.0.0): Breaking Changes, API-Änderungen
  - Commit-Präfix: `BREAKING CHANGE:` oder `feat!:`, `fix!:`, etc.
  
- **MINOR** (0.x.0): Neue Features, abwärtskompatibel
  - Commit-Präfix: `feat:`, `feature:`
  
- **PATCH** (0.0.x): Bugfixes, kleinere Änderungen
  - Commit-Präfix: `fix:`, `bugfix:`, `patch:`, `perf:`, `refactor:`, `docs:`, `chore:`

[Unreleased]: https://github.com/brou-cgn/recipebook/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/brou-cgn/recipebook/releases/tag/v0.1.1
[0.1.0]: https://github.com/brou-cgn/recipebook/releases/tag/v0.1.0
