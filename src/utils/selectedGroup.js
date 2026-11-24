/**
 * Die geöffnete Liste (Gruppen-Detailansicht) in ihrem aktuellen Stand.
 *
 * App.js merkt sich beim Öffnen das Listendokument. Dieser Stand veraltet, sobald sich die Liste
 * in Firestore ändert (Mitglied entfernt oder hinzugefügt, Rezept zugeordnet), und die Ansicht
 * zeigte die Änderung erst nach erneutem Öffnen. Maßgeblich ist daher der Eintrag aus dem
 * Live-Abo `groups`; der gemerkte Stand gilt nur, solange das Abo die Liste nicht (mehr) führt,
 * etwa direkt nach dem Austreten.
 *
 * @param {Array<{id: string}>} groups - Listen aus dem Firestore-Abo
 * @param {{id: string}|null} snapshot - beim Öffnen gemerkte Liste
 * @returns {{id: string}|null}
 */
export function resolveSelectedGroup(groups, snapshot) {
  if (!snapshot) return null;
  const live = Array.isArray(groups) ? groups.find((group) => group?.id === snapshot.id) : null;
  return live || snapshot;
}
