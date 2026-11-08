# Wichteln

Wichtel-Runden für Feiern: Teilnehmer eintragen, auslosen, jeder bekommt einen
persönlichen Link. Über den Link zieht er sein Los, sieht die Wünsche seines
Wichtelpartners und kann Geschenkideen für andere Gäste hinterlassen.

## Ablauf

**Organisator** (Events > „Wichteln“, mobil der Geschenk-Button unten links; ab Rolle `edit`):

1. Runde anlegen: Titel, optional Budget und Hinweis (z. B. „Bescherung am 13.12.“).
2. Teilnehmer eintragen – mehrere auf einmal mit Komma, oder per Tipp aus der eigenen Gästeliste.
   Namen sind je Runde eindeutig (Groß-/Kleinschreibung egal).
3. Links verschicken („Link teilen“: Teilen-Menü des Handys, sonst Kopieren). Das geht schon vor
   dem Auslosen – dann können alle früh ihre Wünsche eintragen.
4. „Jetzt auslosen“ (ab drei Teilnehmern). Danach sind die Teilnehmer gesperrt; ändern geht erst
   nach „Auslosung zurücksetzen“ (mit Rückfrage). Links, Wünsche und Ideen bleiben dabei erhalten,
   wer schon gezogen hatte, zieht nach dem nächsten Auslosen neu.
5. Je Teilnehmer sichtbar: „Link noch nicht geöffnet“ / „Link geöffnet“ / „Los gezogen“.

**Teilnehmer** (`/wichteln/{rundeId}/{token}`, ohne Login):

- „Los ziehen“: der Zettel klappt auf und zeigt, wen man beschenkt (ohne Animation bei
  „Bewegung reduzieren“).
- Danach: Wünsche des Gezogenen und Ideen anderer Gäste für ihn (mit Absender).
- „Deine Wünsche“: sieht nur, wer einen gezogen hat.
- „Geschenkideen für andere“: Gast wählen, Idee speichern. Sieht nur, wer diesen Gast gezogen hat –
  mit dem eigenen Namen, die Person selbst nie.
