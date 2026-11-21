# Sandbox (Vorschau vor dem Merge)

Zweck (Tech-Check W2): UI-Änderungen auf dem Handy ansehen, bevor sie live gehen,
ohne Version, Tag und Produktions-Deploy. Die Sandbox ersetzt nicht den
Entwurf vor dem PR (Mockup/Artifact), sondern ergänzt ihn als Abnahme.

## Ablauf

1. Actions → *Deploy Sandbox* → *Run workflow* → Branch wählen.
2. Nach ca. 3–5 Minuten steht die URL in der Zusammenfassung des Laufs
   (Format `https://broubook--sandbox-<kennung>.web.app`).
3. Auf dem Handy im Browser öffnen und prüfen.
4. Anpassen und Workflow erneut starten. Der Channel `sandbox` wird überschrieben.
5. Passt es: PR mergen. Der normale Weg (Version Bump → Deploy) bleibt unverändert.

Der Workflow deployt nur Hosting. Functions, Rules und Indexes ändern sich nicht.

## Was die Sandbox ist – und was nicht

- **Gleiches Backend wie Produktion** (Firestore, Auth, Storage, Functions).
  Schreiben und Löschen in der Sandbox wirkt auf die echten Daten.
- Eigene Adresse, daher eigene Origin: die installierte PWA
  (`broubook.web.app`) und ihr Service Worker sind nicht betroffen.
- Im Browser sieht man keine PWA-Besonderheiten (Vollbild, Safe-Areas,
  Randgesten). Für solche Themen die Sandbox-URL auf iOS einmal „Zum
  Home-Bildschirm“ hinzufügen und das Icon eindeutig benennen.
- Tests laufen hier nicht; sie laufen im Pull Request (`ci.yml`).

## Einmalige Einrichtung

Firebase Auth erlaubt nur eingetragene Domains. In der Firebase-Konsole unter
*Authentication → Einstellungen → Autorisierte Domains* die Sandbox-Domain
(Host aus der URL oben) hinzufügen. Ohne diesen Eintrag schlägt der Login in
der Sandbox fehl.

Offen / zu prüfen beim ersten Lauf: ob die URL des Channels über mehrere Läufe
stabil bleibt. Der Channel läuft nach 30 Tagen ab; wird er danach neu angelegt,
kann die Kennung wechseln und die Domain muss erneut eingetragen werden.

## Aufräumen

`firebase hosting:channel:delete sandbox --project broubook` löscht die Vorschau
vorzeitig.
