# Vorhaben: Weinbegleitung (Menüs und Einzelrezepte)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 14.11.2026 (PR 1 bis 5, die Nachbesserung am Rezept-Sheet und die Kalibrierung der Süße gemergt und deployt; PR 6, Rot- und Weißwein-Option je Gang im Menü, in Arbeit).

**Ziel:** Zu einem Menü (Festtafel) schlägt die App pro Gang einen passenden Weinstil vor, mit bis zu
zwei Alternativen, einer kurzen Begründung und einem Quellenlink. Dazu gibt es den Modus „Ein Wein für
alles“. Jede Rezeptseite zeigt den passenden Weinstil zum einzelnen Gericht. Empfohlen werden nur
Weinstile mit Rebsorten-Beispielen, nie konkrete Flaschen, Erzeuger, Jahrgänge oder Preise.

**Konzept für Menschen:** https://claude.ai/artifact/5DEpHodccZomvc4QphShNP

**Designentwürfe:** https://claude.ai/artifact/P83hL2onNBiX1k9LpuSbQC (drei Varianten für Rezept- und
Menüansicht, dazu die Zustände). Keine Mockups im Repo.

## Entschieden

| Thema | Entscheidung |
|---|---|
| Architektur | Gericht-Profil `recipes/{id}.weinprofil` schätzt ein Callable per Gemini (nur Werte aus festen Listen, nie Weinnamen), nur bei Bedarf, gecacht über `inputHash`. Wissensbasis statisch und versioniert im Repo (`src/data/weinbegleitung/`), keine Firestore-Collection. Engine als reine Client-Funktion (`src/utils/weinbegleitung/`). Menü: Snapshot `menus/{id}.weinbegleitung`. Einzelrezept: kein Snapshot, die Empfehlung entsteht beim Anzeigen. Anzeigen löst nie einen KI-Aufruf aus. |
| Sheet-Nachbesserung (14.11.2026, Eigentümer) | Keine Quellenlinks mehr im Sheet (Gründe nur als Text), kein Fußsatz „Empfohlen werden Weinstile …“. Kein „Schließen“-Knopf: mobil schließt das Sheet nur per Wischen nach unten am Griff oben mittig (Antippen von Hintergrund oder Griff schließt nicht); Desktop weiter über Hintergrund und Escape. Eigene Icons für Rot- und Weißwein über die Button-Icons (`weinRot`, `weinWeiss`, Gruppe „Rezept-Details“, je mit Dunkelmodus-Variante); leer = eingebautes Glas, Rosé bleibt beim Glas. Damit gilt Akzeptanzkriterium (3) nur noch für die Gründe, nicht mehr für den Quellenlink. |
| Design | **Variante B** (14.11.2026). Rezept: Chip „Wein: <Stil>“ in eigener Zeile direkt unter der Metadatenzeile (die Metadatenzeile bricht nicht um und ist auf dem Handy voll; Vorschlag vom 14.11.2026 ohne Widerspruch übernommen), auf breiten Bildschirmen öffnet ein mittiges Fenster statt des Bottom-Sheets; Antippen öffnet ein Sheet mit Stil, zwei Beispielen, Trinktemperatur, Label, Kennwerten (Körper, Gerbstoff, Süße), „Warum passt das?“ mit Quellenlinks und den Alternativen (nur Anzeige). Menü: Weinzeile direkt unter jeder Gang-Überschrift, aufklappbar mit Gründen und Alternativen (Antippen tauscht und fixiert); vor dem ersten Gang eine Zusammenfassung mit Umschalter „Pro Gang“ / „Ein Wein für alles“. Variante A (Karte unter den Schritten, Block in „Drinks“) war am selben Tag kurz gewählt und ist verworfen. |
| Rollen ohne Wein | `ROLLEN_OHNE_WEIN` = getraenk, sauce_dip, beilage, gebaeck_kuchen (Einzelrezept: keine Karte). Im Menü zählen nur Getränke nicht mit. |
| Engine-Startwerte | Wie in der Spezifikation unten. Die Golden-Tests G1 bis G9 und E1 bis E3 sind mit den Startwerten grün, eine Kalibrierung war nicht nötig (Scores in den Umsetzungsnotizen zu PR 1). |
| Kalibrierung Süße (14.11.2026, Eigentümer: „es wird immer Süßwein vorgeschlagen“) | `RULES_VERSION` `2026-11-2`. (1) Süßweine (`suesswein_edel`, `likoerwein`) kommen nur zu Dessert und Käse infrage: Feld `nurZu` in `stile.json` (Rolle `dessert`, Hauptkomponente `dessert_*`, `kaese_blau`, beim Likörwein zusätzlich `kaese_hart`), unabhängig vom Score. (2) R3 bei zu wenig Süße im Wein: Strafe 1, 3, 6 je Abstand 1, 2, 3 statt 3 je Stufe. (3) Gang-Profil: Beilagen und Saucen (`beilage`, `sauce_dip`) heben Intensität und Komponenten höchstens um eine Stufe über die tragenden Rezepte; das Leitrezept kommt aus den tragenden. (4) Sauce: die des Leitrezepts; nur wenn es keine hat, die eines Rezepts mit Rolle `sauce_dip` (Abweichung von der Spezifikation: Preiselbeeren ersetzten den Wildjus). (5) Menüfolge: Süße fällt kostet 1 je Stufe statt pauschal 3. Golden-Tests G10 bis G15 halten das fest. Gespeicherte Menü-Weinbegleitungen gelten danach als veraltet; „Neu berechnen“ kostet keinen KI-Aufruf, weil die Profile gültig bleiben. |
| R8 als Grund | Abweichung von der Spezifikation: R8 erscheint nur, wenn die Farbe zur Aussage der Regel passt (rot zu `rind_lamm`/`wild`; weiß zu Fisch, Meeresfrüchten, Geflügel, Schwein/Kalb). Sonst stünde „Zu kräftigem Fleisch passt eher Rotwein …“ unter einem Süßwein zum Dessert. |
| Gründe | Bedingungen ohne eigenen Punktbeitrag (R1, R2, R3, R5, R9, R10) haben ein festes Gewicht (Konstanten `GRUND_GEWICHT_*`). R10 erscheint im Menü, wenn sich die Folge gegenüber dem vorherigen Gang mit Wein ohne Strafe steigert. |
| „Ein Wein“ ohne gemeinsamen Stil | Ergänzung: Erreicht kein Stil `S_MIN` in allen Nicht-Dessert-Gängen, bekommen sie den Hinweis `keinGemeinsamerStil`, statt einen schlechten Stil zu erzwingen. Gänge, zu denen gar kein Stil passt (R11), bleiben aus der gemeinsamen Wahl heraus. |
| Fixierungen | Zuordnung über Index und Sektionsnamen. Nach dem Verschieben einer Sektion genügt der Name, wenn er im Menü eindeutig ist; Umbenennen hebt die Fixierung auf. |
| Menü-Entscheidungen | 14.11.2026, Vorschläge ohne Widerspruch übernommen: Zusammenfassung und Umschalter stehen vor dem ersten Gang (nicht in „Drinks“). Im Modus „Ein Wein“ tauscht das Antippen einer Alternative den gemeinsamen Stil aller Nicht-Dessert-Gänge; Alternativen eines Dessert-Gangs sind dort nur Anzeige. Sektionen nur aus Beilagen oder Saucen bekommen wie spezifiziert einen eigenen Wein (nur Getränke zählen nicht). „Fixierung lösen“ hebt einen fixierten Gang wieder auf. |
| Snapshot-Felder | Zusätzlich zur Spezifikation: `gemeinsamerStilId` (Modus „Ein Wein“), `fixierungen` (Pro-Gang-Fixierungen, bleiben beim Moduswechsel erhalten), `gewaehlterGemeinsamerStilId` (vom Nutzer gewählter gemeinsamer Stil) und je Gang `istDessert`. Scores und Strafen werden nicht gespeichert. Seit PR 6 ersetzt je Gang `optionen` (`stilId`, `farbe`, `label`, `regelIds`) die `alternativen`; alte Snapshots zeigen bis „Neu berechnen“ nur die Empfehlung. |
| Menü-Optionen | 14.11.2026, Eigentümer: Je Gang stehen offen die Empfehlung und immer eine Rot- und eine Weißwein-Option (die Empfehlung zählt mit; bei einer Rosé-Empfehlung oder ohne Empfehlung beide Farben), jede mit drei Rebsorten. Eine Option muss für den Gang infrage kommen (`nurZu`), darf aber unter `S_MIN` liegen und heißt dann „passt bedingt“ (beim Aufklappen: „Die beste Wahl in dieser Farbe, aber kein idealer Partner für diesen Gang.“). Gänge ohne passenden Stil (R11) zeigen den Hinweis und trotzdem beide Farben. Im Modus „Ein Wein“ kommen die Optionen der Hauptgänge aus der gemeinsamen Rangliste, das Dessert hat eigene. Aufklappen zeigt die Gründe ohne Quellen (wie im Rezept-Sheet); Bearbeiter legen dort eine Option als Empfehlung fest (fixiert wie bisher das Tauschen). Die Rezeptansicht bleibt bei zwei Rebsorten und den bisherigen Alternativen. Dritte Rebsorte für die vier Stile mit nur zwei Beispielen: Verdejo, Viognier, Zweigelt Rosé, Trollinger (fachlich gegenzulesen); `RULES_VERSION` `2026-11-3`. |
| Seite „Weinbegleitung“ | 14.11.2026 (PR 5): Kachel „Weinbegleitung“ unter „Chefkoch & mehr“ für alle Angemeldeten, als Unterseite wie „Mein Netzwerk“ (ohne neue Route in `App.js`). Inhalt: wie die Empfehlung entsteht, die Regeln mit Quellen (dieselben Gründe wie unter „Warum passt das?“), die zwölf Weinstile mit Beispielen und Temperatur, die Quellen und der Stand der Regeln. Admins starten dort auch den Backfill; der Küchenbetrieb hat dafür keinen passenden Reiter. |
| Backfill | 14.11.2026 (PR 5): `backfillWeinprofile` nur für Admins, je Aufruf eine Seite (Standard 20, höchstens 40 Rezepte) nach Dokument-ID mit Cursor, beim ersten Aufruf die Gesamtzahl per Zählabfrage. Aktuelle Profile werden übersprungen (kein KI-Aufruf, kein Limit), jedes geschätzte Rezept zählt gegen das Tageslimit des Admins (`aiWeinprofilLimits`, 5000). Ist das Limit erreicht, endet die Seite vor dem ersten Rezept ohne Kontingent, der Cursor zeigt auf das letzte bearbeitete. Der Client ruft Seite für Seite; „Anhalten“ wirkt nach der laufenden Seite, „Fortsetzen“ macht am Cursor weiter, „Von vorn prüfen“ versucht fehlgeschlagene Rezepte erneut. |
| Freigabe-Seiten | 14.11.2026 (PR 5): Sie zeigen nur Ergebnisse (Snapshot im Menü, Chip und Sheet beim Rezept). Der Hinweis „veraltet“ entfällt dort, weil Gäste nichts neu berechnen können; für angemeldete Leser in der App bleibt er. |
| Versionierung | `RULES_VERSION` startet mit `2026-11-1`. `wissensbasis.test.js` prüft einen Fingerabdruck über Stile, Regeln und Engine-Konstanten: Inhalt geändert, Version nicht erhöht, Test rot. |
| Phase-1-Vorschläge | Am 14.11.2026 ohne Widerspruch übernommen; (1) bis (3) sind mit PR 2 umgesetzt, (4) und (5) mit PR 4. (1) Firestore-Regel: Clients dürfen `weinprofil` nicht ändern (`affectedKeys`); dieselbe Regel schützt `ratingAvg`/`ratingCount` (Tech-Check S29). (2) Das Callable prüft je Rezept die Sichtbarkeit (`isVisibleToUser`), weil `requireAiCaller` nur die Rolle prüft. (3) Das Tageslimit zählt je geschätztes Rezept, nicht je Aufruf. (4) Der Button „Weinbegleitung erstellen“ hängt an `canEditMenu`. (5) Alte Menüs ohne Sektionen bilden einen Gang „Alle Rezepte“. Dazu: Veraltet-Erkennung über die Hash-Funktion, nicht über `updatedAt` (das setzen auch Freigabe und Vorschaubild); `backfillWeinprofile` mit Cursor (Muster `backfillRecipeThumbnails` taugt nicht, Tech-Check F20). |

