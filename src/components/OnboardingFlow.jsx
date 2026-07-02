import React, { useState, useEffect, useRef, useCallback } from 'react';
import './OnboardingFlow.css';

// ─── Trainer step definitions (1:1 from HTML) ────────────────────────────────
const TRAINER_STEPS = [
  {
    dir: 'r', lbl: 'lbl-r',
    pill: 'pp-r',
    instr: '<strong>Rechts swipen</strong> – das Rezept für später parken',
    tag: 'Remind me later',
    title: 'Richtiges Rezept, falscher Moment',
    body: 'Es gibt Rezepte, die neugierig machen, aber gerade einfach nicht passen. Nach <strong style="color:#1A1A18;">30 Tagen</strong> tauchen sie wieder in deinem Stapel auf – manchmal braucht Inspiration einfach etwas Zeit.'
  },
  {
    dir: 'l', lbl: 'lbl-l',
    pill: 'pp-l',
    instr: '<strong>Links swipen</strong> – Rezept ins Archiv verschieben',
    tag: "I don't feel it",
    title: 'Rezept warm-, Überblick behalten',
    body: 'Nicht jedes Rezept trifft den Nerv, das ist ganz normal. Aber deswegen wird dein Rezept nicht direkt gelöscht. Du findest es jederzeit im Archiv und behältst beim Swipen trotzdem immer den Fokus.'
  },
  {
    dir: 'u', lbl: 'lbl-u',
    pill: 'pp-u',
    instr: '<strong>Nach oben swipen</strong> – Rezept als Kochkandidat setzen',
    tag: "It's a Match",
    title: 'Ein Rezept, ein Koch',
    body: 'Gesucht, gefunden, jetzt habt ihr <strong style="color:#1A1A18;">7 Tage</strong> Zeit für euer Candlelight-Dinner. Danach verschwindet dein Match wieder im Stapel – so wird\'s nicht langweilig und es ist wieder Platz für neue Rezepte.'
  },
  {
    dir: null, lbl: 'lbl-u',
    pill: null,
    instr: '<strong>↑ Weiter</strong> &nbsp;·&nbsp; <strong>→ Nochmal</strong> &nbsp;·&nbsp; <strong>← Beenden</strong>',
    tag: null, title: null, body: null,
    final: true
  }
];

