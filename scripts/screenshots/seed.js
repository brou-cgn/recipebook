#!/usr/bin/env node
/**
 * Testdaten für Screenshots gegen die lokalen Firebase-Emulatoren (docs/setup/screenshots.md).
 *
 * Leert Auth- und Firestore-Emulator und legt dann an: ein Admin-Konto, sechs Rezepte mit
 * Platzhalterbildern, die öffentliche Liste, zwei private Listen (eine davon die interaktive
 * Inspirationssammlung), ein Menü, ein Event, einen Kochtagebuch-Eintrag, eine Bewertung, einen
 * Eintrag der Saisonmatrix und zwei Einträge der Kochschule, dazu Weinprofile für die drei Gerichte des
 * Menüs und eigene Test-Icons der Weinbegleitung (Rot, Weiß, Süß, Bier oder Wasser). Die Startseite („Küche“) ist für Admins
 * freigeschaltet und hat Inspirationssammlung und Alltagsklassiker gesetzt, damit ihre
 * Karussells samt Plus-Knöpfen erscheinen (Tech-Check T9).
 * Alles erfunden und als Testdaten erkennbar. Schreibt über die REST-Schnittstelle der
 * Emulatoren („Authorization: Bearer owner“ umgeht die Regeln) und braucht keine Pakete.
 *
 * Läuft nur gegen 127.0.0.1, nie gegen ein echtes Projekt.
 */
const PROJECT = process.env.SCREENSHOT_PROJECT || 'demo-recipebook';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

const ACCOUNT = { email: 'testkoch@example.com', password: 'screenshots-only', vorname: 'Testkoch', nachname: 'Beispiel' };

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
}

