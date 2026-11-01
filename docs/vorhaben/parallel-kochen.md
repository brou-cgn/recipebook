# Vorhaben: Parallel kochen (mehrere Rezepte im Hintergrund, Mobile)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 01.11.2026 (PR 13, Schiene im Querformat gegenüber der Kamera, als Branch gepusht, noch ohne PR; PR 1 bis 12 und die Nacharbeiten gemergt, zuletzt #3587 iPad quer, #3589 Leiste nur auf der Startseite und #3590 Abgleich zwischen Geräten).

**Ziel:** Wer mehrere Gerichte gleichzeitig kocht (Beispiel im Entwurf: Rouladen, Rotkohl, Klöße), hält im
Kochmodus auf dem Handy mehrere Rezepte offen. Rezepte im Hintergrund laufen weiter, samt Timer, und sind mit
einem Tipp wieder vorn.

**Designentwürfe:** https://claude.ai/artifact/8wmH6AYfgzmnd68G6MB8AS (Leinwand „Rezepte im Hintergrund“:
V1–V3 Verschieben, H1–H3 Hervorholen). Gewählt: V3 und H1. Querformat:
https://claude.ai/artifact/RCFKcbQusTJ5XK1HNQrxb7 (Leinwand „Multikochmodus Querformat“: Q1 Leiste in der
Zutatenspalte, Q2 Rezept-Schiene, Q3 Fokus plus Übersicht „Am Herd“). Gewählt: Q2. iPad: https://claude.ai/artifact/BUW6R4mVkVbRZGYXfq8xwf (Leinwand
„Multikochmodus iPad“: I1 Schiene mit Namen, I2 zwei Rezepte nebeneinander, I3 Reiter oben, I4 Karussell links).
Gewählt: I4 für das Querformat. Keine Mockups im Repo.

## Entschieden

