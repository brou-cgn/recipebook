/**
 * Konstanten der Weinbegleitung. Tracker: docs/vorhaben/weinbegleitung.md.
 *
 * Schwellen und Gewichte sind die Startwerte aus der Spezifikation; kalibriert
 * werden sie über die Golden-Tests (golden.test.js). Jede inhaltliche Änderung
 * an diesen Werten oder an der Wissensbasis (src/data/weinbegleitung/) erhöht
 * RULES_VERSION, sonst erkennt die App gespeicherte Menü-Weinbegleitungen nicht
 * als veraltet. wissensbasis.test.js erzwingt das über einen Fingerabdruck.
 */

export const RULES_VERSION = '2026-11-4';

// Rollen, für die ein Einzelrezept keine Weinempfehlung bekommt.
export const ROLLEN_OHNE_WEIN = ['getraenk', 'sauce_dip', 'beilage', 'gebaeck_kuchen'];

// Rezepte mit dieser Rolle zählen in einem Menü-Gang nicht mit.
export const ROLLE_GETRAENK = 'getraenk';
export const ROLLE_HAUPTGERICHT = 'hauptgericht';
export const ROLLE_SAUCE = 'sauce_dip';
export const SAUCE_KEINE = 'keine';

// Beilagen und Saucen begleiten ein Gericht, sie tragen den Gang nicht: Ihre Werte heben
// Intensität und Komponenten des Gangs höchstens um so viele Stufen über die tragenden
// Rezepte. Sonst macht ein Rotkohl (Süße 2) oder Preiselbeeren (Süße 3) aus dem Gänsebraten
// ein Dessert.
export const BEGLEITER_ROLLEN = ['beilage', 'sauce_dip'];
export const BEGLEITER_MAX_ANHEBUNG = 1;

// Gänge, die im Modus „Ein Wein für alles“ eine eigene Empfehlung bekommen.
export const DESSERT_ROLLEN = ['dessert', 'gebaeck_kuchen'];
export const DESSERT_SEKTION_TEIL = 'dessert';

// Name des Abschnitts alter Menüs ohne Sektionen (wie in MenuDetail.js).
export const ALTE_MENUES_SEKTION_NAME = 'Alle Rezepte';

// --- Passung: Punkte je Tag und Gewicht je Tag-Art ---------------------------
export const PASSUNG_PUNKTE = { stark: 3, gut: 2, neutral: 1, meiden: -3 };
export const GEWICHT_SAUCE = 1.0;
export const GEWICHT_HAUPTKOMPONENTE_MIT_SAUCE = 0.8;
export const GEWICHT_HAUPTKOMPONENTE_OHNE_SAUCE = 1.0;
export const GEWICHT_ZUBEREITUNG = 0.5;

// --- Regel-Terme -------------------------------------------------------------
// R1: Intensität angleichen
export const R1_STRAFE_JE_STUFE = 1;
// R2: Wein mindestens so säurereich wie das Gericht
export const R2_STRAFE_JE_STUFE = 2;
// R3: Wein mindestens so süß wie das Gericht; deutlich süßer nur zu Süßem oder Blauschimmelkäse.
// Strafe je Abstand der Süße (Index = Gericht minus Wein): Eine Spur Süße (Zwiebeln, Möhren)
// verträgt ein trockener Wein, ein Dessert nicht. Süßweine kommen zu herzhaften Gerichten
// ohnehin nicht infrage (`nurZu` in stile.json).
export const R3_STRAFE_NACH_ABSTAND = [0, 1, 3, 6];
export const R3_UEBERSUESSE_AB_DIFFERENZ = 2;
export const R3_UEBERSUESSE_STRAFE_JE_STUFE_UEBER_1 = 2;
export const R3_AUSNAHME_HAUPTKOMPONENTE = 'kaese_blau';
// R4: Schärfe
export const R4_AB_SCHAERFE = 2;
export const R4_STRAFE_JE_TANNIN = 2;
export const R4_STRAFE_JE_ALKOHOL_UEBER_1 = 1;
export const R4_BONUS_RESTSUESSE = 1;
export const R4_BONUS_SCHAUM = 1;
// R5: Umami (nur wenn nicht zugleich salzig)
export const R5_AB_UMAMI = 2;
export const R5_SALZ_UNTER = 2;
export const R5_STRAFE_JE_TANNIN_UEBER_1 = 1;
// R6: Fett und Salz
export const R6_AB_FETT_ODER_SALZ = 2;
export const R6_AB_TANNIN = 2;
export const R6_SAEURE = 3;
export const R6_BONUS = 1;
// R9: Bitteres und Gerbstoff
export const R9_AB_BITTER = 2;
export const R9_AB_TANNIN = 2;
export const R9_STRAFE = 2;

