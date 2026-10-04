# Refactoring Druck-Layoutvorlagen – Akzeptanzkriterien

Stand: 2026-10-04 · Status: **Entwurf zur Freigabe, noch keine Codeänderung**
Bezug: `DRUCKFUNKTION_ANFORDERUNGEN.md` (REQ-01, REQ-03, Teile von REQ-02/-05/-08/-11)

---

## 0. Annahmen zum Scope (bitte bestätigen)

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

## 1. Zielarchitektur

- **Eine Render-Komponente** `PrintPage` (aus `PrintPreview` entstanden) rendert Rezept + Format → React-Baum. Genutzt von Settings-Vorschau, Editor-Hintergrundvorschau (optional) und Druck.
- **Druck** rendert `PrintPage` in ein Portal `#print-root`; `@media print` blendet alles andere aus. Kein Zugriff mehr auf `contentRef`, keine Selektor-Map, keine `<style>`-Injektion in `document.head` (außer einer einzigen `@page`-Regel).
- **Element-Registry** (`src/utils/printElements.js`): Einzige Definition je Element (id, Label, Farbe, Typ text/image, Defaults Hoch/Quer, Renderfunktion-Referenz). `PRINT_FORMAT_ELEMENTS`, Defaults und Rendering leiten sich daraus ab.
- **Geometrie-Utility** (`src/utils/printLayout.js`): Reine Funktionen für Seitenmaße, %↔cm, Rotationsversatz, Klemmung, Snap, Stilberechnung eines Elements. Genau eine Implementierung.
- **Format-Logik** (`src/utils/printFormats.js`): Auswahl, Migration, Validierung, Defaults – aus `customLists.js` ausgelagert; `customLists.js` re-exportiert vorübergehend für Kompatibilität.
- Datenmodell **v3**, Persistenz weiterhin `settings/app.printFormats`.

---

## 2. Akzeptanzkriterien

Notation: **AK-x.y**, Given/When/Then wo sinnvoll. „Ausgang" = Verhalten auf `main` vor dem Refactoring.

### 2.1 Einheitlicher Renderer

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

### 2.2 Druckvorgang

- **AK-2.1** Klick auf Drucken rendert `PrintPage` in `#print-root` (Portal an `document.body`), setzt eine `@page { size: B cm H cm; margin: 0 }`-Regel und ruft `window.print()` auf.
- **AK-2.2** Nach `afterprint` (oder Abbruch) ist `#print-root` entfernt und die `@page`-Regel gelöscht; `document.head` enthält keine `style#print-*` mehr. Fallback-Timeout bleibt (30 s), ist aber idempotent (kein Fehler bei doppeltem Cleanup).
- **AK-2.3** Die Bildschirmansicht (`RecipeDetail`) wird während des Druckens **nicht** manipuliert: keine Klassenänderung an `contentRef`, keine Inline-Variablen auf `documentElement`.
- **AK-2.4** `@media print` in `RecipeDetail.css` enthält nur noch die Regel „alles außer `#print-root` ausblenden" (+ Hintergrund weiß). Alle bisherigen inhaltsbezogenen Print-Regeln (Legacy-Flex, Metadaten, Grid) sind entfernt. Dark Mode beeinflusst den Druck nicht (Test mit `data-theme=dark`).
- **AK-2.5** Das Druck-Portal enthält ausschließlich Renderer-Ausgabe: weder „Index:"-Button, Entwurf-Checkbox, Timer, Warenkorb-/Nährwert-Buttons noch andere interaktive Elemente (Test mit Admin-Login und Index-Recht: `#print-root` enthält 0 `button`/`input`).
- **AK-2.6** iOS: Der Popup-Sonderpfad nutzt den Inhalt von `#print-root` (nicht `contentRef.outerHTML`) und kopiert nur Print-relevante Styles. Popup-Blocker-Hinweis bleibt bestehen. *(Manuelle Abnahme auf echtem iPhone/iPad; als nicht automatisierbar gekennzeichnet.)*
- **AK-2.7** Schrift: Vor `window.print()` wird auf `document.fonts.ready` gewartet (max. 2 s Timeout), damit die konfigurierte `fontFamily` wirkt.
- **AK-2.8** Bilder werden vor dem Druck geladen (alle `<img>` in `#print-root` `complete` oder Timeout 5 s); kein Druck mit leeren Fotoboxen bei Netzlatenz.
- **AK-2.9** Die Berechtigung `printRecipe` bleibt unverändert wirksam: Button nur sichtbar bei `currentUser.printRecipe !== false`.

