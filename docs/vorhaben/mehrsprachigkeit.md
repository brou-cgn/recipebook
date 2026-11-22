# Vorhaben: Mehrsprachigkeit (Deutsch, Englisch, Französisch)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 22.11.2026 (PR 1 bis 3
und die Entscheidungen (E) gemergt, PR 4 als PR #3724 offen).

**Ziel:** Die App gibt es auf Deutsch, Englisch und Französisch. Jede:r wählt die eigene Sprache in den
persönlichen Einstellungen, der Header übersteuert sie für die laufende Sitzung. Rezepte (Titel und
Inhalt), die Oberfläche und die Auswahllisten (Kulinarik, Kategorien, Einheiten, Portionseinheiten)
gibt es in allen drei Sprachen. Deutsch bleibt die Sprache der Originale.

**Wunsch des Eigentümers (22.11.2026):** „Alle Rezepte in Englisch und Französisch übersetzt. Dafür soll
in den persönlichen Einstellungen und im Header die Sprache ausgewählt werden können (persönliche
Einstellungen ist Default, kann aber im App Header übersteuert werden). Rezepttitel sollen initial in
alle Sprachen übersetzt werden, dann bei Anlage neuer Rezepte. […] Die Oberfläche muss dafür auch
mehrsprachig aufgebaut werden und die Auswahllisten der Einstellungen (zum Beispiel Portionen) müssen
auch mehrsprachig aufgesetzt werden.“ Umfang: „alles“, also kein Halt nach einem Zwischenstand.

## Entschieden

