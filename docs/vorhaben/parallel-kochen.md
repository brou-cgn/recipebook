# Vorhaben: Parallel kochen (mehrere Rezepte im Hintergrund, Mobile)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 31.10.2026 (Konzept entschieden, noch kein PR).

**Ziel:** Wer mehrere Gerichte gleichzeitig kocht (Beispiel im Entwurf: Rouladen, Rotkohl, Klöße), hält im
Kochmodus auf dem Handy mehrere Rezepte offen. Rezepte im Hintergrund laufen weiter, samt Timer, und sind mit
einem Tipp wieder vorn.

**Designentwürfe:** https://claude.ai/artifact/8wmH6AYfgzmnd68G6MB8AS (Leinwand „Rezepte im Hintergrund“:
V1–V3 Verschieben, H1–H3 Hervorholen). Gewählt: V3 und H1. Keine Mockups im Repo.

## Entschieden

| Thema | Entscheidung |
|---|---|
| Verschieben | V3 „Rezept dazunehmen“ (31.10.2026): „+ Rezept“ in der Titelzeile des Kochmodus öffnet ein Bottom-Sheet „Was kochst du dazu?“ mit Suche und Vorschlägen. Das gewählte Rezept kommt im Kochmodus nach vorn, das bisherige parkt von selbst. Snackbar „<Rezept> läuft im Hintergrund weiter“ mit „Zurück“. |
| Hervorholen | H1 „Rezept-Leiste unten“ (31.10.2026): ein Chip je geparktem Rezept (Bild, Name, laufender Timer, sonst Schritt „4 / 5“), sortiert nach dem nächsten fälligen Timer, bald fällige hervorgehoben. Tippen tauscht mit dem Rezept vorn. Im Kochmodus unter dem Zutaten-Sheet (das um die Leistenhöhe kürzer wird), außerhalb des Kochmodus über der Bottom-Navigation (Entwurf V1, Bild 2). |
| Titelzeile | Der Kochmodus im Hochformat bekommt eine Zeile mit dem Rezeptnamen. Heute fehlt sie; mit mehreren Rezepten wäre sonst unklar, welches vorn ist. |
| Umfang | Nur Handy im Hochformat. Desktop und Tablet bleiben, wie sie sind. |

Vorgaben aus `AGENTS.md`, die hier greifen: Entfernen eines Rezepts aus der Leiste per Linksswipe
(`useSwipeToDelete`) mit „Rückgängig“ (`useUndoableDelete`), kein ×. Farben nur über Tokens: das Braun der
Leiste und das Orange für „bald fällig“ in `src/tokens.css` mit Light- und Dark-Wert anlegen. Die Suche im
Sheet arbeitet auf dem schon geladenen `recipes`-Array, „zuletzt gekocht“ nur mit `where` und `limit`.

## Technische Grundlage (Code gelesen am 31.10.2026, nicht am Gerät geprüft)

- Kochmodus, aktueller Schritt, Portionen und Timer sind lokaler State in `RecipeDetail` (`cookingMode`,
  `currentStepIndex`, `activeTimers`, `timerIntervalsRef`). `App.js` rendert `RecipeDetail` nur, solange
  `selectedRecipe` gesetzt ist. Beim Verlassen räumt der Unmount-Effekt Intervalle und Alarm-`AudioContext` ab:
  Ein laufender Timer geht verloren, sobald man das Rezept verlässt. Dazu gibt es noch keinen Tech-Check-Befund.
- Timer kennen schon ihren Endzeitpunkt (`endTime`, auch beim Abgleich nach `visibilitychange` genutzt). Es fehlt
  nur ein Ort, an dem sie das Rezept überleben.
- Timer-Schlüssel sind `step_<Index>` ohne Rezept-ID. Mit mehreren Rezepten braucht es Rezept-ID und Schritt.
- Der Alarm-`AudioContext` entsteht beim Start eines Timers (iOS spielt Ton nur nach einer Geste) und wird beim
  Unmount geschlossen. Für Timer geparkter Rezepte muss er in der Sitzung liegen.
- Der Wake-Lock hängt am `cookingMode` des sichtbaren Rezepts. Künftig hängt er an der Sitzung: aktiv, solange
  ein Rezept kocht.
- Tech-Check **A1** (Gottkomponenten; `RecipeDetail.js` 3.104 Zeilen, 79 `useState` am 30.10.2026): Neuer State
  kommt nicht in `App.js` oder `RecipeDetail.js`, sondern in einen eigenen Context mit Hooks. PR 1 setzt A1 damit
  teilweise um.
- Tech-Check **W2** (Design per Trial-and-Error-PR): Abweichungen vom Entwurf hier entscheiden und festhalten,
  nicht in Folge-PRs ausprobieren.

## Stand der Umsetzung