async function call(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const docUrl = (path) => `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const setDoc = (path, data) => call('PATCH', docUrl(path), { fields: toValue(data).mapValue.fields }, { Authorization: 'Bearer owner' });

/**
 * Ändert Felder eines Dokuments für einzelne Bildschirme (capture.js); `undefined` entfernt ein Feld.
 * Der Bildschirm setzt sie danach zurück, damit die übrigen Bilder die Testdaten von main() zeigen.
 */
async function patchDoc(docPath, fields) {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const kept = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  await call('PATCH', `${docUrl(docPath)}?${mask}`, { fields: toValue(kept).mapValue.fields }, { Authorization: 'Bearer owner' });
}

/** Wie patchDoc, für das Testkonto. */
async function patchAccount(fields) {
  const { localId: uid } = await call('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    email: ACCOUNT.email, password: ACCOUNT.password, returnSecureToken: true,
  });
  await patchDoc(`users/${uid}`, fields);
}

/** Platzhalterbild als SVG: Teller auf farbigem Grund, je Rezept ein anderer Farbton. */
function placeholderImage(hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<defs><radialGradient id="g" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="hsl(${hue},55%,62%)"/><stop offset="1" stop-color="hsl(${hue},45%,32%)"/></radialGradient></defs>
<rect width="800" height="600" fill="url(#g)"/>
<circle cx="400" cy="300" r="190" fill="hsl(${hue},20%,96%)"/><circle cx="400" cy="300" r="140" fill="hsl(${(hue + 25) % 360},60%,52%)"/>
<circle cx="350" cy="260" r="34" fill="hsl(${(hue + 90) % 360},55%,45%)"/><circle cx="455" cy="330" r="26" fill="hsl(${(hue + 150) % 360},50%,58%)"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Nährwerte für drei Rezepte: eins berechnet (mit einer nicht berücksichtigten Zutat, damit der
// Nährwert-Dialog seine Zusammensetzung zeigt), eins in Berechnung (App-Aufrufe, Reiter
// „Nährwertberechnungen“, mit „Berechnung abbrechen“), eins mit Fehler („Erneut versuchen“)
const NUTRITION = {
  'rezept-linsensuppe': {
    kalorien: 320, protein: 18, fett: 6, kohlenhydrate: 48, zucker: 7, ballaststoffe: 12, salz: 1.8,
    calcNotIncluded: [{ ingredient: '1 Zitrone' }],
  },
  'rezept-aglio-olio': { calcPending: true, calcPendingAt: Date.parse('2026-11-20T17:30:00Z') },
  // Fehlgeschlagene Berechnung: Der Nährwert-Dialog zeigt die Meldung und „Erneut versuchen“
  'rezept-shakshuka': { calcError: 'Die Nährwertdatenbank war nicht erreichbar (Testdaten).' },
};

// Weinprofile für die drei Gerichte des Menüs „Sonntagsessen“ (Weinbegleitung, docs/vorhaben/weinbegleitung.md):
// Spargel bekommt einen Weißwein, das scharfe Curry „Hier lieber Bier oder Wasser“, der Apfelkuchen einen
// Süßwein. Der inputHash kommt aus der Cloud Function, damit die App die Profile als aktuell ansieht und
// „Weinbegleitung erstellen“ ohne KI-Aufruf rechnet (capture.js, menue-weinbegleitung).
const WEINPROFILE = {
  'rezept-spargel': { rolle: 'vorspeise', hauptkomponente: 'spargel', zubereitung: 'gebraten', sauce: 'sahne_butter_kaese', intensitaet: 2, fett: 2, saeure: 1 },
  'rezept-thai-curry': { rolle: 'hauptgericht', hauptkomponente: 'gemuese', zubereitung: 'geschmort', sauce: 'scharf_chili', intensitaet: 5, schaerfe: 3, saeure: 3, suesse: 2, bitter: 2 },
  'rezept-apfelkuchen': { rolle: 'dessert', hauptkomponente: 'dessert_frucht', zubereitung: 'gebacken', sauce: 'keine', intensitaet: 3, suesse: 2, fett: 1 },
};

function weinprofilFuer(rezept) {
  const { weinprofilInputHash, SCHEMA_VERSION } = require('../../functions/shared/weinprofil');
  const { rolle, hauptkomponente, zubereitung, sauce, intensitaet, ...komponenten } = WEINPROFILE[rezept.id];
  return {
    rolle, hauptkomponente, zubereitung, sauce, intensitaet,
    komponenten: { saeure: 0, suesse: 0, salz: 0, fett: 0, schaerfe: 0, bitter: 0, umami: 0, ...komponenten },
    konfidenz: 0.9, inputHash: weinprofilInputHash(rezept), modell: 'testdaten', schemaVersion: SCHEMA_VERSION, erstelltAm: 0,
  };
}

/** Erkennbares Test-Icon: Kreis mit Buchstabe (Button-Icons der Weinbegleitung). */
function testIcon(buchstabe, farbe) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
<circle cx="24" cy="24" r="22" fill="${farbe}"/><text x="24" y="31" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">${buchstabe}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Eingerichtete Icons der Weinbegleitung (Einstellungen › Bilder & Icons, Gruppe „Rezept-Details“)
const WEIN_ICONS = {
  weinRot: testIcon('R', '#8c2f39'),
  weinWeiss: testIcon('W', '#b8962e'),
  weinSuess: testIcon('S', '#c46a1b'),
  weinKeinStil: testIcon('B', '#3d6f8f'),
};

const RECIPES = [
  {
    id: 'rezept-linsensuppe', hue: 28, title: 'Linsensuppe mit Kreuzkümmel', kulinarik: ['Orientalisch'], speisekategorie: ['Hauptgericht'],
    portionen: 4, kochdauer: 40, schwierigkeit: 2,
    ingredients: ['250 g rote Linsen', '1 Zwiebel', '2 Karotten', '1 TL Kreuzkümmel', '1 l Gemüsebrühe', '1 Zitrone'],
    steps: ['Zwiebel und Karotten würfeln und in Öl anschwitzen.', 'Linsen und Kreuzkümmel zugeben, mit Brühe aufgießen.', '20 Minuten köcheln, pürieren und mit Zitrone abschmecken.'],
  },
  {
    id: 'rezept-aglio-olio', hue: 45, title: 'Spaghetti aglio e olio', kulinarik: ['Italienisch'], speisekategorie: ['Hauptgericht'],
    portionen: 2, kochdauer: 20, schwierigkeit: 1,
    ingredients: ['200 g Spaghetti', '3 Knoblauchzehen', '1 Chilischote', '5 EL Olivenöl', 'Petersilie'],
    steps: ['Spaghetti in Salzwasser bissfest kochen.', 'Knoblauch und Chili in Öl sanft goldgelb braten.', 'Nudeln mit etwas Kochwasser im Öl schwenken, Petersilie darüber.'],
  },
  {
    id: 'rezept-shakshuka', hue: 8, title: 'Shakshuka', kulinarik: ['Orientalisch'], speisekategorie: ['Frühstück'],
    portionen: 2, kochdauer: 25, schwierigkeit: 2,
    ingredients: ['4 Eier', '1 Dose Tomaten', '1 rote Paprika', '1 Zwiebel', '1 TL Paprikapulver', 'Feta'],
    steps: ['Zwiebel und Paprika weich dünsten.', 'Tomaten und Gewürze zugeben, 10 Minuten einkochen.', 'Mulden formen, Eier hineinschlagen und zugedeckt stocken lassen.'],
  },
  {
    id: 'rezept-spargel', hue: 95, title: 'Grüner Spargel mit Zitronenbutter', kulinarik: ['Deutsch'], speisekategorie: ['Vorspeise'],
    portionen: 4, kochdauer: 15, schwierigkeit: 1,
    ingredients: ['500 g grüner Spargel', '40 g Butter', '1 Bio-Zitrone', 'Salz', 'Pfeffer'],
    steps: ['Spargel im unteren Drittel schälen und die Enden abschneiden.', 'In der Pfanne 6 Minuten braten.', 'Butter mit Zitronenabrieb schmelzen und darübergeben.'],
  },
  {
    id: 'rezept-thai-curry', hue: 140, title: 'Grünes Thai-Curry mit Gemüse', kulinarik: ['Thai'], speisekategorie: ['Hauptgericht'],
    portionen: 4, kochdauer: 35, schwierigkeit: 3,
    ingredients: ['400 ml Kokosmilch', '2 EL grüne Currypaste', '1 Zucchini', '1 rote Paprika', '200 g Brokkoli', 'Thai-Basilikum'],
    steps: ['Currypaste in etwas Kokosmilch anrösten.', 'Restliche Kokosmilch und Gemüse zugeben, 10 Minuten garen.', 'Mit Basilikum servieren, dazu Reis.'],
  },
  {
    id: 'rezept-apfelkuchen', hue: 18, title: 'Apfelkuchen vom Blech', kulinarik: ['Deutsch'], speisekategorie: ['Dessert'],
    portionen: 12, kochdauer: 60, schwierigkeit: 2,
    ingredients: ['300 g Mehl', '200 g Butter', '150 g Zucker', '3 Eier', '1 kg Äpfel', 'Zimt'],
    steps: ['Butter, Zucker und Eier cremig rühren, Mehl unterheben.', 'Teig aufs Blech streichen, Apfelspalten darauflegen.', 'Bei 180 °C 35 Minuten backen, mit Zimt bestäuben.'],
  },
];

// Fester Zeitpunkt der Testdaten: Rezept i ist i Tage davor angelegt (capture.js rechnet damit)
const SEED_NOW = new Date('2026-11-20T18:00:00Z');

async function main() {
  // Emulatoren leeren, damit jeder Lauf dieselben Daten hat
  await call('DELETE', `${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
  await call('DELETE', `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);

  const { localId: uid } = await call('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    email: ACCOUNT.email, password: ACCOUNT.password, returnSecureToken: true,
  });
  const now = SEED_NOW;

  await setDoc(`users/${uid}`, {
    vorname: ACCOUNT.vorname, nachname: ACCOUNT.nachname, email: ACCOUNT.email,
    role: 'admin', fotoscan: false, createdAt: now.toISOString(),
    defaultWebImportListId: 'inspiration', defaultEverydayClassicsListId: 'familie',
  });
  // Startseite („Küche“) für Admins freischalten; ohne sie fehlte die Startseite in den Bildern (T9)
  await setDoc('rolePermissions/admin', { startseite: true });
  await setDoc(`publicProfiles/${uid}`, { vorname: ACCOUNT.vorname, nachname: ACCOUNT.nachname, versteckt: false, recipe_count: RECIPES.length });
  await setDoc('groups/oeffentlich', { type: 'public', name: 'Öffentlich', ownerId: null, memberIds: [], memberRoles: {}, createdAt: now });
  await setDoc('groups/familie', {
    type: 'private', name: 'Familienrezepte', ownerId: uid, memberIds: [uid], memberRoles: { [uid]: 'owner' },
    recipeIds: ['rezept-linsensuppe', 'rezept-apfelkuchen'], createdAt: now,
  });
  await setDoc('groups/inspiration', {
    type: 'private', listKind: 'interactive', name: 'Meine Inspirationen', ownerId: uid, memberIds: [uid],
    memberRoles: { [uid]: 'owner' }, recipeIds: ['rezept-aglio-olio', 'rezept-thai-curry'], createdAt: now,
  });

  for (const [i, r] of RECIPES.entries()) {
    const { id, hue, ...fields } = r;
    await setDoc(`recipes/${id}`, {
      ...fields,
      image: placeholderImage(hue),
      authorId: uid,
      groupId: 'oeffentlich',
      publishedToPublic: true,
      isPrivate: false,
      createdAt: new Date(now.getTime() - i * 86400000).toISOString(),
      ...(NUTRITION[id] ? { naehrwerte: NUTRITION[id] } : {}),
      ...(WEINPROFILE[id] ? { weinprofil: weinprofilFuer(r) } : {}),
    });
  }
  for (const [schluessel, value] of Object.entries(WEIN_ICONS)) {
    await setDoc(`buttonIcons/${schluessel}`, { value });
  }

  // Rezeptaufrufe der letzten Stunden, relativ zur echten Zeit: Sie liegen so immer im 14-Tage-Fenster
  // von „Meine Küchenstars“ (Podium, Balken) und der Küchenstars-Kachel in „Chefkoch & mehr“.
  const aufrufe = [['rezept-aglio-olio', 7], ['rezept-linsensuppe', 5], ['rezept-apfelkuchen', 4],
    ['rezept-shakshuka', 3], ['rezept-thai-curry', 2], ['rezept-spargel', 1]];
  let aufrufNr = 0;
  for (const [recipeId, anzahl] of aufrufe) {
    const recipeTitle = RECIPES.find((rezept) => rezept.id === recipeId).title;
    for (let i = 0; i < anzahl; i++) {
      aufrufNr += 1;
      await setDoc(`recipeCalls/aufruf-${aufrufNr}`, {
        recipeId, recipeTitle, userId: uid, userVorname: ACCOUNT.vorname, userNachname: ACCOUNT.nachname,
        isGuest: false, timestamp: new Date(Date.now() - aufrufNr * 60 * 60 * 1000),
      });
    }
  }

  // Ein „Gekocht am“-Eintrag und eine Bewertung der Linsensuppe: Kochtagebuch und Bewertung zeigen dann je eine
  // Zeile mit Löschen (DeleteRowButton, Tech-Check D9)
  await setDoc('cookDates/kochdatum-linsensuppe', {
    userId: uid, recipeId: 'rezept-linsensuppe', date: new Date('2026-11-18T18:00:00Z'), createdAt: now,
  });
  await setDoc('recipes/rezept-linsensuppe/ratings/gast-anna', {
    rating: 4, userId: null, raterName: 'Anna', comment: 'Mit Brot sehr gut.', createdAt: now, updatedAt: now,
  });

  // Zwei Einträge der Kochschule (Einstellungen › Kochschule: Zeilen mit Pfeilen, Bearbeiten und Löschen), der erste mit
  // Screenshot (das Bearbeiten-Formular zeigt dann „Entfernen“)
  await setDoc('faqs/faq-rezept-anlegen', {
    sourceId: 'faq-rezept-anlegen', title: 'Wie lege ich ein Rezept an?', description: 'Im Kochbuch über „+ Rezept“ (Testdaten).',
    screenshot: placeholderImage(200), order: 0, level: 1, showOnDesktop: true, showOnMobile: true, createdAt: now, updatedAt: now,
  });
  await setDoc('faqs/faq-liste-teilen', {
    sourceId: 'faq-liste-teilen', title: 'Wie teile ich eine Liste?', description: 'In der Liste über „Teilen“ (Testdaten).',
    order: 1, level: 1, showOnDesktop: true, showOnMobile: true, createdAt: now, updatedAt: now,
  });

  // Ein Eintrag der Saisonmatrix (Einstellungen › Saisonmatrix: Zeile mit Bearbeiten und Löschen). Quitte passt zu
  // keinem Testrezept, die übrigen Bilder (etwa „Saisonale Rezepte“ auf der Startseite) bleiben so unverändert.
  await setDoc('seasonMatrix/quitte', {
    name: 'Quitte', category: 'Obst', mainSeasonMonths: [10, 11], secondarySeasonMonths: [9, 12], seasonScore: 3,
    isActive: true, region: 'GLOBAL', synonyms: [], description: 'Testdaten', updatedAt: now,
  });

  await setDoc('menus/menu-sonntag', {
    name: 'Sonntagsessen', description: 'Drei Gänge für sechs Personen', authorId: uid, privat: false,
    sections: [
      { name: 'Vorspeise', recipeIds: ['rezept-spargel'] },
      { name: 'Hauptgang', recipeIds: ['rezept-thai-curry'] },
      { name: 'Nachtisch', recipeIds: ['rezept-apfelkuchen'] },
    ],
    createdAt: now.toISOString(),
  });

  await setDoc(`users/${uid}/events/event-sommerfest`, {
    eventName: 'Sommerfest', date: '2026-07-04', durationHours: 5, eventType: 'party', status: 'berechnet',
    guests: { adults: 18, children: 4 }, berechnung: { ergebnis: [] }, ownerId: uid, createdAt: now.toISOString(),
  });

  console.log(`Testdaten angelegt: ${ACCOUNT.email} (Admin, mit Startseite), ${RECIPES.length} Rezepte, ${aufrufNr} Rezeptaufrufe, 3 Listen, 1 Menü, 1 Event, 1 Kochdatum, 1 Bewertung, 1 Saisonmatrix-Eintrag, 2 Kochschule-Einträge, ${Object.keys(WEINPROFILE).length} Weinprofile, ${Object.keys(WEIN_ICONS).length} Wein-Icons.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { ACCOUNT, SEED_NOW, toValue, patchAccount, patchDoc };
