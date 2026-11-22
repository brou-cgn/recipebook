import React, { useState, useEffect } from 'react';
import './MeineKuechenstarsPage.css';
import { getRecentRecipeCalls } from '../utils/recipeCallsFirestore';
import { UnterseiteKopf, Kennzahl } from './Unterseite';

function MeineKuechenstarsPage({ onBack, currentUser, recipes = [] }) {
  const [recipeCalls, setRecipeCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentRecipeCalls(14)
      .then(calls => {
        setRecipeCalls(calls);
        setLoading(false);
      })
      .catch(err => {
        console.error('Fehler beim Laden der Rezeptaufrufe:', err);
        setLoading(false);
      });
  }, []);

  const ownRecipes = recipes.filter(r => r.authorId === currentUser?.id);

  const top20 = (() => {
    const callCountById = new Map();
    recipeCalls.forEach(call => {
      callCountById.set(call.recipeId, (callCountById.get(call.recipeId) || 0) + 1);
    });
    return ownRecipes
      .map(recipe => ({ recipe, count: callCountById.get(recipe.id) || 0 }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  })();

  const maxCount = top20.length ? top20[0].count : 1;
  const summeAufrufe = top20.reduce((summe, { count }) => summe + count, 0);
  const podium = top20.slice(0, 3);
  const rest = top20.slice(3);
  const balkenBreite = (count) => `${Math.max(4, Math.round((count / maxCount) * 100))}%`;

  return (
    <div className="meine-kuechenstars-container">
      <UnterseiteKopf onZurueck={onBack}>
        <h2>Meine Küchenstars</h2>
      </UnterseiteKopf>
      <p className="unterseite-untertitel">
        Hier sind deine Top 20 Rezepte nach Anzahl der Aufrufe der letzten 14 Tage.
      </p>
      {loading ? (
        <div className="unterseite-karte meine-kuechenstars-empty">Laden...</div>
      ) : top20.length === 0 ? (
        <div className="unterseite-karte meine-kuechenstars-empty">Noch keine Rezeptaufrufe vorhanden.</div>
      ) : (
        <>
          <div className="unterseite-kennzahlen">
            <Kennzahl wert={summeAufrufe} label={<>Aufrufe</>} />
            <Kennzahl wert={top20.length} label={<>Rezepte</>} />
          </div>
          <ol className="kuechenstars-podium">
            {podium.map(({ recipe, count }, index) => (
              <li key={recipe.id} className={`kuechenstars-platz kuechenstars-platz--${index + 1}`}>
                <span className="kuechenstars-rang">{index + 1}</span>
                <span className="kuechenstars-titel">{recipe.title}</span>
                <span className="kuechenstars-aufrufe">{count}</span>
              </li>
            ))}
          </ol>
          {rest.length > 0 && (
            <ol className="kuechenstars-rest unterseite-karte" start={4}>
              {rest.map(({ recipe, count }, index) => (
                <li key={recipe.id} className="kuechenstars-zeile">
                  <span className="kuechenstars-rang">{index + 4}</span>
                  <span className="kuechenstars-zeile-text">
                    <span className="kuechenstars-titel">{recipe.title}</span>
                    <span className="kuechenstars-balken" aria-hidden="true">
                      <span style={{ width: balkenBreite(count) }} />
                    </span>
                  </span>
                  <span className="kuechenstars-aufrufe">{count}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

export default MeineKuechenstarsPage;
