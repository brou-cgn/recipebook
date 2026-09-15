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

// YouTube's 4 auto-generated scene thumbnails (0.jpg-3.jpg) - different
// moments in the video, but only 120x90 (vs. hqdefault's 480x360), so they
// look softer once zoomed in TutorialForm's crop editor.
export function getYouTubeFrameUrls(videoId) {
  if (!videoId) return [];
  return [0, 1, 2, 3].map((n) => `https://img.youtube.com/vi/${videoId}/${n}.jpg`);
}
