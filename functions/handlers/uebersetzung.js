/**
 * Mehrsprachigkeit (Tracker docs/vorhaben/mehrsprachigkeit.md, PR 3): Rezepttitel per Gemini
 * ins Deutsche, Englische und Französische übersetzen.
 *
 * uebersetzeRezeptTitel (Trigger auf recipes/{id}) übersetzt den Titel, sobald ein Rezept
 * angelegt oder sein Titel geändert wird, und schreibt das Feld `titelUebersetzung`
 * (Aufbau in shared/titelUebersetzung.js). Andere Änderungen am Rezept und das eigene
 * Schreiben lösen nichts aus, weil `titelUebersetzung.quelle` dann schon zum Titel passt.
 * Laufende Importe (`importStatus` gesetzt) warten, bis der Titel feststeht.
 *
 * backfillTitelUebersetzungen (nur admin) trägt Übersetzungen für den Bestand nach:
 * seitenweise über die Dokument-ID mit Cursor wie backfillWeinprofile, mehrere Titel je
 * Gemini-Aufruf.
 *
 * Beide schreiben nur, wenn sich das Rezept seit dem Lesen nicht geändert hat (Vorbedingung
 * lastUpdateTime). Sonst gewinnt die neuere Änderung, und deren Trigger übersetzt.
 * updatedAt bleibt unberührt, damit das Rezept nicht als geändert gilt.
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const {getFirestore, FieldPath} = require('firebase-admin/firestore');
const {requireAiCaller} = require('../shared/auth');
const {ALLOWED_ORIGINS} = require('../shared/common');
const {consumeDailyQuota} = require('../shared/rateLimit');
const {geminiApiKey} = require('../shared/secrets');
const {GEMINI_MODEL, geminiGenerateContentRequest} = require('../shared/geminiConfig');
const {
  MAX_TITEL_JE_AUFRUF,
  TITEL_RESPONSE_SCHEMA,
  baueTitelPrompt,
  pruefeTitelAntwort,
  brauchtTitelUebersetzung,
  baueTitelUebersetzung,
} = require('../shared/titelUebersetzung');

const LIMIT_COLLECTION = 'aiTitelUebersetzungLimits';
/**
 * Tageslimits in aiTitelUebersetzungLimits, gezählt je übersetztem Titel (fail closed).
 * Der Trigger zählt für alle zusammen unter dem Schlüssel `automatik`; ist das Limit
 * erreicht, bleibt der Titel bis zum nächsten Anlass oder Backfill unübersetzt.
 * Ein Titel kostet nur wenige Token, die Grenzen schützen vor Ausreißern (Sammelimport,
 * Schleifen), nicht vor normalem Gebrauch.
 */
const LIMIT_AUTOMATIK = 3000;
const LIMIT_BACKFILL_ADMIN = 10000;
const AUTOMATIK = {userId: 'automatik', isAuthenticated: false, isAdmin: false, isModerator: false};

const GEMINI_TIMEOUT_MS = 30000;
const MAX_ID_LAENGE = 200;
/** Backfill: Rezepte je Aufruf (Standard und Obergrenze), damit ein Aufruf im Zeitlimit bleibt. */
const BACKFILL_ANZAHL_STANDARD = 25;
const BACKFILL_ANZAHL_MAX = 50;

/** Gründe in fehlerGruende der Backfill-Antwort. */
const GRUND = {
  KI: 'ki',
  SPEICHERN: 'speichern',
};

/**
 * Ein Gemini-Aufruf für einen oder mehrere Titel (temperature 0, JSON mit festem Schema).
 * Fehler betreffen nur diese Titel: Sie kommen als null zurück.
 * @param {string} apiKey
 * @param {string[]} titel
 * @return {Promise<Array<object|null>>} je Titel {originalSprache, de, en, fr} oder null
 */
async function uebersetzeTitel(apiKey, titel) {
  const ohneErgebnis = () => titel.map(() => null);
  const {url, headers} = geminiGenerateContentRequest(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{parts: [{text: baueTitelPrompt(titel)}]}],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: TITEL_RESPONSE_SCHEMA,
        },
      }),
    });
    if (!response.ok) {
      console.error(`titelUebersetzung: Gemini antwortet ${response.status} (${titel.length} Titel)`);
      return ohneErgebnis();
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let geparst;
    try {
      geparst = JSON.parse(text);
    } catch {
      console.error(`titelUebersetzung: keine JSON-Antwort (${titel.length} Titel)`);
      return ohneErgebnis();
    }
    return pruefeTitelAntwort(geparst, titel.length);
  } catch (error) {
    const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
    console.error(`titelUebersetzung: Gemini nicht erreichbar: ${art}`);
    return ohneErgebnis();
  } finally {
    clearTimeout(timer);
  }
}

