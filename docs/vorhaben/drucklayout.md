# Vorhaben: Drucklayout (Vorlagen konfigurieren mit Word-Gefühl)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 25.11.2026
(Stufen 1 bis 3 gemergt und ausgeliefert. Seit dem Abend des 25.11.2026 neue Richtung: Der Eigentümer will die
Anordnung „frei wie in Word“. Zwei Wege liegen dafür vor: die Word-Datei als Vorlage (Machbarkeitstest zur
Hälfte gelaufen) und die freie Anordnung in der App ohne Word (Klick-Entwurf „Baukasten“, Empfehlung der
Session). Die Wahl steht aus; die Stufen 4 bis 6 des bisherigen Plans ruhen bis dahin).

**Ziel:** Die Konfiguration der Druckvorlagen unter Einstellungen › Drucklayout ist bedienbar und fühlt
sich an wie Word: Menüband oben, das Blatt im Mittelpunkt, Formatvorlagen, Elemente verschiebbar. Dafür
wird das Druckmodul vollständig umgebaut: nur noch ein Layoutsystem (Vorlagen), aufgeräumte Struktur.
Der Druckablauf selbst (`printRunner`, `@page`, iOS-Weg) bleibt, wie er ist.

**Auslöser (Eigentümer, 25.11.2026):** „Die Konfiguration der Layouttemplates ist von der Bedienbarkeit
katastrophal“, dazu „Ich hätte lieber ein Word-Gefühl in der Einstellung der Templates“.

**Entwürfe:** https://claude.ai/artifact/Nj9Mjg1zEzkXEywPGb5Kys (Leinwand „Drucklayout mit Word-Gefühl“,
25.11.2026). Drei Varianten des Aufbaus: A Formatliste links, Menüband mit Reitern (voller Umfang) · B Formate
als Reiter, schlankes Band (weniger Regler, nur Formatvorlagen) · C Übersicht der Formate plus Editor im
Vollbild. Dazu drei Detailblätter: Menüband im vollen und im schlanken Umfang samt Regel in Klartext, Elemente
verschieben, Handy. Aufbau und Umfang lassen sich kombinieren. **Gewählt am 25.11.2026: Aufbau C** (Eigentümer:
„Mache Stufe 3 mit C“); der Umfang (voll oder schlank) ist offen. Die Zeichenblätter sind in der Session nicht
gerendert und angesehen worden (die Leinwand sieht das nicht vor); beim ersten Öffnen auf Darstellungsfehler
achten. Keine Mockups im Repo.

Das Aussehen ist das von brouBook (Farben und Knöpfe aus `tokens.css`), kein Nachbau von Word: übernommen ist
die Bedienidee (Reiter über dem Blatt, Blatt in der Mitte, Formatvorlagen), nicht dessen Gestaltung.

**Technische Doku des Moduls:** `docs/features/druck.md` (Abschnitt „Druck-Layouts (Entwicklerdoku)“).

## Ist-Zustand (Messung 25.11.2026, main 3ce1c7c)

Reiter „Drucklayout“ gegen die lokalen Emulatoren fotografiert und vermessen (Desktop 1280 × 860, Handy
iPhone 13):

| Zustand | Desktop | Handy | Bedienelemente |
|---|---|---|---|
| ein Format, freies Layout | 2.298 px (2,7 Bildschirme) | 2.270 px (3,4) | 25 |
| ein Format, Vorlage | 1.851 px (2,2) | 2.644 px (4,0) | 53 |
| ein Format, alle Klappbereiche offen | 2.064 px (2,4) | 3.146 px (4,7) | 53 |
| drei Formate, Vorlage | 4.855 px (5,6) | 6.418 px (9,7) | 153 |

Beobachtet:
- Jedes Format ist komplett aufgeklappt, eines unter dem anderen, je mit eigener Galerie aus fünf
  Live-Miniaturen und eigener großer Vorschau. Ein einziger Speichern-Knopf ganz unten.
- Das Bedienfeld scrollt von der Vorschau weg; auf dem Handy liegen die Regler komplett über der Vorschau.
- Rund 20 Einstellungen je Format in vier Klappbereichen; Foto-Optionen doppelt (Bedienfeld und schwebende
  Formatleiste); die Formatleiste nutzt Symbole ohne Beschriftung und verdeckt auf dem Handy das Foto;
  ausgeblendete Elemente lassen sich nur über den (zugeklappten) Bereich „Aufbau“ zurückholen.
- Die Regel „Maximale Fotoanzahl“ ist ein Schwellenwertfeld ohne Übersicht, welches Rezept mit welchem
  Format gedruckt wird; der Platzhalter ist abgeschnitten („Unbegren“).
- Der Einleitungstext beschreibt Drag & Drop (freies Layout) und siezt.
- Auf dem Handy ist „Duplizieren“ in der Kopfzeile abgeschnitten.
- Die schwebende Formatleiste legt sich über Nachbarelemente und fängt deren Klicks ab: In der Vorlage „Karte“
  (Foto links neben dem Titel) lässt sich das Foto nicht anklicken, solange die Leiste des Titels offen ist
  (aufgefallen am 25.11.2026 beim Prüfskript zu Stufe 2).

Umfang des Moduls vor dem Umbau: rund 3.100 Zeilen JS ohne Tests, 1.200 Zeilen CSS, 13 Testsuites
(285 Tests, alle grün).

## Entschieden

Alle Entscheidungen vom Eigentümer am 25.11.2026 per Auswahl, soweit nicht anders vermerkt.

