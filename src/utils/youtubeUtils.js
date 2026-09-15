/**
 * YouTube URL helpers for tutorial video previews/inline playback.
 * Only YouTube is supported for now - other platforms (Instagram, TikTok, …)
 * fall back to the existing "open external link" behavior in TutorialCard.
 */

const YOUTUBE_ID_PATTERN = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(YOUTUBE_ID_PATTERN);
  return match ? match[1] : null;
}

export function getYouTubeThumbnailUrl(videoId) {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