// --- Labels und Schwellen ----------------------------------------------------
export const S_MIN = 1.5;
export const S_GUT = 3.5;
export const S_TOP = 5.5;
export const LABEL_TOP = 'passt hervorragend';
export const LABEL_GUT = 'passt gut';
export const LABEL_BASIS = 'passt';

// --- Optionen je Gang im Menü ------------------------------------------------
// Jeder Gang zeigt neben der Empfehlung die beste Option jeder dieser Farben (Eigentümer,
// 14.11.2026: immer eine Rot- und eine Weißwein-Option). Sie muss für den Gang infrage
// kommen (nurZu), darf aber unter S_MIN liegen; dann trägt sie LABEL_BEDINGT. Im Modus
// „Ein Wein für alles“ gibt es je Farbe genau eine Option für alle Gänge, angezeigt im Kopf
// der Weinbegleitung (einWeinOptionen in engine.js).
export const OPTION_FARBEN = ['rot', 'weiss'];
export const LABEL_BEDINGT = 'passt bedingt';

// --- Menüfolge (R10) ---------------------------------------------------------
export const MAX_KANDIDATEN_JE_GANG = 4;
export const MAX_ALTERNATIVEN = 2;
// Bis zu dieser Zahl von Gängen mit Wein werden alle Kombinationen geprüft, darüber greedy.
export const MAX_GAENGE_VOLLSTAENDIG = 6;
export const FOLGE_KOERPER_TOLERANZ = 1;
export const FOLGE_STRAFE_KOERPER_FAELLT = 2;
export const FOLGE_STRAFE_ROT_VOR_HELL = 2;
// Je Stufe, um die die Süße fällt: nach Süßwein (3) zu trocken −3, nach feinherb (1) nur −1,
// damit ein feinherber Wein zur Vorspeise nicht das ganze Menü feinherb macht.
export const FOLGE_STRAFE_SUESSE_FAELLT_JE_STUFE = 1;
export const FOLGE_STRAFE_GLEICHER_STIL = 1;
// Stile ab dieser Süße sind von der Farbregel (rot vor weiß/rosé) ausgenommen.
export const FOLGE_FARBREGEL_AUSNAHME_AB_SUESSE = 3;

// --- Gründe („Warum passt das?“) ---------------------------------------------
export const MAX_GRUENDE = 3;
// Bedingungen, unter denen eine Regel als erfüllt gilt und als Grund erscheinen kann
export const R1_GRUND_NAH_ABSTAND = 1;
export const R2_GRUND_AB_SAEURE = 2;
export const R3_GRUND_AB_SUESSE = 1;
export const R3_GRUND_BLAUSCHIMMEL_AB_SUESSE = 2;
export const R4_RESTSUESSE_AB = 1;
export const R4_SCHONEND_MAX_TANNIN = 0;
export const R4_SCHONEND_MAX_ALKOHOL = 1;
export const R5_TANNIN_FREI_BIS = 1;
// Gewicht von Gründen, die als erfüllte Bedingung gelten (ohne eigenen Punktbeitrag).
export const GRUND_GEWICHT_R1_GLEICH = 1.5;
export const GRUND_GEWICHT_R1_NAH = 0.5;
export const GRUND_GEWICHT_R2 = 1.5;
export const GRUND_GEWICHT_R3 = 2;
export const GRUND_GEWICHT_R5 = 1;
export const GRUND_GEWICHT_R9 = 1;
export const GRUND_GEWICHT_R10 = 2;
// R8 nennt die Farbe als Grund nur, wenn sie zur Aussage der Regel passt
// (rot zu kräftigem Fleisch, weiß zu Fisch und hellem Fleisch).
export const R8_ROT_HAUPTKOMPONENTEN = ['rind_lamm', 'wild'];
export const R8_WEISS_HAUPTKOMPONENTEN = ['fisch_mager', 'fisch_fett', 'meeresfruechte', 'gefluegel', 'schwein_kalb'];

// --- Ergebnis-Codes ----------------------------------------------------------
export const MODUS_PRO_GANG = 'proGang';
export const MODUS_EIN_WEIN = 'einWein';

// Hinweis an einem Gang ohne Wein
export const HINWEIS_KEIN_STIL = 'R11';
export const HINWEIS_OHNE_PROFIL = 'ohneProfil';
export const HINWEIS_KEIN_GEMEINSAMER_STIL = 'keinGemeinsamerStil';

// Ergebnis der Empfehlung für ein Einzelrezept
export const STATUS_OK = 'ok';
export const STATUS_OHNE_PROFIL = 'ohneProfil';
export const STATUS_ROLLE_OHNE_WEIN = 'rolleOhneWein';
export const STATUS_KEIN_STIL = 'keinStil';