### 2.3 Element-Registry und Geometrie

- **AK-3.1** `src/utils/printElements.js` ist die einzige Quelle für Element-IDs, Labels, Farben, `isImage`, Defaults (Hoch/Quer). `PRINT_FORMAT_ELEMENTS`, `DEFAULT_PRINT_ELEMENTS_PORTRAIT/LANDSCAPE` werden daraus abgeleitet oder weiterhin exportiert (Kompatibilität) – Werte **identisch** zu Ausgang (Snapshot-Test).
- **AK-3.2** Die Rotationsformel (`rotationCssOffset`) existiert genau einmal (`printLayout.js`). Editor, Renderer und alle Tests importieren sie von dort. Grep nach `(el.h - el.w) / 2` liefert genau 1 Treffer.
- **AK-3.3** `elementStyle(el, page)` (Utility) liefert aus Element und Seitenmaßen die CSS-Position (left/top/width/height in %, transform, Schrift, Rahmen, Ausrichtung). Editor-Vorschau und Renderer nutzen sie; Ergebnisse sind für die Ausgangs-Defaults identisch zu den heutigen Preview-Styles (Snapshot-Test, Hoch- und Querformat, alle 4 Rotationen).
- **AK-3.4** `%↔cm`-Umrechnung, Klemmung auf Seitengrenzen und Mindestgrößen (`MIN_W=5`, `MIN_H=3`) liegen in `printLayout.js` und sind per Unit-Test abgedeckt, inklusive Rotation 90/270 (Bounding Box getauscht).
- **AK-3.5** `mergePrintElementsWithDefaults` bleibt verhaltensgleich (ergänzt fehlende IDs, ignoriert unbekannte IDs nicht destruktiv: unbekannte IDs bleiben beim Speichern erhalten, werden aber nicht gerendert).

### 2.4 Datenmodell v3 und Migration

