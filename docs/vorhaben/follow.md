# Vorhaben: Follow (Vernetzung zwischen Mitgliedern)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 21.10.2026 (PR 1 bis 6 gemergt, Netzwerk-Swipe in Arbeit).

**Ziel:** Aktivitäten anderer Mitglieder inspirieren. Wer jemandem folgt (mit Bestätigung des
Gefolgten), sieht in „Für dich entdeckt" zusätzlich Rezepte, die diese Person zuletzt gekocht
oder angelegt hat, mit Namen („Anna hat das gekocht").

**Designentwürfe:** https://claude.ai/artifact/Dvxq5LHFWHmu4WttqmPLUe (Rezeptkarte in drei Stadien,
Kochtagebuch, Profil). Keine Mockups im Repo.

## Entschieden

| Thema | Entscheidung |
|---|---|
| Modell | Follow mit Bestätigung durch den Gefolgten (Anfrage). Keine Freundschaft. |
| Sichtbarkeit | Regeln für Rezepte bleiben unverändert. Die Bestätigung schützt die proaktive Ausspielung, nicht den Zugriff (Rezepte und `cookDates` sind für Mitglieder lesbar, siehe `docs/architecture/security.md`). |
| Quelle „Gefolgte" | Erweiterung der Themenregel in `discoverTopics`: `recipeRule.dateScope` (`all`/`own`) wird zur Mehrfachauswahl `scopes` (`all` exklusiv, `own` und `followed` kombinierbar). Nur Admins stellen das ein, kein Nutzerfilter. Gilt für `created` und `lastCooked`. Bestehende Themen: `own` wird `['own']`, sonst `['all']`. |
| Technik der Quelle | `autoRecipeOwners` (Akteure, die das Rezept qualifizieren) bleibt Ergebnis des Nachtlaufs. Die Rotation (`rotateFuerDichEntdecktList`) prüft die Schnittmenge mit den akzeptierten Gefolgten des Listenbesitzers. Sichtbarkeit prüft `isVisibleToUser` wie bisher. Kein Filtern der Rezept-Collection nach Autor. |
| Namen auf der Karte | Im MVP. Ablage in `users/{uid}/fuerDichEntdeckt/current` (nur Eigentümer lesbar, nur Cloud Function schreibt), höchstens 3 Akteure je Rezept, nur Tag (angezeigt grob: „gestern", „diese Woche"). Nicht im Listendokument `groups/…` (für jeden lesbar). |
| Datenmodell | `follows/{followerId}_{followeeId}` mit `status` (`pending`/`accepted`), `createdAt`, `respondedAt`. Anlegen und Antworten über Callables `requestFollow` und `respondFollow` (Rate-Limit, Sperrprüfung). Lesen: Beteiligte. Löschen: beide Seiten. |
| Rückschau | „Alle gelten": Nach Annahme zählen auch frühere Einträge (begrenzt durch das Zeitfenster des Themas). Der Anfragetext nennt das ausdrücklich. |
| Opt-out pro Eintrag | Keiner im MVP (bewusste Entscheidung, Risiko: sensible Ernährungsdaten). Für Phase 2 vorgemerkt. |
| Limit pro Person | Keins (Empfehlung war 2, bei Massenimport kann eine Person alle 5 Plätze füllen). |
| Auffinden | Die Anfrage startet überall, wo Autoren sichtbar sind (Rezeptkarte, Kochtagebuch, Profil). Kein Handle, keine Suche im MVP. |
| Freischalten | Eigenes Rollen-Flag `follow` (nach dem Muster von `fuerDichEntdeckt`). |
| Anfragen verwalten | Unterseite „Netzwerk" unter Chefkoch (Tabs Anfragen / Ich folge / Follower), Badge am Tab „Chefkoch". Follower entfernen gehört dazu. |
| Profil | Im MVP. Status-Karte (Anfrage zurückziehen, nicht mehr folgen) und Rezepte der Person. Keine Liste „Zuletzt gekocht". |
| Rezeptkarte | Folgen-Icon in der Aktionsleiste (Person mit Abzeichen: Plus, Uhr, Haken). Ab „angefragt" verschwindet das Icon, der Name wird zum Link auf das Profil. Rückgängig über Snackbar. |
| Kochtagebuch | Dialog „Kochbuch" heißt künftig „Kochtagebuch", pro Eintrag ein Icon-Button, Name ab „angefragt" als Link. |
| Ablehnen | Still, der Anfragende sieht weiter „Angefragt". Zusätzlich Blockieren im MVP. |
| Rules vorab | Eigener Schritt vor dem Feature (Phase 0). |
| Deployment | Workflow beim Merge, kein Staging. Reihenfolge Rules, dann Functions, dann Client. |
| Sperrfrist und Rate-Limit | Beides zusätzlich zum Blockieren: 30 Tage Sperrfrist nach Ablehnung und Rate-Limit pro Absender (18.10.2026). |
| Push bei neuer Anfrage | Im MVP (18.10.2026), nutzt `backgroundUpdatesEnabled`. Rate-Limit und Sperrfrist werden vor dem Push gebaut und getestet, weil Push sonst ein Spam-Kanal ist. |
| Abgelehnte Anfrage | Bleibt dauerhaft „Angefragt", der Name bleibt ein Link auf das Profil (18.10.2026). |
| Plätze für Gefolgte | Eigenes „Für dich entdeckt"-Thema, z. B. „Deine Community kocht" (`scopes: ['followed']`, `lastCooked`, Zeitfenster 30 Tage). Das Thema bringt seine Plätze wie jedes andere mit (18.10.2026). Wie die Rotation Plätze auf Themen verteilt, wird zu Beginn von PR 5 geprüft. |

