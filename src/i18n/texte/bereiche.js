/**
 * Namen der Bereiche der App (Header-Menü, Seitentitel, untere Navigation).
 *
 * Ob sie übersetzt werden oder als Namen der App bleiben, entscheidet der Eigentümer vor
 * PR 6 (docs/vorhaben/mehrsprachigkeit.md, „Offen“). Bis dahin stehen sie in allen Sprachen
 * wie im Deutschen, damit Menü, Seiten und Navigation gleich heißen. Die Entscheidung wird
 * dann nur hier umgesetzt.
 */
const NAMEN = {
  kueche: 'Küche',
  kochbuch: 'Kochbuch',
  festtafel: 'Festtafel',
  events: 'Events',
  kochatelier: 'Kochatelier',
  chefkoch: 'Chefkoch',
  chefkochUndMehr: 'Chefkoch & mehr',
  kochschule: 'Kochschule',
};

export default {
  de: { ...NAMEN },
  en: { ...NAMEN },
  fr: { ...NAMEN },
};
