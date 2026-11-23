/**
 * Mehrsprachigkeit (Tracker docs/vorhaben/mehrsprachigkeit.md): Rezepttitel (PR 3) und
 * Rezeptinhalt (PR 4) per Gemini vom deutschen Original ins Englische und Französische
 * übersetzen (Entscheidung „Primärsprache“).
 *
 * uebersetzeRezeptTitel (Trigger auf recipes/{id}) übersetzt den Titel, sobald ein Rezept
 * angelegt oder sein Titel geändert wird, und schreibt das Feld `titelUebersetzung`
 * (Aufbau in shared/titelUebersetzung.js). Andere Änderungen am Rezept und das eigene
 * Schreiben lösen nichts aus, weil `titelUebersetzung` dann schon zum Titel passt (`quelle`)
 * und nach den geltenden Regeln entstand (`version`). Eine Übersetzung nach älteren Regeln
 * erneuert der Trigger beim nächsten Schreiben des Rezepts, einmal je Rezept.
 * Laufende Importe (`importStatus` gesetzt) warten, bis der Titel feststeht.
 *
 * backfillTitelUebersetzungen (nur admin) trägt Übersetzungen für den Bestand nach:
 * seitenweise über die Dokument-ID mit Cursor wie backfillWeinprofile, mehrere Titel je
 * Gemini-Aufruf.
 *
 * Beide schreiben nur, wenn sich das Rezept seit dem Lesen nicht geändert hat (Vorbedingung
 * lastUpdateTime). Sonst gewinnt die neuere Änderung, und deren Trigger übersetzt.
 * updatedAt bleibt unberührt, damit das Rezept nicht als geändert gilt.
 *
 * uebersetzeRezeptInhalt (Trigger auf recipes/{id}) übersetzt Zutaten und Schritte, wenn ein
 * Rezept angelegt wird oder sich sein Inhalt ändert, und schreibt rezeptUebersetzungen/{id}
 * (Aufbau in shared/inhaltUebersetzung.js); beim Löschen des Rezepts löscht er die Übersetzung.
 * Die Übersetzung liegt bewusst nicht im Rezept: Die App lädt alle Rezeptdokumente für die
 * Listen, zwei vollständige Übersetzungen darin würden die Datenmenge etwa verdreifachen.
 * backfillInhaltUebersetzungen (nur admin) trägt sie für den Bestand nach. Geschrieben wird in
 * einer Transaktion nur, wenn das Rezept noch denselben Inhalt hat (gleicher quellHash).
 *
 * uebersetzeListenwerte (nur admin, PR 5) liefert Vorschläge für Übersetzungen der Auswahllisten
 * (Kulinarik, Speisekategorien, Einheiten). Sie schreibt nichts; gespeichert wird im Client unter
 * Einstellungen › Listen & Kategorien (settings/app.listenUebersetzungen).
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
const {
  INHALT_RESPONSE_SCHEMA,
  inhaltQuellHash,
  anfrageAusRezept,
  baueInhaltPrompt,
  pruefeInhaltAntwort,
  baueUebersetzungsDokument,
  istAktuelleInhaltUebersetzung,
} = require('../shared/inhaltUebersetzung');
const {
  LISTEN_RESPONSE_SCHEMA,
  pruefeListenEingabe,
  baueListenPrompt,
  pruefeListenAntwort,
} = require('../shared/listenUebersetzung');

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
 * @return {Promise<Array<object|null>>} je Titel {en, fr} oder null
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
 * Trigger: übersetzt den Titel eines neuen Rezepts, einen geänderten Titel oder einen Titel,
 * dessen Übersetzung nach älteren Regeln entstand.
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
 * Rezepte nach Dokument-ID ab `cursor`, überspringt Rezepte mit passender Übersetzung (gleicher
 * Titel, aktuelle `version`), ohne Titel oder mit laufendem Import (kein KI-Aufruf, kein Limit)
 * und übersetzt die übrigen, auch Übersetzungen nach älteren Regeln, in
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

// ── Rezeptinhalt (PR 4) ───────────────────────────────────────────────────────

const UEBERSETZUNGEN = 'rezeptUebersetzungen';
const INHALT_LIMIT_COLLECTION = 'aiInhaltUebersetzungLimits';
/**
 * Tageslimits in aiInhaltUebersetzungLimits, gezählt je übersetztem Rezept (fail closed). Ein
 * Rezeptinhalt kostet deutlich mehr Token als ein Titel, die Grenzen sind deshalb kleiner. Der
 * Trigger zählt für alle zusammen unter `automatik`, der Backfill je Admin.
 */
