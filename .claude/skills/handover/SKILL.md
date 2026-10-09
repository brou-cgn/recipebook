---
name: handover
description: Schreibt oder aktualisiert die Übergabe-Datei für den aktuellen Branch unter `docs/handover/<branch>.md`, damit eine spätere Claude-Session (oder der Nutzer selbst) ohne Kontextverlust weiterarbeiten kann — Ziel, Stand, Entscheidungen, Sackgassen, nächste Schritte. Nutze diesen Skill, wenn der Nutzer "Handover", "Übergabe", "schreib den Stand auf", "fass die Session zusammen", "ich mach morgen weiter" o. ä. sagt, oder wenn eine Session mit offener Arbeit endet. Nicht für dauerhafte Projektregeln — die gehören in `CLAUDE.md`.
---

# Handover: Arbeitsstand für die nächste Session sichern

## Warum dieser Skill existiert

Eine neue Claude-Session sieht den Chat der vorherigen nicht, und der
Cloud-Container ist flüchtig. Was nicht im Repo steht, ist weg — oder hängt
davon ab, dass der Nutzer es manuell rüberkopiert. Die Übergabe-Datei wird mit
dem Feature-Branch committet und gepusht, hängt damit am Code-Stand und wird
von der nächsten Session automatisch gelesen (Hinweis in `CLAUDE.md`).

Leser sind **Claude und der Nutzer** — kein Copilot, keine Dritten. Also:
präzise, mit Dateipfaden und PR-Links, aber auch für einen fachlich versierten
Nicht-Entwickler verständlich.

## Abgrenzung zu `CLAUDE.md`

- `CLAUDE.md`: **dauerhafte** Regeln und Konventionen (gelten für alle Branches).
- Handover: **flüchtiger** Arbeitsstand eines Branches.

Stößt du beim Schreiben auf eine Erkenntnis, die dauerhaft gilt (z. B. eine
neue Konvention), schreib sie **nicht** ins Handover, sondern schlag dem Nutzer
vor, sie in `CLAUDE.md` aufzunehmen. Nicht eigenmächtig dort eintragen.

## Ablauf

1. **Branch ermitteln:** `git branch --show-current`. Dateiname =
   Branchname mit `/` ersetzt durch `__`, z. B.
   `claude/busy-hopper-i0qa19` → `docs/handover/claude__busy-hopper-i0qa19.md`.
   Auf `main` keinen Handover schreiben — erst nachfragen.
2. **Bestehende Datei lesen**, falls vorhanden. Sie wird **überschrieben**,
   nicht fortgeschrieben — der Verlauf liegt in Git. Inhalte, die noch
   stimmen (v. a. Entscheidungen und Sackgassen), übernehmen; Erledigtes aus
   „Offen" in „Erledigt" verschieben; Veraltetes streichen.
3. **Fakten einsammeln statt aus dem Gedächtnis schreiben:**
   - `git log --oneline origin/main..HEAD` für die Commits des Branches
   - `git status` und `git diff --stat origin/main...HEAD` für geänderte Dateien
   - PR zum Branch (GitHub-Tools), inkl. CI-Status, falls vorhanden
   - bei Tests: was zuletzt gelaufen ist und mit welchem Ergebnis
     (`npm run test:ci` ist der CI-Lauf, siehe `CLAUDE.md`)
4. **Datei schreiben** nach der Vorlage unten.
5. **Committen und pushen** auf den aktuellen Branch, Commit-Message
   `docs(handover): Stand <kurzes Thema>`. Wenn es sonst uncommittete
   Änderungen gibt, den Nutzer fragen, ob die mit rein sollen — nicht
   ungefragt mitcommitten.
6. **Dem Nutzer im Chat** in 3–5 Zeilen sagen, was drinsteht und wo die Datei
   liegt. Nicht den ganzen Inhalt wiederholen.

## Vorlage

```markdown
# Handover: <Thema in wenigen Worten>

Branch: `<branch>` · Stand: <JJJJ-MM-TT> · PR: <Link oder „noch keiner">

## Ziel

<1–3 Sätze: Was soll am Ende erreicht sein, und warum. Die ursprüngliche
Anfrage des Nutzers sinngemäß, nicht nur die technische Umsetzung.>

## Erledigt

- <Punkt> (`pfad/zur/datei.js`, Commit `abc1234`)

## Offen / in Arbeit

- <Was angefangen, aber nicht fertig ist — inkl. wo genau man weitermacht>

## Entscheidungen

- <Was festgelegt wurde> — **Grund:** <warum>. <Ggf. „vom Nutzer so gewollt">

## Sackgassen

- <Was probiert wurde und nicht funktioniert hat, und warum> —
  damit die nächste Session es nicht wiederholt.

## Unsicher / ungeprüft

- <Annahmen, die nicht verifiziert sind; Tests, die nicht liefen; Dinge, die
  nur in Produktion prüfbar sind>

## Nächste Schritte

1. <Konkret, priorisiert, der wichtigste zuerst>
```

Leere Abschnitte weglassen statt „keine" hineinzuschreiben.

## Regeln für den Inhalt

- **Ehrlich über den Stand.** „Implementiert, aber nicht getestet" ist etwas
  anderes als „fertig". Nicht verifizierte Annahmen gehören unter
  „Unsicher / ungeprüft", nicht unter „Erledigt".
- **Entscheidungen mit Begründung.** Ohne das „Warum" wird die nächste Session
  sie neu diskutieren — genau das soll das Handover verhindern.
- **Kurskorrekturen festhalten.** Wenn sich im Laufe der Session das
  Verständnis des Problems geändert hat, gehört das explizit rein
  (Beispiel: Abschnitt „Kurskorrektur" in der älteren `HANDOVER.md` im Root).
- **Keine Secrets**: keine API-Keys, PINs, Tokens, Service-Account-Daten,
  keine E-Mail-Adressen — auch nicht als Beispiel.
- **Keine Emojis** (siehe `NO_EMOJIS_POLICY.md`).
- **Knapp.** Ziel ist eine Seite, Obergrenze ~150 Zeilen. Details stehen im
  Code und in den Commits — verlinken statt nacherzählen.

## Aufräumen

Ist die Arbeit eines Branches abgeschlossen (PR gemergt, nichts mehr offen),
kann die Datei gelöscht werden. Das nur auf ausdrücklichen Wunsch des Nutzers
tun — manche Übergaben sind als Doku wertvoll und sollen bleiben.
