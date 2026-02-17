# Automatische Versionierung - Schnellreferenz

## 🚀 Wie funktioniert es?

Bei jedem Push zum `main` Branch wird die Version **automatisch** erhöht basierend auf deinen Commit-Messages.

## 📝 Commit-Message Format

Verwende **Conventional Commits** für automatische Versionierung:

### Patch Version (0.0.x) - Bugfixes & kleine Änderungen

```bash
git commit -m "fix: Behebe Fehler bei Rezeptsuche"
git commit -m "docs: Aktualisiere Dokumentation"
git commit -m "chore: Update dependencies"
git commit -m "perf: Verbessere Ladezeit"
git commit -m "refactor: Code cleanup"
```

**Resultat**: 0.1.1 → 0.1.2

---

### Minor Version (0.x.0) - Neue Features

```bash
git commit -m "feat: Füge Export-Funktion hinzu"
git commit -m "feature: Implementiere Dark Mode"
```

**Resultat**: 0.1.1 → 0.2.0

---

### Major Version (x.0.0) - Breaking Changes

```bash
# Option 1: Mit ! Suffix
git commit -m "feat!: Neue API-Struktur"
git commit -m "fix!: Ändere Datenformat"

# Option 2: Mit BREAKING CHANGE im Body
git commit -m "feat: Neue Funktion

BREAKING CHANGE: API-Endpunkte geändert"
```

**Resultat**: 0.1.1 → 1.0.0

---

## 🎯 Workflow

1. **Entwickle lokal** und teste deine Änderungen
2. **Committe** mit aussagekräftiger Message (siehe oben)
3. **Push** zum `main` Branch: `git push`
4. **GitHub Actions** übernimmt den Rest:
   - ✅ Analysiert Commits
   - ✅ Erhöht Version automatisch
   - ✅ Erstellt Git-Tag
   - ✅ Deployed die App

## 🔍 Version prüfen

Nach dem Deployment:

- **In der App**: Hamburger-Menü → Version unten rechts
- **GitHub**: Unter "Actions" → Workflow Summary
- **Git Tags**: `git tag -l` oder auf GitHub unter "Releases"

## ⚙️ Mehrere Commits

Bei mehreren Commits gilt die höchste Priorität:

1. **BREAKING CHANGE** (!) → MAJOR
2. **feat:** → MINOR
3. **fix:**, etc. → PATCH

**Beispiel:**
```bash
git commit -m "docs: Update README"
git commit -m "fix: Bugfix"
git commit -m "feat: Neue Funktion"
git push
```
→ Ergebnis: **MINOR** Version (wegen `feat:`)

---

## 📚 Weitere Infos

- Vollständige Dokumentation: [VERSIONING.md](./VERSIONING.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Conventional Commits: https://www.conventionalcommits.org/
- Semantic Versioning: https://semver.org/lang/de/

---

## 🆘 Hilfe

### Version wurde nicht erhöht?

1. Prüfe GitHub Actions Status
2. Stelle sicher, dass deine Commit-Message ein gültiges Präfix hat
3. Siehe [VERSIONING.md - Troubleshooting](./VERSIONING.md#troubleshooting)

### Manuelle Korrektur nötig?

```bash
# Version in package.json manuell ändern, dann:
git commit -m "chore: korrigiere Version [skip ci]"
git push
```

`[skip ci]` verhindert erneuten automatischen Bump.