const LIMIT_INHALT_AUTOMATIK = 1000;
const LIMIT_INHALT_BACKFILL_ADMIN = 3000;
const INHALT_GEMINI_TIMEOUT_MS = 90000;
const INHALT_BACKFILL_ANZAHL_STANDARD = 10;
const INHALT_BACKFILL_ANZAHL_MAX = 20;
const INHALT_MAX_PARALLEL = 3;

/**
 * Führt `arbeit` für alle Einträge aus, höchstens `maxParallel` gleichzeitig.
 * @param {Array} eintraege
 * @param {number} maxParallel
 * @param {function(*): Promise<void>} arbeit
 * @return {Promise<void>}
 */
async function mitBegrenzterParallelitaet(eintraege, maxParallel, arbeit) {
  let naechster = 0;
  const arbeiter = async () => {
    while (naechster < eintraege.length) {
      const eintrag = eintraege[naechster];
      naechster += 1;
      await arbeit(eintrag);
    }
  };
  await Promise.all(Array.from({length: Math.min(maxParallel, eintraege.length)}, arbeiter));
}

/**
 * Ein Gemini-Aufruf für den Inhalt eines Rezepts (temperature 0, JSON mit festem Schema).
 * @param {string} apiKey
 * @param {{zutaten: Array<object>, schritte: Array<object>}} anfrage
 * @param {string} id - Rezept-ID, nur für Protokolle
 * @return {Promise<object|null>} geprüftes Ergebnis aus pruefeInhaltAntwort oder null
 */
