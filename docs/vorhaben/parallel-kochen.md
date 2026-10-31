# Vorhaben: Parallel kochen (mehrere Rezepte im Hintergrund, Mobile)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 31.10.2026 (PR 1 als PR #3566 offen, nicht gemergt).

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

Stand nach PR 1: Timer, Alarm und der Wake-Lock für laufende Timer liegen in der Sitzung. Kochmodus, Schritt,
Portionen und der Wake-Lock des Kochmodus liegen noch in `RecipeDetail`.

- Kochmodus, aktueller Schritt, Portionen und Timer sind lokaler State in `RecipeDetail` (`cookingMode`,
  `currentStepIndex`, `activeTimers`, `timerIntervalsRef`). `App.js` rendert `RecipeDetail` nur, solange
  `selectedRecipe` gesetzt ist. Beim Verlassen räumt der Unmount-Effekt Intervalle und Alarm-`AudioContext` ab:
  Ein laufender Timer geht verloren, sobald man das Rezept verlässt. Im Tech-Check seit 31.10.2026 Befund **P7**.
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
| 1 | Kochsitzung `src/contexts/CookingSessionContext.js` über der Hauptansicht: Timer je Rezept (Schlüssel Rezept-ID + Schritt), ein gemeinsamer Alarm-`AudioContext`, Wake-Lock, solange ein Timer läuft. Alarm-Dialog als eigener Baustein `CookingAlarmModal` (erscheint auch ohne offenes Rezept, nennt den Rezeptnamen, listet alle abgelaufenen Timer). Kochmodus, Schritt und Portionen bleiben vorerst in `RecipeDetail` (Abweichung vom Plan, ziehen mit PR 2 um). Ohne Flag. Tests +8. Dashboard: A1 ergänzt, P7 neu (beide bis zum Merge offen) | PR #3566 offen (31.10.2026), nicht gemergt |
| 2 | Kochmodus, Schritt und Portionen in die Sitzung; Titelzeile und „+ Rezept“-Sheet (V3), hinter einem neuen Rollen-Flag in `src/utils/userManagement.js` (Muster `follow`). Vorschläge: andere Rezepte der Festtafel, aus der das Rezept geöffnet wurde (prüfen, ob `App.js` das Menü dann noch kennt), verknüpfte Rezepte (`linkedRecipes` in `RecipeDetail`), zuletzt gekocht (`src/utils/recipeCookDates.js`). Erster Commit `feat:`. | offen |
| 3 | Rezept-Leiste (H1) im Kochmodus und über der Bottom-Navigation, Entfernen per Linksswipe mit „Rückgängig“, Farben als Tokens. Danach Flag freigeben (eigene Entscheidung). Erster Commit `feat:`. | offen |
| 4 | Abgelaufener Timer eines geparkten Rezepts: Chip „Fertig“, Benachrichtigung mit Rezeptname, Tippen öffnet den Schritt. Je nach Entscheidung: Auto-Parken beim Schließen, Sitzung übersteht einen Neustart. | offen |

Nach jedem PR: Tabelle hier nachziehen. Berührt ein PR einen Tech-Check-Befund (mindestens PR 1: A1),
das Dashboard nach `CLAUDE.md` aktualisieren.

Umsetzungsnotizen PR 1: Der Provider sitzt in `App.js` innerhalb von `FollowProvider`. Ein Takt (1 s) rechnet
die Restzeit aller laufenden Timer aus `endTime`, `visibilitychange` gleicht nach Bildschirmsperre ab.
`RecipeDetail` holt die Timer über `useCookingSession()`; ohne Provider (Tests, Einbettungen) legt der Hook einen
lokalen Speicher an, der wie früher mit der Komponente endet, und `RecipeDetail` rendert den Alarm-Dialog dann
selbst. Neu im Verhalten: Ein Timer läuft nach dem Verlassen des Rezepts weiter, der Alarm kommt auf jeder
Seite, die Benachrichtigung nennt den Rezeptnamen, mehrere abgelaufene Timer stehen gemeinsam im Dialog (bisher
ging jeder weitere verloren), und der Bildschirm bleibt wach, solange ein Timer läuft, auch außerhalb des
Kochmodus. Ein abgelaufener Timer zeigt sein Häkchen am Schritt, bis man ihn zurücksetzt oder die App neu lädt.
Der Dialog hat ein eigenes Stylesheet (`CookingAlarmModal.css`, Tokens `--color-alarm`, `--color-alarm-strong`,
`--color-on-alarm`); dadurch minimal anders: Titel `#e53935` statt `#d32f2f`, Beschriftung im hellen Modus `#666`
statt `#555`. Baselines in `colorTokenPolicy.test.js` gesenkt (`RecipeDetail.css` 162 → 156, `darkMode.css`
1.019 → 1.017). `RecipeDetail.js` 3.104 → 2.850 Zeilen, `useState` 79 → 76. Tests: +4 in
`RecipeDetail.timer.test.js` (die zwei zum Weiterlaufen und zum Alarm ohne offenes Rezept schlagen mit dem alten
`RecipeDetail` fehl), +4 in `src/contexts/CookingSessionContext.test.js`. Nicht am Gerät geprüft, vor allem nicht
Ton und Benachrichtigung bei gesperrtem iPhone (iOS-PWA).

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