## Spezifikation (Kurzfassung)

**Gericht-Profil** `recipes/{id}.weinprofil` (schreibt nur die Cloud Function; Listen in `src/utils/weinbegleitung/profilSchema.js`):
`rolle`, `hauptkomponente`, `zubereitung`, `sauce` (je aus fester Liste), `intensitaet` 1–5, `komponenten`
(`saeure`, `suesse`, `salz`, `fett`, `schaerfe`, `bitter`, `umami`, je 0–3), `konfidenz` 0–1, Metadaten
`inputHash` (sha256 über title, Zutaten-Texte, steps, speisekategorie, kulinarik), `modell`,
`schemaVersion` 1, `erstelltAm`. Gemini mit temperature 0, `responseMimeType` application/json und
`responseSchema` mit genau diesen Listen; die `speisekategorie` geht nur als Hinweis für die Rolle in den
deutschen Prompt (Kategorien sind frei konfigurierbar). Ungültige Antworten verwerfen, nicht raten.

**Callables:** `generateWeinprofile` mit `recipeIds` (max. 20, der Client teilt auf), Rolle ab edit über
`requireAiCaller`, Tageslimit `aiWeinprofilLimits` über `consumeDailyQuota` (Grenzen wie `aiNutritionLimits`,
fail closed). Je Rezept: gleicher Hash → überspringen, sonst Gemini und `weinprofil` per Merge schreiben;
Parallelität begrenzt. Rückgabe: Profile je `recipeId`, Listen der übersprungenen und fehlgeschlagenen IDs.
`backfillWeinprofile` nur für admin, in Batches mit Fortschritt.

