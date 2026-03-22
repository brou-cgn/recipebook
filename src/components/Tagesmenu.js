import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import './Tagesmenu.css';
import RecipeImageCarousel from './RecipeImageCarousel';
import { setRecipeSwipeFlag } from '../utils/recipeSwipeFlags';

/**
 * Tagesmenü page – shows recipe cards as a swipeable Tinder-style stack.
 *
 * Behaviour:
 *  - If the user has multiple interactive lists, a tab bar lets them switch.
 *  - Cards are displayed as a visual stack (depth effect).
 *  - The top card can be swiped left, right, or up via pointer drag (mouse & touch).
 *  - Swiping beyond the threshold flies the card out and reveals the next one.
 *  - After all cards are swiped a completion screen with a restart button appears.
 *
 * @param {Object}   props
 * @param {Array}    props.interactiveLists  - Groups with listKind === 'interactive'
 * @param {Array}    props.recipes           - All recipes visible to the user
 * @param {Array}    props.allUsers          - All users (to resolve author names)
 * @param {Function} props.onSelectRecipe    - Called with a recipe when its card is tapped
 * @param {Object}   props.currentUser       - The currently logged-in user
 */

const SWIPE_THRESHOLD = 50;           // px drag distance to trigger a swipe
const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms – fast flick triggers swipe even if short
const MIN_FAST_SWIPE_DISTANCE = 20;   // px – minimum displacement required for a velocity swipe
const DIRECTION_THRESHOLD = 5;        // px of movement before we decide drag direction
const STACK_VISIBLE = 3;              // how many cards are rendered in the stack

