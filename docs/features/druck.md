# Druck

## Druckfunktion – Feature-Inventar, Lückenanalyse, Anforderungsspezifikationen

_Quelle: `DRUCKFUNKTION_ANFORDERUNGEN.md` (zusammengeführt)._

Stand: 2026-10-04 · Basis: Code-Analyse `main` (nur Lesezugriff, nichts verändert)

---

### 1. Architektur im Überblick

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

### 2. Feature-Inventar (IST)

#### 2.1 Formatverwaltung
- F-01 Mehrere Druckformate, frei benennbar, hinzufügbar, löschbar (mind. 1 Format; letztes Catch-all nicht löschbar).
- F-02 Automatische Formatwahl nach Foto-Anzahl: `maxPhotos` als Schwelle, niedrigster passender Wert gewinnt, `null` = Catch-all.
- F-03 Speicherung zentral in Firestore (gilt für alle Nutzer), Cache, Default-Fallback.
- F-04 Layout-Migration v1→v2 beim Laden.
- F-05 Legacy-Fallback (`elementOrder`, `imageWidth`, `imageAlign`) für Altformate ohne `elements`.

#### 2.2 Seite
- F-10 Hoch-/Querformat (Wechsel setzt Elemente **und** Seitengröße auf Defaults zurück).
- F-11 Freie Seitengröße in cm (5–200), Ausrichtung wird aus Breite/Höhe abgeleitet; `@page size` wird gesetzt.
- F-12 Schriftart pro Format (6 Web-Safe-Fonts).
- F-13 Bildspalten (auto/1/2) – wirkt nur im Legacy-Pfad (Karussell-Grid), im WYSIWYG-Modus irrelevant (siehe L-12).

#### 2.3 Elemente (11 Stück)
Titel, Autor & Datum, Kulinarik/Zeit/Infos (`metadata`), Zutaten, Zubereitungsschritte, Überschrift Zutaten, Überschrift Zubereitung, Foto 1–4. Je Element: sichtbar/unsichtbar (Chips), eigene Defaults für Hoch-/Querformat.

#### 2.4 Editor
- F-20 Drag & Drop, 8 Resize-Handles, Klick = Auswahl (Drag-Schwelle 0,5 %).
- F-21 Snap an Kanten/Mitte anderer Elemente (2 %) mit Hilfslinien.
- F-22 Eigenschaftenpanel: Position/Größe in cm, Schriftgröße-Faktor (0,5–4), Fett/Kursiv/Unterstrichen, Schriftfarbe, Textausrichtung H (links/mitte/rechts/Block) und V (oben/mitte/unten), Drehung 0/90/180/270°, Seitenverhältnis (Fotos), Rahmen (4 Seiten, Farbe, Dicke), Ausrichten relativ zu den anderen Elementen, „Layout zurücksetzen".
- F-23 Klemmung an Seitengrenzen, Mindestgrößen.

#### 2.5 Vorschau
- F-30 Live-Vorschau je Format mit frei wählbarem Rezept; Badge „aktiv/inaktiv" für das Rezept (welches Format würde greifen).

#### 2.6 Druck (Laufzeit)
- F-40 Aus dem Rezeptdetail druckbar; UI-Chrome (Header, Buttons, Timer, Modale, Dialoge) wird per Print-CSS ausgeblendet.
- F-41 Dark Mode wird für Druck auf hell erzwungen.
- F-42 Zutaten in aktueller Portionsgröße (skalierte Mengen, Bruch-Darstellung) – *Annahme, da die Zutatenliste der Bildschirmansicht gedruckt wird; nicht separat verifiziert.*
- F-43 iOS-Sonderpfad über Popup-Fenster mit Popup-Blocker-Hinweis.
- F-44 Zutaten-/Schritt-Zwischenüberschriften werden gerendert (Preview und Print).
- F-45 Berechtigung pro Rolle über `printRecipe`.

---

### 3. Lückenanalyse

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

### 4. Empfohlene Reihenfolge (Sparring-Einschätzung)

