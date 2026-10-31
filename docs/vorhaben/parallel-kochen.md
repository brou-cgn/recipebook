# Vorhaben: Parallel kochen (mehrere Rezepte im Hintergrund, Mobile)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 31.10.2026 (PR 1 und 2 gemergt; PR 3 als PR #3569 offen, nicht gemergt).

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
| Obergrenze | Vier Rezepte je Sitzung. Bei vier Rezepten zeigt das Sheet einen Hinweis statt der Liste (31.10.2026: Vorschlag mit dem Auftrag „PR 2 bitte“ übernommen, nicht ausdrücklich bestätigt). |
| Kochmodus beenden | Nimmt nur das Rezept vorn aus der Sitzung. Gibt es weitere, rückt das nächste fällige nach: abgelaufener Timer zuerst, dann der früheste laufende, sonst das zuletzt dazugenommene. Das letzte Rezept endet wie bisher (31.10.2026, übernommen wie die Obergrenze). |
| Flag | `parallelKochen` in `src/utils/userManagement.js` und in der Benutzerverwaltung, für alle Rollen aus (31.10.2026). Bleibt auch für Admins aus; freigeschaltet wird über Benutzerverwaltung → Rollenrechte, danach die App neu laden (Entscheidung 31.10.2026). |
| Wischen in der Leiste | Tippen holt ein Rezept nach vorn, Linksswipe nimmt es aus der Sitzung (mit „Rückgängig“). Kein Blättern per Wischen (31.10.2026, bestätigt). |
| Bald fällig | Ab fünf Minuten Restzeit wird der Chip orange, ein abgelaufener Timer zeigt „Fertig“, ebenfalls orange (31.10.2026: Vorschlag umgesetzt, nicht ausdrücklich bestätigt). |
| Leiste außerhalb des Kochmodus | Überall dort, wo die Bottom-Navigation sichtbar ist: über der vollen Leiste (Küche, Chefkoch) bzw. über der Pille (Kochbuch, Festtafel, Atelier). Im Rezeptdetail ohne Kochmodus und in der Festtafel-Detailansicht gibt es keine Bottom-Navigation und damit keine Leiste (mit PR 3 so gebaut, 31.10.2026). |
| Zuletzt gekocht | Nicht im Sheet (Abweichung vom Plan, 31.10.2026): `getAllCookDatesForUser` liest alle Kochdaten ohne `limit` (Tech-Check K3). Dafür braucht es eine eigene Abfrage mit `orderBy` und `limit` samt Index. Vorschläge vorerst: Festtafel, verknüpfte Rezepte, Suche. |

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
| 1 | Kochsitzung `src/contexts/CookingSessionContext.js` über der Hauptansicht: Timer je Rezept (Schlüssel Rezept-ID + Schritt), ein gemeinsamer Alarm-`AudioContext`, Wake-Lock, solange ein Timer läuft. Alarm-Dialog als eigener Baustein `CookingAlarmModal` (erscheint auch ohne offenes Rezept, nennt den Rezeptnamen, listet alle abgelaufenen Timer). Kochmodus, Schritt und Portionen bleiben vorerst in `RecipeDetail` (Abweichung vom Plan, ziehen mit PR 2 um). Ohne Flag. Tests +8. Dashboard: A1 teilweise, P7 behoben | PR #3566 gemergt (31.10.2026, v2.26.18), Deploy-Lauf 1941 erfolgreich; am Gerät nicht geprüft |
| 2 | Hinter dem Rollen-Flag `parallelKochen`: Titelzeile mit Rezeptname und „+ Rezept“, Sheet `CookingAddRecipeSheet` (Suche, Vorschläge aus der Festtafel und aus verknüpften Rezepten), Sitzung führt die Rezepte samt Schritt und Portionen, Snackbar „… läuft im Hintergrund“ mit „Zurück“, „Kochmodus beenden“ lässt das nächste nachrücken. Erster Commit `feat:`. Tests +16 | PR #3567 gemergt (31.10.2026, v2.27.0), Deploy-Lauf 1942 erfolgreich; am Gerät nicht geprüft |
| 3 | Rezept-Leiste `CookingSessionDock` (H1): im Kochmodus unter dem Zutaten-Sheet, außerhalb über der Bottom-Navigation (volle Leiste und Pille). Chips nach Dringlichkeit; bald fällige und abgelaufene („Fertig“) orange; Tippen tauscht (das Rezept vorn parkt), Linksswipe entfernt mit „Rückgängig“. Farben als Tokens. Weiter hinter dem Flag. Erster Commit `feat:`. Tests +12; `test:ci` 189 Suites, 3.912 Tests | PR #3569 offen (31.10.2026), nicht gemergt |
| 4 | Tippen auf „Fertig“ öffnet den Schritt mit dem abgelaufenen Timer (heute: den zuletzt offenen Schritt). Je nach Entscheidung: Auto-Parken beim Schließen, Sitzung übersteht einen Neustart. (Chip „Fertig“ und Benachrichtigung mit Rezeptname gibt es seit PR 3 bzw. PR 1.) | offen |

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