**Engine:** Gang = Sektion in Menü-Reihenfolge mit mindestens einem Rezept, ohne „Drinks“, Getränke zählen
nicht. Tragend sind alle Rezepte außer Beilagen und Saucen (gibt es keins, tragen alle). Leitrezept =
Hauptgericht, sonst das tragende mit der höchsten Intensität; Hauptkomponente, Zubereitung und Sauce vom
Leitrezept, hat es keine Sauce, die eines Rezepts mit Rolle `sauce_dip`; Intensität und Komponenten als
Maximum der tragenden Rezepte, Beilagen und Saucen heben sie um höchstens eine Stufe (seit 14.11.2026).
Score je Stil: Passung der Tags (stark +3, gut +2, sonst +1, meiden −3; Gewicht sc 1,0 nur mit Sauce, hk 0,8
mit Sauce sonst 1,0, zb 0,5) plus R1 bis R6 und R9 (Werte in `konstanten.js`). Labels ab `S_TOP` 5,5
„passt hervorragend“, ab `S_GUT` 3,5 „passt gut“, sonst „passt“; Kandidaten ab `S_MIN` 1,5 und nur Stile, die
laut `nurZu` infrage kommen (Süßweine nur zu Dessert und Käse). Menüfolge: je Gang die vier besten
Kandidaten, bis sechs Gänge alle Kombinationen, darüber greedy; Strafen gegenüber dem vorherigen Gang mit
Wein (Körper fällt um mehr als 1: −2; rot vor weiß/rosé: −2, außer Süße 3; Süße fällt: −1 je Stufe; gleicher
Stil: −1). „Ein Wein“: höchstes Minimum über die Nicht-Dessert-Gänge (Gleichstand: höhere Summe), nur Stile,
die für alle diese Gänge infrage kommen; Dessert-Gänge (Rolle dessert/gebaeck_kuchen oder Name enthält
„Dessert“) eigenständig.

**Snapshot** `menus/{id}.weinbegleitung` (schreibt der Client ab Rolle edit): `modus` (`proGang`/`einWein`),
`gaenge` [{`sektionIndex`, `sektionName`, `stilId` oder null, `alternativen`, `label`, `regelIds`, `fixiert`,
`hinweis`}], `rulesVersion`, `inputHash` (Sektionsnamen, recipeIds, Profil-`inputHash` je Rezept,
`rulesVersion`), `erstelltAm`, `erstelltVon`. Veraltet, wenn der Hash abweicht oder ein Rezept nach seinem
Profil geändert wurde (gleiche Hash-Funktion in Client und Functions, Konsistenztest wie `sprachen.js`).