- **AK-4.1** `layoutVersion` wird auf **3** angehoben. v3 entfernt Legacy-Felder aus dem aktiven Pfad: `elementOrder`, `imageWidth`, `imageAlign`, `imageColumns`.
- **AK-4.2** `migrateFormat(format)` ist **idempotent**, rein (keine Mutation des Eingabeobjekts) und führt v1 → v2 → v3 in einer Kette aus. Test: `migrate(migrate(x))` deep-equal `migrate(x)`.
- **AK-4.3** Legacy-Formate ohne `elements` (nur `elementOrder`/`imageWidth`/`imageAlign`) werden in ein `elements`-Layout überführt, das sie möglichst nah abbildet (Reihenfolge Bilder/Zutaten/Schritte von oben nach unten oder nebeneinander laut Defaults). Wo keine exakte Abbildung möglich ist, gilt Default-Layout; die Migration protokolliert dies in `format.migrationNotes` (Array, nur lesbar, im Editor als Hinweis anzeigbar).
- **AK-4.4** Migration passiert **beim Lesen** (`getPrintFormats`). Es wird **nichts automatisch** nach Firestore zurückgeschrieben; erst beim bewussten „Speichern" in den Einstellungen wird v3 persistiert. (Schutz für parallel laufende ältere App-Versionen/PWA-Caches, die v2 erwarten.)
- **AK-4.5** Abwärtskompatibilität beim Schreiben: v3-Format enthält weiterhin `elements` im v2-Koordinatensystem (x/y/w/h in % der Seitenbreite), sodass eine ältere App-Version ein v3-Format korrekt, wenn auch ohne neue Felder, anzeigt. Neue Felder sind additiv.
- **AK-4.6** Defekte Daten: `elements` nicht Array, fehlende Zahlenwerte, negative Größen, Werte außerhalb der Seite, unbekannte Rotation → werden auf Defaults/Klemmwerte normalisiert, ohne Exception; Test mit mindestens 8 Fehlerfällen.
- **AK-4.7** Formate ohne `pageWidthCm`/`pageHeightCm` erhalten in v3 explizit die A4-Maße passend zur Orientierung. `orientation` ist abgeleitet und konsistent zu Breite/Höhe.
- **AK-4.8** Firestore-Dokumentgröße: ein Format mit allen Elementen ≤ 8 KB; Test/Assertion beim Speichern, damit das 1-MiB-Dokumentlimit von `settings/app` nicht gefährdet wird (Warnung ab 20 Formaten).
- **AK-4.9** Es existiert ein dokumentierter Rollback: Ein v2-Snapshot der `printFormats` kann aus den in der Migration protokollierten Daten rekonstruiert werden **oder** vor dem ersten v3-Speichern wird `printFormatsBackup` (letzte v2-Fassung) im Settings-Dokument abgelegt. *(Entscheidung nötig, siehe 5.)*

### 2.5 Formatauswahl und -verwaltung

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

### 2.6 Editor und Vorschau

- **AK-6.1** `PrintFormatEditor` ist in Teilkomponenten zerlegt (Toolbar, Canvas, Elementbox, Eigenschaftenpanel, Visibility-Chips) und keine Datei überschreitet 400 Zeilen. Verhalten und Optik bleiben unverändert (visuelle Prüfung + Interaktionstests).
- **AK-6.2** Alle bestehenden Editor-Funktionen funktionieren unverändert: Drag, 8 Resize-Handles, Snap (Schwelle 2 %) mit Hilfslinien, Klick-Auswahl, Drag-Schwelle 0,5 %, Position/Größe in cm, Schrift (Faktor 0,5–4, B/I/U, Farbe), Textausrichtung H/V, Rotation, Seitenverhältnis (nur Fotos), Rahmen, Ausrichten, Layout zurücksetzen, Sichtbarkeits-Chips.
- **AK-6.3** Der Editor-Canvas rendert die Elementinhalte (Lorem/Rezeptdaten) über denselben `PrintPage`-Renderer als Hintergrundebene, wenn ein Vorschau-Rezept gewählt ist; ohne Rezept zeigt er wie bisher farbige Platzhalterboxen. Der Wechsel erfolgt ohne Verzögerung > 100 ms bei Drag (kein Neuberechnen der Rezeptdaten pro Mausbewegung; Memoisierung).
- **AK-6.4** Drag/Resize löst nicht pro Mausbewegung ein Neurendern der gesamten Settings-Seite aus (Profiler-Check: Neurender des `PrintFormatEditor`-Teilbaums, nicht von `Settings`). Akzeptiert ist `onChange` pro Frame via `requestAnimationFrame`.
- **AK-6.5** Überlauf-Erkennung: Für Text-Elemente (`ingredients`, `steps`, `title`, `metadata`, …) misst die Vorschau `scrollHeight > clientHeight` und zeigt ein Badge „abgeschnitten" am Element sowie eine Sammelmeldung über der Vorschau („Zutaten: abgeschnitten"). Im Druck (`mode: 'print'`) kein Badge.
- **AK-6.6** `Kulinarik` ist im Renderer als Teil des Elements `metadata` dargestellt (Ausgang: nicht positioniert, siehe L-02). Der Elementname im Editor lautet weiterhin „Kulinarik / Zeit / Infos"; der Inhalt entspricht dem Label (Kulinarik + Zeit + Schwierigkeit + Portionen). Kein Inhalt fließt außerhalb positionierter Elemente.
- **AK-6.7** Tastatur/ARIA (Minimum): Elemente im Editor sind fokussierbar (`tabindex`, `role="button"`, `aria-label` = Label), Handles haben `aria-hidden`, Pfeiltasten verschieben ausgewähltes Element um 0,1 cm (Shift 1 cm). *(Vorgriff auf REQ-07, hier als Mindeststandard wegen Komponentenumbau.)*
- **AK-6.8** Alle Texte in der Oberfläche bleiben Deutsch; keine Emojis in neuen UI-Texten (siehe `NO_EMOJIS_POLICY.md`).

