# Vorhaben: Weinbegleitung (Menüs und Einzelrezepte)

Tracker nach `CLAUDE.md`. Hier steht, was entschieden, was erledigt und was offen ist.
Zu Beginn jeder Arbeit daran zuerst lesen, nicht auf alte Chats verlassen. Stand: 14.11.2026 (PR 1 bis 3 gemergt, Nachbesserung am Rezept-Sheet in Arbeit).

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
| Design | **Variante B** (14.11.2026). Rezept: Chip „Wein: <Stil>“ in eigener Zeile direkt unter der Metadatenzeile (die Metadatenzeile bricht nicht um und ist auf dem Handy voll; Vorschlag vom 14.11.2026 ohne Widerspruch übernommen), auf breiten Bildschirmen öffnet ein mittiges Fenster statt des Bottom-Sheets; Antippen öffnet ein Sheet mit Stil, zwei Beispielen, Trinktemperatur, Label, Kennwerten (Körper, Gerbstoff, Süße), „Warum passt das?“ mit Quellenlinks und den Alternativen (nur Anzeige). Menü: Weinzeile direkt unter jeder Gang-Überschrift, aufklappbar mit Gründen und Alternativen (Antippen tauscht und fixiert); darüber eine Zusammenfassung mit Umschalter „Pro Gang“ / „Ein Wein“. Variante A (Karte unter den Schritten, Block in „Drinks“) war am selben Tag kurz gewählt und ist verworfen. |
| Rollen ohne Wein | `ROLLEN_OHNE_WEIN` = getraenk, sauce_dip, beilage, gebaeck_kuchen (Einzelrezept: keine Karte). Im Menü zählen nur Getränke nicht mit. |
| Engine-Startwerte | Wie in der Spezifikation unten. Die Golden-Tests G1 bis G9 und E1 bis E3 sind mit den Startwerten grün, eine Kalibrierung war nicht nötig (Scores in den Umsetzungsnotizen zu PR 1). |
| R8 als Grund | Abweichung von der Spezifikation: R8 erscheint nur, wenn die Farbe zur Aussage der Regel passt (rot zu `rind_lamm`/`wild`; weiß zu Fisch, Meeresfrüchten, Geflügel, Schwein/Kalb). Sonst stünde „Zu kräftigem Fleisch passt eher Rotwein …“ unter einem Süßwein zum Dessert. |
| Gründe | Bedingungen ohne eigenen Punktbeitrag (R1, R2, R3, R5, R9, R10) haben ein festes Gewicht (Konstanten `GRUND_GEWICHT_*`). R10 erscheint im Menü, wenn sich die Folge gegenüber dem vorherigen Gang mit Wein ohne Strafe steigert. |
| „Ein Wein“ ohne gemeinsamen Stil | Ergänzung: Erreicht kein Stil `S_MIN` in allen Nicht-Dessert-Gängen, bekommen sie den Hinweis `keinGemeinsamerStil`, statt einen schlechten Stil zu erzwingen. Gänge, zu denen gar kein Stil passt (R11), bleiben aus der gemeinsamen Wahl heraus. |
| Fixierungen | Zuordnung über Index und Sektionsnamen. Nach dem Verschieben einer Sektion genügt der Name, wenn er im Menü eindeutig ist; Umbenennen hebt die Fixierung auf. |
| Versionierung | `RULES_VERSION` startet mit `2026-11-1`. `wissensbasis.test.js` prüft einen Fingerabdruck über Stile, Regeln und Engine-Konstanten: Inhalt geändert, Version nicht erhöht, Test rot. |
| Phase-1-Vorschläge | Am 14.11.2026 ohne Widerspruch übernommen; (1) bis (3) sind mit PR 2 umgesetzt, für (4) und (5) ist ein Veto bis PR 4 möglich. (1) Firestore-Regel: Clients dürfen `weinprofil` nicht ändern (`affectedKeys`); dieselbe Regel schützt `ratingAvg`/`ratingCount` (Tech-Check S29). (2) Das Callable prüft je Rezept die Sichtbarkeit (`isVisibleToUser`), weil `requireAiCaller` nur die Rolle prüft. (3) Das Tageslimit zählt je geschätztes Rezept, nicht je Aufruf. (4) Der Button „Weinbegleitung erstellen“ hängt an `canEditMenu`. (5) Alte Menüs ohne Sektionen bilden einen Gang „Alle Rezepte“. Dazu: Veraltet-Erkennung über die Hash-Funktion, nicht über `updatedAt` (das setzen auch Freigabe und Vorschaubild); `backfillWeinprofile` mit Cursor (Muster `backfillRecipeThumbnails` taugt nicht, Tech-Check F20). |

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
nicht. Leitrezept = Hauptgericht, sonst höchste Intensität; Hauptkomponente und Zubereitung vom Leitrezept,
Sauce aus einem Rezept mit Rolle `sauce_dip`, sonst vom Leitrezept; Intensität und Komponenten als Maximum.
Score je Stil: Passung der Tags (stark +3, gut +2, sonst +1, meiden −3; Gewicht sc 1,0 nur mit Sauce, hk 0,8
mit Sauce sonst 1,0, zb 0,5) plus R1 bis R6 und R9 (Werte in `konstanten.js`). Labels ab `S_TOP` 5,5
„passt hervorragend“, ab `S_GUT` 3,5 „passt gut“, sonst „passt“; Kandidaten ab `S_MIN` 1,5. Menüfolge:
je Gang die vier besten Kandidaten, bis sechs Gänge alle Kombinationen, darüber greedy; Strafen gegenüber
dem vorherigen Gang mit Wein (Körper fällt um mehr als 1: −2; rot vor weiß/rosé: −2, außer Süße 3; Süße
fällt: −3; gleicher Stil: −1). „Ein Wein“: höchstes Minimum über die Nicht-Dessert-Gänge (Gleichstand:
höhere Summe), Dessert-Gänge (Rolle dessert/gebaeck_kuchen oder Name enthält „Dessert“) eigenständig.

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
| 3 | Rezeptansicht nach Variante B: `src/components/WeinDazu.js` (Chip, Sheet, „Passenden Wein finden“, „Neu einschätzen“, Laden, R11, veraltet), Helfer `anzeige.js` und `weinprofilCallable.js`, Farb-Tokens `--color-wein-*`, Einbindung in `RecipeDetail.js` (3 Zeilen) | PR #3662 gemergt (14.11.2026); Komponententests +15, Util-Tests +8. Nachbesserung (Quellen und Fußsatz raus, Wischen statt „Schließen“, Icons `weinRot`/`weinWeiss`): Branch `claude/eloquent-mendel-icw0so`, Komponententests +3 |
| 4 | Menü nach Variante B: Weinzeile je Gang, Umschalter, Snapshot über `menuFirestore.js`, Veraltet-Erkennung; `MenuDetail.js` nutzt dann `DRINKS_SECTION_NAME` aus `menuSections.js` | offen |
| 5 | Freigabe-Seiten (Menü und Rezept), Quellen-Seite unter „Chefkoch & mehr“, `backfillWeinprofile` (Cursor, F20), Feinschliff | offen |

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
  `RecipeDetail` reicht `{ rot, weiss }` aus `getEffectiveIcon` (Dunkelmodus beachtet) an `WeinDazu`; Bilder
  (data:, http(s), Pfad) werden als `<img>`, anderer Text als Zeichen gezeigt. Geprüft in iPhone-13-Emulation
  über eine Vorschau-Seite (nicht im Repo).
