import React, { useCallback, useRef, useState } from 'react';
import './AtelierSwipeTrainerOverlay.css';
import cocktailPlaceholder from '../assets/atelier-swipe-trainer-cocktail.png';

// Preview thresholds (px) at which the direction hint label starts to appear while dragging.
const PREVIEW_THRESHOLD_H = 30;
const PREVIEW_THRESHOLD_V = 40;
// Commit thresholds (px) at which releasing the drag actually triggers the swipe.
const COMMIT_THRESHOLD = 70;
const FLY_DISTANCE_H = 500;
const FLY_DISTANCE_V = 700;

const DEFAULT_LABELS = {
  r: '→ Für später parken',
  l: '← Archivieren',
  u: '↑ Jetzt kochen!',
};

const FINAL_LABELS = {
  r: 'Nochmal ansehen',
  l: 'Direkt ins Kochatelier',
  u: 'Weiter',
};

const STEPS = [
  { dir: 'r' },
  { dir: 'l' },
  { dir: 'u' },
  { dir: null, final: true },
];

const SLOT_CONTENT = [
  {
    type: 'recipe',
    name: 'Mango Cocktail',
    author: 'Benjamin',
    tags: ['Vegetarisch', '5 Min.'],
    imgAlt: 'Mango Cocktail',
    imgStyle: { width: '72%', height: '88%' },
  },
  {
    type: 'note',
    tag: 'Remind me later',
    title: 'Richtiges Rezept, falscher Moment',
    body: (
      <>
        Es gibt Rezepte, die neugierig machen, aber gerade einfach nicht passen. Nach{' '}
        <strong>30 Tagen</strong> tauchen sie wieder in deinem Stapel auf – manchmal braucht
        Inspiration einfach etwas Zeit.
      </>
    ),
    imgAlt: 'Mango Cocktail',
    imgStyle: { width: '72%', height: '88%' },
  },
  {
    type: 'note',
    tag: "I don't feel it",
    title: 'Rezept warm-, Überblick behalten',
    body: (
      <>
        Nicht jedes Rezept trifft den Nerv, das ist ganz normal. Aber deswegen wird dein Rezept
        nicht direkt gelöscht. Du findest es jederzeit im Archiv und behältst beim Swipen trotzdem
        immer den Fokus.
      </>
    ),
    imgAlt: 'Mango Cocktail',
    imgStyle: { width: '72%', height: '88%' },
  },
  {
    type: 'final',
    tag: "It's a Match",
    title: 'Ein Rezept, ein Koch',
    body: (
      <>
        Gesucht, gefunden, jetzt habt ihr <strong>7 Tage</strong> Zeit für euer
        Candlelight-Dinner. Danach verschwindet dein Match wieder im Stapel – so wird's nicht
        langweilig und es ist wieder Platz für neue Rezepte.
      </>
    ),
    imgStyle: { width: '60%', height: '80%', opacity: 0.35 },
  },
];

const FINAL_LEGEND_ROWS = [
  { icon: '↑', bg: '#EDF2EE', title: 'Weiter', sub: 'Swipe nach oben' },
  { icon: '→', bg: '#FDF3E3', title: 'Nochmal ansehen', sub: 'Swipe nach rechts' },
  { icon: '←', bg: '#F0F0EE', title: 'Direkt ins Kochatelier', sub: 'Swipe nach links' },
];

