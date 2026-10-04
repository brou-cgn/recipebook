# Druckfunktion – Feature-Inventar, Lückenanalyse, Anforderungsspezifikationen

Stand: 2026-10-04 · Basis: Code-Analyse `main` (nur Lesezugriff, nichts verändert)

---

## 1. Architektur im Überblick

| Baustein | Datei | Rolle |
|---|---|---|
| Datenmodell, Defaults, Format-Auswahl, Migration | `src/utils/customLists.js` (Z. 232–414, 2724–2817) | `DEFAULT_PRINT_FORMATS`, `PRINT_FORMAT_ELEMENTS`, `selectPrintFormat`, `migrateFormatToV2`, `get/savePrintFormats` (Firestore `settings/app.printFormats`) |
| WYSIWYG-Editor | `src/components/PrintFormatEditor.js/.css` | Drag/Resize/Snap, Eigenschaftenpanel |
| Vorschau | `src/components/PrintPreview.js/.css` | Verkleinerte Seite pro Format & Beispielrezept (eigener Renderer) |
| Admin-UI | `src/components/Settings.js` (Tab `druck`, Z. ~1556–1740) | Formatliste, Max-Fotos, Vorschau-Rezept, Speichern |
| Druck-Auslösung | `src/components/RecipeDetail.js` `handlePrint` (Z. 1209–1418) | Format wählen, CSS zur Laufzeit injizieren, `window.print()` |
| Print-CSS | `src/components/RecipeDetail.css` (Z. 2590–2935) | `@media print`, Ausblenden der UI, Legacy-Flex-Layout |
| Berechtigung | `src/utils/userManagement.js`, `UserManagement.js` | Feature-Flag `printRecipe` (alle Rollen default an) |

**Ablauf beim Drucken:** Button (`printRecipe`-Icon, nur wenn `currentUser.printRecipe !== false`) → `selectPrintFormat(formats, Bildanzahl)` → `@page { size: Bcm Hcm }` + pro Element ein `@media print`-Block mit `position:absolute` (Prozent der Seitenbreite) in `<style>` injiziert → `window.print()` → Cleanup per `afterprint` (30-s-Fallback). iOS: neues Fenster mit kopierten Styles + `outerHTML`.

**Koordinatensystem (v2):** x, y, w, h alle in % der Seitenbreite; y/h werden beim Rendern mit `Breite/Höhe` auf CSS-% umgerechnet.

---

## 2. Feature-Inventar (IST)

### 2.1 Formatverwaltung
- F-01 Mehrere Druckformate, frei benennbar, hinzufügbar, löschbar (mind. 1 Format; letztes Catch-all nicht löschbar).
- F-02 Automatische Formatwahl nach Foto-Anzahl: `maxPhotos` als Schwelle, niedrigster passender Wert gewinnt, `null` = Catch-all.
- F-03 Speicherung zentral in Firestore (gilt für alle Nutzer), Cache, Default-Fallback.
- F-04 Layout-Migration v1→v2 beim Laden.
- F-05 Legacy-Fallback (`elementOrder`, `imageWidth`, `imageAlign`) für Altformate ohne `elements`.

### 2.2 Seite
- F-10 Hoch-/Querformat (Wechsel setzt Elemente **und** Seitengröße auf Defaults zurück).
- F-11 Freie Seitengröße in cm (5–200), Ausrichtung wird aus Breite/Höhe abgeleitet; `@page size` wird gesetzt.
- F-12 Schriftart pro Format (6 Web-Safe-Fonts).
- F-13 Bildspalten (auto/1/2) – wirkt nur im Legacy-Pfad (Karussell-Grid), im WYSIWYG-Modus irrelevant (siehe L-12).

### 2.3 Elemente (11 Stück)
Titel, Autor & Datum, Kulinarik/Zeit/Infos (`metadata`), Zutaten, Zubereitungsschritte, Überschrift Zutaten, Überschrift Zubereitung, Foto 1–4. Je Element: sichtbar/unsichtbar (Chips), eigene Defaults für Hoch-/Querformat.