/** Vorbedingung lastUpdateTime verletzt: Das Rezept wurde seit dem Lesen geändert. */
const istUeberholt = (error) => error?.code === 9 || error?.code === 'failed-precondition' ||
  /FAILED_PRECONDITION/.test(String(error?.message));

/**
 * Schreibt die Übersetzung an das Rezept, nur das Feld titelUebersetzung.
 * @param {{id: string, ref: object, titel: string, updateTime: *}} eintrag
 * @param {object} ergebnis - geprüftes Ergebnis aus uebersetzeTitel
 * @return {Promise<'neu'|'ueberholt'|'speichern'>}
 */
async function speichere(eintrag, ergebnis) {
  const titelUebersetzung = baueTitelUebersetzung(eintrag.titel, ergebnis, GEMINI_MODEL, Date.now());
  try {
    if (eintrag.updateTime) {
      await eintrag.ref.update({titelUebersetzung}, {lastUpdateTime: eintrag.updateTime});
    } else {
      await eintrag.ref.update({titelUebersetzung});
    }
    return 'neu';
  } catch (error) {
    if (istUeberholt(error)) return 'ueberholt';
    console.error(`titelUebersetzung: Speichern für Rezept ${eintrag.id} fehlgeschlagen: ${error?.code || error?.message}`);
    return 'speichern';
  }
}

/**
 * Trigger: übersetzt den Titel eines neuen Rezepts oder einen geänderten Titel.
 */
exports.uebersetzeRezeptTitel = onDocumentWritten(
    {
      document: 'recipes/{recipeId}',
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '256MiB',
      timeoutSeconds: 60,
      maxInstances: 5,
    },
    async (event) => {
      const nachher = event.data?.after;
      if (!nachher?.exists) return;
      const rezept = nachher.data();
      if (!brauchtTitelUebersetzung(rezept)) return;

      const id = event.params?.recipeId || nachher.id;
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeRezeptTitel: GEMINI_API_KEY ist nicht gesetzt');
        return;
      }
      let quota;
      try {
        quota = await consumeDailyQuota(LIMIT_COLLECTION, LIMIT_AUTOMATIK, AUTOMATIK);
      } catch {
        return; // nicht prüfbar: fail closed, consumeDailyQuota hat schon protokolliert
      }
      if (!quota.allowed) {
        console.warn(`uebersetzeRezeptTitel: Tageslimit erreicht, Rezept ${id} bleibt vorerst unübersetzt`);
        return;
      }

      const [ergebnis] = await uebersetzeTitel(apiKey, [rezept.title]);
      if (!ergebnis) {
        console.error(`uebersetzeRezeptTitel: keine gültige Übersetzung für Rezept ${id}`);
        return;
      }
      const stand = await speichere({id, ref: nachher.ref, titel: rezept.title, updateTime: nachher.updateTime}, ergebnis);
      if (stand === 'ueberholt') {
        console.log(`uebersetzeRezeptTitel: Rezept ${id} wurde inzwischen geändert, die neuere Änderung übersetzt`);
      }
    },
);

/**
 * @param {*} data - request.data des Backfills
 * @return {{cursor: (string|null), anzahl: number}}
 */
function pruefeBackfillEingabe(data) {
  const cursor = data?.cursor ?? null;
  if (cursor !== null &&
      (typeof cursor !== 'string' || !cursor.trim() || cursor.includes('/') || cursor.length > MAX_ID_LAENGE)) {
    throw new HttpsError('invalid-argument', 'cursor muss eine Rezept-ID oder null sein');
  }
  const anzahl = data?.anzahl ?? BACKFILL_ANZAHL_STANDARD;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > BACKFILL_ANZAHL_MAX) {
    throw new HttpsError('invalid-argument', `anzahl muss eine ganze Zahl von 1 bis ${BACKFILL_ANZAHL_MAX} sein`);
  }
  return {cursor, anzahl};
}

/**
 * Anzahl aller Rezepte über eine Zählabfrage (liest keine Dokumente), nur für die
 * Fortschrittsanzeige; scheitert sie, fehlt die Gesamtzahl.
 * @param {object} rezepte - Collection-Referenz
 * @return {Promise<number|null>}
 */
async function zaehleRezepte(rezepte) {
  try {
    const snap = await rezepte.count().get();
    return snap.data().count;
  } catch (error) {
    console.warn(`backfillTitelUebersetzungen: Zählen der Rezepte fehlgeschlagen: ${error?.message}`);
    return null;
  }
}

