import React, { useState, useRef, useCallback } from 'react';
import './AtelierSwipeTrainer.css';

// Directly derived from TRAINER_STEPS in docs/broubook-onboarding-s3.html
const TRAINER_STEPS = [
  {
    dir: 'r',
    tag: 'Remind me later',
    title: 'Richtiges Rezept, falscher Moment',
    dragLabel: '→ Für später parken',
  },
  {
    dir: 'l',
    tag: "I don't feel it",
    title: 'Rezept warm-, Überblick behalten',
    dragLabel: '← Archivieren',
  },
  {
    dir: 'u',
    tag: "It's a Match",
    title: 'Ein Rezept, ein Koch',
    dragLabel: '↑ Jetzt kochen!',
  },
];

// Result body content (word-for-word from TRAINER_STEPS.body in S3 template)
function ResultBody({ stepIndex }) {
  if (stepIndex === 0) {
    return (
      <p className="r-body">
        Es gibt Rezepte, die neugierig machen, aber gerade einfach nicht passen. Nach{' '}
        <strong style={{ color: 'var(--ink)' }}>30 Tagen</strong> tauchen sie wieder in
        deinem Stapel auf – manchmal braucht Inspiration einfach etwas Zeit.
      </p>
    );
  }
  if (stepIndex === 1) {
    return (
      <p className="r-body">
        Nicht jedes Rezept trifft den Nerv, das ist ganz normal. Aber deswegen wird dein Rezept
        nicht direkt gelöscht. Du findest es jederzeit im Archiv und behältst beim Swipen
        trotzdem immer den Fokus.
      </p>
    );
  }
  if (stepIndex === 2) {
    return (
      <p className="r-body">
        Gesucht, gefunden, jetzt habt ihr{' '}
        <strong style={{ color: 'var(--ink)' }}>7 Tage</strong> Zeit für euer
        Candlelight-Dinner. Danach verschwindet dein Match wieder im Stapel – so wird's nicht
        langweilig und es ist wieder Platz für neue Rezepte.
      </p>
    );
  }
  return null;
}