| Thema | Entscheidung |
|---|---|
| Verschieben | V3 „Rezept dazunehmen“ (31.10.2026): „+ Rezept“ in der Titelzeile des Kochmodus (seit den Nacharbeiten nach dem Test am Gerät ein Icon-Knopf ohne Text, siehe unten) öffnet ein Bottom-Sheet „Was kochst du dazu?“ mit Suche und Vorschlägen. Das gewählte Rezept kommt im Kochmodus nach vorn, das bisherige parkt von selbst. Snackbar „<Rezept> läuft im Hintergrund weiter“ mit „Zurück“. |
| Hervorholen | H1 „Rezept-Leiste unten“ (31.10.2026): ein Chip je geparktem Rezept (Bild, Name, laufender Timer, sonst Schritt „4 / 5“), sortiert nach dem nächsten fälligen Timer, bald fällige hervorgehoben. Tippen tauscht mit dem Rezept vorn. Im Kochmodus unter dem Zutaten-Sheet (bis PR 4 wurde das Sheet um die Leistenhöhe kürzer, nach den Nacharbeiten gibt das Schritt-Karussell sie ab, siehe unten), außerhalb des Kochmodus direkt unter dem Header (seit PR 8; zuvor über der Bottom-Navigation, Entwurf V1, Bild 2). |
| Titelzeile | Der Kochmodus im Hochformat bekommt eine Zeile mit dem Rezeptnamen. Heute fehlt sie; mit mehreren Rezepten wäre sonst unklar, welches vorn ist. |
| Umfang | Handy im Hochformat, seit 01.11.2026 (PR 9) auch im Querformat, seit PR 10 das iPad im Querformat (Entwurf I4). Desktop und iPad hochkant bleiben, wie sie sind. |
| Obergrenze | Sechs Rezepte je Sitzung (`MAX_SESSION_RECIPES`). Bei sechs Rezepten zeigt das Sheet einen Hinweis statt der Liste. Ursprünglich vier (31.10.2026: Vorschlag mit dem Auftrag „PR 2 bitte“ übernommen, nicht ausdrücklich bestätigt); am 31.10.2026 auf ausdrücklichen Wunsch auf sechs erhöht. Die Bild-Stufe der Leiste (ab 4 Chips, 52-px-Kreise) bricht jetzt bei Platzmangel in eine zweite Zeile um (`flex-wrap`); am Gerät nicht geprüft. |
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
| Farben der Leiste | Im App-Hintergrund statt Braun, in Light und Dark (31.10.2026, nach dem Test am Gerät): Leiste `--color-bg`, Chips ohne eigene Fläche und ohne Rahmen, nur Bild und Text auf dem App-Hintergrund (31.10.2026, nach dem Test am Gerät; vorher Karten mit `--color-surface-card` und Rand, kurz `--color-surface`, was falsch verstanden war); nur „bald fällig“ behält die orange Fläche, Text `--color-text-strong` bzw. `--color-text-muted`; bald fällig bleibt orange (`--color-accent`). Die braunen Leisten-Tokens sind entfernt. |
| Höhen im Kochmodus mit Leiste | Die Leiste geht vom Schritt-Karussell ab, nicht von den Zutaten (31.10.2026, nach dem Test am Gerät): Das Zutaten-Sheet behält dieselbe Listenhöhe wie ohne Leiste, das Karussell wird um die Leistenhöhe kürzer, die Schrift der Schrittkarten dafür kleiner (`clamp(1.25rem, 3.1dvh, 1.6rem)` statt `clamp(1.4rem, 3.6dvh, 1.9rem)`). Gilt nur, solange die Leiste sichtbar ist. Meine Annahme: die ganze Leistenhöhe vom Karussell, nicht nur ein Teil. |
| Knopf „Rezept dazunehmen“ | Ohne Text, mit eigenem einrichtbarem Icon (31.10.2026): Button-Icon `cookingAddRecipe` mit Dunkelmodus-Variante (Verwaltung: Button-Icons, Gruppe Kochmodus, „Kochmodus: Rezept dazunehmen“). Standard-Symbol: dampfender Topf mit Plus-Badge im Stil des Folgen-Icons. `aria-label` und Tooltip „Weiteres Rezept dazunehmen“. Formatierung und Animation wie die FAB-Buttons (31.10.2026, nach dem Test am Gerät; PR 7): rund, Fläche, Rand und Schatten wie `.edit-fab-button`, mobil 56 × 56 px und leicht durchscheinend (Opazität 0,85), 44 × 44 px darüber; beim Drücken wächst er um 15 % mit größerem Schatten und federndem Übergang. Wie die FABs bleibt er unsichtbar, bis die Button-Icons geladen sind. Bis PR 6 war es ein 44-px-Knopf mit getönter Fläche und braunem Rand. |
| Overlay-Verhalten | Das Sheet „Was kochst du dazu?“ verhält sich wie das Einkaufslisten-Overlay (31.10.2026, auf Wunsch): Hintergrund mit `blur(8px)` statt Abdunklung, Ein- und Ausblenden über `useFadeOutClose`, Seite dahinter gesperrt über `useModalScrollLock` (nur der Listenbereich im Dialog scrollt). Gilt ebenso für die Portionsauswahl „Portionen für Einkaufsliste“ (Rezept, Festtafel, Gruppe, Event-Verbrauch). |
| Querformat | Q2 „Rezept-Schiene“ (01.11.2026, Auftrag „Setze Q2 um“): Statt Leiste und Titelzeile eine 76 px schmale Spalte am Rand (bis PR 12 fest links, seit PR 13 gegenüber der Kamera, siehe unten) mit allen Rezepten der Sitzung (Bild, darunter Timer, „Fertig“ oder Schritt „4 / 7“), unten „+“ für das Sheet. Der Rezeptname steht über den Zutaten. Tippen tauscht wie in der Leiste, Linksswipe nimmt ein geparktes Rezept heraus (mit „Rückgängig“). Die Zutatenspalte wird schmaler (34 %, höchstens 300 px), die Schrittspalte gibt den Rest ab. |
| Schiene: Abweichungen von der Leiste | Das Rezept vorn steht mit in der Schiene, als Lasche in der Farbe der Zutatenspalte und ohne Swipe. Die Reihenfolge bleibt fest, wie die Sitzung sie führt, statt nach dem nächsten Timer zu sortieren; sonst sprängen die Kreise, sobald ein Timer startet. Ein Rezept vorn, das noch nicht in der Sitzung ist, steht am Ende; dort parkt es beim Tauschen. Im Entwurf vorgeschlagen, mit dem Auftrag übernommen, nicht ausdrücklich bestätigt. |
| iPad quer | I4 „Karussell links“ (01.11.2026, Auftrag „Setze I4 um“): zwei Spalten über den ganzen Bildschirm. Rechts der Kochmodus wie im Hochformat auf dem iPhone (Titelzeile mit „+“, Fortschritt, Schritt-Karussell, Zutaten-Sheet, Lasche „Kochmodus“), links ein senkrechtes Karussell mit den weiteren Rezepten der Sitzung. Jede Karte zeigt Bild, Name, „Schritt x von y“, Timer und den Text des Schritts, an dem das Rezept steht. Die Leiste entfällt dort, der App-Header blendet aus. Tippen holt ein Rezept nach rechts, Linksswipe nimmt es heraus (mit „Rückgängig“). |
| Karussell: Details | Im Entwurf vorgeschlagen, mit dem Auftrag übernommen, nicht ausdrücklich bestätigt (01.11.2026): Tausch an Ort und Stelle (das Rezept vorn übernimmt den Platz der angetippten Karte, die übrigen bleiben stehen; `swapWith` mit `inPlace`), sonst feste Reihenfolge wie in der Schiene. Bis zu zwei Karten teilen sich die Höhe (Schritt bis sechs Zeilen), ab drei werden sie kompakt (drei Zeilen; drei Karten ganz, die vierte schaut heraus). Liegt ein bald fälliges oder fertiges Rezept außerhalb des sichtbaren Bereichs, zeigt eine orange Pille am Rand, wo es liegt; Tippen scrollt hin. Zutaten im Sheet zweispaltig. Breite der linken Spalte `clamp(360px, 43vw, 560px)` (im Entwurf 520 von 1194 px). |
| iPad quer mit nur einem Rezept | Zwei Spalten schon ab dem ersten Rezept; links steht dann „Noch kein weiteres Rezept am Herd“ mit „Rezept dazunehmen“ (01.11.2026, nicht bestätigt). Abweichung von meiner Empfehlung im Entwurfsgespräch (bis zum zweiten Rezept „das normale Querformat“): Beim Umsetzen gesehen, dass das iPad gar kein eigenes Querformat-Layout hat (`cooking-mode-landscape` greift nur bis 480 px Höhe) und dort bisher auch keinen Kochmodus-Knopf. Nebeneffekt: Nichts springt, wenn das zweite Rezept dazukommt oder das letzte geht. |
| Einstieg auf dem iPad quer | Mit dem Flag zeigt das Rezeptbild auf dem iPad quer den Kochmodus-Knopf (bisher nur bis 768 px Breite); ohne den Zurück-Knopf auf dem Bild, Schließen steht dort in der Kopfzeile (01.11.2026). Ohne Einstieg wäre I4 nicht erreichbar. Tech-Check M12 (neu, teilweise). |
| Erkennung iPad quer | `src/hooks/useTabletLandscape.js`: Touch-Bildschirm (`pointer: coarse`, ohne `matchMedia` `maxTouchPoints` > 1), breiter als hoch, mindestens 900 × 481 px; folgt dem Drehen. Desktop-Browser zählen nicht, auch nicht in einem breiten Fenster (Maus oder Trackpad). Meine Annahme: Ein iPad mit Magic Keyboard meldet weiter `pointer: coarse`; nicht geprüft. |
| Abgleich zwischen Geräten | Auftrag 01.11.2026: Rezepte der Sitzung, aktives Rezept und Schritt je Rezept gleich auf allen Geräten des Nutzers. Umsetzung (meine Annahmen, nicht bestätigt): ein Firestore-Dokument `cookingSessions/{uid}` (`recipes` mit ID und Schritt, `activeRecipeId`, `deviceId`, `updatedAt`), Live-Abo, Schreiben gebündelt nach 600 ms und erst nach dem ersten Abruf. Zuletzt geschrieben gewinnt, das Dokument gilt als Ganzes; eigenes Echo wird über die Geräte-Kennung ignoriert. Nur mit dem Flag und für Mitglieder. `localStorage` bleibt als Zwischenspeicher für Timer und für den Start ohne Netz. |
| Abgleich: was nicht | Timer und Portionen bleiben je Gerät (Timer laufen dort, wo sie gestartet wurden, der Alarm kommt per Push auf dieses Gerät; Portionen waren nicht verlangt). Rezept dort entfernt heißt hier entfernt, die Timer laufen weiter. |
| Abgleich: Rezept vorn | Wechselt auf Gerät A das Rezept vorn, wechselt Gerät B mit, aber nur, wenn B gerade selbst ein Rezept im Kochmodus vorn hat. Ein Gerät ohne offenes Rezept (z. B. Handy in der Tasche) wird nicht in den Kochmodus gezogen, merkt sich das aktive Rezept aber. Schaltet A den Schritt weiter, zieht B den Schritt des offenen Rezepts nach. Entscheidung 01.11.2026, Vorschlag mit dem Auftrag übernommen, nicht ausdrücklich bestätigt. |
| Schiene: Details | Meine Annahmen (01.11.2026): Mit dem Flag ist die Schiene im Querformat immer da, auch mit nur einem Rezept, sonst gäbe es dort kein „+“. Ohne Rezeptbild zeigt der Kreis den Anfangsbuchstaben. Bald fällig und „Fertig“ orange wie in der Leiste. Bis PR 12: 44-px-Kreise, ab vier Rezepten 30 px, „+“ 44 px; seit PR 13 überholt (Kreise und „+“ 56 px, Karussell, siehe unten). iOS lässt quer ohne `viewport-fit=cover` links und rechts je 59 px frei (im Screenshot vom Gerät zu sehen; die Seite ist dann 734 px breit). |
| Schiene gegenüber der Kamera | Auftrag 01.11.2026: Die Schiene steht immer auf der Seite gegenüber der Kamera-Pille (Dynamic Island), je nach Drehrichtung, und dafür enger am Displayrand. Erkennung `useLandscapeCameraSide`: `window.orientation` 90 heißt nach links gedreht (Home-Taste rechts, Apple-Beispielcode), die Kamera ist dann links und die Schiene rechts; -90 umgekehrt. Ohne `window.orientation` der Winkel aus `screen.orientation` wie auf Android (Safari zählt ihn laut WebKit-Bug 254863 andersherum, deshalb nachrangig). Folgt auch der halben Drehung von quer nach quer. Meine Annahmen: Ist die Richtung unbekannt (Desktop), bleibt die Schiene links und innerhalb der Abstände. Nur die Schiene wandert, Zutaten bleiben links, Schritte rechts (nicht gespiegelt). Rechts ist die Lasche des Rezepts vorn zur Schrittspalte hin gerade und hat weiter die Farbe der Zutatenspalte; sie geht dort nicht über, weil die Schrittspalte fast die Farbe der Schiene hat (Dark: gleich). Am Gerät nicht geprüft. |
| Bis an den Displayrand | `viewport-fit=cover` nur, solange die Schiene da ist und die Richtung bekannt (`useViewportFitCover`, schaltet den meta viewport zur Laufzeit; danach gilt wieder der alte Inhalt). Global wäre zu riskant: Die übrigen Seiten rechnen nicht mit den Abständen. Die Schiene nutzt den Abstand auf ihrer Seite (Kreise 13 px vom Displayrand, vorher 78 px), Zutaten bzw. Schritte halten ihn auf der Kameraseite frei, beide unten die Home-Leiste. Die Zutatenspalte wird mit der Schiene rechts um den Abstand breiter, damit beide Seiten gleich aussehen. Das Sheet „Was kochst du dazu?“ hält links und rechts die Abstände frei. Der Zoom-Reset nach dem Drehen in `index.html` nimmt nur noch seinen eigenen Zusatz zurück, statt den alten Inhalt wiederherzustellen (hätte `viewport-fit=cover` überschrieben). Offen: Ob iOS das Umschalten zur Laufzeit übernimmt, ist nicht am Gerät geprüft; greift es nicht, bleibt alles wie bisher innerhalb der Abstände, nur die Seite wechselt. |
| Kreise wie FABs, Karussell | Auftrag 01.11.2026: Kreise so groß wie die FAB-Buttons (56 px), passen nicht alle in die Höhe, Karussell. Umsetzung: Kreise und „+“ 56 px (FAB-Größe mobil, „+“ deckend), keine kleinere Stufe mehr. Die Liste scrollt senkrecht und rastet je Rezept ein, „+“ bleibt darunter stehen; iPhone 15 quer: drei Rezepte ganz, das vierte schaut heraus, bis drei ohne Scrollen. Meine Ergänzungen, nicht verlangt: Das Rezept vorn bleibt im Blick (beim Einblenden und wenn ein anderes nach vorn kommt, ein dazugenommenes steht am Ende). Liegt ein fälliges Rezept außer Sicht, zeigt ein oranger Hinweis am Rand der Liste, wo es liegt (Pfeil und „Fertig“ bzw. Restzeit), Tippen scrollt hin; wie die Pille im Karussell auf dem iPad, dieselbe Logik (`useOffscreenItems`, `pickJumpTarget`). Nur die Größe wie die FABs, nicht deren Schatten und Druck-Animation. |

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
| 7 | Nacharbeit zu PR 6: Knopf „Rezept dazunehmen“ in Formatierung und Animation wie die FAB-Buttons (rund mit Rand und Schatten, mobil 56 px, federndes Wachsen beim Drücken), als eigener Baustein `CookingAddRecipeButton`. Weiter hinter dem Flag. Erster Commit `fix:`. Tests +13 (zwei Suiten neu); `test:ci` 194 Suites, 3.951 Tests | PR #3573 gemergt (31.10.2026); im Browser (Chromium, 390 × 844) geprüft, am Gerät nicht |
| 8 | Leiste außerhalb des Kochmodus nach oben: `placement="top"` direkt unter dem Header statt fest über der Bottom-Navigation; `--cooking-dock-space` samt Anteilen in `App.css` entfällt. Weiter hinter dem Flag. Tests: zwei in `CookingSessionDock.test.js` angepasst | PR #3575 gemergt (31.10.2026); am Gerät nicht geprüft |
| – | Nacharbeiten nach dem Test am Gerät, je ein kleiner PR: Sheet ohne Fokusrahmen (#3574); Leiste ab 3 Rezepten nur „x / y“, ab 4 nur der Bild-Kreis (#3576); Chips erst heller, dann ohne Fläche (#3577, #3578); dünnerer orange Ring in der Bild-Stufe (#3579); Obergrenze sechs (#3580); Overlay wie die Einkaufsliste (#3581). Entscheidungen siehe oben | gemergt (31.10.2026) |
| 9 | Querformat (Entwurf Q2): Rezept-Schiene `CookingSessionRail` am linken Rand statt Leiste und Titelzeile, Rezeptname über den Zutaten; die Status-Anzeige von Leiste und Schiene liegt gemeinsam in `src/utils/cookingSessionStatus.js`. Dazu ein Fehler der Leiste behoben: Nach dem Linksswipe blieb die Fläche zum Entfernen unsichtbar und ließ Tipps durch. Weiter hinter dem Flag. Erster Commit `feat:`. Tests +20 (zwei Suiten neu); `test:ci` 197 Suites, 3.976 Tests | PR #3582 gemergt (01.11.2026); im Browser (Chromium mit dem echten CSS, 734 × 393 und 667 × 375, Light und Dark) geprüft, am Gerät nicht |
| 10 | iPad im Querformat (Entwurf I4): Karussell `CookingSessionCarousel` in der linken Spalte, rechts der Kochmodus wie im Hochformat; Tausch an Ort und Stelle (`swapWith` mit `inPlace`); Erkennung `useTabletLandscape`; Kochmodus-Knopf auf dem Rezeptbild auch auf dem iPad quer. Weiter hinter dem Flag. Erster Commit `feat:`. Tests +31 (drei Suiten neu); `test:ci` 202 Suites, 4.071 Tests. Dashboard: M12 neu (teilweise) | PR #3587 gemergt (01.11.2026); im Browser (Chromium mit dem echten CSS, 1194 × 834, 1133 × 744 und 1376 × 1032, Light und Dark) geprüft, am Gerät nicht |
| 11 | Leiste oben nur noch auf der Startseite (`currentView === 'startseite'` in `App.js`); in Kochbuch, Festtafel, Atelier und Chefkoch entfällt sie. Weiter hinter dem Flag | PR #3589 gemergt (01.11.2026); nicht im Browser geprüft. Davor als eigene Nacharbeit #3588: Hinweis „läuft im Hintergrund“ oberhalb der Leiste |

| 12 | Abgleich zwischen Geräten: `src/utils/cookingSessionFirestore.js`, Abo und Schreiben in `CookingSessionContext` (`syncForUserId`, `setActiveRecipe`/`clearActiveRecipe`), Schritt-Nachzug und aktives Rezept in `RecipeDetail`, Regeln und `security.md` für `cookingSessions`. Weiter hinter dem Flag. Erster Commit `feat:`. Tests +13 (zwei Suiten neu); `test:ci` 204 Suites, 4.085 Tests | PR #3590 gemergt (01.11.2026); Regeln nicht im Emulator geprüft, nicht am Gerät geprüft |
| 13 | Schiene im Querformat gegenüber der Kamera (Auftrag nach dem Test am Gerät): Seite aus `useLandscapeCameraSide`, bis an den Displayrand über `useViewportFitCover` (nur solange die Schiene da ist), Kreise und „+“ 56 px wie die FABs, Karussell statt kleinerer Kreise, Hinweis auf fällige Rezepte außer Sicht. Logik dafür mit dem iPad-Karussell geteilt (`useOffscreenItems`, `pickJumpTarget`, `ArrowVerticalIcon`). `index.html`: Zoom-Reset überschreibt den meta viewport nicht mehr. Weiter hinter dem Flag. Erster Commit `feat:`. Tests +26 (zwei Suiten neu) | Branch `claude/parallel-kochen-schiene-kameraseite` gepusht, noch kein PR (01.11.2026); im Browser (Chromium mit dem echten CSS und den Abständen des iPhone 15 Pro per CDP, 852 × 393, beide Seiten, Light und Dark; ohne Abstände 734 × 372) geprüft, am Gerät nicht |

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

Umsetzungsnotizen PR 9 (Querformat, Q2): Die Schiene (`src/components/CookingSessionRail.js` mit `.css`) liest die Sitzung
wie die Leiste und zeigt die Rezepte in der Reihenfolge von `sessionRecipes`; die bleibt beim Tauschen schon stabil, weil
`swapWith` das Rezept vorn an seinem Platz ersetzt. Für das Rezept vorn nimmt sie Rezept und Schritt live aus `RecipeDetail`.
`RecipeDetail` rendert sie im Querformat mit dem Flag als erste Spalte; die Klasse `cooking-mode-has-rail` macht die
Zutatenspalte schmaler, der Tausch-Handler ist für Leiste und Schiene derselbe. `chipStatus` aus der Leiste liegt jetzt als
`cookingStatus` in `src/utils/cookingSessionStatus.js`. Gemessen in Chromium mit dem echten CSS bei 734 × 393 (iPhone 15 quer
ohne die seitlichen Ränder): Schiene 76 px, Zutaten 250 px (vorher 279), Schritte 408 px (vorher 455); die Lasche hat in
Light und Dark genau die Farbe der Zutatenspalte (`--color-surface-card`). Sechs Rezepte: je 51 px hoch, ohne Scrollen bei
393 und 375 px Höhe. Linksswipe mit `maxOffset` 70: Das Rezept gleitet ganz hinaus, der Papierkorb steht mittig.
Beim Messen aufgefallen: In der Leiste blieb die Fläche zum Entfernen nach dem Linksswipe unsichtbar und nicht antippbar
(`opacity: 0` und `pointer-events: none` aus der Grundregel in `DeleteRowButton.css`; die anderen Listen schalten sie über
`.swipe-delete-active` frei, die Leiste tat es nicht). Die Tests waren trotzdem grün, weil jsdom kein CSS anwendet. Behoben in
`CookingSessionDock.css`; solange die Fläche offen ist, bekommt der Chip den App-Hintergrund, damit Name und Status nicht auf
Rot stehen. In Ruhe bleiben die Chips ohne Fläche. `RecipeDetail.js` 2.950 → 2.967 Zeilen, `useState` unverändert 77 (am
Dashboard nichts zu ändern, wie bei PR 2 bis 8). Tests: +11 in der neuen `src/components/CookingSessionRail.test.js`, +5 in der
neuen `src/components/CookingSessionRail.css.test.js`, +3 in `src/components/RecipeDetail.parallelCooking.test.js`
(Querformat), +1 in `src/components/CookingSessionDock.css.test.js`. Nicht am Gerät geprüft.

Umsetzungsnotizen PR 10 (iPad quer, I4): `RecipeDetail` rendert auf dem iPad quer mit dem Flag statt der Leiste das Karussell
(`src/components/CookingSessionCarousel.js` mit `.css`); der Inhalt bekommt die Klasse `cooking-mode-split`, die ihn in
`RecipeDetail.css` fest über den ganzen Bildschirm legt (Raster: links das Karussell über alle Zeilen, rechts Titelzeile,
Fortschritt, Schritt-Karussell und Zutaten-Sheet; die Hochformat-Regeln gelten weiter). Die Schrittkarte richtet sich dort nach
der Spalte statt nach `100vw` und ihrer Grenze von 398 px. Das Karussell liest die Sitzung wie Leiste und Schiene, Status und
Timer aus `cookingStatus` (jetzt mit dem Timer selbst, für den Restzeit-Balken), den Schritt aus dem neuen `currentStep`
(beides `src/utils/cookingSessionStatus.js`). Sichtbarkeit der Karten über `IntersectionObserver` (ohne ihn keine Pille).
`swapWith` hat die Option `inPlace`: Das Rezept vorn tauscht mit dem gewählten den Platz in `sessionRecipes`; Leiste und Schiene
rufen es weiter ohne, ihre Reihenfolge bleibt. Gemessen in Chromium mit dem echten CSS (DOM aus den Tests, 1194 × 834): Spalten
513 und 681 px, zwei Karten je 371 px, kompakt 221 px (die vierte schaut 55 px heraus), Schrittkarte 649 px breit, Schrift 30 px,
Karten-Schritt 26 bzw. 21 px; bei 1133 × 744 (iPad mini) 487 | 646 px; bei 1376 × 1032 Karten 282 px. `RecipeDetail.js` 2.967 →
2.996 Zeilen, `useState` unverändert 77 (am Dashboard für A1 nichts zu ändern, wie bei PR 2 bis 9). Tests: +10 in der neuen
`src/components/CookingSessionCarousel.test.js`, +8 in der neuen `src/components/CookingSessionCarousel.css.test.js`, +5 in der
neuen `src/hooks/useTabletLandscape.test.js`, +3 in `src/contexts/CookingSessionContext.test.js`, +5 in
`src/components/RecipeDetail.parallelCooking.test.js` (iPad quer). Nicht am Gerät geprüft.

Umsetzungsnotizen PR 13 (Schiene gegenüber der Kamera): `RecipeDetail` liest die Kameraseite (`src/hooks/useLandscapeCameraSide.js`),
gibt der Schiene `side` und dem Inhalt mit der Schiene rechts die Klasse `cooking-mode-rail-right`; `useViewportFitCover`
(`src/hooks/useViewportFitCover.js`) setzt `viewport-fit=cover` nur im Kochmodus quer mit Flag und bekannter Richtung. Die Schiene
rechts steht per `order: 1` hinter den Spalten, im DOM weiter vorn (Vorlesereihenfolge: erst die Rezepte am Herd). Die Abstände
kommen aus `env(safe-area-inset-*)`: ohne `cover` 0, alles wie vorher. Gemessen in Chromium mit dem echten CSS, DOM aus den Tests
und den Abständen des iPhone 15 Pro quer per CDP (`Emulation.setSafeAreaInsetsOverride`: links und rechts 59, unten 21) bei
852 × 393: Schiene 76 px am Rand, Kreise 56 px, 13 px vom Displayrand (vorher 59 + 19 = 78 px); Zutaten innen 254 px (vorher 214),
Schritte innen 383 px (vorher 364), auf beiden Seiten gleich; „Nächster Schritt“ und „+“ 33 bzw. 21 px über der Unterkante.
Fünf Rezepte: Liste 298 px hoch, drei ganz zu sehen, das vierte schaut heraus; drei passen ohne Scrollen. Ohne Abstände
(734 × 372, wie heute ohne `cover`) dieselben Maße wie in PR 9 (Schiene 76, Zutaten 250, Schritte 408 px). Die Rundungen der
Displayecken (55 pt, als Kreisbogen angenommen) schneiden weder Kreise noch „+“; der Hinweis oben sitzt deshalb 10 px tiefer.
Das iPad-Karussell nutzt jetzt denselben Hook für die Sichtbarkeit (`src/hooks/useOffscreenItems.js`), `pickJumpTarget` liegt in
`src/utils/cookingSessionStatus.js`, der Pfeil in `src/components/icons/ArrowVerticalIcon.js`; sein Verhalten ist unverändert
(seine Tests unverändert grün). `RecipeDetail.js` 3.013 → 3.022 Zeilen, `useState` unverändert 77 (am Dashboard für A1 nichts zu
ändern, wie bei PR 2 bis 12; kein Tech-Check-Befund berührt). Tests: +7 in der neuen `src/hooks/useLandscapeCameraSide.test.js`,
+5 in der neuen `src/hooks/useViewportFitCover.test.js` (einer davon führt das Skript aus `index.html` aus; mit dem alten Skript
rot), in `CookingSessionRail.test.js` +4/-1, in `CookingSessionRail.css.test.js` +5/-2, +5 in
`RecipeDetail.parallelCooking.test.js`, +3 in `RecipeDetail.css.test.js`; `test:ci` 206 Suites, 4.111 Tests. Nicht am Gerät geprüft.

## Offen

- **Schiene gegenüber der Kamera am Gerät** (PR 13): (1) Steht die Schiene auf der Seite gegenüber der Pille, in beiden Richtungen?
  Wenn verkehrt herum: die zwei Zweige in `getCameraSide` tauschen. (2) Übernimmt iOS `viewport-fit=cover` zur Laufzeit (Schiene
  dicht am Rand, Inhalt frei von der Pille)? Wenn nicht: die Seite stimmt trotzdem, der Rand bleibt wie bisher; dann bliebe nur
  `cover` global in `index.html` mit Abständen auf allen Seiten, eine eigene Arbeit. (3) Einrasten beim Scrollen, Hinweis auf
  fällige Rezepte außer Sicht, Linksswipe dicht am rechten Rand. (4) Sheet „Was kochst du dazu?“ quer mit den Abständen.

- **Abgleich zwischen Geräten** (PR 12): `firestore.rules` für `cookingSessions` nicht im Emulator geprüft (nur durch
  `securityDocsPolicy.test.js` gedeckt). Zwei Geräte gleichzeitig am Gerät testen: Rezept dazunehmen, Schritt
  weiterschalten, Rezept vorn wechseln. Offen, ob Portionen und Timer mit synchronisiert werden sollen. Bei gleichzeitiger
  Änderung auf zwei Geräten gewinnt der spätere Schreibvorgang ganz (kein Zusammenführen je Rezept). Ein Gerät, das das Rezept
  auf dem Handy im Hintergrund hat, wird bewusst nicht in den Kochmodus gezogen. `RecipeDetail.js` 2.996 → 3.013 Zeilen,
  `useState` unverändert 77 (am Dashboard für A1 nichts zu ändern).

- **Alarm bei App im Hintergrund** (am Gerät bestätigt, 01.11.2026, Tech-Check P8): Der Timer ist „weitestgehend lautlos,
  wenn die App im Hintergrund ist“. Takt und Ton laufen nur, solange der Browser die Seite ausführt; eine iOS-PWA im
  Hintergrund wird pausiert, der Alarm kam erst beim Zurückkehren (`visibilitychange`).
  - Teil 1, PR #3584 (gemergt): `startAlarm` rief vor dem Ton `new Notification()` auf, das auf Chrome für Android wirft,
    der Ton startete nie. Jetzt Ton zuerst, Mitteilung über den Service Worker (`src/utils/localNotification.js`),
    Tipp holt die App nach vorn.
  - Teil 2, PR #3585 (gemergt, baute auf #3584 auf): Push vom Server zur Endzeit. Entschieden (01.11.2026, auf
    Empfehlung): minütlicher Job, der bis zur Endzeit wartet (`sendDueCookingTimerAlarms`, kein Cloud Tasks), und nur
    das Gerät, auf dem der Timer gestartet wurde (Token in `users/{uid}.timerPushTokens`). Im Hintergrund klingt der
    Systemton der Mitteilung, nicht die eigenen Alarmtöne; iPhone nur als installierte App ab iOS 16.4 mit erlaubten
    Mitteilungen. Timer unter einer Minute können sich bis zu einer Minute verspäten.
  - Offen: Zustellung am Gerät nach dem Deploy prüfen (iPhone gesperrt und App im Hintergrund).

