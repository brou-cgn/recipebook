/**
 * Guest-list sync between an Event and every Menu linked to it
 * (menu.eventId/menu.eventOwnerId), used by both EventForm and MenuForm so
 * the two sides never have to duplicate this logic (and can't drift apart).
 *
 * The rule is simple: whichever side a guest is added to or removed from,
 * the resulting full guest list is pushed onto the other side. See
 * resolveGuestLinkChoice for the one case that isn't a plain push - linking
 * a menu to an existing event where both already have guests of their own.
 */
import { getEvent, calculateEventDrinks } from './eventsFirestore';
import { getMenusByEventId, updateMenu } from './menuFirestore';
import { getGuestDisplayName, computeGuestPreferenceMultipliers } from './guestPreferences';
import { mergePredefinedDrinks } from './drinkCategories';

const sameIds = (a, b) => {
  const listA = Array.isArray(a) ? a : [];
  const listB = Array.isArray(b) ? b : [];
  return listA.length === listB.length && listA.every((id) => listB.includes(id));
};

/**
 * Sets `descriptionGuestIds` to `guestIds` on every menu linked to this event.
 * @param {string} eventOwnerId
 * @param {string} eventId
 * @param {string[]} guestIds
 */
export const pushGuestIdsToLinkedMenus = async (eventOwnerId, eventId, guestIds) => {
  if (!eventOwnerId || !eventId) return;
  try {
    const linkedMenus = await getMenusByEventId(eventOwnerId, eventId);
    await Promise.all(
      linkedMenus
        .filter((menu) => !sameIds(menu.descriptionGuestIds, guestIds))
        .map((menu) => updateMenu(menu.id, { descriptionGuestIds: guestIds }))
    );
  } catch (err) {
    console.error('[guestLinkSync] Error pushing guests to linked menus:', err);
  }
};

/**
 * Sets `selectedGuestIds` to `guestIds` on the linked event, recomputing the
 * drink-calculation inputs that depend on the guest list (names, driver
 * status, preference multipliers).
 * @param {Object} params
 * @param {string} params.ownerId - Owner of the linked event
 * @param {string} params.eventId
 * @param {string[]} params.guestIds
 * @param {Array} params.guests - This owner's guest profiles (for name/preference lookup)
 * @param {Array} [params.customDrinks] - This owner's custom drinks (for preference weighting)
 * @param {Object} [params.eventDoc] - Already-loaded event doc, to skip a fetch when the caller has a live copy
 */
export const pushGuestIdsToLinkedEvent = async ({ ownerId, eventId, guestIds, guests, customDrinks, eventDoc }) => {
  if (!ownerId || !eventId) return;
  try {
    const event = eventDoc || (await getEvent(ownerId, eventId));
    if (!event) return;
    const { id: _eventDocId, ...eventFields } = event;
    const allGuests = Array.isArray(guests) ? guests : [];
    const selectedGuestObjs = allGuests.filter((guest) => guestIds.includes(guest.id));
    const driverGuestIds = (event.driverGuestIds || []).filter((id) => guestIds.includes(id));
    const guestNamesById = selectedGuestObjs.reduce((acc, guest) => {
      acc[guest.id] = getGuestDisplayName(guest) || 'Unbenannter Gast';
      return acc;
    }, {});
    const allDrinks = mergePredefinedDrinks(customDrinks || [], ownerId);
    const guestPreferenceMultipliers = computeGuestPreferenceMultipliers(selectedGuestObjs, allDrinks, driverGuestIds);
    await calculateEventDrinks({
      ...eventFields,
      selectedGuestIds: guestIds,
      driverGuestIds,
      guestNamesById,
      guestPreferenceMultipliers,
    }, eventId, ownerId);
  } catch (err) {
    console.error('[guestLinkSync] Error pushing guests to linked event:', err);
  }
};

/**
 * Resolves which guest list each side ends up with when linking a menu to an
 * existing event, per the user's choice (asked only when both sides already
 * have guests of their own - see GuestLinkConflictDialog).
 * @param {'event'|'menu'|'all'} choice
 * @param {string[]} eventGuestIds
 * @param {string[]} menuGuestIds
 * @returns {{eventGuestIds: string[], menuGuestIds: string[]}}
 */
export const resolveGuestLinkChoice = (choice, eventGuestIds, menuGuestIds) => {
  const eventIds = Array.isArray(eventGuestIds) ? eventGuestIds : [];
  const menuIds = Array.isArray(menuGuestIds) ? menuGuestIds : [];
  if (choice === 'event') {
    return { eventGuestIds: eventIds, menuGuestIds: eventIds };
  }
  if (choice === 'menu') {
    return { eventGuestIds: menuIds, menuGuestIds: menuIds };
  }
  const union = [...eventIds, ...menuIds.filter((id) => !eventIds.includes(id))];
  return { eventGuestIds: union, menuGuestIds: union };
};
