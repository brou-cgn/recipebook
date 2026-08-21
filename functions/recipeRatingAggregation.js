const {onDocumentWritten} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Rundet einen Rating-Durchschnitt auf 1 Nachkommastelle (analog zur bisherigen
 * Client-Logik in src/utils/recipeRatings.js).
 * @param {number} sum Summe aller Rating-Werte.
 * @param {number} count Anzahl der Ratings.
 * @return {number} Gerundeter Durchschnitt.
 */
function computeAvg(sum, count) {
  return Math.round((sum / count) * 10) / 10;
}

/**
 * Firestore-Trigger: aggregiert bei jeder Aenderung (Create/Update/Delete) eines
 * Rating-Dokuments in recipes/{recipeId}/ratings/{raterKey} die gesamte
 * Subcollection neu und schreibt ratingAvg/ratingCount auf das Rezept-Dokument.
 * Ersetzt den bisherigen Client-Write auf diese Felder, der ueber die Firestore
 * Rules ohne Auth-Check offen war.
 */
exports.aggregateRecipeRating = onDocumentWritten(
    {document: 'recipes/{recipeId}/ratings/{raterKey}'},
    async (event) => {
      const {recipeId} = event.params;
      const db = admin.firestore();

      const snapshot = await db.collection('recipes').doc(recipeId).collection('ratings').get();
      const recipeRef = db.collection('recipes').doc(recipeId);

      if (snapshot.empty) {
        await recipeRef.update({ratingAvg: null, ratingCount: 0});
        return;
      }

      let sum = 0;
      snapshot.forEach((doc) => {
        sum += doc.data().rating;
      });
      const count = snapshot.size;

      await recipeRef.update({ratingAvg: computeAvg(sum, count), ratingCount: count});
    },
);