### 2.4 Editor
- F-20 Drag & Drop, 8 Resize-Handles, Klick = Auswahl (Drag-Schwelle 0,5 %).
- F-21 Snap an Kanten/Mitte anderer Elemente (2 %) mit Hilfslinien.
- F-22 Eigenschaftenpanel: Position/Größe in cm, Schriftgröße-Faktor (0,5–4), Fett/Kursiv/Unterstrichen, Schriftfarbe, Textausrichtung H (links/mitte/rechts/Block) und V (oben/mitte/unten), Drehung 0/90/180/270°, Seitenverhältnis (Fotos), Rahmen (4 Seiten, Farbe, Dicke), Ausrichten relativ zu den anderen Elementen, „Layout zurücksetzen".
- F-23 Klemmung an Seitengrenzen, Mindestgrößen.

### 2.5 Vorschau
- F-30 Live-Vorschau je Format mit frei wählbarem Rezept; Badge „aktiv/inaktiv" für das Rezept (welches Format würde greifen).

### 2.6 Druck (Laufzeit)
- F-40 Aus dem Rezeptdetail druckbar; UI-Chrome (Header, Buttons, Timer, Modale, Dialoge) wird per Print-CSS ausgeblendet.
- F-41 Dark Mode wird für Druck auf hell erzwungen.
- F-42 Zutaten in aktueller Portionsgröße (skalierte Mengen, Bruch-Darstellung) – *Annahme, da die Zutatenliste der Bildschirmansicht gedruckt wird; nicht separat verifiziert.*
- F-43 iOS-Sonderpfad über Popup-Fenster mit Popup-Blocker-Hinweis.
- F-44 Zutaten-/Schritt-Zwischenüberschriften werden gerendert (Preview und Print).
- F-45 Berechtigung pro Rolle über `printRecipe`.

---

## 3. Lückenanalyse

Bewertung: **K** = Korrektheit/Bug (verfälscht Ergebnis), **R** = Robustheit/Wartbarkeit, **F** = fehlendes Feature.