| Thema | Entscheidung |
|---|---|
| Sprachen | `de` (Original, Standard), `en`, `fr`. Locales `de-DE`, `en-GB` (Tag vor Monat), `fr-FR`. Sprachnamen in der eigenen Sprache (Deutsch, English, Français). Französisch duzt wie Deutsch, wie die Wichtel-Seite. Liste in `src/i18n/sprachen.js`, deckungsgleich mit den Sprachen der Gästeprofile (`GUEST_LANGUAGES`, Test). |
| Welche Sprache gilt | (1) die im Header gewählte Sprache der Sitzung (sessionStorage `sitzungsSprache`, endet mit der Sitzung), (2) die persönliche Einstellung `users/{uid}.sprache`, (3) Deutsch. Die Browsersprache zählt in der angemeldeten App nicht, damit niemand ungefragt eine andere Sprache bekommt. Seiten ohne Anmeldung: siehe „Offen“. Umsetzung: `aktiveSprache` in `src/i18n/sprachen.js`. |
| Technik der Oberfläche | Eigenes kleines Modul nach dem Muster der Wichtel-Seite, keine Bibliothek. Wörterbücher je Bereich in `src/i18n/texte/<bereich>.js` mit allen drei Sprachen nebeneinander; `useTexte(woerterbuch)` liefert `t(schluessel, werte)`. Platzhalter `{name}`; Mengen über `Intl.PluralRules` mit dem Wert `anzahl`, der auch nach der Sprache formatiert wird; Datum und Zahl über `src/i18n/format.js`. Fehlt ein Text in einer Sprache, gilt der deutsche. |
| Neue Texte | Ab PR 1 nur noch über `src/i18n` (Regel in `AGENTS.md`). Erzwungen durch `src/i18nPolicy.test.js`: Baseline je Datei, darf nur sinken, neue Dateien starten bei 0. Die Summe der Baseline ist der Rest, der noch zu übersetzen ist. |
| Rezepttitel | Übersetzt bei Anlage, bei Titeländerung und einmal für den Bestand (Backfill nach dem Muster von `backfillWeinprofile`). |
| Rezeptinhalt | Wird ebenfalls bei Anlage und Änderung übersetzt, nicht erst beim Öffnen. 22.11.2026: Empfehlung übernommen (ein Mechanismus statt zwei, keine Wartezeit beim ersten Öffnen, offline verfügbar). Das weicht vom ursprünglichen Wunsch „beim Öffnen“ ab. |
| Original bleibt Grundlage | Bearbeitet wird immer das deutsche Original. Portionsumrechnung, Nährwerte und Einkaufsliste arbeiten auf dem Original. Übersetzungen sind reine Anzeige, mit dem Hinweis „Automatisch übersetzt · Original anzeigen“. |
| Auswahllisten | Gespeicherte Werte bleiben deutsch, so stehen sie in Rezepten und Filtern. Übersetzt wird die Anzeige über eine Zuordnung je Listenwert, von der KI vorbefüllt und im Admin-Bereich korrigierbar. |
| Admin-Bereich | Bleibt deutsch (22.11.2026, Empfehlung übernommen). Dazu gehören „Verwaltung“ im Header-Menü (nur admin oder `settingsAccess`), also `Settings.js` mit seinen Tabs, sowie die App-Aufrufe. Die Dateien stehen in `NUR_DEUTSCH` in `src/i18nPolicy.test.js`; neue nur mit Begründung. |
| Später (Phase B) | E-Mails, Push-Mitteilungen, Druck-Layouts, Menü- und Event-Namen sowie andere Inhalte außer Rezepten (22.11.2026, Empfehlung übernommen). |
| Freischaltung | Berechtigung `sprachwahl` unter „Funktionen nach Berechtigung“, standardmäßig nur für Admins, bis die Oberfläche übersetzt ist (PR 6); danach für alle Rollen einschalten, ohne Code-Änderung. Ohne Berechtigung gilt Deutsch, auch wenn im Profil eine andere Sprache steht, und eine Sitzungs-Sprache endet (`useSpracheFuerNutzer` in `src/contexts/SpracheContext.js`). Vorbild: `parallelKochen`. |
| Profilfeld | `users/{uid}.sprache`, gespeichert mit `setUserSprache` (`src/utils/userManagement.js`). `firestore.rules` lässt beim eigenen Update nur `de`, `en` oder `fr` zu (Test in `rules-tests/access.test.js`). |
| Sprachwahl im Header | Abschnitt „Sprache“ im Header-Menü mit den drei Sprachen. Die eigene Standardsprache zu wählen hebt die Übersteuerung auf; solange eine gilt, steht darunter „Gilt nur für diese Sitzung“ mit der Standardsprache. Die Übersteuerung endet beim Abmelden. |
| Bereichsnamen | 22.11.2026, Eigentümer: „Bereichsnamen übersetzen“. Stehen in `src/i18n/texte/bereiche.js`, nur dort ändern: Küche → Kitchen / Cuisine, Kochbuch → Cookbook / Recettes, Festtafel → Feast / Festin, Events → Events / Événements, Kochatelier → Cooking studio / Atelier cuisine (untere Navigation kurz: Atelier → Studio / Atelier), Chefkoch → Chef / Chef, Chefkoch & mehr → Chef & more / Chef & plus, Kochschule → Cooking school / École de cuisine. Die untere Navigation holt ihre Namen über `textKey` in `BOTTOM_NAV_TABS` (`App.js`). |
| Ansprache | 22.11.2026, Eigentümer: „immer duzen“. Deutsch „du“, Französisch „tu“, Englisch neutral. Siezender Altbestand wird beim Umstellen eines Bereichs angeglichen. `src/i18n/texte.test.js` lässt in deutschen Wörterbuchtexten keine Höflichkeitsform zu (Sie, Ihr, Ihnen …). |
| Titelübersetzung: Feld | `recipes/{id}.titelUebersetzung` = `{quelle, originalSprache, de, en, fr, modell, erstelltAm}`, schreibt nur die Cloud Function (`firestore.rules` wie bei `weinprofil`, Tech-Check S29; `addRecipe` entfernt es aus Kopien). `quelle` ist der übersetzte Titel; weicht `title` ab, zeigt der Client bis zur neuen Übersetzung das Original. `originalSprache` erkennt Gemini (`de`, `en`, `fr` oder `andere`); in der Originalsprache bleibt das Original, ein englisches Original bekommt also eine deutsche Übersetzung. |
| Titelübersetzung: Ablauf | Trigger `uebersetzeRezeptTitel` (`functions/handlers/uebersetzung.js`) auf `recipes/{id}`: nur bei neuem oder geändertem Titel, nicht bei laufenden Importen (`importStatus`), schreibt mit Vorbedingung `lastUpdateTime` (eine neuere Änderung gewinnt). Gesamt-Tageslimit 3000 Titel (`automatik` in `aiTitelUebersetzungLimits`), fail closed. Backfill `backfillTitelUebersetzungen` nur für Admins, Cursor, 25 Rezepte je Seite und ein Gemini-Aufruf je Seite, 10000 Titel je Admin und Tag; Knopf unter Einstellungen › KI. |
| Titelübersetzung: Anzeige | Nur mit der Berechtigung `sprachwahl` (`inhalteUebersetzen` im SpracheContext), sonst überall das Original wie bisher, auch auf Deutsch. Umgestellt in PR 3: Kochbuch (Karten, alphabetische Sortierung, Suche), Suche in Listen und auf dem Handy, Rezeptansicht (Titel, Sticky-Titel, Kochmodus, Bild-Alt) mit „Original: …“ darunter. Die übrigen Stellen folgen je Bereich mit PR 6 (siehe „Offen“). |
| Inhaltsübersetzung: Speicherort | 22.11.2026: eigene Collection `rezeptUebersetzungen/{recipeId}`, nicht im Rezept. Die App lädt alle Rezeptdokumente für die Listen; zwei vollständige Übersetzungen darin würden die Datenmenge etwa verdreifachen. Titel bleiben im Rezept (`titelUebersetzung`), weil Listen sie brauchen. Lesen: Mitglieder, nur einzeln; schreiben nur die Cloud Function (`firestore.rules`, Test). |
| Inhaltsübersetzung: Format | `{quellHash, originalSprache, schemaVersion, modell, erstelltAm, <sprache>: {zutaten, schritte}}` für jede Sprache außer der des Originals. Die Listen stehen Eintrag für Eintrag wie im Rezept; Überschriften werden übersetzt, verknüpfte Rezepte (`#recipe:…`) und leere Einträge bleiben. `quellHash` ist der sha256 über Art und Text aller Zutaten und Schritte; Client (`src/i18n/rezeptInhalt.js`) und Function (`functions/shared/inhaltUebersetzung.js`) bilden ihn gleich (Konsistenztest). |
| Portionsumrechnung | 22.11.2026: bleibt unverändert. `scaleIngredient` skaliert nur die Menge am Zeilenanfang und erkennt Zahlen, Brüche und Bereiche unabhängig von der Sprache. Der Prompt verlangt, dass die Menge am Zeilenanfang genau wie im Original stehen bleibt; Einheit und Zutat werden übersetzt. |
| Inhaltsübersetzung: Ablauf | Trigger `uebersetzeRezeptInhalt` auf `recipes/{id}`: vergleicht den `quellHash` vorher und nachher (ohne Lesezugriff) und ruft Gemini nur bei neuem oder geändertem Inhalt, nicht bei laufenden Importen; schreibt in einer Transaktion nur, wenn das Rezept noch denselben Inhalt hat; löscht die Übersetzung mit dem Rezept. Die Antwort gilt nur vollständig (jede Zielsprache, jeder Eintrag). Tageslimits in `aiInhaltUebersetzungLimits`: 1000 Rezepte automatisch, 3000 je Admin im Backfill `backfillInhaltUebersetzungen` (10 Rezepte je Seite, drei gleichzeitig; Knopf unter Einstellungen › KI). |
| Inhaltsübersetzung: Anzeige | Rezeptansicht und Kochmodus (Zutaten, Schritte, Überschriften) über `useRezeptInhalt`, nur mit der Berechtigung `sprachwahl`. Passt der Hash nicht (Rezept geändert), zeigt die App das Original, bis die neue Übersetzung da ist. Unter dem Titel „Automatisch übersetzt · Original anzeigen“; der Umschalter gilt für Titel und Inhalt. Portionsumrechnung, Timer, Nährwerte und Einkaufsliste arbeiten mit dem Original. |
| Backfill-Hooks | 22.11.2026 (PR 4): zusammengelegt in `useSeitenweiserBackfill`; `useWeinprofilBackfill` ist ein dünner Aufruf davon, die Übersetzungs-Backfills nutzen ihn über `UebersetzungBackfill.js`. |
| Lieferweg | PR 1 bis 4 entstanden als Patches in einer Session ohne Schreibrechte auf das Repo. Empfehlung für die weiteren PRs: Session mit GitHub-Zugang. |