**UI (Variante B):** Siehe „Design“ oben. Ohne Profil sieht nur, wer ab Rolle edit ist, „Passenden Wein
finden“; bei veraltetem Profil „neu einschätzen“. R11-Fall: „Hier lieber Bier oder Wasser“. Ladezustand mit
kurzer CSS-Animation (Glas füllt sich), die `prefers-reduced-motion` respektiert. Leser und Freigabe-Seiten
zeigen nur Ergebnisse ohne Buttons; Gäste lösen nie einen KI-Aufruf aus. Neutrale Sprache, keine
Kaufaufforderung, Texte auf Deutsch.

**Akzeptanzkriterien:** (1) Ab Rolle edit entsteht für ein Menü mit mindestens zwei Gängen eine
Weinbegleitung; fehlende Profile kosten einen Callable-Aufruf je 20 Rezepte. (2) Erneutes Öffnen löst keinen
KI-Aufruf aus. (3) Jeder empfohlene Stil zeigt mindestens einen Grund (Quellenlinks seit 14.11.2026 nicht mehr im Sheet). (4) Nach einer
Änderung erscheint „veraltet“; „Neu berechnen“ schätzt nur Rezepte mit geändertem Hash neu. (5) Rezept mit
aktuellem Profil: Karte sofort; ohne Profil sieht nur, wer ab Rolle edit ist, den Button; bei Getränken,
Saucen, Beilagen und Kuchen keine Karte. (6) Nirgends Flaschen, Erzeuger, Jahrgänge oder Preise. (7) Leser
und Freigabelinks sehen Ergebnisse, Gäste lösen keinen KI-Aufruf aus. (8) `npm run lint:ci`,
`npm run test:ci` und die Function-Tests grün.

**Nicht-Ziele:** Shop- oder Affiliate-Links, externe Wein-APIs, Scraping, Chat-Sommelier, Mengenplanung,
alkoholfreie Begleitung (Feld `alkoholfrei` je Stil ist vorbereitet), Profil-Korrektur durch Nutzer,
Snapshot oder Fixieren beim Einzelrezept.

## Stand der Umsetzung

| PR | Inhalt | Stand |
|---|---|---|
| 1 | Tracker, Wissensbasis (`src/data/weinbegleitung/`), Engine (`src/utils/weinbegleitung/`) mit Tests: Regeln einzeln, Gang-Bildung, Menüfolge, „Ein Wein“, Fixierung, Einzelrezept, Golden G1–G9 und E1–E3, Datenprüfung mit Fingerabdruck. Noch ohne UI. | PR #3660 gemergt (14.11.2026), 129 neue Tests |
| 2 | Callable `generateWeinprofile` (`functions/handlers/weinbegleitung.js`, Helfer `functions/shared/weinprofil.js`; Gemini, Tageslimit `aiWeinprofilLimits`), Hash-Funktion im Client (`profilHash.js`) mit Konsistenztest gegen die Function, Firestore-Regeln (`weinprofil`, `ratingAvg`, `ratingCount` nur per Function, Tech-Check S29) mit Rules-Tests, `docs/architecture/security.md` | PR #3661 gemergt und deployt (14.11.2026, v2.69.0, Deploy-Lauf 2034: Function `generateWeinprofile` angelegt, Rules veröffentlicht); Function-Tests +19, Client-Tests +18, Rules-Tests +1 und erweitert |
| 3 | Rezeptansicht nach Variante B: `src/components/WeinDazu.js` (Chip, Sheet, „Passenden Wein finden“, „Neu einschätzen“, Laden, R11, veraltet), Helfer `anzeige.js` und `weinprofilCallable.js`, Farb-Tokens `--color-wein-*`, Einbindung in `RecipeDetail.js` (3 Zeilen) | PR #3662 gemergt und deployt (14.11.2026, v2.70.0, Deploy-Lauf 2035); vom Eigentümer live getestet (14.11.2026, „Passenden Wein finden“ erfolgreich, damit auch das Callable aus PR 2 gegen die echte Gemini-API geprüft); Komponententests +15, Util-Tests +8. Nachbesserung (Quellen und Fußsatz raus, Wischen statt „Schließen“, Icons `weinRot`/`weinWeiss`): PR #3664 gemergt und deployt (14.11.2026, v2.72.0, Deploy-Lauf 2037), Komponententests +3 |
| 4 | Menü nach Variante B: `src/components/Weinbegleitung.js` (Zusammenfassung, Weinzeile je Gang), Hook `src/hooks/useMenueWeinbegleitung.js`, Utils `menue.js` (Snapshot, Menü-Hash, Zuordnung), `saveMenuWeinbegleitung` in `menuFirestore.js`, gemeinsame Bausteine `WeinbegleitungTeile.js` (aus `WeinDazu.js` herausgelöst); `MenuDetail.js` (+9/−2 Zeilen) nutzt jetzt `DRINKS_SECTION_NAME` aus `menuSections.js` | PR #3663 gemergt und deployt (14.11.2026, v2.71.0, Deploy-Lauf 2036); vom Eigentümer live getestet (14.11.2026); Komponententests +13, Util-Tests +12 |
| K | Kalibrierung der Süße (siehe „Entschieden“): `nurZu` in `stile.json`, `kommtInfrage`/`istKandidat` in `bewertung.js`, R3 gestuft, Gang-Profil mit tragenden Rezepten und gedämpften Beilagen/Saucen, Sauce vom Leitrezept, Süße-Strafe der Menüfolge je Stufe; `RULES_VERSION` `2026-11-2` | PR #3666 gemergt und deployt (14.11.2026, Merge d7145c2, v2.73.2, Deploy-Lauf 2040); Util-Tests +19 (u. a. Golden G10 bis G15 und Prüfung über alle herzhaften Kombinationen) |
| 5 | Seite „Weinbegleitung“ unter „Chefkoch & mehr“ (`src/components/WeinbegleitungSeite.js`, Kachel in `Kueche.js`) mit Regeln, Weinstilen, Quellen und dem Admin-Backfill; Callable `backfillWeinprofile` mit Cursor (F20) und Hook `useWeinprofilBackfill.js`; Freigabe-Seiten ohne Veraltet-Hinweis; Zeitlimit für die Callables im Client | PR #3667 gemergt und deployt (14.11.2026, Merge d2817c3, v2.74.0, Deploy-Lauf 2041: Function `backfillWeinprofile` angelegt); Function-Tests +12, Komponententests +15, Util-Tests +6 |
| 6 | Menü: je Gang offen die Empfehlung und je eine Rot- und Weißwein-Option mit drei Rebsorten, Gründe ohne Quellen (Wunsch des Eigentümers, siehe „Menü-Optionen“): `farbOptionen` und `labelFuerOption` in `engine.js`, Snapshot-Feld `optionen` in `menue.js`, `WeinbegleitungGang` in `Weinbegleitung.js`; dritte Rebsorte für vier Stile, `RULES_VERSION` `2026-11-3` | in Arbeit (Branch `claude/intelligent-shannon-t5cts5`) |