Umsetzungsnotizen PR 2: Kochmodus, Schritt und Portionen bleiben State in `RecipeDetail` (sie stecken in vielen
Effekten). Die Sitzung spiegelt sie stattdessen: Sie führt je Rezept `stepIndex` und `servingMultiplier`
(`sessionRecipes`), `RecipeDetail` schreibt Änderungen mit und stellt sie beim Öffnen eines Rezepts der Sitzung
wieder her (dann direkt im Kochmodus). Das gilt auch, wenn man ein geparktes Rezept über das Kochbuch neu öffnet.
Geöffnet wird über `onOpenRecipe` des Providers: `App.js` setzt `selectedRecipe` auf die aktuelle Fassung aus
`recipes`, ohne Kartenübergang; als Aufruf gezählt (`logRecipeCall`) wird nur ein neu dazugenommenes Rezept,
nicht das Hin- und Herwechseln. Die Snackbar ist `UndoSnackbar` mit eigenem Text und „Zurück“ (6 s). `RecipeDetail`
bekommt die offene Festtafel als Prop `menu` (`selectedMenu`). Daran hängt eine Verhaltensänderung: Portionen
schreibt nur noch ein Rezept der offenen Festtafel ins Menü. Bisher tat das jedes angezeigte Rezept, auch ein
verknüpftes; neu dazugenommene sollen dort keine Spuren hinterlassen (`getMenuRecipeIds` in
`src/utils/menuSections.js`). Ohne Rezept-Leiste (PR 3) kommt man zu einem geparkten Rezept über „Zurück“, über
„Kochmodus beenden“ beim Rezept vorn (das nächste rückt nach) oder indem man es im Kochbuch neu öffnet; deshalb
bleibt das Flag bis PR 3 aus. `RecipeDetail.js` 2.850 → 2.917 Zeilen, `useState` 76 → 77 (Tech-Check A1: Sheet und
Sitzungslogik liegen außerhalb, in `RecipeDetail` nur die Anbindung). Tests: +9 in
`src/contexts/CookingSessionContext.test.js`, +7 in `src/components/RecipeDetail.parallelCooking.test.js`; `test:ci`
188 Suites, 3.900 Tests. Nicht am Gerät geprüft.