- Zu Wunsch und Idee optional ein Link (z. B. zum Shop); Text oder Link genügt. Der Eintrag zeigt dann
  eine Vorschau mit Bild, Seitentitel und Seite (siehe „Link-Vorschau“). Ein ins Textfeld eingefügter
  Link am Ende („Produktname https://…“, wie aus dem Teilen-Menü einer Shop-App) wird zum Link.
- Eigene Einträge löschen: sofort mit „Rückgängig“ (6 s), mobil per Linksswipe.

## Wer sieht was

| Daten | Teilnehmer selbst | Wer ihn gezogen hat | Andere Teilnehmer | Organisator |
|---|---|---|---|---|
| Wen er gezogen hat | ja, nach „Los ziehen“ | – | nein | **nein** |
| Seine Wünsche | ja | ja | nein | nein |
| Ideen anderer über ihn | **nein** | ja (mit Absender) | nur der Absender seine eigene | nein |
| Namen aller Teilnehmer | ja | ja | ja | ja |
| Persönlicher Link (Token) | ja | nein | nein | ja (zum Verschicken) |

Durchgesetzt wird das serverseitig, nicht in der Oberfläche:

- `firestore.rules`: `wichtelRunden` samt Unter-Collections ist für **jeden** Client gesperrt,
  auch für Organisator und Admins (Regeltest `rules-tests/wichteln.test.js`).
- Alle Zugriffe laufen über zwei Callables in `functions/wichteln.js`
  (Tests: `functions/wichteln.test.js`, u. a. „Wünsche und Ideen sieht nur, wer den Gast gezogen hat“).

Bewusste Grenze: Der Organisator kennt alle Links und könnte einen fremden Link öffnen. Das liegt
am Verfahren „Organisator verschickt die Links“; die App zeigt ihm die Zuordnung nie.

## Datenmodell

```
wichtelRunden/{rundeId}            ownerId, titel, budget, hinweis, status ('offen'|'ausgelost'),
                                   teilnehmerAnzahl, ausgelostAm, erstelltAm, aktualisiertAm
  teilnehmer/{teilnehmerId}        name, token (geheim), reihenfolge, geoeffnetAm, gezogenAm, erstelltAm
  zuordnungen/{geberId}            empfaengerId, ausgelostAm
  eintraege/{eintragId}            autorId, ueberId, text, erstelltAm,
                                   url und vorschau {bild, titel, seite} (nur mit Link; vorschau null,
                                   wenn der Abruf scheiterte)
```

Ein Wunsch ist ein Eintrag mit `autorId == ueberId`, eine Geschenkidee einer mit `autorId != ueberId`.
Teilnehmer-IDs sind keine Geheimnisse (sie stehen in der Gästeliste jedes Teilnehmers), das Token schon.

## Schnittstellen

`wichtelVerwalten` (angemeldet, nicht anonym, Rolle `edit`/`moderator`/`admin`, nur eigene Runden),
Feld `aktion`: `liste`, `laden`, `anlegen`, `aendern`, `teilnehmerHinzufuegen`, `teilnehmerUmbenennen`,
`teilnehmerEntfernen` (löscht auch seine Einträge und die Ideen über ihn), `auslosen`, `zuruecksetzen`,
`loeschen`. Fremde Runden antworten wie nicht vorhandene (`not-found`).

`wichtelTeilnahme` (ohne Login; `rundeId` + `token`), Feld `aktion`: `laden` (setzt „Link geöffnet“),
`ziehen`, `eintragHinzufuegen` (`ueberId`, `text` ≤ 300 Zeichen und/oder `url` ≤ 2000 Zeichen, höchstens
50 Einträge je Teilnehmer; ohne `https://` wird es ergänzt, andere Schemata sind ungültig),
`eintragLoeschen` (nur eigene). Einträge gehen mit `url` und `vorschau` (je `null` ohne Link) heraus. Falsches Format, unbekannte Runde und falsches Token geben dieselbe
Antwort (`not-found`).

Client: `src/utils/wichtelFirestore.js`, Links: `src/utils/wichtelLinks.js`,
Oberflächen: `src/components/WichtelPage.js` (Organisator), `src/components/WichtelTeilnahmePage.js`.

## Link-Vorschau

Beim Speichern eines Eintrags mit Link ruft der Server die Seite **einmal** ab (`functions/linkVorschau.js`,
Tests: `functions/linkVorschau.test.js`) und legt Bild-Adresse, Titel und Seitennamen mit dem Eintrag ab.
Das Speichern wartet darauf (bis zu 5 s); scheitert der Abruf, wird ohne Vorschau gespeichert und die
Seite zeigt ein Link-Symbol mit dem Seitennamen. Ein neuer Versuch geht nur über Löschen und neu Anlegen.

- Bild: `og:image`, sonst `twitter:image`, `image_src`, Microdata, JSON-LD, Amazon-Produktbild
  (`#landingImage`, Amazon hat kein `og:image`). Ein direkter Bild-Link ist selbst das Bild.
- Titel: `og:title`, sonst `<title>`. Bot-Abwehrseiten („Just a moment…“, „Access Denied“ u. a.)
  liefern keine Vorschau statt eines falschen Titels.
- Das Bild lädt der Browser des Betrachters direkt von der Seite des Shops, ohne Referrer: Die Adresse
  der Teilnehmerseite enthält das geheime Token.
- Schutz, weil der Abruf ohne Login erreichbar ist: nur GET auf http/https mit Standard-Port, nur
  öffentliche IP-Adressen (geprüft beim Verbindungsaufbau, also auch nach Weiterleitungen und gegen
  DNS-Rebinding), höchstens 5 Weiterleitungen, 5 s, 2 MB HTML.

Grenzen: Große Shops (vor allem Amazon) blocken Abrufe aus Rechenzentren oft mit einer Captcha-Seite –
dann gibt es keine Vorschau. Aus der Entwicklungsumgebung ließ sich das nicht prüfen; getestet mit lokalem
Server und echten Seiten (pypi.org, jsr.io).

## Auslosung

Ein einziger Kreis: Fisher-Yates mit kryptografischem Zufall (`crypto.randomInt`), danach beschenkt jeder
seinen Nachfolger. So zieht niemand sich selbst, und ab drei Teilnehmern beschenken sich nie zwei
gegenseitig. Jeder mögliche Kreis ist gleich wahrscheinlich. Das Token hat 192 Bit (24 Zufallsbytes,
base64url).

## Offen / mögliche Erweiterungen

- Ausschlüsse (z. B. Paare ziehen sich nicht gegenseitig) – braucht eine Auslosung mit Nebenbedingungen.
- Link erneuern, falls ein Link an die falsche Person ging (heute: Teilnehmer entfernen und neu anlegen,
  nur vor dem Auslosen).
- Runden werden nicht automatisch gelöscht; der Organisator löscht sie in der Übersicht.
- Link-Vorschau schon im Formular zeigen (vor dem Speichern) und eine gescheiterte Vorschau später neu holen.
- Vorschaubilder selbst speichern statt vom Shop zu laden (unabhängig von Shop-Änderungen, kein Abruf
  des Betrachters beim Shop) – braucht einen Storage-Ordner samt Regeln und Aufräumen.
