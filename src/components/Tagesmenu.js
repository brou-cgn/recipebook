import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import './Tagesmenu.css';
import { setRecipeSwipeFlag, getActiveSwipeFlags, getAllMembersSwipeFlags, computeGroupRecipeStatus } from '../utils/recipeSwipeFlags';
import { getStatusValiditySettings, getGroupStatusThresholds, getButtonIcons, DEFAULT_BUTTON_ICONS, getMaxKandidatenSchwelle } from '../utils/customLists';
import { isBase64Image } from '../utils/imageUtils';
import TagesmenuFilterOverlay from './TagesmenuFilterOverlay';

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
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const selectedList = interactiveLists.find((l) => l.id === selectedListId) ?? null;

  // Reset swipe index when the user switches lists
  const [currentIndex, setCurrentIndex] = useState(0);

  // Maps recipeId → 'kandidat' | 'geparkt' | 'archiv' for the current session
  const [swipeResults, setSwipeResults] = useState({});

  // Active swipe flags from Firestore (non-expired), used to filter the stack
  const [activeFlags, setActiveFlags] = useState({});

  // True once the initial active-flags fetch for the current list has resolved.
  // Prevents showing swipe cards before we know which recipes are already flagged.
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  // Configured validity durations (number of days or null for permanent)
  const [statusValiditySettings, setStatusValiditySettings] = useState({
    statusValidityDaysKandidat: null,
    statusValidityDaysGeparkt: null,
    statusValidityDaysArchiv: null,
  });

  // Group status thresholds for shared status determination across all list members
  const [groupThresholds, setGroupThresholds] = useState({
    groupThresholdKandidatMinKandidat: 50,
    groupThresholdKandidatMaxArchiv: 50,
    groupThresholdArchivMinArchiv: 50,
    groupThresholdArchivMaxKandidat: 50,
  });

  // Maximum candidate score threshold for ending the swipe stack early (null = disabled)
  const [maxKandidatenSchwelle, setMaxKandidatenSchwelle] = useState(null);

  // All members' swipe flags for the selected list (used for group status determination)
  // Map of userId → { recipeId → flag }
  const [allMembersFlags, setAllMembersFlags] = useState({});

  // Configurable swipe badge icons loaded from settings
  const [swipeIcons, setSwipeIcons] = useState({
    swipeRight: DEFAULT_BUTTON_ICONS.swipeRight,
    swipeLeft: DEFAULT_BUTTON_ICONS.swipeLeft,
    swipeUp: DEFAULT_BUTTON_ICONS.swipeUp,
  });

  // All recipes belonging to the selected list, regardless of active flags
  const allListRecipes = useMemo(() => {
    if (!selectedList) return [];
    const groupRecipeIds = Array.isArray(selectedList.recipeIds) ? selectedList.recipeIds : [];
    return recipes.filter(
      (r) => r.groupId === selectedList.id || groupRecipeIds.includes(r.id)
    );
  }, [recipes, selectedList]);

  // Recipes still available for swiping (those without an active flag)
  const listRecipes = useMemo(() => {
    return allListRecipes.filter((r) => !activeFlags[r.id]);
  }, [allListRecipes, activeFlags]);

  const prevListIdRef = useRef(selectedListId);
  useEffect(() => {
    if (prevListIdRef.current !== selectedListId) {
      prevListIdRef.current = selectedListId;
      setCurrentIndex(0);
      setSwipeResults({});
      setActiveFlags({});
      setAllMembersFlags({});
      setFlagsLoaded(false);
      // Reload the global threshold setting to ensure it is not lost during list switches
      getMaxKandidatenSchwelle().then(setMaxKandidatenSchwelle).catch(() => {});
    }
  }, [selectedListId]);

  // Load status validity settings once on mount
  useEffect(() => {
    getStatusValiditySettings().then(setStatusValiditySettings).catch(() => {});
    getGroupStatusThresholds().then(setGroupThresholds).catch(() => {});
    getMaxKandidatenSchwelle().then(setMaxKandidatenSchwelle).catch(() => {});
  }, []);

  // Load configurable swipe icons once on mount
  useEffect(() => {
    getButtonIcons().then((icons) => {
      setSwipeIcons({
        swipeRight: icons.swipeRight ?? DEFAULT_BUTTON_ICONS.swipeRight,
        swipeLeft: icons.swipeLeft ?? DEFAULT_BUTTON_ICONS.swipeLeft,
        swipeUp: icons.swipeUp ?? DEFAULT_BUTTON_ICONS.swipeUp,
      });
    }).catch(() => {});
  }, []);

  // Load active swipe flags from Firestore when user or selected list changes
  useEffect(() => {
    if (!currentUser?.id || !selectedListId) {
      setActiveFlags({});
      setFlagsLoaded(true);
      return;
    }
    setFlagsLoaded(false);
    getActiveSwipeFlags(currentUser.id, selectedListId)
      .then((flags) => { setActiveFlags(flags); setFlagsLoaded(true); })
      .catch(() => { setFlagsLoaded(true); });
  }, [currentUser, selectedListId]);

  // Load all members' swipe flags for group status determination.
  // Reloads whenever the selected list or its members change.
  useEffect(() => {
    if (!selectedListId || !selectedList) {
      setAllMembersFlags({});
      return;
    }
    const memberIds = Array.isArray(selectedList.memberIds) ? selectedList.memberIds : [];
    const allMemberIds = selectedList.ownerId
      ? [...new Set([selectedList.ownerId, ...memberIds])]
      : memberIds;
    if (allMemberIds.length === 0) {
      setAllMembersFlags({});
      return;
    }
    getAllMembersSwipeFlags(selectedListId, allMemberIds).then((flags) => {
      setAllMembersFlags(flags);
    }).catch(() => {});
  }, [selectedListId, selectedList, currentUser]);

  // Drag / animation state
  // cardPhase: 'idle' | 'dragging' | 'snap' | 'flying'
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [cardPhase, setCardPhase] = useState('idle');

  // Suppresses background-card CSS transitions for exactly one render cycle
  // immediately after a swipe completes, preventing them from animating
  // back to their smaller "stacked" positions and causing a visual glitch.
  const [justSwiped, setJustSwiped] = useState(false);
  useEffect(() => {
    if (!justSwiped) return;
    const raf = requestAnimationFrame(() => setJustSwiped(false));
    return () => cancelAnimationFrame(raf);
  }, [justSwiped]);

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

  // Returns the display text for an ingredient or step item (string or object format).
  const getItemText = (item) => (typeof item === 'string' ? item : item.text);

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

  const handleTransitionEnd = useCallback((e) => {
    if (e.propertyName !== 'transform') return;
    if (cardPhase === 'flying') {
      // Record the swipe flag before advancing to the next card
      const swipe = pendingSwipeRef.current;
      pendingSwipeRef.current = null;
      if (swipe && swipe.recipe?.id) {
        const flagMap = { right: 'geparkt', left: 'archiv', up: 'kandidat' };
        const flag = flagMap[swipe.direction];
        if (flag) {
          if (currentUser?.id && swipe.list?.id) {
            const validityDaysMap = {
              geparkt: statusValiditySettings.statusValidityDaysGeparkt,
              archiv: statusValiditySettings.statusValidityDaysArchiv,
              kandidat: statusValiditySettings.statusValidityDaysKandidat,
            };
            setRecipeSwipeFlag(currentUser.id, swipe.list.id, swipe.recipe.id, flag, validityDaysMap[flag]);
            // Keep allMembersFlags in sync with the current user's new swipe
            setAllMembersFlags((prev) => ({
              ...prev,
              [currentUser.id]: {
                ...(prev[currentUser.id] || {}),
                [swipe.recipe.id]: flag,
              },
            }));
          }
          setSwipeResults((prev) => ({ ...prev, [swipe.recipe.id]: flag }));
        }
      }
      setJustSwiped(true);
      setCurrentIndex((prev) => prev + 1);
      setDragOffset({ x: 0, y: 0 });
      setCardPhase('idle');
    } else if (cardPhase === 'snap') {
      setCardPhase('idle');
    }
  }, [cardPhase, currentUser, statusValiditySettings]);

  // ---- Derived values -------------------------------------------------

  // Full list of member IDs (owner + members) for group status computation
  const listMemberIds = useMemo(() => {
    if (!selectedList) return [];
    const memberIds = Array.isArray(selectedList.memberIds) ? selectedList.memberIds : [];
    return selectedList.ownerId
      ? [...new Set([selectedList.ownerId, ...memberIds])]
      : memberIds;
  }, [selectedList]);

  // Candidate score S = Σ 1/(1+nᵢ) where nᵢ = open votings for recipe i.
  // Used to end the swipe stack early when S reaches maxKandidatenSchwelle.
  // The current user's own pending swipes are excluded from nᵢ so that the
  // stack is only ended by what *other* members have already voted — the
  // current user's swipes themselves drive the score up during swiping.
  // Returns 0 when disabled (null threshold) or when there are no other members,
  // which safely leaves the allSwiped threshold check false.
  const candidateScore = useMemo(() => {
    if (maxKandidatenSchwelle === null || listMemberIds.length === 0) return 0;
    const otherMemberIds = listMemberIds.filter((uid) => uid !== currentUser?.id);
    if (otherMemberIds.length === 0) return 0;
    return allListRecipes.reduce((sum, recipe) => {
      const swipedCount = otherMemberIds.filter(
        (uid) => allMembersFlags[uid]?.[recipe.id] !== undefined
      ).length;
      const ni = otherMemberIds.length - swipedCount;
      return sum + 1 / (1 + ni);
    }, 0);
  }, [allListRecipes, listMemberIds, allMembersFlags, maxKandidatenSchwelle, currentUser]);

  const allSwiped =
    allListRecipes.length > 0 &&
    (listRecipes.length === 0 ||
      currentIndex >= listRecipes.length ||
      (maxKandidatenSchwelle !== null && candidateScore >= maxKandidatenSchwelle));
  const visibleRecipes = listRecipes.slice(currentIndex, currentIndex + STACK_VISIBLE);

  // Precompute group status for each recipe in a single pass to avoid redundant calls in the render
  const groupStatusByRecipeId = useMemo(() => {
    if (listMemberIds.length <= 1) return {};

    const result = Object.fromEntries(
      allListRecipes.map((r) => {
        const status = computeGroupRecipeStatus(listMemberIds, allMembersFlags, r.id, groupThresholds);
        return [r.id, status];
      })
    );
    return result;
  }, [allListRecipes, listMemberIds, allMembersFlags, groupThresholds]);

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
    <div className={`tagesmenu-container${allSwiped ? ' tagesmenu-container--results' : ''}`}>
      {allListRecipes.length === 0 ? (
        <div className="tagesmenu-empty">
          <span className="tagesmenu-empty-icon">🍽️</span>
          <p>Diese Liste enthält noch keine Rezepte.</p>
        </div>
      ) : !flagsLoaded ? (
        null
      ) : allSwiped ? (
        <div className="tagesmenu-results">
          {/* Group status section – only shown for lists with multiple members */}
          {listMemberIds.length > 1 && (() => {
            const groupStatusGroups = [
              { label: 'Kandidat', flag: 'kandidat' },
              { label: 'Archiviert', flag: 'archiv' },
            ].map(({ label, flag }) => ({
              label,
              flag,
              group: allListRecipes.filter((r) => groupStatusByRecipeId[r.id] === flag),
            })).filter(({ group }) => group.length > 0);

            if (groupStatusGroups.length === 0) return null;
            return (
              <>
                <h2 className="tagesmenu-results-section-title">Gemeinsamer Status</h2>
                {groupStatusGroups.map(({ label, flag, group }) => (
                  <div key={`group-${flag}`} className="tagesmenu-results-group">
                    <h3 className="tagesmenu-results-group-title">{label}</h3>
                    <div className="tagesmenu-results-tiles">
                      {group.map((recipe) => {
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
                        return (
                          <button
                            key={recipe.id}
                            className="tagesmenu-results-tile"
                            onClick={() => onSelectRecipe(recipe)}
                          >
                            <div className="tagesmenu-results-tile-image">
                              {orderedImages.length > 0 ? (
                                <img src={orderedImages[0].url} alt={recipe.title} />
                              ) : (
                                <span>🍽️</span>
                              )}
                            </div>
                            <p className="tagesmenu-results-tile-name">{recipe.title}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <h2 className="tagesmenu-results-section-title">Meine Auswahl</h2>
              </>
            );
          })()}
          {[
            { label: 'Kandidat', flag: 'kandidat' },
            { label: 'Für später', flag: 'geparkt' },
            { label: 'Archiviert', flag: 'archiv' },
          ].map(({ label, flag }) => {
            const group = allListRecipes.filter((r) => {
              const combinedFlag = swipeResults[r.id] ?? activeFlags[r.id];
              return combinedFlag === flag;
            });
            if (group.length === 0) return null;
            return (
              <div key={flag} className="tagesmenu-results-group">
                <h3 className="tagesmenu-results-group-title">{label}</h3>
                <div className="tagesmenu-results-tiles">
                  {group.map((recipe) => {
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
                    return (
                      <button
                        key={recipe.id}
                        className="tagesmenu-results-tile"
                        onClick={() => onSelectRecipe(recipe)}
                      >
                        <div className="tagesmenu-results-tile-image">
                          {orderedImages.length > 0 ? (
                            <img src={orderedImages[0].url} alt={recipe.title} />
                          ) : (
                            <span>🍽️</span>
                          )}
                        </div>
                        <p className="tagesmenu-results-tile-name">{recipe.title}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
                transition: cardPhase === 'dragging' || justSwiped ? 'none' : 'transform 0.3s ease',
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
                    {isBase64Image(swipeIcons.swipeRight)
                      ? <img src={swipeIcons.swipeRight} alt="" className="tagesmenu-swipe-badge-img" />
                      : swipeIcons.swipeRight}
                  </div>
                )}
                {isTop && swipeHint === 'left' && (
                  <div
                    className="tagesmenu-swipe-badge tagesmenu-swipe-badge--left"
                    style={{ opacity: swipeHintOpacity }}
                  >
                    {isBase64Image(swipeIcons.swipeLeft)
                      ? <img src={swipeIcons.swipeLeft} alt="" className="tagesmenu-swipe-badge-img" />
                      : swipeIcons.swipeLeft}
                  </div>
                )}
                {isTop && swipeHint === 'up' && (
                  <div
                    className="tagesmenu-swipe-badge tagesmenu-swipe-badge--up"
                    style={{ opacity: swipeHintOpacity }}
                  >
                    {isBase64Image(swipeIcons.swipeUp)
                      ? <img src={swipeIcons.swipeUp} alt="" className="tagesmenu-swipe-badge-img" />
                      : swipeIcons.swipeUp}
                  </div>
                )}

                {orderedImages.length > 0 ? (
                  <div className="tagesmenu-card-image">
                    <img
                      src={orderedImages[0].url}
                      alt={recipe.title}
                      onClick={isTop && cardPhase === 'idle' ? () => onSelectRecipe(recipe) : undefined}
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

                  {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && (
                    <div className="tagesmenu-card-section">
                      <h3 className="tagesmenu-card-section-title">Zutaten</h3>
                      <ul className="tagesmenu-ingredients-list">
                        {recipe.ingredients.map((item, i) => {
                          if (typeof item === 'object' && item.type === 'heading') {
                            return (
                              <li key={`h-${i}`} className="tagesmenu-ingredient-heading">
                                {item.text}
                              </li>
                            );
                          }
                          return <li key={`i-${i}`}>{getItemText(item)}</li>;
                        })}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(recipe.steps) && recipe.steps.length > 0 && (
                    <div className="tagesmenu-card-section">
                      <h3 className="tagesmenu-card-section-title">Zubereitung</h3>
                      <ol className="tagesmenu-steps-list">
                        {recipe.steps.map((item, i) => {
                          if (typeof item === 'object' && item.type === 'heading') {
                            return (
                              <li key={`h-${i}`} className="tagesmenu-step-heading">
                                {item.text}
                              </li>
                            );
                          }
                          return <li key={`s-${i}`}>{getItemText(item)}</li>;
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter button – bottom left, only shown when there are multiple interactive lists */}
      {interactiveLists.length > 1 && (
        <button
          className="tagesmenu-filter-btn"
          onClick={() => setIsFilterOpen(true)}
          aria-label="Listen filtern"
          title="Listen filtern"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </button>
      )}

      <TagesmenuFilterOverlay
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        interactiveLists={interactiveLists}
        selectedListId={selectedListId}
        onSelectList={(id) => setSelectedListId(id)}
      />
    </div>
  );
}

export default Tagesmenu;
