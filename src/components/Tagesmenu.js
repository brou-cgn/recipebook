import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import './Tagesmenu.css';
import { setRecipeSwipeFlag, getActiveSwipeFlags, getAllMembersSwipeFlags, computeGroupRecipeStatus, clearExpiryForArchivedRecipe } from '../utils/recipeSwipeFlags';
import { getStatusValiditySettings, getGroupStatusThresholds, getButtonIcons, DEFAULT_BUTTON_ICONS, getEffectiveIcon, getDarkModePreference, getMaxKandidatenSchwelle } from '../utils/customLists';
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
  // True once getMaxKandidatenSchwelle() has resolved (null is a valid value meaning "disabled")
  const [maxKandidatenSchwelleLoaded, setMaxKandidatenSchwelleLoaded] = useState(false);

  // Tracks the currentIndex at which the candidate threshold was first crossed mid-session
  // by a swipe (swipeResults non-empty). null = not yet crossed mid-session, or was already
  // met at initial load. When non-null, one extra card is shown before results appear.
  const [thresholdCrossedAtIndex, setThresholdCrossedAtIndex] = useState(null);

  // All members' swipe flags for the selected list (used for group status determination)
  // Map of userId → { recipeId → flag }
  const [allMembersFlags, setAllMembersFlags] = useState({});
  // True once getAllMembersSwipeFlags() has resolved for the current list
  const [allMembersFlagsLoaded, setAllMembersFlagsLoaded] = useState(false);

  // Configurable swipe badge icons loaded from settings
  const [swipeIcons, setSwipeIcons] = useState({
    swipeRight: DEFAULT_BUTTON_ICONS.swipeRight,
    swipeLeft: DEFAULT_BUTTON_ICONS.swipeLeft,
    swipeUp: DEFAULT_BUTTON_ICONS.swipeUp,
  });

  // Configurable filter button icon loaded from settings
  const [filterButtonIcon, setFilterButtonIcon] = useState(DEFAULT_BUTTON_ICONS.tagesmenuFilterButton);

  // Configurable "Zum Tagesmenü" button icon loaded from settings
  const [zumTagesMenuIcon, setZumTagesMenuIcon] = useState(DEFAULT_BUTTON_ICONS.tagesmenuZumTagesMenu);

  // Configurable "Meine Auswahl" button icon loaded from settings
  const [meineAuswahlIcon, setMeineAuswahlIcon] = useState(DEFAULT_BUTTON_ICONS.tagesmenuMeineAuswahl);

  // Full icons object and dark mode state for dark mode icon variants
  const [allButtonIcons, setAllButtonIcons] = useState({ ...DEFAULT_BUTTON_ICONS });
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  // When true, jump directly to the results view (used by the "Zum Tagesmenü" button)
  const [forceShowResults, setForceShowResults] = useState(false);

  // When true, show the dedicated "Meine Auswahl" view (own groups: Kandidat, Für später, Archiviert)
  const [showMeineAuswahl, setShowMeineAuswahl] = useState(false);

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
      setAllMembersFlagsLoaded(false);
      setFlagsLoaded(false);
      setThresholdCrossedAtIndex(null);
      setForceShowResults(false);
      setShowMeineAuswahl(false);
      // Reload the global threshold setting to ensure it is not lost during list switches
      getMaxKandidatenSchwelle()
        .then((val) => { setMaxKandidatenSchwelle(val); setMaxKandidatenSchwelleLoaded(true); })
        .catch(() => { setMaxKandidatenSchwelleLoaded(true); });
    }
  }, [selectedListId]);

  // Load status validity settings once on mount
  useEffect(() => {
    getStatusValiditySettings().then(setStatusValiditySettings).catch(() => {});
    getGroupStatusThresholds().then(setGroupThresholds).catch(() => {});
    getMaxKandidatenSchwelle()
      .then((val) => { setMaxKandidatenSchwelle(val); setMaxKandidatenSchwelleLoaded(true); })
      .catch(() => { setMaxKandidatenSchwelleLoaded(true); });
  }, []);

  // Load configurable swipe icons once on mount
  useEffect(() => {
    getButtonIcons().then((icons) => {
      setAllButtonIcons(icons);
    }).catch(() => {});
  }, []);

  // Re-compute individual icon states when icons or dark mode changes
  useEffect(() => {
    const eff = (key) => getEffectiveIcon(allButtonIcons, key, isDarkMode);
    setSwipeIcons({
      swipeRight: eff('swipeRight'),
      swipeLeft: eff('swipeLeft'),
      swipeUp: eff('swipeUp'),
    });
    setFilterButtonIcon(eff('tagesmenuFilterButton'));
    setZumTagesMenuIcon(eff('tagesmenuZumTagesMenu'));
    setMeineAuswahlIcon(eff('tagesmenuMeineAuswahl'));
  }, [allButtonIcons, isDarkMode]);

  // Listen for dark mode changes
  useEffect(() => {
    const handler = (e) => setIsDarkMode(e.detail.isDark);
    window.addEventListener('darkModeChange', handler);
    return () => window.removeEventListener('darkModeChange', handler);
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
      setAllMembersFlagsLoaded(true);
      return;
    }
    const memberIds = Array.isArray(selectedList.memberIds) ? selectedList.memberIds : [];
    const allMemberIds = selectedList.ownerId
      ? [...new Set([selectedList.ownerId, ...memberIds])]
      : memberIds;
    if (allMemberIds.length === 0) {
      setAllMembersFlags({});
      setAllMembersFlagsLoaded(true);
      return;
    }
    getAllMembersSwipeFlags(selectedListId, allMemberIds).then((flags) => {
      setAllMembersFlags(flags);
      setAllMembersFlagsLoaded(true);
    }).catch(() => { setAllMembersFlagsLoaded(true); });
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

  // Refs that mirror frequently-changing state so handleTransitionEnd (useCallback)
  // can always read the latest values without being re-created on every render.
  const allMembersFlagsRef = useRef(allMembersFlags);
  useEffect(() => { allMembersFlagsRef.current = allMembersFlags; }, [allMembersFlags]);
  const listMemberIdsRef = useRef([]);
  const groupThresholdsRef = useRef(groupThresholds);

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

            // After updating flags, check if all members have voted and group status is permanently 'archiv'.
            // Use refs to read the latest values without adding them to useCallback dependencies.
            const currentMemberIds = listMemberIdsRef.current;
            if (currentMemberIds.length > 1) {
              const updatedFlags = {
                ...allMembersFlagsRef.current,
                [currentUser.id]: {
                  ...(allMembersFlagsRef.current[currentUser.id] || {}),
                  [swipe.recipe.id]: flag,
                },
              };
              const allVoted = currentMemberIds.every(
                (uid) => updatedFlags[uid]?.[swipe.recipe.id] !== undefined
              );
              if (allVoted) {
                const groupStatus = computeGroupRecipeStatus(
                  currentMemberIds,
                  updatedFlags,
                  swipe.recipe.id,
                  groupThresholdsRef.current,
                  currentUser.id
                );
                if (groupStatus === 'archiv') {
                  clearExpiryForArchivedRecipe(swipe.list.id, swipe.recipe.id).catch((err) => {
                    console.error('Failed to clear expiry for permanently archived recipe:', err);
                  });
                }
              }
            }
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

  // Keep refs in sync with derived/state values for use in memoised callbacks
  useEffect(() => { listMemberIdsRef.current = listMemberIds; }, [listMemberIds]);
  useEffect(() => { groupThresholdsRef.current = groupThresholds; }, [groupThresholds]);

  // Precompute group status for each recipe in a single pass to avoid redundant calls in the render
  const groupStatusByRecipeId = useMemo(() => {
    if (listMemberIds.length <= 1) return {};

    const result = Object.fromEntries(
      allListRecipes.map((r) => {
        const status = computeGroupRecipeStatus(listMemberIds, allMembersFlags, r.id, groupThresholds, currentUser?.id);
        return [r.id, status];
      })
    );
    return result;
  }, [allListRecipes, listMemberIds, allMembersFlags, groupThresholds, currentUser?.id]);

  // Gemeinsame Kandidaten: all recipes with group status 'kandidat', sorted by voting count (desc),
  // limited to maxKandidatenSchwelle. Empty when threshold is disabled or list has only one member.
  const gemeinsameKandidaten = useMemo(() => {
    if (maxKandidatenSchwelle === null || listMemberIds.length <= 1) return [];
    const pool = allListRecipes.filter((r) => groupStatusByRecipeId[r.id] === 'kandidat');
    const sorted = [...pool].sort((a, b) => {
      const aVotes = listMemberIds.filter((uid) => allMembersFlags[uid]?.[a.id] === 'kandidat').length;
      const bVotes = listMemberIds.filter((uid) => allMembersFlags[uid]?.[b.id] === 'kandidat').length;
      return bVotes - aVotes;
    });
    return sorted.slice(0, maxKandidatenSchwelle);
  }, [allListRecipes, listMemberIds, allMembersFlags, groupStatusByRecipeId, maxKandidatenSchwelle]);

  // Recipes permanently archived by group consensus: group status is 'archiv' AND all members
  // have voted. Stored as a Set for O(1) lookup during render.
  const permanentlyArchivedRecipeIds = useMemo(() => {
    if (listMemberIds.length <= 1) return new Set();
    return new Set(
      allListRecipes
        .filter((r) => {
          if (groupStatusByRecipeId[r.id] !== 'archiv') return false;
          return listMemberIds.every((uid) => allMembersFlags[uid]?.[r.id] !== undefined);
        })
        .map((r) => r.id)
    );
  }, [allListRecipes, listMemberIds, allMembersFlags, groupStatusByRecipeId]);

  // Candidate score S = Σ 1/(1+nᵢ) where nᵢ = open votings for recipe i.
  // Used to end the swipe stack early when S reaches maxKandidatenSchwelle.
  // Only recipes that the current user has already swiped AND whose group status
  // is "kandidat" (consensus reached across members) are included in the sum.
  // Missing swipes from other members are treated optimistically as "kandidat",
  // but weighted down by factor 1/(1+nᵢ) to reflect the uncertainty.
  // Returns 0 when disabled (null threshold) or when there are no other members,
  // which safely leaves the allSwiped threshold check false.
  const candidateScore = useMemo(() => {
    console.log('candidateScore calculation triggered');
    console.log('  maxKandidatenSchwelle:', maxKandidatenSchwelle);
    console.log('  listMemberIds:', listMemberIds);
    console.log('  currentUser?.id:', currentUser?.id);

    if (maxKandidatenSchwelle === null || listMemberIds.length === 0) {
      console.log('  Returning 0 (threshold disabled or no members)');
      return 0;
    }

    const otherMemberIds = listMemberIds.filter((uid) => uid !== currentUser?.id);
    console.log('  otherMemberIds:', otherMemberIds);

    if (otherMemberIds.length === 0) {
      console.log('  Returning 0 (no other members)');
      return 0;
    }

    console.log('  allListRecipes.length:', allListRecipes.length);
    console.log('  allMembersFlags:', allMembersFlags);
    console.log('  groupStatusByRecipeId:', groupStatusByRecipeId);

    const swipedCandidateRecipes = allListRecipes.filter((recipe) => {
      const groupStatus = groupStatusByRecipeId[recipe.id];
      const isCandidate = groupStatus === 'kandidat';

      console.log(`    Recipe ${recipe.id}:`, {
        title: recipe.title,
        groupStatus,
        isCandidate
      });

      return isCandidate;
    });

    console.log('  swipedCandidateRecipes.length:', swipedCandidateRecipes.length);

    const score = swipedCandidateRecipes.reduce((sum, recipe) => {
      const swipedCount = otherMemberIds.filter(
        (uid) => allMembersFlags[uid]?.[recipe.id] !== undefined
      ).length;
      const ni = otherMemberIds.length - swipedCount;
      const contribution = 1 / (1 + ni);

      console.log(`    Recipe ${recipe.id} contribution:`, {
        swipedCount,
        ni,
        contribution,
        runningSum: sum + contribution
      });

      return sum + contribution;
    }, 0);

    console.log('  Final candidateScore:', score);
    return score;
  }, [allListRecipes, listMemberIds, allMembersFlags, maxKandidatenSchwelle, currentUser, groupStatusByRecipeId]);

  const thresholdMet = maxKandidatenSchwelle !== null && candidateScore >= maxKandidatenSchwelle;
  const hasSwiped = Object.keys(swipeResults).length > 0;

  // When the candidate threshold is first crossed mid-session by a swipe (swipeResults
  // non-empty), record the currentIndex so that the already-visible card at that index
  // can be swiped as the final card before results appear.
  useEffect(() => {
    if (!thresholdMet) {
      setThresholdCrossedAtIndex(null);
      return;
    }
    // Only record when crossed for the first time mid-session (not at initial load)
    if (thresholdCrossedAtIndex === null && hasSwiped) {
      setThresholdCrossedAtIndex(currentIndex);
    }
  }, [thresholdMet, hasSwiped, currentIndex, thresholdCrossedAtIndex]);

  const allSwiped =
    (forceShowResults && allListRecipes.length > 0) ||
    (allListRecipes.length > 0 &&
    (listRecipes.length === 0 ||
      currentIndex >= listRecipes.length ||
      // Threshold was already met at initial load (no swipes this session): end stack immediately
      (thresholdMet && !hasSwiped) ||
      // Threshold was crossed mid-session by a swipe and the extra last card has been swiped
      (thresholdCrossedAtIndex !== null && currentIndex > thresholdCrossedAtIndex)));

  console.log('allSwiped check:', {
    allListRecipesLength: allListRecipes.length,
    listRecipesLength: listRecipes.length,
    currentIndex,
    maxKandidatenSchwelle,
    candidateScore,
    thresholdMet,
    thresholdCrossedAtIndex,
    allSwiped
  });

  // When the threshold has been crossed mid-session, show only the single card at
  // currentIndex (no depth-effect cards behind it), so the deck appears empty and
  // the user knows this is the last swipeable card.
  const visibleRecipes =
    thresholdMet && hasSwiped
      ? listRecipes.slice(currentIndex, currentIndex + 1)
      : listRecipes.slice(currentIndex, currentIndex + STACK_VISIBLE);

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

  // All async data needed to determine whether to show the stack or the results view
  // must be fully loaded before rendering anything. This prevents the swipe stack from
  // briefly flashing when the threshold is already met at initial load time.
  const readyToRender = flagsLoaded && maxKandidatenSchwelleLoaded && allMembersFlagsLoaded;

  return (
    <div className={`tagesmenu-container${(allSwiped || showMeineAuswahl) ? ' tagesmenu-container--results' : ''}`}>
      {allListRecipes.length === 0 ? (
        <div className="tagesmenu-empty">
          <span className="tagesmenu-empty-icon"></span>
          <p>Diese Liste enthält noch keine Rezepte.</p>
        </div>
      ) : !readyToRender ? (
        null
      ) : showMeineAuswahl ? (
        <div className="tagesmenu-meine-auswahl">
          <div className="tagesmenu-results-page-header">
            <h2 className="tagesmenu-results-page-title">Meine Auswahl</h2>
          </div>
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
                    const authorName = getAuthorName(recipe.authorId);
                    const kulinarikTags = Array.isArray(recipe.kulinarik)
                      ? recipe.kulinarik
                      : recipe.kulinarik
                      ? [recipe.kulinarik]
                      : [];
                    return (
                      <button
                        key={recipe.id}
                        className="tagesmenu-results-tile"
                        onClick={() => onSelectRecipe(recipe)}
                      >
                        {flag === 'archiv' && permanentlyArchivedRecipeIds.has(recipe.id) && (
                          <div className="tagesmenu-permanent-archive-badge" title="Dauerhaft archiviert">Archiv</div>
                        )}
                        <div className="tagesmenu-results-tile-image">
                          {orderedImages.length > 0 ? (
                            <img src={orderedImages[0].url} alt={recipe.title} />
                          ) : (
                            <span></span>
                          )}
                        </div>
                        <p className="tagesmenu-results-tile-name">{recipe.title}</p>
                        {authorName && (
                          <p className="tagesmenu-results-tile-author">{authorName}</p>
                        )}
                        {kulinarikTags.length > 0 && (
                          <div className="tagesmenu-results-tile-kulinarik">
                            {kulinarikTags.slice(0, 2).map((k) => (
                              <span key={k} className="tagesmenu-results-tile-kulinarik-tag">{k}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : allSwiped ? (
        <div className="tagesmenu-results">
          <div className="tagesmenu-results-page-header">
            <h2 className="tagesmenu-results-page-title">Tagesmenü</h2>
          </div>
          {/* Group status section – only shown for lists with multiple members */}
          {listMemberIds.length > 1 && (() => {
            // Helper to render a recipe tile (reused across groups)
            const renderTile = (recipe) => {
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
              const kulinarikTags = Array.isArray(recipe.kulinarik)
                ? recipe.kulinarik
                : recipe.kulinarik
                ? [recipe.kulinarik]
                : [];
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
                      <span></span>
                    )}
                  </div>
                  <p className="tagesmenu-results-tile-name">{recipe.title}</p>
                  {authorName && (
                    <p className="tagesmenu-results-tile-author">{authorName}</p>
                  )}
                  {kulinarikTags.length > 0 && (
                    <div className="tagesmenu-results-tile-kulinarik">
                      {kulinarikTags.slice(0, 2).map((k) => (
                        <span key={k} className="tagesmenu-results-tile-kulinarik-tag">{k}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            };

            // "Gemeinsame Kandidaten" group: use pre-computed useMemo value
            if (gemeinsameKandidaten.length === 0) return null;
            const tilesColumnClass =
              gemeinsameKandidaten.length <= 2
                ? 'tagesmenu-results-tiles--1col'
                : gemeinsameKandidaten.length <= 6
                ? 'tagesmenu-results-tiles--2col'
                : 'tagesmenu-results-tiles--3col';
            return (
              <>
                {gemeinsameKandidaten.length > 0 && (
                  <div className="tagesmenu-results-group tagesmenu-results-group--gemeinsame-kandidaten">
                    <div className={`tagesmenu-results-tiles ${tilesColumnClass}`}>
                      {gemeinsameKandidaten.map(renderTile)}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          {/* Meine Auswahl groups – shown in results only for single-member lists.
              For multi-member lists, these are accessible via the dedicated Meine Auswahl view. */}
          {currentUser?.tagesmenuTestmode !== false && listMemberIds.length <= 1 && [
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
                    const authorName = getAuthorName(recipe.authorId);
                    const kulinarikTags = Array.isArray(recipe.kulinarik)
                      ? recipe.kulinarik
                      : recipe.kulinarik
                      ? [recipe.kulinarik]
                      : [];
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
                            <span></span>
                          )}
                        </div>
                        <p className="tagesmenu-results-tile-name">{recipe.title}</p>
                        {authorName && (
                          <p className="tagesmenu-results-tile-author">{authorName}</p>
                        )}
                        {kulinarikTags.length > 0 && (
                          <div className="tagesmenu-results-tile-kulinarik">
                            {kulinarikTags.slice(0, 2).map((k) => (
                              <span key={k} className="tagesmenu-results-tile-kulinarik-tag">{k}</span>
                            ))}
                          </div>
                        )}
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
                    <span></span>
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
          {isBase64Image(filterButtonIcon) ? (
            <img src={filterButtonIcon} alt="Listen filtern" className="button-icon-image" />
          ) : (
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{filterButtonIcon}</span>
          )}
        </button>
      )}

      {/* "Meine Auswahl" FAB button – bottom center, only shown in test mode */}
      {readyToRender && currentUser?.tagesmenuTestmode !== false && (
        <button
          className="tagesmenu-meine-auswahl-btn"
          onClick={() => setShowMeineAuswahl((v) => !v)}
          aria-label="Meine Auswahl"
          title="Meine Auswahl"
        >
          {isBase64Image(meineAuswahlIcon) ? (
            <img src={meineAuswahlIcon} alt="Meine Auswahl" className="button-icon-image" />
          ) : (
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{meineAuswahlIcon}</span>
          )}
        </button>
      )}

      {/* "Zum Tagesmenü" FAB button – bottom right, only shown during the swipe stack when gemeinsame Kandidaten exist */}
      {!allSwiped && readyToRender && gemeinsameKandidaten.length > 0 && (
        <button
          className="tagesmenu-zum-tagesMenu-btn"
          onClick={() => setForceShowResults(true)}
          aria-label="Zum Tagesmenü"
          title="Zum Tagesmenü"
        >
          {isBase64Image(zumTagesMenuIcon) ? (
            <img src={zumTagesMenuIcon} alt="Zum Tagesmenü" className="button-icon-image" />
          ) : (
            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{zumTagesMenuIcon}</span>
          )}
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