- **iPad hochkant** (PR 10, Tech-Check M12): Die Desktop-Ansicht ab 769 px Breite hat keinen Kochmodus-Knopf. iPad Air und Pro
  hochkant (820 bzw. 834 px) erreichen den Kochmodus deshalb nur, wenn man ihn quer startet und dann dreht; dort ist er nicht
  fixiert, der App-Header bleibt sichtbar, und die Schrittkarte ist höchstens 398 px breit. Vorschlag aus dem Entwurfsgespräch:
  hochkant der iPhone-Hochkantmodus 1:1 mit Leiste, über den ganzen Bildschirm. Nicht entschieden. Ebenso offen: Kochmodus auf
  dem iPad quer ohne Flag und am Desktop (gewollt oder Lücke?).
- **Karussell am Gerät** (PR 10): Linksswipe auf den breiten Karten, Einrasten beim Scrollen, Pille für fällige Rezepte und die
  Erkennung (iPad mit Magic Keyboard) nicht am Gerät geprüft.

- **Leiste unter dem Header scrollt weg** (PR 8): Sie sitzt im Fluss, nicht sticky. Bei langen Listen ist ein ablaufender Timer dann erst nach dem Hochscrollen sichtbar (der Alarm-Dialog kommt trotzdem). Sticky unter dem Header wäre die Alternative; Höhe des Headers und sein Ausblenden beim Scrollen (`headerVisible`) müssten dann zusammenpassen.

