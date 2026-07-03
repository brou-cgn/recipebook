import React, { useMemo, useState } from 'react';
import './AtelierSwipeTrainer.css';

const GESTURES = [
  {
    key: 'right',
    overlay: '→ Für später parken',
    instruction: 'Rechts swipen',
    title: 'Remind me later',
    description: 'Parke ein Rezept für später – es taucht nach 30 Tagen wieder auf.',
    buttonLabel: 'Für später parken',
    accent: 'amber',
  },
  {
    key: 'left',
    overlay: '← Archivieren',
    instruction: 'Links swipen',
    title: "I don't feel it",
    description: 'Verschiebe ein Rezept ins Archiv. Es bleibt auffindbar, stört dich aber nicht mehr.',
    buttonLabel: 'Archivieren',
    accent: 'stone',
  },
  {
    key: 'up',
    overlay: '↑ Jetzt kochen!',
    instruction: 'Nach oben swipen',
    title: "It's a Match",
    description: 'Setze ein Rezept als Kochkandidat – du hast 7 Tage Zeit, es auszuprobieren.',
    buttonLabel: 'Jetzt kochen!',
    accent: 'sage',
  },
];

const DEMO_CARDS = [
  {
    title: 'Sommersalat mit Pfirsich',
    author: 'Atelier Demo',
    tags: ['Leicht', 'Saisonal', '20 Min'],
    emoji: '🥗',
  },
  {
    title: 'Gnocchi aus dem Ofen',
    author: 'Atelier Demo',
    tags: ['Wohlfühlen', 'Ofengericht', 'Vegetarisch'],
    emoji: '🍽️',
  },
  {
    title: 'Miso-Lachs mit Reis',
    author: 'Atelier Demo',
    tags: ['Protein', 'Meal Prep', 'Abendessen'],
    emoji: '🍣',
  },
];

function AtelierSwipeTrainer({ onComplete }) {
  const [completedGestures, setCompletedGestures] = useState([]);
  const [activeGestureKey, setActiveGestureKey] = useState(GESTURES[0].key);
  const [lastGestureKey, setLastGestureKey] = useState(null);

  const completedGestureSet = useMemo(() => new Set(completedGestures), [completedGestures]);
  const activeGesture = GESTURES.find((gesture) => gesture.key === activeGestureKey) || GESTURES[0];
  const resultGesture = GESTURES.find((gesture) => gesture.key === lastGestureKey) || activeGesture;
  const allGesturesCompleted = completedGestures.length === GESTURES.length;
  const activeCard = DEMO_CARDS[Math.min(completedGestures.length, DEMO_CARDS.length - 1)];

  const handleGesture = (gestureKey) => {
    if (completedGestureSet.has(gestureKey)) return;

    const nextCompletedGestures = [...completedGestures, gestureKey];
    setCompletedGestures(nextCompletedGestures);
    setLastGestureKey(gestureKey);

    const nextGesture = GESTURES.find((gesture) => !nextCompletedGestures.includes(gesture.key));
    if (nextGesture) {
      setActiveGestureKey(nextGesture.key);
    }
  };

  return (
    <main className="atelier-swipe-trainer" data-testid="atelier-swipe-trainer-view">
      <div className="atelier-swipe-trainer__content">
        <p className="atelier-swipe-trainer__tag">Swipe-Trainer</p>
        <h1 className="atelier-swipe-trainer__title">So funktioniert dein Atelier</h1>
        <p className="atelier-swipe-trainer__intro">
          {allGesturesCompleted ? (
            'Du kennst jetzt alle drei Gesten und kannst direkt mit dem Swipen loslegen.'
          ) : (
            <>
              Probiere als Nächstes <strong>{activeGesture.instruction}</strong> aus und schau, was mit
              dem Rezept passiert.
            </>
          )}
        </p>

        <div className="atelier-swipe-trainer__stack" aria-hidden="true">
          <div className="atelier-swipe-trainer__ghost atelier-swipe-trainer__ghost--first" />
          <div className="atelier-swipe-trainer__ghost atelier-swipe-trainer__ghost--second" />
          {GESTURES.map((gesture) => (
            <div
              key={gesture.key}
              className={[
                'atelier-swipe-trainer__overlay-label',
                `atelier-swipe-trainer__overlay-label--${gesture.accent}`,
                activeGesture.key === gesture.key ? 'atelier-swipe-trainer__overlay-label--active' : '',
              ].filter(Boolean).join(' ')}
            >
              {gesture.overlay}
            </div>
          ))}
          <article
            key={`${activeCard.title}-${completedGestures.length}`}
            className={[
              'atelier-swipe-trainer__card',
              lastGestureKey ? `atelier-swipe-trainer__card--${lastGestureKey}` : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="atelier-swipe-trainer__card-visual">{activeCard.emoji}</div>
            <div className="atelier-swipe-trainer__card-body">
              <h2 className="atelier-swipe-trainer__card-title">{activeCard.title}</h2>
              <p className="atelier-swipe-trainer__card-author">{activeCard.author}</p>
              <div className="atelier-swipe-trainer__card-tags">
                {activeCard.tags.map((tag) => (
                  <span key={tag} className="atelier-swipe-trainer__card-tag">{tag}</span>
                ))}
              </div>
            </div>
          </article>
        </div>

        <div className="atelier-swipe-trainer__progress" aria-label="Fortschritt Swipe-Trainer">
          {GESTURES.map((gesture) => (
            <span
              key={gesture.key}
              className={[
                'atelier-swipe-trainer__pill',
                completedGestureSet.has(gesture.key) ? 'atelier-swipe-trainer__pill--done' : '',
                !completedGestureSet.has(gesture.key) && activeGesture.key !== gesture.key
                  ? 'atelier-swipe-trainer__pill--dim'
                  : '',
              ].filter(Boolean).join(' ')}
            >
              {gesture.instruction}
            </span>
          ))}
        </div>

        <section className="atelier-swipe-trainer__result" aria-live="polite">
          <p className="atelier-swipe-trainer__result-tag">{resultGesture.instruction}</p>
          <h2 className="atelier-swipe-trainer__result-title">{resultGesture.title}</h2>
          <p className="atelier-swipe-trainer__result-body">{resultGesture.description}</p>
        </section>

        {allGesturesCompleted ? (
          <button
            className="atelier-swipe-trainer__primary-button"
            onClick={onComplete}
            type="button"
          >
            Weiter ins Atelier
          </button>
        ) : (
          <div className="atelier-swipe-trainer__actions" role="group" aria-label="Swipe-Gesten ausprobieren">
            {GESTURES.map((gesture) => (
              <button
                key={gesture.key}
                className={[
                  'atelier-swipe-trainer__action-button',
                  activeGesture.key === gesture.key ? 'atelier-swipe-trainer__action-button--active' : '',
                ].filter(Boolean).join(' ')}
                disabled={completedGestureSet.has(gesture.key)}
                onClick={() => handleGesture(gesture.key)}
                type="button"
              >
                {gesture.buttonLabel}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default AtelierSwipeTrainer;