- Die vier RecipeDetail-Testdateien mocken `userManagement` mit fester Funktionsliste; dort steht jetzt
  `canEditRecipes: () => false`, damit die neue Zeile die bestehenden Tests nicht berührt.
- Im Browser geprüft über eine Vorschau-Seite nur mit `WeinDazu` (Vite, Callable und Rolle als Platzhalter):
  Mobil 390 px und Desktop 1280 px, hell und dunkel, Sheet, Alternative, Laden, Fehler; keine Konsolenfehler.
  Nicht in der echten App mit Login geprüft.

## Offen

- **Fachlich gegenlesen (Eigentümer):** Kennwerte, Passungen und Beispiele der zwölf Stile, die Regeltexte,
  die Stilnamen, die Zuordnung Quelle → Stil (vorläufig: deutsche Rebsorten auf das DWI-Seminarhandbuch,
  sonst Wine Folly) und die Schwellen. Auffällig: G9 empfiehlt im Modus „Ein Wein“ zu Lachstatar und
  Rinderschmorbraten einen mittelkräftigen Rotwein (Label „passt“). Das entspricht der Regel „höchstes
  Minimum“, wirkt aber fachlich gewagt.
- **Quellen ungeprüft:** (Im Rezept-Sheet seit 14.11.2026 nicht mehr sichtbar; geplant bleibt die Quellen-Seite in PR 5 – noch gewünscht?) Die acht URLs waren aus der Arbeitsumgebung nicht erreichbar (DNS). `abgerufenAm`
  bleibt `null`, bis jemand sie geöffnet und den Inhalt gegen die Regeln geprüft hat.
- **Beilagen-Gänge:** Eine Sektion nur aus Beilagen oder Saucen (z. B. „Beilagen“) bekommt im Menü einen
  eigenen Wein, weil laut Spezifikation nur Getränke nicht zählen. Sollen solche Sektionen als „kein eigener
  Gang“ gelten?
- **Variante B, Menü:** Zusammenfassung und Umschalter vor dem ersten Gang (Entwurf) oder in der Sektion
  „Drinks“ (Wunsch bei Variante A)? Vorschlag: vor dem ersten Gang.
- **Variante B, Menü:** Antippen einer Alternative im Modus „Ein Wein“: tauscht den gemeinsamen Stil für alle
  Nicht-Dessert-Gänge (Engine: `gemeinsamerStilId`)? Vorschlag: ja.
- **Live-Prüfung des Callables:** Seit PR 2 deployt, aber noch nicht gegen die echte Gemini-API geprüft.
  Spätestens nach dem Deploy von PR 3 mit „Passenden Wein finden“ an einem Rezept prüfen (Antwort, Feld
  `weinprofil`, zweiter Aufruf überspringt).
- **Tech-Check S29, Rest:** Beim Anlegen eines Rezepts sind `ratingAvg`, `ratingCount` und `weinprofil` weiter
  frei. Schließen hieße, den Sammelimport (`handleBulkImportRecipes`) anzupassen; Import-Pfade sind laut
  Spezifikation tabu. Vorschlag: so lassen (Risiko gering), Entscheidung beim Eigentümer.

## Wichtige Stellen im Code

- Wissensbasis: `src/data/weinbegleitung/` (`stile.json`, `regeln.json`, `quellen.json`)
- Rezeptansicht: `src/components/WeinDazu.js` und `.css`, eingebunden in `RecipeDetail.js` nach der Metadatenzeile
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