- **Parken ohne neues Rezept** (V2, Parken-Knopf in der Lasche): nicht gewählt. Wird nötig, wenn man ein Rezept
  parken will, ohne gleich ein anderes zu öffnen.
- **Leiste im Rezeptdetail ohne Kochmodus und in der Festtafel-Detailansicht:** dort fehlt sie, weil es keine
  Bottom-Navigation gibt. Ob sie dort nötig ist, zeigt der Test am Gerät.
- **Zurückdrehen beendet den Kochmodus:** gewollt und per Test festgeschrieben (`RecipeDetail.cooking-mode-layout.test.js`,
  „deactivates cooking mode after rotating back to portrait“), auch wenn der Kochmodus vorher im Hochformat an war. Mit
  mehreren Rezepten landet man danach im Rezeptdetail ohne Leiste; die Sitzung bleibt. Ob das mit Sitzung so bleiben soll, offen.
- **Sheet „Was kochst du dazu?“ im Querformat:** Bottom-Sheet wie im Hochformat, für 393 px Höhe nicht eigens gestaltet.
- **Schiene am Gerät** (PR 9): Linksswipe am Rand und die schmalere Schrittspalte nicht am Gerät geprüft (die 30-px-Kreise ab vier
  Rezepten gibt es seit PR 13 nicht mehr).
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
- Karussell auf dem iPad quer (I4): `src/components/CookingSessionCarousel.js` und `.css`, Erkennung
  `src/hooks/useTabletLandscape.js`, Layout `src/components/RecipeDetail.css` (`.cooking-mode-split`), Tausch an Ort und Stelle
  `swapWith(…, { inPlace: true })` in `src/contexts/CookingSessionContext.js`
