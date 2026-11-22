# Vorhaben: Mehrsprachigkeit (Deutsch, Englisch, Französisch)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 22.11.2026 (PR 1 als
PR #3718 offen, PR 2 als PR #3719 offen (baut auf #3718 auf), beide noch nicht gemergt).

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
| Bereichsnamen vorerst | `src/i18n/texte/bereiche.js` führt Küche, Kochbuch, Festtafel usw. in allen Sprachen deutsch, bis die Entscheidung unter „Offen“ fällt; dann nur dort ändern. |
| Lieferweg | PR 1 und PR 2 entstanden als Patches in einer Session ohne Schreibrechte auf das Repo und werden in dieser Reihenfolge eingespielt. Empfehlung für die weiteren PRs: Session mit GitHub-Zugang. |

## Stand der Umsetzung

| PR | Inhalt | Stand |
|---|---|---|
| 1 | Fundament ohne sichtbare Änderung: `src/i18n/sprachen.js` (Sprachen, `aktiveSprache`, Sitzungs-Speicher, `browserSprache`), `src/i18n/texte.js` (`erstelleT`, `fuelleText`, Mehrzahl), `src/i18n/format.js` (Zahl, Datum), erstes Wörterbuch `src/i18n/texte/allgemein.js`. `SpracheProvider`, `useSprache`, `useTexte` und `useProfilSprache` in `src/contexts/SpracheContext.js`; der Provider setzt `<html lang>` und umschließt die App in `src/index.js`, `App.js` meldet `currentUser.sprache`. `renderWithProviders(ui, { sprache })`. Regel in `AGENTS.md` mit `src/i18nPolicy.test.js`, dieser Tracker, Eintrag in `CLAUDE.md`. | PR #3718 (offen, 22.11.2026; Patch unverändert auf `main` a7adc24 eingespielt, Baseline ohne Anpassung grün) |
| 2 | Sprachwahl: Feld `sprache` im Nutzerdokument mit `setUserSprache`, Regel in `firestore.rules` mit Test in `rules-tests/access.test.js`, Eintrag in `docs/architecture/security.md`. Berechtigung `sprachwahl` (`ROLE_PERMISSIONS_DEFAULT`, `applyRolePermissionsToUser` in `App.js`, Spalte in `UserManagement.js`). `useSpracheFuerNutzer` statt `useProfilSprache` in `App.js`. Zeile „Sprache“ in „Persönliche Daten“ unter „Einstellungen“ mit Auswahlseite nach dem Muster von „Erscheinungsbild“. Abschnitt „Sprache“ im Header-Menü. Header und „Persönliche Daten“ vollständig übersetzt (Wörterbücher `kopfzeile.js`, `persoenlicheDaten.js`, `webimportPin.js`, `bereiche.js`). Eintrag im `CHANGELOG.md`. | PR #3719 (offen, 22.11.2026; baut auf #3718 auf, nach ihm mergen. Regel-Test für `sprache` gegen den Emulator grün) |
| 3 | Rezepttitel: Function in `functions/handlers/` mit Trigger auf `recipes/{id}`. Sie reagiert nur auf einen neuen oder geänderten Titel, überspringt laufende Importe (`importStatus`) und schreibt schleifenfest über einen Hash. Originalsprache erkennen, ein englisches Original also nicht nach Englisch übersetzen. Backfill nur für Admins mit Cursor, Tageslimit wie `aiWeinprofilLimits`. Anzeige in Listen, Karten und Suche; die Suche findet Original und Übersetzung. | offen |
| 4 | Rezeptinhalt: Zutaten, Schritte und weitere Textfelder bei Anlage und Änderung übersetzen (Hash über die Quelltexte). Speicherort festlegen (siehe „Offen“). Anzeige mit Hinweis und „Original anzeigen“; Portionsumrechnung mit übersetzten Zutaten. | offen |
| 5 | Auswahllisten: Zuordnung je Listenwert (Kulinarik-Typen und -Gruppen, Speisekategorien, Einheiten, Portions-, Gebinde- und Getränkeeinheiten mit Einzahl und Mehrzahl, Adjektive). KI-Vorbefüllung, Pflege unter „Listen & Kategorien“, Anzeige-Helfer. | offen |
| 6 | Oberfläche Bereich für Bereich, mehrere PRs, nach Nutzung: Rezeptansicht und Kochmodus, Kochbuch mit Suche und Filtern, Küche (Startseite), Festtafel (Menüs), Atelier, Events und Gäste, Gruppen, Netzwerk und Profile, Dialoge und Fehlermeldungen aus `utils/`. Wie viel noch fehlt, zeigt die `BASELINE` in `src/i18nPolicy.test.js`. | offen |
| B | Phase B (siehe „Entschieden“). | später |

Nach jedem PR: Tabelle nachziehen. Berührt ein PR einen Tech-Check-Befund, auch das Dashboard
aktualisieren.

## Offen

- **Bereichsnamen** (Küche, Kochbuch, Festtafel, Atelier, Chefkoch, aus `BOTTOM_NAV_TABS` in `App.js`):
  übersetzen oder als Namen der App beibehalten? Entscheidung beim Eigentümer, spätestens vor PR 6.
- **Speicherort der Inhaltsübersetzungen** (vor PR 4): im Rezeptdokument oder in einer eigenen
  Collection. Vorschlag: Inhalt in einer eigenen Collection, damit Rezept-Versionen
  (`applyRecipeVersionChanges`), Trigger und Listener nicht auf jede Übersetzung reagieren; Titel dagegen
  im Rezept, weil Listen sie ohne zusätzliche Lesezugriffe brauchen. Prüfen.
- **Portionsumrechnung** (vor PR 4): Der Parser liest den deutschen Zutatentext. Vorschlag: Menge und
  Einheit kommen weiter aus dem Original, übersetzt werden nur der Name und die Beschriftung der Einheit.
  Prüfen.
- **Seiten ohne Anmeldung** (Freigabe-Links für Rezepte und Menüs): Browsersprache nutzen (`browserSprache`)?
  Vorschlag: ja, mit PR 6.
- **Wichtel-Seite:** hat eigene Helfer (`fuelleText`, `browserSprache` in
  `src/utils/wichtelTeilnahmeTexte.js`), die es jetzt auch in `src/i18n` gibt. Nach der Wichtel-Saison auf
  `src/i18n` umstellen; bewusst nicht in PR 1, um die laufende Saison nicht zu berühren.
- **KI-Kosten:** vor dem Backfill (PR 3 und 4) die aktuellen Gemini-Preise prüfen und den Bestand zählen;
  Tageslimit wie bei `aiWeinprofilLimits`.
- **Größe der Wörterbücher:** Sie wachsen mit jedem Bereich und landen im Chunk des Bereichs. Wächst der
  Start-Chunk spürbar, Sprachen nachladen statt alle drei mitzuliefern.
- **Meldungen aus `utils/`:** Fehlermeldungen von `updateUserProfile`, `changePassword` und den PIN-Callables
  erscheinen in den persönlichen Daten noch deutsch. Umstellen mit PR 6 (Dialoge und Fehlermeldungen).
- **Siezen in „Persönliche Daten“:** Die Hinweise zu den Mitteilungen siezen, der Rest der App duzt. Die
  deutschen Texte sind in PR 2 unverändert übernommen; Englisch und Französisch duzen bzw. sind neutral.
  Vereinheitlichen? Entscheidung beim Eigentümer.
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
- Vorlage: Wichtel-Teilnehmerseite (`src/utils/wichtelTeilnahmeTexte.js`)
