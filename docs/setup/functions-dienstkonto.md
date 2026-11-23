# Eigenes Dienstkonto für die Cloud Functions (Tech-Check S15)

Stand: 23.11.2026. Der Code ist vorbereitet, umgestellt ist noch nichts.

## Worum es geht

Die Cloud Functions laufen heute unter dem Compute-Standardkonto
(`78971303279-compute@developer.gserviceaccount.com`). Es hat, wie das App-Engine-Standardkonto
(`broubook@appspot.gserviceaccount.com`), die Projektrolle **Bearbeiter**: Eine Lücke in einer
einzigen Function (z. B. Prompt-Injection im Webimport) hätte damit Reichweite über das ganze
Projekt. Ziel ist ein eigenes Konto mit nur den Rollen, die der Code wirklich braucht.

Der Schalter steht in `functions/shared/runtimeOptions.js` (`FUNCTIONS_SERVICE_ACCOUNT`). Solange
er `null` ist, ändert sich nichts. Mit einer Adresse laufen beim nächsten Deploy **alle**
Functions auf einmal unter diesem Konto; `functions/runtimeOptions.test.js` prüft, dass keine
Function ausschert.

## Welche Rollen der Code braucht

Aus dem Code erhoben (23.11.2026), nicht aus den Google-Empfehlungen. Vor dem Anlegen mit den
IAM-Empfehlungen abgleichen (Cloud Console › IAM › beim Compute-Standardkonto „Empfehlungen“,
zeigt die in den letzten 90 Tagen genutzten Berechtigungen).

| Rolle | Wofür im Code |
|---|---|
| `roles/datastore.user` (Cloud Datastore-Nutzer) | Firestore lesen und schreiben, fast jede Function |
| `roles/storage.objectAdmin` (Storage-Objekt-Administrator), nur auf dem Bucket `broubook.firebasestorage.app` | Rezeptbilder, Vorschaubilder, Video-Upload, `makePublic` in `backfillRecipeThumbnails` und `shareRecipe` |
| `roles/firebaseauth.admin` (Firebase Authentication-Administrator) | `getUserByEmail` (Einladungen), `updateUser` (`setUserPassword`), `createCustomToken` (nächtlicher Importer-Test) |
| `roles/firebasecloudmessaging.admin` (Firebase Cloud Messaging API-Administrator) | Push-Mitteilungen (`getMessaging`: Kochtimer, Follow, Listen, Für dich entdeckt, fertiger Import, Erinnerung im Event) |
| `roles/monitoring.viewer` (Monitoring-Betrachter) | Firestore-Nutzung im Bericht des Nährwert-Recalc (`functions/firestoreUsage.js`) |
| `roles/iam.serviceAccountTokenCreator` (Ersteller von Dienstkonto-Tokens), **auf dem Konto selbst** | signierte Upload-Adresse (`getVideoUploadUrl`) und `createCustomToken`: beide signieren über das Konto |
| `roles/eventarc.eventReceiver` (Eventarc-Ereignisempfänger) | Firestore- und Storage-Trigger |
| `roles/run.invoker` (Cloud Run-Aufrufer) | Eventarc und Cloud Scheduler rufen die Trigger und geplanten Functions mit diesem Konto auf |
| `roles/secretmanager.secretAccessor` (Secret Manager-Zugriffsberechtigter) | Secrets (Gemini-Schlüssel, SMTP). Nach meinem Kenntnisstand vergibt der Firebase-Deploy diesen Zugriff je Secret selbst an das Konto der Function; im Deploy-Log prüfen, sonst projektweit vergeben |
| `roles/logging.logWriter` (Log-Autor) | Vorsorglich: Cloud Run nimmt die Ausgaben der Functions auch ohne sie auf, schaden tut sie nicht |

Nicht nötig: Gemini läuft über einen API-Schlüssel (Secret), nicht über Vertex AI; Cloud Tasks und
Pub/Sub nutzt der Code nicht selbst.

## Schritte (Betreiber, Cloud Shell)

1. Konto anlegen und Rollen vergeben:

   ```bash
   gcloud config set project broubook
   gcloud iam service-accounts create recipebook-functions --display-name="RecipeBook Cloud Functions"
   SA=recipebook-functions@broubook.iam.gserviceaccount.com
   for role in roles/datastore.user roles/firebaseauth.admin roles/firebasecloudmessaging.admin \
       roles/monitoring.viewer roles/eventarc.eventReceiver roles/run.invoker roles/logging.logWriter; do
     gcloud projects add-iam-policy-binding broubook --member="serviceAccount:$SA" --role="$role" --condition=None
   done
   gcloud storage buckets add-iam-policy-binding gs://broubook.firebasestorage.app \
     --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
   gcloud iam service-accounts add-iam-policy-binding "$SA" \
     --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator
   ```

2. Deploy-Konto: Der GitHub-Deploy läuft mit `FIREBASE_TOKEN`, also mit den Rechten des
   Google-Kontos, das den Token erzeugt hat (Tech-Check B3). Es braucht `iam.serviceAccounts.actAs`
   auf dem neuen Konto. Inhaber haben das; sonst die Rolle Dienstkontonutzer vergeben:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding "$SA" \
     --member="user:<Adresse des Deploy-Kontos>" --role=roles/iam.serviceAccountUser
   ```

3. Umstellen: In `functions/shared/runtimeOptions.js` `FUNCTIONS_SERVICE_ACCOUNT` auf die Adresse
   setzen, den ersten Test in `functions/runtimeOptions.test.js` anpassen (er hält fest, dass noch
   nichts eingetragen ist), eigener PR, Merge, Deploy abwarten.

4. Direkt danach prüfen:
   - Nährwerte: Recalc-Knopf, der Bericht nennt die Firestore-Nutzung (Monitoring)
   - Webimport und Fotoscan (Secrets, Gemini, Firestore)
   - Rezept teilen (Share-Link, `makePublic`) und Video-Import (signierte Adresse)
   - Einladung in eine private Liste (Auth, SMTP)
   - Push, z. B. Kochtimer
   - Rezept speichern: die Übersetzung kommt (Firestore-Trigger)
   - am nächsten Morgen die Logs der nächtlichen Jobs (Cloud Scheduler)

   Fehler zeigen sich als `PERMISSION_DENIED` im Log der jeweiligen Function. Dann die fehlende
   Rolle ergänzen, nicht zurück auf das Standardkonto.

5. Erst wenn alles läuft: die Rolle Bearbeiter beim Compute-Standardkonto und beim
   App-Engine-Standardkonto entfernen. **Vorher prüfen**, welches Konto Cloud Build für die Builds
   der Functions nutzt (Cloud Console › Cloud Build › Einstellungen). Seit 2024 ist das je nach
   Projekt das Compute-Standardkonto; ohne Bearbeiter braucht es dann `roles/cloudbuild.builds.builder`,
   sonst scheitert der nächste Deploy schon beim Bauen. Ob noch etwas anderes das
   App-Engine-Standardkonto nutzt, ist nicht erhoben.

Zurück geht es jederzeit, solange Schritt 5 nicht gemacht ist: `FUNCTIONS_SERVICE_ACCOUNT` wieder
auf `null`, deployen.