- Rezept-Schiene im Querformat: `src/components/CookingSessionRail.js` und `.css`; Status-Anzeige von Leiste und Schiene:
  `src/utils/cookingSessionStatus.js`; Layout im Querformat: `src/components/RecipeDetail.css` (`.cooking-mode-landscape`,
  `.cooking-mode-has-rail`, `.cooking-mode-rail-right`); Seite der Kamera `src/hooks/useLandscapeCameraSide.js`, bis an den
  Displayrand `src/hooks/useViewportFitCover.js` (Zoom-Reset nach dem Drehen im Skript in `index.html`); fällige Rezepte außer
  Sicht (Schiene und iPad-Karussell): `src/hooks/useOffscreenItems.js`, `pickJumpTarget` in `src/utils/cookingSessionStatus.js`
- Einrichtbare Icons (Knopf „Rezept dazunehmen“, `cookingAddRecipe`): `src/utils/buttonIconRows.js` (Zeile und Gruppe),
  `src/utils/defaultButtonIcons.js` (Standard-Symbol), `src/utils/customLists.js` (`DEFAULT_BUTTON_ICONS`)
- Abgleich zwischen Geräten: `src/utils/cookingSessionFirestore.js` (Dokument `cookingSessions/{uid}`), Abo und Schreiben im
  Store von `src/contexts/CookingSessionContext.js`, Tests `CookingSessionContext.sync.test.js`, `cookingSessionFirestore.test.js`
- Festtafel: `src/components/MenuDetail.js` (`onSelectRecipe`); Kochdaten: `src/utils/recipeCookDates.js`
  (`getRecentlyCookedRecipeIds`, Index in `firestore.indexes.json`)
- Tests: `src/components/RecipeDetail.timer.test.js`, `src/components/RecipeDetail.cooking-mode-layout.test.js`,
  `src/components/RecipeDetail.parallelCooking.test.js`, `src/contexts/CookingSessionContext.test.js`,
  `src/components/CookingSessionDock.test.js`, `src/components/CookingAddRecipeSheet.test.js`,
  `src/components/CookingSessionDock.css.test.js`, `src/components/RecipeDetail.css.test.js`,
  `src/utils/recipeCookDates.test.js`, `src/components/CookingAddRecipeButton.test.js`,
  `src/components/CookingAddRecipeButton.css.test.js`, `src/components/CookingSessionRail.test.js`,
  `src/components/CookingSessionRail.css.test.js`, `src/components/CookingSessionCarousel.test.js`,
  `src/components/CookingSessionCarousel.css.test.js`, `src/hooks/useTabletLandscape.test.js`,
  `src/hooks/useLandscapeCameraSide.test.js`, `src/hooks/useViewportFitCover.test.js`