Umsetzungsnotizen PR 3: Die Leiste (`src/components/CookingSessionDock.js`) liest die Sitzung und sortiert mit
`sortByNextDue`. Im Kochmodus rendert `RecipeDetail` sie als letzte Zeile (`placement="inline"`, ohne das Rezept vorn);
dann trägt der Inhalt die Klasse `cooking-mode-has-dock`, und das Zutaten-Sheet wird 72 px kürzer. Tippen ruft
`swapWith` der Sitzung: Das Rezept vorn parkt mit Schritt und Portionen, auch wenn es vorher nicht in der Sitzung
war (sofern Platz ist). Außerhalb rendert `App.js` sie fest über der Bottom-Navigation (`placement` `bar` bzw.
`pill`, je nach `PILL_TAB_KEYS` aus `BottomNavigation.js`); solange sie sichtbar ist, setzt sie
`--cooking-dock-space` (76 px) am Root, das `App.css` beim Innenabstand unten der Listen und bei den schwebenden
Knöpfen der vollen Leiste einrechnet. Die Eckknöpfe neben der Pille liegen unterhalb der Leiste und bleiben, wo sie
sind. Entfernen nutzt `useSwipeToDelete` und `useUndoableDelete` wie die Netzwerk-Seite: Der Chip verschwindet
sofort, `removeFromSession` läuft nach 6 s oder beim Verlassen der Ansicht; Timer des Rezepts laufen weiter. Neue
Tokens: `--color-cooking-dock`, `--color-cooking-dock-chip`, `--color-on-cooking-dock`,
`--color-cooking-dock-muted`, `--color-on-accent`. Das Vorschaubild kommt aus `src/utils/recipeThumbnail.js`
(auch im Sheet). `RecipeDetail.js` 2.917 → 2.934 Zeilen, `useState` unverändert 77. Tests: +8 in
`src/components/CookingSessionDock.test.js`, +3 in `src/contexts/CookingSessionContext.test.js`, +1 in
`src/components/RecipeDetail.parallelCooking.test.js`. Nicht am Gerät geprüft, vor allem nicht die Lage über der
Pille und den Eckknöpfen.

## Offen

- **Parken ohne neues Rezept** (V2, Parken-Knopf in der Lasche): nicht gewählt. Wird nötig, wenn man ein Rezept
  parken will, ohne gleich ein anderes zu öffnen.
- **Auto-Parken beim Schließen:** Wer ein Rezept mit laufendem Timer schließt, parkt es, statt den Timer zu
  verlieren. Vorschlag: ja.
- **Leiste im Rezeptdetail ohne Kochmodus und in der Festtafel-Detailansicht:** dort fehlt sie, weil es keine
  Bottom-Navigation gibt. Ob sie dort nötig ist, zeigt der Test am Gerät.
- **Neustart:** Soll die Sitzung einen Neustart der App überstehen (iOS beendet PWAs im Hintergrund)? Dann
  Sitzung in `localStorage`; die Timer haben schon `endTime`.
- **Querformat:** Der Kochmodus hat ein eigenes Querformat-Layout; wo die Leiste dort sitzt, ist offen.
- **Freigabe für andere Rollen:** wann und für wen, offen (der Schalter bleibt bis dahin aus).
- **Priorität** gegenüber dem Follow-Feature: offen.

## Wichtige Stellen im Code

- Kochmodus, Timer, Wake-Lock, Alarm: `src/components/RecipeDetail.js` (`cookingMode`, `startTimer`,
  `activeTimers`, Unmount-Effekt mit `clearInterval`), Layout `src/components/RecipeDetail.css`
  (Hochformat: `.cooking-mode-active:not(.cooking-mode-landscape)`)
- Kochsitzung (Timer, Alarm, Rezepte der Sitzung, Wechsel): `src/contexts/CookingSessionContext.js`; Sheet:
  `src/components/CookingAddRecipeSheet.js`; Leiste: `src/components/CookingSessionDock.js`; Alarm-Dialog:
  `src/components/CookingAlarmModal.js`
- Kochmodus-Lasche: `src/hooks/useCookingModeTabPosition.js`
- Rezeptdetail ein und aus: `src/App.js` (`selectedRecipe`, `handleSelectRecipe`)
- Bottom-Navigation: `src/components/BottomNavigation.js`
- Swipe und Rückgängig: `src/hooks/useSwipeToDelete.js`, `src/hooks/useUndoableDelete.js`,
  `src/components/UndoSnackbar.js`
- Rollen-Flags: `src/utils/userManagement.js`
- Festtafel: `src/components/MenuDetail.js` (`onSelectRecipe`); Kochdaten: `src/utils/recipeCookDates.js`
- Tests: `src/components/RecipeDetail.timer.test.js`, `src/components/RecipeDetail.cooking-mode-layout.test.js`,
  `src/components/RecipeDetail.parallelCooking.test.js`, `src/contexts/CookingSessionContext.test.js`,
  `src/components/CookingSessionDock.test.js`