// Renders the content of the active swipe card based on current step (0–3)
function CardContent({ step }) {
  if (step === 0) {
    // card1: Mango Cocktail recipe (from S3 card1 HTML)
    return (
      <>
        <div className="ast-card-photo">
          <span aria-hidden="true" style={{ fontSize: '72px' }}>🥭</span>
        </div>
        <div className="card-body">
          <div className="card-name">Mango Cocktail</div>
          <div className="card-author">Benjamin</div>
          <div className="card-tags">
            <span className="card-tag">Vegetarisch</span>
            <span className="card-tag">5 Min.</span>
          </div>
        </div>
      </>
    );
  }
  if (step === 1) {
    // card2: result of right-swipe (from S3 card2 HTML)
    return (
      <div className="card-body" style={{ paddingTop: '24px' }}>
        <div className="c-tag">Remind me later</div>
        <div className="card-name" style={{ marginTop: '6px' }}>Richtiges Rezept, falscher Moment</div>
      </div>
    );
  }
  if (step === 2) {
    // card3: result of left-swipe (from S3 card3 HTML)
    return (
      <div className="card-body" style={{ paddingTop: '24px' }}>
        <div className="c-tag">I don't feel it</div>
        <div className="card-name" style={{ marginTop: '6px' }}>Rezept warm-, Überblick behalten</div>
      </div>
    );
  }
  // card4: final card – "It's a Match" with three swipe options (from S3 card4 HTML)
  return (
    <div className="card-body" style={{ paddingTop: '16px' }}>
      <div className="c-tag">It's a Match</div>
      <div className="card-name" style={{ marginTop: '6px', marginBottom: '10px' }}>Ein Rezept, ein Koch</div>
      <div style={{ height: '1px', background: '#f0f0ee', marginBottom: '12px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="ast-option-icon" style={{ background: '#EDF2EE' }}>↑</div>
          <div>
            <div className="ast-option-label">Weiter</div>
            <div className="ast-option-hint">Swipe nach oben</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="ast-option-icon" style={{ background: '#FDF3E3' }}>→</div>
          <div>
            <div className="ast-option-label">Nochmal ansehen</div>
            <div className="ast-option-hint">Swipe nach rechts</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="ast-option-icon" style={{ background: '#F0F0EE' }}>←</div>
          <div>
            <div className="ast-option-label">Direkt ins Kochatelier</div>
            <div className="ast-option-hint">Swipe nach links</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AtelierSwipeTrainer({ onComplete }) {
  // step: 0–2 = trainer steps, 3 = final card
  const [step, setStep] = useState(0);
  const [donePills, setDonePills] = useState(new Set()); // 'r', 'l', 'u'
  const [isDragging, setIsDragging] = useState(false);
  const [dragDx, setDragDx] = useState(0);
  const [dragDy, setDragDy] = useState(0);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [flyDir, setFlyDir] = useState(null);
  const [resultStepIndex, setResultStepIndex] = useState(null);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const cdxRef = useRef(0);
  const cdyRef = useRef(0);

  const isFinalStep = step === 3;

  // ── Drag label visibility (mirrors S3 trainerSwipe move() logic) ──
  const getLblOpacity = (lblDir) => {
    if (!isDragging) return 0;
    const isUp = dragDy < -40 && Math.abs(dragDy) > Math.abs(dragDx);
    if (isFinalStep) {
      if (lblDir === 'r') return (!isUp && dragDx > 30) ? 1 : 0;
      if (lblDir === 'l') return (!isUp && dragDx < -30) ? 1 : 0;
      if (lblDir === 'u') return isUp ? 1 : 0;
    } else {
      const sd = TRAINER_STEPS[step];
      if (!sd) return 0;
      const show = (sd.dir === 'r' && dragDx > 30 && !isUp)
        || (sd.dir === 'l' && dragDx < -30 && !isUp)
        || (sd.dir === 'u' && isUp);
      return (sd.dir === lblDir && show) ? 1 : 0;
    }
    return 0;
  };

  const getDragLabelText = (lblDir) => {
    if (isFinalStep) {
      if (lblDir === 'r') return 'Nochmal ansehen';
      if (lblDir === 'l') return 'Direkt ins Kochatelier';
      if (lblDir === 'u') return 'Weiter';
    }
    if (lblDir === 'r') return '→ Für später parken';
    if (lblDir === 'l') return '← Archivieren';
    return '↑ Jetzt kochen!';
  };

  // ── Card transform / transition / opacity ──
  const getCardStyle = () => {
    if (isAnimatingOut && flyDir) {
      const tx = flyDir === 'r' ? 500 : flyDir === 'l' ? -500 : 0;
      const ty = flyDir === 'u' ? -700 : 0;
      return {
        transform: `translateX(calc(-50% + ${tx}px)) translateY(${ty}px)`,
        transition: 'transform 0.35s ease, opacity 0.35s ease',
        opacity: 0,
      };
    }
    if (isDragging) {
      return {
        transform: `translateX(calc(-50% + ${dragDx}px)) translateY(${dragDy}px) rotate(${dragDx * 0.07}deg)`,
        transition: 'none',
        opacity: 1,
      };
    }
    return {
      transform: 'translateX(-50%)',
      transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      opacity: 1,
    };
  };

  // ── Complete a swipe gesture (shared by drag and button paths) ──
  // animated=true: play fly-away animation first (drag path)
  // animated=false: immediate state update (button/accessible path)
  const completeSwipe = useCallback((dir, animated) => {
    if (isAnimatingOut) return;

    const advance = () => {
      if (step === 3) {
        if (dir === 'r') {
          // "Nochmal ansehen" → restart trainer
          setStep(0);
          setDonePills(new Set());
          setResultStepIndex(null);
        } else {
          // 'u' = "Weiter" or 'l' = "Direkt ins Kochatelier" → complete
          onComplete?.();
        }
      } else {
        const completedStepIndex = step;
        const sd = TRAINER_STEPS[completedStepIndex];
        setDonePills((prev) => new Set([...prev, sd.dir]));
        setResultStepIndex(completedStepIndex);
        setStep((prev) => prev + 1);
      }
    };

    if (animated) {
      setIsAnimatingOut(true);
      setFlyDir(dir);
      setTimeout(() => {
        setIsAnimatingOut(false);
        setFlyDir(null);
        advance();
      }, 370);
    } else {
      advance();
    }
  }, [step, isAnimatingOut, onComplete]);

  // ── Drag/swipe handlers (mirrors S3 trainerSwipe end() logic) ──
  const handleDragStart = useCallback((cx, cy) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: cx, y: cy };
    cdxRef.current = 0;
    cdyRef.current = 0;
    setResultStepIndex(null); // hide result overlay on interaction start
    setIsDragging(true);
  }, []);

  const handleDragMove = useCallback((cx, cy) => {
    if (!isDraggingRef.current) return;
    const dx = cx - dragStartRef.current.x;
    const dy = cy - dragStartRef.current.y;
    cdxRef.current = dx;
    cdyRef.current = dy;
    setDragDx(dx);
    setDragDy(dy);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const dx = cdxRef.current;
    const dy = cdyRef.current;
    setDragDx(0);
    setDragDy(0);

    // Direction detection – mirrors S3 end() logic (threshold 70px)
    const isUp = dy < -70 && Math.abs(dy) > Math.abs(dx);
    const isR = dx > 70 && !isUp;
    const isL = dx < -70 && !isUp;
    const det = isR ? 'r' : isL ? 'l' : isUp ? 'u' : null;
    if (!det) return; // snap back (transition handles it)

    if (step === 3) {
      completeSwipe(det, true);
    } else {
      const sd = TRAINER_STEPS[step];
      if (det === sd.dir) {
        completeSwipe(det, true);
      }
      // Wrong direction → snap back (CSS transition)
    }
  }, [step, completeSwipe]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    if (isAnimatingOut) return;
    handleDragStart(e.clientX, e.clientY);
    const mm = (ev) => handleDragMove(ev.clientX, ev.clientY);
    const mu = () => {
      handleDragEnd();
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
    };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  }, [isAnimatingOut, handleDragStart, handleDragMove, handleDragEnd]);

  const handleTouchStart = useCallback((e) => {
    if (isAnimatingOut) return;
    handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
  }, [isAnimatingOut, handleDragStart]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // ── Progress pill class helper ──
  const getPillClass = (dir, index) => {
    if (donePills.has(dir)) return 'prog-pill done';
    if (index > step) return 'prog-pill dim';
    return 'prog-pill';
  };

  // ── Instruction text (t-instr) ──
  const getInstruction = () => {
    if (step === 0) return <><strong>Rechts swipen</strong> – das Rezept für später parken</>;
    if (step === 1) return <><strong>Links swipen</strong> – Rezept ins Archiv verschieben</>;
    if (step === 2) return <><strong>Nach oben swipen</strong> – Rezept als Kochkandidat setzen</>;
    return null;
  };

  const cardStyle = getCardStyle();

  return (
    <main className="trainer-slide" data-testid="atelier-swipe-trainer-view">
      {/* Header – t-tag / t-title / t-instr from S3 CSS classes */}
      <p className="t-tag">SWIPE TRAINER</p>
      <h1 className="t-title">ALLE GESTEN</h1>
      {step < 3 && (
        <p className="t-instr">{getInstruction()}</p>
      )}

      {/* Card stack (mirrors S3 card-stack structure) */}
      <div className="card-stack">
        {/* Drag labels (lbl-r / lbl-l / lbl-u) */}
        <div className="drag-lbl lbl-r" aria-hidden="true" style={{ opacity: getLblOpacity('r') }}>
          {getDragLabelText('r')}
        </div>
        <div className="drag-lbl lbl-l" aria-hidden="true" style={{ opacity: getLblOpacity('l') }}>
          {getDragLabelText('l')}
        </div>
        <div className="drag-lbl lbl-u" aria-hidden="true" style={{ opacity: getLblOpacity('u') }}>
          {getDragLabelText('u')}
        </div>

        {/* Ghost cards (card-ghost / ghost-1 / ghost-2 from S3) */}
        <div className="card-ghost ghost-2" aria-hidden="true" />
        <div className="card-ghost ghost-1" aria-hidden="true" />

        {/* Active swipe card */}
        <div
          className="swipe-card"
          style={cardStyle}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <CardContent step={step} />
        </div>

        {/* Result overlay (result-ov from S3) – shown after successful swipe */}
        <div
          className={`result-ov${resultStepIndex !== null ? ' show' : ''}`}
          aria-live="polite"
          data-testid="result-overlay"
        >
          {resultStepIndex !== null && (
            <>
              <p className="c-tag">{TRAINER_STEPS[resultStepIndex].tag}</p>
              <h2 className="r-title">{TRAINER_STEPS[resultStepIndex].title}</h2>
              <ResultBody stepIndex={resultStepIndex} />
            </>
          )}
        </div>
      </div>

      {/* Progress pills (prog-row / prog-pill from S3) */}
      <div className="prog-row" aria-label="Fortschritt Swipe-Trainer">
        <div data-testid="pill-r" className={getPillClass('r', 0)}>Rechts swipen</div>
        <div data-testid="pill-l" className={getPillClass('l', 1)}>Links swipen</div>
        <div data-testid="pill-u" className={getPillClass('u', 2)}>Nach oben swipen</div>
      </div>

      {/* Accessible gesture buttons – testable alternative to swipe gestures */}
      {step < 3 && (
        <div className="ast-gesture-btns" role="group" aria-label="Swipe-Gesten ausprobieren">
          <button
            type="button"
            className={`ast-gesture-btn${step === 0 ? ' ast-gesture-btn--active' : ''}`}
            disabled={step !== 0 || isAnimatingOut}
            onClick={() => completeSwipe('r', false)}
          >
            → Für später parken
          </button>
          <button
            type="button"
            className={`ast-gesture-btn${step === 1 ? ' ast-gesture-btn--active' : ''}`}
            disabled={step !== 1 || isAnimatingOut}
            onClick={() => completeSwipe('l', false)}
          >
            ← Archivieren
          </button>
          <button
            type="button"
            className={`ast-gesture-btn${step === 2 ? ' ast-gesture-btn--active' : ''}`}
            disabled={step !== 2 || isAnimatingOut}
            onClick={() => completeSwipe('u', false)}
          >
            ↑ Jetzt kochen!
          </button>
        </div>
      )}

      {/* Final step: three swipe-choice buttons */}
      {step === 3 && (
        <div className="ast-gesture-btns" role="group" aria-label="Abschluss-Optionen">
          <button
            type="button"
            className="ast-gesture-btn"
            onClick={() => completeSwipe('r', false)}
          >
            Nochmal ansehen
          </button>
          <button
            type="button"
            className="ast-gesture-btn"
            onClick={() => completeSwipe('l', false)}
          >
            Direkt ins Kochatelier
          </button>
          {/* Primary complete action – accessible name used by tests */}
          <button
            type="button"
            className="ast-gesture-btn ast-gesture-btn--primary"
            aria-label="complete-atelier-swipe-trainer"
            onClick={() => onComplete?.()}
          >
            Weiter
          </button>
        </div>
      )}
    </main>
  );
}

export default AtelierSwipeTrainer;