1. **REQ-01 (Einheitlicher Renderer)** zuerst. Er behebt L-02, L-03, L-04 und L-06 strukturell, statt dreimal zu patchen. Ohne ihn doppelt sich jedes neue Element in Editor, Preview und Print-CSS. Das ist der Hebel.
2. **REQ-02 (Overflow/Mehrseitigkeit)** direkt danach – das ist die größte fachliche Lücke („Rezept wird beim Drucken still abgeschnitten").
3. **REQ-03 (Tests)** parallel zu 1–2, nicht danach.
4. Dann Nutzerwert: REQ-04 (Druckdialog), REQ-05 (Elemente), REQ-06 (PDF).
5. Editor-/Verwaltungskomfort (REQ-07, REQ-08) nach Bedarf. Mehrfachdruck (REQ-09) nur, wenn das Kochbuch-/Menü-Szenario real gewünscht ist.

**Kritische Rückfrage:** Wer nutzt den Editor realistisch? Wenn es nur Du bist, ist REQ-07 (Undo, Touch) deutlich weniger dringend als REQ-02 und REQ-05. Wenn mehrere Admins das bearbeiten, hebt sich REQ-07 in Prio 2.

Abhängigkeiten: REQ-01 → REQ-02, REQ-05, REQ-06 · REQ-03 begleitet alle.

---

### 5. Anforderungsspezifikationen

Konvention: **MUSS** = Abnahmekriterium, **SOLL** = wünschenswert. Neue Lösch-UIs folgen `CLAUDE.md` (`DeleteRowButton`, `useUndoableDelete`, `useSwipeToDelete`).

#### REQ-01 – Einheitlicher Druck-Renderer (Refactoring) · Prio P1 · Aufwand M–L

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

#### REQ-02 – Überlauf-Behandlung und mehrseitiger Druck · Prio P1 · Aufwand M · Abhängig von REQ-01

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

#### REQ-03 – Testabdeckung Druck-Domäne · Prio P1 · Aufwand S–M · begleitet alle

**Ziel:** Regressionsschutz für Format-Auswahl, Migration, Koordinaten, Editor-Logik. (Hinweis CLAUDE.md: Neue Suites müssen in `npm run test:ci` laufen, nicht in die Quarantäne.)

**Anforderungen**
- MUSS: Unit-Tests `customLists.test.js` erweitern: `selectPrintFormat` (Schwellen, Catch-all, leere Liste, 0 Fotos, gleiche `maxPhotos`), `migrateFormatToV2` (idempotent, Hoch-/Querformat, Custom-Seitengröße), `mergePrintElementsWithDefaults` (fehlende IDs, unbekannte IDs).
- MUSS: Tests für ausgelagerte Reinfunktionen des Editors (`computeSnap`, `effectiveDimensions`, `rotationCssOffset`, Klemmung) – dafür exportieren bzw. nach `src/utils/printLayout.js` verschieben (die Rotationsformel ist heute dreifach kopiert: Editor, Preview, RecipeDetail).
- MUSS: Komponententests `PrintPreview` (alle Elemente, ausgeblendete Elemente, Rotation, Border, Platzhalter ohne Foto).
- MUSS: Test `handlePrint` bzw. nach REQ-01 `PrintPage`: `window.print` wird aufgerufen, Cleanup nach `afterprint`.
- SOLL: Playwright-Smoketest (Chromium ist vorinstalliert): Settings → Druck-Tab → Format ändern → Vorschau aktualisiert sich.

**Akzeptanzkriterien:** Alle neuen Suites laufen in `npm run test:ci`; Rotationsformel nur noch an einer Stelle definiert.

---

#### REQ-04 – Druckdialog mit Vorschau und Optionen · Prio P2 · Aufwand M · Abhängig von REQ-01

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

#### REQ-05 – Zusätzliche Layout-Elemente · Prio P2 · Aufwand M (je Element S) · Abhängig von REQ-01

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

#### REQ-06 – PDF-Export und Teilen · Prio P2 · Aufwand M–L · Abhängig von REQ-01

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

#### REQ-07 – Editor-Komfort · Prio P2 (P3 bei Einzelnutzung) · Aufwand M–L

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

#### REQ-08 – Formatverwaltung und Auswahlregeln · Prio P2 · Aufwand S–M

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

#### REQ-09 – Sammeldruck (Menü, Einkaufsliste, Auswahl, Kochbuch) · Prio P3 · Aufwand L · Abhängig von REQ-01/-02

**Ziel:** Mehrere Rezepte oder Listen in einem Druckauftrag.

**Anforderungen**
- MUSS: Druck der Einkaufsliste (`ShoppingListModal`) mit eigenem schlankem Layout (Checkboxen, nach Gruppen).
- MUSS: Druck eines Menüs/Tagesmenüs: alle enthaltenen Rezepte nacheinander, je Rezept eine Seite im jeweils passenden Format, optional Deckblatt mit Menüname und Gängen.
- SOLL: Mehrfachauswahl in der Rezeptliste → „Auswahl drucken".
- SOLL: Kochbuch-Export: Deckblatt, Inhaltsverzeichnis, Rezepte sortiert nach Kategorie, Seitenzahlen (setzt REQ-06 voraus).

**Akzeptanzkriterien:** Menü mit 3 Rezepten erzeugt 3+ Seiten in einem Druckdialog; Einkaufsliste druckt auf einer Seite lesbar.

---

#### REQ-10 – Typografie und Farbmodus · Prio P3 · Aufwand S–M

**Anforderungen**
- MUSS: Option „Schwarz-Weiß / tintensparend" je Format (Hintergründe/Rahmenfarben auf Schwarz/Weiß, Fotos optional Graustufen).
- SOLL: Zeilenhöhe, Absatzabstand, Aufzählungsstil (Punkt/Nummer/keiner) je Element.
- SOLL: Überschrift-Stil (Unterstreichung an/aus, Linienstärke) statt fest verdrahtetem `border-bottom`.
- SOLL: Schriftarten erweitern (mind. 4 eingebettete Webfonts, passend zum Brand, **vor** Druck geladen – `document.fonts.ready` abwarten) – verhindert gerätespezifisches Rendering.
- SOLL: Zwei-Spalten-Satz innerhalb eines Elements (Zutaten/Schritte).

**Akzeptanzkriterien:** Webfonts erscheinen im Druck und PDF; Schwarz-Weiß-Modus zeigt keine Farbflächen.

---

#### REQ-11 – Berechtigungen und Bereinigung · Prio P3 · Aufwand S

**Anforderungen**
- SOLL: Eigenes Feature-Flag `printLayoutEdit` (Layout-Editor) getrennt von `settingsAccess`; Default: nur Admin.
- SOLL: Rollenmatrix in `UserManagement` erweitern (Flag `printRecipe` bleibt, Default alle Rollen).
- MUSS: Tote Einstellungen entfernen bzw. kennzeichnen (Bildspalten im WYSIWYG-Modus, siehe L-12).
- MUSS: Doku `README`/`HANDOVER`: kurze Beschreibung Datenmodell (`layoutVersion`, Koordinatensystem, Format-Auswahl).

---

### 6. Offene Fragen an Dich

1. **Primärer Nutzen:** Rezeptkarte für Küche (A4/A5) oder „schönes Kochbuch" mit Layout-Anspruch? Das entscheidet über REQ-06/-09/-10.
2. **Wie groß sind typische Rezepte?** Wenn regelmäßig >12 Zutaten/>8 Schritte vorkommen, ist REQ-02 P1+.
3. **Nutzergruppe des Editors:** nur Du, oder mehrere Admins/Tablet? (REQ-07)
4. **PDF:** Cloud Function (Puppeteer) akzeptabel hinsichtlich Kosten/Wartung?
5. **Welche Zielgeräte** drucken real (iOS/AirPrint, Desktop)? iOS-Verhalten von `@page` ist meine größte technische Unsicherheit.

### 7. Nicht verifizierte Annahmen

- Das tatsächliche visuelle Verhalten der Kulinarik-Zeile im WYSIWYG-Druck (L-02) und die Portionsanzeige im Druck (L-04) habe ich nur aus Code und CSS abgeleitet, nicht im Browser geprüft.
- Skalierte Zutatenmengen im Druck (F-42) folgen aus der Bildschirmliste; nicht separat getestet.
- Safari-/iOS-Verhalten von `@page size` ist nicht geprüft.

## Druck-Layouts (Entwicklerdoku)

_Quelle: `DRUCKLAYOUT.md` (zusammengeführt)._

Rezepte werden über frei gestaltbare **Druckformate** gedruckt. Die Formate liegen zentral in
Firestore (`settings/app.printFormats`) und gelten für alle Nutzer. Bearbeitet werden sie in
den Einstellungen im Tab **Drucklayout**.

### Zwei Layouttypen

| Typ | `layoutType` | Wofür |
|---|---|---|
| **Vorlage (Fließlayout)** | `'flow'` | Standard für neue Formate. Der Inhalt fließt von oben nach unten wie in Word und läuft bei langen Rezepten auf die nächste Seite. Bedienung: Vorlage wählen, wenige Regler, Elemente in der Vorschau anklicken und formatieren. |
| **Freies Layout** (Expertenmodus) | fehlt / `'free'` | Elemente werden von Hand in cm platziert. Text wird abgeschnitten, wenn er nicht passt. Bestehende Formate bleiben so; „Auf Vorlage umstellen" konvertiert sie. |

Beide werden von `PrintPage` gerendert (`FlowPage` für Vorlagen) und gedruckt.

### Bausteine

| Datei | Aufgabe |
|---|---|
| `src/utils/printElements.js` | **Element-Registry**: IDs, Labels, Farben, Defaults für Hoch-/Querformat |
| `src/utils/printLayout.js` | reine Geometrie (cm/%, Rotation, Snap, CSS-Stil eines Elements) |
| `src/utils/printFormats.js` | Formatwahl, Migration auf v3, Validierung, Erzeugen/Duplizieren |
| `src/utils/printRecipe.js` | Rezeptdaten und Formulierungen für den Druck (eine Quelle) |
| `src/components/PrintPage.js` | **der** Renderer für Vorschau und Druck |
| `src/components/printElementRenderers.js` | ein Renderer pro Element |
| `src/components/printRunner.js` | Druckablauf (`#print-root`, `@page`, `window.print()`, Aufräumen) |
| `src/components/PrintFormatEditor.js` + `printEditor/` | WYSIWYG-Editor |
| `src/components/PrintFormatsSettings.js` | Formatliste, Speichern, Löschen mit Rückgängig |
| `src/utils/printTemplates.js` | Vorlagen, Stiloptionen, Normalisierung, Konvertierung |
| `src/components/FlowPage.js` | Renderer für Vorlagen (Fließlayout, Seitenumbruch-Markierung) |
| `src/components/TemplateFormatEditor.js` + `templateEditor/` | Vorlagen-Galerie, Stilregler, schwebende Formatleiste |

`customLists.js` re-exportiert die Print-Namen aus Kompatibilitätsgründen.

### Datenmodell (layoutVersion 3)

```js
{
  id, name,
  maxPhotos,            // null = gilt für alle; sonst Format gilt bei Fotoanzahl <= maxPhotos
  orientation,          // 'portrait' | 'landscape' (aus Seitenmaßen abgeleitet)
  pageWidthCm, pageHeightCm,   // immer explizit, 5..200
  fontFamily,
  layoutVersion: 3,
  elements: [{ id, x, y, w, h, visible, rotation?, fontSizeScale?, fontBold?, ..., aspectRatio? }],
  migrationNotes?: ['legacy-layout-replaced']
}
```

**Koordinaten:** `x, y, w, h` sind ALLE Prozent der **Seitenbreite**. Für CSS wird `y`/`h`
mit `Breite/Höhe` auf Prozent der Seitenhöhe umgerechnet (`elementBox` in `printLayout.js`).

**Formatwahl:** `selectPrintFormat(formats, fotoanzahl)` nimmt unter den Formaten mit
`maxPhotos >= fotoanzahl` das mit dem kleinsten Wert (bei Gleichstand das zuerst gelistete).
Gibt es keins, gilt das Format ohne `maxPhotos`.

**Migration:** `migrateFormat` (v1 → v2 → v3) ist rein und idempotent und läuft beim **Lesen**.
Es wird nie automatisch zurückgeschrieben. Erst „Druckformate speichern" persistiert v3.
Vor dem ersten v3-Speichern wird der alte Stand einmalig in `settings/app.printFormatsBackup`
gesichert (Rollback: Inhalt zurück nach `printFormats` kopieren). v3 bleibt abwärtskompatibel
zu v2 (gleiche Koordinaten), ältere App-Versionen zeigen es weiter korrekt an.

**Validierung** (`validatePrintFormats`, blockiert das Speichern): mindestens ein Format
ohne `maxPhotos`, Name nicht leer, `maxPhotos` eindeutig und ganzzahlig ≥ 0, Seitenmaße
5–200 cm, Format ≤ 8 KB.

### Vorlagen (Fließlayout)

```js
{ layoutType: 'flow', template: 'classic',
  style: { fontFamily, baseSize, accent, spacing, headingStyle, titleAlign, metadataStyle,
           photoPosition, photoSize, photoAspect, photoCount, columns, tintIngredients,
           marginCm, show: { title, authorDate, metadata, photos, ingredients, steps } },
  overrides: { title: { fontSizeScale, fontBold, fontItalic, fontUnderline, fontColor, textAlignH } } }
```

* `style` ist immer vollständig (beim Anwenden einer Vorlage werden alle Werte geschrieben), `overrides` enthält nur
  Abweichungen einzelner Elemente. Eine Vorlage anzuwenden setzt beides zurück (mit Rückfrage, wenn es Änderungen gibt).
* Die Normalisierung (`normalizeFlowStyle`, `normalizeFlowOverrides`) korrigiert unbekannte oder ungültige Werte beim Lesen.
* Der **Seitenrand** wird im Druck als `@page margin` gesetzt (`printRunner`), die Inhaltsbreite ist Seitenbreite minus Ränder.
  Der Browser bricht die Seiten um; Listeneinträge und Überschriften werden nicht getrennt.
* Die Vorschau markiert die Seitenumbrüche nur **ungefähr** (sie rechnet mit der Inhaltshöhe, der Browser entscheidet beim Druck).
* **Klick in der Vorschau:** `FlowPage` zeichnet jedes Element mit `data-flow-el`; `TemplateFormatEditor` positioniert die
  Formatleiste (`FloatingToolbar`) am angeklickten Element.

**Neue Vorlage:** Eintrag in `PRINT_TEMPLATES` (`printTemplates.js`) mit den abweichenden Stilwerten. Ein Test prüft, dass jede
Vorlage gültig ist und sich von den anderen unterscheidet.

### Druckablauf

1. `RecipeDetail.handlePrint` wählt das Format und ruft `printRecipe(...)`.
2. `printRunner` rendert `<PrintPage mode="print">` in `#print-root` (am Bildschirm
   `display: none`), setzt `@page { size: B cm H cm; margin: 0 }`, wartet auf Schriften
   und Bilder und ruft `window.print()`.
3. Nach `afterprint` (Fallback 30 s) wird alles entfernt. Das Bildschirm-DOM wird nie verändert.
4. `PrintPage.css` blendet im Druck alles außer `#print-root` aus.

iOS: Das Popup wird synchron im Klick geöffnet und aus `#print-root` befüllt.

Die Seite wird in echter Größe (cm) gelayoutet. Die Vorschau skaliert sie nur per
`transform`, deshalb stimmen Umbrüche und Überlauf mit dem Druck überein.
Text, der nicht in seine Box passt, wird abgeschnitten. In der Vorschau zeigt ein Badge
„abgeschnitten" das an. Mehrseitiger Druck ist nicht umgesetzt.

### Neues Element hinzufügen

1. Eintrag in `PRINT_FORMAT_ELEMENTS` und Defaults in `DEFAULT_PRINT_ELEMENTS_PORTRAIT` und
   `..._LANDSCAPE` (`printElements.js`). Neue Elemente standardmäßig `visible: false`, damit
   gespeicherte Formate unverändert aussehen.
2. Renderer in `PRINT_ELEMENT_RENDERERS` (`printElementRenderers.js`). Ein Test stellt sicher,
   dass jede Registry-ID genau einen Renderer hat.
3. Snapshot-Test in `printElements.test.js` aktualisieren (`-u`) und die Änderung bewusst prüfen.

Editor, Vorschau, Druck und Settings brauchen keine Änderung.

## Refactoring Druck-Layoutvorlagen – Akzeptanzkriterien

_Quelle: `DRUCKLAYOUT_REFACTORING_AKZEPTANZKRITERIEN.md` (zusammengeführt)._

Stand: 2026-10-04 · Status: **Entwurf zur Freigabe, noch keine Codeänderung**
Bezug: `DRUCKFUNKTION_ANFORDERUNGEN.md` (REQ-01, REQ-03, Teile von REQ-02/-05/-08/-11)

---

### 0. Annahmen zum Scope (bitte bestätigen)

„Layoutvorlagen" = die Druckformate (`printFormats`: Editor, Vorschau, Druck, Auswahl, Persistenz). Das Refactoring ist **verhaltensbewahrend mit Paritäts-Fixes**: Es ändert Struktur und Quelle der Wahrheit, nicht das Aussehen bestehender Formate – ausgenommen die in Abschnitt 3 benannten Fehler (L-02, L-03, L-04).

| Im Scope | Nicht im Scope (eigene Specs) |
|---|---|
| Ein gemeinsamer Renderer für Editor-Vorschau, Settings-Vorschau, Druck | Mehrseitiger Druck / Überlaufstrategien (REQ-02) |
| Zentrale Element-Registry und Geometrie-Utility | Neue Elemente wie QR, Notizen, Freitext (REQ-05) |
| Datenmodell v3 inkl. Migration, Legacy-Ablösung | PDF-Export (REQ-06), Druckdialog (REQ-04) |
| Aufspaltung der Dateien, Tests | Editor-Komfort Undo/Touch (REQ-07), Sammeldruck (REQ-09) |
| Paritäts-Fixes L-02, L-03, L-04 | Auswahlregeln jenseits Fotozahl (REQ-08) |

Ausnahme aus REQ-08, weil beim Umbau der Formatliste ohnehin angefasst: Löschen per `DeleteRowButton` + Undo (AK-8.x).

**Entscheidungsbedarf:** Die Überlauf-Behandlung bleibt vorerst „abschneiden" (heutiges Verhalten), wird aber **erkennbar** (Warnung in Vorschau). Mehrseitigkeit folgt separat. Passt das?

---

### 1. Zielarchitektur

- **Eine Render-Komponente** `PrintPage` (aus `PrintPreview` entstanden) rendert Rezept + Format → React-Baum. Genutzt von Settings-Vorschau, Editor-Hintergrundvorschau (optional) und Druck.
- **Druck** rendert `PrintPage` in ein Portal `#print-root`; `@media print` blendet alles andere aus. Kein Zugriff mehr auf `contentRef`, keine Selektor-Map, keine `<style>`-Injektion in `document.head` (außer einer einzigen `@page`-Regel).
- **Element-Registry** (`src/utils/printElements.js`): Einzige Definition je Element (id, Label, Farbe, Typ text/image, Defaults Hoch/Quer, Renderfunktion-Referenz). `PRINT_FORMAT_ELEMENTS`, Defaults und Rendering leiten sich daraus ab.
- **Geometrie-Utility** (`src/utils/printLayout.js`): Reine Funktionen für Seitenmaße, %↔cm, Rotationsversatz, Klemmung, Snap, Stilberechnung eines Elements. Genau eine Implementierung.
- **Format-Logik** (`src/utils/printFormats.js`): Auswahl, Migration, Validierung, Defaults – aus `customLists.js` ausgelagert; `customLists.js` re-exportiert vorübergehend für Kompatibilität.
- Datenmodell **v3**, Persistenz weiterhin `settings/app.printFormats`.

---

### 2. Akzeptanzkriterien

Notation: **AK-x.y**, Given/When/Then wo sinnvoll. „Ausgang" = Verhalten auf `main` vor dem Refactoring.

#### 2.1 Einheitlicher Renderer

- **AK-1.1** `PrintPage` existiert und akzeptiert `recipe`, `format`, `servings` (optional, Default = `recipe.portionen`) und `mode` (`'preview'|'print'`).
- **AK-1.2** `PrintPreview`, Settings-Vorschau und Druck verwenden **dieselbe** Komponente; `grep` auf `ppv-el-` Klassen außerhalb von `PrintPage`-Dateien liefert 0 Treffer.
- **AK-1.3** Für jedes Element der Registry gibt es genau **eine** Renderfunktion; Hinzufügen eines Elements erfordert Änderung ausschließlich in der Registry (+ ggf. dessen Renderer), nicht in Editor-, Settings- oder Druckcode.
- **AK-1.4** Given ein Rezept mit allen Feldern, When im Browser (Chromium) als PDF gedruckt, Then entspricht die Ausgabe der Settings-Vorschau in Position und Größe jedes Elements mit Abweichung ≤ 1 mm (Sichtprüfung über Overlay oder Messung im Playwright-Test).
- **AK-1.5** Texte sind identisch in Vorschau und Druck (Autor/Datum, Zeit, Portionen, Schwierigkeit). Einheitliche Formulierungen werden in der Registry definiert; die Entscheidung welcher Wortlaut gilt (Ausgang: Vorschau „Autor: X · Erstellt am …", Detail „Von X erstellt am …") wird vor Umsetzung festgelegt und im Test fixiert.
- **AK-1.6** Die Vorschau kürzt Zutaten und Schritte **nicht** mehr (Ausgang: 12/8). Passt der Inhalt nicht in die Box, wird er abgeschnitten **und** ein Warn-Badge „Inhalt zu lang: <Element>" angezeigt (siehe AK-6.x).
- **AK-1.7** `aspectRatio` und Objekt-Passung der Fotos gelten im Druck wie in der Vorschau (Ausgang: im Druck ignoriert).
- **AK-1.8** Zutaten werden mit den Mengen der gewählten Portionszahl gedruckt (skaliert, Bruchdarstellung wie `formatIngredientAsFraction`); Zwischenüberschriften (`type: 'heading'`) werden als Überschrift gerendert, Schritte nummeriert ohne Nummer für Überschriften (Nummerierung läuft über echte Schritte durch).
- **AK-1.9** Fotos: Quellenreihenfolge und -auswahl (Haupt-/Titelbild, `recipe.images`, Fallback `recipe.image` als String **und** als Objekt) sind identisch zur Detailansicht; es gibt eine einzige Hilfsfunktion `getRecipeImages(recipe)`.
- **AK-1.10** Gegeben ein Rezept ohne Foto N, dann zeigt `mode: 'preview'` einen Platzhalter, `mode: 'print'` zeigt **nichts** (leere Fläche, kein Platzhaltertext). (Ausgang Druck: Element nicht vorhanden.)

#### 2.2 Druckvorgang

- **AK-2.1** Klick auf Drucken rendert `PrintPage` in `#print-root` (Portal an `document.body`), setzt eine `@page { size: B cm H cm; margin: 0 }`-Regel und ruft `window.print()` auf.
- **AK-2.2** Nach `afterprint` (oder Abbruch) ist `#print-root` entfernt und die `@page`-Regel gelöscht; `document.head` enthält keine `style#print-*` mehr. Fallback-Timeout bleibt (30 s), ist aber idempotent (kein Fehler bei doppeltem Cleanup).
- **AK-2.3** Die Bildschirmansicht (`RecipeDetail`) wird während des Druckens **nicht** manipuliert: keine Klassenänderung an `contentRef`, keine Inline-Variablen auf `documentElement`.
- **AK-2.4** `@media print` in `RecipeDetail.css` enthält nur noch die Regel „alles außer `#print-root` ausblenden" (+ Hintergrund weiß). Alle bisherigen inhaltsbezogenen Print-Regeln (Legacy-Flex, Metadaten, Grid) sind entfernt. Dark Mode beeinflusst den Druck nicht (Test mit `data-theme=dark`).
- **AK-2.5** Das Druck-Portal enthält ausschließlich Renderer-Ausgabe: weder „Index:"-Button, Entwurf-Checkbox, Timer, Warenkorb-/Nährwert-Buttons noch andere interaktive Elemente (Test mit Admin-Login und Index-Recht: `#print-root` enthält 0 `button`/`input`).
- **AK-2.6** iOS: Der Popup-Sonderpfad nutzt den Inhalt von `#print-root` (nicht `contentRef.outerHTML`) und kopiert nur Print-relevante Styles. Popup-Blocker-Hinweis bleibt bestehen. *(Manuelle Abnahme auf echtem iPhone/iPad; als nicht automatisierbar gekennzeichnet.)*
- **AK-2.7** Schrift: Vor `window.print()` wird auf `document.fonts.ready` gewartet (max. 2 s Timeout), damit die konfigurierte `fontFamily` wirkt.
- **AK-2.8** Bilder werden vor dem Druck geladen (alle `<img>` in `#print-root` `complete` oder Timeout 5 s); kein Druck mit leeren Fotoboxen bei Netzlatenz.
- **AK-2.9** Die Berechtigung `printRecipe` bleibt unverändert wirksam: Button nur sichtbar bei `currentUser.printRecipe !== false`.

#### 2.3 Element-Registry und Geometrie

- **AK-3.1** `src/utils/printElements.js` ist die einzige Quelle für Element-IDs, Labels, Farben, `isImage`, Defaults (Hoch/Quer). `PRINT_FORMAT_ELEMENTS`, `DEFAULT_PRINT_ELEMENTS_PORTRAIT/LANDSCAPE` werden daraus abgeleitet oder weiterhin exportiert (Kompatibilität) – Werte **identisch** zu Ausgang (Snapshot-Test).
- **AK-3.2** Die Rotationsformel (`rotationCssOffset`) existiert genau einmal (`printLayout.js`). Editor, Renderer und alle Tests importieren sie von dort. Grep nach `(el.h - el.w) / 2` liefert genau 1 Treffer.
- **AK-3.3** `elementStyle(el, page)` (Utility) liefert aus Element und Seitenmaßen die CSS-Position (left/top/width/height in %, transform, Schrift, Rahmen, Ausrichtung). Editor-Vorschau und Renderer nutzen sie; Ergebnisse sind für die Ausgangs-Defaults identisch zu den heutigen Preview-Styles (Snapshot-Test, Hoch- und Querformat, alle 4 Rotationen).
- **AK-3.4** `%↔cm`-Umrechnung, Klemmung auf Seitengrenzen und Mindestgrößen (`MIN_W=5`, `MIN_H=3`) liegen in `printLayout.js` und sind per Unit-Test abgedeckt, inklusive Rotation 90/270 (Bounding Box getauscht).
- **AK-3.5** `mergePrintElementsWithDefaults` bleibt verhaltensgleich (ergänzt fehlende IDs, ignoriert unbekannte IDs nicht destruktiv: unbekannte IDs bleiben beim Speichern erhalten, werden aber nicht gerendert).

#### 2.4 Datenmodell v3 und Migration

- **AK-4.1** `layoutVersion` wird auf **3** angehoben. v3 entfernt Legacy-Felder aus dem aktiven Pfad: `elementOrder`, `imageWidth`, `imageAlign`, `imageColumns`.
- **AK-4.2** `migrateFormat(format)` ist **idempotent**, rein (keine Mutation des Eingabeobjekts) und führt v1 → v2 → v3 in einer Kette aus. Test: `migrate(migrate(x))` deep-equal `migrate(x)`.
- **AK-4.3** Legacy-Formate ohne `elements` (nur `elementOrder`/`imageWidth`/`imageAlign`) werden in ein `elements`-Layout überführt, das sie möglichst nah abbildet (Reihenfolge Bilder/Zutaten/Schritte von oben nach unten oder nebeneinander laut Defaults). Wo keine exakte Abbildung möglich ist, gilt Default-Layout; die Migration protokolliert dies in `format.migrationNotes` (Array, nur lesbar, im Editor als Hinweis anzeigbar).
- **AK-4.4** Migration passiert **beim Lesen** (`getPrintFormats`). Es wird **nichts automatisch** nach Firestore zurückgeschrieben; erst beim bewussten „Speichern" in den Einstellungen wird v3 persistiert. (Schutz für parallel laufende ältere App-Versionen/PWA-Caches, die v2 erwarten.)
- **AK-4.5** Abwärtskompatibilität beim Schreiben: v3-Format enthält weiterhin `elements` im v2-Koordinatensystem (x/y/w/h in % der Seitenbreite), sodass eine ältere App-Version ein v3-Format korrekt, wenn auch ohne neue Felder, anzeigt. Neue Felder sind additiv.
- **AK-4.6** Defekte Daten: `elements` nicht Array, fehlende Zahlenwerte, negative Größen, Werte außerhalb der Seite, unbekannte Rotation → werden auf Defaults/Klemmwerte normalisiert, ohne Exception; Test mit mindestens 8 Fehlerfällen.
- **AK-4.7** Formate ohne `pageWidthCm`/`pageHeightCm` erhalten in v3 explizit die A4-Maße passend zur Orientierung. `orientation` ist abgeleitet und konsistent zu Breite/Höhe.
- **AK-4.8** Firestore-Dokumentgröße: ein Format mit allen Elementen ≤ 8 KB; Test/Assertion beim Speichern, damit das 1-MiB-Dokumentlimit von `settings/app` nicht gefährdet wird (Warnung ab 20 Formaten).
- **AK-4.9** Es existiert ein dokumentierter Rollback: Ein v2-Snapshot der `printFormats` kann aus den in der Migration protokollierten Daten rekonstruiert werden **oder** vor dem ersten v3-Speichern wird `printFormatsBackup` (letzte v2-Fassung) im Settings-Dokument abgelegt. *(Entscheidung nötig, siehe 5.)*

#### 2.5 Formatauswahl und -verwaltung

- **AK-5.1** `selectPrintFormat(formats, imageCount)` bleibt verhaltensgleich (Schwelle, niedrigster passender Wert, Catch-all, Default bei leerer Liste). Alle Fälle aus der bestehenden Dokumentation sind Unit-Tests (siehe 2.8).
- **AK-5.2** Gleiche `maxPhotos` bei mehreren Formaten ist **deterministisch** geregelt (Reihenfolge in der Liste, erstes gewinnt) **und** wird beim Speichern als Fehler gemeldet (nicht speicherbar).
- **AK-5.3** Validierung beim Speichern (`validatePrintFormats`): (a) mindestens ein Catch-all (`maxPhotos == null`), (b) kein leerer Formatname, (c) keine doppelten `maxPhotos`, (d) `maxPhotos` ≥ 0 ganzzahlig, (e) Seitenmaße 5–200 cm. Fehler werden im UI am betroffenen Format angezeigt; Speichern ist bei Fehlern gesperrt.
- **AK-5.4** Löschen eines Formats nutzt `DeleteRowButton` (28×28, Radius 999, transparent, Rot erst bei Hover/Fokus, rechter Zeilenrand, Tooltip und aria-label „<Name> entfernen"). Der Text-Button „Löschen" entfällt.
- **AK-5.5** Löschen wirkt sofort in der Ansicht, Snackbar „Rückgängig" 6 s über `useUndoableDelete`; Wiederherstellung am alten Index. Kein Bestätigungsdialog.
- **AK-5.6** Mobil: Linksswipe auf der Formatzeile löscht über `useSwipeToDelete` mit identischem Undo-Verhalten.
- **AK-5.7** Das einzige verbleibende Catch-all-Format ist nicht löschbar: `DeleteRowButton` ist deaktiviert und der Tooltip nennt den Grund.
- **AK-5.8** „Format duplizieren" erzeugt eine tief kopierte Vorlage mit neuer eindeutiger `id` und Namen „<Name> Kopie"; `maxPhotos` der Kopie ist leer, um Konflikte zu vermeiden. Änderungen an der Kopie verändern das Original nicht.
- **AK-5.9** Neue Formate (`+ Format`) starten mit Defaults der gewählten Orientierung (Ausgang: immer Hochformat-Defaults → Fix) und eindeutiger ID (nicht `Date.now()`-Kollision bei Doppelklick).
- **AK-5.10** Beim Verlassen des Druck-Tabs mit ungespeicherten Änderungen erscheint ein Hinweis (Speichern / Verwerfen / Abbrechen).
- **AK-5.11** Orientierungswechsel im Editor verwirft Anpassungen nicht stillschweigend: Entweder Bestätigung „Layout wird auf Standard zurückgesetzt" oder Undo-Snackbar „Rückgängig" (6 s).

#### 2.6 Editor und Vorschau

- **AK-6.1** `PrintFormatEditor` ist in Teilkomponenten zerlegt (Toolbar, Canvas, Elementbox, Eigenschaftenpanel, Visibility-Chips) und keine Datei überschreitet 400 Zeilen. Verhalten und Optik bleiben unverändert (visuelle Prüfung + Interaktionstests).
- **AK-6.2** Alle bestehenden Editor-Funktionen funktionieren unverändert: Drag, 8 Resize-Handles, Snap (Schwelle 2 %) mit Hilfslinien, Klick-Auswahl, Drag-Schwelle 0,5 %, Position/Größe in cm, Schrift (Faktor 0,5–4, B/I/U, Farbe), Textausrichtung H/V, Rotation, Seitenverhältnis (nur Fotos), Rahmen, Ausrichten, Layout zurücksetzen, Sichtbarkeits-Chips.
- **AK-6.3** Der Editor-Canvas rendert die Elementinhalte (Lorem/Rezeptdaten) über denselben `PrintPage`-Renderer als Hintergrundebene, wenn ein Vorschau-Rezept gewählt ist; ohne Rezept zeigt er wie bisher farbige Platzhalterboxen. Der Wechsel erfolgt ohne Verzögerung > 100 ms bei Drag (kein Neuberechnen der Rezeptdaten pro Mausbewegung; Memoisierung).
- **AK-6.4** Drag/Resize löst nicht pro Mausbewegung ein Neurendern der gesamten Settings-Seite aus (Profiler-Check: Neurender des `PrintFormatEditor`-Teilbaums, nicht von `Settings`). Akzeptiert ist `onChange` pro Frame via `requestAnimationFrame`.
- **AK-6.5** Überlauf-Erkennung: Für Text-Elemente (`ingredients`, `steps`, `title`, `metadata`, …) misst die Vorschau `scrollHeight > clientHeight` und zeigt ein Badge „abgeschnitten" am Element sowie eine Sammelmeldung über der Vorschau („Zutaten: abgeschnitten"). Im Druck (`mode: 'print'`) kein Badge.
- **AK-6.6** `Kulinarik` ist im Renderer als Teil des Elements `metadata` dargestellt (Ausgang: nicht positioniert, siehe L-02). Der Elementname im Editor lautet weiterhin „Kulinarik / Zeit / Infos"; der Inhalt entspricht dem Label (Kulinarik + Zeit + Schwierigkeit + Portionen). Kein Inhalt fließt außerhalb positionierter Elemente.
- **AK-6.7** Tastatur/ARIA (Minimum): Elemente im Editor sind fokussierbar (`tabindex`, `role="button"`, `aria-label` = Label), Handles haben `aria-hidden`, Pfeiltasten verschieben ausgewähltes Element um 0,1 cm (Shift 1 cm). *(Vorgriff auf REQ-07, hier als Mindeststandard wegen Komponentenumbau.)*
- **AK-6.8** Alle Texte in der Oberfläche bleiben Deutsch; keine Emojis in neuen UI-Texten (siehe `NO_EMOJIS_POLICY.md`).

#### 2.7 Persistenz und Settings-Integration

- **AK-7.1** `getPrintFormats` liefert migrierte, normalisierte Formate; `savePrintFormats` validiert (AK-5.3) und wirft bei Fehlern einen typisierten Fehler (`PrintFormatValidationError` mit Feldliste), den die UI anzeigt.
- **AK-7.2** `savePrintFormats` aktualisiert den Settings-Cache und löscht keine fremden Felder in `settings/app` (nur `printFormats`, ggf. `printFormatsBackup`).
- **AK-7.3** Parallelität: Zwei Admins speichern gleichzeitig → letzter gewinnt ist akzeptiert; die UI zeigt jedoch nach dem Speichern den tatsächlich gespeicherten Stand (Reload aus Firestore, keine stille Divergenz). Dokumentiert, nicht transaktional.
- **AK-7.4** Ladefehler (Firestore nicht erreichbar): UI zeigt Fehlermeldung und nutzt `DEFAULT_PRINT_FORMATS`; Speichern ist in diesem Zustand gesperrt, damit Defaults nicht versehentlich die gespeicherten Formate überschreiben.
- **AK-7.5** `RecipeDetail` lädt Formate wie bisher parallel zu den anderen Settings (bestehender Test „loads timeline icon calls and print formats in parallel" bleibt grün).

#### 2.8 Tests (müssen in `npm run test:ci` laufen, nicht in `scripts/quarantined-tests.js`)

- **AK-8.1** Neue/erweiterte Suites: `printLayout.test.js`, `printElements.test.js`, `printFormats.test.js` (Auswahl, Migration, Validierung), `PrintPage.test.js`, `PrintFormatEditor.test.js`, Erweiterung `RecipeDetail.test.js` (Druckablauf).
- **AK-8.2** Abdeckung der neuen Utility-Dateien (`printLayout`, `printElements`, `printFormats`): ≥ 90 % Zeilen/Branches (Jest `--coverage` für diese Dateien).
- **AK-8.3** `selectPrintFormat`: mindestens 8 Fälle (0 Fotos, genau Schwelle, über allen Schwellen, mehrere Schwellen, nur Catch-all, leere Liste, `undefined`-Liste, fehlendes `maxPhotos`).
- **AK-8.4** `migrateFormat`: v1 Hochformat, v1 Querformat, v1 mit Custom-Seitengröße, v2 unverändert, Legacy ohne `elements`, defekte Daten, Idempotenz.
- **AK-8.5** `PrintPage`: Snapshot je Element, ausgeblendetes Element, Rotation 90/270, Rahmen einseitig/vierseitig, Schrift-Overrides, fehlendes Foto (preview vs. print), Zwischenüberschriften, Portionsskalierung.
- **AK-8.6** Druckablauf-Test: `window.print` gemockt → wird 1× aufgerufen; `#print-root` vorhanden während des Aufrufs; nach `afterprint` entfernt; kein `style#print-*` im Head; Timeout-Fallback räumt auf.
- **AK-8.7** Editor-Interaktionstest: Drag verändert x/y im Format über `onChange`, Resize respektiert Mindestgröße, Klemmung an Seitenrand, Snap rastet bei < 2 %, Sichtbarkeits-Chip blendet Element aus.
- **AK-8.8** Playwright-Smoketest (Chromium vorinstalliert): Settings → Druck → Format anlegen → Element verschieben → Speichern (Firestore-Mock/Emulator) → Rezept öffnen → `page.emulateMedia({ media: 'print' })` → Position des Titelelements innerhalb ± 1 mm der Vorschau. Falls Emulator nicht verfügbar: Test gegen gemockte `getPrintFormats`.
- **AK-8.9** Keine neue Suite landet in `scripts/quarantined-tests.js`; die Quarantäne-Liste wächst nicht.
- **AK-8.10** `npm run test:ci` und Lint/Build (`npm run build`) laufen ohne neue Warnungen (CI=true behandelt Warnungen als Fehler – dies prüfen, bevor man pusht).

#### 2.9 Code-Qualität und Aufräumen

- **AK-9.1** Entfernt: `ELEMENT_SELECTOR_MAP`, `WYSIWYG_HIDDEN_ELEMENTS`, `handlePrint`-Style-Injektion, Print-Wrapper in `RecipeDetail.js` (`recipe-photo-wysiwyg`, `recipe-ingredients-heading`, `recipe-steps-heading`, die nur für Print existieren) sowie zugehöriges CSS. `RecipeDetail.js` schrumpft entsprechend; die Bildschirmansicht bleibt visuell unverändert (Sichtprüfung/Snapshot).
- **AK-9.2** Keine toten Exporte: `DEFAULT_PRINT_ELEMENT_ORDER`, `PRINT_IMAGE_ALIGN_OPTIONS`, `PRINT_IMAGE_COLUMNS_OPTIONS` und `DEFAULT_PRINT_FONT_FAMILY`-Duplikate werden entfernt oder begründet behalten (`grep` ohne Verwender).
- **AK-9.3** Die Standard-Schriftart ist in einer Konstante definiert (Ausgang: 4× als String-Literal dupliziert).
- **AK-9.4** Der Toolbar-Eintrag „Bildspalten" entfällt (wirkungslos im WYSIWYG-Modus, siehe L-12).
- **AK-9.5** `README`/`HANDOVER` enthalten einen Abschnitt „Druck-Layouts": Datenmodell v3, Koordinatensystem, Registry-Erweiterung („neues Element hinzufügen in 3 Schritten"), Migrationshinweise.
- **AK-9.6** `CHANGELOG.md` enthält einen Eintrag zum Refactoring (benutzersichtbar: „Druck entspricht jetzt der Vorschau").

#### 2.10 Nichtfunktionale Kriterien

- **AK-10.1** Performance: Rendern von `PrintPage` für ein Rezept mit 40 Zutaten / 25 Schritten < 50 ms (Median, Dev-Build, Messung via `performance.now()` im Test, nur Richtwert).
- **AK-10.2** Bundle: Kein neues Laufzeit-Paket für das Refactoring (außer begründet).
- **AK-10.3** Barrierefreiheit: Gedrucktes/gerendertes Dokument nutzt semantisches HTML (`h1`, `ul`, `ol`, `img` mit `alt`).
- **AK-10.4** Browser-Matrix: Abnahme in aktuellem Chrome und Safari (macOS) manuell; iOS Safari manuell (AK-2.6). Firefox: nicht abgenommen, keine Regression bekannt (nicht getestet).

---

### 3. Bewusste Verhaltensänderungen (Abgrenzung zum Ausgang)

| # | Ausgang | Neu | Begründung |
|---|---|---|---|
| V-1 | Kulinarik-Zeile wird im WYSIWYG-Druck nicht positioniert | Teil von `metadata`, positioniert | L-02 |
| V-2 | „Index" und „Entwurf" können mitgedruckt werden | Erscheinen nie im Druck | L-03 |
| V-3 | Foto-Seitenverhältnis im Druck ignoriert | Wirkt wie in Vorschau | L-04 |
| V-4 | Portionen nur in Vorschau sichtbar | Einheitlich (Entscheidung: in `metadata` enthalten) | L-04 |
| V-5 | Vorschau kürzt auf 12/8 | Keine Kürzung, dafür Überlauf-Badge | L-01 |
| V-6 | Neues Format immer mit Hochformat-Defaults | Defaults passend zur Orientierung | Konsistenz |
| V-7 | Löschen per Text-Button, sofort ohne Undo | `DeleteRowButton` + Undo-Snackbar | `CLAUDE.md` |
| V-8 | Orientierungswechsel setzt Layout lautlos zurück | Bestätigung oder Undo | Datenverlust |

Alle übrigen Formate müssen nach dem Refactoring **gleich aussehen** wie vorher (AK-3.3, AK-1.4).

---

### 4. Definition of Done

1. Alle AK mit Status „automatisiert" sind durch Tests belegt und grün in `npm run test:ci`.
2. Manuelle Abnahme dokumentiert (Chrome Desktop, Safari macOS, iOS) mit Beispielrezepten: 1 Foto, 4 Fotos, 0 Fotos, 40 Zutaten.
3. Vergleich Vorher/Nachher für alle gespeicherten Formate: Screenshots Hoch- und Querformat, Differenz ≤ 1 mm (außer V-1…V-8).
4. Migration geprüft mit Kopie echter `printFormats`-Daten (v1, v2, Legacy), keine Exception.
5. Doku und CHANGELOG aktualisiert; Code-Review durchgeführt.
6. Rollback-Weg beschrieben und geprüft (AK-4.9).

### 5. Offene Entscheidungen vor Umsetzungsstart

1. **Scope:** Ist die Abgrenzung (Abschnitt 0) richtig – insbesondere Überlauf bleibt „abschneiden mit Warnung", Mehrseitigkeit später?
2. **Textwortlaut** (AK-1.5): „Von X erstellt am …" (Detailansicht) oder „Autor: X · Erstellt am …" (Vorschau)? Mein Vorschlag: Detailansicht, weil Nutzer sie kennen.
3. **Portionen im Druck** (V-4): in `metadata` enthalten, ja/nein? Vorschlag: ja.
4. **Rollback-Sicherung** (AK-4.9): Backup-Feld `printFormatsBackup` in Firestore (einfach, ein Feld mehr) oder reine Code-Migration? Vorschlag: Backup, weil es eine geteilte Einstellung für alle Nutzer ist.
5. **Rollout:** In einem PR oder in Stufen (1: Utils + Tests, 2: Renderer + Druck, 3: Editor-Zerlegung + Formatverwaltung)? Vorschlag: Stufen, damit jeder Schritt einzeln prüfbar und rücknehmbar ist. Die Stufe 2 trägt das Hauptrisiko (iOS/`@page`).
6. **iOS/Safari-Verhalten** von `@page size` ist ungeprüft. Ich empfehle vor Stufe 2 einen kurzen Spike auf einem echten Gerät.

### 6. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Browser ignoriert `@page size` (Safari) | Gedrucktes Layout weicht ab | Spike, `#print-root` auf feste cm-Maße statt Seitenbreite %, notfalls Skalierung |
| Geteiltes `settings/app` | Migration betrifft alle Nutzer | Lesen-Migration, kein Auto-Write, Backup (AK-4.4/4.9) |
| Pixel-Abweichung gegenüber altem Druck | Sichtbare Layout-Änderung | Snapshot-Vergleich AK-3.3, Abnahme DoD 3 |
| Veraltete PWA-Caches | Alte App liest v3 | Additives Datenmodell (AK-4.5) |
| Umfang | Review-Last | Stufenplan (Entscheidung 5) |
