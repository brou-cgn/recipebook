# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Wichteln: Neues optionales Feld „Anlass“ je Runde (Weihnachten, Nikolaus, Silvester, Ostern, Geburtstag, Hochzeit, Jubiläum, Firmenfeier, Sommerfest, Abschied, Einweihung, Sonstiges). Der Anlass erscheint beim Organisator als Chip in der Runde.
- Wichteln: Wünsche und Geschenkideen können einen Link haben (z. B. zum Shop); der Eintrag zeigt dazu ein Vorschaubild mit Seitentitel. Ein Link allein genügt, ein eingefügter Teilen-Text („Produkt https://…“) wird erkannt. Die Vorschau holt der Server einmal beim Speichern, abgesichert gegen Abrufe ins interne Netz (Details: `docs/features/wichteln.md`).
- Wichteln: Gäste aus der Gästeliste mit E-Mail-Adresse bekommen ihren persönlichen Link beim Eintragen automatisch per Mail, auf Wunsch erneut („Erneut senden“). Mail und Teilen-Text gibt es auf Deutsch, Englisch und Französisch, gewählt über die neue Sprache im Gästeprofil (Standard und für alle bestehenden Gäste: Deutsch). Je Teilnehmer zeigt die Runde „Per Mail verschickt“ oder „Mail nicht verschickt“; höchstens 150 Mails je Organisator und Tag.
- Wichteln (Events > Wichteln): Runden anlegen, Teilnehmer eintragen, auslosen und persönliche Links verschicken. Über den Link zieht jeder sein Los, sieht die Wünsche seines Wichtelpartners und kann Geschenkideen für andere hinterlassen – die nur sieht, wer diesen Gast gezogen hat. Die Zuordnung kennt nur der Ziehende selbst, auch der Organisator nicht (Details: `docs/features/wichteln.md`).
- Wichteln: Die persönliche Wichtel-Seite spricht die Sprache des Gasts – Deutsch, Englisch oder Französisch nach der Sprachpräferenz im Gästeprofil; ohne verknüpftes Gästeprofil nach der Browsersprache, sonst Deutsch.
- Wichteln: Ausschlüsse je Teilnehmer. Der Organisator legt fest, wen jemand nicht ziehen soll (z. B. die eigene Partnerin oder den eigenen Partner, je Richtung). Die Auslosung hält das ein und bleibt ein einziger Kreis; lassen die Ausschlüsse keine Auslosung zu, nennt die App den Grund. Teilnehmer sehen die Ausschlüsse nicht.
- Automatische Versionierung bei jedem Deployment
- Commit-basierte Versionserkennung (Conventional Commits)
- Automatisches Tagging von Versionen
- Textimport (`createRecipeImportFromText`) und `addRecipeViaAPI`: optionales Feld `url` – die Quelle wird als Link im importierten Rezept angezeigt. Ohne `url` steht dort kein Link mehr auf die nach 10 Minuten ablaufende Import-Seite.
- Zugriffsbeschränkung für Entwurfs-Rezepte: Nur Administratoren und Autoren können Rezepte im Entwurfstatus (isPrivate) sehen

### Geändert
- Drucklayout einfacher bedienbar: neue Formate nutzen **Vorlagen** (Klassisch, Foto groß, Karte, Kompakt, Schlicht) mit wenigen Reglern (Papier, Rand, Schrift, Abstände, Farbe, Fotos, Spalten). Der Inhalt fließt wie in Word und läuft bei langen Rezepten auf die nächste Seite, nichts wird mehr abgeschnitten. Elemente lassen sich direkt in der Vorschau anklicken und mit einer Formatleiste (Größe, fett, kursiv, unterstrichen, Ausrichtung, Farbe) bearbeiten. Bestehende Formate bleiben als freies Layout (Expertenmodus) erhalten und lassen sich auf eine Vorlage umstellen.
- Druck-Layouts neu aufgebaut: Vorschau und Druck nutzen jetzt denselben Renderer, der Druck entspricht der Vorschau. Admin-Elemente (Index, Entwurf) erscheinen nicht mehr im Druck, das Foto-Seitenverhältnis gilt auch im Druck, Kulinarik und Portionen gehören zu den Metadaten.
- Druckformate: Löschen mit „Rückgängig", Duplizieren, Prüfung beim Speichern (z. B. doppelte Fotoanzahl), Warnung bei ungespeicherten Änderungen. Der Editor lässt sich per Tastatur und Touch bedienen und zeigt in der Vorschau, wenn Inhalt abgeschnitten wird.
- Datenmodell der Druckformate auf Version 3 (abwärtskompatibel, Sicherung des alten Stands in `printFormatsBackup`)
- GitHub Actions Workflow erweitert um automatisches Version-Bumping

### Sicherheit
- Shortcut-Endpunkte: Authentifizierung (API-Key, Rolle, Webimport-PIN) läuft jetzt über gemeinsame Helper statt sieben Kopien. `createRecipeImportFromText` prüft damit auch die Webimport-PIN (vorher als einziger Endpunkt nicht).
- Rezepte mit `isPrivate: true` werden nun gefiltert und sind nur für Administratoren und die jeweiligen Autoren sichtbar

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
