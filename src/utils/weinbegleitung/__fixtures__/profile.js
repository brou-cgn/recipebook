/**
 * Profil-Fixtures für die Tests der Weinbegleitung (keine KI). Die Werte der
 * Golden-Gerichte G1 bis G7 und E3 stammen aus der Spezifikation im Tracker
 * docs/vorhaben/weinbegleitung.md; nicht genannte Komponenten sind 0.
 */

const KOMPONENTEN_NULL = { saeure: 0, suesse: 0, salz: 0, fett: 0, schaerfe: 0, bitter: 0, umami: 0 };

/**
 * Gespeichertes Profil wie es die Cloud Function schreibt (inkl. Metadaten).
 * @param {Object} werte - rolle, hauptkomponente, zubereitung, sauce, intensitaet und Komponenten
 * @returns {Object}
 */
export function weinprofil({ rolle, hauptkomponente, zubereitung, sauce, intensitaet, ...komponenten }) {
  return {
    rolle,
    hauptkomponente,
    zubereitung,
    sauce,
    intensitaet,
    komponenten: { ...KOMPONENTEN_NULL, ...komponenten },
    konfidenz: 0.9,
    inputHash: 'fixture',
    modell: 'fixture',
    schemaVersion: 1,
    erstelltAm: 0,
  };
}

/**
 * @param {string} id
 * @param {Object|undefined} profil
 * @returns {Object} Rezept mit optionalem weinprofil
 */
export const rezept = (id, profil) => (profil ? { id, title: id, weinprofil: profil } : { id, title: id });

export const G1_LACHSTATAR = weinprofil({
  rolle: 'vorspeise', hauptkomponente: 'fisch_fett', zubereitung: 'roh', sauce: 'zitrus_essig',
  intensitaet: 2, saeure: 2, fett: 2,
});

export const G2_SPARGEL_HOLLANDAISE = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'spargel', zubereitung: 'gedaempft_pochiert', sauce: 'sahne_butter_kaese',
  intensitaet: 2, fett: 2,
});

export const G3_GARNELEN_CURRY = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'meeresfruechte', zubereitung: 'geschmort', sauce: 'curry_gewuerze',
  intensitaet: 4, schaerfe: 3, fett: 2, suesse: 1,
});

export const G4_PILZRISOTTO = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'pilze', zubereitung: 'gebraten', sauce: 'pilz_erdig',
  intensitaet: 3, fett: 2, umami: 2,
});

export const G5_RINDERSCHMORBRATEN = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'rind_lamm', zubereitung: 'geschmort', sauce: 'rotwein_jus',
  intensitaet: 5, fett: 2, salz: 2, umami: 2,
});

export const G6_SCHOKOLADENMOUSSE = weinprofil({
  rolle: 'dessert', hauptkomponente: 'dessert_schoko', zubereitung: 'kalt', sauce: 'keine',
  intensitaet: 4, suesse: 3, fett: 2,
});

export const G7_APFELSTRUDEL = weinprofil({
  rolle: 'dessert', hauptkomponente: 'dessert_frucht', zubereitung: 'gebacken', sauce: 'suess_fruchtig',
  intensitaet: 3, suesse: 2,
});

export const E3_EXTREM = weinprofil({
  rolle: 'vorspeise', hauptkomponente: 'gemuese', zubereitung: 'kalt', sauce: 'scharf_chili',
  intensitaet: 5, schaerfe: 3, saeure: 3, suesse: 2, bitter: 2,
});

// Festtagsgerichte mit süßen Beilagen, Würzungen oder Saucen. Kalibrierung vom 14.11.2026
// (Eigentümer: „es wird immer Süßwein vorgeschlagen“). Die Werte sind so geschätzt, wie Gemini
// herzhafte Gerichte mit Zwiebeln, Äpfeln, Honig oder Kompott einstuft: Süße 1 bis 3.
export const G10_GAENSEBRATEN = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'gefluegel', zubereitung: 'geschmort', sauce: 'rotwein_jus',
  intensitaet: 4, suesse: 1, salz: 2, fett: 3, umami: 2,
});

export const G10_APFELROTKOHL = weinprofil({
  rolle: 'beilage', hauptkomponente: 'gemuese', zubereitung: 'geschmort', sauce: 'suess_fruchtig',
  intensitaet: 3, saeure: 2, suesse: 2,
});

export const G10_KLOESSE = weinprofil({
  rolle: 'beilage', hauptkomponente: 'huelsenfruechte_getreide', zubereitung: 'gedaempft_pochiert', sauce: 'keine',
  intensitaet: 1, salz: 1,
});