## Stand der Umsetzung

| PR | Inhalt | Stand |
|---|---|---|
| 1 | Fundament ohne sichtbare Änderung: `src/i18n/sprachen.js` (Sprachen, `aktiveSprache`, Sitzungs-Speicher, `browserSprache`), `src/i18n/texte.js` (`erstelleT`, `fuelleText`, Mehrzahl), `src/i18n/format.js` (Zahl, Datum), erstes Wörterbuch `src/i18n/texte/allgemein.js`. `SpracheProvider`, `useSprache`, `useTexte` und `useProfilSprache` in `src/contexts/SpracheContext.js`; der Provider setzt `<html lang>` und umschließt die App in `src/index.js`, `App.js` meldet `currentUser.sprache`. `renderWithProviders(ui, { sprache })`. Regel in `AGENTS.md` mit `src/i18nPolicy.test.js`, dieser Tracker, Eintrag in `CLAUDE.md`. | gemergt 22.11.2026 (PR #3718, Merge d137225) |
| 2 | Sprachwahl: Feld `sprache` im Nutzerdokument mit `setUserSprache`, Regel in `firestore.rules` mit Test in `rules-tests/access.test.js`, Eintrag in `docs/architecture/security.md`. Berechtigung `sprachwahl` (`ROLE_PERMISSIONS_DEFAULT`, `applyRolePermissionsToUser` in `App.js`, Spalte in `UserManagement.js`). `useSpracheFuerNutzer` statt `useProfilSprache` in `App.js`. Zeile „Sprache“ in „Persönliche Daten“ unter „Einstellungen“ mit Auswahlseite nach dem Muster von „Erscheinungsbild“. Abschnitt „Sprache“ im Header-Menü. Header und „Persönliche Daten“ vollständig übersetzt (Wörterbücher `kopfzeile.js`, `persoenlicheDaten.js`, `webimportPin.js`, `bereiche.js`). Eintrag im `CHANGELOG.md`. | gemergt 22.11.2026 (PR #3719, Merge 67670c7) |
| 3 | Rezepttitel: `functions/shared/titelUebersetzung.js` (Prompt, Schema, Prüfung), `functions/handlers/uebersetzung.js` (Trigger `uebersetzeRezeptTitel`, Callable `backfillTitelUebersetzungen`) mit Tests in `functions/index.titelUebersetzung.test.js`; Regeln für `titelUebersetzung` und `aiTitelUebersetzungLimits` mit Tests in `rules-tests/access.test.js`, `security.md`. Client: `src/i18n/rezeptTitel.js`, `useRezeptTitel` und `inhalteUebersetzen` im SpracheContext, Anzeige in `RecipeCard`, `RecipeList`, `RecipeDetail`, `MobileSearchOverlay`, Suche in `GroupDetail`; Backfill-Knopf (seit PR 4 `UebersetzungBackfill.js` mit `useSeitenweiserBackfill`). | gemergt 22.11.2026 (PR #3720, Merge 68e9e7b) |
| 4 | Rezeptinhalt: `functions/shared/inhaltUebersetzung.js` (Hash, Anfrage, Prompt, Schema, Prüfung, Dokument), Trigger `uebersetzeRezeptInhalt` und Callable `backfillInhaltUebersetzungen` in `functions/handlers/uebersetzung.js` mit Tests in `functions/index.inhaltUebersetzung.test.js`; Regeln für `rezeptUebersetzungen` und `aiInhaltUebersetzungLimits` mit Tests, `security.md`. Client: `src/i18n/rezeptInhalt.js` (mit Konsistenztest), `src/utils/rezeptUebersetzungFirestore.js`, `src/hooks/useRezeptInhalt.js`, Anzeige und Umschalter in `RecipeDetail.js`, `src/utils/sha256.js` (aus `profilHash.js` herausgelöst); Backfill-Hooks zusammengelegt (`useSeitenweiserBackfill`), `UebersetzungBackfill.js` mit zweitem Abschnitt unter Einstellungen › KI. | PR #3724 (offen, 22.11.2026; Functions- und Regel-Tests grün; echter Gemini-Aufruf erst nach dem Deploy prüfbar) |
| 5 | Auswahllisten: Zuordnung je Listenwert (Kulinarik-Typen und -Gruppen, Speisekategorien, Einheiten, Portions-, Gebinde- und Getränkeeinheiten mit Einzahl und Mehrzahl, Adjektive). KI-Vorbefüllung, Pflege unter „Listen & Kategorien“, Anzeige-Helfer. | offen |
| 6 | Oberfläche Bereich für Bereich, mehrere PRs, nach Nutzung: Rezeptansicht und Kochmodus, Kochbuch mit Suche und Filtern, Küche (Startseite), Festtafel (Menüs), Atelier, Events und Gäste, Gruppen, Netzwerk und Profile, Dialoge und Fehlermeldungen aus `utils/`. Wie viel noch fehlt, zeigt die `BASELINE` in `src/i18nPolicy.test.js`. | offen |
| E | Entscheidungen umgesetzt: Bereichsnamen übersetzt (`bereiche.js`, untere Navigation mit eigenem Wörterbuch `navigation.js`), Hinweise zu Mitteilungen in „Persönliche Daten“ duzen, Test gegen die Höflichkeitsform, Regel in `AGENTS.md`. | gemergt 22.11.2026 (PR #3721, Merge 442bd21) |
| B | Phase B (siehe „Entschieden“). | später |

Nach jedem PR: Tabelle nachziehen. Berührt ein PR einen Tech-Check-Befund, auch das Dashboard
aktualisieren.

## Offen

- **Seiten ohne Anmeldung** (Freigabe-Links für Rezepte und Menüs): Browsersprache nutzen (`browserSprache`)?
  Vorschlag: ja, mit PR 6.
- **Wichtel-Seite:** hat eigene Helfer (`fuelleText`, `browserSprache` in
  `src/utils/wichtelTeilnahmeTexte.js`), die es jetzt auch in `src/i18n` gibt. Nach der Wichtel-Saison auf
  `src/i18n` umstellen; bewusst nicht in PR 1, um die laufende Saison nicht zu berühren.
- **KI-Kosten:** Titel kosten wenige Token (3000 automatisch, 10000 je Admin und Tag), Inhalte deutlich mehr
  (1000 automatisch, 3000 je Admin und Tag). Nach dem ersten Backfill der Inhalte die tatsächlichen
  Gemini-Kosten in der Abrechnung prüfen und die Limits bei Bedarf anpassen.
- **Weitere Stellen für übersetzte Titel** (mit PR 6 je Bereich): Festtafel (`MenuDetail`, `MenuForm`),
  Kochmodus-Leiste und Karussell (`CookingSession*`), Tagesmenü, Startseite und Trends, `RecipeTypeahead`,
  Zeitleiste, Druck, Freigabe-Seiten.
- **Kochmodus:** Schritte und Zutaten erscheinen übersetzt, die Beschriftung der Timer (aus dem Originaltext)
  und die übrigen Texte des Kochmodus noch deutsch. Mit PR 6 (Rezeptansicht und Kochmodus).
- **Übersetzte Inhalte für Gäste:** `rezeptUebersetzungen` lesen nur Mitglieder. Freigabe-Seiten zeigen
  vorerst das Original (zusammen mit den Seiten ohne Anmeldung, siehe oben).
- **Größe der Wörterbücher:** Sie wachsen mit jedem Bereich und landen im Chunk des Bereichs. Wächst der
  Start-Chunk spürbar, Sprachen nachladen statt alle drei mitzuliefern.
- **Meldungen aus `utils/`:** Fehlermeldungen von `updateUserProfile`, `changePassword` und den PIN-Callables
  erscheinen in den persönlichen Daten noch deutsch. Umstellen mit PR 6 (Dialoge und Fehlermeldungen).
- **Freischaltung für alle:** nach PR 6 die Berechtigung `sprachwahl` für alle Rollen einschalten und im
  `CHANGELOG.md` als allgemein verfügbar eintragen.

## Wichtige Stellen im Code

- Sprachen und welche gilt: `src/i18n/sprachen.js`
- Texte und Übersetzungsfunktion: `src/i18n/texte.js`, Wörterbücher in `src/i18n/texte/`
- Datum und Zahl: `src/i18n/format.js`
- Provider und Hooks: `src/contexts/SpracheContext.js`, eingebunden in `src/index.js`; `App.js` verbindet
  die Sprache mit der angemeldeten Person über `useSpracheFuerNutzer(currentUser)`
- Sprachwahl: Zeile und Auswahlseite in `src/components/PersonalDataPage.js`, Abschnitt im Menü von
  `src/components/Header.js` (Hinweis-Stil `.menu-language-hint` in `Header.css`); Speichern mit
  `setUserSprache` in `src/utils/userManagement.js`; Berechtigung `sprachwahl` dort in
  `ROLE_PERMISSIONS_DEFAULT`, in `App.js` (`applyRolePermissionsToUser`) und `UserManagement.js`
  (`ROLE_PERMISSION_COLUMNS`)
- Tests: `src/i18n/*.test.js`, `src/contexts/SpracheContext.test.js`, Regel `src/i18nPolicy.test.js`;
  Komponententests in anderer Sprache mit `renderWithProviders(ui, { sprache: 'en' })`
- Titelübersetzung: Server in `functions/shared/titelUebersetzung.js` und `functions/handlers/uebersetzung.js`;
  Anzeige über `src/i18n/rezeptTitel.js` und `useRezeptTitel`; Backfill-Knopf in `Settings.js` (KI)
- Inhaltsübersetzung: Server in `functions/shared/inhaltUebersetzung.js` und `functions/handlers/uebersetzung.js`;
  Anzeige über `src/hooks/useRezeptInhalt.js` und `src/i18n/rezeptInhalt.js` in `RecipeDetail.js`;
  Backfill-Knöpfe `src/components/UebersetzungBackfill.js` mit `src/hooks/useSeitenweiserBackfill.js`
- Vorlage: Wichtel-Teilnehmerseite (`src/utils/wichtelTeilnahmeTexte.js`)