function Tagesmenu({ interactiveLists, recipes, allUsers, onSelectRecipe, currentUser }) {
  const [selectedListId, setSelectedListId] = useState(
    interactiveLists.length > 0 ? interactiveLists[0].id : null
  );

  const selectedList = interactiveLists.find((l) => l.id === selectedListId) ?? null;

  const listRecipes = useMemo(() => {
    if (!selectedList) return [];
    const groupRecipeIds = Array.isArray(selectedList.recipeIds) ? selectedList.recipeIds : [];
    return recipes.filter(
      (r) => r.groupId === selectedList.id || groupRecipeIds.includes(r.id)
    );
  }, [recipes, selectedList]);

  // Reset swipe index when the user switches lists
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevListIdRef = useRef(selectedListId);
  useEffect(() => {
    if (prevListIdRef.current !== selectedListId) {
      prevListIdRef.current = selectedListId;
      setCurrentIndex(0);
    }
  }, [selectedListId]);

  // Drag / animation state
  // cardPhase: 'idle' | 'dragging' | 'snap' | 'flying'
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [cardPhase, setCardPhase] = useState('idle');

  // Active gesture tracking (ref to avoid stale closure issues)
  const gestureRef = useRef(null);

  // Tracks the swipe direction and recipe for the currently flying card so that
  // handleTransitionEnd can record the flag after the animation completes.
  const pendingSwipeRef = useRef(null);

  // Refs that mirror the current top recipe and selected list so pointer-event
  // handlers (which have empty dependency arrays) can still read the latest values.
  const topRecipeRef = useRef(null);
  const selectedListRef = useRef(null);
  useEffect(() => {
    topRecipeRef.current = listRecipes[currentIndex] ?? null;
  }, [listRecipes, currentIndex]);
  useEffect(() => {
    selectedListRef.current = selectedList;
  }, [selectedList]);

  const getAuthorName = (authorId) => {
    if (!authorId || !allUsers) return '';
    const user = allUsers.find((u) => u.id === authorId);
    return user ? user.vorname : '';
  };

  // Lock page scroll while this view is shown – the only allowed motion is card swiping.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscrollBehavior = document.body.style.overscrollBehavior;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;

    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      // Read the locked scroll position before restoring styles
      const lockedScrollY = parseInt(document.body.style.top || '0', 10) * -1;
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscrollBehavior;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, lockedScrollY);
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (cardPhase === 'flying') return;
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      pointerId: e.pointerId,
      decided: false,      // whether we've chosen a drag direction yet
      active: false,       // whether this element has captured the pointer
      inImageArea: !!e.target.closest('.tagesmenu-card-image'),
    };
  }, [cardPhase]);

  const handlePointerMove = useCallback((e) => {
    const g = gestureRef.current;
    if (!g) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.decided) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < DIRECTION_THRESHOLD) return; // wait for enough movement
      g.decided = true;
      const isHorizontal = Math.abs(dx) >= Math.abs(dy);
      if (isHorizontal && g.inImageArea) {
        // The user is swiping horizontally inside the image carousel –
        // cancel card drag and let the carousel's native scroll take over.
        gestureRef.current = null;
        return;
      }
      // We take over this gesture.
      g.active = true;
      e.currentTarget.setPointerCapture(g.pointerId);
      setCardPhase('dragging');
    }

    if (!g.active) return;
    setDragOffset({ x: dx, y: dy });
  }, []);

  const handlePointerUp = useCallback((e) => {
    const g = gestureRef.current;
    if (!g || !g.active) {
      gestureRef.current = null;
      return;
    }
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    gestureRef.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Compute gesture velocity so short fast flicks also trigger a swipe
    const duration = Date.now() - g.startTime;
    const velocity = duration > 0 ? Math.sqrt(dx * dx + dy * dy) / duration : 0;
    const isFastSwipe = velocity >= SWIPE_VELOCITY_THRESHOLD;

    if ((absDx >= SWIPE_THRESHOLD || (isFastSwipe && absDx > MIN_FAST_SWIPE_DISTANCE)) && absDx >= absDy) {
      // Horizontal swipe — fly card off to the side
      const targetX = (dx > 0 ? 1 : -1) * window.innerWidth * 1.5;
      pendingSwipeRef.current = {
        direction: dx > 0 ? 'right' : 'left',
        recipe: topRecipeRef.current,
        list: selectedListRef.current,
      };
      setDragOffset({ x: targetX, y: dy });
      setCardPhase('flying');
    } else if (dy < 0 && absDy > absDx && (absDy >= SWIPE_THRESHOLD || (isFastSwipe && absDy > MIN_FAST_SWIPE_DISTANCE))) {
      // Upward swipe — fly card off to the top
      pendingSwipeRef.current = {
        direction: 'up',
        recipe: topRecipeRef.current,
        list: selectedListRef.current,
      };
      setDragOffset({ x: dx, y: -window.innerHeight * 1.5 });
      setCardPhase('flying');
    } else {
      // Below threshold — snap the card back
      setDragOffset({ x: 0, y: 0 });
      setCardPhase('snap');
    }
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (!gestureRef.current?.active) {
      gestureRef.current = null;
      return;
    }
    gestureRef.current = null;
    setDragOffset({ x: 0, y: 0 });
    setCardPhase('snap');
  }, []);

  const handleTransitionEnd = useCallback(() => {
    if (cardPhase === 'flying') {
      // Record the swipe flag before advancing to the next card
      const swipe = pendingSwipeRef.current;
      pendingSwipeRef.current = null;
      if (swipe && currentUser?.id && swipe.list?.id && swipe.recipe?.id) {
        const flagMap = { right: 'geparkt', left: 'archiv', up: 'kandidat' };
        const flag = flagMap[swipe.direction];
        if (flag) {
          setRecipeSwipeFlag(currentUser.id, swipe.list.id, swipe.recipe.id, flag);
        }
      }
      setCurrentIndex((prev) => prev + 1);
      setDragOffset({ x: 0, y: 0 });
      setCardPhase('idle');
    } else if (cardPhase === 'snap') {
      setCardPhase('idle');
    }
  }, [cardPhase, currentUser]);

  // ---- Derived values -------------------------------------------------

  const allSwiped = listRecipes.length > 0 && currentIndex >= listRecipes.length;
  const visibleRecipes = listRecipes.slice(currentIndex, currentIndex + STACK_VISIBLE);

  // How far along the swipe are we (0–1) – used to animate background cards
  const dragProgress = Math.min(
    Math.sqrt(dragOffset.x ** 2 + dragOffset.y ** 2) / SWIPE_THRESHOLD,
    1
  );

  // Which direction indicator to show while dragging
  const swipeHint =
    cardPhase === 'dragging' &&
    Math.abs(dragOffset.x) > 20 &&
    Math.abs(dragOffset.x) >= Math.abs(dragOffset.y)
      ? dragOffset.x > 0 ? 'right' : 'left'
      : cardPhase === 'dragging' &&
        dragOffset.y < -20 &&
        Math.abs(dragOffset.y) > Math.abs(dragOffset.x)
      ? 'up'
      : null;

  const swipeHintOpacity = Math.min(
    Math.abs(swipeHint === 'up' ? dragOffset.y : dragOffset.x) / SWIPE_THRESHOLD,
    1
  );

  // ---- Render ---------------------------------------------------------

  return (
    <div className="tagesmenu-container">
      {interactiveLists.length > 1 && (
        <div className="tagesmenu-list-selector">
          {interactiveLists.map((list) => (
            <button
              key={list.id}
              className={`tagesmenu-list-tab${list.id === selectedListId ? ' active' : ''}`}
              onClick={() => setSelectedListId(list.id)}
            >
              {list.name}
            </button>
          ))}
        </div>
      )}

      {listRecipes.length === 0 ? (
        <div className="tagesmenu-empty">
          <span className="tagesmenu-empty-icon">🍽️</span>
          <p>Diese Liste enthält noch keine Rezepte.</p>
        </div>
      ) : allSwiped ? (
        <div className="tagesmenu-empty">
          <span className="tagesmenu-empty-icon">✅</span>
          <p>Alle Rezepte angesehen!</p>
          <button
            className="tagesmenu-restart-btn"
            onClick={() => setCurrentIndex(0)}
          >
            Nochmal ansehen
          </button>
        </div>
      ) : (
        <div className="tagesmenu-stack">
          {/* Render from back to front so the top card sits on top in DOM order */}
          {[...visibleRecipes].reverse().map((recipe, revIdx) => {
            const depth = visibleRecipes.length - 1 - revIdx; // 0 = top card
            const isTop = depth === 0;

            const allImages =
              Array.isArray(recipe.images) && recipe.images.length > 0
                ? recipe.images
                : recipe.image
                ? [{ url: recipe.image, isDefault: true }]
                : [];
            const orderedImages = [
              ...allImages.filter((img) => img.isDefault),
              ...allImages.filter((img) => !img.isDefault),
            ];
            const authorName = getAuthorName(recipe.authorId);

            // Build per-card inline style
            let cardStyle;
            if (isTop) {
              const rotate = dragOffset.x * 0.08;
              const transition =
                cardPhase === 'flying'
                  ? 'transform 0.4s ease-in, opacity 0.4s ease-in'
                  : cardPhase === 'snap'
                  ? 'transform 0.3s ease'
                  : 'none';
              cardStyle = {
                transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotate}deg)`,
                transition,
                opacity: cardPhase === 'flying' ? 0 : 1,
                zIndex: 10,
              };
            } else {
              // Background cards scale up proportionally as the top card is dragged
              const baseScale = depth === 1 ? 0.95 : 0.9;
              const scale = baseScale + (1 - baseScale) * dragProgress;
              const translateY = depth * 10 * (1 - dragProgress);
              cardStyle = {
                transform: `scale(${scale}) translateY(${translateY}px)`,
                transition: cardPhase === 'dragging' ? 'none' : 'transform 0.3s ease',
                zIndex: 10 - depth,
              };
            }

            return (
              <div
                key={recipe.id}
                className={`tagesmenu-card${isTop ? ' tagesmenu-card-top' : ''}`}
                style={cardStyle}
                onPointerDown={isTop ? handlePointerDown : undefined}
                onPointerMove={isTop ? handlePointerMove : undefined}
                onPointerUp={isTop ? handlePointerUp : undefined}
                onPointerCancel={isTop ? handlePointerCancel : undefined}
                onTransitionEnd={isTop ? handleTransitionEnd : undefined}
                onClick={
                  isTop && cardPhase === 'idle' && dragOffset.x === 0 && dragOffset.y === 0
                    ? () => onSelectRecipe(recipe)
                    : undefined
                }
              >
                {/* Swipe direction badges */}
                {isTop && swipeHint === 'right' && (
                  <div
                    className="tagesmenu-swipe-badge tagesmenu-swipe-badge--right"
                    style={{ opacity: swipeHintOpacity }}
                  >
                    👍
                  </div>
                )}
                {isTop && swipeHint === 'left' && (
                  <div
                    className="tagesmenu-swipe-badge tagesmenu-swipe-badge--left"
                    style={{ opacity: swipeHintOpacity }}
                  >
                    👎
                  </div>
                )}
                {isTop && swipeHint === 'up' && (
                  <div
                    className="tagesmenu-swipe-badge tagesmenu-swipe-badge--up"
                    style={{ opacity: swipeHintOpacity }}
                  >
                    ⭐
                  </div>
                )}

                {orderedImages.length > 0 ? (
                  // stopPropagation prevents the card-level onClick from double-firing
                  // when the user taps inside the carousel (carousel slide also handles clicks).
                  <div
                    className="tagesmenu-card-image"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RecipeImageCarousel
                      images={orderedImages}
                      altText={recipe.title}
                      onImageClick={
                        isTop && cardPhase === 'idle' ? () => onSelectRecipe(recipe) : undefined
                      }
                    />
                  </div>
                ) : (
                  <div className="tagesmenu-card-image tagesmenu-card-no-image">
                    <span>🍽️</span>
                  </div>
                )}

                <div className="tagesmenu-card-info">
                  <h2 className="tagesmenu-card-title">{recipe.title}</h2>
                  {authorName && (
                    <p className="tagesmenu-card-author">{authorName}</p>
                  )}
                  {recipe.kulinarik &&
                    (Array.isArray(recipe.kulinarik)
                      ? recipe.kulinarik.length > 0
                      : recipe.kulinarik.trim().length > 0) && (
                      <div className="tagesmenu-card-kulinarik">
                        {Array.isArray(recipe.kulinarik)
                          ? recipe.kulinarik.map((k, i) => (
                              <span key={i} className="tagesmenu-kulinarik-tag">
                                {k}
                              </span>
                            ))
                          : (
                              <span className="tagesmenu-kulinarik-tag">
                                {recipe.kulinarik}
                              </span>
                            )}
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Tagesmenu;