export const G11_REHRUECKEN = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'wild', zubereitung: 'gebraten', sauce: 'rotwein_jus',
  intensitaet: 4, salz: 1, fett: 1, umami: 2,
});

export const G11_PREISELBEEREN = weinprofil({
  rolle: 'sauce_dip', hauptkomponente: 'dessert_frucht', zubereitung: 'gedaempft_pochiert', sauce: 'suess_fruchtig',
  intensitaet: 3, saeure: 2, suesse: 3,
});

export const G12_ZIEGENKAESE_HONIG = weinprofil({
  rolle: 'vorspeise', hauptkomponente: 'kaese_frisch', zubereitung: 'kalt', sauce: 'suess_fruchtig',
  intensitaet: 3, saeure: 2, suesse: 2, salz: 1, fett: 2,
});

export const G13_ENTE_ORANGE = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'gefluegel', zubereitung: 'gebraten', sauce: 'suess_fruchtig',
  intensitaet: 4, saeure: 1, suesse: 2, salz: 1, fett: 3,
});

export const G14_SCHWEINEFILET = weinprofil({
  rolle: 'hauptgericht', hauptkomponente: 'schwein_kalb', zubereitung: 'gebraten', sauce: 'sahne_butter_kaese',
  intensitaet: 3, salz: 2, fett: 2, umami: 1,
});

export const G14_HONIGMOEHREN = weinprofil({
  rolle: 'beilage', hauptkomponente: 'gemuese', zubereitung: 'gedaempft_pochiert', sauce: 'suess_fruchtig',
  intensitaet: 2, suesse: 2, fett: 1,
});

export const G15_BIRNE_GORGONZOLA = weinprofil({
  rolle: 'vorspeise', hauptkomponente: 'kaese_blau', zubereitung: 'gebacken', sauce: 'keine',
  intensitaet: 4, suesse: 2, salz: 2, fett: 2,
});

// Pizza-Abend: mehrere Pizzen als Hauptgerichte in einem Gang (Eigentümer, 14.11.2026: „Als
// Hauptgang gibt es diverse Pizzen. Die Weinauswahl verstehe ich nicht“, angezeigt wurde „Hier
// lieber Bier oder Wasser“ mit Rot mittelkräftig und Weiß feinherb, beide „passt bedingt“).
// Die Werte sind geschätzt, wie Gemini Pizzen einstuft; die echten Profile kennt das Repo nicht.
const pizza = (hauptkomponente, sauce, intensitaet, komponenten) => weinprofil({
  rolle: 'hauptgericht', hauptkomponente, zubereitung: 'gebacken', sauce, intensitaet, ...komponenten,
});

// Die Margherita steht vorn und ist mit Intensität 4 das Leitrezept: Mozzarella ist für Rotwein
// neutral. Die Süße 2 bringt die Hawaii mit.
export const G16_MARGHERITA = pizza('kaese_frisch', 'tomate', 4, { saeure: 2, suesse: 1, salz: 2, fett: 2, umami: 2 });
export const G16_SALAMI = pizza('wurst_schinken', 'tomate', 4, {
  saeure: 2, suesse: 1, salz: 3, fett: 3, schaerfe: 1, umami: 2,
});
export const G16_FUNGHI = pizza('pilze', 'tomate', 3, { saeure: 2, suesse: 1, salz: 2, fett: 2, umami: 3 });
export const G16_HAWAII = pizza('wurst_schinken', 'suess_fruchtig', 3, {
  saeure: 2, suesse: 2, salz: 2, fett: 2, umami: 1,
});
// Für G17: eine scharfe Pizza unter vier
export const G17_DIAVOLA = pizza('wurst_schinken', 'tomate', 5, {
  saeure: 2, suesse: 1, salz: 3, fett: 3, schaerfe: 3, umami: 2,
});

/**
 * Menü G1 → G5 → G6 (Vorspeise, Hauptgang, Dessert) mit leerer Drinks-Sektion.
 * @returns {{menu: Object, rezepte: Array<Object>}}
 */
export function festmenue() {
  return {
    menu: {
      id: 'menu-1',
      sections: [
        { name: 'Vorspeise', recipeIds: ['lachstatar'] },
        { name: 'Hauptgang', recipeIds: ['schmorbraten'] },
        { name: 'Dessert', recipeIds: ['mousse'] },
        { name: 'Drinks', recipeIds: [], drinkIds: [] },
      ],
    },
    rezepte: [
      rezept('lachstatar', G1_LACHSTATAR),
      rezept('schmorbraten', G5_RINDERSCHMORBRATEN),
      rezept('mousse', G6_SCHOKOLADENMOUSSE),
    ],
  };
}