Nach jedem PR: Tabelle nachziehen. Berührt ein PR einen Tech-Check-Befund (S29 mit PR 2, F20 mit PR 5),
das Dashboard aktualisieren (siehe `CLAUDE.md`).

Umsetzungsnotizen PR 1:
- API für die UI: `empfehlungFuerRezept(rezept)` bzw. `empfehlungFuerWeinprofil(profil)` liefert `status`
  (`ok`, `ohneProfil`, `rolleOhneWein`, `keinStil`) und bei `ok` `stilId`, `score`, `label`, `regelIds` und
  `alternativen` (je mit `regelIds`, damit das Sheet auch für Alternativen „Warum passt das?“ zeigen kann).
  `berechneWeinbegleitung({menu, rezepte, modus, fixierungen, gemeinsamerStilId})` liefert `modus`,
  `rulesVersion` und je Gang die Snapshot-Felder plus `score`, `strafe`, `istDessert`; im Modus „Ein Wein“
  zusätzlich `gemeinsamerStilId`. `inputHash`, `erstelltAm` und `erstelltVon` ergänzt PR 4.
- Anzeige-Helfer in `wissensbasis.js`: `getStil`, `getRegel`, `quellenFuerRegel`, `formatTemperatur`
  („16–18 °C“), `beispieleKurz` (zwei Beispiele).
- Scores der Golden-Gerichte (bester / zweitbester Stil): G1 `weiss_leicht_frisch` 5,8 /
  `weiss_gruen_aromatisch` 4,3; G2 `weiss_mild_mittel` 5,4 / 4,1; G3 `weiss_aromatisch_feinherb` 5,1 /
  `suesswein_edel` 0,3; G4 `rot_leicht` 5,4 / `weiss_voll` 2,6; G5 `rot_kraeftig` 7,9 / `rot_mittel` 2,6;
  G6 `likoerwein` 3,5 / `suesswein_edel` 2,5; G7 `suesswein_edel` 4,9 / 0,3; E3 bester Stil 0,3, also R11.
  G8: `weiss_leicht_frisch` → `rot_kraeftig` → `likoerwein`, Gesamtwert 17,2 ohne Strafe.
  G9: `rot_mittel` für Vorspeise (2,3) und Hauptgang (2,6), Dessert `likoerwein`.
- `DRINKS_SECTION_NAME` steht jetzt in `src/utils/menuSections.js`; `MenuDetail.js` hat noch eine eigene
  Konstante (Umstellung in PR 4).
- Die Stilnamen („Weißwein, leicht und frisch“ usw.) und die Zuordnung Quelle → Stil hat die Spezifikation
  nicht vorgegeben; beides habe ich gesetzt (siehe Offen).

Umsetzungsnotizen PR 2:
- Aufruf: `generateWeinprofile({recipeIds})` mit 1 bis 20 IDs (doppelte zählen einmal). Antwort:
  `profile` (je `recipeId` das gespeicherte oder neue Profil, auch für übersprungene), `uebersprungen`,
  `fehlgeschlagen`, `fehlerGruende` (je ID: `nichtGefunden`, `keinZugriff`, `tageslimit`, `kiFehler`,
  `kiUngueltig`, `speichern`), `remainingRequests`, `dailyLimit`. Ein Fehler trifft nur das betroffene
  Rezept. `resource-exhausted` kommt nur, wenn das Limit erschöpft ist und kein Rezept übersprungen wurde.
- Ablauf je Rezept: Sichtbarkeit (`isVisibleToUser`, Gruppen werden dafür gelesen), Hash bilden, bei
  aktuellem Profil überspringen, sonst ein Zähler aus `aiWeinprofilLimits` (vor dem KI-Aufruf), Gemini
  per REST (`geminiGenerateContentRequest`, temperature 0, JSON mit `responseSchema` aus Enums,
  Zeitlimit 30 s, höchstens 4 gleichzeitig), strenge Prüfung, dann `update({weinprofil})`. `updatedAt`
  bleibt unverändert; `erstelltAm` ist ein Zeitstempel in Millisekunden. `timeoutSeconds` 120.
- Hash: `weinprofilHashEingabe` = JSON aus Kennung `weinprofil-v1`, getrimmtem Titel, Texten der Zutaten
  und Schritte (Strings oder `{text}`, leere entfallen, Überschriften zählen mit), sortierter
  Speisekategorie und Kulinarik (String oder Array). Client: `weinprofilInputHash` (Web Crypto, async) und
  `istWeinprofilAktuell(rezept)` für die Veraltet-Anzeige in PR 3.