/**
 * Cloud Function: Titelübersetzungen für den Bestand nachtragen (nur admin).
 *
 * Eingabe: {cursor: string|null, anzahl: 1 bis 50 (Standard 25)}. Liest die nächste Seite der
 * Rezepte nach Dokument-ID ab `cursor`, überspringt Rezepte mit passender Übersetzung, ohne
 * Titel oder mit laufendem Import (kein KI-Aufruf, kein Limit) und übersetzt die übrigen in
 * Blöcken zu höchstens 25 Titeln je Gemini-Aufruf. Jeder Titel zählt gegen das Tageslimit;
 * ist es erreicht, endet die Seite vor dem ersten Rezept, das nicht mehr übersetzt werden darf.
 *
 * Antwort: {geprueft, neu, uebersprungen, fehlgeschlagen: string[], fehlerGruende,
 * naechsterCursor (null wenn fertig), fertig, tageslimitErreicht, gesamt (nur beim ersten
 * Aufruf ohne Cursor), remainingRequests, dailyLimit}. Fehlgeschlagene Rezepte werden bei
 * einem neuen Durchlauf erneut versucht.
 */
exports.backfillTitelUebersetzungen = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 1,
      memory: '256MiB',
      timeoutSeconds: 300,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      const {cursor, anzahl} = pruefeBackfillEingabe(request.data);
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Titelübersetzungen nachtragen dürfen nur Admins.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('backfillTitelUebersetzungen: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }

      const rezepte = getFirestore().collection('recipes');
      let abfrage = rezepte.orderBy(FieldPath.documentId()).limit(anzahl);
      if (cursor) abfrage = abfrage.startAfter(cursor);
      const [seite, gesamt] = await Promise.all([
        abfrage.get(),
        cursor ? Promise.resolve(null) : zaehleRezepte(rezepte),
      ]);

      let remainingRequests = null;
      let tageslimitErreicht = false;
      let letzteId = cursor;
      let geprueft = 0;
      let uebersprungen = 0;
      const zuUebersetzen = [];
      for (const snap of seite.docs) {
        const daten = snap.data() || {};
        if (!brauchtTitelUebersetzung(daten)) {
          uebersprungen += 1;
        } else {
          const quota = await consumeDailyQuota(LIMIT_COLLECTION, LIMIT_BACKFILL_ADMIN, caller);
          if (!quota.allowed) {
            tageslimitErreicht = true;
            break;
          }
          remainingRequests = quota.remaining;
          zuUebersetzen.push({id: snap.id, ref: snap.ref, titel: daten.title, updateTime: snap.updateTime});
        }
        letzteId = snap.id;
        geprueft += 1;
      }

      if (tageslimitErreicht && geprueft === 0) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Titelübersetzungen erreicht (${LIMIT_BACKFILL_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      let neu = 0;
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      for (let start = 0; start < zuUebersetzen.length; start += MAX_TITEL_JE_AUFRUF) {
        const block = zuUebersetzen.slice(start, start + MAX_TITEL_JE_AUFRUF);
        const ergebnisse = await uebersetzeTitel(apiKey, block.map((eintrag) => eintrag.titel));
        for (const [index, eintrag] of block.entries()) {
          if (!ergebnisse[index]) {
            fehlgeschlagen.push(eintrag.id);
            fehlerGruende[eintrag.id] = GRUND.KI;
            continue;
          }
          const stand = await speichere(eintrag, ergebnisse[index]);
          if (stand === 'neu') {
            neu += 1;
          } else if (stand === 'ueberholt') {
            uebersprungen += 1; // inzwischen geändert: der Trigger übersetzt den neuen Titel
          } else {
            fehlgeschlagen.push(eintrag.id);
            fehlerGruende[eintrag.id] = GRUND.SPEICHERN;
          }
        }
      }

      const fertig = !tageslimitErreicht && seite.docs.length < anzahl;
      console.log(`backfillTitelUebersetzungen: ${geprueft} geprüft, ${neu} neu, ${uebersprungen} übersprungen, ` +
        `${fehlgeschlagen.length} fehlgeschlagen${fertig ? ', fertig' : ''}`);
      return {
        geprueft,
        neu,
        uebersprungen,
        fehlgeschlagen,
        fehlerGruende,
        naechsterCursor: fertig ? null : letzteId,
        fertig,
        tageslimitErreicht,
        gesamt,
        remainingRequests,
        dailyLimit: LIMIT_BACKFILL_ADMIN,
      };
    },
);
