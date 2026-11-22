# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

### Hinzugefügt
- Kochbuch auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): Liste und Rezeptkarten, Sortierung, Filter-Seitenleiste und die Suche auf dem Handy, dazu die Kategorien der Tutorials. Der Hinweis bei leeren Favoriten duzt jetzt; „1 weitere Kategorie“ steht in der Einzahl.
- „Wein dazu“ auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): Weinstil, Rebsorten-Beispiele, Kennwerte, Bewertung und die Gründe unter „Warum passt das?“ erscheinen in der gewählten Sprache. Rebsorten und Weinnamen bleiben, wie sie sind; übersetzt werden Zusätze wie „aus dem Elsass“ oder „trocken“.
- Nährwerte auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): der Nährwert-Dialog mit Zusammensetzung und Berechnung, der Abgleich der Zutaten (ingredientID) und die Zutatensuche; Zahlen erscheinen im Format der Sprache. Meldungen der Berechnung bleiben im Rezept deutsch gespeichert und werden beim Anzeigen übersetzt. Die Hinweise beim Abgleich und die Fehlermeldungen der Berechnung duzen jetzt.
- Rezeptansicht und Kochmodus auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): Knöpfe, Hinweise und Dialoge der Rezeptansicht, Bewertungen, Einkaufsliste, Kochtagebuch und der Kochmodus mit mehreren Rezepten am Herd erscheinen in der gewählten Sprache, Timer-Dauern, Datum und Zahlen ebenso. Noch deutsch: Nährwerte und „Wein dazu“. Meldungen, die bisher gesiezt haben, duzen jetzt.
- Auswahllisten auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): Kulinarik, Speisekategorien und Portionseinheiten erscheinen auf Kochbuch-Karten, in der Rezeptansicht und in den Filtern in der gewählten Sprache. Gepflegt werden die Übersetzungen unter Einstellungen › Listen & Kategorien, auf Wunsch mit KI-Vorschlägen; gespeichert und gefiltert wird weiter mit den deutschen Werten.
- Rezeptinhalte auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): Zutaten und Zubereitungsschritte übersetzt die App automatisch per KI, bestehende Rezepte über „Übersetzungen nachtragen“ unter Einstellungen › KI. Rezeptansicht und Kochmodus zeigen sie in der gewählten Sprache, „Original anzeigen“ blendet das Original ein; die Portionsumrechnung rechnet mit den übersetzten Zutaten.
- Rezepttitel auf Englisch und Französisch (Vorschau mit der Berechtigung „Sprachwahl“): Neue und geänderte Titel übersetzt die App automatisch per KI, bestehende über „Übersetzungen nachtragen“ unter Einstellungen › KI. Kochbuch, Suche und Rezeptansicht zeigen den Titel in der gewählten Sprache, die Rezeptansicht darunter das Original.
- Sprachwahl (Vorschau, zunächst nur für Admins): In den persönlichen Daten lässt sich die Sprache wählen (Deutsch, English, Français), im Menü lässt sie sich für die laufende Sitzung übersteuern. Übersetzt sind bisher das Menü, die untere Navigation mit den Bereichsnamen und die persönlichen Daten; die übrige Oberfläche folgt Bereich für Bereich. Freigeschaltet über die neue Berechtigung „Sprachwahl“ unter „Funktionen nach Berechtigung“.
- Wichteln: Direktlink `broubook.web.app/wichteln` öffnet die Seite zum Anlegen und Verwalten von Wichtel-Runden, ohne den Weg über Events. Wer nicht angemeldet ist, sieht zuerst die Anmeldung und landet danach direkt dort.
- Wichteln: Optionales Datum der Feier je Runde, beim Anlegen oder später über „Runde bearbeiten“ – auch nach dem Auslosen. Es steht in der Runde, in der Übersicht, auf der Teilnehmerseite (Deutsch, Englisch, Französisch) und in Einladung, Erinnerung und Neuigkeiten-Mail. Mit Datum kommt die letzte Erinnerung an Wünsche spätestens drei Tage vor der Feier, Neuigkeiten-Mails enden mit dem Tag der Feier.
- Wichteln: Erinnerung per Mail an Gäste, die noch keine Wünsche eingetragen haben – drei Tage nach der Einladung, danach wöchentlich, höchstens dreimal, nur tagsüber (9 bis 20 Uhr). Der erste eigene Wunsch beendet sie, ebenso „Geschenk gekauft“ beim Schenker des Gasts. Zwei Varianten (Nordpol für Weihnachten und Nikolaus, sonst herzlich) auf Deutsch, Englisch und Französisch; der Organisator sieht nicht, wer erinnert wird. Für schon verschickte Einladungen startet die Erinnerung, sobald der Organisator die Runde öffnet.
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
- Sprachwahl (Vorschau mit der Berechtigung „Sprachwahl“): Die Sprache wählst du jetzt direkt im Header über einen Chip mit Flagge und Kürzel (DE, EN, FR) statt im Menü. Auf dem Handy öffnet er eine Auswahl von unten, auf dem Desktop ein kleines Menü; jede Sprache steht dort auch in der gewählten Sprache, die Standardsprache ist markiert. Gilt eine andere Sprache nur für die Sitzung, hat der Chip einen orangen Rand.
- Header: Der Slogan unter „brouBook“ sieht jetzt aus wie von Hand mit Bleistift geschrieben, in Orange und mit jedem Buchstaben etwas anders, auch bei einem eigenen Slogan. Er sitzt direkt unter dem Titel, die Lücke dazwischen ist weg. Die Schrift (Reenie Beanie) kommt mit der App und steht auch offline bereit.
- Persönliche Daten: Die Hinweise zu Mitteilungen duzen jetzt wie der Rest der App.
- Wichteln: Die Einladungsmail geht erst beim Auslosen raus, nicht mehr beim Eintragen – an jeden Teilnehmer mit E-Mail-Adresse, der noch keine bekommen hat; „Per Mail senden“ / „Erneut senden“ gibt es danach. Teilnehmer trägt der Organisator mit Vorname, Nachname und optional E-Mail ein: Wer noch nicht in der Gästeliste steht, wird dort angelegt, einem vorhandenen Gast wird eine fehlende Adresse ergänzt. Passende Gäste aus der Gästeliste erscheinen beim Tippen als Pillen (Suche in Vor- und Nachname). Das bisherige Namensfeld (mehrere Namen mit Komma) entfällt.
- Wichteln: Die Einladungsmail hat neue Texte in zwei Varianten, gewählt nach dem Anlass der Runde: „Post vom Nordpol“ für Weihnachten und Nikolaus, „Herzlich & locker“ für alle anderen Anlässe und Runden ohne Anlass. Beide gibt es auf Deutsch, Englisch und Französisch (Sprache aus dem Gästeprofil, sonst Deutsch). Angesprochen wird nur der Vorname, das Budget steht in der Schreibweise der Sprache („50,00 €“, „€50.00“). Hinweis der Runde und die Zeile „Du bekommst diese Mail, weil …“ stehen weiter dezent darunter.
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
