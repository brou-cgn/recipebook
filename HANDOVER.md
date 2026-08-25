# Handover: Audio-/Video-Rezeptextraktion aus Instagram-Reels

Zusammenfassung der Session `claude/audio-recipe-extraction-a0fnkg`. Für die konkrete
Kurzbefehl-Konfiguration siehe `APPLE_SHORTCUT_SETUP.md`.

## Ziel

Rezepte aus Instagram-Reels zuverlässiger importieren, insbesondere wenn das Rezept nur
gesprochen (Ton/Video) vorkommt und nicht in der Caption steht. Ausgangspunkt war die Frage,
ob die Tonspur von Videos als zusätzliche Datenquelle für die Rezept-Extraktion genutzt werden
kann.

**Wichtige Erkenntnis aus der Session:** Diese Tonspur-Nutzung existierte serverseitig
bereits (`transcribeVideoWithGemini`, aufgerufen aus `runImportFromInstagram`) — die
eigentliche Aufgabe war nicht "Feature bauen", sondern **herausfinden, warum sie in der
Praxis nicht wirkte, und das beheben.**

## Was umgesetzt wurde

Alle Punkte sind gemergt auf `main` (PRs #3112, #3115–#3118, #3120, #3133–#3135). Am
Deploy-Workflow (`workflow_dispatch`, manuell) hat sich nichts geändert — nichts davon ist
automatisch live, siehe „Was noch aussteht" unten.

### 1. Bugfixes im bestehenden Scrape-Weg (`runImportFromInstagram`)

- **Base64-Größenrechnung korrigiert** (PR #3112): `MAX_REEL_VIDEO_SIZE` prüfte die rohe
  Videogröße gegen Gemini's 20-MB-Request-Limit, ignorierte aber die ~33 % Aufblähung durch
  Base64-Kodierung. Reels ab ~15 MB roh bestanden die Vorprüfung, ließen den eigentlichen
  Gemini-Call dann aber am echten Limit scheitern — ein Fehler, der bis dahin nur geloggt und
  still verschluckt wurde. **Das ist vermutlich die Hauptursache dafür, dass die
  Video-Transkription in der Praxis so gut wie nie funktioniert hat.**
- **Video-Element-Timing gehärtet** (PR #3112, #3116): Autoplay-Trigger (mute+play) und
  `page.waitForSelector('video', ...)` statt einer festen 2-Sekunden-Pause, da Instagram den
  Player teils erst später client-seitig hydriert.
- **Diagnose-Logging** (PR #3115, #3117 – letzteres inzwischen als temporär wieder entfernt):
  HTTP-Status, finale URL, Login-Wall-Heuristik, Vorhandensein des `<video>`-Elements,
  Content-Längen. Damit ließ sich der tatsächliche Fehlerfall live in den Cloud-Function-Logs
  nachvollziehen statt nur zu raten.
- **Retry bei Login-Wall-Redirect** (PR #3118): Wenn Instagram auf `/accounts/login/`
  umleitet, wird die Navigation einmal mit frischer Session wiederholt.
- **Bessere Fehlermeldung bei Login-Wall** (PR #3134): Statt der generischen „Kein
  Rezeptinhalt gefunden" bekommt der Nutzer bei erkannter Login-Wall jetzt einen expliziten
  Hinweis auf den Video-Upload-Fallback (siehe unten).

### 2. Neuer Weg: Video-Upload per Kurzbefehl (umgeht Scraping komplett)

Für den Fall, dass Instagram die Cloud-Function-Anfrage blockiert: der Nutzer sichert das
Reel-Video selbst (Instagrams „Video speichern") und lädt es direkt hoch — keine Anfrage an
Instagram mehr nötig.

- **`getVideoUploadUrl`** (PR #3120): neuer Shortcut-Endpoint (API-Key+PIN-Auth wie
  `importRecipeShortcut`), gibt eine 10 Minuten gültige Signed-URL für einen direkten
  PUT-Upload nach Firebase Storage zurück (umgeht Cloud Functions' ~32-MB-HTTP-Limit).
- **`processVideoImportUpload`** (PR #3120): Storage-Trigger (`onObjectFinalized`), startet
  automatisch nach Upload-Abschluss, transkribiert per Gemini, extrahiert das Rezept, löscht
  das Video danach in jedem Fall wieder.
- **`runImportFromVideoSource`** (PR #3120) + `case 'video'` im bestehenden
  `runImportFromSource`-Dispatcher, damit `recoverStuckImportJobs` stecken gebliebene
  Video-Jobs wie jeden anderen Importtyp redriven kann.
- **Optionales `caption`-Feld** (PR #3133): Kann manuell mitgeschickt werden und wird mit dem
  Video-Transkript kombiniert (analog zu `runImportFromInstagram`, das Caption + Transkription
  bereits für den gescrapten Weg kombiniert).

### 3. Neuer synchroner Endpoint mit Fallback-Verzweigung im Kurzbefehl

- **`scrapeInstagramReelShortcut`** (PR #3135): Anders als `importRecipeShortcut` (das
  bewusst sofort "queued" antwortet) wartet dieser Endpoint den kompletten Scrape ab und gibt
  `{success: true, recipeId}` oder `{success: false, error, loginWall}` direkt zurück, damit
  der Kurzbefehl selbst verzweigen kann: bei `success: false` automatisch weiter zum
  Video-Upload-Fallback. Trade-off (bewusst in Kauf genommen, siehe Code-Kommentar): offene
  Verbindung über die volle Scrape-Dauer (~15–30 s beobachtet, bis 180 s Timeout) — bei aus
  dem Share Sheet gestarteten Kurzbefehlen ein mögliches Risiko durch iOS' Hintergrund-
  Zeitlimit.

## Was gescheitert / nicht bestätigt ist

- **Live-Tests konnten aus dieser Sandbox heraus nie durchgeführt werden** — kein
  Netzwerkzugriff auf `instagram.com` (Proxy blockt `connect_rejected`), keine
  Deploy-Berechtigung. Jede Diagnose beruhte auf vom Nutzer eingefügten Cloud-Logging-
  Screenshots aus der echten (deployten) Umgebung.
- **Login-Wall trat auch nach dem Retry (PR #3118) noch auf** — ein Testlauf zeigte
  `likelyLoginWall=true` sowohl beim ersten Versuch als auch beim Retry. Der Retry hilft also
  nicht in jedem Fall.
- **`<video>`-Element wurde trotz `waitForSelector` mehrfach nicht gefunden** — auch ohne
  erkennbare Login-Wall (Status 200, echte Reel-Seite geladen) blieb `videoUrl` in mindestens
  zwei Testläufen leer. Die genaue Ursache dafür ist ungeklärt (Instagram zeigt der Cloud-
  Function-IP evtl. grundsätzlich keinen `<video>`-Tag, unabhängig vom Login-Status).
- **Offene, nicht umgesetzte Alternativen**, die im Gespräch bewusst verworfen bzw.
  zurückgestellt wurden: Residential-Proxies, authentifizierte Instagram-Session
  (Login-Cookie), inoffizielle Instagram-API-Endpunkte, Downloader-Drittseiten — jeweils wegen
  Kosten, ToS-Risiko oder Instabilität. Diese Bewertungen sind im Chat-Verlauf dokumentiert,
  aber nicht Teil des Codes.

## Aktuelle Einschätzung / Kurskorrektur am Ende der Session

Der Nutzer wies zurecht darauf hin, dass in seiner tatsächlichen, alltäglichen Nutzung die
Login-Wall **nie** aufgetreten ist — Caption-Extraktion lief immer zuverlässig, nur die
Video-Transkription schlug **immer** fehl. Das passt besser zum Base64-Bug (deterministisches
Scheitern bei jedem nicht-winzigen Reel) als zu einer Login-Wall (eher seltener, vermutlich
durch die wiederholten Testabrufe derselben URL in dieser Session mit ausgelöst).

**Der bestehende Scrape-Weg (`runImportFromInstagram`) kombiniert Caption und Video ohnehin
schon "gleichzeitig"**: Video wird zusätzlich versucht, scheitert es, läuft der Import mit
Caption allein weiter; nur bei leerer Caption *und* leerem Video kommt ein Fehler. Der separate
Video-Upload-Weg (Abschnitt 2/3 oben) ist damit eher ein **Fallback für den selteneren
Login-Wall-Fall**, nicht der primäre Weg, um Video+Caption zu kombinieren — anders, als es
streckenweise im Gespräch dargestellt wurde.

## Nächste Schritte

1. **Deploy anstoßen** (GitHub Actions → „Deploy to Firebase Hosting", `workflow_dispatch`) —
   nichts davon ist bisher live.
2. **Bestehenden, jetzt gefixten Scrape-Weg zuerst gegentesten** (`scrapeInstagramReelShortcut`
   oder App-UI) an mehreren echten Reels, bevor weiter am Video-Upload-Fallback gebaut wird —
   der Base64-Fix allein könnte den Hauptteil des ursprünglichen Problems bereits gelöst haben.
3. Falls die Login-Wall in echter, verteilter Nutzung (nicht wiederholte Anfragen an dieselbe
   URL) tatsächlich selten ist: den Aufwand für den Video-Upload-Fallback (Abschnitt 2/3) neu
   bewerten — evtl. ausreichend als Option für Einzelfälle, ohne den kombinierten
   `scrapeInstagramReelShortcut`-Ablauf für den Normalfall zu brauchen.
4. Ungeklärte `<video>`-Element-Fälle (ohne Login-Wall) weiter beobachten, falls sie nach dem
   Test unter Punkt 2 noch auftreten.