async function uebersetzeInhalt(apiKey, anfrage, id) {
  const {url, headers} = geminiGenerateContentRequest(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INHALT_GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{parts: [{text: baueInhaltPrompt(anfrage)}]}],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: INHALT_RESPONSE_SCHEMA,
        },
      }),
    });
    if (!response.ok) {
      console.error(`inhaltUebersetzung: Gemini antwortet ${response.status} für Rezept ${id}`);
      return null;
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    let geparst;
    try {
      geparst = JSON.parse(text);
    } catch {
      console.error(`inhaltUebersetzung: keine JSON-Antwort für Rezept ${id}`);
      return null;
    }
    const ergebnis = pruefeInhaltAntwort(geparst, anfrage);
    if (!ergebnis) console.error(`inhaltUebersetzung: unvollständige Antwort für Rezept ${id}`);
    return ergebnis;
  } catch (error) {
    const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
    console.error(`inhaltUebersetzung: Gemini nicht erreichbar für Rezept ${id}: ${art}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Schreibt die Übersetzung nur, wenn das Rezept noch denselben Inhalt hat: In einer Transaktion
 * wird das Rezept erneut gelesen und sein quellHash verglichen.
 * @param {object} db - Firestore
 * @param {object} rezeptRef
 * @param {object} uebersetzungRef
 * @param {string} quellHash - Hash des übersetzten Inhalts
 * @param {object} dokument
 * @return {Promise<'neu'|'ueberholt'|'speichern'>}
 */
async function speichereInhalt(db, rezeptRef, uebersetzungRef, quellHash, dokument) {
  try {
    return await db.runTransaction(async (transaktion) => {
      const aktuell = await transaktion.get(rezeptRef);
      if (!aktuell.exists || inhaltQuellHash(aktuell.data()) !== quellHash) return 'ueberholt';
      transaktion.set(uebersetzungRef, dokument);
      return 'neu';
    });
  } catch (error) {
    console.error(`inhaltUebersetzung: Speichern für Rezept ${rezeptRef.id} fehlgeschlagen: ${error?.code || error?.message}`);
    return 'speichern';
  }
}

/**
 * @param {object} uebersetzungRef
 * @return {Promise<void>}
 */
async function loescheUebersetzung(uebersetzungRef) {
  try {
    await uebersetzungRef.delete();
  } catch (error) {
    console.error(`inhaltUebersetzung: Löschen für Rezept ${uebersetzungRef.id} fehlgeschlagen: ${error?.message}`);
  }
}

/**
 * Trigger: übersetzt Zutaten und Schritte eines neuen Rezepts oder nach einer Änderung am Inhalt
 * und löscht die Übersetzung mit dem Rezept.
 */
exports.uebersetzeRezeptInhalt = onDocumentWritten(
    {
      document: 'recipes/{recipeId}',
      region: 'us-central1',
      secrets: [geminiApiKey],
      memory: '256MiB',
      timeoutSeconds: 120,
      maxInstances: 5,
    },
    async (event) => {
      const vorher = event.data?.before;
      const nachher = event.data?.after;
      const id = event.params?.recipeId || nachher?.id || vorher?.id;
      const db = getFirestore();
      const uebersetzungRef = db.collection(UEBERSETZUNGEN).doc(id);

      if (!nachher?.exists) {
        if (vorher?.exists) await loescheUebersetzung(uebersetzungRef);
        return;
      }
      const rezept = nachher.data();
      if (rezept.importStatus) return;
      const quellHash = inhaltQuellHash(rezept);
      // Inhalt unverändert (Bewertung, Freigabe, Titelübersetzung …): nichts zu tun, ohne Lesezugriff.
      const vorherDaten = vorher?.exists ? vorher.data() : null;
      if (vorherDaten && !vorherDaten.importStatus && inhaltQuellHash(vorherDaten) === quellHash) return;

      const anfrage = anfrageAusRezept(rezept);
      const vorhanden = await uebersetzungRef.get();
      if (!anfrage) {
        if (vorhanden.exists) await loescheUebersetzung(uebersetzungRef);
        return;
      }
      if (vorhanden.exists && istAktuelleInhaltUebersetzung(vorhanden.data(), quellHash)) return;

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeRezeptInhalt: GEMINI_API_KEY ist nicht gesetzt');
        return;
      }
      let quota;
      try {
        quota = await consumeDailyQuota(INHALT_LIMIT_COLLECTION, LIMIT_INHALT_AUTOMATIK, AUTOMATIK);
      } catch {
        return; // nicht prüfbar: fail closed, consumeDailyQuota hat schon protokolliert
      }
      if (!quota.allowed) {
        console.warn(`uebersetzeRezeptInhalt: Tageslimit erreicht, Rezept ${id} bleibt vorerst unübersetzt`);
        return;
      }

      const ergebnis = await uebersetzeInhalt(apiKey, anfrage, id);
      if (!ergebnis) return;
      const dokument = baueUebersetzungsDokument(rezept, quellHash, ergebnis, GEMINI_MODEL, Date.now());
      const stand = await speichereInhalt(db, nachher.ref, uebersetzungRef, quellHash, dokument);
      if (stand === 'ueberholt') {
        console.log(`uebersetzeRezeptInhalt: Rezept ${id} wurde inzwischen geändert, die neuere Änderung übersetzt`);
      }
    },
);

/**
 * @param {*} data - request.data des Backfills
 * @return {{cursor: (string|null), anzahl: number}}
 */
function pruefeInhaltBackfillEingabe(data) {
  const cursor = data?.cursor ?? null;
  if (cursor !== null &&
      (typeof cursor !== 'string' || !cursor.trim() || cursor.includes('/') || cursor.length > MAX_ID_LAENGE)) {
    throw new HttpsError('invalid-argument', 'cursor muss eine Rezept-ID oder null sein');
  }
  const anzahl = data?.anzahl ?? INHALT_BACKFILL_ANZAHL_STANDARD;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > INHALT_BACKFILL_ANZAHL_MAX) {
    throw new HttpsError('invalid-argument', `anzahl muss eine ganze Zahl von 1 bis ${INHALT_BACKFILL_ANZAHL_MAX} sein`);
  }
  return {cursor, anzahl};
}

/**
 * Cloud Function: Inhaltsübersetzungen für den Bestand nachtragen (nur admin).
 *
 * Eingabe: {cursor: string|null, anzahl: 1 bis 20 (Standard 10)}. Liest die nächste Seite der
 * Rezepte nach Dokument-ID ab `cursor`, überspringt Rezepte ohne Inhalt, mit laufendem Import oder
 * mit passender Übersetzung und übersetzt die übrigen, höchstens drei gleichzeitig; dazu gehören
 * Übersetzungen, bei denen Gemini früher eine andere Originalsprache als Deutsch erkannt hatte
 * (istAktuelleInhaltUebersetzung). Jedes
 * übersetzte Rezept zählt gegen das Tageslimit des Admins; ist es erreicht, endet die Seite vor
 * dem ersten Rezept, das nicht mehr übersetzt werden darf.
 *
 * Antwort wie backfillTitelUebersetzungen: {geprueft, neu, uebersprungen, fehlgeschlagen,
 * fehlerGruende, naechsterCursor, fertig, tageslimitErreicht, gesamt, remainingRequests, dailyLimit}.
 */
exports.backfillInhaltUebersetzungen = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 1,
      memory: '512MiB',
      timeoutSeconds: 540,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      const {cursor, anzahl} = pruefeInhaltBackfillEingabe(request.data);
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Inhaltsübersetzungen nachtragen dürfen nur Admins.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('backfillInhaltUebersetzungen: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }

      const db = getFirestore();
      const rezepte = db.collection('recipes');
      let abfrage = rezepte.orderBy(FieldPath.documentId()).limit(anzahl);
      if (cursor) abfrage = abfrage.startAfter(cursor);
      const [seite, gesamt] = await Promise.all([
        abfrage.get(),
        cursor ? Promise.resolve(null) : zaehleRezepte(rezepte),
      ]);

      const eintraege = seite.docs.map((snap) => {
        const rezept = snap.data() || {};
        const anfrage = rezept.importStatus ? null : anfrageAusRezept(rezept);
        return {id: snap.id, ref: snap.ref, rezept, anfrage, quellHash: anfrage ? inhaltQuellHash(rezept) : null};
      });
      const vorhandene = await Promise.all(eintraege.map((eintrag) => (
        eintrag.anfrage ? db.collection(UEBERSETZUNGEN).doc(eintrag.id).get() : null
      )));

      let remainingRequests = null;
      let tageslimitErreicht = false;
      let letzteId = cursor;
      let geprueft = 0;
      let uebersprungen = 0;
      const zuUebersetzen = [];
      for (const [index, eintrag] of eintraege.entries()) {
        const vorhanden = vorhandene[index];
        if (!eintrag.anfrage || (vorhanden?.exists && istAktuelleInhaltUebersetzung(vorhanden.data(), eintrag.quellHash))) {
          uebersprungen += 1;
        } else {
          const quota = await consumeDailyQuota(INHALT_LIMIT_COLLECTION, LIMIT_INHALT_BACKFILL_ADMIN, caller);
          if (!quota.allowed) {
            tageslimitErreicht = true;
            break;
          }
          remainingRequests = quota.remaining;
          zuUebersetzen.push(eintrag);
        }
        letzteId = eintrag.id;
        geprueft += 1;
      }

      if (tageslimitErreicht && geprueft === 0) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Inhaltsübersetzungen erreicht (${LIMIT_INHALT_BACKFILL_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      let neu = 0;
      const fehlgeschlagen = [];
      const fehlerGruende = {};
      await mitBegrenzterParallelitaet(zuUebersetzen, INHALT_MAX_PARALLEL, async (eintrag) => {
        const ergebnis = await uebersetzeInhalt(apiKey, eintrag.anfrage, eintrag.id);
        if (!ergebnis) {
          fehlgeschlagen.push(eintrag.id);
          fehlerGruende[eintrag.id] = GRUND.KI;
          return;
        }
        const dokument = baueUebersetzungsDokument(eintrag.rezept, eintrag.quellHash, ergebnis, GEMINI_MODEL, Date.now());
        const uebersetzungRef = db.collection(UEBERSETZUNGEN).doc(eintrag.id);
        const stand = await speichereInhalt(db, eintrag.ref, uebersetzungRef, eintrag.quellHash, dokument);
        if (stand === 'neu') {
          neu += 1;
        } else if (stand === 'ueberholt') {
          uebersprungen += 1; // inzwischen geändert: der Trigger übersetzt den neuen Inhalt
        } else {
          fehlgeschlagen.push(eintrag.id);
          fehlerGruende[eintrag.id] = GRUND.SPEICHERN;
        }
      });

      const fertig = !tageslimitErreicht && seite.docs.length < anzahl;
      console.log(`backfillInhaltUebersetzungen: ${geprueft} geprüft, ${neu} neu, ${uebersprungen} übersprungen, ` +
        `${fehlgeschlagen.length} fehlgeschlagen${fertig ? ', fertig' : ''}`);
      return {
        geprueft,
        neu,
        uebersprungen,
        fehlgeschlagen: fehlgeschlagen.sort(),
        fehlerGruende,
        naechsterCursor: fertig ? null : letzteId,
        fertig,
        tageslimitErreicht,
        gesamt,
        remainingRequests,
        dailyLimit: LIMIT_INHALT_BACKFILL_ADMIN,
      };
    },
);

// ── Auswahllisten (PR 5) ──────────────────────────────────────────────────────

const LISTEN_LIMIT_COLLECTION = 'aiListenUebersetzungLimits';
/** Aufrufe je Admin und Tag (fail closed); ein Aufruf übersetzt bis zu 100 Listenwerte. */
const LIMIT_LISTEN_ADMIN = 100;
const LISTEN_GEMINI_TIMEOUT_MS = 60000;

/**
 * Cloud Function: Übersetzungsvorschläge für Listenwerte (nur admin).
 *
 * Eingabe: {eintraege: [{liste, wert, text?} | {liste, wert, einzahl, mehrzahl}]}, 1 bis 100.
 * Antwort: {vorschlaege: [{liste, wert, en, fr}], remainingRequests, dailyLimit}; bei Einheiten
 * sind en und fr {einzahl, mehrzahl}. Einträge ohne gültige Antwort fehlen in den Vorschlägen.
 */
exports.uebersetzeListenwerte = onCall(
    {
      secrets: [geminiApiKey],
      cors: ALLOWED_ORIGINS,
      invoker: 'public',
      maxInstances: 2,
      memory: '256MiB',
      timeoutSeconds: 90,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Anmeldung erforderlich');
      }
      let eintraege;
      try {
        eintraege = pruefeListenEingabe(request.data?.eintraege);
      } catch (error) {
        throw new HttpsError('invalid-argument', error.message);
      }
      const caller = await requireAiCaller(request.auth);
      if (!caller.isAdmin) {
        throw new HttpsError('permission-denied', 'Übersetzungsvorschläge für Listen dürfen nur Admins anfordern.');
      }
      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        console.error('uebersetzeListenwerte: GEMINI_API_KEY ist nicht gesetzt');
        throw new HttpsError('failed-precondition', 'Der KI-Dienst ist nicht eingerichtet.');
      }
      const quota = await consumeDailyQuota(LISTEN_LIMIT_COLLECTION, LIMIT_LISTEN_ADMIN, caller);
      if (!quota.allowed) {
        throw new HttpsError(
            'resource-exhausted',
            `Tageslimit für Listenübersetzungen erreicht (${LIMIT_LISTEN_ADMIN}). Versuche es morgen erneut.`,
        );
      }

      const {url, headers} = geminiGenerateContentRequest(apiKey);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LISTEN_GEMINI_TIMEOUT_MS);
      let vorschlaege;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{parts: [{text: baueListenPrompt(eintraege)}]}],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: LISTEN_RESPONSE_SCHEMA,
            },
          }),
        });
        if (!response.ok) {
          console.error(`uebersetzeListenwerte: Gemini antwortet ${response.status}`);
          throw new HttpsError('unavailable', 'Der KI-Dienst hat nicht geantwortet. Versuche es gleich noch einmal.');
        }
        const data = await response.json();
        let geparst = null;
        try {
          geparst = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
        } catch {
          console.error('uebersetzeListenwerte: keine JSON-Antwort');
        }
        vorschlaege = pruefeListenAntwort(geparst, eintraege);
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        const art = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
        console.error(`uebersetzeListenwerte: Gemini nicht erreichbar: ${art}`);
        throw new HttpsError('unavailable', 'Der KI-Dienst hat nicht geantwortet. Versuche es gleich noch einmal.');
      } finally {
        clearTimeout(timer);
      }

      console.log(`uebersetzeListenwerte: ${vorschlaege.length} von ${eintraege.length} Vorschlägen`);
      return {vorschlaege, remainingRequests: quota.remaining, dailyLimit: LIMIT_LISTEN_ADMIN};
    },
);