### 2.7 Persistenz und Settings-Integration

- **AK-7.1** `getPrintFormats` liefert migrierte, normalisierte Formate; `savePrintFormats` validiert (AK-5.3) und wirft bei Fehlern einen typisierten Fehler (`PrintFormatValidationError` mit Feldliste), den die UI anzeigt.
- **AK-7.2** `savePrintFormats` aktualisiert den Settings-Cache und löscht keine fremden Felder in `settings/app` (nur `printFormats`, ggf. `printFormatsBackup`).
- **AK-7.3** Parallelität: Zwei Admins speichern gleichzeitig → letzter gewinnt ist akzeptiert; die UI zeigt jedoch nach dem Speichern den tatsächlich gespeicherten Stand (Reload aus Firestore, keine stille Divergenz). Dokumentiert, nicht transaktional.
- **AK-7.4** Ladefehler (Firestore nicht erreichbar): UI zeigt Fehlermeldung und nutzt `DEFAULT_PRINT_FORMATS`; Speichern ist in diesem Zustand gesperrt, damit Defaults nicht versehentlich die gespeicherten Formate überschreiben.
- **AK-7.5** `RecipeDetail` lädt Formate wie bisher parallel zu den anderen Settings (bestehender Test „loads timeline icon calls and print formats in parallel" bleibt grün).

### 2.8 Tests (müssen in `npm run test:ci` laufen, nicht in `scripts/quarantined-tests.js`)

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

### 2.9 Code-Qualität und Aufräumen

- **AK-9.1** Entfernt: `ELEMENT_SELECTOR_MAP`, `WYSIWYG_HIDDEN_ELEMENTS`, `handlePrint`-Style-Injektion, Print-Wrapper in `RecipeDetail.js` (`recipe-photo-wysiwyg`, `recipe-ingredients-heading`, `recipe-steps-heading`, die nur für Print existieren) sowie zugehöriges CSS. `RecipeDetail.js` schrumpft entsprechend; die Bildschirmansicht bleibt visuell unverändert (Sichtprüfung/Snapshot).
- **AK-9.2** Keine toten Exporte: `DEFAULT_PRINT_ELEMENT_ORDER`, `PRINT_IMAGE_ALIGN_OPTIONS`, `PRINT_IMAGE_COLUMNS_OPTIONS` und `DEFAULT_PRINT_FONT_FAMILY`-Duplikate werden entfernt oder begründet behalten (`grep` ohne Verwender).
- **AK-9.3** Die Standard-Schriftart ist in einer Konstante definiert (Ausgang: 4× als String-Literal dupliziert).
- **AK-9.4** Der Toolbar-Eintrag „Bildspalten" entfällt (wirkungslos im WYSIWYG-Modus, siehe L-12).
- **AK-9.5** `README`/`HANDOVER` enthalten einen Abschnitt „Druck-Layouts": Datenmodell v3, Koordinatensystem, Registry-Erweiterung („neues Element hinzufügen in 3 Schritten"), Migrationshinweise.
- **AK-9.6** `CHANGELOG.md` enthält einen Eintrag zum Refactoring (benutzersichtbar: „Druck entspricht jetzt der Vorschau").

### 2.10 Nichtfunktionale Kriterien

- **AK-10.1** Performance: Rendern von `PrintPage` für ein Rezept mit 40 Zutaten / 25 Schritten < 50 ms (Median, Dev-Build, Messung via `performance.now()` im Test, nur Richtwert).
- **AK-10.2** Bundle: Kein neues Laufzeit-Paket für das Refactoring (außer begründet).
- **AK-10.3** Barrierefreiheit: Gedrucktes/gerendertes Dokument nutzt semantisches HTML (`h1`, `ul`, `ol`, `img` mit `alt`).
- **AK-10.4** Browser-Matrix: Abnahme in aktuellem Chrome und Safari (macOS) manuell; iOS Safari manuell (AK-2.6). Firefox: nicht abgenommen, keine Regression bekannt (nicht getestet).

---

## 3. Bewusste Verhaltensänderungen (Abgrenzung zum Ausgang)

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

## 4. Definition of Done

1. Alle AK mit Status „automatisiert" sind durch Tests belegt und grün in `npm run test:ci`.
2. Manuelle Abnahme dokumentiert (Chrome Desktop, Safari macOS, iOS) mit Beispielrezepten: 1 Foto, 4 Fotos, 0 Fotos, 40 Zutaten.
3. Vergleich Vorher/Nachher für alle gespeicherten Formate: Screenshots Hoch- und Querformat, Differenz ≤ 1 mm (außer V-1…V-8).
4. Migration geprüft mit Kopie echter `printFormats`-Daten (v1, v2, Legacy), keine Exception.
5. Doku und CHANGELOG aktualisiert; Code-Review durchgeführt.
6. Rollback-Weg beschrieben und geprüft (AK-4.9).

## 5. Offene Entscheidungen vor Umsetzungsstart

1. **Scope:** Ist die Abgrenzung (Abschnitt 0) richtig – insbesondere Überlauf bleibt „abschneiden mit Warnung", Mehrseitigkeit später?
2. **Textwortlaut** (AK-1.5): „Von X erstellt am …" (Detailansicht) oder „Autor: X · Erstellt am …" (Vorschau)? Mein Vorschlag: Detailansicht, weil Nutzer sie kennen.
3. **Portionen im Druck** (V-4): in `metadata` enthalten, ja/nein? Vorschlag: ja.
4. **Rollback-Sicherung** (AK-4.9): Backup-Feld `printFormatsBackup` in Firestore (einfach, ein Feld mehr) oder reine Code-Migration? Vorschlag: Backup, weil es eine geteilte Einstellung für alle Nutzer ist.
5. **Rollout:** In einem PR oder in Stufen (1: Utils + Tests, 2: Renderer + Druck, 3: Editor-Zerlegung + Formatverwaltung)? Vorschlag: Stufen, damit jeder Schritt einzeln prüfbar und rücknehmbar ist. Die Stufe 2 trägt das Hauptrisiko (iOS/`@page`).
6. **iOS/Safari-Verhalten** von `@page size` ist ungeprüft. Ich empfehle vor Stufe 2 einen kurzen Spike auf einem echten Gerät.

## 6. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Browser ignoriert `@page size` (Safari) | Gedrucktes Layout weicht ab | Spike, `#print-root` auf feste cm-Maße statt Seitenbreite %, notfalls Skalierung |
| Geteiltes `settings/app` | Migration betrifft alle Nutzer | Lesen-Migration, kein Auto-Write, Backup (AK-4.4/4.9) |
| Pixel-Abweichung gegenüber altem Druck | Sichtbare Layout-Änderung | Snapshot-Vergleich AK-3.3, Abnahme DoD 3 |
| Veraltete PWA-Caches | Alte App liest v3 | Additives Datenmodell (AK-4.5) |
| Umfang | Review-Last | Stufenplan (Entscheidung 5) |