function OnboardingFlow({ onComplete }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeResults, setActiveResults] = useState({});
  const [trainerStep, setTrainerStep] = useState(0);
  const [trainerInstr, setTrainerInstr] = useState(TRAINER_STEPS[0].instr);
  const [trainerResultVisible, setTrainerResultVisible] = useState(false);
  const [trainerResultContent, setTrainerResultContent] = useState({ tag: '', title: '', body: '' });
  const [showNextBtn, setShowNextBtn] = useState(false);
  const [pillsDone, setPillsDone] = useState([false, false, false]);
  const [pillsDim, setPillsDim] = useState([false, true, true]);

  // Refs for swipe card elements
  const cardRef = useRef(null);
  const ghost1Ref = useRef(null);
  const ghost2Ref = useRef(null);
  const wrapRef = useRef(null);
  const trainerStepRef = useRef(0);

  // Keep trainerStepRef in sync
  useEffect(() => {
    trainerStepRef.current = trainerStep;
  }, [trainerStep]);

  // ─── goTo ──────────────────────────────────────────────────────────────────
  const goTo = useCallback((n) => {
    if (n < 0 || n >= 7) return;
    if (n === 0 && currentSlide !== 0) {
      // Closing / going back to start = complete
      onComplete && onComplete();
      return;
    }
    if (n === 3) {
      // Reset trainer
      setTrainerStep(0);
      trainerStepRef.current = 0;
      setTrainerInstr(TRAINER_STEPS[0].instr);
      setTrainerResultVisible(false);
      setShowNextBtn(false);
      setPillsDone([false, false, false]);
      setPillsDim([false, true, true]);
      if (cardRef.current) {
        cardRef.current.style.transition = 'none';
        cardRef.current.style.transform = 'translateX(-50%)';
        cardRef.current.style.opacity = '1';
      }
      resetGhosts();
    }
    setCurrentSlide(n);
  }, [currentSlide, onComplete]);

  const resetGhosts = () => {
    if (ghost1Ref.current) {
      ghost1Ref.current.style.transition = 'none';
      ghost1Ref.current.style.transform = 'translateX(-50%) scale(0.961)';
      ghost1Ref.current.style.opacity = '0.6';
    }
    if (ghost2Ref.current) {
      ghost2Ref.current.style.transition = 'none';
      ghost2Ref.current.style.transform = 'translateX(-50%) scale(0.923)';
      ghost2Ref.current.style.opacity = '0.35';
    }
  };

  const resetCardPos = useCallback(() => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = 'none';
    cardRef.current.style.transform = 'translateX(-50%)';
    cardRef.current.style.opacity = '1';
    resetGhosts();
  }, []);

  // ─── Slide swipe on the wrap (not on swipe card) ──────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let sx = 0, sd = false;

    const onTouchStart = (e) => {
      if (e.target.closest('.ob-swipe-card')) return;
      sx = e.touches[0].clientX; sd = true;
    };
    const onTouchEnd = (e) => {
      if (!sd) return; sd = false;
      const dx = sx - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 48) {
        if (dx > 0) goTo(currentSlide + 1);
        else goTo(currentSlide - 1);
      }
    };
    const onMouseDown = (e) => {
      if (e.target.closest('.ob-swipe-card')) return;
      sx = e.clientX; sd = true;
    };
    const onMouseUp = (e) => {
      if (!sd) return; sd = false;
      const dx = sx - e.clientX;
      if (Math.abs(dx) > 48) {
        if (dx > 0) goTo(currentSlide + 1);
        else goTo(currentSlide - 1);
      }
    };

    wrap.addEventListener('touchstart', onTouchStart, { passive: true });
    wrap.addEventListener('touchend', onTouchEnd, { passive: true });
    wrap.addEventListener('mousedown', onMouseDown);
    wrap.addEventListener('mouseup', onMouseUp);
    return () => {
      wrap.removeEventListener('touchstart', onTouchStart);
      wrap.removeEventListener('touchend', onTouchEnd);
      wrap.removeEventListener('mousedown', onMouseDown);
      wrap.removeEventListener('mouseup', onMouseUp);
    };
  }, [currentSlide, goTo]);

  // ─── Trainer swipe logic ──────────────────────────────────────────────────
  useEffect(() => {
    if (currentSlide !== 3) return;
    const card = cardRef.current;
    if (!card) return;

    let drag = false, csx = 0, csy = 0, cdx = 0, cdy = 0;

    const getLblEls = () => ({
      lblR: card.parentNode?.querySelector('.ob-lbl-r'),
      lblL: card.parentNode?.querySelector('.ob-lbl-l'),
      lblU: card.parentNode?.querySelector('.ob-lbl-u'),
    });

    const getStep = () => TRAINER_STEPS[trainerStepRef.current];

    function start(cx, cy) {
      drag = true; csx = cx; csy = cy;
      card.style.transition = 'none';
      setTrainerResultVisible(false);
    }

    function move(cx, cy) {
      if (!drag) return;
      cdx = cx - csx; cdy = cy - csy;
      card.style.transform = `translateX(calc(-50% + ${cdx}px)) translateY(${cdy}px) rotate(${cdx * 0.07}deg)`;
      const isUp = cdy < -40 && Math.abs(cdy) > Math.abs(cdx);
      const step = getStep();
      const { lblR, lblL, lblU } = getLblEls();

      if (step.final) {
        if (lblR) { lblR.textContent = 'Nochmal, bitte'; lblR.style.opacity = (!isUp && cdx > 30) ? '1' : '0'; }
        if (lblL) { lblL.textContent = 'Erklärung überspringen'; lblL.style.opacity = (!isUp && cdx < -30) ? '1' : '0'; }
        if (lblU) { lblU.textContent = 'Weiter'; lblU.style.opacity = isUp ? '1' : '0'; }
      } else {
        const showR = step.dir === 'r' && cdx > 30 && !isUp;
        const showL = step.dir === 'l' && cdx < -30 && !isUp;
        const showU = step.dir === 'u' && isUp;
        if (lblR) lblR.style.opacity = showR ? '1' : '0';
        if (lblL) lblL.style.opacity = showL ? '1' : '0';
        if (lblU) lblU.style.opacity = showU ? '1' : '0';
      }
    }

    function end() {
      if (!drag) return; drag = false;
      const { lblR, lblL, lblU } = getLblEls();
      if (lblR) lblR.style.opacity = '0';
      if (lblL) lblL.style.opacity = '0';
      if (lblU) lblU.style.opacity = '0';

      const isUp = cdy < -70 && Math.abs(cdy) > Math.abs(cdx);
      const isR = cdx > 70 && !isUp;
      const isL = cdx < -70 && !isUp;
      const det = isR ? 'r' : isL ? 'l' : isUp ? 'u' : null;
      const step = getStep();

      if (step.final && det === 'u') {
        // up → next slide
        card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        card.style.transform = 'translateX(calc(-50%)) translateY(-700px)';
        card.style.opacity = '0';
        if (ghost1Ref.current) { ghost1Ref.current.style.transform = 'translateX(-50%) scale(1)'; ghost1Ref.current.style.opacity = '1'; }
        if (ghost2Ref.current) { ghost2Ref.current.style.transform = 'translateX(-50%) scale(0.961)'; ghost2Ref.current.style.opacity = '0.6'; }
        setTimeout(() => { goTo(4); }, 370);
        cdx = 0; cdy = 0; return;

      } else if (step.final && det === 'r') {
        // right → restart
        card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        card.style.transform = 'translateX(calc(-50% + 500px))';
        card.style.opacity = '0';
        setTimeout(() => {
          setTrainerStep(0);
          trainerStepRef.current = 0;
          setTrainerInstr(TRAINER_STEPS[0].instr);
          setTrainerResultVisible(false);
          setPillsDone([false, false, false]);
          setPillsDim([false, true, true]);
          if (cardRef.current) {
            cardRef.current.style.transition = 'none';
            cardRef.current.style.transform = 'translateX(-50%)';
            cardRef.current.style.opacity = '1';
          }
          resetGhosts();
          // reset labels
          const { lblR: r2, lblL: l2, lblU: u2 } = getLblEls();
          if (r2) r2.textContent = '→ Für später parken';
          if (l2) l2.textContent = '← Archivieren';
          if (u2) u2.textContent = '↑ Jetzt kochen!';
        }, 370);
        cdx = 0; cdy = 0; return;

      } else if (step.final && det === 'l') {
        // left → end onboarding
        card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        card.style.transform = 'translateX(calc(-50% - 500px))';
        card.style.opacity = '0';
        setTimeout(() => { onComplete && onComplete(); }, 370);
        cdx = 0; cdy = 0; return;

      } else if (!step.final && det === step.dir) {
        // correct swipe
        const tx = step.dir === 'r' ? 500 : step.dir === 'l' ? -500 : 0;
        const ty = step.dir === 'u' ? -700 : 0;
        card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
        card.style.transform = `translateX(calc(-50% + ${tx}px)) translateY(${ty}px) rotate(${cdx * 0.04}deg)`;
        card.style.opacity = '0';

        if (ghost1Ref.current) { ghost1Ref.current.style.transform = 'translateX(-50%) scale(1)'; ghost1Ref.current.style.opacity = '1'; }
        if (ghost2Ref.current) { ghost2Ref.current.style.transform = 'translateX(-50%) scale(0.961)'; ghost2Ref.current.style.opacity = '0.6'; }

        setTimeout(() => {
          // Mark pill done
          const stepIdx = trainerStepRef.current;
          setPillsDone(prev => { const next = [...prev]; next[stepIdx] = true; return next; });
          setPillsDim(prev => { const next = [...prev]; next[stepIdx] = false; return next; });

          // Show result text
          setTrainerResultContent({ tag: step.tag, title: step.title, body: step.body });
          setTrainerResultVisible(true);

          const nextStep = stepIdx + 1;
          setTrainerStep(nextStep);
          trainerStepRef.current = nextStep;

          if (nextStep < TRAINER_STEPS.length) {
            // Reset card for next step
            if (cardRef.current) {
              cardRef.current.style.transition = 'none';
              cardRef.current.style.transform = 'translateX(-50%)';
              cardRef.current.style.opacity = '1';
            }
            resetGhosts();

            const { lblR: r3, lblL: l3, lblU: u3 } = getLblEls();
            if (r3) r3.textContent = '→ Für später parken';
            if (l3) l3.textContent = '← Archivieren';
            if (u3) u3.textContent = '↑ Jetzt kochen!';

            setTrainerInstr(TRAINER_STEPS[nextStep].instr);
            if (nextStep < 3) {
              setPillsDim(prev => {
                const next = [...prev]; next[nextStep] = false; return next;
              });
            }
          }
        }, 370);

      } else {
        // bounce back
        card.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
        card.style.transform = 'translateX(-50%)';
      }
      cdx = 0; cdy = 0;
    }

    const ts = (e) => { start(e.touches[0].clientX, e.touches[0].clientY); };
    const tm = (e) => { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); };
    const te = () => { end(); };
    const md = (e) => {
      e.preventDefault(); start(e.clientX, e.clientY);
      const mm = (ev) => { move(ev.clientX, ev.clientY); };
      const mu = () => { end(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    };

    card.addEventListener('touchstart', ts, { passive: true });
    card.addEventListener('touchmove', tm, { passive: false });
    card.addEventListener('touchend', te, { passive: true });
    card.addEventListener('mousedown', md);

    return () => {
      card.removeEventListener('touchstart', ts);
      card.removeEventListener('touchmove', tm);
      card.removeEventListener('touchend', te);
      card.removeEventListener('mousedown', md);
    };
  }, [currentSlide, goTo, onComplete]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const showRes = (key) => setActiveResults(prev => ({ ...prev, [key]: true }));
  const hideRes = (key) => setActiveResults(prev => ({ ...prev, [key]: false }));

  const slideClass = (n) => `ob-slide${currentSlide === n ? ' active' : ''}`;

  const dots = (active, theme = 'dk') =>
    Array.from({ length: 7 }, (_, i) => (
      <div key={i} className={`ob-dot ob-dot-${theme}${i === active ? ' active' : ''}`} />
    ));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="onboarding-overlay">
      <div className="onboarding-phone">
        <div className="onboarding-wrap" ref={wrapRef}>

          {/* ── S0: STARTSEITE ─────────────────────────────────────────── */}
          <div className={slideClass(0)} id="s0">
            <div className="ob-ss">
              <div className="ob-ss-placeholder">Screenshot Placeholder</div>
              <div className="ob-s0-tap-area" onClick={() => goTo(1)} />
            </div>
          </div>

          {/* ── S1: DIMMED + RING + BUBBLE ──────────────────────────────── */}
          <div className={slideClass(1)} id="s1">
            <div className="ob-ss">
              <div className="ob-ss-placeholder">Screenshot Placeholder</div>
              <div
                className="ob-spotlight"
                style={{ bottom: 4, left: 273, transform: 'translateX(-50%)', width: 72, height: 74, borderRadius: 14 }}
              />
              <div className="ob-bubble" style={{ bottom: 90, left: 12, right: 12 }}>
                <div className="ob-bubble-arrow-down" style={{ left: 252 }} />
                <div className="ob-b-tag">Let's go</div>
                <div className="ob-b-title">Dein Atelier, dein Kreativraum</div>
                <div className="ob-b-body">
                  In <strong style={{ color: '#1A1A18', fontWeight: 600 }}>Meine Kochideen</strong> und{' '}
                  <strong style={{ color: '#1A1A18', fontWeight: 600 }}>Meine Alltagsklassiker</strong> warten Rezepte auf dich.
                  Lass dich inspirieren und entdecke, was heute auf den Tisch kommt.
                </div>
                <button className="ob-btn" onClick={() => goTo(2)} style={{ marginTop: 14 }}>Weiter</button>
              </div>
            </div>
            <div style={{ position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)' }}>
              <div className="ob-dots">{dots(0, 'dk')}</div>
            </div>
          </div>

          {/* ── S2: KATEGORIE PLATZHALTER ────────────────────────────────── */}
          <div className={slideClass(2)} id="s2">
            <div className="ob-info-slide">
              <div className="ob-info-tag">Was willst du heute kochen?</div>
              <div className="ob-info-title">Wähle deine <em>Inspiration</em></div>
              <div className="ob-info-body">
                Diese Funktion kommt bald. Du kannst dann gezielt nach Hauptspeisen, Desserts, Drinks und mehr filtern.
              </div>
              <div className="ob-category-grid">
                <div className="ob-category-item"><span className="ob-category-emoji">🍽️</span><span className="ob-category-name">Hauptspeise</span></div>
                <div className="ob-category-item"><span className="ob-category-emoji">🍹</span><span className="ob-category-name">Drinks</span></div>
                <div className="ob-category-item"><span className="ob-category-emoji">🍰</span><span className="ob-category-name">Desserts</span></div>
                <div className="ob-category-item"><span className="ob-category-emoji">🥗</span><span className="ob-category-name">Salate</span></div>
              </div>
              <div className="ob-info-footer">
                <div className="ob-dots">{dots(1, 'lt')}</div>
                <button className="ob-btn" onClick={() => goTo(3)}>Weiter – Rezepte entdecken</button>
                <div className="ob-info-hint">Kategorienauswahl folgt in einem späteren Update</div>
              </div>
            </div>
          </div>

          {/* ── S3: SWIPE TRAINER ────────────────────────────────────────── */}
          <div className={slideClass(3)} id="s3">
            <div className="ob-trainer-slide">
              <div
                className="ob-t-instr"
                dangerouslySetInnerHTML={{ __html: trainerInstr }}
              />

              <div className="ob-card-stack" id="stack1">
                {/* Ghost card 2 */}
                <div ref={ghost2Ref} className="ob-ghost-card ob-ghost-2">
                  <div className="ob-ghost-placeholder" />
                  <div className="ob-ghost-info">
                    <div className="ob-ghost-name">Mango Cocktail</div>
                    <div className="ob-ghost-author">Benjamin</div>
                  </div>
                </div>
                {/* Ghost card 1 */}
                <div ref={ghost1Ref} className="ob-ghost-card ob-ghost-1">
                  <div className="ob-ghost-placeholder" />
                  <div className="ob-ghost-info">
                    <div className="ob-ghost-name">Mango Cocktail</div>
                    <div className="ob-ghost-author">Benjamin</div>
                  </div>
                </div>

                <span className="ob-drag-lbl ob-lbl-r">→ Für später parken</span>
                <span className="ob-drag-lbl ob-lbl-l">← Archivieren</span>
                <span className="ob-drag-lbl ob-lbl-u">↑ Jetzt kochen!</span>

                {/* Main swipe card */}
                <div ref={cardRef} className="ob-swipe-card" id="card1">
                  <div className="ob-card-photo-placeholder" />
                  <div className="ob-card-body">
                    <div className="ob-card-name">Mango Cocktail</div>
                    <div className="ob-card-author">Benjamin</div>
                    <div className="ob-card-tags">
                      <span className="ob-card-tag">Vegetarisch</span>
                      <span className="ob-card-tag">5 Min.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress pills */}
              <div className="ob-prog-row">
                <div className={`ob-prog-pill${pillsDone[0] ? ' done' : ''}${pillsDim[0] ? ' dim' : ''}`}>→ Parken</div>
                <div className={`ob-prog-pill${pillsDone[1] ? ' done' : ''}${pillsDim[1] ? ' dim' : ''}`}>← Archiv</div>
                <div className={`ob-prog-pill${pillsDone[2] ? ' done' : ''}${pillsDim[2] ? ' dim' : ''}`}>↑ Kochen</div>
              </div>

              {/* Result text */}
              <div className="ob-t-result" style={{ opacity: trainerResultVisible ? 1 : 0 }}>
                <div className="ob-t-result-tag">{trainerResultContent.tag}</div>
                <div className="ob-t-result-title">{trainerResultContent.title}</div>
                <p
                  className="ob-t-result-body"
                  dangerouslySetInnerHTML={{ __html: trainerResultContent.body || '' }}
                />
              </div>
            </div>

            <div className="ob-trainer-bottom">
              <div className="ob-dots">{dots(2, 'lt')}</div>
              {showNextBtn && (
                <button className="ob-btn" onClick={() => goTo(4)}>Weiter: Deine Kandidaten 🍳</button>
              )}
            </div>
          </div>

          {/* ── S4: KANDIDATEN GRID ─────────────────────────────────────── */}
          <div className={slideClass(4)} id="s4">
            <div className="ob-ss">
              <div className="ob-ss-placeholder">Screenshot Placeholder</div>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', pointerEvents: 'none' }} />
              <div style={{
                position: 'absolute', top: '50%', left: 14, right: 14,
                transform: 'translateY(-50%)', background: 'white', borderRadius: 20,
                padding: '22px 20px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)'
              }}>
                <div className="ob-c-tag">Deine Shortlist</div>
                <div className="ob-c-title" style={{ fontSize: 18, marginBottom: 8 }}>Max. 6 Kandidaten – Qualität statt Chaos</div>
                <div className="ob-c-body" style={{ fontSize: 13 }}>
                  Nur die besten 6 landen in deinem Kochatelier. Nach <strong>7 Tagen</strong> wandern sie zurück in den Stapel – so bleibt die Auswahl immer frisch und du wirst nie überfordert.
                </div>
              </div>
            </div>
            <div className="ob-nav-dark">
              <div className="ob-dots">{dots(3, 'dk')}</div>
              <button className="ob-btn" onClick={() => goTo(5)}>Weiter: Nach dem Kochen</button>
            </div>
          </div>

          {/* ── S5: FEEDBACK NEGATIV ────────────────────────────────────── */}
          <div className={slideClass(5)} id="s5">
            <div className="ob-ss">
              <div className="ob-ss-placeholder">Screenshot Placeholder</div>
              <div className="ob-fb-overlay" style={{ top: 248 }}>
                <div className="ob-fb-header">
                  <div className="ob-fb-h-tag">Nach dem Kochen</div>
                  <div className="ob-fb-h-title">Erzähl, wie war es?</div>
                </div>
                <div className="ob-fb-item" onClick={() => showRes('enttaeuscht')}>
                  <div className="ob-fb-dot" style={{ background: '#bbb' }} />
                  <div><div className="ob-fb-name">Ich bin enttäuscht</div><div className="ob-fb-desc">Rezept wird archiviert</div></div>
                  <div className="ob-fb-arr">›</div>
                  <div className="ob-tap-hint">Tippen</div>
                </div>
                <div className="ob-fb-item" onClick={() => showRes('zweite')}>
                  <div className="ob-fb-dot" style={{ background: '#D4820A' }} />
                  <div><div className="ob-fb-name">Zweite Chance, bitte</div><div className="ob-fb-desc">Zurück in den Stapel</div></div>
                  <div className="ob-fb-arr">›</div>
                  <div className="ob-tap-hint">Tippen</div>
                </div>
                <div className="ob-fb-item dim">
                  <div className="ob-fb-dot" style={{ background: '#5A8A6A' }} />
                  <div><div className="ob-fb-name">Koche ich mal wieder</div></div>
                </div>
                <div className="ob-fb-item dim" style={{ borderBottom: 'none' }}>
                  <div className="ob-fb-dot" style={{ background: '#E8A030' }} />
                  <div><div className="ob-fb-name">Koche ich regelmäßig</div></div>
                </div>
              </div>

              <div className={`ob-result-ov${activeResults.enttaeuscht ? ' show' : ''}`}>
                <div className="ob-r-emoji">🗂️</div>
                <div className="ob-r-title">Ab ins <em>Archiv</em></div>
                <div className="ob-r-body">Schade – aber kein Verlust. Das Rezept verschwindet aus deinem Stapel. Manchmal weiß man es erst nach dem Kochen.</div>
                <button className="ob-btn" onClick={() => { hideRes('enttaeuscht'); goTo(6); }}>Weiter: Wenn's geschmeckt hat</button>
              </div>
              <div className={`ob-result-ov${activeResults.zweite ? ' show' : ''}`}>
                <div className="ob-r-emoji">🔄</div>
                <div className="ob-r-title">Noch eine <em>Chance</em></div>
                <div className="ob-r-body">Vielleicht war der Tag nicht ideal. brouBook mischt das Rezept zurück in deinen Stapel – vielleicht wird's beim nächsten Mal ein Liebling.</div>
                <button className="ob-btn" onClick={() => { hideRes('zweite'); goTo(6); }}>Weiter: Wenn's geschmeckt hat</button>
              </div>
            </div>
            <div className="ob-nav-dark" style={{ background: 'none' }}>
              <div className="ob-dots">{dots(4, 'dk')}</div>
            </div>
          </div>

          {/* ── S6: FEEDBACK POSITIV ─────────────────────────────────────── */}
          <div className={slideClass(6)} id="s6">
            <div className="ob-ss">
              <div className="ob-ss-placeholder">Screenshot Placeholder</div>
              <div className="ob-fb-overlay" style={{ top: 248 }}>
                <div className="ob-fb-header">
                  <div className="ob-fb-h-tag">Nach dem Kochen</div>
                  <div className="ob-fb-h-title">Erzähl, wie war es?</div>
                </div>
                <div className="ob-fb-item dim">
                  <div className="ob-fb-dot" style={{ background: '#bbb' }} />
                  <div><div className="ob-fb-name">Ich bin enttäuscht</div></div>
                </div>
                <div className="ob-fb-item dim">
                  <div className="ob-fb-dot" style={{ background: '#D4820A' }} />
                  <div><div className="ob-fb-name">Zweite Chance, bitte</div></div>
                </div>
                <div className="ob-fb-item" onClick={() => showRes('wieder')}>
                  <div className="ob-fb-dot" style={{ background: '#5A8A6A' }} />
                  <div><div className="ob-fb-name">Koche ich mal wieder</div><div className="ob-fb-desc">→ Meine Alltagsklassiker</div></div>
                  <div className="ob-fb-arr">›</div>
                  <div className="ob-tap-hint">Tippen</div>
                </div>
                <div className="ob-fb-item" onClick={() => showRes('regelmaessig')} style={{ borderBottom: 'none' }}>
                  <div className="ob-fb-dot" style={{ background: '#E8A030' }} />
                  <div><div className="ob-fb-name">Koche ich regelmäßig</div><div className="ob-fb-desc">→ Alltagsklassiker + ★ Favorit</div></div>
                  <div className="ob-fb-arr">›</div>
                  <div className="ob-tap-hint">Tippen</div>
                </div>
              </div>

              <div className={`ob-result-ov${activeResults.wieder ? ' show' : ''}`}>
                <div className="ob-r-emoji">📖</div>
                <div className="ob-r-title">Ab in die <em>Alltagsklassiker!</em></div>
                <div className="ob-r-body">Das Rezept zieht um – direkt in deine Alltagsklassiker auf der Startseite. Beim nächsten Mal nur noch ein Tipp.</div>
                <button className="ob-btn" onClick={() => { hideRes('wieder'); onComplete && onComplete(); }}>Zur Startseite – los kochen! 🍳</button>
              </div>
              <div className={`ob-result-ov${activeResults.regelmaessig ? ' show' : ''}`}>
                <div className="ob-r-emoji">⭐</div>
                <div className="ob-r-title">Ein neuer <em>Favorit</em> ist geboren!</div>
                <div className="ob-r-body">Dieses Rezept hat dein Herz erobert. Es landet in den Alltagsklassikern und wird als Favorit markiert – immer griffbereit.</div>
                <button className="ob-btn" onClick={() => { hideRes('regelmaessig'); onComplete && onComplete(); }}>Zur Startseite – los kochen! 🍳</button>
              </div>
            </div>
            <div className="ob-nav-dark" style={{ background: 'none' }}>
              <div className="ob-dots">{dots(5, 'dk')}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default OnboardingFlow;