| Thema | Entscheidung |
|---|---|
| Layoutsystem | Nur noch Vorlagen (Fließlayout). Das freie Layout samt Drag-&-Drop-Editor entfällt (Tech-Check P5). Gespeicherte freie Formate und das eingebaute Standardformat werden auf eine Vorlage umgestellt und sehen danach anders aus; der alte Stand wird gesichert. |
| Neue Druckfunktionen | Keine: kein Druckdialog, keine zusätzlichen Inhalte auf dem Blatt, kein PDF, kein Sammeldruck. Ausnahme, bewusst gewählt: „Elemente verschieben“ (siehe Word-Gefühl). |
| Word-Gefühl | Gewählt wurden alle vier Bausteine: (1) Menüband oben mit Reitern statt Seitenleiste und schwebender Leiste, (2) Blatt groß in der Mitte auf grauem Grund mit Zoom und Seitenzahl, Anklicken wählt aus, das Menüband formatiert das Angeklickte, (3) Formatvorlagen wie in Word (Titel, Überschrift, Fließtext einmal einstellen, wirkt überall), (4) Elemente verschieben (Blöcke umsortieren, Fotos umsetzen). Baustein 4 ist eine neue Funktion über den reinen Umbau hinaus; beim Fragen so benannt und trotzdem gewählt. |
| Schmerzpunkte | Bestätigt wurden alle vier gemessenen: alles untereinander, Regler fern der Vorschau, zu viele und unklare Regler, unklar, welches Format gilt. |
| Aufbau | Entwurf C: Übersicht der Formate plus Editor im Vollbild („Mache Stufe 3 mit C“). |
| Umfang der Optionen | Noch offen: „Erst an Entwürfen entscheiden“ (gleicher Umfang neu geordnet gegen deutlich weniger Regler). Mit der Wahl von C nicht mitentschieden; wird vor Stufe 4 gebraucht. |
| Formatwahl | Die Automatik nach Fotoanzahl bleibt, aber in Klartext: lesbare Liste („bis 1 Foto“, „2 bis 3 Fotos“, „alle übrigen“) statt Schwellenwertfeld. Gibt es nur ein Format, erscheint die Regel nicht. Am Druck ändert sich dadurch nichts. |
| Geräte | Für Desktop und Laptop optimiert. Auf dem Handy funktioniert alles und nichts läuft über, aber ohne eigene Handy-Bedienführung. |
| Mehrsprachigkeit | Nur vorbereiten: Die festen Drucktexte wandern in ein Wörterbuch (de/en/fr), gedruckt wird weiter deutsch. Der Druck in der Sprache der App bleibt Phase B im Vorhaben Mehrsprachigkeit. |
| Lieferung | Gestufte PRs, die die Session öffnet: je Stufe ein kleiner PR gegen `main` mit Vorher-nachher-Screenshots. Gemergt wird vom Eigentümer oder auf Zuruf; die nächste Stufe beginnt nach dem Merge der vorigen. |
| Priorität | Kein Termin, in Stufen über mehrere Sessions; andere Vorhaben dürfen dazwischenkommen. |
| Erste Session | Tracker, Entwürfe als Entscheidungsseite und parallel Stufe 1. |

## Stufen

