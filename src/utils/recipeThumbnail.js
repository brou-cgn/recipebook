const isRemoteUrl = (url) => url?.startsWith('https://') || url?.startsWith('http://');

/**
 * Small preview image of a recipe, chosen like the recipe card does: the default
 * image (else the first one, else the legacy `image` field), replaced by the
 * stored thumbnail when both are remote URLs. Empty string when there is none.
 * @param {Object} recipe
 * @returns {string}
 */
export function getRecipeThumbnail(recipe) {
  const images = Array.isArray(recipe?.images) && recipe.images.length > 0
    ? recipe.images
    : recipe?.image
      ? [{ url: recipe.image, isDefault: true }]
      : [];
  const main = images.find((img) => img.isDefault) || images[0];
  if (!main?.url) return '';
  return recipe.imageThumbnail && isRemoteUrl(recipe.imageThumbnail) && isRemoteUrl(main.url)
    ? recipe.imageThumbnail
    : main.url;
}
