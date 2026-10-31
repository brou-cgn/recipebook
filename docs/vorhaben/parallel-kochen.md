# Vorhaben: Parallel kochen (mehrere Rezepte im Hintergrund, Mobile)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 31.10.2026 (PR 1 bis 7 gemergt; PR 8, Leiste unter dem Header, als Branch gepusht, noch ohne PR).

**Ziel:** Wer mehrere Gerichte gleichzeitig kocht (Beispiel im Entwurf: Rouladen, Rotkohl, Klöße), hält im
Kochmodus auf dem Handy mehrere Rezepte offen. Rezepte im Hintergrund laufen weiter, samt Timer, und sind mit
einem Tipp wieder vorn.

**Designentwürfe:** https://claude.ai/artifact/8wmH6AYfgzmnd68G6MB8AS (Leinwand „Rezepte im Hintergrund“:
V1–V3 Verschieben, H1–H3 Hervorholen). Gewählt: V3 und H1. Keine Mockups im Repo.

## Entschieden

| Thema | Entscheidung |
|---|---|
| Verschieben | V3 „Rezept dazunehmen“ (31.10.2026): „+ Rezept“ in der Titelzeile des Kochmodus (seit den Nacharbeiten nach dem Test am Gerät ein Icon-Knopf ohne Text, siehe unten) öffnet ein Bottom-Sheet „Was kochst du dazu?“ mit Suche und Vorschlägen. Das gewählte Rezept kommt im Kochmodus nach vorn, das bisherige parkt von selbst. Snackbar „<Rezept> läuft im Hintergrund weiter“ mit „Zurück“. |
| Hervorholen | H1 „Rezept-Leiste unten“ (31.10.2026): ein Chip je geparktem Rezept (Bild, Name, laufender Timer, sonst Schritt „4 / 5“), sortiert nach dem nächsten fälligen Timer, bald fällige hervorgehoben. Tippen tauscht mit dem Rezept vorn. Im Kochmodus unter dem Zutaten-Sheet (bis PR 4 wurde das Sheet um die Leistenhöhe kürzer, nach den Nacharbeiten gibt das Schritt-Karussell sie ab, siehe unten), außerhalb des Kochmodus direkt unter dem Header (seit PR 8; zuvor über der Bottom-Navigation, Entwurf V1, Bild 2). |
| Titelzeile | Der Kochmodus im Hochformat bekommt eine Zeile mit dem Rezeptnamen. Heute fehlt sie; mit mehreren Rezepten wäre sonst unklar, welches vorn ist. |
| Umfang | Nur Handy im Hochformat. Desktop und Tablet bleiben, wie sie sind. |
| Obergrenze | Vier Rezepte je Sitzung. Bei vier Rezepten zeigt das Sheet einen Hinweis statt der Liste (31.10.2026: Vorschlag mit dem Auftrag „PR 2 bitte“ übernommen, nicht ausdrücklich bestätigt). |
| Kochmodus beenden | Nimmt nur das Rezept vorn aus der Sitzung. Gibt es weitere, rückt das nächste fällige nach: abgelaufener Timer zuerst, dann der früheste laufende, sonst das zuletzt dazugenommene. Das letzte Rezept endet wie bisher (31.10.2026, übernommen wie die Obergrenze). |
| Flag | `parallelKochen` in `src/utils/userManagement.js` und in der Benutzerverwaltung, für alle Rollen aus (31.10.2026). Bleibt auch für Admins aus; freigeschaltet wird über Benutzerverwaltung → Rollenrechte, danach die App neu laden (Entscheidung 31.10.2026). |
| Wischen in der Leiste | Tippen holt ein Rezept nach vorn, Linksswipe nimmt es aus der Sitzung (mit „Rückgängig“). Kein Blättern per Wischen (31.10.2026, bestätigt). |
| Bald fällig | Ab fünf Minuten Restzeit wird der Chip orange, ein abgelaufener Timer zeigt „Fertig“, ebenfalls orange (31.10.2026: Vorschlag umgesetzt, nicht ausdrücklich bestätigt). |
| Leiste außerhalb des Kochmodus | Direkt unter dem Header der Hauptansicht (31.10.2026, nach dem Test am Gerät, PR 8), im Fluss: die Seite darunter rückt nach unten, scrollt aber mit dem Inhalt weg. Vorher (PR 3 bis 7) über der Bottom-Navigation (volle Leiste bzw. Pille), mit `--cooking-dock-space` als Platzhalter für Listen und Knöpfe; beides entfällt. Sichtbar bleibt sie dort, wo die Bottom-Navigation sichtbar ist; im Rezeptdetail ohne Kochmodus und in der Festtafel-Detailansicht gibt es sie weiter nicht. |
| Automatisch parken | Wer ein Rezept mit laufendem Timer verlässt (schließen, zurück, anderes Rezept), parkt es in der Sitzung, mit Snackbar „… läuft im Hintergrund“ und „Zurück“. Nicht, wenn man es vorher ausdrücklich herausgenommen hat (Kochmodus beenden, aus der Leiste gewischt) (31.10.2026, bestätigt). |
| Neustart | Die Sitzung übersteht einen Neustart der App: je Nutzer in `localStorage` (Rezept-IDs mit Schritt und Portionen, Timer mit Endzeitpunkt). Abgelaufene Timer melden sich beim Start. Bestätigt am 31.10.2026; meine Annahmen dabei: höchstens 12 Stunden alt, nur mit dem Flag. |
| „Fertig“ antippen | Öffnet das Rezept an dem Schritt mit dem abgelaufenen Timer statt am zuletzt offenen (31.10.2026). |
| Zuletzt gekocht | Erst nicht im Sheet (31.10.2026), weil `getAllCookDatesForUser` alle Kochdaten ohne `limit` liest (Tech-Check K3). Mit PR 5 eigene Abfrage `getRecentlyCookedRecipeIds` (`where` userId, `orderBy` date absteigend, `limit` 20) und Index in `firestore.indexes.json`. Das Sheet zeigt höchstens fünf, ohne das Rezept vorn, die Rezepte der Sitzung und was schon als Festtafel- oder verknüpfter Vorschlag dasteht. |
| Leiste ab 3 / 4 Rezepten | Container vollständig transparent, ohne Rahmen und Schatten (31.10.2026, nach dem Test am Gerät). Ab 3 Rezepten in der Leiste nur noch „x / y“ (kein Titel, kein „Schritt“; Timer und „Fertig“ bleiben sichtbar), ab 4 nur noch der Bild-Kreis (urgent bleibt orange). Meine Annahme: Timer-Anzeige bei 3 bleibt, weil sie wichtiger ist als der Schritt. Im Kochmodus erreicht die Leiste höchstens 3 Chips (das vordere Rezept zählt nicht), die Bild-Stufe also nur außerhalb. |
| Farben der Leiste | Im App-Hintergrund statt Braun, in Light und Dark (31.10.2026, nach dem Test am Gerät): Leiste `--color-bg`, Chips heller als die Leiste (`--color-surface`: Light weiß, Dark #2a2a2a), ohne Rahmen (31.10.2026, nach dem Test am Gerät; vorher `--color-surface-card` mit Rand `--color-border-subtle`), Text `--color-text-strong` bzw. `--color-text-muted`; bald fällig bleibt orange (`--color-accent`). Die braunen Leisten-Tokens sind entfernt. |
| Höhen im Kochmodus mit Leiste | Die Leiste geht vom Schritt-Karussell ab, nicht von den Zutaten (31.10.2026, nach dem Test am Gerät): Das Zutaten-Sheet behält dieselbe Listenhöhe wie ohne Leiste, das Karussell wird um die Leistenhöhe kürzer, die Schrift der Schrittkarten dafür kleiner (`clamp(1.25rem, 3.1dvh, 1.6rem)` statt `clamp(1.4rem, 3.6dvh, 1.9rem)`). Gilt nur, solange die Leiste sichtbar ist. Meine Annahme: die ganze Leistenhöhe vom Karussell, nicht nur ein Teil. |
| Knopf „Rezept dazunehmen“ | Ohne Text, mit eigenem einrichtbarem Icon (31.10.2026): Button-Icon `cookingAddRecipe` mit Dunkelmodus-Variante (Verwaltung: Button-Icons, Gruppe Kochmodus, „Kochmodus: Rezept dazunehmen“). Standard-Symbol: dampfender Topf mit Plus-Badge im Stil des Folgen-Icons. `aria-label` und Tooltip „Weiteres Rezept dazunehmen“. Formatierung und Animation wie die FAB-Buttons (31.10.2026, nach dem Test am Gerät; PR 7): rund, Fläche, Rand und Schatten wie `.edit-fab-button`, mobil 56 × 56 px und leicht durchscheinend (Opazität 0,85), 44 × 44 px darüber; beim Drücken wächst er um 15 % mit größerem Schatten und federndem Übergang. Wie die FABs bleibt er unsichtbar, bis die Button-Icons geladen sind. Bis PR 6 war es ein 44-px-Knopf mit getönter Fläche und braunem Rand. |

Vorgaben aus `AGENTS.md`, die hier greifen: Entfernen eines Rezepts aus der Leiste per Linksswipe
(`useSwipeToDelete`) mit „Rückgängig“ (`useUndoableDelete`), kein ×. Farben nur über Tokens: Leiste und Chips
nutzen die App-Tokens aus `src/tokens.css` (seit den Nacharbeiten, vorher eigene braune Tokens), „bald fällig“ `--color-accent`. Die Suche im
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
| 3 | Rezept-Leiste `CookingSessionDock` (H1): im Kochmodus unter dem Zutaten-Sheet, außerhalb über der Bottom-Navigation (volle Leiste und Pille). Chips nach Dringlichkeit; bald fällige und abgelaufene („Fertig“) orange; Tippen tauscht (das Rezept vorn parkt), Linksswipe entfernt mit „Rückgängig“. Farben als Tokens. Weiter hinter dem Flag. Erster Commit `feat:`. Tests +12; `test:ci` 189 Suites, 3.912 Tests | PR #3569 gemergt (31.10.2026, v2.28.0), Deploy-Lauf 1944 erfolgreich; am Gerät nicht geprüft |
| 4 | Sitzung übersteht einen Neustart (`localStorage` je Nutzer, höchstens 12 Stunden, nur mit Flag; abgelaufene Timer melden sich beim Start; beim ersten Tippen danach wird der Ton wieder freigeschaltet). Rezept mit laufendem Timer parkt beim Verlassen automatisch. Tippen auf „Fertig“ öffnet den Schritt mit dem abgelaufenen Timer. Erster Commit `feat:`. Tests +11; `test:ci` 189 Suites, 3.923 Tests | PR #3570 gemergt (31.10.2026, v2.29.0), Deploy-Lauf 1945 erfolgreich; am Gerät nicht geprüft |
| 5 | „Zuletzt gekocht“ im Sheet: begrenzte Abfrage `getRecentlyCookedRecipeIds` samt Index, Abschnitt unter Festtafel und verknüpften Rezepten. Erster Commit `feat:`. Tests +6; `test:ci` 191 Suites, 3.929 Tests | PR #3571 gemergt (31.10.2026, v2.31.0), Deploy-Lauf 1947 erfolgreich; am Gerät nicht geprüft |
| 6 | Nacharbeiten nach dem Test am Gerät: Leiste im App-Hintergrund statt Braun (Light und Dark), mit Leiste behält das Zutaten-Sheet seine Höhe und das Schritt-Karussell gibt sie ab (Schrift dort kleiner), Knopf „Rezept dazunehmen“ ohne Text mit eigenem einrichtbarem Button-Icon `cookingAddRecipe`. Weiter hinter dem Flag. Tests +9 (eine Suite neu); `test:ci` 190 Suites, 3.932 Tests | PR #3572 gemergt (31.10.2026, v2.30.0), Deploy-Lauf 1946 erfolgreich; im Browser (Chromium, 390 × 844) geprüft, am Gerät nicht |
| 7 | Nacharbeit zu PR 6: Knopf „Rezept dazunehmen“ in Formatierung und Animation wie die FAB-Buttons (rund mit Rand und Schatten, mobil 56 px, federndes Wachsen beim Drücken), als eigener Baustein `CookingAddRecipeButton`. Weiter hinter dem Flag. Erster Commit `fix:`. Tests +13 (zwei Suiten neu); `test:ci` 194 Suites, 3.951 Tests | Branch `claude/parallel-kochen-pr7` gepusht, noch kein PR (31.10.2026); im Browser (Chromium, 390 × 844) geprüft, am Gerät nicht |
| 8 | Leiste außerhalb des Kochmodus nach oben: `placement="top"` direkt unter dem Header statt fest über der Bottom-Navigation; `--cooking-dock-space` samt Anteilen in `App.css` entfällt. Weiter hinter dem Flag. Tests: zwei in `CookingSessionDock.test.js` angepasst | Branch `claude/parallel-kochen-dock-oben`, noch kein PR (31.10.2026); am Gerät nicht geprüft |

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

Umsetzungsnotizen PR 4: `App.js` gibt dem Provider `persistForUserId` (nur mit Flag, nicht für Gäste) und die
sichtbaren `recipes`. Gespeichert wird unter `cookingSession_<uid>`: die Rezepte als ID mit Schritt und Portionen,
die Timer ohne Restzeit (die folgt aus `endTime`), dazu `savedAt`. Geschrieben wird nur, wenn sich Rezepte,
Schritte oder Timer ändern, nicht bei jeder Sekunde. Beim Start werden die Timer sofort eingesetzt und abgeglichen
(abgelaufene klingeln), die Rezepte erst, sobald die Rezeptliste sie kennt; bis dahin bleiben sie gespeichert.
Älter als 12 Stunden: verworfen. Ein anderer Nutzer auf demselben Gerät beginnt mit leerer Sitzung, die des
vorigen bleibt in dessen Speicher. iOS lässt Ton nur nach einer Geste zu: Nach dem Start legt das erste Tippen
(`touchend`/`click`) den `AudioContext` an, solange ein Timer läuft; vorher bleibt ein Alarm stumm, der Dialog
kommt trotzdem. Automatisch parken: `RecipeDetail` merkt sich je Rezept den letzten Zustand und ruft beim
Verlassen (Cleanup bei Rezeptwechsel oder Unmount) `parkIfTimerRunning`. Die Sitzung merkt sich, welche Rezepte
ausdrücklich herausgenommen wurden (`leaveSession`, `removeFromSession`); diese parken nicht wieder von selbst,
bis man sie erneut dazunimmt. „Fertig“: `switchTo` und `swapWith` setzen den Schritt auf den frühesten mit
abgelaufenem Timer, bevor das Rezept öffnet. `RecipeDetail.js` 2.934 → 2.948 Zeilen, `useState` unverändert 77.
Tests: +9 in `src/contexts/CookingSessionContext.test.js`, +2 in
`src/components/RecipeDetail.parallelCooking.test.js`. Nicht am Gerät geprüft, vor allem nicht das Verhalten der
iOS-PWA nach einem Neustart.

Umsetzungsnotizen PR 5: `getRecentlyCookedRecipeIds` in `src/utils/recipeCookDates.js` liest höchstens 20
Kochdaten des Nutzers, neueste zuerst, und gibt jede Rezept-ID einmal zurück. Dafür gibt es einen neuen Index auf
`cookDates` (userId aufsteigend, date absteigend); er wird beim Deploy angelegt und braucht danach einige
Minuten, bis er aufgebaut ist. Bis dahin schlägt die Abfrage fehl, das Sheet zeigt den Abschnitt dann einfach
nicht. Geladen wird erst, wenn das Sheet aufgeht. Die Regeln erlauben das Lesen der Kochdaten schon (Mitglieder),
es gibt keine neue Collection. Am Tech-Check K3 ändert das nichts: `getAllCookDatesForUser` liest weiter ohne
`limit`. Tests: +3 in `src/utils/recipeCookDates.test.js`, +3 in
`src/components/CookingAddRecipeSheet.test.js`. Nicht am Gerät geprüft.
Umsetzungsnotizen zu den Nacharbeiten (PR #3572): Die Leiste (`CookingSessionDock.css`) nutzt nur noch allgemeine Tokens; `--color-cooking-dock`,
`--color-cooking-dock-chip`, `--color-on-cooking-dock` und `--color-cooking-dock-muted` sind aus `tokens.css` entfernt
(`--color-on-accent` bleibt für die orangen Chips). Im Kochmodus trennt eine feine Linie (`--color-border-subtle`) die Leiste
vom Zutaten-Sheet; außerhalb hebt sie sich mit Rand und weicherem Schatten von der Seite ab, weil sie jetzt dieselbe Farbe
wie der Seitenhintergrund hat. Der weiße Ring um die Vorschaubilder entfällt. Höhen: Mit Leiste ist das Sheet
`calc(min(34dvh, 280px) - env(safe-area-inset-bottom))` hoch, Innenabstand unten 1rem: genau die Listenhöhe ohne Leiste,
denn den Abstand zur Home-Leiste übernimmt die Leiste. Das Karussell (`flex: 1`) wird damit um die Leistenhöhe (73 px) kürzer.
Gemessen in Chromium bei 390 × 844 (ohne safe-area): Karussell 464 → 391 px, Zutaten-Sheet 208 → 280 px, Schrift 30,4 → 25,6 px;
ein langer erster Schritt (rund 160 Zeichen) passte vorher nicht in die Karte, jetzt schon. Icon: neuer Schlüssel in
`DARK_MODE_ICON_ROWS` und in der Standardgruppe Kochmodus (`src/utils/buttonIconRows.js`), Standard `defaultIcon('potPlus')` in
`DEFAULT_BUTTON_ICONS` (Dunkelmodus-Variante über `DEFAULT_ICON_NAMES`). Wer die Gruppen der Button-Icons schon gespeichert
hat, findet die neue Zeile unter „Sonstiges“ (`reconcileButtonIconGroups`) und kann sie in die Gruppe Kochmodus ziehen.
`RecipeDetail` leitet das Icon aus den geladenen Button-Icons ab, ohne eigenen State, und blendet es bis zum Laden aus wie die
anderen einrichtbaren Icons. `RecipeDetail.js` 2.948 → 2.955 Zeilen, `useState` unverändert 77. Tests: +2 in
`src/components/RecipeDetail.parallelCooking.test.js` (Knopf ohne Text mit Standard-Icon; eingerichtetes Icon), +3 in
`src/utils/defaultButtonIcons.test.js` (Symbol in Light und Dark, Standardwerte, Zeile in der Gruppe Kochmodus), +2 in
`src/components/RecipeDetail.css.test.js` (Sheet-Höhe und kleinere Schrift mit Leiste), +2 in der neuen
`src/components/CookingSessionDock.css.test.js` (App-Hintergrund; nur Tokens, die es in Light und Dark gibt). Geprüft per
Screenshot des echten DOM mit dem echten CSS (Chromium, Light und Dark, vorher und nachher), nicht am Gerät.

Umsetzungsnotizen PR 7 (Knopf im FAB-Look): Der Wunsch kam nach dem Merge von PR #3572, der Commit dazu lag erst danach auf
dem Branch und kam deshalb nicht in `main`; er läuft als eigener PR auf der aktuellen `main`. Der Knopf ist ein eigener Baustein
(`src/components/CookingAddRecipeButton.js` mit `CookingAddRecipeButton.css`); `RecipeDetail` rendert nur noch
`<CookingAddRecipeButton icon loaded onClick />`. Der Druckzustand (Klasse `pressed` über Touch- und Maus-Ereignisse wie bei den
FABs) liegt im Baustein, nicht in `RecipeDetail` (Tech-Check A1): `useState` in `RecipeDetail.js` unverändert 77. Die Werte der
FABs sind nicht geteilt, sondern nachgebaut: `.edit-fab-button` und die anderen FABs in `RecipeDetail.css` bzw.
`DeleteFabButton.css` wiederholen jeweils den ganzen Block. Der Knopf nutzt dafür die Tokens, die den FAB-Werten entsprechen
(`--color-surface`, `--color-text`, `--color-border`, wie `.kueche-fab-button`); `CookingAddRecipeButton.css.test.js` hält Form,
Schatten, Übergang, Druck-Animation, mobile Größe und die Farben in Light und Dark gegen `.edit-fab-button` und `darkMode.css`
gleich (Gegenprobe: vier absichtliche Abweichungen schlagen fehl). Im Browser gemessen (Chromium, 390 × 844, Light und Dark):
Größe, Fläche, Rand, Schatten, Opazität, Übergang und der gedrückte Zustand (64 × 64 px, `scale(1.15)`, größerer Schatten)
stimmen mit dem echten Edit-FAB überein. Folge: Die Titelzeile ist mobil 12 px höher als mit dem 44-px-Knopf, das
Schritt-Karussell entsprechend kürzer. Der Knopf ist erst sichtbar, wenn die Button-Icons geladen sind; die Tests in
`RecipeDetail.parallelCooking.test.js` warten dafür in `enterCookingMode()`. Tests: +6 in
`src/components/CookingAddRecipeButton.test.js` (Icon ohne Text, Text-Icon, unsichtbar bis geladen, Klick, Druck-Animation mit
Maus und Touch), +7 in `src/components/CookingAddRecipeButton.css.test.js`. Nicht am Gerät geprüft.

## Offen

- **Leiste unter dem Header scrollt weg** (PR 8): Sie sitzt im Fluss, nicht sticky. Bei langen Listen ist ein ablaufender Timer dann erst nach dem Hochscrollen sichtbar (der Alarm-Dialog kommt trotzdem). Sticky unter dem Header wäre die Alternative; Höhe des Headers und sein Ausblenden beim Scrollen (`headerVisible`) müssten dann zusammenpassen.

- **Parken ohne neues Rezept** (V2, Parken-Knopf in der Lasche): nicht gewählt. Wird nötig, wenn man ein Rezept
  parken will, ohne gleich ein anderes zu öffnen.
- **Leiste im Rezeptdetail ohne Kochmodus und in der Festtafel-Detailansicht:** dort fehlt sie, weil es keine
  Bottom-Navigation gibt. Ob sie dort nötig ist, zeigt der Test am Gerät.
- **Querformat:** Der Kochmodus hat ein eigenes Querformat-Layout; wo die Leiste dort sitzt, ist offen.
- **Leiste mit drei oder vier Chips:** Name und Schritt passen nicht in die Chips. „Schritt 1 / 3“ bricht in bis zu drei
  Zeilen um und ragt aus dem Chip, Namen werden zu „K…“ (im Screenshot mit vier Rezepten gesehen, schon vor PR 5). Lösung
  offen, zum Beispiel ab drei Chips nur Bild und Status, kürzerer Status („1/3“) oder waagerecht scrollen.
- **Aufteilung der Höhe mit Leiste** (Nacharbeiten, PR #3572): Annahme, dass die ganze Leistenhöhe vom Karussell kommt. Ob die Schritte so noch
  gut lesbar sind, zeigt der Test am Gerät. Der 56-px-Knopf in der Titelzeile (PR 7, wie die FABs) macht die Zeile mobil 12 px
  höher; wird das Karussell zu knapp, wäre der 44-px-Knopf die Alternative.
- **FAB-Formatierung ist mehrfach kopiert:** Jeder FAB wiederholt den ganzen Block (`RecipeDetail.css` dreimal,
  `DeleteFabButton.css`, `Kueche.css` und weitere); der Knopf in der Titelzeile ist nur ein weiterer Nachbau, durch einen
  Test gegen `.edit-fab-button` abgesichert. Ein gemeinsamer Baustein wäre eine eigene Aufräumarbeit, nicht Teil dieses Vorhabens.
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
- Knopf „Rezept dazunehmen“ (Titelzeile im Kochmodus, FAB-Look): `src/components/CookingAddRecipeButton.js` und `.css`
- Einrichtbare Icons (Knopf „Rezept dazunehmen“, `cookingAddRecipe`): `src/utils/buttonIconRows.js` (Zeile und Gruppe),
  `src/utils/defaultButtonIcons.js` (Standard-Symbol), `src/utils/customLists.js` (`DEFAULT_BUTTON_ICONS`)
- Festtafel: `src/components/MenuDetail.js` (`onSelectRecipe`); Kochdaten: `src/utils/recipeCookDates.js`
  (`getRecentlyCookedRecipeIds`, Index in `firestore.indexes.json`)
- Tests: `src/components/RecipeDetail.timer.test.js`, `src/components/RecipeDetail.cooking-mode-layout.test.js`,
  `src/components/RecipeDetail.parallelCooking.test.js`, `src/contexts/CookingSessionContext.test.js`,
  `src/components/CookingSessionDock.test.js`, `src/components/CookingAddRecipeSheet.test.js`,
  `src/components/CookingSessionDock.css.test.js`, `src/components/RecipeDetail.css.test.js`,
  `src/utils/recipeCookDates.test.js`, `src/components/CookingAddRecipeButton.test.js`,
  `src/components/CookingAddRecipeButton.css.test.js`
