/**
 * Resolves which group/private list a newly created recipe should be
 * attached to, and whether it should be auto-published to the public list,
 * given the context "Rezept hinzufügen" was invoked in (an explicit private
 * list dropdown selection vs. an active group vs. a plain public add).
 *
 * Shared between the normal save path (App.js handleSaveRecipe) and
 * background-import call sites, so both apply identical group/publish rules.
 */
export function resolveRecipeGroupContext({
  selectedGroupId,
  activeGroupId = null,
  groups = [],
  publicGroupId,
  isCreatingVersion = false,
} = {}) {
  const resolvedPublicGroupId = publicGroupId || groups.find(g => g.type === 'public')?.id;
  let groupId;
  let autoPublish;

  if (selectedGroupId) {
    // User explicitly chose a private list from the form dropdown
    groupId = selectedGroupId;
    autoPublish = false;
  } else {
    groupId = activeGroupId
      ? (typeof activeGroupId === 'string' ? activeGroupId : activeGroupId.id ?? String(activeGroupId))
      : resolvedPublicGroupId;
    autoPublish = !activeGroupId && !isCreatingVersion;
  }

  const activeGroup = groups.find(g => g.id === groupId);
  const groupType = activeGroup?.type ?? 'public';

  return { groupId: groupId || null, groupType, autoPublish };
}

/**
 * Same resolution as resolveRecipeGroupContext(), but returns only the
 * fields that should be merged onto a recipe object before saving it
 * (empty object when no group applies).
 */
export function resolveImportGroupContext(params) {
  const { groupId, groupType, autoPublish } = resolveRecipeGroupContext(params);
  return groupId
    ? { groupId, groupType, ...(autoPublish ? { publishedToPublic: true } : {}) }
    : {};
}