## Stand der Umsetzung

| PR | Inhalt | Stand |
|---|---|---|
| 1 | Rules-Tests (Emulator, CI-Job), `cookDates` validieren, `security.md` korrigieren, dieses Dokument | PR #3461 gemergt und deployt (18.10.2026), CI grün inkl. neuem Job „Firestore Rules" |
| 2 | `follows`, `requestFollow`/`respondFollow`, Rules mit Tests, Flag `follow`, Inbox, Sperrfrist, Blockieren, Tageslimit | PR #3462 gemergt und deployt (18.10.2026, Deploy-Lauf 1842 erfolgreich), CI grün (Function-Tests 16, Rules-Tests 8 neu) |
| 2b | Push bei neuer Anfrage (`functions/followPush.js`, gemeinsamer Helfer `sendDataPush` in `fuerDichEntdecktPush.js`) | PR #3464 gemergt (18.10.2026) |
| 3 | Netzwerk-Seite (`NetworkPage.js`, Kachel „Netzwerk" unter Chefkoch), Badge am Tab „Chefkoch", Aktion `unblock` + `users/{uid}/followBlocks` | PR #3466 gemergt (18.10.2026), Function-Tests +2, Rules-Test +1, Komponententests 10 |
| 4a | Folgen-Icon (`FollowButton`, `FollowContext`) am Autor im Rezeptdetail und im Kochtagebuch (Dialog heißt jetzt „Kochtagebuch"), Anfrage mit Snackbar „Rückgängig" | PR #3467 gemergt (Komponententests +6) |
| 4b | Profilseite (`MemberProfilePage`: Status-Karte, Rezepte der Person), Name wird ab „angefragt" zum Link (`FollowName`) | PR #3469 gemergt (Komponententests +8) |
| 4c | Folgen-Button nach Artefakt „Follow-Anfrage im Rezeptdetail“: Kachel in der Aktionsleiste des Rezeptdetails (nicht mehr am Autorennamen), runder Button rechts in der Kochtagebuch-Zeile; einrichtbares Icon `followButton` (+ `followButtonDark`) in den Button-Icons, Darkmode in `darkMode.css`. Zustände „angefragt“/„angenommen“ als Button (Abzeichen Uhr/Haken) bleiben offen: der Button verschwindet weiterhin ab „angefragt“. | PR #3473 gemergt (19.10.2026) |
| 4d | Folgen-Button (und `FollowName`) auch auf der Kachel „Erstellt am“ im Kochtagebuch (Autor des Rezepts); bisher nur auf den „Gekocht am“-Kacheln (Komponententests +2) | PR #3475 gemergt (20.10.2026) |
| 5 | Themenregel `scopes` (Admin-UI `DiscoverTopicsTab.js`, Nachtlauf, Rotation), privates Attributionsdokument | PR #3470 gemergt (Function-Tests +4, Komponententests +2, Rules-Test +1) |
| 6 | Namensanzeige auf Karte und im Stapel (liest `users/{uid}/fuerDichEntdeckt/current`) | PR #3472 gemergt (Komponententests +1, Util-Tests 5) |
| 7 | Netzwerk-Seite („Mein Netzwerk“, Kopfzeile wie „Meine Mise en Place“: Titel über der Karte, Schließbutton rechts) mobil: Linksswipe (`useSwipeToDelete`) für „Ich folge“ und „Follower“, Desktop weiter mit `DeleteRowButton` (Komponententests +2) | 21.10.2026, Branch `claude/follow-netzwerk-swipe`, noch kein PR |

Nach jedem PR: Tech-Check-Dashboard aktualisieren (Befunde und `umsetzungen`, siehe `CLAUDE.md`),
Tabelle hier nachziehen.

Umsetzungsnotizen PR 6: `src/utils/fuerDichAttribution.js` hört auf das private Dokument (`useFuerDichAttribution`, gilt nur, wenn `listId` und `themeId` zur aktuellen Liste passen, sonst leer) und formuliert den Satz (`describeActors`: „Anna hat das gekocht · gestern", „Anna, Ben und Cara haben das gekocht · diese Woche", gemischt „…, Ben hat es angelegt"; Zeit grob: heute / gestern / diese Woche / letzte Woche / vor n Wochen). Namen kommen aus `allUsers` (Vorname), unbekannte als „Ein Mitglied". Angezeigt in `Tagesmenu.js` auf der Stapelkarte (`tagesmenu-card-followed`) und in den Kandidaten-Kacheln der Ergebnisansicht. Nicht gebaut: Namen als Link aufs Profil (die Karte reagiert auf Tippen und Wischen, `FollowName` im Satz käme mit eigener Klickfläche), Zeile auf der Startseiten-Kachel `FuerDichEntdecktKachel`, Designabgleich mit den drei Stadien der Rezeptkarte (der Entwurf war hier nicht lesbar; Wortlaut und Platzierung sind meine Annahme).

Umsetzungsnotizen PR 5: `recipeRule.dateScope` wird zu `scopes` (`['all']` exklusiv; `own` und `followed` kombinierbar; altes `dateScope: 'own'` liest als `['own']`, `ruleKey` ändert sich dadurch einmalig, Regeln werden beim nächsten Lauf neu angewendet). Der Nachtlauf speichert neben `autoRecipeOwners` neu `autoRecipeActors` (`recipeId -> userId -> {kind: 'cooked'|'created', ms}`, jeweils die jüngste qualifizierende Handlung) am Thema; das ist für Mitglieder lesbar wie `autoRecipeOwners` und `cookDates`. Die Rotation lädt die akzeptierten Follows des Listenbesitzers nur, wenn ein aktives Thema `followed` nutzt (`usesFollowedScope`), und schreibt dann `users/{uid}/fuerDichEntdeckt/current` (`listId`, `themeId`, `recipes: {recipeId: [{userId, kind, day}]}`, höchstens 3 Akteure, nur Tag `YYYY-MM-DD`). Rules: nur Eigentümer lesbar, nie schreibbar. Verhalten ohne Flag oder ohne Gefolgte: Das Thema hat für die Liste keine nutzbaren Rezepte und ist damit kein Kandidat (also ausgeblendet). Platzverteilung: `pickTopic` zieht pro Liste genau ein Thema zufällig unter den Kandidaten und füllt bis zu 5 Plätze daraus; ein Thema bringt seine Plätze also selbst mit, es gibt keine Mischung mehrerer Themen. Nicht gebaut: eigenes Thema „Deine Community kocht" (Admin legt es an: `scopes: ['followed']`, `lastCooked`, 0–30 Tage), Anzeige der Namen (PR 6). Reihenfolge beim Deployment: Rules, dann Functions, dann Client.

Umsetzungsnotizen PR 4b: Das Profil ist eine Ansicht in `App.js` (State `profileUserId`, liegt vor dem Rezeptdetail wie Einstellungen; „Zurück" führt zum Rezeptdetail zurück). Geöffnet wird es über `openProfile` aus dem `FollowProvider`. `FollowName` ist ab „angefragt" ein Link, sonst Text. Die Rezepte der Person kommen aus dem schon sichtbarkeitsgefilterten `recipes`-Array, es gibt keine eigene Abfrage. Die Status-Karte kennt drei Zustände (kein Follow: „Folgen"; angefragt: „Anfrage zurückziehen"; angenommen: „Nicht mehr folgen"), Zurückziehen und Beenden laufen mit Undo-Fenster wie in der Netzwerk-Seite. Nicht gebaut: Profilaufruf aus dem Netzwerk-Tab (Namen dort sind noch Text), Profil im Rezeptlisten-Kontext (nur Rezeptdetail und Kochtagebuch).

Umsetzungsnotizen PR 4a: Der Zustand der eigenen Follows liegt im `FollowProvider` (`src/contexts/FollowContext.js`, in `App.js` um die Hauptansicht gelegt, Snapshot auf `follows` mit `followerId == uid`). Ohne Provider oder ohne Flag rendert `FollowButton` nichts, bestehende Tests bleiben unberührt. Ob die andere Person Follow nutzt, weiß der Client nicht (kein Feld in `publicProfiles`); die Function antwortet dann mit „nicht erreichbar", das erscheint in der Snackbar. „Rückgängig" löscht das `follows`-Dokument sofort (anders als bei Listenzeilen läuft die Anfrage schon, ein verzögertes Senden wäre unnatürlich). Name als Link und Profil folgen mit 4b; bis dahin bleibt der Name Text.

Umsetzungsnotizen PR 3: Entsperren (`unblock` in `respondFollow`) hebt nur eine dauerhafte Blockade auf, keine laufende Sperrfrist nach Ablehnung (die ist für den Gefolgten unsichtbar). Dafür führt `block` eine lesbare Liste `users/{uid}/followBlocks/{followerId}` (nur Eigentümer lesbar, nur Function schreibt), weil `followCooldowns` bewusst unlesbar bleibt. Die Seite hängt als Kachel „Netzwerk" in `Kueche.js` (nur mit Flag `follow`); das Badge am Tab `chef` kommt aus `useFollowRequestCount` in `App.js`. „Ich folge" zeigt auch noch offene Anfragen („Angefragt"), die man dort zurückziehen kann. Namen kommen aus `publicProfiles`, versteckte Mitglieder erscheinen als „Ein Mitglied".

Umsetzungsnotizen PR 2: Das Tageslimit liegt bei 20 Anfragen je Absender und Tag (UTC), die Sperrfrist
nach Ablehnung bei 30 Tagen, Blockieren ist dauerhaft (`functions/follow.js`). Eine abgelehnte oder
blockierte Anfrage bleibt für den Anfragenden `pending`; der Gefolgte sieht sie nicht mehr, weil sie
aus `users/{uid}/followInbox` verschwindet. Ein Entsperren fehlt noch (siehe Offen).

## Offen

- Verwaiste Inbox-Zeilen: Zieht der Anfragende zurück (Client löscht `follows`), bleibt die Zeile in `users/{uid}/followInbox` stehen. PR 3 löst das clientseitig (`openRequestIds` in `followFirestore.js` zählt nur Inbox-Zeilen mit offener `pending`-Beziehung, Seite und Badge nutzen es). Die Zeile selbst bleibt liegen, der Push dedupliziert darüber (kein zweiter Push, solange sie steht); eine aufräumende Function ist nicht nötig, solange das Tageslimit gilt.
- Tippen auf den Push öffnet die Startseite; der Sprung in die Netzwerk-Seite (`follow_request` in `src/service-worker.js`/`firebase-messaging-sw.js`, Übergabe wie `pushTapHandoff.js`) ist noch nicht gebaut. Eigener kleiner PR, gehört zu PR 3 nur lose.

- Zustimmungsdialog im Kochtagebuch (in der Skizze ohne).
- Datenschutzerklärung um Follow und proaktive Ausspielung ergänzen, vor dem Rollout (Text liefert Claude, Freigabe beim Eigentümer).
- Verhalten des Themas „Deine Community kocht" ohne Flag `follow` oder ohne Gefolgte (Vorschlag: ausblenden), Platzverteilung in der Rotation (PR 5).

## Bekannte Risiken und Voraussetzungen

- **S16** (Gruppen mit `invitedEmails` für anonyme Gäste lesbar) und **S18** (`notifyPrivateListMembers` ohne Absenderprüfung): im Tech-Check erfasst, nicht Teil von PR 1. Vor dem Rollout von Follow klären.
- Rezept-Sichtbarkeit gilt nur im Client (Tech-Check S2, bewusst so entschieden). Das Datenschutzversprechen im UI darf keinen technischen Schutz behaupten.
- `follows` nie im `users`-Dokument führen: Nutzer dürfen es bis auf `role` selbst ändern.
- Neue Felder an `publicProfiles` müssen in `functions/index.js` (`PUBLIC_PROFILE_FIELDS`) und `src/utils/userManagement.js` gleichzeitig ergänzt werden, sonst überschreibt `syncPublicProfile` sie.

## Wichtige Stellen im Code

- Kachel: `src/components/FuerDichEntdecktKachel.js`, Einbindung `src/components/Startseite.js`
- Themen und Regeln: `src/utils/discoverTopics.js`, `src/components/DiscoverTopicsTab.js`, `functions/fuerDichEntdecktRotation.js`
- Rotation und Nachtlauf: `functions/index.js` (`applyTopicRules`, `rotateFuerDichEntdecktList`)
- Kochdaten: `src/utils/recipeCookDates.js`, `src/components/CookDateModal.js`
- Sichtbarkeit: `filterVisibleRecipes` in `src/utils/recipeFirestore.js`, `isVisibleToUser` in `functions/fuerDichEntdecktRotation.js`
- Navigation: `src/components/BottomNavigation.js` (`badgeCounts`), Chefkoch: `src/components/Kueche.js`, `PersonalDataPage.js`