| PR | Inhalt | Stand |
|---|---|---|
| 1 | Kochsitzung als Context über der Hauptansicht (Name offen, z. B. `CookingSessionContext`): je Rezept Kochmodus, Schritt, Portionen und Timer (Schlüssel Rezept-ID + Schritt), ein gemeinsamer Alarm-`AudioContext`, Wake-Lock an der Sitzung. `RecipeDetail` liest und schreibt nur noch darüber. Sichtbar ändert sich nur, dass Timer das Verlassen des Rezepts überleben. Tests: `RecipeDetail.timer` und `RecipeDetail.cooking-mode-layout` bleiben grün; neu: Timer läuft nach Verlassen und Wiederöffnen weiter, Alarm kommt auch für ein nicht sichtbares Rezept. Dashboard: A1 teilweise, Timer-Verlust als neuer Befund (behoben). Erster Commit `fix:`, ohne Flag. | offen |
| 2 | Titelzeile und „+ Rezept“-Sheet (V3), hinter einem neuen Rollen-Flag in `src/utils/userManagement.js` (Muster `follow`). Vorschläge: andere Rezepte der Festtafel, aus der das Rezept geöffnet wurde (prüfen, ob `App.js` das Menü dann noch kennt), verknüpfte Rezepte (`linkedRecipes` in `RecipeDetail`), zuletzt gekocht (`src/utils/recipeCookDates.js`). Erster Commit `feat:`. | offen |
| 3 | Rezept-Leiste (H1) im Kochmodus und über der Bottom-Navigation, Entfernen per Linksswipe mit „Rückgängig“, Farben als Tokens. Danach Flag freigeben (eigene Entscheidung). Erster Commit `feat:`. | offen |
| 4 | Abgelaufener Timer eines geparkten Rezepts: Chip „Fertig“, Benachrichtigung mit Rezeptname, Tippen öffnet den Schritt. Je nach Entscheidung: Auto-Parken beim Schließen, Sitzung übersteht einen Neustart. | offen |

Nach jedem PR: Tabelle hier nachziehen. Berührt ein PR einen Tech-Check-Befund (mindestens PR 1: A1),
das Dashboard nach `CLAUDE.md` aktualisieren.

## Offen

- **Wischen in der Leiste:** Der Entwurf H1 zeigt „Wischen blättert“, die App-Regel will Linksswipe zum
  Entfernen. Beides auf denselben Chips geht nicht. Vorschlag: kein Blättern per Wischen (bei höchstens drei
  Chips reicht Tippen), Linksswipe entfernt aus der Sitzung.
- **Obergrenze:** Vorschlag vier Rezepte je Sitzung (eins vorn, drei in der Leiste). Mehr Chips passen nicht
  ohne Scrollen.
- **„Kochmodus beenden“ in der Lasche:** Beendet es nur das Rezept vorn (das nächste aus der Leiste rückt nach)
  oder die ganze Sitzung? Vorschlag: nur das Rezept vorn.
- **Parken ohne neues Rezept** (V2, Parken-Knopf in der Lasche): nicht gewählt. Wird nötig, wenn man ein Rezept
  parken will, ohne gleich ein anderes zu öffnen.
- **Auto-Parken beim Schließen:** Wer ein Rezept mit laufendem Timer schließt, parkt es, statt den Timer zu
  verlieren. Vorschlag: ja.
- **Schwelle „bald fällig“:** Vorschlag fünf Minuten.
- **Leiste außerhalb des Kochmodus:** überall oder nur in Kochbuch, Festtafel und Rezeptdetail? Kollision mit
  schwebenden Buttons (z. B. `OverviewAddFab`) prüfen.
- **Neustart:** Soll die Sitzung einen Neustart der App überstehen (iOS beendet PWAs im Hintergrund)? Dann
  Sitzung in `localStorage`; die Timer haben schon `endTime`.
- **Querformat:** Der Kochmodus hat ein eigenes Querformat-Layout; wo die Leiste dort sitzt, ist offen.
- **Flag:** Name und Zeitpunkt der Freigabe offen.
- **Priorität** gegenüber dem Follow-Feature: offen.

## Wichtige Stellen im Code

- Kochmodus, Timer, Wake-Lock, Alarm: `src/components/RecipeDetail.js` (`cookingMode`, `startTimer`,
  `activeTimers`, Unmount-Effekt mit `clearInterval`), Layout `src/components/RecipeDetail.css`
  (Hochformat: `.cooking-mode-active:not(.cooking-mode-landscape)`)
- Kochmodus-Lasche: `src/hooks/useCookingModeTabPosition.js`
- Rezeptdetail ein und aus: `src/App.js` (`selectedRecipe`, `handleSelectRecipe`)
- Bottom-Navigation: `src/components/BottomNavigation.js`
- Swipe und Rückgängig: `src/hooks/useSwipeToDelete.js`, `src/hooks/useUndoableDelete.js`,
  `src/components/UndoSnackbar.js`
- Rollen-Flags: `src/utils/userManagement.js`
- Festtafel: `src/components/MenuDetail.js` (`onSelectRecipe`); Kochdaten: `src/utils/recipeCookDates.js`
- Tests: `src/components/RecipeDetail.timer.test.js`, `src/components/RecipeDetail.cooking-mode-layout.test.js`