function CardContent({ slot }) {
  return (
    <>
      <div className="atelier-swipe-trainer-photo">
        <img src={cocktailPlaceholder} alt={slot.imgAlt || ''} style={slot.imgStyle} draggable="false" />
      </div>
      {slot.type === 'recipe' && (
        <div className="atelier-swipe-trainer-body--recipe">
          <p className="atelier-swipe-trainer-name">{slot.name}</p>
          <p className="atelier-swipe-trainer-author">{slot.author}</p>
          <div className="atelier-swipe-trainer-tags">
            {slot.tags.map((tag) => (
              <span key={tag} className="atelier-swipe-trainer-tag">{tag}</span>
            ))}
          </div>
        </div>
      )}
      {slot.type === 'note' && (
        <div className="atelier-swipe-trainer-body--note">
          <p className="atelier-swipe-trainer-note-tag">{slot.tag}</p>
          <p className="atelier-swipe-trainer-note-title">{slot.title}</p>
          <p className="atelier-swipe-trainer-note-body">{slot.body}</p>
        </div>
      )}
      {slot.type === 'final' && (
        <div className="atelier-swipe-trainer-body--final">
          <p className="atelier-swipe-trainer-final-tag">{slot.tag}</p>
          <p className="atelier-swipe-trainer-final-title">{slot.title}</p>
          <p className="atelier-swipe-trainer-final-body">{slot.body}</p>
          <div className="atelier-swipe-trainer-final-divider" />
          <div className="atelier-swipe-trainer-final-legend">
            {FINAL_LEGEND_ROWS.map((row) => (
              <div key={row.title} className="atelier-swipe-trainer-final-legend-row">
                <div className="atelier-swipe-trainer-final-legend-icon" style={{ background: row.bg }}>
                  {row.icon}
                </div>
                <div>
                  <div className="atelier-swipe-trainer-final-legend-title">{row.title}</div>
                  <div className="atelier-swipe-trainer-final-legend-sub">{row.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function AtelierSwipeTrainerOverlay({ onComplete }) {
  const [trainerStep, setTrainerStep] = useState(0);
  const [cardPhase, setCardPhase] = useState('idle'); // idle | dragging | snap | flying
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [rotationDeg, setRotationDeg] = useState(0);
  const [activeLabel, setActiveLabel] = useState(null); // 'r' | 'l' | 'u' | null

  const gestureRef = useRef(null);
  const pendingOutcomeRef = useRef(null); // 'advance' | 'restart' | 'complete' | null

  const step = STEPS[trainerStep];
  const slot = SLOT_CONTENT[trainerStep];
  const ghostSlot = SLOT_CONTENT[(trainerStep + 1) % SLOT_CONTENT.length];

  const handlePointerDown = useCallback((e) => {
    if (cardPhase !== 'idle') return;
    gestureRef.current = { startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    setCardPhase('dragging');
  }, [cardPhase]);

  const handlePointerMove = useCallback((e) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    setDragOffset({ x: dx, y: dy });
    setRotationDeg(dx * 0.07);

    const isUpPreview = dy < -PREVIEW_THRESHOLD_V && Math.abs(dy) > Math.abs(dx);
    if (step.final) {
      const label =
        !isUpPreview && dx > PREVIEW_THRESHOLD_H ? 'r' :
        !isUpPreview && dx < -PREVIEW_THRESHOLD_H ? 'l' :
        isUpPreview ? 'u' : null;
      setActiveLabel(label);
    } else {
      const show =
        (step.dir === 'r' && dx > PREVIEW_THRESHOLD_H && !isUpPreview) ||
        (step.dir === 'l' && dx < -PREVIEW_THRESHOLD_H && !isUpPreview) ||
        (step.dir === 'u' && isUpPreview);
      setActiveLabel(show ? step.dir : null);
    }
  }, [step]);

  const handlePointerUp = useCallback((e) => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    setActiveLabel(null);

    const isUp = dy < -COMMIT_THRESHOLD && Math.abs(dy) > Math.abs(dx);
    const isR = dx > COMMIT_THRESHOLD && !isUp;
    const isL = dx < -COMMIT_THRESHOLD && !isUp;
    const det = isR ? 'r' : isL ? 'l' : isUp ? 'u' : null;

    if (step.final) {
      if (!det) {
        setRotationDeg(0);
        setDragOffset({ x: 0, y: 0 });
        setCardPhase('snap');
        return;
      }
      pendingOutcomeRef.current = det === 'r' ? 'restart' : 'complete';
      setRotationDeg(0);
      setDragOffset({
        x: det === 'r' ? FLY_DISTANCE_H : det === 'l' ? -FLY_DISTANCE_H : 0,
        y: det === 'u' ? -FLY_DISTANCE_V : 0,
      });
      setCardPhase('flying');
    } else if (det === step.dir) {
      pendingOutcomeRef.current = 'advance';
      setRotationDeg(dx * 0.04);
      setDragOffset({
        x: step.dir === 'r' ? FLY_DISTANCE_H : step.dir === 'l' ? -FLY_DISTANCE_H : 0,
        y: step.dir === 'u' ? -FLY_DISTANCE_V : 0,
      });
      setCardPhase('flying');
    } else {
      setRotationDeg(0);
      setDragOffset({ x: 0, y: 0 });
      setCardPhase('snap');
    }
  }, [step]);

  const handlePointerCancel = useCallback(() => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    setActiveLabel(null);
    setRotationDeg(0);
    setDragOffset({ x: 0, y: 0 });
    setCardPhase('snap');
  }, []);

  const handleTransitionEnd = useCallback((e) => {
    if (e.propertyName !== 'transform') return;
    if (cardPhase === 'flying') {
      const outcome = pendingOutcomeRef.current;
      pendingOutcomeRef.current = null;
      if (outcome === 'complete') {
        onComplete();
        return;
      }
      setDragOffset({ x: 0, y: 0 });
      setRotationDeg(0);
      setCardPhase('idle');
      if (outcome === 'advance') {
        setTrainerStep((s) => s + 1);
      } else if (outcome === 'restart') {
        setTrainerStep(0);
      }
    } else if (cardPhase === 'snap') {
      setCardPhase('idle');
    }
  }, [cardPhase, onComplete]);

  const cardTransition =
    cardPhase === 'flying' ? 'transform 0.35s ease, opacity 0.35s ease'
    : cardPhase === 'snap' ? 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)'
    : 'none';

  const cardStyle = {
    transform: `translateX(calc(-50% + ${dragOffset.x}px)) translateY(${dragOffset.y}px) rotate(${rotationDeg}deg)`,
    transition: cardTransition,
    opacity: cardPhase === 'flying' ? 0 : 1,
  };

  return (
    <div className="atelier-swipe-trainer-overlay" role="dialog" aria-modal="true" aria-label="Swipe-Training">
      <div className="atelier-swipe-trainer-stack">
        <div
          className={`atelier-swipe-trainer-label atelier-swipe-trainer-label--r${activeLabel === 'r' ? ' atelier-swipe-trainer-label--visible' : ''}`}
        >
          {step.final ? FINAL_LABELS.r : DEFAULT_LABELS.r}
        </div>
        <div
          className={`atelier-swipe-trainer-label atelier-swipe-trainer-label--l${activeLabel === 'l' ? ' atelier-swipe-trainer-label--visible' : ''}`}
        >
          {step.final ? FINAL_LABELS.l : DEFAULT_LABELS.l}
        </div>
        <div
          className={`atelier-swipe-trainer-label atelier-swipe-trainer-label--u${activeLabel === 'u' ? ' atelier-swipe-trainer-label--visible' : ''}`}
        >
          {step.final ? FINAL_LABELS.u : DEFAULT_LABELS.u}
        </div>

        <div className="atelier-swipe-trainer-ghost" data-testid="atelier-swipe-trainer-ghost">
          <CardContent slot={ghostSlot} />
        </div>

        <div
          className="atelier-swipe-trainer-card"
          data-testid="atelier-swipe-trainer-card"
          style={cardStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onTransitionEnd={handleTransitionEnd}
        >
          <CardContent slot={slot} />
        </div>
      </div>

      <div className="atelier-swipe-trainer-dots-wrap">
        <div className="atelier-swipe-trainer-dots">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`atelier-swipe-trainer-dot${i === 2 ? ' atelier-swipe-trainer-dot--active' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default AtelierSwipeTrainerOverlay;