- Rules-Tests lokal (Emulator) ausgeführt: die neuen Fälle grün; drei Storage-Tests zu `drinks` scheitern in
  der Arbeitsumgebung auch auf `main` ohne diese Änderungen, in der CI sind sie grün.
- Nicht gegen die echte Gemini-API geprüft (kein Schlüssel in der Arbeitsumgebung). Das `responseSchema`
  nutzt `enum` mit `format: 'enum'` wie in der API-Dokumentation; nach dem Deploy mit einem Rezept prüfen.

Umsetzungsnotizen PR 3:
- Zustände: mit gültigem Profil der Chip „Wein: <Stil>“ (auch für Leser und auf Freigabe-Seiten, die
  RecipeDetail nutzen); R11 als Chip „Hier lieber Bier oder Wasser“; ohne Profil nur ab Rolle edit
  (`canEditRecipes`) und nie mit `isSharedView` der Knopf „Passenden Wein finden“; Rollen ohne Wein und alle
  anderen sehen nichts. Veraltet (Hash weicht ab): Bearbeiter sehen „Neu einschätzen“, Leser den Hinweis
  „Einschätzung veraltet“, im Sheet steht die Änderung als Hinweis. Ohne Web Crypto (z. B. in Jest) bleibt
  „veraltet“ unbekannt, die Empfehlung wird trotzdem gezeigt.
- Das Callable liefert das neue Profil zurück, bevor der Live-Listener das Rezept aktualisiert; die Karte nimmt
  das jüngere von beiden (`neueresProfil`). Fehler aus der Antwort (`fehlerGruende`) und geworfene Fehler
  erscheinen als Text unter dem Chip (`weinprofilFehlertext`).
- Sheet: Stil mit Glas in der Weinfarbe, zwei Beispiele, Trinktemperatur, Label, Kennwerte (Körper,
  Gerbstoff, Süße in Worten), „Warum passt das?“ mit Quellenlinks (neuer Tab), „Zur Auswahl“ mit Empfehlung
  und bis zu zwei Alternativen (Antippen zeigt deren Details, nichts wird gespeichert). Schließen über Knopf,
  Hintergrund oder Escape, der Fokus kehrt zum Chip zurück; Scroll-Sperre und Ausblenden wie bei den anderen
  Sheets (`useModalScrollLock`, `useFadeOutClose`).
- Ladezustand: Glas füllt sich (CSS-Animation), bei „Bewegung reduzieren“ ohne Animation.
- Nachbesserung 14.11.2026: Ziehzone = Griff plus Titel (`touch-action: none`); ab 90 px oder mit Schwung
  (ab 30 px, 0,5 px/ms) schließt das Sheet und gleitet von der aktuellen Position nach unten, sonst federt es
  zurück. Der Griff ist ein Knopf „Schließen“ für Tastatur und Screenreader; das Antippen mit dem Finger
  löst ihn nicht aus (`preventDefault` im `touchend`). Mobil reagiert der Hintergrund nicht auf Antippen.
  `RecipeDetail` reicht `{ rot, weiss }` aus `getEffectiveIcon` (Dunkelmodus beachtet) an `WeinDazu`; das
  Symbol (`WeinSymbol`) und `Gruende` mit `mitQuellen` liegen in `WeinbegleitungTeile.js`. Das Menü
  (`Weinbegleitung.js`) zeigt weiter Quellen und das eingebaute Glas (siehe Offen). Geprüft in iPhone-13-Emulation
  über eine Vorschau-Seite (nicht im Repo).
- Die vier RecipeDetail-Testdateien mocken `userManagement` mit fester Funktionsliste; dort steht jetzt
  `canEditRecipes: () => false`, damit die neue Zeile die bestehenden Tests nicht berührt.
- Im Browser geprüft über eine Vorschau-Seite nur mit `WeinDazu` (Vite, Callable und Rolle als Platzhalter):
  Mobil 390 px und Desktop 1280 px, hell und dunkel, Sheet, Alternative, Laden, Fehler; keine Konsolenfehler.
  Nicht in der echten App mit Login geprüft.

Umsetzungsnotizen PR 4:
- Anzeige aus dem gespeicherten Snapshot, ohne KI-Aufruf; auch Leser und die Freigabe-Seite (`MenuSharePage`
  rendert `MenuDetail` mit `isSharedView`) sehen das Ergebnis, ohne Knöpfe. Erstellen, Neu berechnen,
  Moduswechsel, Tauschen und „Fixierung lösen“ nur mit `canEditMenu` und `canEditRecipes` und nie mit
  `isSharedView`.
- Erstellen und „Neu berechnen“: Der Client prüft je Rezept (ohne Drinks-Sektion) mit `istWeinprofilAktuell`,
  ob das Profil fehlt oder veraltet ist, und schickt nur diese IDs in Blöcken zu 20 an das Callable (ohne
  Web Crypto alle, der Server überspringt Aktuelles). Danach rechnet die Engine mit den neuen Profilen, der
  Snapshot wird gespeichert. Teilweise Fehler erscheinen als Hinweis, der Snapshot wird trotzdem gespeichert;
  hat danach kein Gang ein Profil, wird nichts gespeichert und eine Fehlermeldung erscheint.
- Moduswechsel, Tauschen und „Fixierung lösen“ rechnen nur neu und speichern, ohne KI-Aufruf.
- Veraltet: Der Menü-Hash (`menueHashEingabe`: Kennung `weinbegleitung-v1`, `RULES_VERSION`, je Sektion außer
  Drinks Name und `[recipeId, Profil-inputHash]`) weicht ab, oder ein Rezept wurde nach seinem Profil geändert.
- `MenuDetail` übernimmt das Menü beim Öffnen einmal; der Hook hält deshalb den gespeicherten Snapshot selbst
  nach, damit er sofort sichtbar ist.