| Nr | Inhalt | Stand |
|---|---|---|
| 1 | **Freies Layout entfernen** (Tech-Check P5, Teil Druck). Freie Formate werden beim Lesen auf die Vorlage „Klassisch“ umgestellt (Regel unten), Editor, positionierter Renderer, Geometrie und Element-Registry entfallen. Sichtbar anders: siehe „Bewusste Verhaltensänderungen“. | gemergt 25.11.2026 (PR #3794, Merge c3ee8ae, Deploy-Lauf 2161 erfolgreich); Einzelheiten unter „Stufe 1: Umsetzung und Prüfung“ |
| E | **Entwürfe** der neuen Konfiguration als Entscheidungsseite: drei Varianten, zeigen auch „gleicher Umfang“ gegen „weniger Regler“. | veröffentlicht 25.11.2026 (Link oben); Aufbau C gewählt, Umfang offen |
| 2 | **Struktur**, verhaltensgleich: Druck-Dateien in eigene Ordner (`src/components/print/`, `src/utils/print/`), Persistenz aus `customLists.js` nach `src/utils/printFormatsFirestore.js` (AGENTS.md: Firestore-Zugriffe in `*Firestore.js`), Re-Exporte aus `customLists.js` entfernen, Druck-Abschnitt von `Settings.css` in den Druck-Ordner, `window.confirm` durch `ConfirmDialog` ersetzen, feste Drucktexte ins Wörterbuch (de/en/fr, gedruckt wird deutsch). | gemergt 25.11.2026 (PR #3795, Merge 6c476a9, Deploy-Lauf 2162 erfolgreich); Einzelheiten unter „Stufe 2: Umsetzung und Prüfung“ |
| 3 | **Formatliste** nach Entwurf C: Übersicht mit einer Karte je Format und der Regel in Klartext, ein Format zur Zeit im Editor im Vollfenster, Speichern immer erreichbar, Einleitungstext neu (du). Der Vorlagen-Editor selbst (Galerie, Bedienfeld, schwebende Leiste) bleibt bis Stufe 4, wie er ist. | gemergt 25.11.2026 (PR #3796, Merge e7f1c3c, Deploy-Lauf 2163 erfolgreich); Einzelheiten unter „Stufe 3: Umsetzung und Prüfung“ |
| 4 | **Editor nach Entwurf C**: Menüband oben, Blatt im Mittelpunkt (Zoom, Seitenzahl), Auswahl im Blatt, das Menüband formatiert das Angeklickte. Löst Seitenleiste und schwebende Leiste ab. | offen (wartet auf die Entscheidung zum Umfang) |
| 5 | **Formatvorlagen**: Stile (Titel, Überschrift, Fließtext, Infos) statt Einzelformatierung je Element. Braucht eine Erweiterung des Datenmodells und eine Regel, wie gespeicherte Einzelformatierungen (`overrides`) übergehen. | offen (wartet auf die Entscheidung zum Umfang) |
| 6 | **Elemente verschieben**: Blöcke im Blatt umsortieren, Fotos umsetzen. Neue Funktion; braucht eine Reihenfolge im Datenmodell. | offen |
| 7 | **Abschluss**: `docs/features/druck.md` neu schreiben (Altabschnitte vom 04.10.2026 straffen), Kochschule-Eintrag zum Drucken prüfen, Tech-Check abschließen. | offen |

Reihenfolge 2 vor 3 bis 6, damit die neue Oberfläche in der bereinigten Struktur entsteht. Hat die neue
Konfiguration Vorrang, lässt sich Stufe 2 nach hinten schieben (dann vor 7).

## Stufe 1: Umstellregel für freie Formate

Ein gespeichertes Format ohne `layoutType: 'flow'` (freies Layout, jede `layoutVersion`, auch Altformate
ohne `elements`) wird beim Lesen (`migrateFormat`) so zu einer Vorlage:

- Basis ist die Vorlage „Klassisch“.
- Übernommen werden: `id`, `name`, `maxPhotos`, Seitengröße und Ausrichtung, Schriftart.
- Sichtbarkeit: Titel, Autor & Datum, Infos, Zutaten und Zubereitung folgen dem, was im freien Layout
  sichtbar war. Fotos: Anzahl der sichtbaren Fotokästen (1 bis 4); war keiner sichtbar, „Ohne Foto“.
  Führt ein gespeichertes Format einen Kasten gar nicht auf, gilt, was das freie Layout dafür angenommen
  hat: sichtbar, außer Foto 2 bis 4.
- Nicht übernommen: Positionen, Größen, Drehung, Rahmen und Formatierung einzelner Elemente.
- Die Umstellung ist rein und idempotent und läuft nur beim Lesen. Zurückgeschrieben wird erst mit einem
  Speichern im Reiter (bis Stufe 2 der Knopf „Druckformate speichern“, seit Stufe 3 jedes Speichern dort, auch
  „Jetzt speichern“ am Hinweis); vor dem ersten solchen Speichern wandert der bisherige Stand einmalig nach
  `settings/app.printFormatsBackupFreiesLayout` (Rollback: Inhalt zurück nach `printFormats` kopieren und
  eine App-Version vor Stufe 1 verwenden).
- Bis dahin zeigt der Reiter am umgestellten Format einen Hinweis; er verschwindet mit dem Speichern.

## Stufe 1: Umsetzung und Prüfung (25.11.2026)

**Entfernt:** `PrintFormatEditor.js`, der Ordner `printEditor/`, der positionierte Renderer in `PrintPage.js`
(reicht nur noch an `FlowPage` weiter), die Geometrie in `printLayout.js` (übrig: `getPageSize`,
`elementTextStyle`), die Element-Registry in `printElements.js` (übrig: Seitenmaße und Schriftarten),
in `printFormats.js` die Koordinaten-Migration und `createPrintFormat`, `convertToFlowFormat`, der Knopf „Auf
Vorlage umstellen“ samt `window.confirm`, die CSS-Regeln des freien Layouts, elf verwaiste Klassen im
Druck-Abschnitt von `Settings.css` und drei ungenutzte Tokens (`--color-print-panel-strong`,
`--color-print-active-border`, `--color-print-on-element`).

**Umfang danach:** Druck-JS ohne Tests 1.928 Zeilen (vorher 3.136), die vier Druck-Stylesheets 634 Zeilen
(vorher 1.195), 12 Testsuites mit 249 Tests (vorher 13 mit 285). Diff: 43 Dateien, +790 / −3.230 Zeilen.

**Entscheidungen bei der Umsetzung (Session, nicht einzeln bestätigt):**
- „Druckformate speichern“ ist aktiv, sobald ein umgestelltes Format vorliegt, auch ohne Bearbeitung; sonst
  ließe sich die Umstellung nicht übernehmen. Die Warnung beim Verlassen gilt weiter nur für echte Änderungen.
- Der Seitenrand im Druck (`@page`) kommt immer aus dem Stil des Formats (vorher 0 für freie Formate).
- Der Platzhalter „Kein Foto N“ im Foto-Renderer entfiel als toter Code; die i18n-Baseline des Drucks sank
  von 8 auf 5 Textstellen (im Tracker Mehrsprachigkeit nachgezogen).
- Screenshot-Werkzeug: Bildschirm `einstellungen-druck-vorlage` (klickte „Auf Vorlage umstellen“) ersetzt durch
  `einstellungen-druck-formatleiste` (Element in der Vorschau angeklickt).
- `firestore.rules` und `docs/architecture/security.md` unverändert: Admins schreiben `settings/app` ohnehin
  ganz, die Doku führt keine einzelnen Felder.

**Geprüft:**
- `npm run lint:ci` ohne Fehler, `npm run test:ci` grün (292 Suites, 5.436 Tests). Jest meldet am Ende einmal
  „A worker process has failed to exit gracefully“; ob das auf `main` auch so ist, wurde nicht gegengeprüft.
- Im Browser gegen die lokalen Emulatoren (Chromium, Desktop hell und dunkel, Handy hell): Reiter mit dem
  eingebauten Standardformat (jetzt Vorlage) sieht aus wie vorher der Vorlagen-Editor, kein seitliches Scrollen.
- Umstellung Ende zu Ende: zwei freie Formate in `settings/app` geschrieben (eines mit ausgeblendetem Autor und
  Arial, eines quer mit zwei sichtbaren Fotokästen), Reiter geöffnet (beide mit Hinweis, Speichern aktiv),
  gespeichert, Firestore gelesen: beide sind Vorlagen mit übernommener Schrift, Sichtbarkeit, Fotoanzahl und
  Seitengröße, ohne `elements` und ohne `migrationNotes`; `printFormatsBackupFreiesLayout` enthält den alten Stand.
- Druck Ende zu Ende: Rezept gedruckt, `@page { size: 21cm 29.7cm; margin: 1.5cm }`, `#print-root` ohne Knöpfe
  und Eingabefelder, als PDF angesehen (eine Seite, Schrift und ausgeblendeter Autor wie im umgestellten Format).
- `scripts/screenshots/run.sh` mit den beiden Druck-Bildschirmen (Desktop hell, Handy dunkel): 4 von 4 Bildern.

**Nicht geprüft:** Druck auf iPhone und iPad, Safari und Firefox, die Formate des Live-Projekts.

**Bleibt für Stufe 2:** `PrintFormatEditor.css` (nur noch vier gemeinsame Regeln, Name passt nicht mehr),
die kleinen Dateien `printElements.js` und `printLayout.js`, die Re-Exporte in `customLists.js`.

## Stufe 2: Umsetzung und Prüfung (25.11.2026)

**Struktur danach** (Einzelheiten je Datei: `docs/features/druck.md`, „Bausteine“):
- `src/components/print/`: `PrintPage`, `FlowPage`, `printRunner`, `printElementRenderers`, `usePreviewScale`,
  `PrintFormatsSettings` (jetzt mit eigener `PrintFormatsSettings.css`, vorher letzter Abschnitt von
  `Settings.css`), `TemplateFormatEditor` und `templateEditor/`.
- `src/utils/print/`: `printFormats`, `printTemplates`, `printRecipe`, `printSampleRecipe`, `printLayout`
  (`printElements.js` ist darin aufgegangen).
- `src/utils/printFormatsFirestore.js`: `getPrintFormats`, `loadPrintFormatsForEditing`, `savePrintFormats`, vorher
  in `customLists.js`. Der Settings-Cache bleibt dort; neu ist der Export `updateSettingsCache(fields)`.
- `customLists.js` re-exportiert nichts mehr aus dem Druckmodul (2.638 auf 2.549 Zeilen, 124 auf 119 Exporte) und
  nimmt nur noch `DEFAULT_PRINT_FORMATS` als Standardwert der Settings.
- `PrintFormatEditor.css` ist aufgelöst: Die vier gemeinsamen Regeln stehen am Ende von
  `TemplateFormatEditor.css` (gleiche Reihenfolge in der Kaskade wie vorher). Die Klassen heißen weiter `pfe-*`;
  umbenannt wird mit dem neuen Editor (Stufe 4).
- Von außen greifen nur `Settings.js`, `RecipeDetail.js` und `customLists.js` auf das Modul zu.

**Rückfrage:** Beim Anwenden einer Vorlage über eigene Anpassungen fragt jetzt `ConfirmDialog` („Vorlage
„…“ anwenden?“, Knöpfe „Abbrechen“ und „Vorlage anwenden“ als Haupt-Knopf). Im Druckmodul gibt es kein
`window.confirm` mehr.

**Drucktexte:** Wörterbuch `src/i18n/texte/druck.js` (de/en/fr, Wortlaut wie in der Rezeptansicht). Das Blatt
holt die Texte über `druckTexte(sprache)`, weil es außerhalb des React-Baums der App entsteht; `printRecipe`,
`PrintPage` und `FlowPage` nehmen `sprache` entgegen, kein Aufrufer gibt sie mit, gedruckt wird also deutsch.
Die i18n-Baseline des Drucks ist damit 0 (insgesamt 82 auf 77, nur noch Wichteln). Was Phase B noch tun muss,
steht im Tracker Mehrsprachigkeit.

**Geprüft:**
- Verhaltensgleichheit per Vorher-nachher-Aufnahme gegen die Emulatoren (Chromium), vorher auf `main` c3ee8ae,
  nachher auf dem Branch, mit drei gespeicherten Vorlagen-Formaten unterschiedlicher Optionen (Karte A5 mit
  Einzelformatierungen, Klassisch quer mit zwei Fotos, Schlicht ohne Foto). Bytegleich sind: der Reiter als HTML
  (leer, mit Vorschau-Rezept, mit Formatleiste), neun Bilder (Reiter Desktop hell und dunkel und Handy, mit
  Vorschau-Rezept, Formatleiste an Titel und Foto, Bedienfeld mit allen Klappbereichen) und je Format der Druck:
  HTML von `#print-root`, `@page`-Regel, Bild im Druckmodus. Die PDFs sind gleich groß und unterscheiden sich nur
  in ihren Metadaten.
- Neue Tests: Sprache der festen Texte (Hilfsfunktionen, Blatt, Druckablauf; Deutsch ohne Angabe, Englisch und
  Französisch mit `sprache`), Rückfrage im Dialog, Settings-Cache nach dem Speichern. Gegenprobe: Ohne das
  Schreiben in den localStorage werden zwei der Cache-Tests rot.

- Der neue Dialog im Browser (Desktop hell und dunkel, Handy): keine Meldung des Browsers mehr, Dialog im
  sichtbaren Bereich, Fokus auf „Vorlage anwenden“, „Abbrechen“ lässt die Vorlage, Bestätigen wendet sie an.
- `npm run lint:ci` ohne Fehler, `npm run test:ci` grün (291 Suites, 5.454 Tests; eine Suite weniger, weil
  `printElements.test.js` in `printLayout.test.js` aufgegangen ist).

**Nicht geprüft:** iOS, Safari, Firefox.

**Aufgefallen und in Stufe 2 behoben** (Tech-Check: eigener Befund): `savePrintFormats` führte nur den Cache
im Speicher nach, nicht den im localStorage (eine Stunde gültig). Nach einem Neuladen druckte die App deshalb bis
zu einer Stunde mit dem alten Stand, und die Sicherung `printFormatsBackupFreiesLayout` galt dann als nicht
vorhanden. Dasselbe Muster haben neun weitere Schreibwege in `customLists.js` (Slogan, Favicon-Text,
Umrechnungstabelle, KI-Prompt, Texte der Startseite, Einstellungen der Inspirationsliste); die sind **nicht**
Teil dieses Vorhabens und stehen im Tech-Check als offen (Befund A15, „teilweise“).

## Stufe 3: Umsetzung und Prüfung (25.11.2026)

**Aufbau** (Einzelheiten: `docs/features/druck.md`, „Einstellungen: Übersicht und Editor im Vollfenster“):
- **Übersicht** (`PrintFormatsOverview`, `PrintFormatCard`): je Format eine Karte mit Miniatur (Beispielrezept),
  Name, Regel als Satz, Vorlage und Papier; „Bearbeiten“, Duplizieren (Symbol), Entfernen (`DeleteRowButton`, am
  Handy Linksswipe auf der Karte); Kachel „Neues Format“. Darunter „So wählt die App beim Drucken“ (ein Feld je
  Bereich) und „Prüfen mit Rezept“ (nennt das Format und hebt dessen Karte hervor). Bei nur einem Format
  entfallen Regel und Leiste.
- **Editor im Vollfenster** (`PrintFormatScreen`): Leiste mit „Zurück“, Name, Regel und „Speichern“, darunter der
  unveränderte `TemplateFormatEditor`, unten „Vorschau mit“ samt Hinweis, mit welchem Format das Rezept druckt.
- **Regel in Klartext** (`src/utils/print/printFormatRules.js`): aus den Fotolimits werden Bereiche („höchstens
  1 Foto“, „2 bis 3 Fotos“, „alle übrigen“). Am Datenmodell und an `selectPrintFormat` ändert sich nichts; ein
  Test hält beides gleich. Im Editor: „Rezepte mit höchstens N Fotos“ oder „alle übrigen Rezepte“, darunter der
  Bereich, der sich ergibt.

**Entscheidungen bei der Umsetzung (Session, nicht einzeln bestätigt; siehe auch „Offen“):**
- **Gespeichert wird je Handlung**, nicht mehr gesammelt: „Speichern“ im Editor schreibt das eine Format,
  Entfernen schreibt sofort, „Rückgängig“ schreibt erneut. Technisch ist es weiter die ganze Liste (ein Feld in
  `settings/app`), der Reihe nach; scheitert ein Speichern, gilt wieder der letzte gespeicherte Stand.
- **„Neues Format“ und „Duplizieren“ öffnen einen Entwurf**, der erst mit „Speichern“ angelegt wird, mit der
  kleinsten freien Fotoanzahl als Regel. Vorher entstand sofort ein Format ohne Fotolimit, das nie gewählt wurde.
- **Zurück mit ungespeicherten Änderungen fragt nach** („Änderungen verwerfen?“); ein eigener „Abbrechen“-Knopf
  wie im Entwurf entfällt dadurch.
- **Das einzige Format für alle übrigen Rezepte** kann weder entfernt noch auf eine Fotoanzahl umgestellt werden;
  der Editor sagt, warum. Wer die Rollen tauschen will, stellt erst ein anderes Format auf „alle übrigen“.
- **Listen, die sich nicht speichern lassen** (leerer Name, ungültige oder doppelte Fotoanzahl, kein Format für
  den Rest), werden beim Laden korrigiert und mit Hinweis angezeigt (`repairPrintFormats`); geschrieben wird erst
  mit „Jetzt speichern“ oder dem nächsten Speichern. Ohne das ließe sich eine solche Liste nicht mehr speichern,
  weil nur noch ein Format zur Zeit bearbeitet wird.
- **Hinter dem Editor ist die App abgeschaltet** (`inert` auf `#root`), der Fokus kehrt beim Schließen zum
  auslösenden Knopf zurück.
- **Handy:** Die Karten stehen untereinander; im Editor bleiben nur „Zurück“ und „Speichern“ oben stehen, Name
  und Regel scrollen mit dem Inhalt (eine feste Leiste nahm 207 von 664 px).
- Screenshot-Werkzeug: `einstellungen-druck` (ohne gespeicherte Formate), neu `einstellungen-druck-formate`
  (drei Formate) und `einstellungen-druck-editor` (Editor mit Formatleiste, ersetzt
  `einstellungen-druck-formatleiste`); ein voller Lauf macht 286 statt 282 Bilder.

**Abweichungen vom gezeichneten Entwurf C** (zur Bestätigung oder Korrektur):
- Die Regel steht als Auswahlfeld mit Zahlenfeld in der Leiste statt hinter einem Knopf „Gilt für …“, der ein
  Feld aufklappt (ein Klick weniger, kein schwebendes Feld).
- „So wählt die App beim Drucken“ zeigt ein Feld je Bereich („Bis 1 Foto“, „2 bis 3 Fotos“, „Ab 4 Fotos“), nicht
  eines je Fotoanzahl; bei hohen Limits würde die Leiste sonst lang.
- Kein „Abbrechen“ in der Leiste (siehe oben). Am Format für alle übrigen Rezepte ist Entfernen gesperrt und
  erklärt sich per Tooltip, statt zu fehlen.
- Menüband, Zoom, Seitenzahl und Formatvorlagen aus dem Entwurf des Editors sind Stufen 4 und 5.

**Gemessen** (wie im Ist-Zustand: Chromium gegen die Emulatoren, Desktop 1280 × 860, Handy iPhone 13; Höhe der
Seite und Zahl der Bedienelemente im Reiter):

| Zustand | Desktop | Handy | Bedienelemente |
|---|---|---|---|
| Übersicht, ein Format | 860 px (passt auf den Bildschirm) | 1.397 px (2,1 Bildschirme) | 4 |
| Übersicht, drei Formate | 1.132 px (1,3) | 2.386 px (3,6) | 11 |
| Editor, ein Format zur Zeit | 1.504 px Inhalt bei 735 px sichtbarer Höhe (2,0) | 1.671 px bei 619 px (2,7) | 52 |

Zum Vergleich vorher mit drei Formaten: 4.855 px (5,6) am Desktop, 6.418 px (9,7) am Handy, 153 Bedienelemente
auf einer Seite. Unverändert, weil der Vorlagen-Editor erst mit Stufe 4 umgebaut wird: rund 50 Bedienelemente je
Format, und am Handy beginnt die Vorschau erst 1.105 px unter dem oberen Rand, unter allen Reglern.

**Geprüft:**
- Im Browser gegen die Emulatoren (Chromium; Desktop hell und dunkel, Handy hell und dunkel, alle Bilder
  angesehen): Übersicht mit drei Formaten und mit einem, Editor, Rückfrage, kein seitliches Scrollen.
- Abläufe Ende zu Ende mit Blick in Firestore: Name ändern und speichern; doppelte, leere und gültige
  Fotoanzahl; Zurück mit Rückfrage („Abbrechen“ bleibt, „Verwerfen“ schließt, nichts gespeichert); neues Format
  unverändert zurück legt nichts an; neues Format mit Vorlage „Schlicht“ anlegen; duplizieren; entfernen,
  „Rückgängig“, erneut entfernen und sechs Sekunden warten; neu laden. Keine Meldung des Browsers.
- Druck danach: Rezept mit einem Foto druckt mit dem Format „höchstens 1 Foto“ (`@page { size: 14.8cm 21cm }`).
- Handy: Linksswipe auf der Karte zeigt Entfernen, der Hinweis mit „Rückgängig“ liegt über der Navigation und
  stellt das Format am alten Platz wieder her.
- Tests: Regeln (21), Übersicht und Speichern (39), Editor-Fenster (39), Papierformate (2), Lage des
  Rückgängig-Hinweises (2). `npm run lint:ci` ohne Fehler, `npm run test:ci` grün (294 Suites, 5.526 Tests),
  `npx vite build` läuft durch. Gegenprobe: Ohne Warteschlange beim Speichern, ohne Zurücknehmen nach einem
  gescheiterten Speichern, ohne die Prüfung auf doppelte Fotoanzahl, ohne das Ausweichen beim „Rückgängig“ und
  mit vertauschter Reihenfolge der Regel werden jeweils die passenden Tests rot.

**Nicht geprüft:** iOS, Safari, Firefox; Bedienung nur mit Tastatur über den Fokus beim Öffnen und Schließen
hinaus; zwei Admins gleichzeitig (wie bisher gewinnt das letzte Speichern).

**Bekannte Grenzen:** Escape schließt den Editor nicht (die schwebende Formatleiste hört auf dieselbe Taste;
mit Stufe 4 lösbar). Die Zurück-Taste des Browsers ist nicht eingebunden (die App hat dafür keinen gemeinsamen
Baustein); vor dem Schließen des Fensters warnt der Browser. Die Miniaturen zeigen immer das Beispielrezept.

**Aufgefallen und in Stufe 3 behoben** (Tech-Check D12): Der Hinweis „… entfernt · Rückgängig“
(`UndoSnackbar`) lag am Handy hinter der unteren Navigation (beide `z-index` 1200, der Hinweis 24 px über dem
unteren Rand, die Navigation 85 px hoch) und war dort weder zu lesen noch anzutippen. Das betraf alle Bereiche
mit unterer Navigation, nicht nur das Drucklayout (gemessen im Reiter Drucklayout, für die übrigen Stellen aus
dem gemeinsamen Stylesheet abgeleitet). Jetzt steht er um `--bottom-nav-offset` höher.

**Aufgefallen, nicht behoben** (Tech-Check M20, offen): `useSwipeToDelete` ruft `preventDefault` in einem
passiven Touch-Listener auf (Meldung in der Konsole, betrifft alle Listen mit Linksswipe); die Geste
funktioniert trotzdem.

## Machbarkeitstest Word-Vorlage (25.11.2026, erster Teil)

**Frage:** Kann eine Word-Datei die Druckvorlage sein: herunterladen, in Word frei umbauen, hochladen, und die
App druckt Rezepte damit? Wegwerf-Code des Tests: `scripts/machbarkeit-word-vorlage/` (kein Teil der App).

**Aufbau des Tests:**
- Startvorlage „Klassisch“ als .docx (per Skript mit python-docx): Formatvorlagen für Titel, Überschrift und
  Text, Platzhalter in geschweiften Klammern, ein Platzhalterbild mit dem Alternativtext „Foto 1“.
- Eine frei angeordnete Variante als Stellvertreter für das, was in Word entsteht: Zutaten in einem Textfeld am
  Rand, Foto frei platziert mit umfließendem Text, Kopfzeile, Fußzeile mit Seitenzahl. **Per Skript gebaut,
  nicht in Word bearbeitet.**
- Füllen mit eigenem Code (JSZip und ein XML-Parser, rund 230 Zeilen): Felder wie `{titel}`; die Blöcke
  `{zutaten}` und `{zubereitung}` wiederholen ihren Absatz je Zeile samt Formatierung, Zwischenüberschriften
  fett und ohne Aufzählung; Fotos werden über den Alternativtext getauscht, behalten Platz, Größe und
  Textumbruch und werden auf den Rahmen zugeschnitten; ohne Foto entfällt der Platz.
- Zwei Wege zum Druckbild: A Umwandler (LibreOffice 24.2 macht aus der gefüllten Datei ein PDF, so liefe es auf
  einem Server), B Darstellung im Browser ohne Server (`docx-preview` 0.4.1), je mit kurzem Rezept, langem
  Rezept (32 Zutaten, 24 Schritte) und Rezept ohne Foto.

**Ergebnis:**

| Prüfpunkt | A Umwandler auf dem Server | B Darstellung im Browser |
|---|---|---|
| Textfeld | da, an seinem Platz | fehlt ganz (die Zutaten erscheinen nicht) |
| Frei platziertes Foto | an seinem Platz, Text fließt herum | an falscher Stelle, verdeckt Text |
| Nummerierung, Aufzählung | richtig, läuft über Zwischenüberschriften weiter | Nummern und Aufzählungszeichen fehlen teils |
| Kopf- und Fußzeile, Seitenzahl | richtig, auf jeder Seite | Seitenzahlen leer |
| Langes Rezept | drei Seiten, sauber umbrochen | eine einzige überlange Seite, kein Umbruch |
| Dauer in der Session | Füllen 0,03 bis 0,1 s, Umwandeln 0,5 s | 0,1 bis 0,2 s |

- **Weg B scheidet aus.** Ohne Server lässt sich eine frei angeordnete Word-Datei nicht verlässlich zeichnen;
  der Druck liefe an Word vorbei. Das gilt auch für eine Vorschau in den Einstellungen.
- **Das Füllen ist robust:** Platzhalter werden auch gefunden, wenn Word sie über mehrere Textläufe verteilt
  (nachgestellt: vier zerteilte Platzhalter, alle ersetzt), im Textfeld, in Kopf- und Fußzeile und in einer
  Datei, die ein anderes Office-Programm neu gespeichert hat.

**Grenzen, die der Test gezeigt hat:**
- **Textfelder laufen nicht auf die nächste Seite.** Von 32 Zutaten im Textfeld erschienen 13, mit einem
  Textfeld, das mit dem Inhalt wächst, 23; der Rest fehlt ohne Hinweis. Das liegt an Word-Textfeldern, nicht am
  Umwandler, und ist dieselbe Schwäche wie beim entfernten freien Layout. Frei platzieren lässt sich, was eine
  feste Größe hat (Titel, Infos, Foto, Logo); Listen gehören in den Fließtext oder eine Tabelle. Die App kann
  beim Hochladen davor warnen.
- **Umbruch weicht ab:** Mit der Absatzoption „nicht vom nächsten Absatz trennen“ in einer Tabellenzelle schob
  LibreOffice die ganze Tabelle auf Seite 2 (halbleere erste Seite); ohne die Option beginnt sie auf Seite 1.
  Wie Word dieselbe Datei umbricht, ist nicht geprüft.
- **Schriften:** Der Umwandler kennt nur Schriften, die auf dem Server liegen. In der Session waren Ersatz für
  Calibri, Cambria, Arial und Times New Roman vorhanden (Carlito, Caladea, Liberation), nicht aber Aptos
  (Standardschrift neuerer Word-Versionen) und Georgia. Fehlt eine Schrift, wird sie ersetzt, und Zeilen- und
  Seitenumbruch können sich verschieben.

**Nicht geprüft:** eine in Word bearbeitete Datei und der Vergleich mit dem PDF aus Word (der eigentliche
Test, wartet auf den Eigentümer); der Betrieb des Umwandlers in Google Cloud (Kaltstart, Kosten, Einrichtung);
der Weg vom PDF zum Drucker am iPhone; Hochladen und Speichern der Vorlage.

**Was der Ausbau bedeuten würde** (Vorschlag der Session, nichts davon entschieden):
- Ein Druckformat ist entweder eine Vorlage der App (wie heute, Druck im Browser) oder eine Word-Vorlage
  (Datei in Firebase Storage). Die Übersicht mit der Regel in Klartext bleibt für beide.
- Word-Vorlagen drucken als PDF über einen Dienst: Eine Cloud Function prüft den Zugriff auf das Rezept, füllt
  die gespeicherte Vorlage (der Code des Tests, die Functions haben `sharp` schon) und gibt sie an einen
  Umwandler in Cloud Run ohne Zugriff von außen und ohne Netz nach außen. Gefüllt wird auf dem Server, damit
  nur Vorlagen eines Admins den Umwandler erreichen, nicht beliebige Dateien. Drucken braucht dann Internet.
- Beim Hochladen prüft die App die Vorlage: unbekannte Platzhalter, Listen in Textfeldern, Schriften, die der
  Server nicht hat.
- Der Editor der App bleibt, wie er ist; die Stufen 4 bis 6 (Menüband, Formatvorlagen, Elemente verschieben)
  entfielen. Umfang grob fünf bis sechs Stufen in der Größe der bisherigen, dazu die einmalige Einrichtung des
  Dienstes im Google-Cloud-Projekt, die der Eigentümer freigeben muss. Laufende Kosten und Wartezeit beim
  ersten Druck sind geschätzt, nicht gemessen: voraussichtlich im kostenlosen Kontingent bzw. einige Sekunden.

## Entwurf „Baukasten“: freie Anordnung in der App, ohne Word (25.11.2026)

Auf die Frage des Eigentümers „Und die Flexibilität in der App zu bauen ohne WORD?“ entstand ein Klick-Entwurf
zum Ausprobieren: https://claude.ai/artifact/3GuwzhaHfuHeWac4oU7uLr (eigene Seite, kein Code der App; in der
Session im Browser geprüft: Ziehen, Spalten bilden, Breite, Pfeile, langes Rezept, Handy, hell und dunkel).

**Idee:** Das Blatt besteht aus Zeilen; jede Zeile hat eine bis drei Spalten, jede Spalte einen Stapel
Bausteine (Titel, Foto, Autor & Datum, Infos, Zutaten, Zubereitung, dazu eigener Text und Trennlinie).
- Ziehen im Blatt: Eine waagerechte blaue Linie heißt „darüber oder darunter“, eine senkrechte „daneben als
  neue Spalte“. Spaltenbreiten ändert man am Zwischenraum.
- Ohne Ziehen: Baustein anklicken, Pfeile in der Leiste (auch am Handy und per Tastatur); „nach links“ und „nach
  rechts“ tauscht bei zwei Spalten die Seiten.
- Alles fließt: Ein langes Rezept läuft auf die nächste Seite, nichts wird abgeschnitten. Die fünf Vorlagen
  sind nur noch Startanordnungen.
- Frei schwebend ablegen lassen sich Teile mit fester Größe (im Entwurf Logo und Stempel). Listen schweben
  nicht: Sie würden abgeschnitten wie im Word-Textfeld und im entfernten freien Layout.

**Was dieser Weg nicht kann:** Tabellen, Kopf- und Fußzeilen mit Seitenzahl, beliebig überlappende Teile,
Listen in einem Kasten fester Größe. Das ginge nur mit der Word-Datei als Vorlage.

**Was er für den Plan bedeutet** (Vorschlag, nicht entschieden): Er ist die bisherige Stufe 6 („Elemente
verschieben“), vorgezogen und um Spalten erweitert. Geschätzt drei bis vier Stufen: (1) Datenmodell (Zeilen,
Spalten, Bausteine je Format, zusätzlich zu den heutigen Einstellungen) und der Renderer dafür, ohne sichtbare
Änderung an bestehenden Formaten; (2) Ziehen, Breiten und Pfeile im Editor; (3) eigene Bausteine (Text,
Trennlinie, Logo) und frei schwebende Teile; (4) nach Bedarf Menüband und Formatvorlagen (bisher Stufen 4 und 5).
Gedruckt wird weiter im Browser, ohne Server.

## Bewusste Verhaltensänderungen

| # | Vorher | Nachher | Stufe |
|---|---|---|---|
| V-1 | Freie Formate drucken mit von Hand platzierten Kästen; zu langer Text wird abgeschnitten | Sie drucken als Vorlage „Klassisch“ (Fließlayout, mehrseitig) mit übernommener Schrift, Sichtbarkeit und Fotoanzahl | 1 |
| V-2 | Ohne gespeicherte Formate gilt ein eingebautes freies Standardformat | Ohne gespeicherte Formate gilt die Vorlage „Klassisch“ | 1 |
| V-3 | Einstellungen › Drucklayout bietet den Drag-&-Drop-Editor und „Auf Vorlage umstellen“ | Beides entfällt; jedes Format ist eine Vorlage | 1 |
| V-4 | Freie Formate drucken randlos (`@page margin: 0`), der Abstand steckt in den Kästen | Sie drucken mit dem Seitenrand der Vorlage (1,5 cm) | 1 |
| V-5 | Einleitungstext des Reiters siezt und beschreibt Drag & Drop | Neuer Text in Du-Form ohne Drag & Drop | 1 |
| V-6 | Rückfrage beim Anwenden einer Vorlage als Meldung des Browsers (`window.confirm`) | Dialog der App (`ConfirmDialog`) | 2 |
| V-7 | Nach dem Speichern und einem Neuladen druckt die App bis zu einer Stunde mit den alten Formaten | Gespeicherte Formate gelten sofort | 2 |
| V-8 | Alle Formate stehen aufgeklappt untereinander, jedes mit Galerie, Bedienfeld und Vorschau | Übersicht mit einer Karte je Format; ein Format zur Zeit im Editor im Vollfenster | 3 |
| V-9 | Ein Knopf „Druckformate speichern“ ganz unten speichert alles; bis dahin ist nichts gespeichert, auch kein Entfernen | Gespeichert wird je Handlung: „Speichern“ im Editor, Entfernen sofort (sechs Sekunden „Rückgängig“) | 3 |
| V-10 | Zahlenfeld „Maximale Fotoanzahl“ je Format mit Erklärtext | Regel in Klartext auf der Karte und in der Leiste „So wählt die App beim Drucken“; im Editor „höchstens N Fotos“ oder „alle übrigen Rezepte“ mit dem Bereich, der sich ergibt | 3 |
| V-11 | „Neues Format“ und „Duplizieren“ legen sofort ein Format ohne Fotolimit an (wird nie gewählt, solange ein anderes ohne Limit davor steht) | Beide öffnen einen Entwurf mit der kleinsten freien Fotoanzahl; angelegt wird erst mit „Speichern“ | 3 |
| V-12 | Fehler in der Liste (doppelte Fotoanzahl, kein Format ohne Limit, leerer Name) werden angezeigt und sperren das Speichern, bis sie von Hand behoben sind | Eine solche gespeicherte Liste wird beim Laden korrigiert und mit Hinweis angezeigt; im Editor verhindern die Prüfungen, dass sie neu entsteht | 3 |
| V-13 | Vorschau-Rezept oben im Reiter, je Format „Aktives Format für dieses Rezept“ oder „Nicht aktiv“ | „Prüfen mit Rezept“ in der Übersicht (nennt das Format, hebt die Karte hervor), „Vorschau mit“ im Editor | 3 |
| V-14 | Hinweis „… entfernt · Rückgängig“ liegt am Handy hinter der unteren Navigation (app-weit) | Er steht darüber und lässt sich antippen | 3 |

Alles Übrige bleibt gleich: Vorlagen-Formate sehen in Vorschau und Druck aus wie vorher, und die App wählt das
Format wie vorher.

## Offen

- **Richtung wählen** (Eigentümer): freie Anordnung **in der App** (Abschnitt „Entwurf Baukasten“,
  Klick-Entwurf https://claude.ai/artifact/3GuwzhaHfuHeWac4oU7uLr) oder **Word-Datei als Vorlage** (Abschnitt
  „Machbarkeitstest Word-Vorlage“). Empfehlung der Session: in der App. Gründe: kein Server, Druck wie heute
  (auch ohne Netz und am iPhone), ein einziges Layoutsystem, das Blatt im Editor ist das gedruckte Blatt,
  und der Aufwand ist kleiner (geschätzt drei bis vier Stufen gegen fünf bis sechs plus Cloud-Dienst). Für Word
  spräche nur, wenn Tabellen, Kopf- und Fußzeilen mit Seitenzahl oder beliebig überlappende Teile gebraucht
  werden. Beides zu bauen empfiehlt die Session nicht.
- **Anordnung ändern** (Eigentümer am 25.11.2026, nach dem Deploy von Stufe 3): „Mir ist es im Moment noch zu
  unflexibel. Die Anordnung lässt sich noch nicht ändern.“ Heute einstellbar: Foto oben, links, rechts oder
  ohne; Zutaten und Zubereitung neben- oder untereinander; Teile ausblenden (Bereiche „Fotos“ und „Aufbau“ im
  Bedienfeld, beide zugeklappt). Nicht einstellbar: die Reihenfolge der Teile und welche Seite Zutaten und
  Zubereitung haben. Vorschlag der Session: „Elemente verschieben“ (bisher Stufe 6) vorziehen und als nächste
  Stufe bauen, wie im Detailblatt gezeichnet (Reihenfolge je Format, Zutaten und Zubereitung tauschen die
  Seiten, Foto an jeder Stelle oder neben dem Titel, auch per „Nach oben“ und „Nach unten“). Auf die Rückfrage,
  ob Umsortieren reicht oder freies Platzieren gemeint ist, antwortete der Eigentümer am 25.11.2026: **„Frei wie
  in Word“**. Der Vorschlag, „Elemente verschieben“ vorzuziehen, ist damit nicht gewählt; es folgt der
  Machbarkeitstest (eigener Abschnitt unten).
- **Word-Weg** (Wunsch des Eigentümers vom 25.11.2026: „Layoutvorlage als docx herunterladen, dort bearbeiten
  und bearbeitet wieder hochladen“), nicht entschieden. Zwei Lesarten mit sehr unterschiedlichem Aufwand:
  (1) Die Word-Datei ist die Vorlage: Platzhalter für die Rezeptdaten, daraus ein PDF über einen Umwandler auf
  dem Server. Alles aus Word bleibt (Tabellen, Logo, Kopfzeile, freie Positionen), dafür ein zweites
  Layoutsystem neben den Vorlagen (das freie Layout wurde in Stufe 1 gerade entfernt), Drucken braucht Internet,
  und wie genau das PDF dem Bild in Word entspricht, ist ungeprüft. (2) Word als Stil-Editor: Die App liest aus
  der hochgeladenen Datei nur Papier, Ränder, Schrift, Größen und Farben und druckt weiter wie heute; alles
  andere ginge beim Hochladen verloren. Stand der Technik im Projekt: keine Word-Bibliothek, kein Umwandler
  (die Functions haben nur Chromium); freie Bibliotheken zum Erzeugen und Füllen von docx gibt es (`docx`,
  `docx-templates`, `docxtemplater`, je MIT, npm-Stand 25.11.2026). Empfehlung der Session: zuerst die
  Anordnung in der App lösen; den Word-Weg nur verfolgen, wenn freies Platzieren, eigene Inhalte oder Tabellen
  gebraucht werden, und dann mit einem Machbarkeitstest an einer Vorlage beginnen. Er widerspräche den
  Entscheidungen „keine neuen Druckfunktionen“ und „nur noch ein Layoutsystem“; die Stufen 4 und 5 sollten
  dann nicht zusätzlich gebaut werden. Stand 25.11.2026: Lesart (1) ist gewünscht („Frei wie in Word“), der
  erste Teil des Machbarkeitstests ist gelaufen (Abschnitt „Machbarkeitstest Word-Vorlage“).
- **Word-Vorlage, nächster Schritt** (Eigentümer): die Startvorlage `broubook-druckvorlage-klassisch.docx` (in
  der Session übergeben; neu erzeugbar mit `scripts/machbarkeit-word-vorlage/vorlage_erzeugen.py`) im eigenen
  Word so umbauen, wie eine Vorlage wirklich aussehen soll, und zurückgeben: die .docx und ein PDF, das Word
  daraus speichert (als Maßstab). Erst der Vergleich damit sagt, ob der Umwandler nah genug an Word ist.
- **Word-Vorlage, vor dem Ausbau zu entscheiden** (Eigentümer): ob ein eigener Dienst in Google Cloud dafür in
  Ordnung ist (Einrichtung im Projekt, Drucken braucht Internet), ob die Vorlagen der App daneben bleiben
  (Empfehlung: ja, ohne weiteren Ausbau) und ob die Stufen 4 bis 6 entfallen (Empfehlung: ja).
- **Umfang wählen** (Eigentümer), vor Stufe 4: voll (alle heutigen Optionen, in Reitern neu geordnet) oder
  schlank (deutlich weniger Regler). Der Aufbau ist entschieden (C). Empfehlung der Session: voller Umfang,
  weil in Reitern nie mehr als etwa acht Regler zugleich zu sehen sind und der schlanke Umfang gespeicherte
  Einstellungen verwirft. Einzige Kürzung, die die Session empfiehlt: formatiert wird nur über Formatvorlagen,
  die Wahl „nur dieses Element“ entfällt (ein Konzept weniger; verloren geht nur, wenn zwei Elemente derselben
  Vorlage unterschiedlich formatiert waren).
- **Stufe 3 bestätigen** (Eigentümer): das Speichern je Handlung und die Abweichungen vom gezeichneten Entwurf
  (beides unter „Stufe 3: Umsetzung und Prüfung“). Stufe 3 ist gemergt und ausgeliefert; was im Gebrauch nicht
  passt, wird in Stufe 4 mit umgebaut.
- **Nach dem Deploy von Stufe 3 am Gerät ansehen:** Übersicht und Editor am iPhone (in der Session nur in
  Chromium geprüft), dort auch einmal ein Format per Linksswipe entfernen und „Rückgängig“ antippen (D12).
- **Formatvorlagen und gespeicherte Einzelformatierungen:** Wie gehen `overrides` je Element in Stile über?
  Entscheidung mit dem Entwurf.
- **Elemente verschieben:** Welche Blöcke sind verschiebbar, und was bedeutet das für die fünf Vorlagen
  (heute feste Reihenfolge je Vorlage)? Entscheidung mit dem Entwurf.
- **Produktivdaten:** Welche Formate im Live-Projekt gespeichert sind, ist von der Session aus nicht zu sehen.
  Nach dem Deploy von Stufe 1 einmal Einstellungen › Drucklayout öffnen, die umgestellten Formate prüfen und
  speichern.
- **Abnahme am Gerät:** Der Druck auf iPhone und iPad lässt sich in der Session nicht prüfen. Der iOS-Weg in
  `printRunner` wird in keiner Stufe logisch geändert; nach Stufe 1 trotzdem einmal am Gerät drucken.
- **Tech-Check:** P5 betrifft auch den Icon-Admin; mit Stufe 1 ist nur der Druck-Teil erledigt (P5 seit
  25.11.2026 „teilweise“). Die Bedienbarkeit der Vorlagen-Konfiguration ist dort Befund P27 (seit Stufe 3
  „teilweise“: „alles untereinander“ und „unklar, welches Format gilt“ sind erledigt, „Regler fern der
  Vorschau“ und „zu viele, unklare Regler“ bleiben für die Stufen 4 und 5). Aus Stufe 3 stammen außerdem D12
  (Rückgängig-Hinweis am Handy, behoben) und M20 (Linksswipe und passiver Touch-Listener, offen).

## Annahmen der Session (nicht ausdrücklich bestätigt)

- Datenmodell und Speicherort bleiben: Formate als Feld `printFormats` in `settings/app`, `layoutVersion` 3.
  Neue Felder kommen nur additiv dazu (Stufen 5 und 6).
- Dateien werden in Stufe 2 verschoben, nicht in Stufe 1, damit Stufe 1 als reine Entfernung lesbar bleibt.
- Der erste Commit von Stufe 1 trägt `refactor:` (Patch), obwohl der Editor für Admins sichtbar entfällt.
- Der erste Commit von Stufe 3 trägt `feat:` (Minor): Die Übersicht und der Editor im Vollfenster sind für
  Admins eine neue Oberfläche.
- Die Korrektur des Rückgängig-Hinweises (`UndoSnackbar.css`, eine Zeile, app-weit) läuft in Stufe 3 mit, weil
  das Entfernen eines Formats am Handy sonst nicht rückgängig zu machen wäre.
