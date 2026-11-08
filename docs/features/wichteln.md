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
  eintraege/{eintragId}            autorId, ueberId, text, erstelltAm
```

Ein Wunsch ist ein Eintrag mit `autorId == ueberId`, eine Geschenkidee einer mit `autorId != ueberId`.
Teilnehmer-IDs sind keine Geheimnisse (sie stehen in der Gästeliste jedes Teilnehmers), das Token schon.

## Schnittstellen

`wichtelVerwalten` (angemeldet, nicht anonym, Rolle `edit`/`moderator`/`admin`, nur eigene Runden),
Feld `aktion`: `liste`, `laden`, `anlegen`, `aendern`, `teilnehmerHinzufuegen`, `teilnehmerUmbenennen`,
`teilnehmerEntfernen` (löscht auch seine Einträge und die Ideen über ihn), `auslosen`, `zuruecksetzen`,
`loeschen`. Fremde Runden antworten wie nicht vorhandene (`not-found`).

`wichtelTeilnahme` (ohne Login; `rundeId` + `token`), Feld `aktion`: `laden` (setzt „Link geöffnet“),
`ziehen`, `eintragHinzufuegen` (`ueberId`, `text` ≤ 300 Zeichen, höchstens 50 Einträge je Teilnehmer),
`eintragLoeschen` (nur eigene). Falsches Format, unbekannte Runde und falsches Token geben dieselbe
Antwort (`not-found`).

Client: `src/utils/wichtelFirestore.js`, Links: `src/utils/wichtelLinks.js`,
Oberflächen: `src/components/WichtelPage.js` (Organisator), `src/components/WichtelTeilnahmePage.js`.

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