- `MenuDetail.test.js` mockt `userManagement` und `menuFirestore` mit fester Liste; dort stehen jetzt
  `canEditRecipes: () => false` und `saveMenuWeinbegleitung`.

Umsetzungsnotizen Kalibrierung Süße (14.11.2026):
- Ursache (nachgestellt mit geschätzten Profilen, nicht mit echten Menüdaten): Herzhafte Gerichte mit etwas
  Süße (Zwiebeln, Äpfel, Honig) bekommen von Gemini Süße 1 oder 2. R3 zog trockenen Weinen dafür 3 bzw. 6
  Punkte ab, einem Süßwein bei Süße 1 aber nur 2 und bei Süße 2 gar nichts. Dazu nahm der Gang das Maximum
  über alle Rezepte, also bestimmte der Apfelrotkohl (Süße 2) oder die Preiselbeeren (Süße 3) die Süße des
  ganzen Hauptgangs, und Preiselbeeren als `sauce_dip` ersetzten den Wildjus. Ein Süßwein früh im Menü zog
  über „Süße fällt: −3“ die folgenden Gänge mit.
- Simulation mit neun typischen Festtagsmenüs (20 herzhafte Gänge, Profile geschätzt, Skript nicht im Repo):
  vorher 5 Gänge mit Süßwein und 4 mit „Bier oder Wasser“ (u. a. Gans mit Rotkohl, Rehrücken mit
  Preiselbeeren, Rinderrouladen mit Rotkohl), „Ein Wein für alles“ einmal Süßwein; nachher 0 und 0. Feinherb
  bleibt dort, wo das Gericht selbst süß ist (Ziegenkäse mit Honig, Ente mit Orangensauce, Bergkäse mit
  Feigensenf). G1 bis G9 und E1 bis E3 sind unverändert grün; die neuen Golden-Tests G10 bis G14 und die
  Prüfung über alle herzhaften Kombinationen sind gegen die alte Engine rot.
- Scores nachher (bester Stil): G10 Gans mit Apfelrotkohl und Klößen `rot_kraeftig` 2,3 („passt“, ohne
  Alternative); G11 Rehrücken mit Preiselbeeren `rot_kraeftig` 1,9; G12 Ziegenkäse mit Honig
  `weiss_aromatisch_feinherb` 3,3; G13 Ente mit Orangensauce `weiss_aromatisch_feinherb` 3,1; G15 Birne mit
  Gorgonzola `suesswein_edel` 3,5. Gans und Reh liegen knapp über `S_MIN` (siehe Offen).
- Foie gras mit Sauternes geht damit nicht mehr (Gänseleber ist Geflügel, kein Dessert); feinherb bleibt dort
  die Empfehlung. Bewusst in Kauf genommen.

Umsetzungsnotizen PR 5:
- Backfill-Aufruf: `backfillWeinprofile({cursor, anzahl})`, Antwort `geprueft`, `neu`, `uebersprungen`,
  `fehlgeschlagen`, `fehlerGruende`, `naechsterCursor` (null, wenn fertig), `fertig`, `tageslimitErreicht`,
  `gesamt` (nur beim ersten Aufruf), `remainingRequests`, `dailyLimit`. Ist das Limit schon vor dem ersten
  Rezept erschöpft, kommt `resource-exhausted`. Schätzen und Speichern teilen sich mit `generateWeinprofile`
  den Helfer `schaetzeUndSpeichere` (nur das Feld `weinprofil`, `updatedAt` bleibt).
- Der Client bricht ab, wenn eine Antwort ohne Fortschritt kommt (nicht fertig, aber kein neuer Cursor), statt
  von vorn zu beginnen. Verlässt man die Seite, endet der Lauf nach der laufenden Seite.
- Zeitlimits im Client: `generateWeinprofile` 125 s (Function 120 s; 20 Rezepte brauchen bis zu fünf
  Gemini-Runden), `backfillWeinprofile` 310 s (Function 300 s). Vorher galt der SDK-Standard von 70 s.
- Freigabe: `getSharedMenuByShareId`, `getSharedRecipesByIds` und `getSharedRecipeByShareId` liefern
  `weinbegleitung` und `weinprofil` mit; ein Function-Test sichert das ab. Gäste lösen weiter keinen KI-Aufruf
  aus (Knöpfe nur mit Rolle ab edit und nie mit `isSharedView`).
- Die Weinstile auf der Seite nennen die Einschränkung aus der Kalibrierung (`nurZu`, Helfer `nurZuText` in
  `anzeige.js`): Likörwein „nur zu Dessert und Käse“, edelsüß „nur zu Dessert und Blauschimmelkäse“.
- Im Browser geprüft über eine Vorschau-Seite mit Kachel und Seite (Vite, Callable und Symbole als
  Platzhalter): Mobil 390 px und Desktop 1280 px, hell und dunkel, Backfill mit Fortschritt, Fertig mit
  Fehlschlag; keine Konsolenfehler, keine waagrechte Scrollleiste. Nicht in der echten App mit Login geprüft.

## Offen

- **Fachlich gegenlesen (Eigentümer):** Kennwerte, Passungen und Beispiele der zwölf Stile (neu seit PR 6: Verdejo,
  Viognier, Zweigelt Rosé, Trollinger als dritte Rebsorte), die Regeltexte,
  die Stilnamen, die Zuordnung Quelle → Stil (vorläufig: deutsche Rebsorten auf das DWI-Seminarhandbuch,
  sonst Wine Folly) und die Schwellen. Auffällig: G9 empfiehlt im Modus „Ein Wein“ zu Lachstatar und
  Rinderschmorbraten einen mittelkräftigen Rotwein (Label „passt“). Das entspricht der Regel „höchstes
  Minimum“, wirkt aber fachlich gewagt.
