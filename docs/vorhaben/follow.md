# Vorhaben: Follow (Vernetzung zwischen Mitgliedern)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 18.10.2026.

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

## Stand der Umsetzung

| PR | Inhalt | Stand |
|---|---|---|
| 1 | Rules-Tests (Emulator, CI-Job), `cookDates` validieren, `security.md` korrigieren, dieses Dokument | PR #3461 offen (Branch `claude/firestore-rules-tests`) |
| 2 | `follows`, Callables, Rules mit Tests, Flag `follow`, Sperren | offen |
| 3 | Netzwerk-Seite, Badge am Tab „Chefkoch" | offen |
| 4 | Folgen-Icon (Rezeptkarte, Kochtagebuch), Profilseite | offen |
| 5 | Themenregel `scopes` (Admin-UI `DiscoverTopicsTab.js`, Nachtlauf, Rotation), privates Attributionsdokument | offen |
| 6 | Namensanzeige auf Karte und im Stapel | offen |

Nach jedem PR: Tech-Check-Dashboard aktualisieren (Befunde und `umsetzungen`, siehe `CLAUDE.md`),
Tabelle hier nachziehen.

## Offen

- Sperrfrist (30 Tage) und Rate-Limit pro Absender: zusätzlich zum Blockieren oder ersetzt es sie?
- Push bei neuer Anfrage im MVP oder später (nutzt `backgroundUpdatesEnabled`)?
- Abgelehnte Anfrage bleibt dauerhaft „Angefragt" und der Name dauerhaft ein Link. Akzeptabel?
- Zustimmungsdialog im Kochtagebuch (in der Skizze ohne).
- Datenschutzerklärung um Follow und proaktive Ausspielung ergänzen, vor dem Rollout (Text liefert Claude, Freigabe beim Eigentümer).
- Wie viele Plätze bekommen Gefolgte in der Liste (aktuell 5 Plätze, Themen ersetzt oder ergänzt)?

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