| ID | Typ | Lücke | Beleg / Auswirkung | Prio |
|---|---|---|---|---|
| L-01 | K | **Keine Mehrseitigkeit / Overflow wird abgeschnitten.** Jedes Element hat feste Box mit `overflow:hidden`; lange Zutaten-/Schrittlisten werden still gekappt, ohne Warnung. | `RecipeDetail.js` Z. 1339; Preview kürzt zusätzlich hart auf 12 Zutaten/8 Schritte (`PrintPreview.js` Z. 132/154) und zeigt „… (n weitere)", der Druck tut das nicht → Vorschau ≠ Druck | **P1** |
| L-02 | K | **Kulinarik-Zeile und weitere Inhalte sind nicht Teil des Layout-Systems.** `.recipe-cuisine-line` hat kein Mapping in `ELEMENT_SELECTOR_MAP`; im WYSIWYG-Modus bleibt sie im Normalfluss eines `position:relative`-Containers → landet vermutlich oben links über dem Titel. Das Element heißt „Kulinarik / Zeit / Infos", enthält aber nur Zeit/Schwierigkeit/Index. *(Verhalten nicht im Browser verifiziert.)* | `RecipeDetail.js` Z. 2583–2606, 1252–1265 | **P1** |
| L-03 | K | **Admin-/Nutzer-UI kann im Druck landen.** In `.recipe-metadata` liegen der „Index:"-Button (nur mit Recipe-Index-Recht) und die Entwurf-Checkbox (nur Admin); beide haben keine Print-Ausblendung. | `RecipeDetail.js` Z. 2632–2660, `RecipeDetail.css` Z. 2608–2642 | **P1** |
| L-04 | K | **Preview-Renderer ≠ Druck-Renderer.** Drei getrennte Implementierungen (Editor, `PrintPreview`, CSS-Injection) mit abweichenden Texten/Inhalten: Preview „Autor: X · Erstellt am", Druck „Von X erstellt am"; Preview zeigt „Portionen: n", im Druck ist der Portions-Selector (`.serving-control`) ausgeblendet; Preview nutzt `kochzeit||kochdauer`, Detail nur `kochdauer`; Vorschau-Foto = `object-fit` Preview, Druck-CSS erzwingt `cover` ohne Seitenverhältnis-Einstellung (`aspectRatio` wird im Druck **nicht** angewendet). | `PrintPreview.js`, `RecipeDetail.css` Z. 2919–2926 | **P1** |
| L-05 | R | **Null Testabdeckung** für `PrintFormatEditor`, `PrintPreview`, `handlePrint`, `selectPrintFormat`, `migrateFormatToV2`, `mergePrintElementsWithDefaults` (nur ein Mock in `RecipeDetail.test.js`). Layout-Migration und Rotationsformel sind fehleranfällig. | Glob/Grep | P1 |
| L-06 | R | Druck manipuliert das Live-DOM (`<style>` injizieren, Klassen setzen) und ist auf Cleanup via `afterprint` angewiesen; bei Abbruch/Crash bleibt der Bildschirm im Print-Zustand-Risiko. Layout hängt an Bildschirm-CSS-Klassen. | `RecipeDetail.js` Z. 1379–1416 | P2 (löst sich mit REQ-01) |
| L-07 | F | **Keine Format-Auswahl / Vorschau beim Drucken.** Format wird still anhand der Fotozahl gewählt; Nutzer sieht vorher nichts, kann kein Format überschreiben, keine Portionszahl wählen. | `handlePrint` | P2 |
| L-08 | F | **Editor-UX-Lücken:** nur Maus-Events (kein Touch/Stift → Editor auf Tablet unbenutzbar), kein Undo/Redo, keine Pfeiltasten-Nudges, keine Mehrfachauswahl, kein Raster/Lineale, keine Z-Reihenfolge, Orientierungswechsel verwirft alle Anpassungen, Ausrichten nur relativ zu anderen Elementen (nicht zur Seite), keine Seitenränder/Sicherheitszone (Druckerrand!). | `PrintFormatEditor.js` | P2 |
| L-09 | F | **Formatverwaltung:** Löschen per Text-Button „Löschen" (verstößt gegen CLAUDE.md-Regel `DeleteRowButton` + Undo-Snackbar), kein Duplizieren, keine Reihenfolge, keine Konflikt-/Lückenwarnung (z. B. zwei Formate gleiche `maxPhotos` → nicht deterministisch), Auswahlkriterium nur Fotozahl, keine Format-Zuordnung pro Rezept/Kategorie/Nutzer, keine Ungespeichert-Warnung. | `Settings.js` Z. 1591–1740 | P2 |
| L-10 | F | **Fehlende Inhaltselemente:** Kulinarik separat, Portionen, Kochdatum-Historie, Nährwerte/kcal, Notizen, Quelle/QR-Code zum Rezept, Freitext, Logo/App-Name, Fußzeile, mehr als 4 Fotos, Seitenhintergrund/-farbe, Trennlinien. | `PRINT_FORMAT_ELEMENTS` | P2 |
| L-11 | F | **Kein PDF-Export / Teilen.** Nur Browser-Druckdialog. `puppeteer` existiert in `functions/`, wird aber nicht für Rezepte genutzt. iOS-Pfad ist ein Workaround ohne `@page`-Garantie. | `functions/package.json` | P2 |
| L-12 | R | **Tote/irreführende Einstellungen:** „Bildspalten" wirkt im WYSIWYG-Modus nicht; `imageColumns` (Format-Default `auto`) und Legacy-Felder sind weiter im Editor/Datenmodell. | `PrintFormatEditor.js` Z. 488–502, `RecipeDetail.js` Z. 1235–1248 | P3 |
| L-13 | F | Typografie schmal: 6 Systemfonts (Rendering je Gerät unterschiedlich), keine Zeilenhöhe, Aufzählungsstil, Spaltensatz, keine Überschrift-Stile, kein Schwarz-Weiß-/Tintensparmodus. | `PRINT_FONT_OPTIONS` | P3 |
| L-14 | F | **Mehrfachdruck:** keine Sammeldrucke (Tagesmenü, Menü, Einkaufsliste, Auswahl, „Kochbuch"). Einkaufsliste/Menüs haben keine Druckfunktion (Grep: kein `print` in `ShoppingListModal`, `Menu*`). | Grep | P3 |
| L-15 | R | Berechtigung grob: `printRecipe` steuert nur den Button; Layout-Editor hängt an `settingsAccess` (alles oder nichts). | `userManagement.js` | P3 |
| L-16 | R | Fehlende Barrierefreiheit im Editor (Tastaturbedienung, ARIA-Labels für Handles). Ergibt sich mit REQ-04. | – | P3 |

---

## 4. Empfohlene Reihenfolge (Sparring-Einschätzung)

1. **REQ-01 (Einheitlicher Renderer)** zuerst. Er behebt L-02, L-03, L-04 und L-06 strukturell, statt dreimal zu patchen. Ohne ihn doppelt sich jedes neue Element in Editor, Preview und Print-CSS. Das ist der Hebel.
2. **REQ-02 (Overflow/Mehrseitigkeit)** direkt danach – das ist die größte fachliche Lücke („Rezept wird beim Drucken still abgeschnitten").
3. **REQ-03 (Tests)** parallel zu 1–2, nicht danach.
4. Dann Nutzerwert: REQ-04 (Druckdialog), REQ-05 (Elemente), REQ-06 (PDF).
5. Editor-/Verwaltungskomfort (REQ-07, REQ-08) nach Bedarf. Mehrfachdruck (REQ-09) nur, wenn das Kochbuch-/Menü-Szenario real gewünscht ist.

**Kritische Rückfrage:** Wer nutzt den Editor realistisch? Wenn es nur Du bist, ist REQ-07 (Undo, Touch) deutlich weniger dringend als REQ-02 und REQ-05. Wenn mehrere Admins das bearbeiten, hebt sich REQ-07 in Prio 2.

Abhängigkeiten: REQ-01 → REQ-02, REQ-05, REQ-06 · REQ-03 begleitet alle.

---

## 5. Anforderungsspezifikationen

Konvention: **MUSS** = Abnahmekriterium, **SOLL** = wünschenswert. Neue Lösch-UIs folgen `CLAUDE.md` (`DeleteRowButton`, `useUndoableDelete`, `useSwipeToDelete`).

### REQ-01 – Einheitlicher Druck-Renderer (Refactoring) · Prio P1 · Aufwand M–L

**Ziel:** Editor-Vorschau, Settings-Vorschau und echter Druck verwenden **dieselbe** Render-Komponente. Der Druck hängt nicht mehr an Bildschirm-CSS-Klassen und DOM-Injektion.

**Ist:** siehe L-02, L-03, L-04, L-06.

**Anforderungen**
- MUSS: `PrintPreview` zu `PrintPage` ausbauen (Props: `recipe`, `format`, `servings`, optional `mode: 'preview' | 'print'`). Sie rendert alle Inhalte auf Basis des Rezeptobjekts, nicht per Selektoren auf `RecipeDetail`.
- MUSS: `handlePrint` rendert `PrintPage` in ein Portal (`#print-root`); `@media print` blendet alles außer `#print-root` aus. `@page`-Größe wird aus dem Format gesetzt (cm).
- MUSS: Kein Zugriff mehr auf `contentRef`, `ELEMENT_SELECTOR_MAP` und keine Style-Injektion in `document.head`. Cleanup = Portal unmounten.
- MUSS: Gedruckte Texte (Autor/Datum, Zeit, Portionen, Schwierigkeit) sind in Vorschau und Druck identisch (eine Quelle).
- MUSS: Admin-/UI-Felder (Index, Entwurf, Buttons) erscheinen nie, da der Renderer sie nicht kennt (löst L-03).
- MUSS: `aspectRatio` und `object-fit` der Fotos wirken auch im Druck.
- MUSS: Gedruckt werden die **skalierten** Zutatenmengen der aktuell gewählten Portionszahl.
- SOLL: iOS-Pfad vereinfachen (Portal-Inhalt statt `outerHTML` + Style-Kopie); auf echtem iOS-Gerät testen.
- SOLL: Legacy-Fallback (`elementOrder`/`imageWidth`) beim Laden in ein `elements`-Layout migrieren (`migrateFormatToV3`) und die Legacy-CSS entfernen (siehe L-12).

**Akzeptanzkriterien**
1. Für ein Rezept mit allen Feldern ist Druck-Ausgabe (PDF aus dem Browser) pixelgleich zur Settings-Vorschau (Sichtprüfung, 3 Rezepte, 2 Formate).
2. Nach Abbruch des Druckdialogs enthält das DOM weder `<style id="print-*">` noch Print-Klassen.
3. Kein Admin-Element (Index/Entwurf) im Druck, auch mit Admin-Login.
4. `RecipeDetail.css` enthält keinen `@media print`-Block für Inhalte mehr (nur Ausblenden-Regel).

**Betroffen:** `PrintPreview.js`, `RecipeDetail.js`, `RecipeDetail.css`, `customLists.js` (Migration).
**Risiko:** Browser-Unterschiede bei `@page size` (Safari ignoriert es teilweise) – vor Umsetzung klären.

---

### REQ-02 – Überlauf-Behandlung und mehrseitiger Druck · Prio P1 · Aufwand M · Abhängig von REQ-01

**Ziel:** Kein Rezeptinhalt geht beim Druck stillschweigend verloren.

**Ist:** feste Boxen, `overflow:hidden`, keine Warnung (L-01).

**Anforderungen**
- MUSS: Messung nach dem Rendern, ob der Inhalt eines Text-Elements (Zutaten, Schritte) seine Box überschreitet.
- MUSS: Pro Format wählbare Überlauf-Strategie für Zutaten und Schritte:
  1. **Schrift verkleinern** (automatisch bis Mindestfaktor, z. B. 0,7),
  2. **Auf Folgeseite fortsetzen** (zweite Seite mit gleichem Seitenformat, Titel als Kopfzeile „Titel (Fortsetzung)"),
  3. **Abschneiden** (heutiges Verhalten, nur noch bewusst).
- MUSS: Standard für neue Formate = „Auf Folgeseite fortsetzen".
- MUSS: Vorschau zeigt Überlauf deutlich (Warn-Badge „Inhalt zu lang: Zutaten, 3 Zeilen abgeschnitten") und zeigt – bei Strategie „Folgeseite" – alle Seiten.
- MUSS: Vorschau entfernt die harte Kürzung auf 12/8 Einträge (`PrintPreview.js`).
- SOLL: Zeilen/Schritte werden nicht mitten im Eintrag umgebrochen (`break-inside: avoid`).

**Akzeptanzkriterien**
1. Rezept mit 40 Zutaten und 25 Schritten: Im Standardformat erscheinen alle 40/25 Einträge im Druck (ggf. auf Seite 2).
2. Mit Strategie „Abschneiden" zeigt die Vorschau die Warnung, der Druck schneidet ab.
3. Kurzes Rezept erzeugt genau eine Seite, keine Leerseite.

---

### REQ-03 – Testabdeckung Druck-Domäne · Prio P1 · Aufwand S–M · begleitet alle

**Ziel:** Regressionsschutz für Format-Auswahl, Migration, Koordinaten, Editor-Logik. (Hinweis CLAUDE.md: Neue Suites müssen in `npm run test:ci` laufen, nicht in die Quarantäne.)

**Anforderungen**
- MUSS: Unit-Tests `customLists.test.js` erweitern: `selectPrintFormat` (Schwellen, Catch-all, leere Liste, 0 Fotos, gleiche `maxPhotos`), `migrateFormatToV2` (idempotent, Hoch-/Querformat, Custom-Seitengröße), `mergePrintElementsWithDefaults` (fehlende IDs, unbekannte IDs).
- MUSS: Tests für ausgelagerte Reinfunktionen des Editors (`computeSnap`, `effectiveDimensions`, `rotationCssOffset`, Klemmung) – dafür exportieren bzw. nach `src/utils/printLayout.js` verschieben (die Rotationsformel ist heute dreifach kopiert: Editor, Preview, RecipeDetail).
- MUSS: Komponententests `PrintPreview` (alle Elemente, ausgeblendete Elemente, Rotation, Border, Platzhalter ohne Foto).
- MUSS: Test `handlePrint` bzw. nach REQ-01 `PrintPage`: `window.print` wird aufgerufen, Cleanup nach `afterprint`.
- SOLL: Playwright-Smoketest (Chromium ist vorinstalliert): Settings → Druck-Tab → Format ändern → Vorschau aktualisiert sich.

**Akzeptanzkriterien:** Alle neuen Suites laufen in `npm run test:ci`; Rotationsformel nur noch an einer Stelle definiert.

---

### REQ-04 – Druckdialog mit Vorschau und Optionen · Prio P2 · Aufwand M · Abhängig von REQ-01

**Ziel:** Nutzer sieht vor dem Druck, was herauskommt, und kann Format und Portionen wählen.

**Anforderungen**
- MUSS: Klick auf Drucken öffnet ein Modal mit Seitenvorschau (`PrintPage`) im gewählten Format.
- MUSS: Auswahl Druckformat (Vorbelegung = automatisch gewähltes Format, Hinweis „automatisch gewählt wegen 2 Fotos").
- MUSS: Portionsanzahl änderbar (Vorbelegung = aktuelle Ansicht); Zutatenmengen aktualisieren sich in der Vorschau.
- MUSS: Buttons „Drucken" und „Abbrechen"; ESC schließt.
- SOLL: Optionen „Fotos mitdrucken ja/nein", „Notizen mitdrucken ja/nein", „Schwarz-Weiß" (siehe REQ-05).
- SOLL: Letzte Auswahl pro Nutzer merken (`localStorage`, mit try/catch).
- SOLL: Schnelldruck-Modus (Dialog überspringen) als Nutzereinstellung.

**Akzeptanzkriterien**
1. Format-Wechsel im Dialog ändert Vorschau und Druck.
2. Portionsänderung im Dialog verändert nicht die Portionsanzeige im Rezeptdetail.
3. Auf Mobile ist der Dialog nutzbar (Vollbild-Sheet).

---

### REQ-05 – Zusätzliche Layout-Elemente · Prio P2 · Aufwand M (je Element S) · Abhängig von REQ-01

**Ziel:** Gedruckte Rezeptkarte kann alle relevanten Rezeptdaten enthalten.

**Anforderungen (jeweils als `PRINT_FORMAT_ELEMENTS`-Eintrag, Defaults für Hoch-/Querformat, Standard „unsichtbar" für bestehende Formate)**
- MUSS: `cuisine` (Kulinarik, mit Icons als Text-Fallback), und `metadata` wird in `time`, `servings`, `difficulty` **aufteilbar** (bestehendes `metadata` bleibt als Sammel-Element erhalten, Migration ohne Layoutänderung). Behebt L-02.
- MUSS: `notes` (Rezeptnotizen).
- SOLL: `nutrition` (kcal/Portion, Nährwerte sofern berechnet).
- SOLL: `qrCode` (Link zum Rezept bzw. `sourceUrl`; lokale Erzeugung, keine externe API wegen Datenschutz) und `source` (Quellenangabe).
- SOLL: `freeText` (frei editierbarer Text, mehrfach platzierbar) und `logo` (App-Logo aus Einstellungen), `divider` (Linie).
- SOLL: Foto 5–8 oder „Fotogalerie"-Element mit Raster.
- SOLL: Seitenhintergrundfarbe und Seitenrand-Hilfslinie (Sicherheitszone, Standard 0,5 cm).

**Akzeptanzkriterien**
1. Neue Elemente erscheinen als Chip im Editor, sind verschiebbar und im Druck identisch zur Vorschau.
2. Bestehende gespeicherte Formate sehen nach Update unverändert aus (neue Elemente unsichtbar).
3. QR-Code ist mit einem Smartphone scanbar und führt zum Rezept.

---

### REQ-06 – PDF-Export und Teilen · Prio P2 · Aufwand M–L · Abhängig von REQ-01

**Ziel:** Rezeptkarte als PDF speichern/teilen, unabhängig von Browser-Druckdialog und iOS-Eigenheiten.

**Anforderungen**
- MUSS: Button „Als PDF speichern" im Druckdialog (REQ-04).
- MUSS: PDF hat exakt die Seitengröße des Formats (cm) und entspricht der Vorschau.
- MUSS: Dateiname `<Rezepttitel>.pdf`, Sonderzeichen bereinigt.
- SOLL: Teilen über Web Share API (Mobile), sonst Download.
- Technikoptionen (Entscheidung vor Umsetzung nötig):
  - **A) Client-seitig** (`jspdf`/`html2canvas` o. ä.): keine Serverkosten, aber Rasterbild-Qualität und Schriftprobleme.
  - **B) Cloud Function mit Puppeteer** (Abhängigkeit in `functions/package.json` bereits vorhanden, Chromium-Download dort per Env abgeschaltet – `PUPPETEER_INSTALLATION.md` prüfen): vektorbasiert, exakt `@page`-treu, aber Kosten, Kaltstart, Auth-Check nötig.
  - Empfehlung: B, falls Qualität zählt. **Unsicher**, ob Chromium in der aktuellen Functions-Umgebung zuverlässig läuft – vorab Spike.

**Akzeptanzkriterien:** PDF auf iOS Safari und Desktop Chrome erzeugbar; Schriftart und Layout entsprechen der Vorschau; Fotos werden eingebettet.

---

### REQ-07 – Editor-Komfort · Prio P2 (P3 bei Einzelnutzung) · Aufwand M–L

**Ziel:** Layout-Editor ist auf Desktop und Tablet effizient und fehlertolerant bedienbar.

**Anforderungen**
- MUSS: **Undo/Redo** (Strg/Cmd+Z / Shift+Z, Buttons), Historie mind. 50 Schritte, pro Format.
- MUSS: **Pointer Events** statt Mouse Events (Touch/Stift), `touch-action: none` auf Elementen.
- MUSS: Orientierungswechsel verwirft Layout nicht kommentarlos: entweder Bestätigung (Layout wird zurückgesetzt) oder proportionale Umrechnung; Undo möglich.
- SOLL: Pfeiltasten verschieben ausgewähltes Element (0,1 cm; Shift 1 cm), Entf = Element ausblenden.
- SOLL: Mehrfachauswahl (Shift-Klick/Rahmen) mit Gruppen-Verschieben und Ausrichten.
- SOLL: Ausrichten auch relativ zur **Seite** (nicht nur zu anderen Elementen); Verteilen (gleichmäßige Abstände).
- SOLL: Raster-Einrastung (einstellbar 0,5/1 cm), Lineale, Z-Reihenfolge (nach vorn/hinten).
- SOLL: Papierformat-Presets (A4, A5, A6 für Rezeptkarte, Letter, 10×15 cm), Seitenränder.
- SOLL: ARIA-Labels und Tastaturfokus für Elemente/Handles.

**Akzeptanzkriterien:** Layout auf iPad per Finger bearbeitbar; 10× Undo stellt exakt den Ausgangszustand her; Orientierungswechsel ist rückgängig machbar.

---

### REQ-08 – Formatverwaltung und Auswahlregeln · Prio P2 · Aufwand S–M

**Ziel:** Formate sicher verwalten und gezielter zuordnen.

**Anforderungen**
- MUSS: Löschen eines Formats über `DeleteRowButton` + Undo-Snackbar (`useUndoableDelete`, 6 s), **kein** Text-Button „Löschen" (CLAUDE.md). Letztes/Catch-all-Format bleibt geschützt (Tooltip erklärt warum). Mobile: Linksswipe via `useSwipeToDelete`.
- MUSS: Format **duplizieren** (Name „<Name> Kopie").
- MUSS: Validierung beim Speichern: doppelte `maxPhotos` → Warnung/Blockade; kein Catch-all → Warnung; Formatname leer → Blockade.
- MUSS: Warnung bei ungespeicherten Änderungen (Tab-Wechsel/Verlassen).
- MUSS: Übersicht „Welche Fotozahl nutzt welches Format" (Tabelle 0, 1, 2, 3, 4, 5+ → Format).
- SOLL: Zusätzliche Auswahlkriterien (Rezept-Kategorie/Speisekategorie, Zutatenanzahl, Schrittzahl) mit definierter Priorität; Standard bleibt Fotozahl.
- SOLL: Manuelle Format-Zuordnung pro Rezept (Feld am Rezept, überschreibt Automatik).
- SOLL: Format als JSON exportieren/importieren (Sicherung, Austausch).

**Akzeptanzkriterien:** Zwei Formate mit gleichem Schwellenwert lassen sich nicht speichern; gelöschtes Format ist per Snackbar wiederherstellbar; Duplikat erzeugt unabhängige Kopie.

---

### REQ-09 – Sammeldruck (Menü, Einkaufsliste, Auswahl, Kochbuch) · Prio P3 · Aufwand L · Abhängig von REQ-01/-02

**Ziel:** Mehrere Rezepte oder Listen in einem Druckauftrag.

**Anforderungen**
- MUSS: Druck der Einkaufsliste (`ShoppingListModal`) mit eigenem schlankem Layout (Checkboxen, nach Gruppen).
- MUSS: Druck eines Menüs/Tagesmenüs: alle enthaltenen Rezepte nacheinander, je Rezept eine Seite im jeweils passenden Format, optional Deckblatt mit Menüname und Gängen.
- SOLL: Mehrfachauswahl in der Rezeptliste → „Auswahl drucken".
- SOLL: Kochbuch-Export: Deckblatt, Inhaltsverzeichnis, Rezepte sortiert nach Kategorie, Seitenzahlen (setzt REQ-06 voraus).

**Akzeptanzkriterien:** Menü mit 3 Rezepten erzeugt 3+ Seiten in einem Druckdialog; Einkaufsliste druckt auf einer Seite lesbar.

---

### REQ-10 – Typografie und Farbmodus · Prio P3 · Aufwand S–M

**Anforderungen**
- MUSS: Option „Schwarz-Weiß / tintensparend" je Format (Hintergründe/Rahmenfarben auf Schwarz/Weiß, Fotos optional Graustufen).
- SOLL: Zeilenhöhe, Absatzabstand, Aufzählungsstil (Punkt/Nummer/keiner) je Element.
- SOLL: Überschrift-Stil (Unterstreichung an/aus, Linienstärke) statt fest verdrahtetem `border-bottom`.
- SOLL: Schriftarten erweitern (mind. 4 eingebettete Webfonts, passend zum Brand, **vor** Druck geladen – `document.fonts.ready` abwarten) – verhindert gerätespezifisches Rendering.
- SOLL: Zwei-Spalten-Satz innerhalb eines Elements (Zutaten/Schritte).

**Akzeptanzkriterien:** Webfonts erscheinen im Druck und PDF; Schwarz-Weiß-Modus zeigt keine Farbflächen.

---

### REQ-11 – Berechtigungen und Bereinigung · Prio P3 · Aufwand S

**Anforderungen**
- SOLL: Eigenes Feature-Flag `printLayoutEdit` (Layout-Editor) getrennt von `settingsAccess`; Default: nur Admin.
- SOLL: Rollenmatrix in `UserManagement` erweitern (Flag `printRecipe` bleibt, Default alle Rollen).
- MUSS: Tote Einstellungen entfernen bzw. kennzeichnen (Bildspalten im WYSIWYG-Modus, siehe L-12).
- MUSS: Doku `README`/`HANDOVER`: kurze Beschreibung Datenmodell (`layoutVersion`, Koordinatensystem, Format-Auswahl).

---

## 6. Offene Fragen an Dich

1. **Primärer Nutzen:** Rezeptkarte für Küche (A4/A5) oder „schönes Kochbuch" mit Layout-Anspruch? Das entscheidet über REQ-06/-09/-10.
2. **Wie groß sind typische Rezepte?** Wenn regelmäßig >12 Zutaten/>8 Schritte vorkommen, ist REQ-02 P1+.
3. **Nutzergruppe des Editors:** nur Du, oder mehrere Admins/Tablet? (REQ-07)
4. **PDF:** Cloud Function (Puppeteer) akzeptabel hinsichtlich Kosten/Wartung?
5. **Welche Zielgeräte** drucken real (iOS/AirPrint, Desktop)? iOS-Verhalten von `@page` ist meine größte technische Unsicherheit.

## 7. Nicht verifizierte Annahmen

- Das tatsächliche visuelle Verhalten der Kulinarik-Zeile im WYSIWYG-Druck (L-02) und die Portionsanzeige im Druck (L-04) habe ich nur aus Code und CSS abgeleitet, nicht im Browser geprüft.
- Skalierte Zutatenmengen im Druck (F-42) folgen aus der Bildschirmliste; nicht separat getestet.
- Safari-/iOS-Verhalten von `@page size` ist nicht geprüft.