- **Nach der Kalibrierung prüfen (Eigentümer):** In den echten Menüs „Neu berechnen“ und die Empfehlungen
  gegenlesen. Die Kalibrierung beruht auf geschätzten Profilen; die echten Gemini-Werte für Süße kennt das
  Repo nicht. Gans und Reh landen knapp über `S_MIN` – sind die Weine dort zu schwach begründet, wäre der
  nächste Hebel die Passung (z. B. `rot_leicht` zu Gans) statt weiterer Regeln.
- **Süße-Skala im Prompt verankern?** Der Prompt sagt nur „0 (nicht vorhanden) bis 3 (stark)“. Eine
  Verankerung (1 = Spur wie bei Zwiebeln oder Möhren, 2 = deutlich wie bei Glasur oder Fruchtsauce,
  3 = Dessert) machte die Schätzung stabiler, braucht aber einen Functions-Deploy und eine neue
  `HASH_KENNUNG`, also eine Neueinschätzung aller Rezepte. Entscheidung beim Eigentümer.
- **Menü an Rezept-Sheet angleichen?** Die Quellen sind mit PR 6 im Menü weg. Offen ist nur noch, ob das Menü
  auch die Icons `weinRot`/`weinWeiss` nutzen soll (vorbereitet: `WeinSymbol`). Entscheidung beim Eigentümer.
- **Quellen ungeprüft und sichtbar:** Im Rezept-Sheet stehen seit 14.11.2026 (#3664) keine Quellen mehr, im Menü
  noch. PR 5 bringt sie auf die Seite „Weinbegleitung“ unter „Chefkoch & mehr“ (Regeln mit Quellen und Quellenliste),
  wie in der Spezifikation geplant; der Eigentümer hat das nach Rückfrage ohne Änderungswunsch mergen lassen
  (14.11.2026). Die acht URLs sind aus der Arbeitsumgebung nicht erreichbar: Die Netzwerkregel sperrt alle sechs
  Hosts (wsetglobal.com, www.decanter.com, winefolly.com, symphonia-typo3-prod.deutscheweine.de, ichkoche.de,
  g-wie-gastro.de). Einmal durchklicken (Eigentümer).
  `abgerufenAm` bleibt `null`, bis jemand den Inhalt gegen die Regeln geprüft hat; das Datum erscheint dann auf
  der Seite.
- **Tech-Check F20, Rest:** `backfillRecipeThumbnails` liest weiter ohne Cursor (kein Aufrufer in `src/`).
  `backfillWeinprofile` hat den Cursor von Anfang an. Entfernen oder nachrüsten: Entscheidung beim Eigentümer.
- **Tech-Check S29, Rest:** Beim Anlegen eines Rezepts sind `ratingAvg`, `ratingCount` und `weinprofil` weiter
  frei. Schließen hieße, den Sammelimport (`handleBulkImportRecipes`) anzupassen; Import-Pfade sind laut
  Spezifikation tabu. Vorschlag: so lassen (Risiko gering), Entscheidung beim Eigentümer.

## Wichtige Stellen im Code

- Wissensbasis: `src/data/weinbegleitung/` (`stile.json`, `regeln.json`, `quellen.json`)
- Rezeptansicht: `src/components/WeinDazu.js` und `.css`, eingebunden in `RecipeDetail.js` nach der Metadatenzeile
- Menü: `src/components/Weinbegleitung.js` und `.css`, Hook `src/hooks/useMenueWeinbegleitung.js`, eingebunden in `MenuDetail.js` (Zusammenfassung vor `displaySections.map`, Weinzeile nach `section-title-row`); gemeinsame Bausteine `src/components/WeinbegleitungTeile.js`
- Seite „Weinbegleitung“: `src/components/WeinbegleitungSeite.js` und `.css`, Hook `src/hooks/useWeinprofilBackfill.js`, Kachel und Unterseite in `src/components/Kueche.js`; Backfill-Function in `functions/handlers/weinbegleitung.js`
- Engine: `src/utils/weinbegleitung/` (`konstanten.js`, `profilSchema.js`, `wissensbasis.js`, `bewertung.js`,
  `gang.js`, `engine.js`), Tests daneben, Profil-Fixtures in `__fixtures__/profile.js`
- Andockpunkte: Rezept `src/components/RecipeDetail.js` (Metadatenzeile `recipe-metadata`); Menü
  `src/components/MenuDetail.js` (`displaySections.map`, Sektionstitel `section-title-row`; die Drinks-Sektion
  wird ausgeblendet, wenn sie leer ist und kein Event verknüpft ist)
- Menü-Daten: `src/utils/menuFirestore.js` (`updateMenu`), `src/utils/menuSections.js`
- Freigabe: `functions/handlers/sharing.js` (`getSharedRecipeByShareId`, `getSharedMenuByShareId`,
  `getSharedRecipesByIds` geben ganze Dokumente zurück, neue Felder kommen ohne Änderung mit);
  `src/components/MenuSharePage.js`
- KI-Muster: `functions/handlers/nutrition.js`, `functions/shared/auth.js` (`requireAiCaller`),
  `functions/shared/rateLimit.js` (`consumeDailyQuota`), `functions/shared/geminiConfig.js`,
  `functions/shared/secrets.js`; Sichtbarkeit: `isVisibleToUser` in `functions/fuerDichEntdecktRotation.js`
- Rules: `firestore.rules` (`match /recipes/{recipeId}`), Rules-Tests in `rules-tests/`
- Trigger: Auf Änderungen an `recipes` reagiert keiner (nur `onDocumentCreated` in
  `functions/handlers/importShortcut.js`); das Schreiben von `weinprofil` löst nichts aus.
